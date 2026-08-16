const express = require('express');
const router = express.Router();
const supabaseAdmin = require('../config/supabaseAdmin');
const requireAuth = require('../middleware/requireAuth');

const PDF_BUCKET = 'unit-pdfs';
const IMAGE_BUCKET = 'unit-images';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hora

// Cualquier usuario con sesión válida (estudiante o admin) puede leer el contenido.
router.use(requireAuth);

async function attachSignedUrl(bucket, storagePath) {
  const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl || null;
}

function extOf(storagePath) {
  return (storagePath.split('.').pop() || '').toLowerCase();
}

async function serializeBlock(block) {
  const c = block.content || {};
  const base = { id: block.id, type: block.type };

  switch (block.type) {
    case 'image':
      return { ...base, caption: c.caption || '', url: await attachSignedUrl(IMAGE_BUCKET, c.storage_path) };
    case 'file':
      return {
        ...base,
        title: c.title || '',
        size_bytes: c.size_bytes ?? null,
        ext: extOf(c.storage_path),
        url: await attachSignedUrl(PDF_BUCKET, c.storage_path),
      };
    case 'video':
      return { ...base, title: c.title || '', url: c.url };
    case 'divider':
      return base;
    default: // heading, subheading, paragraph, bullet_list, numbered_list, callout
      return { ...base, text: c.text || '' };
  }
}

// Listar unidades (vista de estudiante)
router.get('/units', async (req, res) => {
  const { data: units, error } = await supabaseAdmin
    .from('units')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const withCounts = await Promise.all(
    units.map(async (unit) => {
      const { count } = await supabaseAdmin
        .from('unit_topics')
        .select('*', { count: 'exact', head: true })
        .eq('unit_id', unit.id);

      return {
        id: unit.id,
        title: unit.title,
        description: unit.description,
        topics_count: count || 0,
      };
    })
  );

  res.json({ units: withCounts });
});

// Detalle de una unidad: sus temas, con los bloques de contenido en orden
router.get('/units/:id', async (req, res) => {
  const { data: unit, error: unitError } = await supabaseAdmin
    .from('units')
    .select('id, title, description')
    .eq('id', req.params.id)
    .single();

  if (unitError || !unit) {
    return res.status(404).json({ error: 'Unidad no encontrada' });
  }

  const { data: topics, error: topicsError } = await supabaseAdmin
    .from('unit_topics')
    .select('id, title')
    .eq('unit_id', unit.id)
    .order('created_at');

  if (topicsError) {
    return res.status(400).json({ error: topicsError.message });
  }

  const fullTopics = await Promise.all(
    (topics || []).map(async (topic) => {
      const { data: blocks } = await supabaseAdmin
        .from('topic_blocks')
        .select('*')
        .eq('topic_id', topic.id)
        .order('position');

      const serializedBlocks = await Promise.all((blocks || []).map(serializeBlock));

      return { id: topic.id, title: topic.title, blocks: serializedBlocks };
    })
  );

  res.json({ unit, topics: fullTopics });
});

module.exports = router;
