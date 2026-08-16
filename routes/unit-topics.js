const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const router = express.Router({ mergeParams: true });
const supabaseAdmin = require('../config/supabaseAdmin');
const requireAdmin = require('../middleware/requireAdmin');

const PDF_BUCKET = 'unit-pdfs';
const IMAGE_BUCKET = 'unit-images';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hora, solo para previsualizar en el panel de admin

// "pdfs" ahora es un campo genérico de archivos adjuntos (documentos,
// hojas de cálculo, comprimidos...), no solo PDF.
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
    if (file.fieldname === 'pdfs' && !ALLOWED_FILE_MIMETYPES.has(file.mimetype)) {
      return cb(new Error(`El archivo "${file.originalname}" tiene un tipo no permitido`));
    }
    if (file.fieldname === 'images' && !file.mimetype.startsWith('image/')) {
      return cb(new Error('El campo "images" solo acepta imágenes'));
    }
    cb(null, true);
  },
});

const uploadFields = upload.fields([
  { name: 'pdfs', maxCount: 10 },
  { name: 'images', maxCount: 10 },
]);

// Todas las rutas de este archivo requieren rol de administrador
router.use(requireAdmin);

// ---------- Helpers ----------

function parseVideos(rawVideos) {
  if (!rawVideos) return [];

  let list = rawVideos;
  if (typeof rawVideos === 'string') {
    try {
      list = JSON.parse(rawVideos);
    } catch {
      throw new Error('El campo "videos" debe ser un JSON válido');
    }
  }

  if (!Array.isArray(list)) {
    throw new Error('El campo "videos" debe ser un arreglo');
  }

  return list.map((v, index) => {
    if (!v || !v.url) {
      throw new Error(`El video en la posición ${index} necesita una URL`);
    }
    return { title: v.title || '', url: v.url, position: index };
  });
}

async function uploadFilesToStorage(bucket, topicId, files) {
  const rows = [];
  for (const file of files) {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${topicId}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`No se pudo subir "${file.originalname}": ${uploadError.message}`);
    }

    rows.push({ title: file.originalname, storage_path: storagePath, size_bytes: file.size });
  }
  return rows;
}

async function deleteObjects(bucket, storagePaths) {
  if (!storagePaths.length) return;
  await supabaseAdmin.storage.from(bucket).remove(storagePaths);
}

async function attachSignedUrls(bucket, rows) {
  return Promise.all(
    (rows || []).map(async (row) => {
      const { data: signed } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
      return { ...row, url: signed?.signedUrl || null };
    })
  );
}

async function insertFileRows(table, topicId, rows, startPosition = 0) {
  if (!rows.length) return;
  const prepared = rows.map((row, index) => {
    const { size_bytes, ...rest } = row;
    return {
      ...rest,
      ...(table === 'unit_pdfs' ? { size_bytes: size_bytes ?? null } : {}),
      topic_id: topicId,
      position: startPosition + index,
    };
  });

  const { error } = await supabaseAdmin.from(table).insert(prepared);
  if (error) {
    throw new Error(error.message);
  }
}

async function getTopicWithRelations(topicId) {
  const { data: topic, error: topicError } = await supabaseAdmin
    .from('unit_topics')
    .select('*')
    .eq('id', topicId)
    .single();

  if (topicError || !topic) return null;

  const [{ data: videos }, { data: pdfs }, { data: images }] = await Promise.all([
    supabaseAdmin.from('unit_videos').select('*').eq('topic_id', topicId).order('position'),
    supabaseAdmin.from('unit_pdfs').select('*').eq('topic_id', topicId).order('position'),
    supabaseAdmin.from('unit_images').select('*').eq('topic_id', topicId).order('position'),
  ]);

  const [pdfsWithUrls, imagesWithUrls] = await Promise.all([
    attachSignedUrls(PDF_BUCKET, pdfs),
    attachSignedUrls(IMAGE_BUCKET, images),
  ]);

  return { ...topic, videos: videos || [], pdfs: pdfsWithUrls, images: imagesWithUrls };
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

  const fullTopics = await Promise.all(topics.map((t) => getTopicWithRelations(t.id)));
  res.json({ topics: fullTopics });
});

