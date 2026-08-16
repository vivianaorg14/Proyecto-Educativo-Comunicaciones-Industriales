(async () => {
  const supabase = await window.supabaseClientPromise;
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login.html';
    return;
  }

  const user = session.user;

  if (user.app_metadata?.role === 'admin') {
    window.location.href = '/admin-dashboard.html';
    return;
  }

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

  const initials = getInitials(displayName);

  document.getElementById('userAvatar').textContent = initials;
  document.getElementById('userName').textContent = displayName;
  document.getElementById('userEmail').textContent = user.email;

  document.getElementById('welcomeEyebrow').textContent = 'Bienvenido de vuelta';
  document.getElementById('welcomeName').textContent = displayName;
  document.getElementById('welcomeSub').textContent = 'Comunicaciones Industriales · Ingeniería Electromecánica';

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
  });

  const unitsGrid = document.getElementById('unitsGrid');

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

    unitsGrid.innerHTML = data.units.map((unit, index) => `
      <a class="unit-dash-card" href="/course-unit.html?unitId=${unit.id}">
        <div class="unit-dash-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3 3 8l9 5 9-5-9-5z" />
            <path d="M3 12l9 5 9-5M3 16l9 5 9-5" />
          </svg>
        </div>
        <div class="unit-dash-label">Unidad ${index + 1}</div>
        <h3>${escapeHtml(unit.title)}</h3>
        <p>${escapeHtml(unit.description)}</p>
        <span class="unit-dash-meta">${unit.topics_count} tema(s) →</span>
      </a>
    `).join('');
  } catch (err) {
    unitsGrid.innerHTML = '<p class="empty-state">No se pudo cargar el contenido. Intenta de nuevo.</p>';
  }
})();
