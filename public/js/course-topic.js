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
  const topicId = params.get('topicId');
  const unitIndex = params.get('unitIndex') || '1';

  if (!unitId || !topicId) {
    window.location.href = '/course.html';
    return;
  }

  const breadcrumbBack = document.getElementById('breadcrumbBack');
  const breadcrumbUnitTitle = document.getElementById('breadcrumbUnitTitle');
  const topicEyebrow = document.getElementById('topicEyebrow');
  const topicTitle = document.getElementById('topicTitle');
  const topicBody = document.getElementById('topicBody');
  const topicVideos = document.getElementById('topicVideos');
  const topicImages = document.getElementById('topicImages');
  const attachmentsSection = document.getElementById('attachmentsSection');
  const attachmentsList = document.getElementById('attachmentsList');

  breadcrumbBack.href = `/course-unit.html?unitId=${unitId}&unitIndex=${unitIndex}`;

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const FILE_KINDS = {
    pdf: { label: 'PDF', className: 'attachment-icon--pdf' },
    zip: { label: 'ZIP', className: 'attachment-icon--zip' },
    doc: { label: 'DOC', className: 'attachment-icon--doc' },
    docx: { label: 'DOC', className: 'attachment-icon--doc' },
    xls: { label: 'XLS', className: 'attachment-icon--xls' },
    xlsx: { label: 'XLS', className: 'attachment-icon--xls' },
    ppt: { label: 'PPT', className: 'attachment-icon--ppt' },
    pptx: { label: 'PPT', className: 'attachment-icon--ppt' },
    txt: { label: 'TXT', className: 'attachment-icon--txt' },
  };

  function fileKind(ext) {
    return FILE_KINDS[ext] || { label: 'FILE', className: 'attachment-icon--file' };
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

  function renderBody(description) {
    const paragraphs = (description || '')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (!paragraphs.length) return '';
    return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  }

  function renderImage(image) {
    return `
      <figure class="topic-image-block">
        <a href="${image.url || '#'}" target="_blank" rel="noopener">
          <img src="${image.url || ''}" alt="${escapeHtml(image.title)}" loading="lazy" />
        </a>
        <figcaption>${escapeHtml(image.title)}</figcaption>
      </figure>
    `;
  }

  function renderAttachment(pdf) {
    const kind = fileKind(pdf.ext);
    const sizeLabel = formatBytes(pdf.size_bytes);
    return `
      <a class="attachment-row" href="${pdf.url || '#'}" target="_blank" rel="noopener">
        <span class="attachment-icon ${kind.className}">${kind.label}</span>
        <span class="attachment-info">
          <span class="attachment-name">${escapeHtml(pdf.title)}</span>
          ${sizeLabel ? `<span class="attachment-size">${sizeLabel}</span>` : ''}
        </span>
        <svg class="attachment-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3v12m0 0-4-4m4 4 4-4" />
          <path d="M4 19h16" />
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
      topicTitle.textContent = 'No se pudo cargar el tema';
      topicBody.innerHTML = `<p>${escapeHtml(data.error || '')}</p>`;
      return;
    }

    const topic = data.topics.find((t) => t.id === topicId);
    if (!topic) {
      topicTitle.textContent = 'Tema no encontrado';
      breadcrumbUnitTitle.textContent = data.unit.title;
      return;
    }

    breadcrumbUnitTitle.textContent = data.unit.title;
    topicTitle.textContent = topic.title;

    const eyebrowParts = [`Unidad ${String(unitIndex).padStart(2, '0')}`];
    if (topic.duration_minutes) eyebrowParts.push(`${topic.duration_minutes} min`);
    topicEyebrow.textContent = eyebrowParts.join(' · ');

    topicBody.innerHTML = renderBody(topic.description) || '<p>Sin descripción todavía.</p>';

    topicVideos.innerHTML = topic.videos.map(renderVideo).join('');
    topicImages.innerHTML = topic.images.map(renderImage).join('');

    if (topic.pdfs.length) {
      attachmentsSection.hidden = false;
      attachmentsList.innerHTML = topic.pdfs.map(renderAttachment).join('');
    }
  } catch (err) {
    topicTitle.textContent = 'No se pudo cargar el tema';
    topicBody.innerHTML = '<p>Intenta de nuevo más tarde.</p>';
  }
})();
