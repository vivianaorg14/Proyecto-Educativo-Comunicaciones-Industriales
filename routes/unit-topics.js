const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const router = express.Router({ mergeParams: true });
const supabaseAdmin = require('../config/supabaseAdmin');
const requireAdmin = require('../middleware/requireAdmin');

const PDF_BUCKET = 'unit-pdfs';
const IMAGE_BUCKET = 'unit-images';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hora, solo para previsualizar en el panel de admin

const TEXT_BLOCK_TYPES = new Set([
  'heading', 'subheading', 'paragraph', 'bullet_list', 'numbered_list', 'callout',
]);

const ALLOWED_FILE_MIMETYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB por archivo
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'blockFiles' && !ALLOWED_FILE_MIMETYPES.has(file.mimetype)) {
      return cb(new Error(`El archivo "${file.originalname}" tiene un tipo no permitido`));
    }
    if (file.fieldname === 'blockImages' && !file.mimetype.startsWith('image/')) {
      return cb(new Error('Las imágenes deben tener un tipo image/*'));
    }
    cb(null, true);
  },
});

const uploadFields = upload.fields([
  { name: 'blockImages', maxCount: 20 },
  { name: 'blockFiles', maxCount: 20 },
]);

// Todas las rutas de este archivo requieren rol de administrador
router.use(requireAdmin);

// ---------- Helpers ----------

function parseBlocks(raw) {
  if (!raw) return [];
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new Error('El campo "blocks" debe ser un JSON válido');
  }
  if (!Array.isArray(list)) {
    throw new Error('El campo "blocks" debe ser un arreglo');
  }
  return list;
}

async function uploadOne(bucket, topicId, file) {
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${topicId}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

  if (error) {
    throw new Error(`No se pudo subir "${file.originalname}": ${error.message}`);
  }

  return { storage_path: storagePath, size_bytes: file.size, original_title: file.originalname };
}

async function deleteObjects(bucket, storagePaths) {
  if (!storagePaths.length) return;
  await supabaseAdmin.storage.from(bucket).remove(storagePaths);
}

// Convierte las especificaciones de bloque que manda el cliente en filas
// listas para insertar, subiendo los archivos nuevos y reutilizando los
// existentes (por existingId) sin volver a tocar Storage.
async function resolveBlockRows(topicId, specs, files, existingBlocks) {
  const existingById = new Map(existingBlocks.map((b) => [b.id, b]));
  const rows = [];

  for (const spec of specs) {
    if (!spec || !spec.type) {
      throw new Error('Cada bloque necesita un "type"');
    }

    if (TEXT_BLOCK_TYPES.has(spec.type)) {
      if (!spec.text || !spec.text.trim()) continue;
      rows.push({ type: spec.type, content: { text: spec.text.trim() } });
      continue;
    }

    if (spec.type === 'divider') {
      rows.push({ type: 'divider', content: {} });
      continue;
    }

    if (spec.type === 'image') {
      if (spec.existingId) {
        const existing = existingById.get(spec.existingId);
        if (!existing) throw new Error('Imagen existente no encontrada');
        rows.push({
          type: 'image',
          content: { storage_path: existing.content.storage_path, caption: spec.caption ?? existing.content.caption ?? '' },
        });
      } else if (spec.fileIndex !== undefined && files?.blockImages?.[spec.fileIndex]) {
        const uploaded = await uploadOne(IMAGE_BUCKET, topicId, files.blockImages[spec.fileIndex]);
        rows.push({ type: 'image', content: { storage_path: uploaded.storage_path, caption: spec.caption || '' } });
      }
      continue;
    }

    if (spec.type === 'file') {
      if (spec.existingId) {
        const existing = existingById.get(spec.existingId);
        if (!existing) throw new Error('Archivo existente no encontrado');
        rows.push({
          type: 'file',
          content: {
            storage_path: existing.content.storage_path,
            title: spec.title ?? existing.content.title,
            size_bytes: existing.content.size_bytes ?? null,
          },
        });
      } else if (spec.fileIndex !== undefined && files?.blockFiles?.[spec.fileIndex]) {
        const uploaded = await uploadOne(PDF_BUCKET, topicId, files.blockFiles[spec.fileIndex]);
        rows.push({
          type: 'file',
          content: { storage_path: uploaded.storage_path, title: spec.title || uploaded.original_title, size_bytes: uploaded.size_bytes },
        });
      }
      continue;
    }

    if (spec.type === 'video') {
      if (!spec.url) continue;
      rows.push({ type: 'video', content: { url: spec.url, title: spec.title || '' } });
      continue;
    }

    throw new Error(`Tipo de bloque desconocido: ${spec.type}`);
  }

  return rows;
}

async function insertBlocks(topicId, rows) {
  if (!rows.length) return;
  const { error } = await supabaseAdmin.from('topic_blocks').insert(
    rows.map((row, index) => ({ topic_id: topicId, type: row.type, content: row.content, position: index }))
  );
  if (error) {
    throw new Error(error.message);
  }
}

async function attachSignedUrl(bucket, storagePath) {
  const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl || null;
}

async function serializeBlock(block) {
  const c = block.content || {};
  const base = { id: block.id, type: block.type };

  switch (block.type) {
    case 'image':
      return { ...base, caption: c.caption || '', url: await attachSignedUrl(IMAGE_BUCKET, c.storage_path) };
    case 'file':
      return { ...base, title: c.title || '', size_bytes: c.size_bytes ?? null, url: await attachSignedUrl(PDF_BUCKET, c.storage_path) };
    case 'video':
      return { ...base, title: c.title || '', url: c.url };
    case 'divider':
      return base;
    default: // heading, subheading, paragraph, bullet_list, numbered_list, callout
      return { ...base, text: c.text || '' };
  }
}

