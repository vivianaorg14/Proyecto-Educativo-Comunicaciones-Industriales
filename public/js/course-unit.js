(async () => {
  const supabase = await window.supabaseClientPromise;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login.html';
    return;
  }

  const unitId = new URLSearchParams(window.location.search).get('unitId');
  if (!unitId) {
    window.location.href = '/course.html';
    return;
  }

  const unitTitle = document.getElementById('unitTitle');
  const unitDescription = document.getElementById('unitDescription');
  const topicsContainer = document.getElementById('topicsContainer');

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function youtubeEmbedUrl(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');

      if (host === 'youtu.be') {
        return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`;
      }
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        if (parsed.pathname === '/watch') {
          const id = parsed.searchParams.get('v');
          return id ? `https://www.youtube.com/embed/${id}` : null;
        }
        if (parsed.pathname.startsWith('/embed/')) {
          return url;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  function renderVideo(video) {
    const embedUrl = youtubeEmbedUrl(video.url);
    if (embedUrl) {
      return `
        <div class="video-embed">
          <iframe src="${embedUrl}" title="${escapeHtml(video.title || 'Video')}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen></iframe>
        </div>
      `;
    }
    return `
      <ul class="video-link-list">
        <li><a href="${video.url}" target="_blank" rel="noopener">🎬 ${escapeHtml(video.title || 'Ver video')} ↗</a></li>
      </ul>
    `;
  }

  function renderTopic(topic) {
    const videosHtml = topic.videos.length
      ? topic.videos.map(renderVideo).join('')
      : '';

    const imagesHtml = topic.images.length
      ? `
        <p class="topic-subheading">Imágenes</p>
        <div class="image-gallery">
          ${topic.images.map((image) => `
            <a href="${image.url || '#'}" target="_blank" rel="noopener">
              <img src="${image.url || ''}" alt="${escapeHtml(image.title)}" loading="lazy" />
            </a>
          `).join('')}
        </div>
      `
      : '';

    const pdfsHtml = topic.pdfs.length
      ? `
        <p class="topic-subheading">Material en PDF</p>
        <ul class="pdf-download-list">
          ${topic.pdfs.map((pdf) => `
            <li><a href="${pdf.url || '#'}" target="_blank" rel="noopener">📄 ${escapeHtml(pdf.title)}</a></li>
          `).join('')}
        </ul>
      `
      : '';

    return `
      <article class="topic-card">
        <h3>${escapeHtml(topic.title)}</h3>
        <p>${escapeHtml(topic.description)}</p>
        ${videosHtml}
        ${imagesHtml}
        ${pdfsHtml}
      </article>
    `;
  }

  try {
    const res = await fetch(`/api/content/units/${unitId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      unitTitle.textContent = 'No se pudo cargar la unidad';
      topicsContainer.innerHTML = `<p class="empty-state">${escapeHtml(data.error || '')}</p>`;
      return;
    }

    unitTitle.textContent = data.unit.title;
    unitDescription.textContent = data.unit.description;

    if (!data.topics.length) {
      topicsContainer.innerHTML = '<p class="empty-state">Esta unidad todavía no tiene temas publicados.</p>';
      return;
    }

    topicsContainer.innerHTML = data.topics.map(renderTopic).join('');
  } catch (err) {
    unitTitle.textContent = 'No se pudo cargar la unidad';
    topicsContainer.innerHTML = '<p class="empty-state">Intenta de nuevo más tarde.</p>';
  }
})();
