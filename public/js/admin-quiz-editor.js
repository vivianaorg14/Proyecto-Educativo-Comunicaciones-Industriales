(async () => {
  const supabase = await window.supabaseClientPromise;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login.html';
    return;
  }

  if (session.user.app_metadata?.role !== 'admin') {
    window.location.href = '/dashboard.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const unitId = params.get('unitId');
  const quizId = params.get('quizId'); // null => crear quiz nuevo

  if (!unitId) {
    window.location.href = '/admin-units.html';
    return;
  }

  const API_BASE = `/api/admin/units/${unitId}/quizzes`;

  const backLink = document.getElementById('backLink');
  const unitTitleCrumb = document.getElementById('unitTitleCrumb');
  const quizTitleCrumb = document.getElementById('quizTitleCrumb');
  const quizTitleInput = document.getElementById('quizTitleInput');
  const questionsList = document.getElementById('questionsList');
  const addQuestionBtn = document.getElementById('addQuestionBtn');
  const saveBtn = document.getElementById('saveBtn');
  const deleteQuizBtn = document.getElementById('deleteQuizBtn');
  const formMessage = document.getElementById('formMessage');

  backLink.href = `/admin-unit-topics.html?unitId=${unitId}`;

  let questions = [];

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  async function authHeaders() {
    const {
      data: { session: freshSession },
    } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${freshSession.access_token}` };
  }

  function showMessage(text, type) {
    formMessage.textContent = text;
    formMessage.className = `form-message ${type}`;
  }

  function createOption() {
    return { text: '', is_correct: false };
  }

  function createQuestion() {
    return { text: '', options: [createOption(), createOption()] };
  }

  function renderQuestions() {
    if (!questions.length) {
      questionsList.innerHTML = '<p class="block-empty-hint">Todavía no hay preguntas. Agrega la primera abajo.</p>';
      return;
    }

    questionsList.innerHTML = questions.map((q, qi) => `
      <div class="question-item">
        <div class="question-item-head">
          <span class="question-item-tag">Pregunta ${qi + 1}</span>
          <button type="button" class="block-delete-btn" data-action="delete-question" data-qindex="${qi}" title="Eliminar pregunta">×</button>
        </div>
        <textarea class="block-input block-textarea" data-qindex="${qi}" data-field="qtext" placeholder="Escribe la pregunta...">${escapeHtml(q.text)}</textarea>

        <div class="options-list">
          ${q.options.map((o, oi) => `
            <div class="option-row">
              <input type="radio" class="option-radio" name="correct-${qi}" data-qindex="${qi}" data-oindex="${oi}" ${o.is_correct ? 'checked' : ''} title="Marcar como correcta" />
              <input type="text" class="block-input" data-qindex="${qi}" data-oindex="${oi}" data-field="otext" placeholder="Opción ${oi + 1}" value="${escapeHtml(o.text)}" />
              <button type="button" class="icon-btn icon-btn-danger" data-action="delete-option" data-qindex="${qi}" data-oindex="${oi}" title="Quitar opción">×</button>
            </div>
          `).join('')}
        </div>

        <button type="button" class="add-option-btn" data-action="add-option" data-qindex="${qi}">+ Agregar opción</button>
      </div>
    `).join('');
  }

  // ---------- Eventos (delegados, no se re-atan en cada render) ----------

  questionsList.addEventListener('click', (e) => {
    const delQ = e.target.closest('[data-action="delete-question"]');
    if (delQ) {
      questions.splice(Number(delQ.dataset.qindex), 1);
      renderQuestions();
      return;
    }

    const delO = e.target.closest('[data-action="delete-option"]');
    if (delO) {
      const qi = Number(delO.dataset.qindex);
      if (questions[qi].options.length <= 2) {
        alert('Cada pregunta necesita al menos 2 opciones');
        return;
      }
      questions[qi].options.splice(Number(delO.dataset.oindex), 1);
      renderQuestions();
      return;
    }

    const addO = e.target.closest('[data-action="add-option"]');
    if (addO) {
      questions[Number(addO.dataset.qindex)].options.push(createOption());
      renderQuestions();
    }
  });

  questionsList.addEventListener('change', (e) => {
    if (!e.target.matches('.option-radio')) return;
    const qi = Number(e.target.dataset.qindex);
    const oi = Number(e.target.dataset.oindex);
    questions[qi].options.forEach((o, i) => { o.is_correct = i === oi; });
  });

  questionsList.addEventListener('input', (e) => {
    const field = e.target.dataset.field;
    if (field === 'qtext') {
      questions[Number(e.target.dataset.qindex)].text = e.target.value;
    } else if (field === 'otext') {
      const qi = Number(e.target.dataset.qindex);
      const oi = Number(e.target.dataset.oindex);
      questions[qi].options[oi].text = e.target.value;
    }
  });

  addQuestionBtn.addEventListener('click', () => {
    questions.push(createQuestion());
    renderQuestions();
    requestAnimationFrame(() => {
      const items = questionsList.querySelectorAll('.question-item');
      const last = items[items.length - 1];
      last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      last?.querySelector('textarea')?.focus();
    });
  });

  // ---------- Cargar / Guardar ----------

  async function loadUnitCrumb() {
    const res = await fetch(`/api/admin/units/${unitId}`, { headers: await authHeaders() });
    const data = await res.json();
    if (res.ok) unitTitleCrumb.textContent = data.unit.title;
  }

  async function loadExisting() {
    const res = await fetch(`${API_BASE}/${quizId}`, { headers: await authHeaders() });
    const data = await res.json();

    if (!res.ok) {
      showMessage(data.error || 'No se pudo cargar el quiz', 'error');
      questions = [createQuestion()];
      renderQuestions();
      return;
    }

    quizTitleInput.value = data.quiz.title;
    quizTitleCrumb.textContent = data.quiz.title;
    deleteQuizBtn.style.display = 'inline-flex';
    questions = data.quiz.questions.map((q) => ({
      text: q.text,
      options: q.options.map((o) => ({ text: o.text, is_correct: o.is_correct })),
    }));

    renderQuestions();
  }

  saveBtn.addEventListener('click', async () => {
    const title = quizTitleInput.value.trim();
    if (!title) {
      showMessage('El título del quiz es obligatorio', 'error');
      quizTitleInput.focus();
      return;
    }
    if (!questions.length) {
      showMessage('Agrega al menos una pregunta', 'error');
      return;
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) {
        showMessage(`La pregunta ${i + 1} necesita un enunciado`, 'error');
        return;
      }
      if (q.options.some((o) => !o.text.trim())) {
        showMessage(`Todas las opciones de la pregunta ${i + 1} deben tener texto`, 'error');
        return;
      }
      if (q.options.filter((o) => o.is_correct).length !== 1) {
        showMessage(`Marca exactamente una respuesta correcta en la pregunta ${i + 1}`, 'error');
        return;
      }
    }

    const url = quizId ? `${API_BASE}/${quizId}` : API_BASE;
    const method = quizId ? 'PUT' : 'POST';

    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    try {
      const res = await fetch(url, {
        method,
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, questions }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ocurrió un error al guardar el quiz');
      }
      window.location.href = `/admin-unit-topics.html?unitId=${unitId}`;
    } catch (err) {
      showMessage(err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
    }
  });

  deleteQuizBtn.addEventListener('click', async () => {
    if (!quizId) return;
    if (!confirm('¿Eliminar este quiz por completo? Esta acción no se puede deshacer.')) return;

    const res = await fetch(`${API_BASE}/${quizId}`, { method: 'DELETE', headers: await authHeaders() });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'No se pudo eliminar el quiz');
      return;
    }

    window.location.href = `/admin-unit-topics.html?unitId=${unitId}`;
  });

  await loadUnitCrumb();
  if (quizId) {
    await loadExisting();
  } else {
    questions = [createQuestion()];
    renderQuestions();
  }
})();
