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

  const params = new URLSearchParams(window.location.search);
  const unitId = params.get('unitId');
  const topicId = params.get('topicId'); // null => crear tema nuevo

  if (!unitId) {
    window.location.href = '/admin-units.html';
    return;
  }

  const API_BASE = `/api/admin/units/${unitId}/topics`;
  const TEXT_TYPES = new Set(['heading', 'subheading', 'paragraph', 'bullet_list', 'numbered_list', 'callout']);

  const backLink = document.getElementById('backLink');
  const unitTitleCrumb = document.getElementById('unitTitleCrumb');
  const topicTitleCrumb = document.getElementById('topicTitleCrumb');
  const topicTitleInput = document.getElementById('topicTitleInput');
  const blocksList = document.getElementById('blocksList');
  const addBlockBtn = document.getElementById('addBlockBtn');
  const blockPalette = document.getElementById('blockPalette');
  const saveBtn = document.getElementById('saveBtn');
  const formMessage = document.getElementById('formMessage');

  backLink.href = `/admin-unit-topics.html?unitId=${unitId}`;

  let blocks = [];

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

  async function authHeaders() {
    const {
      data: { session: freshSession },
    } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${freshSession.access_token}` };
  }

  function showMessage(text, type) {
    formMessage.textContent = text;
    formMessage.className = `form-message ${type}`;
  }

  function createBlock(type) {
    return {
      type,
      text: '',
      caption: '',
      title: '',
      url: '',
      file: null,
      existingId: null,
      previewUrl: null,
      fileName: null,
      size_bytes: null,
    };
  }

  // ---------- Render ----------

  function renderImageBlockEditor(block, index) {
    const preview = block.previewUrl
      ? `<div class="block-image-preview"><img src="${block.previewUrl}" alt="" /></div>`
      : '';
    const triggerLabel = block.previewUrl ? 'Cambiar imagen' : 'Seleccionar imagen';

    return `
      <div class="block-image-editor">
        ${preview}
        <button type="button" class="block-file-picker" data-index="${index}">${triggerLabel}</button>
        <input type="file" accept="image/*" class="block-file-input" data-index="${index}" hidden />
        ${block.previewUrl
          ? `<input type="text" class="block-input" data-index="${index}" data-field="caption" placeholder="Leyenda de la imagen (opcional)" value="${escapeHtml(block.caption)}" />`
          : ''}
      </div>
    `;
  }

  function renderFileBlockEditor(block, index) {
    if (block.fileName) {
      const sizeLabel = formatBytes(block.size_bytes);
      return `
        <div class="block-file-editor">
          <div class="block-file-chip">
            <span class="block-file-chip-icon">📄</span>
            <span class="block-file-chip-name">${escapeHtml(block.fileName)}${sizeLabel ? ` · ${sizeLabel}` : ''}</span>
          </div>
          <input type="text" class="block-input" data-index="${index}" data-field="title" placeholder="Nombre a mostrar (opcional)" value="${escapeHtml(block.title)}" />
          <button type="button" class="block-file-picker" data-index="${index}">Cambiar archivo</button>
          <input type="file" accept=".pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" class="block-file-input" data-index="${index}" hidden />
        </div>
      `;
    }
    return `
      <div class="block-file-editor">
        <button type="button" class="block-file-picker" data-index="${index}">Seleccionar archivo</button>
        <input type="file" accept=".pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" class="block-file-input" data-index="${index}" hidden />
      </div>
    `;
  }

  function renderBlockEditor(block, index) {
    switch (block.type) {
      case 'heading':
        return `<input type="text" class="block-input block-input-heading" data-index="${index}" data-field="text" placeholder="Título" value="${escapeHtml(block.text)}" />`;
      case 'subheading':
        return `<input type="text" class="block-input block-input-subheading" data-index="${index}" data-field="text" placeholder="Subtítulo" value="${escapeHtml(block.text)}" />`;
      case 'paragraph':
        return `<textarea class="block-input block-textarea" data-index="${index}" data-field="text" placeholder="Escribe aquí el contenido del bloque...">${escapeHtml(block.text)}</textarea>`;
      case 'callout':
        return `<div class="block-callout-wrap"><textarea class="block-input block-textarea" data-index="${index}" data-field="text" placeholder="Texto destacado...">${escapeHtml(block.text)}</textarea></div>`;
      case 'bullet_list':
        return `<div class="block-list-row"><span class="block-list-marker">•</span><input type="text" class="block-input" data-index="${index}" data-field="text" placeholder="Punto de la lista" value="${escapeHtml(block.text)}" /></div>`;
      case 'numbered_list':
        return `<div class="block-list-row"><span class="block-list-marker">${block.__number || '1.'}</span><input type="text" class="block-input" data-index="${index}" data-field="text" placeholder="Punto de la lista" value="${escapeHtml(block.text)}" /></div>`;
      case 'divider':
        return `<hr class="block-divider-preview" />`;
      case 'video':
        return `
          <div class="block-video-fields">
            <input type="url" class="block-input" data-index="${index}" data-field="url" placeholder="https://youtube.com/..." value="${escapeHtml(block.url)}" />
            <input type="text" class="block-input" data-index="${index}" data-field="title" placeholder="Título del video (opcional)" value="${escapeHtml(block.title)}" />
          </div>
        `;
      case 'image':
        return renderImageBlockEditor(block, index);
      case 'file':
        return renderFileBlockEditor(block, index);
      default:
        return '';
    }
  }

  const BLOCK_TYPE_LABELS = {
    heading: 'Título', subheading: 'Subtítulo', paragraph: 'Texto',
    bullet_list: 'Viñeta', numbered_list: 'Numerada', callout: 'Destacado',
    divider: 'Separador', image: 'Imagen', file: 'Archivo', video: 'Video',
  };

  function renderBlocksList() {
    if (!blocks.length) {
      blocksList.innerHTML = '<p class="block-empty-hint">Todavía no hay bloques. Agrega el primero abajo.</p>';
      return;
    }

    let numberedCounter = 0;
    blocksList.innerHTML = blocks.map((block, index) => {
      numberedCounter = block.type === 'numbered_list' ? numberedCounter + 1 : 0;
      block.__number = `${numberedCounter}.`;

      return `
        <div class="block-item" data-block-type="${block.type}">
          <div class="block-item-head">
            <span class="block-item-tag">${BLOCK_TYPE_LABELS[block.type] || block.type}</span>
            <button type="button" class="block-delete-btn" data-index="${index}" title="Eliminar bloque">×</button>
          </div>
          ${renderBlockEditor(block, index)}
        </div>
      `;
    }).join('');
  }

  // ---------- Eventos (delegados en #blocksList, no se re-atan en cada render) ----------

  blocksList.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.block-delete-btn');
    if (deleteBtn) {
      blocks.splice(Number(deleteBtn.dataset.index), 1);
      renderBlocksList();
      return;
    }
    const picker = e.target.closest('.block-file-picker');
    if (picker) {
      blocksList.querySelector(`.block-file-input[data-index="${picker.dataset.index}"]`)?.click();
    }
  });

  blocksList.addEventListener('change', (e) => {
    if (!e.target.matches('.block-file-input')) return;
    const index = Number(e.target.dataset.index);
    const file = e.target.files[0];
    if (!file) return;

    const block = blocks[index];
    block.file = file;
    block.existingId = null;

    if (block.type === 'image') {
      block.previewUrl = URL.createObjectURL(file);
    } else {
      block.fileName = file.name;
      block.size_bytes = file.size;
    }
    renderBlocksList();
  });

  blocksList.addEventListener('input', (e) => {
    if (!e.target.matches('[data-field]')) return;
    const index = Number(e.target.dataset.index);
    const field = e.target.dataset.field;
    blocks[index][field] = e.target.value;
  });

  const LIST_TYPES = new Set(['bullet_list', 'numbered_list']);

  function focusBlockInput(index) {
    requestAnimationFrame(() => {
      const item = blocksList.querySelectorAll('.block-item')[index];
      const input = item?.querySelector('input, textarea, .block-file-picker');
      if (!input) return;
      input.focus();
      if (input.setSelectionRange && typeof input.value === 'string') {
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
  }

  // Enter dentro de una viñeta/numerada crea el siguiente bloque del mismo
  // tipo automáticamente (como en Notion); Enter con la línea vacía sale de
  // la lista en vez de crear una viñeta vacía.
  blocksList.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const input = e.target.closest('[data-field="text"]');
    if (!input || input.tagName !== 'INPUT') return;

    const index = Number(input.dataset.index);
    const block = blocks[index];
    if (!block || !LIST_TYPES.has(block.type)) return;

    e.preventDefault();

    if (!block.text.trim()) {
      blocks.splice(index, 1);
      renderBlocksList();
      focusBlockInput(Math.max(0, index - 1));
      return;
    }

    blocks.splice(index + 1, 0, createBlock(block.type));
    renderBlocksList();
    focusBlockInput(index + 1);
  });

  // Pegar texto con varias líneas dentro de una viñeta/numerada reparte cada
  // línea en su propio bloque (quitando el "•", "-" o "1." si ya venían).
  blocksList.addEventListener('paste', (e) => {
    const input = e.target;
    if (!(input.matches?.('[data-field="text"]') && input.tagName === 'INPUT')) return;

    const index = Number(input.dataset.index);
    const block = blocks[index];
    if (!block || !LIST_TYPES.has(block.type)) return;

    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    if (!pasted || !pasted.includes('\n')) return; // una sola línea: comportamiento normal

    e.preventDefault();

    const lines = pasted
      .split(/\r\n|\r|\n/)
      .map((line) => line.replace(/^\s*[•\-*–]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean);

    if (!lines.length) return;

    block.text = lines[0];
    const newBlocks = lines.slice(1).map((text) => {
      const b = createBlock(block.type);
      b.text = text;
      return b;
    });
    blocks.splice(index + 1, 0, ...newBlocks);

    renderBlocksList();
    focusBlockInput(index + newBlocks.length);
  });

  // ---------- Agregar bloque ----------

  addBlockBtn.addEventListener('click', () => {
    blockPalette.hidden = !blockPalette.hidden;
  });

  blockPalette.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-type]');
    if (!btn) return;
    blocks.push(createBlock(btn.dataset.type));
    blockPalette.hidden = true;
    renderBlocksList();

    requestAnimationFrame(() => {
      const items = blocksList.querySelectorAll('.block-item');
      const last = items[items.length - 1];
      if (!last) return;
      last.scrollIntoView({ behavior: 'smooth', block: 'center' });
      last.querySelector('input, textarea, .block-file-picker')?.focus();
    });
  });

  document.addEventListener('click', (e) => {
    if (!blockPalette.hidden && !e.target.closest('.add-block-wrap')) {
      blockPalette.hidden = true;
    }
  });

  // ---------- Cargar / Guardar ----------

  async function loadUnitCrumb() {
    const res = await fetch(`/api/admin/units/${unitId}`, { headers: await authHeaders() });
    const data = await res.json();
    if (res.ok) unitTitleCrumb.textContent = data.unit.title;
  }

  async function loadExisting() {
    const res = await fetch(`${API_BASE}/${topicId}`, { headers: await authHeaders() });
    const data = await res.json();
    if (!res.ok) {
      showMessage(data.error || 'No se pudo cargar el tema', 'error');
      return;
    }

    topicTitleInput.value = data.topic.title;
    topicTitleCrumb.textContent = data.topic.title;

    blocks = data.topic.blocks.map((b) => {
      const block = createBlock(b.type);
      block.existingId = b.id;
      if (b.type === 'image') {
        block.caption = b.caption;
        block.previewUrl = b.url;
      } else if (b.type === 'file') {
        block.title = b.title;
        block.fileName = b.title;
        block.size_bytes = b.size_bytes;
      } else if (b.type === 'video') {
        block.url = b.url;
        block.title = b.title;
      } else {
        block.text = b.text;
      }
      return block;
    });

    renderBlocksList();
  }

  saveBtn.addEventListener('click', async () => {
    const title = topicTitleInput.value.trim();
    if (!title) {
      showMessage('El título es obligatorio', 'error');
      topicTitleInput.focus();
      return;
    }

    const blockImages = [];
    const blockFiles = [];
    const blocksPayload = [];

    for (const block of blocks) {
      if (TEXT_TYPES.has(block.type)) {
        if (!block.text.trim()) continue;
        blocksPayload.push({ type: block.type, text: block.text.trim() });
        continue;
      }
      if (block.type === 'divider') {
        blocksPayload.push({ type: 'divider' });
        continue;
      }
      if (block.type === 'video') {
        if (!block.url.trim()) continue;
        blocksPayload.push({ type: 'video', url: block.url.trim(), title: block.title.trim() });
        continue;
      }
      if (block.type === 'image') {
        if (block.file) {
          const fileIndex = blockImages.push(block.file) - 1;
          blocksPayload.push({ type: 'image', fileIndex, caption: block.caption.trim() });
        } else if (block.existingId) {
          blocksPayload.push({ type: 'image', existingId: block.existingId, caption: block.caption.trim() });
        }
        continue;
      }
      if (block.type === 'file') {
        if (block.file) {
          const fileIndex = blockFiles.push(block.file) - 1;
          blocksPayload.push({ type: 'file', fileIndex, title: block.title.trim() });
        } else if (block.existingId) {
          blocksPayload.push({ type: 'file', existingId: block.existingId, title: block.title.trim() });
        }
        continue;
      }
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('blocks', JSON.stringify(blocksPayload));
    blockImages.forEach((f) => formData.append('blockImages', f));
    blockFiles.forEach((f) => formData.append('blockFiles', f));

    const url = topicId ? `${API_BASE}/${topicId}` : API_BASE;
    const method = topicId ? 'PUT' : 'POST';

    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    try {
      const res = await fetch(url, { method, headers: await authHeaders(), body: formData });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ocurrió un error al guardar el tema');
      }
      window.location.href = `/admin-unit-topics.html?unitId=${unitId}`;
    } catch (err) {
      showMessage(err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
    }
  });

  await loadUnitCrumb();
  if (topicId) {
    await loadExisting();
  } else {
    renderBlocksList();
  }
})();
