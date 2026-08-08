(async () => {
  const supabase = await window.supabaseClientPromise;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login.html';
    return;
  }

  const unitsGrid = document.getElementById('unitsGrid');

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  try {
    const res = await fetch('/api/content/units', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      unitsGrid.innerHTML = `<p class="empty-state">${escapeHtml(data.error || 'No se pudo cargar el contenido')}</p>`;
      return;
    }

    if (!data.units.length) {
      unitsGrid.innerHTML = '<p class="empty-state">Todavía no hay unidades publicadas.</p>';
      return;
    }

    unitsGrid.innerHTML = data.units.map((unit) => `
      <a class="unit-browse-card" href="/course-unit.html?unitId=${unit.id}">
        <h3>${escapeHtml(unit.title)}</h3>
        <p>${escapeHtml(unit.description)}</p>
        <span class="unit-meta">${unit.topics_count} tema(s)</span>
      </a>
    `).join('');
  } catch (err) {
    unitsGrid.innerHTML = '<p class="empty-state">No se pudo cargar el contenido. Intenta de nuevo.</p>';
  }
})();
