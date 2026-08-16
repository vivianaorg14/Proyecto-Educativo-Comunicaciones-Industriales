const express = require('express');
const router = express.Router();
const supabaseAdmin = require('../config/supabaseAdmin');
const requireAdmin = require('../middleware/requireAdmin');

const PDF_BUCKET = 'unit-pdfs';
const IMAGE_BUCKET = 'unit-images';

// Todas las rutas de este archivo requieren rol de administrador
router.use(requireAdmin);

// Listar unidades generales, con el número de temas que tiene cada una
router.get('/', async (req, res) => {
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
      return { ...unit, topics_count: count || 0 };
    })
  );

  res.json({ units: withCounts });
});

// Obtener una unidad
router.get('/:id', async (req, res) => {
  const { data: unit, error } = await supabaseAdmin
    .from('units')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !unit) {
    return res.status(404).json({ error: 'Unidad no encontrada' });
  }

  res.json({ unit });
});

// Crear unidad
router.post('/', async (req, res) => {
  const { title, description } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'El título es obligatorio' });
  }

  const { data: unit, error } = await supabaseAdmin
    .from('units')
    .insert({ title, description: description || '' })
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(201).json({ message: 'Unidad creada', unit });
});

// Editar unidad
router.put('/:id', async (req, res) => {
  const { title, description } = req.body;
  const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;

  const { data: unit, error } = await supabaseAdmin
    .from('units')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !unit) {
    return res.status(404).json({ error: error?.message || 'Unidad no encontrada' });
  }

  res.json({ message: 'Unidad actualizada', unit });
});

// Borrar unidad (en cascada borra sus temas, videos y pdfs en la base de datos;
// los archivos del bucket de Storage se limpian aparte)
router.delete('/:id', async (req, res) => {
  const unitId = req.params.id;

  const { data: topics, error: topicsError } = await supabaseAdmin
    .from('unit_topics')
    .select('id')
    .eq('unit_id', unitId);

  if (topicsError) {
    return res.status(400).json({ error: topicsError.message });
  }

  const topicIds = (topics || []).map((t) => t.id);

  if (topicIds.length) {
    const { data: blocks, error: blocksError } = await supabaseAdmin
      .from('topic_blocks')
      .select('type, content')
      .in('topic_id', topicIds)
      .in('type', ['image', 'file']);

    if (blocksError) {
      return res.status(400).json({ error: blocksError.message });
    }

    const imagePaths = (blocks || []).filter((b) => b.type === 'image').map((b) => b.content.storage_path);
    const filePaths = (blocks || []).filter((b) => b.type === 'file').map((b) => b.content.storage_path);

    if (imagePaths.length) {
      await supabaseAdmin.storage.from(IMAGE_BUCKET).remove(imagePaths);
    }
    if (filePaths.length) {
      await supabaseAdmin.storage.from(PDF_BUCKET).remove(filePaths);
    }
  }

  const { error: deleteError } = await supabaseAdmin.from('units').delete().eq('id', unitId);

  if (deleteError) {
    return res.status(400).json({ error: deleteError.message });
  }

  res.json({ message: 'Unidad eliminada' });
});

module.exports = router;
