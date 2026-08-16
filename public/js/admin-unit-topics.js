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

  const unitId = new URLSearchParams(window.location.search).get('unitId');
  if (!unitId) {
    window.location.href = '/admin-units.html';
    return;
  }

  const API_BASE = `/api/admin/units/${unitId}/topics`;
  const QUIZ_API_BASE = `/api/admin/units/${unitId}/quizzes`;

  const unitTitleHeading = document.getElementById('unitTitle');
  const newTopicBtn = document.getElementById('newTopicBtn');
  const topicsList = document.getElementById('topicsList');
  const newQuizBtn = document.getElementById('newQuizBtn');
  const quizzesList = document.getElementById('quizzesList');

  newTopicBtn.href = `/admin-topic-editor.html?unitId=${unitId}`;
  newQuizBtn.href = `/admin-quiz-editor.html?unitId=${unitId}`;

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

  function countByType(blocks, type) {
    return blocks.filter((b) => b.type === type).length;
  }

  function renderTopicsList(topics) {
    if (!topics.length) {
      topicsList.innerHTML = '<p class="empty-state">Todavía no hay temas. Crea el primero con "+ Nuevo tema".</p>';
      return;
    }

    topicsList.innerHTML = topics.map((topic) => {
      const images = countByType(topic.blocks, 'image');
      const files = countByType(topic.blocks, 'file');
      const videos = countByType(topic.blocks, 'video');

      const meta = [
        `${topic.blocks.length} bloque(s)`,
        images ? `🖼 ${images} imagen(es)` : null,
        files ? `📄 ${files} archivo(s)` : null,
        videos ? `🎬 ${videos} video(s)` : null,
      ].filter(Boolean).join(' · ');

      return `
        <article class="unit-manage-card" data-id="${topic.id}">
          <h3>${escapeHtml(topic.title)}</h3>
          <div class="unit-meta"><span>${meta}</span></div>
          <div class="unit-manage-actions">
            <a class="btn btn-solid" href="/admin-topic-editor.html?unitId=${unitId}&topicId=${topic.id}">Editar</a>
            <button type="button" class="btn btn-ghost" data-action="delete">Eliminar</button>
          </div>
        </article>
      `;
    }).join('');

    topicsList.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      const topicId = btn.closest('.unit-manage-card').dataset.id;
      btn.addEventListener('click', () => deleteTopic(topicId));
    });
  }

  async function loadUnitHeading() {
    const res = await fetch(`/api/admin/units/${unitId}`, { headers: await authHeaders() });
    const data = await res.json();
    if (res.ok) {
      unitTitleHeading.textContent = `Temas de "${data.unit.title}"`;
    }
  }

  async function loadTopics() {
    const res = await fetch(API_BASE, { headers: await authHeaders() });
    const data = await res.json();
    if (!res.ok) {
      topicsList.innerHTML = `<p class="empty-state">${escapeHtml(data.error || 'No se pudieron cargar los temas')}</p>`;
      return;
    }
    renderTopicsList(data.topics);
  }

  async function deleteTopic(topicId) {
    if (!confirm('¿Eliminar este tema y todo su contenido? Esta acción no se puede deshacer.')) return;
    const res = await fetch(`${API_BASE}/${topicId}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'No se pudo eliminar el tema');
      return;
    }
    await loadTopics();
  }

  function renderQuizzesList(quizzes) {
    if (!quizzes.length) {
      quizzesList.innerHTML = '<p class="empty-state">Todavía no hay quizzes. Crea el primero con "+ Nuevo quiz".</p>';
      return;
    }

    quizzesList.innerHTML = quizzes.map((quiz) => `
      <article class="unit-manage-card" data-id="${quiz.id}">
        <h3>${escapeHtml(quiz.title)}</h3>
        <div class="unit-meta"><span>${quiz.questions_count} pregunta(s)</span></div>
        <div class="unit-manage-actions">
          <a class="btn btn-solid" href="/admin-quiz-editor.html?unitId=${unitId}&quizId=${quiz.id}">Editar</a>
          <button type="button" class="btn btn-ghost" data-action="delete">Eliminar</button>
        </div>
      </article>
    `).join('');

    quizzesList.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      const quizId = btn.closest('.unit-manage-card').dataset.id;
      btn.addEventListener('click', () => deleteQuiz(quizId));
    });
  }

  async function loadQuizzes() {
    const res = await fetch(QUIZ_API_BASE, { headers: await authHeaders() });
    const data = await res.json();
    if (!res.ok) {
      quizzesList.innerHTML = `<p class="empty-state">${escapeHtml(data.error || 'No se pudieron cargar los quizzes')}</p>`;
      return;
    }
    renderQuizzesList(data.quizzes);
  }

  async function deleteQuiz(quizId) {
    if (!confirm('¿Eliminar este quiz y todas sus preguntas? Esta acción no se puede deshacer.')) return;
    const res = await fetch(`${QUIZ_API_BASE}/${quizId}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'No se pudo eliminar el quiz');
      return;
    }
    await loadQuizzes();
  }

  await loadUnitHeading();
  await loadTopics();
  await loadQuizzes();
})();
