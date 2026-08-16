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

  const { data: quiz } = await supabaseAdmin
    .from('quizzes')
    .select('id, title')
    .eq('unit_id', unit.id)
    .maybeSingle();

  res.json({ unit, topics: fullTopics, quiz: quiz || null });
});

// Quiz de una unidad, listo para responder (sin exponer cuál opción es correcta)
router.get('/units/:unitId/quiz', async (req, res) => {
  const { data: quiz, error } = await supabaseAdmin
    .from('quizzes')
    .select('*')
    .eq('unit_id', req.params.unitId)
    .maybeSingle();

  if (error) {
    return res.status(400).json({ error: error.message });
  }
  if (!quiz) {
    return res.json({ quiz: null });
  }

  const { data: questions, error: questionsError } = await supabaseAdmin
    .from('quiz_questions')
    .select('id, text')
    .eq('quiz_id', quiz.id)
    .order('position');

  if (questionsError) {
    return res.status(400).json({ error: questionsError.message });
  }

  const fullQuestions = await Promise.all(
    (questions || []).map(async (q) => {
      const { data: options } = await supabaseAdmin
        .from('quiz_options')
        .select('id, text')
        .eq('question_id', q.id)
        .order('position');
      return { id: q.id, text: q.text, options: options || [] };
    })
  );

  res.json({ quiz: { id: quiz.id, title: quiz.title, questions: fullQuestions } });
});

// Califica el quiz. La corrección se hace acá, del lado del servidor, para
// que el estudiante nunca reciba cuál opción es la correcta de antemano.
router.post('/units/:unitId/quiz/submit', async (req, res) => {
  const { answers } = req.body;

  if (!Array.isArray(answers)) {
    return res.status(400).json({ error: 'El campo "answers" debe ser un arreglo' });
  }

  const { data: quiz, error: quizError } = await supabaseAdmin
    .from('quizzes')
    .select('id')
    .eq('unit_id', req.params.unitId)
    .maybeSingle();

  if (quizError) {
    return res.status(400).json({ error: quizError.message });
  }
  if (!quiz) {
    return res.status(404).json({ error: 'Esta unidad no tiene quiz' });
  }

  const { data: questions, error: questionsError } = await supabaseAdmin
    .from('quiz_questions')
    .select('id, text')
    .eq('quiz_id', quiz.id)
    .order('position');

  if (questionsError) {
    return res.status(400).json({ error: questionsError.message });
  }

  const selectedByQuestion = new Map(answers.map((a) => [a.questionId, a.optionId]));

  const results = await Promise.all(
    (questions || []).map(async (q) => {
      const { data: options } = await supabaseAdmin
        .from('quiz_options')
        .select('id, text, is_correct')
        .eq('question_id', q.id)
        .order('position');

      const correctOption = (options || []).find((o) => o.is_correct);
      const selectedOptionId = selectedByQuestion.get(q.id) || null;
      const isCorrect = !!selectedOptionId && selectedOptionId === correctOption?.id;

      return {
        questionId: q.id,
        questionText: q.text,
        options: (options || []).map((o) => ({ id: o.id, text: o.text })),
        selectedOptionId,
        correctOptionId: correctOption?.id || null,
        isCorrect,
      };
    })
  );

  const totalQuestions = results.length;
  const correctCount = results.filter((r) => r.isCorrect).length;
  const scorePercent = totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0;

  res.json({
    score_percent: scorePercent,
    correct_count: correctCount,
    total_questions: totalQuestions,
    results,
  });
});

module.exports = router;
