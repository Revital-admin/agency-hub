/* ============================================================
   MOOD BOARD BUILDER — APP LOGIC
   Per-client, own client-select dropdown (same pattern as Brand
   Asset Kit) rather than the global "active client" - lets you jump
   between clients' mood boards without switching what's active
   elsewhere in the Hub. Data lives at clients[name].moodBoards, an
   array of board objects, saved through the parent Hub's own
   clientsDb + saveDatabase() (same mechanism as Brand Asset Kit).
   Boards marked "shared with client" render in their Portal.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.getAllClients === 'function') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const SANDBOX_NAME = "Quick Sandbox (One-Offs)";

function el(id) { return document.getElementById(id); }

function getClients() {
  if (isEmbedded) {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  return {};
}

function persist() {
  if (isEmbedded) window.parent.saveDatabase();
}

function populateClientSelect() {
  const clients = getClients();
  const select = el('clientSelect');
  const prevValue = select.value;
  select.innerHTML = '<option value="">Select a client...</option>';
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  if (prevValue && clients[prevValue]) select.value = prevValue;
}

let editingBoardId = null;
let draftEmbedLinks = [];

// Fixed set of style axes so boards are comparable to each other over time
// (a client's taste pattern only becomes visible if every board is scored
// on the same scale) - see also STYLE_AXES-equivalent duplicated in the
// Portal's app.js for read-only rendering there.
const STYLE_AXES = [
  { key: 'traditionalModern', left: 'Traditional', right: 'Modern', id: 'mbScaleTraditionalModern' },
  { key: 'minimalBold', left: 'Minimal', right: 'Bold', id: 'mbScaleMinimalBold' },
  { key: 'mutedVibrant', left: 'Muted', right: 'Vibrant', id: 'mbScaleMutedVibrant' },
  { key: 'playfulSerious', left: 'Playful', right: 'Serious', id: 'mbScalePlayfulSerious' }
];

function uid() { return 'mb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function currentClientName() { return el('clientSelect').value; }

function currentClient() {
  const name = currentClientName();
  if (!name) return null;
  const clients = getClients();
  return clients[name] || null;
}

function resetForm() {
  editingBoardId = null;
  draftEmbedLinks = [];
  el('mbTitle').value = '';
  el('mbCategory').value = 'Website Design';
  el('mbIdeaSummary').value = '';
  el('mbVisualDirection').value = '';
  el('mbKeyElements').value = '';
  STYLE_AXES.forEach(axis => { el(axis.id).value = 50; });
  el('mbOverallRating').value = 5;
  el('mbOverallRatingValue').textContent = '5/10';
  el('mbShared').checked = false;
  el('embedLabel').value = '';
  el('embedUrl').value = '';
  renderEmbedLinksList();
  el('formTitle').textContent = 'New Mood Board';
  el('saveBoardBtn').textContent = 'Save Mood Board';
  el('cancelEditBtn').style.display = 'none';
}

function addDraftEmbedLink() {
  const label = el('embedLabel').value.trim();
  const url = el('embedUrl').value.trim();
  if (!url) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Enter a URL for this reference link.');
    return;
  }
  draftEmbedLinks.push({ id: uid(), label: label || url, url });
  el('embedLabel').value = '';
  el('embedUrl').value = '';
  renderEmbedLinksList();
}

let imageDropCounter = 0;

// Dropping/uploading an image adds it straight to the reference list as
// a thumbnail - no need to also fill in the label/URL fields and click
// "+ Add Link" separately. Stored as a compressed data URL (see
// shared-dropzone.js) so it lives inline in the client doc, same as
// Client Portal Manager's logo.
function handleDroppedImage(file) {
  // 1400px (bumped from 800px): the Client Portal now opens these in a
  // near-full-screen lightbox rather than only ever showing a 36px chip,
  // so the old cap looked visibly soft once zoomed. Still compressed/
  // capped, not the original file - the size warning below accounts for
  // the larger resulting size on its own, no extra wiring needed.
  processImageFile(file, { maxWidth: 1400 }).then(dataUrl => {
    imageDropCounter++;
    const label = (file.name || `Image ${imageDropCounter}`).replace(/\.[^.]+$/, '');
    draftEmbedLinks.push({ id: uid(), label, url: dataUrl, isImage: true });
    renderEmbedLinksList();
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('success', `Added "${label}" as a reference image.`);
  }).catch(errMsg => {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', errMsg);
  });
}

function removeDraftEmbedLink(id) {
  draftEmbedLinks = draftEmbedLinks.filter(l => l.id !== id);
  renderEmbedLinksList();
}

function isImageEntry(l) {
  return l.isImage || (l.url || '').startsWith('data:image');
}

// Images and plain URL references share one underlying draftEmbedLinks
// array (and the same saved board.embedLinks field) so existing boards
// saved before this split still load exactly as they were - only the
// rendering is split into two visual groups now, filtered from the
// same list by isImageEntry().
function renderEmbedLinksList() {
  renderImageGrid();
  renderLinksList();
  renderClientSizeWarning();
}

// Images are stored inline as base64 data URLs in the client's Firestore
// doc (see shared-dropzone.js), and the whole clientsDb gets rewritten on
// every save - so a board that quietly accumulates a lot of full-size
// images is a real cost, not just a UI concern. Rough estimate only
// (base64 runs ~4/3 the size of the original bytes); good enough for a
// heads-up, not meant to be exact.
const IMAGE_COUNT_WARNING_THRESHOLD = 8;
const IMAGE_SIZE_WARNING_BYTES = 2 * 1024 * 1024; // ~2MB of base64 across one board

function estimateDataUrlBytes(dataUrl) {
  const commaIdx = (dataUrl || '').indexOf(',');
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : (dataUrl || '');
  return Math.round(b64.length * 0.75);
}

// The per-board warning above catches one board getting heavy, but not
// several boards each just under that limit stacking up on the same
// client. That matters because clientsDb's Firestore sharding
// (packClientsDbIntoShards in app.js) bin-packs whole clients into
// ~700KB shards - it can split the database across clients, but it
// can't split one client's own record across two shards. If a single
// client's total data (all their tools, not just mood boards) gets
// close to Firestore's real ~1MB per-document limit, a save for that
// client can fail outright, not just look bloated. This estimates that
// total the same way packClientsDbIntoShards does (Blob byte size of
// the JSON), swapping in the current in-progress draft for whichever
// board is being edited so the estimate reflects what Save would
// actually write.
const CLIENT_SIZE_WARNING_BYTES = 500 * 1024;
const CLIENT_SIZE_CRITICAL_BYTES = 850 * 1024;

function estimateClientTotalBytes() {
  const client = currentClient();
  if (!client) return 0;

  const clone = Object.assign({}, client);
  if (Array.isArray(clone.moodBoards)) {
    clone.moodBoards = clone.moodBoards.filter(b => b.id !== editingBoardId);
  }
  const draftBoard = {
    id: editingBoardId || 'draft',
    title: el('mbTitle') ? el('mbTitle').value : '',
    category: el('mbCategory') ? el('mbCategory').value : '',
    ideaSummary: el('mbIdeaSummary') ? el('mbIdeaSummary').value : '',
    visualDirection: el('mbVisualDirection') ? el('mbVisualDirection').value : '',
    keyElements: el('mbKeyElements') ? el('mbKeyElements').value : '',
    embedLinks: draftEmbedLinks
  };
  clone.moodBoards = (clone.moodBoards || []).concat([draftBoard]);

  try {
    return new Blob([JSON.stringify(clone)]).size;
  } catch (e) {
    return 0;
  }
}

function renderClientSizeWarning() {
  const el2 = el('clientSizeWarning');
  if (!el2) return;
  const totalBytes = estimateClientTotalBytes();

  if (totalBytes >= CLIENT_SIZE_CRITICAL_BYTES) {
    const mb = (totalBytes / (1024 * 1024)).toFixed(2);
    el2.textContent = `This client's total record is ~${mb}MB, close to Firestore's ~1MB-per-document limit. The next save for this client risks failing outright - remove some images before adding more.`;
    el2.className = 'mb-client-size-warning mb-client-size-critical';
    el2.style.display = 'block';
  } else if (totalBytes >= CLIENT_SIZE_WARNING_BYTES) {
    const kb = Math.round(totalBytes / 1024);
    el2.textContent = `This client's total record is ~${kb}KB across all their mood boards and other tools. Getting large - worth trimming older/unused reference images.`;
    el2.className = 'mb-client-size-warning';
    el2.style.display = 'block';
  } else {
    el2.style.display = 'none';
  }
}

function renderImageGrid() {
  const grid = el('imageGrid');
  const empty = el('imageGridEmptyState');
  const warningEl = el('imageGridWarning');
  const images = draftEmbedLinks.filter(isImageEntry);

  if (images.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    if (warningEl) warningEl.style.display = 'none';
    return;
  }
  empty.style.display = 'none';

  if (warningEl) {
    const totalBytes = images.reduce((sum, l) => sum + estimateDataUrlBytes(l.url), 0);
    if (images.length >= IMAGE_COUNT_WARNING_THRESHOLD || totalBytes >= IMAGE_SIZE_WARNING_BYTES) {
      const mb = (totalBytes / (1024 * 1024)).toFixed(1);
      warningEl.textContent = `This board has ${images.length} images (~${mb}MB) stored directly in the client's record. Consider trimming to the strongest references.`;
      warningEl.style.display = 'block';
    } else {
      warningEl.style.display = 'none';
    }
  }

  grid.innerHTML = images.map((l, idx) => `
    <div class="mb-image-tile${idx === 0 ? ' mb-image-tile-lead' : ''}" draggable="true" data-id="${l.id}">
      <img src="${l.url}" alt="${escapeHtml(l.label)}">
      ${idx === 0 ? '<span class="mb-image-lead-badge">Lead</span>' : ''}
      <button data-id="${l.id}" class="mb-image-remove-btn" aria-label="Remove image" title="Remove">✕</button>
      <input type="text" class="mb-image-caption-input" data-id="${l.id}" value="${escapeHtml(l.label)}" placeholder="Add a caption..." aria-label="Image caption">
    </div>
  `).join('');
  grid.querySelectorAll('.mb-image-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => removeDraftEmbedLink(btn.getAttribute('data-id')));
  });
  grid.querySelectorAll('.mb-image-caption-input').forEach(input => {
    input.addEventListener('input', () => {
      const entry = draftEmbedLinks.find(l => l.id === input.getAttribute('data-id'));
      if (entry) entry.label = input.value;
    });
  });
  wireImageReordering(grid);
}

// Drag-to-reorder, desktop only (native HTML5 drag-and-drop - this is the
// internal admin tool, used at a desk, not the client-facing Portal, so
// skipping touch support is an acceptable tradeoff). Reorders just the
// image entries within draftEmbedLinks and leaves URL link entries where
// they are; renderLinksList() filters those out anyway so their position
// in the combined array doesn't matter. The new order is what gets saved
// to board.embedLinks, so it's also what the Client Portal grid shows -
// first image here becomes the "Lead" image there too.
let draggedImageId = null;

function wireImageReordering(grid) {
  const tiles = grid.querySelectorAll('.mb-image-tile');
  tiles.forEach(tile => {
    tile.addEventListener('dragstart', (e) => {
      // Without this check, clicking into the caption input to select
      // text (or clicking the remove button) can get hijacked by the
      // tile's own draggable="true" instead of behaving like a normal
      // text field / button click.
      if (e.target.classList.contains('mb-image-caption-input') || e.target.classList.contains('mb-image-remove-btn')) {
        e.preventDefault();
        return;
      }
      draggedImageId = tile.getAttribute('data-id');
      tile.classList.add('mb-image-dragging');
    });
    tile.addEventListener('dragend', () => {
      tile.classList.remove('mb-image-dragging');
      draggedImageId = null;
    });
    tile.addEventListener('dragover', (e) => {
      e.preventDefault();
      tile.classList.add('mb-image-drop-target');
    });
    tile.addEventListener('dragleave', () => {
      tile.classList.remove('mb-image-drop-target');
    });
    tile.addEventListener('drop', (e) => {
      e.preventDefault();
      tile.classList.remove('mb-image-drop-target');
      const targetId = tile.getAttribute('data-id');
      if (!draggedImageId || draggedImageId === targetId) return;
      reorderImages(draggedImageId, targetId);
    });
  });
}

function reorderImages(draggedId, targetId) {
  const images = draftEmbedLinks.filter(isImageEntry);
  const links = draftEmbedLinks.filter(l => !isImageEntry(l));
  const fromIdx = images.findIndex(l => l.id === draggedId);
  const toIdx = images.findIndex(l => l.id === targetId);
  if (fromIdx === -1 || toIdx === -1) return;
  const [moved] = images.splice(fromIdx, 1);
  images.splice(toIdx, 0, moved);
  // Matches handleDroppedImage/addDraftEmbedLink: this only touches the
  // in-progress draft, not the saved board, so no persist() here - the
  // reorder is committed along with everything else when "Save Mood
  // Board" is clicked (saveBoard() writes draftEmbedLinks to the board).
  draftEmbedLinks = [...images, ...links];
  renderImageGrid();
}

function renderLinksList() {
  const list = el('embedLinksList');
  const links = draftEmbedLinks.filter(l => !isImageEntry(l));
  if (links.length === 0) {
    list.innerHTML = '<p style="color:var(--color-text-secondary); font-size:13px; margin:0;">No reference links added yet.</p>';
    return;
  }
  list.innerHTML = links.map(l => `
    <li class="embed-link-chip">
      <div class="embed-link-main"><span><strong>${escapeHtml(l.label)}</strong> — ${escapeHtml(l.url)}</span></div>
      <button data-id="${l.id}" class="remove-embed-btn">✕</button>
    </li>
  `).join('');
  document.querySelectorAll('.remove-embed-btn').forEach(btn => {
    btn.addEventListener('click', () => removeDraftEmbedLink(btn.getAttribute('data-id')));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function saveBoard() {
  const client = currentClient();
  if (!client) return;

  const title = el('mbTitle').value.trim();
  if (!title) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Give this mood board a title first.');
    return;
  }

  if (!Array.isArray(client.moodBoards)) client.moodBoards = [];

  const styleScale = {};
  STYLE_AXES.forEach(axis => { styleScale[axis.key] = parseInt(el(axis.id).value, 10); });

  const board = {
    id: editingBoardId || uid(),
    title,
    category: el('mbCategory').value,
    ideaSummary: el('mbIdeaSummary').value.trim(),
    visualDirection: el('mbVisualDirection').value.trim(),
    keyElements: el('mbKeyElements').value.trim(),
    styleScale,
    overallRating: parseInt(el('mbOverallRating').value, 10),
    embedLinks: draftEmbedLinks,
    sharedWithClient: el('mbShared').checked,
    createdDate: editingBoardId
      ? (client.moodBoards.find(b => b.id === editingBoardId) || {}).createdDate || new Date().toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  };

  if (editingBoardId) {
    const idx = client.moodBoards.findIndex(b => b.id === editingBoardId);
    if (idx >= 0) client.moodBoards[idx] = board;
  } else {
    client.moodBoards.unshift(board);
  }

  persist();
  resetForm();
  renderBoardsList();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Saved mood board "${title}".`);
  }
}

function startEditBoard(id) {
  const client = currentClient();
  if (!client) return;
  const board = (client.moodBoards || []).find(b => b.id === id);
  if (!board) return;

  editingBoardId = id;
  el('mbTitle').value = board.title || '';
  el('mbCategory').value = board.category || 'Website Design';
  el('mbIdeaSummary').value = board.ideaSummary || '';
  el('mbVisualDirection').value = board.visualDirection || '';
  el('mbKeyElements').value = board.keyElements || '';
  const scale = board.styleScale || {};
  STYLE_AXES.forEach(axis => { el(axis.id).value = (scale[axis.key] !== undefined ? scale[axis.key] : 50); });
  el('mbOverallRating').value = board.overallRating || 5;
  el('mbOverallRatingValue').textContent = `${el('mbOverallRating').value}/10`;
  el('mbShared').checked = !!board.sharedWithClient;
  draftEmbedLinks = (board.embedLinks || []).map(l => ({ ...l }));
  renderEmbedLinksList();

  el('formTitle').textContent = 'Edit Mood Board';
  el('saveBoardBtn').textContent = 'Update Mood Board';
  el('cancelEditBtn').style.display = 'inline-block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeBoard(id) {
  const client = currentClient();
  if (!client) return;
  const board = (client.moodBoards || []).find(b => b.id === id);
  if (!board) return;
  if (!confirm(`Delete the mood board "${board.title}"? This can't be undone.`)) return;
  client.moodBoards = (client.moodBoards || []).filter(b => b.id !== id);
  persist();
  if (editingBoardId === id) resetForm();
  renderBoardsList();
}

function toggleShare(id) {
  const client = currentClient();
  if (!client) return;
  const board = (client.moodBoards || []).find(b => b.id === id);
  if (!board) return;
  board.sharedWithClient = !board.sharedWithClient;

  // Same pattern as Client Portal Manager (new approval) and Monthly
  // Report Archive (new report) - the client's own portal bell should
  // light up when there's something new to look at, not just have the
  // Mood Boards nav item silently appear with no nudge. Only fires when
  // turning sharing ON; hiding a board isn't something worth notifying
  // the client about.
  if (board.sharedWithClient && isEmbedded && window.parent.pushClientNotification) {
    window.parent.pushClientNotification(client, "moodboard", `A new mood board, "${board.title}", is ready for you to view.`);
  }

  persist();
  renderBoardsList();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', board.sharedWithClient ? `"${board.title}" is now visible in the client's Portal.` : `"${board.title}" is now hidden from the client.`);
  }
}

function renderStyleScaleMini(board) {
  const scale = board.styleScale;
  if (!scale) return '';
  const rows = STYLE_AXES.map(axis => {
    const val = scale[axis.key] !== undefined ? scale[axis.key] : 50;
    return `
      <div class="scale-mini-row">
        <span class="scale-mini-label">${axis.left}</span>
        <div class="scale-mini-track"><div class="scale-mini-dot" style="left:${val}%;"></div></div>
        <span class="scale-mini-label">${axis.right}</span>
      </div>`;
  }).join('');
  const overall = board.overallRating ? `<div class="scale-mini-overall">Overall Fit: <strong>${board.overallRating}/10</strong></div>` : '';
  return `<div class="scale-mini-wrap">${rows}${overall}</div>`;
}

const BOARD_CARD_THUMB_LIMIT = 5;

function renderBoardCardThumbs(board) {
  const links = board.embedLinks || [];
  const images = links.filter(isImageEntry);
  const nonImageCount = links.length - images.length;
  if (images.length === 0) {
    return nonImageCount
      ? `<p style="margin:8px 0 0; font-size:12px; color:var(--color-text-secondary);">${nonImageCount} reference link${nonImageCount === 1 ? '' : 's'}</p>`
      : '';
  }
  const shown = images.slice(0, BOARD_CARD_THUMB_LIMIT);
  const overflow = images.length - shown.length;
  const thumbs = shown.map(l => `<img class="board-card-thumb" src="${l.url}" alt="${escapeHtml(l.label)}" title="${escapeHtml(l.label)}">`).join('');
  const overflowBadge = overflow > 0 ? `<span class="board-card-thumb-overflow">+${overflow}</span>` : '';
  const linkNote = nonImageCount ? `<span style="font-size:11px; color:var(--color-text-secondary); margin-left:6px;">+ ${nonImageCount} link${nonImageCount === 1 ? '' : 's'}</span>` : '';
  return `<div style="display:flex; align-items:center; gap:6px; margin-top:10px; flex-wrap:wrap;">${thumbs}${overflowBadge}${linkNote}</div>`;
}

function renderBoardsList() {
  const client = currentClient();
  const container = el('boardsList');
  const boards = client && Array.isArray(client.moodBoards) ? client.moodBoards : [];

  el('boardsEmptyState').style.display = boards.length === 0 ? 'block' : 'none';
  container.innerHTML = boards.map(board => `
    <div class="board-card">
      <div class="board-card-header">
        <div>
          <strong>${escapeHtml(board.title)}</strong>
          <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
            <span class="board-category-badge">${escapeHtml(board.category || 'Other')}</span>
            ${board.sharedWithClient ? '<span class="board-shared-badge">Shared with client</span>' : ''}
          </div>
        </div>
        <div class="board-actions">
          <button class="share-board-btn" data-id="${board.id}">${board.sharedWithClient ? 'Unshare' : 'Share with Client'}</button>
          <button class="edit-board-btn" data-id="${board.id}">Edit</button>
          <button class="remove-board-btn" data-id="${board.id}">Delete</button>
        </div>
      </div>
      ${board.ideaSummary ? `<p style="margin:12px 0 0; font-size:13px; color:var(--color-text-secondary);">${escapeHtml(board.ideaSummary)}</p>` : ''}
      ${renderBoardCardThumbs(board)}
      ${renderStyleScaleMini(board)}
    </div>
  `).join('');

  document.querySelectorAll('.edit-board-btn').forEach(btn => btn.addEventListener('click', () => startEditBoard(btn.getAttribute('data-id'))));
  document.querySelectorAll('.remove-board-btn').forEach(btn => btn.addEventListener('click', () => removeBoard(btn.getAttribute('data-id'))));
  document.querySelectorAll('.share-board-btn').forEach(btn => btn.addEventListener('click', () => toggleShare(btn.getAttribute('data-id'))));
}

function renderState() {
  const clientName = currentClientName();
  if (!clientName) {
    el('emptyState').style.display = 'flex';
    el('moodBoardInterface').style.display = 'none';
    return;
  }
  el('emptyState').style.display = 'none';
  el('moodBoardInterface').style.display = 'block';
  resetForm();
  renderBoardsList();
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  el('clientSelect').addEventListener('change', renderState);
  el('saveBoardBtn').addEventListener('click', saveBoard);
  el('cancelEditBtn').addEventListener('click', resetForm);
  el('addEmbedBtn').addEventListener('click', addDraftEmbedLink);
  el('mbOverallRating').addEventListener('input', () => {
    el('mbOverallRatingValue').textContent = `${el('mbOverallRating').value}/10`;
  });
  wireDropZone(el('imageDropZone'), el('imageFileInput'), handleDroppedImage);

  // Same iframe-race fix used across the other client-aware modules: the
  // parent Hub's client database loads asynchronously, so poll briefly
  // and re-populate the dropdown once real data shows up.
  let clientPollAttempts = 0;
  const clientPoll = setInterval(() => {
    clientPollAttempts++;
    const hasClients = Object.keys(getClients()).length > 0;
    if (hasClients || clientPollAttempts > 30) {
      clearInterval(clientPoll);
      if (hasClients) populateClientSelect();
    }
  }, 250);
});
