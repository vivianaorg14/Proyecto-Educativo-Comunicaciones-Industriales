const express = require('express');
const router = express.Router({ mergeParams: true });
const supabaseAdmin = require('../config/supabaseAdmin');
const requireAdmin = require('../middleware/requireAdmin');

// Todas las rutas de este archivo requieren rol de administrador
router.use(requireAdmin);

async function getQuizWithQuestions(quizId) {
  const { data: quiz, error } = await supabaseAdmin
    .from('quizzes')
    .select('*')
    .eq('id', quizId)
    .single();

  if (error || !quiz) return null;

  const { data: questions, error: questionsError } = await supabaseAdmin
    .from('quiz_questions')
    .select('*')
    .eq('quiz_id', quiz.id)
    .order('position');

  if (questionsError) throw new Error(questionsError.message);

  const fullQuestions = await Promise.all(
    (questions || []).map(async (q) => {
      const { data: options, error: optionsError } = await supabaseAdmin
        .from('quiz_options')
        .select('*')
        .eq('question_id', q.id)
        .order('position');
      if (optionsError) throw new Error(optionsError.message);
      return { id: q.id, text: q.text, options: options || [] };
    })
  );

  return { ...quiz, questions: fullQuestions };
}

function validateQuestions(questions) {
  if (!Array.isArray(questions) || !questions.length) {
    throw new Error('El quiz necesita al menos una pregunta');
  }
  questions.forEach((q, i) => {
    if (!q?.text || !q.text.trim()) {
      throw new Error(`La pregunta ${i + 1} necesita un enunciado`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`La pregunta ${i + 1} necesita al menos 2 opciones`);
    }
    q.options.forEach((o, j) => {
      if (!o?.text || !o.text.trim()) {
        throw new Error(`La opción ${j + 1} de la pregunta ${i + 1} no puede estar vacía`);
      }
    });
    const correctCount = q.options.filter((o) => o.is_correct).length;
    if (correctCount !== 1) {
      throw new Error(`La pregunta ${i + 1} debe tener exactamente una respuesta marcada como correcta`);
    }
  });
}

async function replaceQuestions(quizId, questions) {
  const { error: deleteError } = await supabaseAdmin.from('quiz_questions').delete().eq('quiz_id', quizId);
  if (deleteError) throw new Error(deleteError.message);

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    const { data: question, error: qError } = await supabaseAdmin
      .from('quiz_questions')
      .insert({ quiz_id: quizId, text: q.text.trim(), position: i })
      .select()
      .single();

    if (qError) throw new Error(qError.message);

    const optionRows = q.options.map((o, j) => ({
      question_id: question.id,
      text: o.text.trim(),
      is_correct: !!o.is_correct,
      position: j,
    }));

    const { error: oError } = await supabaseAdmin.from('quiz_options').insert(optionRows);
    if (oError) throw new Error(oError.message);
  }
}

// ---------- Rutas ----------
// Montadas en /api/admin/units/:unitId/quizzes

// Listar los quizzes de una unidad
router.get('/', async (req, res) => {
  const { data: quizzes, error } = await supabaseAdmin
    .from('quizzes')
    .select('*')
    .eq('unit_id', req.params.unitId)
    .order('created_at');

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const withCounts = await Promise.all(
    quizzes.map(async (quiz) => {
      const { count } = await supabaseAdmin
        .from('quiz_questions')
        .select('*', { count: 'exact', head: true })
        .eq('quiz_id', quiz.id);
      return { id: quiz.id, title: quiz.title, questions_count: count || 0 };
    })
  );

  res.json({ quizzes: withCounts });
});

// Obtener un quiz (con preguntas y opciones, para editarlo)
router.get('/:quizId', async (req, res) => {
  try {
    const quiz = await getQuizWithQuestions(req.params.quizId);
    if (!quiz || quiz.unit_id !== req.params.unitId) {
      return res.status(404).json({ error: 'Quiz no encontrado' });
    }
    res.json({ quiz });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Crear un quiz nuevo en la unidad
router.post('/', async (req, res) => {
  const { unitId } = req.params;
  const { title, questions } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'El título del quiz es obligatorio' });
  }

  try {
    validateQuestions(questions);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const { data: quiz, error: insertError } = await supabaseAdmin
    .from('quizzes')
    .insert({ unit_id: unitId, title: title.trim() })
    .select()
    .single();

  if (insertError) {
    return res.status(400).json({ error: insertError.message });
  }

  try {
    await replaceQuestions(quiz.id, questions);
    const fullQuiz = await getQuizWithQuestions(quiz.id);
    res.status(201).json({ message: 'Quiz creado', quiz: fullQuiz });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Editar un quiz (reemplaza título y todas sus preguntas/opciones)
router.put('/:quizId', async (req, res) => {
  const { quizId } = req.params;
  const { title, questions } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'El título del quiz es obligatorio' });
  }

  try {
    validateQuestions(questions);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const { error: updateError } = await supabaseAdmin.from('quizzes').update({ title: title.trim() }).eq('id', quizId);
  if (updateError) {
    return res.status(400).json({ error: updateError.message });
  }

  try {
    await replaceQuestions(quizId, questions);
    const fullQuiz = await getQuizWithQuestions(quizId);
    if (!fullQuiz) {
      return res.status(404).json({ error: 'Quiz no encontrado' });
    }
    res.json({ message: 'Quiz actualizado', quiz: fullQuiz });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Eliminar un quiz
router.delete('/:quizId', async (req, res) => {
  const { error } = await supabaseAdmin.from('quizzes').delete().eq('id', req.params.quizId);
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  res.json({ message: 'Quiz eliminado' });
});

module.exports = router;