async function getTopicWithBlocks(topicId) {
  const { data: topic, error: topicError } = await supabaseAdmin
    .from('unit_topics')
    .select('*')
    .eq('id', topicId)
    .single();

  if (topicError || !topic) return null;

  const { data: blocks, error: blocksError } = await supabaseAdmin
    .from('topic_blocks')
    .select('*')
    .eq('topic_id', topicId)
    .order('position');

  if (blocksError) return { ...topic, blocks: [] };

  const serialized = await Promise.all((blocks || []).map(serializeBlock));
  return { ...topic, blocks: serialized };
}

// ---------- Rutas ----------
// Montadas en /api/admin/units/:unitId/topics

// Listar los temas de una unidad
router.get('/', async (req, res) => {
  const { data: topics, error } = await supabaseAdmin
    .from('unit_topics')
    .select('*')
    .eq('unit_id', req.params.unitId)
    .order('created_at');

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const fullTopics = await Promise.all(topics.map((t) => getTopicWithBlocks(t.id)));
  res.json({ topics: fullTopics });
});

// Obtener un tema
router.get('/:topicId', async (req, res) => {
  const topic = await getTopicWithBlocks(req.params.topicId);
  if (!topic || topic.unit_id !== req.params.unitId) {
    return res.status(404).json({ error: 'Tema no encontrado' });
  }
  res.json({ topic });
});

// Crear tema (título + bloques de contenido en orden)
router.post('/', uploadFields, async (req, res) => {
  const { unitId } = req.params;
  const { title } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'El título es obligatorio' });
  }

  let blockSpecs;
  try {
    blockSpecs = parseBlocks(req.body.blocks);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const { data: topic, error: topicError } = await supabaseAdmin
    .from('unit_topics')
    .insert({ unit_id: unitId, title })
    .select()
    .single();

  if (topicError) {
    return res.status(400).json({ error: topicError.message });
  }

  try {
    const rows = await resolveBlockRows(topic.id, blockSpecs, req.files, []);
    await insertBlocks(topic.id, rows);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const fullTopic = await getTopicWithBlocks(topic.id);
  res.status(201).json({ message: 'Tema creado', topic: fullTopic });
});

// Editar tema (reemplaza el título y la lista completa de bloques; los
// bloques de imagen/archivo existentes se referencian por "existingId" para
// no volver a subirlos, y los que ya no se referencian se borran de Storage)
router.put('/:topicId', uploadFields, async (req, res) => {
  const { topicId } = req.params;
  const { title } = req.body;

  let blockSpecs;
  try {
    blockSpecs = parseBlocks(req.body.blocks);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const { data: existingBlocks, error: fetchError } = await supabaseAdmin
    .from('topic_blocks')
    .select('*')
    .eq('topic_id', topicId);

  if (fetchError) {
    return res.status(400).json({ error: fetchError.message });
  }

  let rows;
  try {
    rows = await resolveBlockRows(topicId, blockSpecs, req.files, existingBlocks || []);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const keptExistingIds = new Set(blockSpecs.filter((s) => s?.existingId).map((s) => s.existingId));
  const removedBlocks = (existingBlocks || []).filter(
    (b) => (b.type === 'image' || b.type === 'file') && !keptExistingIds.has(b.id)
  );

  await Promise.all([
    deleteObjects(IMAGE_BUCKET, removedBlocks.filter((b) => b.type === 'image').map((b) => b.content.storage_path)),
    deleteObjects(PDF_BUCKET, removedBlocks.filter((b) => b.type === 'file').map((b) => b.content.storage_path)),
  ]);

  const { error: deleteBlocksError } = await supabaseAdmin.from('topic_blocks').delete().eq('topic_id', topicId);
  if (deleteBlocksError) {
    return res.status(400).json({ error: deleteBlocksError.message });
  }

  try {
    await insertBlocks(topicId, rows);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (title !== undefined) {
    const { error: updateError } = await supabaseAdmin.from('unit_topics').update({ title }).eq('id', topicId);
    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }
  }

  const topic = await getTopicWithBlocks(topicId);
  if (!topic) {
    return res.status(404).json({ error: 'Tema no encontrado' });
  }
  res.json({ message: 'Tema actualizado', topic });
});

// Borrar tema completo (y los archivos de sus bloques de imagen/archivo en Storage)
router.delete('/:topicId', async (req, res) => {
  const { topicId } = req.params;

  const { data: blocks, error } = await supabaseAdmin
    .from('topic_blocks')
    .select('type, content')
    .eq('topic_id', topicId);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  await Promise.all([
    deleteObjects(IMAGE_BUCKET, (blocks || []).filter((b) => b.type === 'image').map((b) => b.content.storage_path)),
    deleteObjects(PDF_BUCKET, (blocks || []).filter((b) => b.type === 'file').map((b) => b.content.storage_path)),
  ]);

  const { error: deleteError } = await supabaseAdmin.from('unit_topics').delete().eq('id', topicId);

  if (deleteError) {
    return res.status(400).json({ error: deleteError.message });
  }

  res.json({ message: 'Tema eliminado' });
});

module.exports = router;
