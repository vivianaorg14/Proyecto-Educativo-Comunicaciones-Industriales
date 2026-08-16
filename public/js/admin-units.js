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

  const API_BASE = '/api/admin/units';

  const form = document.getElementById('unitForm');
  const unitIdInput = document.getElementById('unitId');
  const titleInput = document.getElementById('title');
  const descriptionInput = document.getElementById('description');
  const submitBtn = document.getElementById('submitBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const formTitle = document.getElementById('formTitle');
  const formSubtitle = document.getElementById('formSubtitle');
  const formMessage = document.getElementById('formMessage');
  const unitsList = document.getElementById('unitsList');

  let units = [];

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

  function resetForm() {
    unitIdInput.value = '';
    form.reset();
    formTitle.textContent = 'Nueva unidad';
    formSubtitle.textContent = 'Título y descripción de la unidad general.';
    submitBtn.textContent = 'Crear unidad';
    cancelEditBtn.style.display = 'none';
  }

  function fillFormForEdit(unit) {
    unitIdInput.value = unit.id;
    titleInput.value = unit.title;
    descriptionInput.value = unit.description;
    formTitle.textContent = 'Editar unidad';
    formSubtitle.textContent = `Editando "${unit.title}"`;
    submitBtn.textContent = 'Guardar cambios';
    cancelEditBtn.style.display = 'inline-flex';
    formMessage.className = 'form-message';
    formMessage.textContent = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderUnitsList() {
    if (!units.length) {
      unitsList.innerHTML = '<p class="empty-state">Todavía no hay unidades. Crea la primera con el formulario.</p>';
      return;
    }

    unitsList.innerHTML = units.map((unit) => `
      <article class="unit-manage-card" data-id="${unit.id}">
        <h3>${escapeHtml(unit.title)}</h3>
        <p>${escapeHtml(unit.description)}</p>
        <div class="unit-meta">
          <span>📂 ${unit.topics_count} tema(s)</span>
        </div>
        <div class="unit-manage-actions">
          <a class="btn btn-solid" href="/admin-unit-topics.html?unitId=${unit.id}">Gestionar temas y quizzes →</a>
          <button type="button" class="btn btn-ghost" data-action="edit">Editar</button>
          <button type="button" class="btn btn-ghost" data-action="delete">Eliminar</button>
        </div>
      </article>
    `).join('');

    unitsList.querySelectorAll('.unit-manage-card').forEach((card) => {
      const unitId = card.dataset.id;
      card.querySelector('[data-action="edit"]').addEventListener('click', () => {
        const unit = units.find((u) => u.id === unitId);
        if (unit) fillFormForEdit(unit);
      });
      card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteUnit(unitId));
    });
  }

  async function loadUnits() {
    const res = await fetch(API_BASE, { headers: await authHeaders() });
    const data = await res.json();
    if (!res.ok) {
      unitsList.innerHTML = `<p class="empty-state">${escapeHtml(data.error || 'No se pudieron cargar las unidades')}</p>`;
      return;
    }
    units = data.units;
    renderUnitsList();
  }

  async function deleteUnit(unitId) {
    if (!confirm('¿Eliminar esta unidad y todos sus temas, videos y PDFs? Esta acción no se puede deshacer.')) return;
    const res = await fetch(`${API_BASE}/${unitId}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'No se pudo eliminar la unidad');
      return;
    }
    if (unitIdInput.value === unitId) resetForm();
    await loadUnits();
  }

  cancelEditBtn.addEventListener('click', () => {
    resetForm();
    formMessage.className = 'form-message';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const editingId = unitIdInput.value;
    const url = editingId ? `${API_BASE}/${editingId}` : API_BASE;
    const method = editingId ? 'PUT' : 'POST';

    submitBtn.disabled = true;
    submitBtn.textContent = editingId ? 'Guardando...' : 'Creando...';

    try {
      const res = await fetch(url, {
        method,
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleInput.value.trim(),
          description: descriptionInput.value.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ocurrió un error al guardar la unidad');
      }

      showFormMessage(data.message, 'success');
      resetForm();
      await loadUnits();
    } catch (err) {
      showFormMessage(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editingId ? 'Guardar cambios' : 'Crear unidad';
    }
  });

  resetForm();
  await loadUnits();

  const editId = new URLSearchParams(window.location.search).get('edit');
  if (editId) {
    const unit = units.find((u) => u.id === editId);
    if (unit) fillFormForEdit(unit);
  }
})();
