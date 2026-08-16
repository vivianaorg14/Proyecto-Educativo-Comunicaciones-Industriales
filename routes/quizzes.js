const express = require('express');
const router = express.Router({ mergeParams: true });
const supabaseAdmin = require('../config/supabaseAdmin');
const requireAdmin = require('../middleware/requireAdmin');

// Todas las rutas de este archivo requieren rol de administrador
router.use(requireAdmin);

async function getQuizWithQuestions(unitId) {
  const { data: quiz, error } = await supabaseAdmin
    .from('quizzes')
    .select('*')
    .eq('unit_id', unitId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!quiz) return null;

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

// Obtener el quiz de la unidad (o null si no tiene)
router.get('/', async (req, res) => {
  try {
    const quiz = await getQuizWithQuestions(req.params.unitId);
    res.json({ quiz });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Crea o reemplaza por completo el quiz de la unidad (título + preguntas + opciones)
router.put('/', async (req, res) => {
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

  const { data: existingQuiz, error: fetchError } = await supabaseAdmin
    .from('quizzes')
    .select('id')
    .eq('unit_id', unitId)
    .maybeSingle();

  if (fetchError) {
    return res.status(400).json({ error: fetchError.message });
  }

  let quizId = existingQuiz?.id;

  if (quizId) {
    const { error: updateError } = await supabaseAdmin.from('quizzes').update({ title: title.trim() }).eq('id', quizId);
    if (updateError) return res.status(400).json({ error: updateError.message });

    // Las preguntas viejas se reemplazan por completo; el cascade en
    // quiz_options se encarga de borrar sus opciones.
    const { error: deleteError } = await supabaseAdmin.from('quiz_questions').delete().eq('quiz_id', quizId);
    if (deleteError) return res.status(400).json({ error: deleteError.message });
  } else {
    const { data: newQuiz, error: insertError } = await supabaseAdmin
      .from('quizzes')
      .insert({ unit_id: unitId, title: title.trim() })
      .select()
      .single();
    if (insertError) return res.status(400).json({ error: insertError.message });
    quizId = newQuiz.id;
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    const { data: question, error: qError } = await supabaseAdmin
      .from('quiz_questions')
      .insert({ quiz_id: quizId, text: q.text.trim(), position: i })
      .select()
      .single();

    if (qError) {
      return res.status(400).json({ error: qError.message });
    }

    const optionRows = q.options.map((o, j) => ({
      question_id: question.id,
      text: o.text.trim(),
      is_correct: !!o.is_correct,
      position: j,
    }));

    const { error: oError } = await supabaseAdmin.from('quiz_options').insert(optionRows);
    if (oError) {
      return res.status(400).json({ error: oError.message });
    }
  }

  try {
    const fullQuiz = await getQuizWithQuestions(unitId);
    res.json({ message: 'Quiz guardado', quiz: fullQuiz });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Elimina el quiz de la unidad
router.delete('/', async (req, res) => {
  const { error } = await supabaseAdmin.from('quizzes').delete().eq('unit_id', req.params.unitId);
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  res.json({ message: 'Quiz eliminado' });
});

module.exports = router;