// Obtener un tema
router.get('/:topicId', async (req, res) => {
  const topic = await getTopicWithRelations(req.params.topicId);
  if (!topic || topic.unit_id !== req.params.unitId) {
    return res.status(404).json({ error: 'Tema no encontrado' });
  }
  res.json({ topic });
});

// Crear tema (título, descripción, videos por enlace, PDFs e imágenes subidos)
router.post('/', uploadFields, async (req, res) => {
  const { unitId } = req.params;
  const { title, description, durationMinutes } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'El título es obligatorio' });
  }

  let videos;
  try {
    videos = parseVideos(req.body.videos);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const { data: topic, error: topicError } = await supabaseAdmin
    .from('unit_topics')
    .insert({
      unit_id: unitId,
      title,
      description: description || '',
      duration_minutes: durationMinutes ? Number(durationMinutes) : null,
    })
    .select()
    .single();

  if (topicError) {
    return res.status(400).json({ error: topicError.message });
  }

  if (videos.length) {
    const { error: videosError } = await supabaseAdmin
      .from('unit_videos')
      .insert(videos.map((v) => ({ ...v, topic_id: topic.id })));

    if (videosError) {
      return res.status(400).json({ error: videosError.message });
    }
  }

  try {
    if (req.files?.pdfs?.length) {
      const pdfRows = await uploadFilesToStorage(PDF_BUCKET, topic.id, req.files.pdfs);
      await insertFileRows('unit_pdfs', topic.id, pdfRows);
    }
    if (req.files?.images?.length) {
      const imageRows = await uploadFilesToStorage(IMAGE_BUCKET, topic.id, req.files.images);
      await insertFileRows('unit_images', topic.id, imageRows);
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const fullTopic = await getTopicWithRelations(topic.id);
  res.status(201).json({ message: 'Tema creado', topic: fullTopic });
});

// Editar tema (título/descripción, reemplaza la lista de videos si se envía,
// agrega los PDFs/imágenes nuevos si se envían; borrar uno existente se hace
// con los endpoints DELETE /:topicId/pdfs/:pdfId y /:topicId/images/:imageId)
router.put('/:topicId', uploadFields, async (req, res) => {
  const { topicId } = req.params;
  const { title, description, durationMinutes } = req.body;

  const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (durationMinutes !== undefined) {
    updates.duration_minutes = durationMinutes === '' ? null : Number(durationMinutes);
  }

  if (Object.keys(updates).length) {
    const { error: updateError } = await supabaseAdmin
      .from('unit_topics')
      .update(updates)
      .eq('id', topicId);

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }
  }

  if (req.body.videos !== undefined) {
    let videos;
    try {
      videos = parseVideos(req.body.videos);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const { error: deleteVideosError } = await supabaseAdmin
      .from('unit_videos')
      .delete()
      .eq('topic_id', topicId);

    if (deleteVideosError) {
      return res.status(400).json({ error: deleteVideosError.message });
    }

    if (videos.length) {
      const { error: insertVideosError } = await supabaseAdmin
        .from('unit_videos')
        .insert(videos.map((v) => ({ ...v, topic_id: topicId })));

      if (insertVideosError) {
        return res.status(400).json({ error: insertVideosError.message });
      }
    }
  }

  try {
    if (req.files?.pdfs?.length) {
      const { count } = await supabaseAdmin
        .from('unit_pdfs')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicId);
      const pdfRows = await uploadFilesToStorage(PDF_BUCKET, topicId, req.files.pdfs);
      await insertFileRows('unit_pdfs', topicId, pdfRows, count || 0);
    }
    if (req.files?.images?.length) {
      const { count } = await supabaseAdmin
        .from('unit_images')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicId);
      const imageRows = await uploadFilesToStorage(IMAGE_BUCKET, topicId, req.files.images);
      await insertFileRows('unit_images', topicId, imageRows, count || 0);
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const topic = await getTopicWithRelations(topicId);
  if (!topic) {
    return res.status(404).json({ error: 'Tema no encontrado' });
  }
  res.json({ message: 'Tema actualizado', topic });
});

// Renombrar (poner leyenda a) un archivo adjunto
router.patch('/:topicId/pdfs/:pdfId', async (req, res) => {
  const { topicId, pdfId } = req.params;
  const { title } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'El título no puede estar vacío' });
  }

  const { data: pdf, error } = await supabaseAdmin
    .from('unit_pdfs')
    .update({ title: title.trim() })
    .eq('id', pdfId)
    .eq('topic_id', topicId)
    .select()
    .single();

  if (error || !pdf) {
    return res.status(404).json({ error: error?.message || 'Archivo no encontrado' });
  }

  res.json({ message: 'Archivo actualizado', pdf });
});

