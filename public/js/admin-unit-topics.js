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

  const unitTitleHeading = document.getElementById('unitTitle');
  const form = document.getElementById('topicForm');
  const topicIdInput = document.getElementById('topicId');
  const titleInput = document.getElementById('title');
  const descriptionInput = document.getElementById('description');
  const videoRows = document.getElementById('videoRows');
  const addVideoBtn = document.getElementById('addVideoBtn');
  const existingPdfs = document.getElementById('existingPdfs');
  const pdfFilesInput = document.getElementById('pdfFiles');
  const existingImages = document.getElementById('existingImages');
  const imageFilesInput = document.getElementById('imageFiles');
  const submitBtn = document.getElementById('submitBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const formTitle = document.getElementById('formTitle');
  const formSubtitle = document.getElementById('formSubtitle');
  const formMessage = document.getElementById('formMessage');
  const topicsList = document.getElementById('topicsList');

  let topics = [];

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

  function showFormMessage(text, type) {
    formMessage.textContent = text;
    formMessage.className = `form-message ${type}`;
  }

  function addVideoRow(title = '', url = '') {
    const row = document.createElement('div');
    row.className = 'video-row';
    row.innerHTML = `
      <input type="text" class="video-title" placeholder="Título (opcional)" value="${escapeHtml(title)}" />
      <input type="url" class="video-url" placeholder="https://youtube.com/..." value="${escapeHtml(url)}" />
      <button type="button" class="icon-btn icon-btn-danger" title="Quitar video">×</button>
    `;
    row.querySelector('button').addEventListener('click', () => row.remove());
    videoRows.appendChild(row);
  }

  function collectVideos() {
    return Array.from(videoRows.querySelectorAll('.video-row')).map((row) => ({
      title: row.querySelector('.video-title').value.trim(),
      url: row.querySelector('.video-url').value.trim(),
    })).filter((v) => v.url);
  }

  function renderExistingPdfs(pdfs, topicId) {
    existingPdfs.innerHTML = '';
    if (!pdfs.length) {
      existingPdfs.innerHTML = '<li style="justify-content: center; color: var(--muted);">Sin PDFs todavía</li>';
      return;
    }
    pdfs.forEach((pdf) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <a href="${pdf.url || '#'}" target="_blank" rel="noopener">${escapeHtml(pdf.title)}</a>
        <button type="button" class="icon-btn icon-btn-danger" title="Eliminar PDF">×</button>
      `;
      li.querySelector('button').addEventListener('click', () => deletePdf(topicId, pdf.id));
      existingPdfs.appendChild(li);
    });
  }

  function renderExistingImages(images, topicId) {
    existingImages.innerHTML = '';
    if (!images.length) {
      existingImages.innerHTML = '<p class="field-hint">Sin imágenes todavía</p>';
      return;
    }
    images.forEach((image) => {
      const item = document.createElement('div');
      item.className = 'image-thumb-item';
      item.innerHTML = `
        <a href="${image.url || '#'}" target="_blank" rel="noopener">
          <img src="${image.url || ''}" alt="${escapeHtml(image.title)}" />
        </a>
        <button type="button" class="icon-btn icon-btn-danger image-thumb-remove" title="Eliminar imagen">×</button>
      `;
      item.querySelector('button').addEventListener('click', () => deleteImage(topicId, image.id));
      existingImages.appendChild(item);
    });
  }

  function resetForm() {
    topicIdInput.value = '';
    form.reset();
    videoRows.innerHTML = '';
    addVideoRow();
    existingPdfs.innerHTML = '<li style="justify-content: center; color: var(--muted);">Se guardan al crear el tema</li>';
    existingImages.innerHTML = '<p class="field-hint">Se guardan al crear el tema</p>';
    formTitle.textContent = 'Nuevo tema';
    formSubtitle.textContent = 'Completa los datos y guarda para publicarlo.';
    submitBtn.textContent = 'Crear tema';
    cancelEditBtn.style.display = 'none';
  }

  function fillFormForEdit(topic) {
    topicIdInput.value = topic.id;
    titleInput.value = topic.title;
    descriptionInput.value = topic.description;
    videoRows.innerHTML = '';
    if (topic.videos.length) {
      topic.videos.forEach((v) => addVideoRow(v.title, v.url));
    } else {
      addVideoRow();
    }
    renderExistingPdfs(topic.pdfs, topic.id);
    pdfFilesInput.value = '';
    renderExistingImages(topic.images, topic.id);
    imageFilesInput.value = '';
    formTitle.textContent = 'Editar tema';
    formSubtitle.textContent = `Editando "${topic.title}"`;
    submitBtn.textContent = 'Guardar cambios';
    cancelEditBtn.style.display = 'inline-flex';
    formMessage.className = 'form-message';
    formMessage.textContent = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderTopicsList() {
    if (!topics.length) {
      topicsList.innerHTML = '<p class="empty-state">Todavía no hay temas. Crea el primero con el formulario.</p>';
      return;
    }

    topicsList.innerHTML = topics.map((topic) => `
      <article class="unit-manage-card" data-id="${topic.id}">
        <h3>${escapeHtml(topic.title)}</h3>
        <p>${escapeHtml(topic.description)}</p>
        <div class="unit-meta">
          <span>🎬 ${topic.videos.length} video(s)</span>
          <span>📄 ${topic.pdfs.length} PDF(s)</span>
          <span>🖼️ ${topic.images.length} imagen(es)</span>
        </div>
        <div class="unit-manage-actions">
          <button type="button" class="btn btn-ghost" data-action="edit">Editar</button>
          <button type="button" class="btn btn-ghost" data-action="delete">Eliminar</button>
        </div>
      </article>
    `).join('');

    topicsList.querySelectorAll('.unit-manage-card').forEach((card) => {
      const topicId = card.dataset.id;
      card.querySelector('[data-action="edit"]').addEventListener('click', () => {
        const topic = topics.find((t) => t.id === topicId);
        if (topic) fillFormForEdit(topic);
      });
      card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteTopic(topicId));
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
    topics = data.topics;
    renderTopicsList();
  }

  async function deleteTopic(topicId) {
    if (!confirm('¿Eliminar este tema y sus videos/PDFs? Esta acción no se puede deshacer.')) return;
    const res = await fetch(`${API_BASE}/${topicId}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'No se pudo eliminar el tema');
      return;
    }
    if (topicIdInput.value === topicId) resetForm();
    await loadTopics();
  }

  async function deletePdf(topicId, pdfId) {
    if (!confirm('¿Eliminar este PDF?')) return;
    const res = await fetch(`${API_BASE}/${topicId}/pdfs/${pdfId}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'No se pudo eliminar el PDF');
      return;
    }
    const refreshed = await (await fetch(`${API_BASE}/${topicId}`, { headers: await authHeaders() })).json();
    renderExistingPdfs(refreshed.topic.pdfs, topicId);
    await loadTopics();
  }

  async function deleteImage(topicId, imageId) {
    if (!confirm('¿Eliminar esta imagen?')) return;
    const res = await fetch(`${API_BASE}/${topicId}/images/${imageId}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'No se pudo eliminar la imagen');
      return;
    }
    const refreshed = await (await fetch(`${API_BASE}/${topicId}`, { headers: await authHeaders() })).json();
    renderExistingImages(refreshed.topic.images, topicId);
    await loadTopics();
  }

  addVideoBtn.addEventListener('click', () => addVideoRow());
  cancelEditBtn.addEventListener('click', () => {
    resetForm();
    formMessage.className = 'form-message';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const videos = collectVideos();
    const formData = new FormData();
    formData.append('title', titleInput.value.trim());
    formData.append('description', descriptionInput.value.trim());
    formData.append('videos', JSON.stringify(videos));
    Array.from(pdfFilesInput.files).forEach((file) => formData.append('pdfs', file));
    Array.from(imageFilesInput.files).forEach((file) => formData.append('images', file));

    const editingId = topicIdInput.value;
    const url = editingId ? `${API_BASE}/${editingId}` : API_BASE;
    const method = editingId ? 'PUT' : 'POST';

    submitBtn.disabled = true;
    submitBtn.textContent = editingId ? 'Guardando...' : 'Creando...';

    try {
      const res = await fetch(url, { method, headers: await authHeaders(), body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ocurrió un error al guardar el tema');
      }

      showFormMessage(data.message, 'success');
      resetForm();
      await loadTopics();
    } catch (err) {
      showFormMessage(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editingId ? 'Guardar cambios' : 'Crear tema';
    }
  });

  resetForm();
  await loadUnitHeading();
  await loadTopics();
})();
