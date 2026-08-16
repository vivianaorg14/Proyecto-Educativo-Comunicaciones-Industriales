(async () => {
  const supabase = await window.supabaseClientPromise;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const unitId = params.get('unitId');
  const quizId = params.get('quizId');
  const unitIndex = params.get('unitIndex') || '1';

  if (!unitId || !quizId) {
    window.location.href = '/course.html';
    return;
  }

  const breadcrumbBack = document.getElementById('breadcrumbBack');
  const breadcrumbUnitTitle = document.getElementById('breadcrumbUnitTitle');
  const quizEyebrow = document.getElementById('quizEyebrow');
  const quizTitle = document.getElementById('quizTitle');
  const quizForm = document.getElementById('quizForm');
  const questionsContainer = document.getElementById('questionsContainer');
  const submitQuizBtn = document.getElementById('submitQuizBtn');
  const resultsContainer = document.getElementById('resultsContainer');

  breadcrumbBack.href = `/course-unit.html?unitId=${unitId}&unitIndex=${unitIndex}`;

  let nextTarget = null; // { label, href } — se calcula al cargar la página

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

  function renderQuestions(questions) {
    questionsContainer.innerHTML = questions.map((q, qi) => `
      <div class="quiz-question">
        <p class="quiz-question-text">${qi + 1}. ${escapeHtml(q.text)}</p>
        <div class="quiz-options">
          ${q.options.map((o) => `
            <label class="quiz-option">
              <input type="radio" name="q-${q.id}" value="${o.id}" required />
              <span>${escapeHtml(o.text)}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');
    submitQuizBtn.style.display = 'inline-flex';
  }

  function renderResults(quizTitleText, data) {
    quizForm.hidden = true;

    const banner = `
      <div class="quiz-score-banner">
        <div class="quiz-score-value">${data.score_percent}%</div>
        <div class="quiz-score-label">${data.correct_count} de ${data.total_questions} correctas</div>
      </div>
    `;

    const questionsHtml = data.results.map((r, ri) => `
      <div class="quiz-result-question ${r.isCorrect ? 'is-correct' : 'is-incorrect'}">
        <p class="quiz-question-text">${ri + 1}. ${escapeHtml(r.questionText)}</p>
        <div class="quiz-options quiz-options--result">
          ${r.options.map((o) => {
            const isSelected = o.id === r.selectedOptionId;
            const isCorrectOption = o.id === r.correctOptionId;
            const stateClass = isCorrectOption ? 'is-correct-option' : (isSelected ? 'is-wrong-option' : '');
            const icon = isCorrectOption ? '✓' : (isSelected ? '✗' : '');
            return `
              <div class="quiz-result-option ${stateClass}">
                <span class="quiz-result-icon">${icon}</span>
                <span>${escapeHtml(o.text)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');

    const nextBtnHtml = nextTarget
      ? `<a href="${nextTarget.href}" class="btn btn-solid">${nextTarget.label} →</a>`
      : '';

    const actions = `
      <div class="quiz-result-actions">
        <button type="button" id="retryBtn" class="btn btn-outline">Volver a intentar</button>
        <a href="/course-unit.html?unitId=${unitId}&unitIndex=${unitIndex}" class="btn btn-outline">Volver a la unidad</a>
        ${nextBtnHtml}
      </div>
    `;

    resultsContainer.innerHTML = banner + questionsHtml + actions;
    resultsContainer.hidden = false;

    document.getElementById('retryBtn').addEventListener('click', () => {
      window.location.reload();
    });

    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  quizForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(quizForm);
    const answers = [];
    for (const [name, optionId] of formData.entries()) {
      answers.push({ questionId: name.replace(/^q-/, ''), optionId });
    }

    submitQuizBtn.disabled = true;
    submitQuizBtn.textContent = 'Enviando...';

    try {
      const res = await fetch(`/api/content/units/${unitId}/quizzes/${quizId}/submit`, {
        method: 'POST',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo calificar el quiz');
      }
      renderResults(quizTitle.textContent, data);
    } catch (err) {
      alert(err.message);
    } finally {
      submitQuizBtn.disabled = false;
      submitQuizBtn.textContent = 'Enviar respuestas';
    }
  });

  try {
    const [unitRes, quizRes, allUnitsRes] = await Promise.all([
      fetch(`/api/content/units/${unitId}`, { headers: await authHeaders() }),
      fetch(`/api/content/units/${unitId}/quizzes/${quizId}`, { headers: await authHeaders() }),
      fetch('/api/content/units', { headers: await authHeaders() }),
    ]);
    const unitData = await unitRes.json();
    const quizData = await quizRes.json();
    const allUnitsData = await allUnitsRes.json();

    if (unitRes.ok) {
      breadcrumbUnitTitle.textContent = unitData.unit.title;
    }

    if (!quizRes.ok) {
      throw new Error(quizData.error || 'No se pudo cargar el quiz');
    }

    // Siguiente quiz de esta unidad, o si este era el último, la siguiente unidad.
    if (unitRes.ok) {
      const quizzesInUnit = unitData.quizzes || [];
      const quizPos = quizzesInUnit.findIndex((q) => q.id === quizId);
      const nextQuizInUnit = quizPos > -1 && quizPos < quizzesInUnit.length - 1 ? quizzesInUnit[quizPos + 1] : null;

      if (nextQuizInUnit) {
        nextTarget = {
          label: 'Siguiente quiz',
          href: `/course-quiz.html?unitId=${unitId}&quizId=${nextQuizInUnit.id}&unitIndex=${unitIndex}`,
        };
      } else if (allUnitsRes.ok) {
        const units = allUnitsData.units || [];
        const unitPos = units.findIndex((u) => u.id === unitId);
        const nextUnit = unitPos > -1 && unitPos < units.length - 1 ? units[unitPos + 1] : null;
        if (nextUnit) {
          nextTarget = {
            label: 'Siguiente unidad',
            href: `/course-unit.html?unitId=${nextUnit.id}&unitIndex=${unitPos + 2}`,
          };
        }
      }
    }

    quizEyebrow.textContent = `Unidad ${String(unitIndex).padStart(2, '0')}`;
    quizTitle.textContent = quizData.quiz.title;

    if (!quizData.quiz.questions.length) {
      questionsContainer.innerHTML = '<p class="empty-state">Este quiz todavía no tiene preguntas.</p>';
      return;
    }

    renderQuestions(quizData.quiz.questions);
  } catch (err) {
    quizTitle.textContent = 'No se pudo cargar el quiz';
    questionsContainer.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
})();