// Renombrar (poner leyenda a) una imagen
router.patch('/:topicId/images/:imageId', async (req, res) => {
  const { topicId, imageId } = req.params;
  const { title } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'El título no puede estar vacío' });
  }

  const { data: image, error } = await supabaseAdmin
    .from('unit_images')
    .update({ title: title.trim() })
    .eq('id', imageId)
    .eq('topic_id', topicId)
    .select()
    .single();

  if (error || !image) {
    return res.status(404).json({ error: error?.message || 'Imagen no encontrada' });
  }

  res.json({ message: 'Imagen actualizada', image });
});

// Borrar un PDF individual de un tema
router.delete('/:topicId/pdfs/:pdfId', async (req, res) => {
  const { topicId, pdfId } = req.params;

  const { data: pdf, error: fetchError } = await supabaseAdmin
    .from('unit_pdfs')
    .select('storage_path')
    .eq('id', pdfId)
    .eq('topic_id', topicId)
    .single();

  if (fetchError || !pdf) {
    return res.status(404).json({ error: 'PDF no encontrado' });
  }

  await deleteObjects(PDF_BUCKET, [pdf.storage_path]);

  const { error: deleteError } = await supabaseAdmin.from('unit_pdfs').delete().eq('id', pdfId);

  if (deleteError) {
    return res.status(400).json({ error: deleteError.message });
  }

  res.json({ message: 'PDF eliminado' });
});

// Borrar una imagen individual de un tema
router.delete('/:topicId/images/:imageId', async (req, res) => {
  const { topicId, imageId } = req.params;

  const { data: image, error: fetchError } = await supabaseAdmin
    .from('unit_images')
    .select('storage_path')
    .eq('id', imageId)
    .eq('topic_id', topicId)
    .single();

  if (fetchError || !image) {
    return res.status(404).json({ error: 'Imagen no encontrada' });
  }

  await deleteObjects(IMAGE_BUCKET, [image.storage_path]);

  const { error: deleteError } = await supabaseAdmin.from('unit_images').delete().eq('id', imageId);

  if (deleteError) {
    return res.status(400).json({ error: deleteError.message });
  }

  res.json({ message: 'Imagen eliminada' });
});

// Borrar tema completo (y sus archivos en Storage)
router.delete('/:topicId', async (req, res) => {
  const { topicId } = req.params;

  const [{ data: pdfs, error: pdfsError }, { data: images, error: imagesError }] = await Promise.all([
    supabaseAdmin.from('unit_pdfs').select('storage_path').eq('topic_id', topicId),
    supabaseAdmin.from('unit_images').select('storage_path').eq('topic_id', topicId),
  ]);

  if (pdfsError) {
    return res.status(400).json({ error: pdfsError.message });
  }
  if (imagesError) {
    return res.status(400).json({ error: imagesError.message });
  }

  await Promise.all([
    deleteObjects(PDF_BUCKET, (pdfs || []).map((p) => p.storage_path)),
    deleteObjects(IMAGE_BUCKET, (images || []).map((i) => i.storage_path)),
  ]);

  const { error: deleteError } = await supabaseAdmin.from('unit_topics').delete().eq('id', topicId);

  if (deleteError) {
    return res.status(400).json({ error: deleteError.message });
  }

  res.json({ message: 'Tema eliminado' });
});

module.exports = router;
