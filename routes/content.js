const express = require('express');
const router = express.Router();
const supabaseAdmin = require('../config/supabaseAdmin');
const requireAuth = require('../middleware/requireAuth');

const PDF_BUCKET = 'unit-pdfs';
const IMAGE_BUCKET = 'unit-images';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hora

// Cualquier usuario con sesión válida (estudiante o admin) puede leer el contenido.
router.use(requireAuth);

async function attachSignedUrls(bucket, rows) {
  return Promise.all(
    (rows || []).map(async (row) => {
      const { data: signed } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
      return { id: row.id, title: row.title, url: signed?.signedUrl || null };
    })
  );
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

// Detalle de una unidad: sus temas, con videos y PDFs (con URL firmada)
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
    .select('id, title, description')
    .eq('unit_id', unit.id)
    .order('created_at');

  if (topicsError) {
    return res.status(400).json({ error: topicsError.message });
  }

  const fullTopics = await Promise.all(
    (topics || []).map(async (topic) => {
      const [{ data: videos }, { data: pdfs }, { data: images }] = await Promise.all([
        supabaseAdmin.from('unit_videos').select('id, title, url').eq('topic_id', topic.id).order('position'),
        supabaseAdmin.from('unit_pdfs').select('id, title, storage_path').eq('topic_id', topic.id).order('position'),
        supabaseAdmin.from('unit_images').select('id, title, storage_path').eq('topic_id', topic.id).order('position'),
      ]);

      const [pdfsWithUrls, imagesWithUrls] = await Promise.all([
        attachSignedUrls(PDF_BUCKET, pdfs),
        attachSignedUrls(IMAGE_BUCKET, images),
      ]);

      return {
        id: topic.id,
        title: topic.title,
        description: topic.description,
        videos: videos || [],
        pdfs: pdfsWithUrls,
        images: imagesWithUrls,
      };
    })
  );

  res.json({ unit, topics: fullTopics });
});

module.exports = router;
