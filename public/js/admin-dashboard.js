(async () => {
  const supabase = await window.supabaseClientPromise;
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login.html';
    return;
  }

  if (session.user.app_metadata?.role !== 'admin') {
    window.location.href = '/dashboard.html';
    return;
  }

  const user = session.user;
  const fullName = user.user_metadata?.full_name?.trim();
  const displayName = fullName || user.email.split('@')[0];

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function getInitials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '--';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  document.getElementById('userAvatar').textContent = getInitials(displayName);
  document.getElementById('userName').textContent = displayName;
  document.getElementById('userEmail').textContent = user.email;

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
  });

  async function authHeaders() {
    const { data: { session: freshSession } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${freshSession.access_token}` };
  }

  const adminUnitsList = document.getElementById('adminUnitsList');
  const openUnitIds = new Set();

  function resourceCount(topic) {
    return (topic.videos?.length || 0) + (topic.pdfs?.length || 0) + (topic.images?.length || 0);
  }

  function renderTopicRow(unitId, topic) {
    const parts = [];
    if (topic.videos?.length) parts.push(`${topic.videos.length} video(s)`);
    if (topic.pdfs?.length) parts.push(`${topic.pdfs.length} PDF(s)`);
    if (topic.images?.length) parts.push(`${topic.images.length} imagen(es)`);
    return `
      <a class="admin-topic-row" href="/admin-unit-topics.html?unitId=${unitId}">
        <span class="admin-topic-title">${escapeHtml(topic.title)}</span>
        <span class="admin-topic-meta">${parts.join(' · ') || 'Sin contenido'}</span>
      </a>
    `;
  }

  function renderUnitRow(unit, index) {
    const isOpen = openUnitIds.has(unit.id);
    const topicsHtml = unit.topics.length
      ? unit.topics.map((t) => renderTopicRow(unit.id, t)).join('')
      : '<p class="admin-topic-meta" style="padding: 8px 0;">Sin temas todavía.</p>';

    return `
      <article class="admin-unit-row ${isOpen ? 'is-open' : ''}" data-id="${unit.id}">
        <button type="button" class="admin-unit-summary" data-action="toggle">
          <span class="admin-unit-index">${index + 1}</span>
          <span class="admin-unit-info">
            <span class="admin-unit-title">${escapeHtml(unit.title)}</span>
            <span class="admin-unit-meta">${unit.topics.length} tema(s)</span>
          </span>
          <span class="admin-unit-actions">
            <span class="icon-btn" data-action="edit" title="Editar unidad">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </span>
            <span class="icon-btn icon-btn-danger" data-action="delete" title="Eliminar unidad">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16z" />
              </svg>
            </span>
            <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </button>
        <div class="admin-unit-topics">
          ${topicsHtml}
          <a class="admin-add-topic" href="/admin-unit-topics.html?unitId=${unit.id}">+ Agregar tema</a>
        </div>
      </article>
    `;
  }

  function renderList(units) {
    if (!units.length) {
      adminUnitsList.innerHTML = '<p class="empty-state">Todavía no hay unidades. Crea la primera con "+ Nueva unidad".</p>';
      return;
    }

    adminUnitsList.innerHTML = units.map((u, i) => renderUnitRow(u, i)).join('');

    adminUnitsList.querySelectorAll('.admin-unit-row').forEach((row) => {
      const unitId = row.dataset.id;

      row.querySelector('[data-action="toggle"]').addEventListener('click', (e) => {
        if (e.target.closest('[data-action="edit"]') || e.target.closest('[data-action="delete"]')) return;
        if (openUnitIds.has(unitId)) {
          openUnitIds.delete(unitId);
        } else {
          openUnitIds.add(unitId);
        }
        row.classList.toggle('is-open');
      });

      row.querySelector('[data-action="edit"]').addEventListener('click', () => {
        window.location.href = `/admin-units.html?edit=${unitId}`;
      });

      row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteUnit(unitId));
    });
  }

  async function deleteUnit(unitId) {
    if (!confirm('¿Eliminar esta unidad y todos sus temas, videos y PDFs? Esta acción no se puede deshacer.')) return;
    const res = await fetch(`/api/admin/units/${unitId}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'No se pudo eliminar la unidad');
      return;
    }
    openUnitIds.delete(unitId);
    await loadAll();
  }

  async function loadAll() {
    try {
      const headers = await authHeaders();

      const [unitsRes, usersRes] = await Promise.all([
        fetch('/api/admin/units', { headers }),
        fetch('/api/admin/users', { headers }),
      ]);
      const unitsData = await unitsRes.json();
      const usersData = await usersRes.json();

      if (!unitsRes.ok) {
        adminUnitsList.innerHTML = `<p class="empty-state">${escapeHtml(unitsData.error || 'No se pudieron cargar las unidades')}</p>`;
        return;
      }

      const units = await Promise.all(
        unitsData.units.map(async (unit) => {
          const topicsRes = await fetch(`/api/admin/units/${unit.id}/topics`, { headers });
          const topicsData = await topicsRes.json();
          return { ...unit, topics: topicsRes.ok ? topicsData.topics : [] };
        })
      );

      const totalTopics = units.reduce((sum, u) => sum + u.topics.length, 0);
      const totalResources = units.reduce(
        (sum, u) => sum + u.topics.reduce((tSum, t) => tSum + resourceCount(t), 0),
        0
      );
      const studentsCount = usersRes.ok
        ? usersData.users.filter((u) => u.role !== 'admin').length
        : '–';

      document.getElementById('statUnits').textContent = units.length;
      document.getElementById('statTopics').textContent = totalTopics;
      document.getElementById('statStudents').textContent = studentsCount;
      document.getElementById('statResources').textContent = totalResources;

      renderList(units);
    } catch (err) {
      adminUnitsList.innerHTML = '<p class="empty-state">No se pudo cargar la información. Intenta de nuevo.</p>';
    }
  }

  await loadAll();
})();
