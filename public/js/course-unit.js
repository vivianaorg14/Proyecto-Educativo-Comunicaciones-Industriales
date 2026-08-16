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
  const unitIndex = params.get('unitIndex') || '1';

  if (!unitId) {
    window.location.href = '/course.html';
    return;
  }

  const breadcrumbUnit = document.getElementById('breadcrumbUnit');
  const unitEyebrow = document.getElementById('unitEyebrow');
  const unitTitle = document.getElementById('unitTitle');
  const unitDescription = document.getElementById('unitDescription');
  const topicsCountLabel = document.getElementById('topicsCountLabel');
  const topicsList = document.getElementById('topicsList');

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function countBlocksByType(blocks, type) {
    return blocks.filter((b) => b.type === type).length;
  }

  function renderTopicRow(topic, index) {
    const images = countBlocksByType(topic.blocks, 'image');
    const files = countBlocksByType(topic.blocks, 'file');
    const videos = countBlocksByType(topic.blocks, 'video');

    const chips = [];
    if (images) chips.push(`<span>🖼 ${images} imagen${images === 1 ? '' : 'es'}</span>`);
    if (files) chips.push(`<span>📄 ${files} archivo${files === 1 ? '' : 's'}</span>`);
    if (videos) chips.push(`<span>🎬 ${videos} video${videos === 1 ? '' : 's'}</span>`);

    return `
      <a class="topic-row" href="/course-topic.html?unitId=${unitId}&topicId=${topic.id}&unitIndex=${unitIndex}">
        <span class="topic-row-number">${String(index + 1).padStart(2, '0')}</span>
        <span class="topic-row-info">
          <span class="topic-row-title">${escapeHtml(topic.title)}</span>
          <span class="topic-row-meta">${chips.join('') || '<span>Sin contenido todavía</span>'}</span>
        </span>
        <svg class="topic-row-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </a>
    `;
  }

  try {
    const res = await fetch(`/api/content/units/${unitId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      unitTitle.textContent = 'No se pudo cargar la unidad';
      topicsList.innerHTML = `<p class="empty-state">${escapeHtml(data.error || '')}</p>`;
      return;
    }

    unitEyebrow.textContent = `Unidad ${String(unitIndex).padStart(2, '0')}`;
    unitTitle.textContent = data.unit.title;
    unitDescription.textContent = data.unit.description;
    breadcrumbUnit.textContent = data.unit.title;

    const count = data.topics.length;
    topicsCountLabel.textContent = `Temas — ${count} en total`;

    if (!count) {
      topicsList.innerHTML = '<p class="empty-state">Esta unidad todavía no tiene temas publicados.</p>';
      return;
    }

    topicsList.innerHTML = data.topics.map(renderTopicRow).join('');
  } catch (err) {
    unitTitle.textContent = 'No se pudo cargar la unidad';
    topicsList.innerHTML = '<p class="empty-state">Intenta de nuevo más tarde.</p>';
  }
})();
