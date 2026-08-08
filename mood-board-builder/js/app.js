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

  const board = {
    id: editingBoardId || uid(),
    title,
    category: el('mbCategory').value,
    ideaSummary: el('mbIdeaSummary').value.trim(),
    visualDirection: el('mbVisualDirection').value.trim(),
    keyElements: el('mbKeyElements').value.trim(),
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

  // Reset every time sharing turns ON (not write-once, unlike most other
  // "first happened" timestamps in this codebase) - re-sharing a board
  // that was unshared and shared again restarts the "how long has this
  // been waiting for feedback" clock, since the client couldn't see or
  // rate it while it was hidden. Drives the "Awaiting feedback" badge
  // below and the agency-wide dashboard card (renderMoodBoardsAwaitingFeedback
  // in the root app.js). Boards shared before this field existed just
  // won't show a day count - no way to know retroactively.
  if (board.sharedWithClient) {
    board.sharedAt = new Date().toISOString();
  }

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

// Style-scale sliders are filled in by the CLIENT, in their Portal, not
// here - the agency doesn't set these anymore (see mbScale* removal from
// this form). What renders here is read-only: whatever the client
// submitted, stored separately at client.moodBoardStyleFeedback[boardId]
// (same "keyed by board id, outside the moodBoards array" pattern as
// moodBoardViews) rather than inside the board object itself, since a
// client-side write only ever needs to touch its own board's entry, not
// rewrite the whole moodBoards array.
function renderStyleScaleMini(board, client) {
  const feedback = client && client.moodBoardStyleFeedback && client.moodBoardStyleFeedback[board.id];
  if (!board.sharedWithClient) return '';
  if (!feedback || !feedback.styleScale) {
    return '<div class="scale-mini-wrap scale-mini-empty">No client feedback yet - they can rate this board\'s style once they view it in their Portal.</div>';
  }
  const scale = feedback.styleScale;
  const rows = STYLE_AXES.map(axis => {
    const val = scale[axis.key] !== undefined ? scale[axis.key] : 50;
    return `
      <div class="scale-mini-row">
        <span class="scale-mini-label">${axis.left}</span>
        <div class="scale-mini-track"><div class="scale-mini-dot" style="left:${val}%;"></div></div>
        <span class="scale-mini-label">${axis.right}</span>
      </div>`;
  }).join('');
  const overall = feedback.overallRating ? `<div class="scale-mini-overall">Client's Overall Fit: <strong>${feedback.overallRating}/10</strong></div>` : '';
  return `<div class="scale-mini-wrap">${rows}${overall}</div>`;
}

// Same threshold as the agency-wide dashboard card
// (MOODBOARD_AWAITING_DAYS_THRESHOLD in root app.js) - kept as a separate
// literal here rather than imported, matching how STYLE_AXES is
// duplicated into the Portal's own app.js elsewhere in this codebase
// (each tool's js/app.js is self-contained, nothing shared/imported).
const MOODBOARD_AWAITING_DAYS_THRESHOLD = 7;

function daysSince(isoString) {
  if (!isoString) return null;
  return Math.floor((Date.now() - new Date(isoString).getTime()) / 86400000);
}

// A small companion to renderStyleScaleMini's empty state - that one
// covers "still waiting" in general, this one specifically flags a board
// that's been shared a while with nothing back yet, so a slow-to-respond
// client stands out at a glance in the board list instead of needing a
// trip to the dashboard card to notice.
function renderAwaitingBadge(board, client) {
  if (!board.sharedWithClient) return '';
  const feedback = client && client.moodBoardStyleFeedback && client.moodBoardStyleFeedback[board.id];
  if (feedback) return '';
  const days = daysSince(board.sharedAt);
  if (days === null || days < MOODBOARD_AWAITING_DAYS_THRESHOLD) return '';
  return `<span class="board-awaiting-badge">Awaiting feedback — ${days}d</span>`;
}

// Averages a client's style-scale ratings across every board they've
// rated so far, using the same fixed STYLE_AXES every board is scored on
// (see the comment above that constant) - the average is only meaningful
// because every board shares the same 4 axes. Meant to be read before
// starting a NEW board's concept, not just after the fact: if a client
// consistently rates toward Modern/Bold/Vibrant, that's worth knowing
// before pitching something Traditional/Muted.
function computeTasteProfile(client) {
  const feedbackMap = (client && client.moodBoardStyleFeedback) || {};
  const entries = Object.values(feedbackMap).filter(fb => fb && fb.styleScale);
  if (!entries.length) return null;

  const sums = {};
  const counts = {};
  STYLE_AXES.forEach(axis => { sums[axis.key] = 0; counts[axis.key] = 0; });
  let overallSum = 0;
  let overallCount = 0;

  entries.forEach(fb => {
    STYLE_AXES.forEach(axis => {
      const val = fb.styleScale[axis.key];
      if (typeof val === 'number') {
        sums[axis.key] += val;
        counts[axis.key]++;
      }
    });
    if (typeof fb.overallRating === 'number') {
      overallSum += fb.overallRating;
      overallCount++;
    }
  });

  const axisAverages = {};
  STYLE_AXES.forEach(axis => {
    axisAverages[axis.key] = counts[axis.key] ? Math.round(sums[axis.key] / counts[axis.key]) : 50;
  });

  return {
    axisAverages,
    overallAverage: overallCount ? overallSum / overallCount : null,
    boardCount: entries.length
  };
}

function renderTasteProfile() {
  const container = el('tasteProfileCard');
  if (!container) return;
  const client = currentClient();
  const profile = client ? computeTasteProfile(client) : null;

  if (!profile) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  const rows = STYLE_AXES.map(axis => {
    const val = profile.axisAverages[axis.key];
    return `
      <div class="scale-mini-row">
        <span class="scale-mini-label">${axis.left}</span>
        <div class="scale-mini-track"><div class="scale-mini-dot" style="left:${val}%;"></div></div>
        <span class="scale-mini-label">${axis.right}</span>
      </div>`;
  }).join('');
  const overallText = profile.overallAverage !== null ? profile.overallAverage.toFixed(1) + '/10' : '—';
  const boardWord = profile.boardCount === 1 ? 'board' : 'boards';

  container.style.display = 'block';
  container.innerHTML = `
    <h3>Client Taste Profile</h3>
    <p class="taste-profile-hint">Averaged from ${profile.boardCount} rated ${boardWord} - use this to steer new concepts before you start building them.</p>
    ${rows}
    <div class="scale-mini-overall">Average Overall Fit: <strong>${overallText}</strong></div>
  `;
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
  const thumbs = shown.map((l, idx) => `<img class="board-card-thumb" src="${l.url}" alt="${escapeHtml(l.label)}" title="View &amp; annotate: ${escapeHtml(l.label)}" style="cursor:pointer;" data-board-id="${board.id}" data-idx="${idx}">`).join('');
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
            ${renderAwaitingBadge(board, client)}
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
      ${renderStyleScaleMini(board, client)}
    </div>
  `).join('');

  document.querySelectorAll('.edit-board-btn').forEach(btn => btn.addEventListener('click', () => startEditBoard(btn.getAttribute('data-id'))));
  document.querySelectorAll('.remove-board-btn').forEach(btn => btn.addEventListener('click', () => removeBoard(btn.getAttribute('data-id'))));
  document.querySelectorAll('.share-board-btn').forEach(btn => btn.addEventListener('click', () => toggleShare(btn.getAttribute('data-id'))));
  document.querySelectorAll('.board-card-thumb[data-board-id]').forEach(img => {
    img.addEventListener('click', () => openAdminMoodBoardLightbox(img.getAttribute('data-board-id'), parseInt(img.getAttribute('data-idx'), 10)));
  });
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
  renderTasteProfile();
  renderBoardsList();
}

// ── View & Annotate (admin side) ──
// Opens a SAVED board's image full-size with the same pin/circle
// annotation tools the Client Portal has (portal/js/app.js -
// persistMoodBoardAnnotations et al) - reads and renders both the
// client's own annotations (author: "client") and any the agency has
// left here (author: "admin"), and lets this side add more of its own.
// Deliberately reads from client.moodBoards (the SAVED board), not
// draftEmbedLinks, since annotating only makes sense against images the
// client has actually been able to see and react to - the in-progress
// form above this is a different, unsaved thing.
let adminLightboxImages = [];
let adminLightboxIndex = 0;
let adminLightboxBoardId = null;
let adminAnnotateTool = null; // null | "pin" | "circle"
let adminCircleDragStart = null;
let adminPendingAnnotationDraft = null;

function openAdminMoodBoardLightbox(boardId, idx) {
  const client = currentClient();
  if (!client) return;
  const board = (client.moodBoards || []).find(b => b.id === boardId);
  if (!board) return;
  adminLightboxImages = (board.embedLinks || []).filter(isImageEntry);
  adminLightboxIndex = idx;
  adminLightboxBoardId = boardId;
  if (!adminLightboxImages.length) return;

  const overlay = el('mbAdminLightbox');
  if (!overlay) return;
  overlay.style.display = 'flex';
  setAdminAnnotateTool(null);
  renderAdminLightboxImage();
}

function renderAdminLightboxImage() {
  const img = el('mbAdminLightboxImg');
  const caption = el('mbAdminLightboxCaption');
  const counter = el('mbAdminLightboxCounter');
  const current = adminLightboxImages[adminLightboxIndex];
  if (!img || !current) return;
  img.src = current.url;
  img.alt = current.label || '';
  if (caption) caption.textContent = current.label || '';
  if (counter) counter.textContent = adminLightboxImages.length > 1 ? `${adminLightboxIndex + 1} / ${adminLightboxImages.length}` : '';
  renderAdminAnnotations();
}

function closeAdminMoodBoardLightbox() {
  const overlay = el('mbAdminLightbox');
  if (overlay) overlay.style.display = 'none';
  adminLightboxImages = [];
  adminLightboxBoardId = null;
  setAdminAnnotateTool(null);
  hideAdminAnnotationPopup();
}

function adminLightboxStep(delta) {
  if (!adminLightboxImages.length) return;
  adminLightboxIndex = (adminLightboxIndex + delta + adminLightboxImages.length) % adminLightboxImages.length;
  renderAdminLightboxImage();
}

function currentAdminAnnotationImage() {
  return adminLightboxImages[adminLightboxIndex] || null;
}

function getAdminImageAnnotations(imageId) {
  const client = currentClient();
  const boardMap = (client && client.moodBoardAnnotations && client.moodBoardAnnotations[adminLightboxBoardId]) || {};
  return Array.isArray(boardMap[imageId]) ? boardMap[imageId] : [];
}

function setAdminAnnotateTool(tool) {
  adminAnnotateTool = tool;
  const wrap = el('mbAdminImageWrap');
  const pinBtn = el('mbAdminPinToolBtn');
  const circleBtn = el('mbAdminCircleToolBtn');
  const hint = el('mbAdminAnnotateHint');
  if (wrap) wrap.classList.toggle('tool-active', !!tool);
  if (pinBtn) pinBtn.classList.toggle('active', tool === 'pin');
  if (circleBtn) circleBtn.classList.toggle('active', tool === 'circle');
  if (hint) {
    hint.textContent = tool === 'pin' ? 'Click anywhere on the image to drop a pin.'
      : tool === 'circle' ? 'Click and drag to circle an area.'
      : '';
  }
  adminCircleDragStart = null;
}

function renderAdminAnnotations() {
  const current = currentAdminAnnotationImage();
  const svg = el('mbAdminAnnotationLayer');
  if (!svg || !current) return;

  const annotations = getAdminImageAnnotations(current.id);
  svg.innerHTML = '';
  svg.setAttribute('viewBox', '0 0 100 100');

  annotations.forEach((a, idx) => {
    const num = idx + 1;
    const isAdmin = a.author === 'admin';
    if (a.type === 'circle') {
      const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      ellipse.setAttribute('cx', a.x);
      ellipse.setAttribute('cy', a.y);
      ellipse.setAttribute('rx', a.radiusX);
      ellipse.setAttribute('ry', a.radiusY);
      ellipse.setAttribute('class', 'moodboard-annotation-circle' + (isAdmin ? ' admin-note' : ''));
      ellipse.setAttribute('vector-effect', 'non-scaling-stroke');
      ellipse.addEventListener('click', () => scrollToAdminAnnotationItem(a.id));
      svg.appendChild(ellipse);
    } else {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'moodboard-annotation-pin' + (isAdmin ? ' admin-note' : ''));
      g.addEventListener('click', () => scrollToAdminAnnotationItem(a.id));
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', a.x);
      circle.setAttribute('cy', a.y);
      circle.setAttribute('r', '3.2');
      circle.setAttribute('vector-effect', 'non-scaling-stroke');
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', a.x);
      text.setAttribute('y', a.y);
      text.textContent = String(num);
      g.appendChild(circle);
      g.appendChild(text);
      svg.appendChild(g);
    }
  });

  renderAdminAnnotationList(annotations);
}

function renderAdminAnnotationList(annotations) {
  const list = el('mbAdminAnnotationList');
  if (!list) return;
  if (!annotations.length) {
    list.innerHTML = '<p style="color:var(--color-text-secondary); font-size:12.5px; margin:0;">No notes on this image yet. Use the tools above to leave one.</p>';
    return;
  }
  list.innerHTML = annotations.map((a, idx) => `
    <div class="moodboard-annotation-item${a.author === 'admin' ? ' admin-note' : ''}" id="admin-annotation-item-${escapeHtml(a.id)}">
      <span class="moodboard-annotation-item-num">${idx + 1}</span>
      <div class="moodboard-annotation-item-body">
        <span class="moodboard-annotation-item-author">${a.author === 'admin' ? 'You / Team' : 'Client'}</span>
        <span class="moodboard-annotation-item-text">${escapeHtml(a.comment)}</span>
      </div>
      ${a.author === 'admin' ? `<button type="button" class="moodboard-annotation-item-delete" data-id="${escapeHtml(a.id)}" aria-label="Delete note" title="Delete">✕</button>` : ''}
    </div>
  `).join('');
  list.querySelectorAll('.moodboard-annotation-item-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteAdminAnnotation(btn.getAttribute('data-id')));
  });
}

function scrollToAdminAnnotationItem(id) {
  const item = document.getElementById(`admin-annotation-item-${id}`);
  if (item) item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function adminWrapPointToPercent(wrap, clientX, clientY) {
  const rect = wrap.getBoundingClientRect();
  const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
  const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
  return { x, y };
}

function renderAdminCircleDragPreview(start, current) {
  const svg = el('mbAdminAnnotationLayer');
  if (!svg) return;
  let preview = svg.querySelector('.moodboard-annotation-circle-preview');
  if (!preview) {
    preview = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    preview.setAttribute('class', 'moodboard-annotation-circle-preview');
    preview.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(preview);
  }
  const radiusX = Math.max(0.5, Math.abs(current.x - start.x) / 2);
  const radiusY = Math.max(0.5, Math.abs(current.y - start.y) / 2);
  preview.setAttribute('cx', (start.x + current.x) / 2);
  preview.setAttribute('cy', (start.y + current.y) / 2);
  preview.setAttribute('rx', radiusX);
  preview.setAttribute('ry', radiusY);
}

function clearAdminCircleDragPreview() {
  const svg = el('mbAdminAnnotationLayer');
  const preview = svg && svg.querySelector('.moodboard-annotation-circle-preview');
  if (preview) preview.remove();
}

function showAdminAnnotationPopup(clientX, clientY) {
  const popup = el('mbAdminAnnotationPopup');
  const input = el('mbAdminAnnotationCommentInput');
  if (!popup || !input) return;
  input.value = '';
  const popupWidth = 260;
  const left = Math.min(window.innerWidth - popupWidth - 16, Math.max(16, clientX - popupWidth / 2));
  const top = Math.min(window.innerHeight - 140, clientY + 12);
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.display = 'block';
  input.focus();
}

function hideAdminAnnotationPopup() {
  const popup = el('mbAdminAnnotationPopup');
  if (popup) popup.style.display = 'none';
  adminPendingAnnotationDraft = null;
}

function saveAdminAnnotationDraft() {
  const input = el('mbAdminAnnotationCommentInput');
  const comment = input ? input.value.trim() : '';
  if (!comment || !adminPendingAnnotationDraft) { hideAdminAnnotationPopup(); return; }

  const client = currentClient();
  const current = currentAdminAnnotationImage();
  if (!client || !current) { hideAdminAnnotationPopup(); return; }

  if (!client.moodBoardAnnotations) client.moodBoardAnnotations = {};
  if (!client.moodBoardAnnotations[adminLightboxBoardId]) client.moodBoardAnnotations[adminLightboxBoardId] = {};
  if (!Array.isArray(client.moodBoardAnnotations[adminLightboxBoardId][current.id])) {
    client.moodBoardAnnotations[adminLightboxBoardId][current.id] = [];
  }

  const annotation = Object.assign({}, adminPendingAnnotationDraft, {
    id: 'an-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    comment,
    author: 'admin',
    createdAt: new Date().toISOString()
  });
  client.moodBoardAnnotations[adminLightboxBoardId][current.id].push(annotation);

  hideAdminAnnotationPopup();
  setAdminAnnotateTool(null);
  renderAdminAnnotations();
  persist();
}

function deleteAdminAnnotation(id) {
  const client = currentClient();
  const current = currentAdminAnnotationImage();
  if (!client || !current || !adminLightboxBoardId) return;
  const list = getAdminImageAnnotations(current.id);
  const annotation = list.find(a => a.id === id);
  if (!annotation || annotation.author !== 'admin') return;
  if (!confirm('Delete this note?')) return;

  client.moodBoardAnnotations[adminLightboxBoardId][current.id] = list.filter(a => a.id !== id);
  renderAdminAnnotations();
  persist();
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  el('clientSelect').addEventListener('change', renderState);
  el('saveBoardBtn').addEventListener('click', saveBoard);
  el('cancelEditBtn').addEventListener('click', resetForm);
  el('addEmbedBtn').addEventListener('click', addDraftEmbedLink);
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

document.addEventListener('DOMContentLoaded', () => {
  const overlay = el('mbAdminLightbox');
  if (!overlay) return;
  el('mbAdminLightboxClose')?.addEventListener('click', closeAdminMoodBoardLightbox);
  el('mbAdminLightboxPrev')?.addEventListener('click', () => adminLightboxStep(-1));
  el('mbAdminLightboxNext')?.addEventListener('click', () => adminLightboxStep(1));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeAdminMoodBoardLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (overlay.style.display !== 'flex') return;
    if (e.key === 'Escape') {
      if (el('mbAdminAnnotationPopup')?.style.display === 'block') hideAdminAnnotationPopup();
      else closeAdminMoodBoardLightbox();
    }
    if (e.key === 'ArrowLeft' && !adminAnnotateTool) adminLightboxStep(-1);
    if (e.key === 'ArrowRight' && !adminAnnotateTool) adminLightboxStep(1);
  });

  const pinBtn = el('mbAdminPinToolBtn');
  const circleBtn = el('mbAdminCircleToolBtn');
  pinBtn?.addEventListener('click', () => setAdminAnnotateTool(adminAnnotateTool === 'pin' ? null : 'pin'));
  circleBtn?.addEventListener('click', () => setAdminAnnotateTool(adminAnnotateTool === 'circle' ? null : 'circle'));

  const wrap = el('mbAdminImageWrap');
  if (wrap) {
    wrap.addEventListener('click', (e) => {
      if (adminAnnotateTool !== 'pin') return;
      const { x, y } = adminWrapPointToPercent(wrap, e.clientX, e.clientY);
      adminPendingAnnotationDraft = { type: 'pin', x, y };
      showAdminAnnotationPopup(e.clientX, e.clientY);
    });
    wrap.addEventListener('pointerdown', (e) => {
      if (adminAnnotateTool !== 'circle') return;
      e.preventDefault();
      wrap.setPointerCapture(e.pointerId);
      adminCircleDragStart = adminWrapPointToPercent(wrap, e.clientX, e.clientY);
    });
    wrap.addEventListener('pointermove', (e) => {
      if (adminAnnotateTool !== 'circle' || !adminCircleDragStart) return;
      const current = adminWrapPointToPercent(wrap, e.clientX, e.clientY);
      renderAdminCircleDragPreview(adminCircleDragStart, current);
    });
    wrap.addEventListener('pointerup', (e) => {
      if (adminAnnotateTool !== 'circle' || !adminCircleDragStart) return;
      const end = adminWrapPointToPercent(wrap, e.clientX, e.clientY);
      clearAdminCircleDragPreview();
      const radiusX = Math.max(2, Math.abs(end.x - adminCircleDragStart.x) / 2);
      const radiusY = Math.max(2, Math.abs(end.y - adminCircleDragStart.y) / 2);
      const x = (adminCircleDragStart.x + end.x) / 2;
      const y = (adminCircleDragStart.y + end.y) / 2;
      adminCircleDragStart = null;
      adminPendingAnnotationDraft = { type: 'circle', x, y, radiusX, radiusY };
      showAdminAnnotationPopup(e.clientX, e.clientY);
    });
    wrap.addEventListener('pointercancel', () => {
      adminCircleDragStart = null;
      clearAdminCircleDragPreview();
    });
  }

  el('mbAdminAnnotationCancelBtn')?.addEventListener('click', hideAdminAnnotationPopup);
  el('mbAdminAnnotationSaveBtn')?.addEventListener('click', saveAdminAnnotationDraft);
});
