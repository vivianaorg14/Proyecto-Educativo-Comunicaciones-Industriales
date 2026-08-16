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
  const topicContent = document.getElementById('topicContent');

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

  function renderVideoBlock(block) {
    const embedUrl = youtubeEmbedUrl(block.url);
    if (embedUrl) {
      return `
        <div class="video-embed">
          <iframe src="${embedUrl}" title="${escapeHtml(block.title || 'Video')}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen></iframe>
        </div>
      `;
    }
    return `
      <ul class="video-link-list">
        <li><a href="${block.url}" target="_blank" rel="noopener">🎬 ${escapeHtml(block.title || 'Ver video')} ↗</a></li>
      </ul>
    `;
  }

  function renderImageBlock(block) {
    return `
      <figure class="topic-image-block">
        <a href="${block.url || '#'}" target="_blank" rel="noopener">
          <img src="${block.url || ''}" alt="${escapeHtml(block.caption)}" loading="lazy" />
        </a>
        ${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}
      </figure>
    `;
  }

  function renderFileBlock(block) {
    const kind = fileKind(block.ext);
    const sizeLabel = formatBytes(block.size_bytes);
    return `
      <a class="attachment-row" href="${block.url || '#'}" target="_blank" rel="noopener">
        <span class="attachment-icon ${kind.className}">${kind.label}</span>
        <span class="attachment-info">
          <span class="attachment-name">${escapeHtml(block.title)}</span>
          ${sizeLabel ? `<span class="attachment-size">${sizeLabel}</span>` : ''}
        </span>
        <svg class="attachment-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3v12m0 0-4-4m4 4 4-4" />
          <path d="M4 19h16" />
        </svg>
      </a>
    `;
  }

  function renderBlocks(blocks) {
    let html = '';
    let listBuffer = [];
    let listType = null;

    function flushList() {
      if (!listBuffer.length) return;
      const tag = listType === 'numbered_list' ? 'ol' : 'ul';
      html += `<${tag} class="topic-list-block">${listBuffer.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</${tag}>`;
      listBuffer = [];
      listType = null;
    }

    blocks.forEach((block) => {
      if (block.type === 'bullet_list' || block.type === 'numbered_list') {
        if (listType && listType !== block.type) flushList();
        listType = block.type;
        listBuffer.push(block.text);
        return;
      }

      flushList();

      switch (block.type) {
        case 'heading':
          html += `<h2>${escapeHtml(block.text)}</h2>`;
          break;
        case 'subheading':
          html += `<h3>${escapeHtml(block.text)}</h3>`;
          break;
        case 'paragraph':
          html += `<p>${escapeHtml(block.text)}</p>`;
          break;
        case 'callout':
          html += `<div class="callout-block">${escapeHtml(block.text)}</div>`;
          break;
        case 'divider':
          html += `<hr class="topic-divider" />`;
          break;
        case 'image':
          html += renderImageBlock(block);
          break;
        case 'file':
          html += renderFileBlock(block);
          break;
        case 'video':
          html += renderVideoBlock(block);
          break;
      }
    });

    flushList();
    return html;
  }

  try {
    const res = await fetch(`/api/content/units/${unitId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      topicTitle.textContent = 'No se pudo cargar el tema';
      topicContent.innerHTML = `<p>${escapeHtml(data.error || '')}</p>`;
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
    topicEyebrow.textContent = `Unidad ${String(unitIndex).padStart(2, '0')}`;

    topicContent.innerHTML = topic.blocks.length
      ? renderBlocks(topic.blocks)
      : '<p class="empty-state">Este tema todavía no tiene contenido.</p>';
  } catch (err) {
    topicTitle.textContent = 'No se pudo cargar el tema';
    topicContent.innerHTML = '<p>Intenta de nuevo más tarde.</p>';
  }
})();
