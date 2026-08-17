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

// Reverse-lookup: the parent Hub's getActiveClient() returns the active
// client OBJECT, not its name, and the parent's own activeClientName isn't
// exposed on window (top-level let/const don't attach to window). Used only
// to pick a sensible FIRST default for this tool's own independent
// dropdown (see file header) - doesn't create any ongoing two-way sync with
// the global active client, so it doesn't undercut that independence.
function getGlobalActiveClientName() {
  if (!isEmbedded) return null;
  try {
    const active = window.parent.getActiveClient && window.parent.getActiveClient();
    if (!active) return null;
    const clients = getClients();
    return Object.keys(clients).find(name => clients[name] === active) || null;
  } catch (e) {
    return null;
  }
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
  if (prevValue && clients[prevValue]) {
    select.value = prevValue;
  } else if (!prevValue) {
    const activeName = getGlobalActiveClientName();
    if (activeName && clients[activeName]) select.value = activeName;
  }
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
  el('mbNotes').value = '';
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
  const isVideo = !!getVideoEmbedInfo(url);
  draftEmbedLinks.push({ id: uid(), label: label || url, url, isVideo });
  el('embedLabel').value = '';
  el('embedUrl').value = '';
  renderEmbedLinksList();
  if (isVideo && isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Added "${label || url}" as a reference video.`);
  }
}

let imageDropCounter = 0;

// Converts a data URL (what processImageFile/canvas.toDataURL produces)
// back into a Blob so it can be POSTed as multipart/form-data to
// /api/media. Kept local to this file rather than added to
// shared-dropzone.js - Case Study Builder and Brand Guidelines Builder
// still expect processImageFile to return a data URL directly (used for
// preview + saved inline), and changing that return type would be a
// breaking change for both. If/when either of them moves onto /api/media
// too, this is the one function worth promoting up to the shared file.
function dataUrlToBlob(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  const meta = dataUrl.slice(5, commaIdx); // strips leading "data:"
  const mime = meta.split(';')[0] || 'application/octet-stream';
  const binary = atob(dataUrl.slice(commaIdx + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// How many image/video uploads are currently in flight - saveBoard()
// checks this so a fast "drop image/video, immediately click Save"
// doesn't write a board whose media is still the (large) local data URL
// rather than the real R2 reference. See handleDroppedImage/
// handleDroppedVideo below.
let pendingMediaUploads = 0;

function uploadImageToMedia(blob, filename) {
  const form = new FormData();
  form.append('file', blob, filename || 'image.jpg');
  form.append('context', 'mood-board');
  return fetch('/api/media', { method: 'POST', body: form }).then(res => {
    if (!res.ok) {
      return res.json().catch(() => ({})).then(data => {
        throw new Error(data.error || `Upload failed (HTTP ${res.status})`);
      });
    }
    return res.json();
  }).then(data => data.url);
}

// Dropping/uploading an image adds it straight to the reference list as
// a thumbnail - no need to also fill in the label/URL fields and click
// "+ Add Link" separately.
//
// The image is shown immediately from the local compressed data URL (see
// shared-dropzone.js) for instant feedback, then uploaded to R2 via
// /api/media in the background and swapped for the short URL reference
// once that lands - so what actually gets written to the client's
// Firestore doc on Save is a small reference, not the image bytes
// themselves. This replaced storing the data URL inline permanently,
// which was pushing image-heavy clients toward Firestore's ~1MB
// per-document ceiling (see the client-size warnings below). If the
// upload fails for some reason, this falls back to keeping the inline
// data URL rather than losing the image - worse for record size, but
// never worse for the user than what this tool used to do unconditionally.
function handleDroppedImage(file) {
  // 1400px (bumped from 800px): the Client Portal now opens these in a
  // near-full-screen lightbox rather than only ever showing a 36px chip,
  // so the old cap looked visibly soft once zoomed. Still compressed/
  // capped, not the original file.
  processImageFile(file, { maxWidth: 1400 }).then(dataUrl => {
    imageDropCounter++;
    const label = (file.name || `Image ${imageDropCounter}`).replace(/\.[^.]+$/, '');
    const localId = uid();
    draftEmbedLinks.push({ id: localId, label, url: dataUrl, isImage: true, uploading: true });
    renderEmbedLinksList();
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('success', `Added "${label}" as a reference image.`);

    pendingMediaUploads++;
    uploadImageToMedia(dataUrlToBlob(dataUrl), label).then(url => {
      const entry = draftEmbedLinks.find(l => l.id === localId);
      if (entry) {
        entry.url = url;
        entry.uploading = false;
      }
    }).catch(err => {
      console.error('Mood board image upload to /api/media failed, keeping inline data URL:', err);
      const entry = draftEmbedLinks.find(l => l.id === localId);
      if (entry) entry.uploading = false;
      if (isEmbedded && window.parent.showBanner) {
        window.parent.showBanner('error', `"${label}" is saved, but couldn't move to storage (${err.message || err}) - it's staying inline for now, which still counts against this client's record size.`);
      }
    }).finally(() => {
      pendingMediaUploads--;
      renderEmbedLinksList();
    });
  }).catch(errMsg => {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', errMsg);
  });
}

let videoDropCounter = 0;

// Same "drop it straight into the list" pattern as handleDroppedImage
// above - shown immediately from the local data URL for instant
// feedback, then uploaded to R2 via /api/media in the background and
// swapped for the short URL reference once that lands, exactly like
// images (see uploadImageToMedia/handleDroppedImage above; /api/media
// accepts video signatures too as of Aug 2026).
//
// Unlike images, video CANNOT safely fall back to staying inline if the
// upload fails: processImageFile compresses images down to a small JPEG
// first, so an inline fallback is merely wasteful, not broken. Video has
// no equivalent compression step (processVideoFile just validates and
// reads raw bytes), and its 3MB raw-file cap becomes a ~4MB base64
// string once inline - well past Firestore's ~1MB per-field limit. A
// video that stayed inline was guaranteed to break the next save
// (Firestore reports this as "Property X contains an invalid nested
// entity" rather than a clear size error, since the oversized string
// sits nested inside embedLinks/moodBoards) - this is exactly what
// happened to Evry Intention LLC. So on upload failure this removes the
// video from the draft instead of leaving it inline, and tells the user
// to retry rather than silently handing them a board that can't save.
function handleDroppedVideo(file) {
  // 25MB (up from the shared 3MB default): that default was sized for
  // videos living inline in a Firestore field, which no longer applies
  // now that videos upload to R2 (see handleDroppedVideo's comment
  // above) - plenty of room for a short reference clip without inviting
  // multi-minute uploads on a bad connection.
  processVideoFile(file, { maxSizeBytes: 25 * 1024 * 1024 }).then(dataUrl => {
    videoDropCounter++;
    const label = (file.name || `Video ${videoDropCounter}`).replace(/\.[^.]+$/, '');
    const localId = uid();
    draftEmbedLinks.push({ id: localId, label, url: dataUrl, isVideo: true, uploading: true });
    renderEmbedLinksList();
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('success', `Added "${label}" as a reference video - uploading...`);

    pendingMediaUploads++;
    uploadImageToMedia(dataUrlToBlob(dataUrl), (label || 'video') + '.mp4').then(url => {
      const entry = draftEmbedLinks.find(l => l.id === localId);
      if (entry) {
        entry.url = url;
        entry.uploading = false;
      }
      if (isEmbedded && window.parent.showBanner) window.parent.showBanner('success', `"${label}" finished uploading.`);
    }).catch(err => {
      console.error('Mood board video upload to /api/media failed, removing (cannot safely stay inline):', err);
      draftEmbedLinks = draftEmbedLinks.filter(l => l.id !== localId);
      if (isEmbedded && window.parent.showBanner) {
        window.parent.showBanner('error', `"${label}" couldn't be uploaded (${err.message || err}) and was removed - videos can't be stored inline like images can. Please try adding it again.`);
      }
    }).finally(() => {
      pendingMediaUploads--;
      renderEmbedLinksList();
    });
  }).catch(errMsg => {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', errMsg);
  });
}

function removeDraftEmbedLink(id) {
  const removed = draftEmbedLinks.find(l => l.id === id);
  draftEmbedLinks = draftEmbedLinks.filter(l => l.id !== id);
  renderEmbedLinksList();

  // Best-effort cleanup of the R2 object so removing an image from a
  // board doesn't leave it orphaned in the bucket forever. Fire-and-
  // forget - if this fails (offline, race, etc.) it's a harmless orphan
  // file, not a broken board, so it's not worth blocking the UI over.
  if (removed && typeof removed.url === 'string' && removed.url.startsWith('/api/media/')) {
    fetch(removed.url, { method: 'DELETE' }).catch(() => {});
  }
}

function isImageEntry(l) {
  return l.isImage || (l.url || '').startsWith('data:image');
}

// Recognizes YouTube, Vimeo, and Loom share links and converts them into
// an embeddable iframe URL (their normal watch/share URLs don't embed
// directly - YouTube in particular refuses to render at all in an
// <iframe> unless it's the /embed/ path). Anything else that looks like
// a direct video file (.mp4/.webm/.mov/.ogg) instead gets rendered with
// a native <video> tag pointed straight at that URL. Returns null for a
// plain reference link that isn't a recognized video source.
function getVideoEmbedInfo(url) {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/);
  if (ytMatch) return { kind: 'iframe', src: `https://www.youtube.com/embed/${ytMatch[1]}` };

  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeoMatch[1]}` };

  const loomMatch = url.match(/loom\.com\/share\/([\w-]+)/);
  if (loomMatch) return { kind: 'iframe', src: `https://www.loom.com/embed/${loomMatch[1]}` };

  if (/\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(url)) return { kind: 'file', src: url };

  return null;
}

// Videos and images both live in draftEmbedLinks/board.embedLinks
// alongside plain reference links (same "one array, split by type when
// rendering" pattern isImageEntry/renderEmbedLinksList already use) - an
// entry is a video either because it was uploaded as a file (isVideo
// flag, data:video URL) or because its pasted URL matches a recognized
// video source above.
function isVideoEntry(l) {
  if (!l) return false;
  return !!(l.isVideo || (l.url || '').startsWith('data:video') || getVideoEmbedInfo(l.url || ''));
}

// Images and plain URL references share one underlying draftEmbedLinks
// array (and the same saved board.embedLinks field) so existing boards
// saved before this split still load exactly as they were - only the
// rendering is split into two visual groups now, filtered from the
// same list by isImageEntry().
function renderEmbedLinksList() {
  renderImageGrid();
  renderVideoGrid();
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
    internalNotes: el('mbNotes') ? el('mbNotes').value : '',
    embedLinks: draftEmbedLinks
  };
  clone.moodBoards = (clone.moodBoards || []).concat([draftBoard]);
  // (internalNotes is plain text, not a data URL, so it's already
  // covered by the JSON.stringify below without any special handling -
  // this comment exists just to make clear the field wasn't overlooked
  // when this estimate was extended for it.)

  try {
    return new Blob([JSON.stringify(clone)]).size;
  } catch (e) {
    return 0;
  }
}

// True if this client has any mood board image still stored the old way
// (inline base64, from before images moved to R2 via /api/media - see
// handleDroppedImage). New uploads no longer create these, but boards
// saved before that change still have them, and the code fix alone
// doesn't shrink data that's already written - only migrateClientImagesToStorage
// below actually does that.
function clientHasLegacyInlineImages(client) {
  if (!client || !Array.isArray(client.moodBoards)) return false;
  return client.moodBoards.some(board =>
    (board.embedLinks || []).some(l => isImageEntry(l) && (l.url || '').startsWith('data:image'))
  );
}

function renderClientSizeWarning() {
  const el2 = el('clientSizeWarning');
  const migrateBtn = el('migrateImagesBtn');
  if (!el2) return;
  const totalBytes = estimateClientTotalBytes();
  const client = currentClient();
  const hasLegacy = clientHasLegacyInlineImages(client);

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

  if (migrateBtn) {
    // Only offer this once the client is at least in "getting large"
    // territory - not worth surfacing for a client with one old inline
    // image well under any threshold.
    migrateBtn.style.display = (hasLegacy && totalBytes >= CLIENT_SIZE_WARNING_BYTES) ? 'inline-block' : 'none';
  }
}

// Goes through every saved mood board for the current client (not just
// the one open in the form) and uploads any inline base64 image to R2
// via /api/media, replacing it with the short URL reference in place -
// this is what actually shrinks an already-bloated client record, since
// the handleDroppedImage fix only prevents new bloat going forward.
//
// Runs uploads sequentially rather than in parallel - simpler to reason
// about and report progress on, and the client counts here are small
// enough (a handful of boards, not hundreds) that the extra time doesn't
// matter.
async function migrateClientImagesToStorage() {
  const client = currentClient();
  const clientName = currentClientName();
  if (!client || !Array.isArray(client.moodBoards)) return;

  if (editingBoardId) {
    if (isEmbedded && window.parent.showBanner) {
      window.parent.showBanner('error', 'Finish or cancel the mood board you\'re currently editing first - migrating while a board is open for edit could overwrite the migration when you hit Save.');
    }
    return;
  }

  const btn = el('migrateImagesBtn');
  const legacyEntries = [];
  client.moodBoards.forEach(board => {
    (board.embedLinks || []).forEach(l => {
      if (isImageEntry(l) && (l.url || '').startsWith('data:image')) legacyEntries.push({ board, entry: l });
    });
  });

  if (legacyEntries.length === 0) return;

  if (btn) { btn.disabled = true; }
  let migrated = 0;
  let failed = 0;

  for (const { entry } of legacyEntries) {
    if (btn) btn.textContent = `Migrating image ${migrated + failed + 1} of ${legacyEntries.length}...`;
    try {
      const url = await uploadImageToMedia(dataUrlToBlob(entry.url), entry.label);
      entry.url = url;
      migrated++;
    } catch (e) {
      console.error('Migration upload failed for', entry.label, e);
      failed++;
    }
  }

  if (migrated > 0) {
    persist();
  }
  renderBoardsList();
  renderClientSizeWarning();

  if (btn) {
    btn.disabled = false;
    btn.textContent = "Move this client's existing inline images to storage";
  }

  if (isEmbedded && window.parent.showBanner) {
    const msg = failed === 0
      ? `Moved ${migrated} image${migrated === 1 ? '' : 's'} to storage for ${clientName}. Their record should be much smaller now.`
      : `Moved ${migrated} image${migrated === 1 ? '' : 's'} to storage; ${failed} failed and stayed inline - try again in a moment for those.`;
    window.parent.showBanner(failed === 0 ? 'success' : 'error', msg);
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
      ${l.uploading ? '<span class="mb-image-lead-badge" style="left:auto;right:6px;background:#555;" title="Moving to storage so it doesn\'t bloat this client\'s record">Saving…</span>' : ''}
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

// Videos get their own small grid, same tile-with-caption-and-remove
// shape as the image grid above, but no drag-to-reorder (a board rarely
// has enough videos to make reordering worth the added complexity, and
// the annotate/pin tools further down are image-only anyway). An
// uploaded video renders with a native <video> tag; a pasted YouTube/
// Vimeo/Loom link renders with the embeddable iframe getVideoEmbedInfo()
// resolved for it; anything else that still matched isVideoEntry (a
// direct .mp4/.webm/.mov/.ogg URL) falls back to a <video> tag pointed
// straight at that URL.
function renderVideoGrid() {
  const grid = el('videoGrid');
  const empty = el('videoGridEmptyState');
  if (!grid) return;
  const videos = draftEmbedLinks.filter(isVideoEntry);

  if (videos.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  grid.innerHTML = videos.map(l => `
    <div class="mb-video-tile" data-id="${l.id}">
      <div class="mb-video-preview">${renderVideoPreviewMarkup(l)}</div>
      <button data-id="${l.id}" class="mb-image-remove-btn" aria-label="Remove video" title="Remove">✕</button>
      <input type="text" class="mb-image-caption-input" data-id="${l.id}" value="${escapeHtml(l.label)}" placeholder="Add a caption..." aria-label="Video caption">
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
}

function renderVideoPreviewMarkup(l) {
  if ((l.url || '').startsWith('data:video')) {
    return `<video src="${l.url}" controls preload="metadata"></video>`;
  }
  const embed = getVideoEmbedInfo(l.url);
  if (embed && embed.kind === 'iframe') {
    return `<iframe src="${embed.src}" frameborder="0" allow="fullscreen" allowfullscreen></iframe>`;
  }
  return `<video src="${embed ? embed.src : l.url}" controls preload="metadata"></video>`;
}

function renderLinksList() {
  const list = el('embedLinksList');
  const links = draftEmbedLinks.filter(l => !isImageEntry(l) && !isVideoEntry(l));
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

  // A drop-then-immediately-Save click can beat the /api/media upload
  // back - saving now would write the large inline data URL to Firestore
  // instead of waiting the extra moment for the small R2 reference,
  // defeating the point of the upload. Images are small/compressed
  // against a fast route, so this is a brief wait in practice; video
  // uploads take a little longer since they aren't compressed first, but
  // still shouldn't be more than a few seconds for the 3MB cap.
  if (pendingMediaUploads > 0) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Still uploading image(s)/video(s) - give it a second and click Save again.');
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
    // Deliberately never rendered in the Portal (see renderMoodBoards in
    // portal/js/app.js, which only ever reads title/category/ideaSummary/
    // visualDirection/keyElements/embedLinks) - this is the one field on
    // a mood board that's team-only even when the board itself is
    // shared with the client.
    internalNotes: el('mbNotes').value.trim(),
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
  el('mbNotes').value = board.internalNotes || '';
  el('mbShared').checked = !!board.sharedWithClient;
  draftEmbedLinks = (board.embedLinks || []).map(l => ({ ...l }));
  renderEmbedLinksList();

  el('formTitle').textContent = 'Edit Mood Board';
  el('saveBoardBtn').textContent = 'Update Mood Board';
  el('cancelEditBtn').style.display = 'inline-block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Hands a board off to the Production Board tool - carries over
// everything the idea itself needs (title/category/summary/direction/
// elements/internal notes/reference links), stamps a movedAt so
// Production Board can show when it left here, and removes it from this
// list entirely so it doesn't sit around looking like it's still just an
// idea once someone's actually building it. See
// production-board/js/app.js's sendBackToMoodBoard for the reverse move
// if this was a mistake or the piece stalls.
function moveToProductionBoard(id) {
  const client = currentClient();
  if (!client) return;
  const board = (client.moodBoards || []).find(b => b.id === id);
  if (!board) return;
  if (!confirm(`Move "${board.title}" to the Production Board? It'll disappear from Mood Boards and show up there instead.`)) return;

  if (!Array.isArray(client.productionBoard)) client.productionBoard = [];
  client.productionBoard.unshift({
    id: uid(),
    title: board.title,
    category: board.category,
    ideaSummary: board.ideaSummary,
    visualDirection: board.visualDirection,
    keyElements: board.keyElements,
    internalNotes: board.internalNotes,
    embedLinks: board.embedLinks || [],
    productionNotes: "",
    assignee: "",
    priority: "Medium",
    targetDate: "",
    movedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString()
  });

  client.moodBoards = client.moodBoards.filter(b => b.id !== id);
  persist();
  // Production Board's iframe may already be loaded from earlier in this
  // session and won't re-fetch data on its own - flag it so the next time
  // someone clicks into that tab it does a fresh reload instead of showing
  // stale content until a full app reload.
  if (isEmbedded && window.parent.iframeNeedsReload) {
    window.parent.iframeNeedsReload["tab-productionboard"] = true;
  }
  if (editingBoardId === id) resetForm();
  renderBoardsList();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `"${board.title}" moved to the Production Board.`);
  }
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
  if (window.initDismissibleCards) initDismissibleCards();
}

const BOARD_CARD_THUMB_LIMIT = 5;

function renderBoardCardThumbs(board) {
  const links = board.embedLinks || [];
  const images = links.filter(isImageEntry);
  const videos = links.filter(isVideoEntry);
  const plainLinks = links.filter(l => !isImageEntry(l) && !isVideoEntry(l));

  const shownImages = images.slice(0, BOARD_CARD_THUMB_LIMIT);
  const overflow = images.length - shownImages.length;
  const imageThumbs = shownImages.map((l, idx) => `<img class="board-card-thumb" src="${l.url}" alt="${escapeHtml(l.label)}" title="View &amp; annotate: ${escapeHtml(l.label)}" style="cursor:pointer;" data-board-id="${board.id}" data-idx="${idx}">`).join('');
  const overflowBadge = overflow > 0 ? `<span class="board-card-thumb-overflow">+${overflow}</span>` : '';

  const videoThumbs = videos.map((l, idx) => `<div class="board-card-video-thumb" title="Play: ${escapeHtml(l.label)}" data-board-id="${board.id}" data-video-idx="${idx}">▶</div>`).join('');

  if (!imageThumbs && !videoThumbs && !plainLinks.length) return '';

  const linkNote = plainLinks.length ? `<span style="font-size:11px; color:var(--color-text-secondary); margin-left:6px;">+ ${plainLinks.length} link${plainLinks.length === 1 ? '' : 's'}</span>` : '';
  return `<div style="display:flex; align-items:center; gap:6px; margin-top:10px; flex-wrap:wrap;">${imageThumbs}${overflowBadge}${videoThumbs}${linkNote}</div>`;
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
          <button class="moveto-production-btn" data-id="${board.id}">Move to Production Board</button>
          <button class="view-board-btn" data-id="${board.id}">View</button>
          <button class="edit-board-btn" data-id="${board.id}">Edit</button>
          <button class="remove-board-btn" data-id="${board.id}">Delete</button>
        </div>
      </div>
      ${board.ideaSummary ? `<p style="margin:12px 0 0; font-size:13px; color:var(--color-text-secondary);">${escapeHtml(board.ideaSummary)}</p>` : ''}
      ${renderBoardCardThumbs(board)}
      ${board.internalNotes ? `<div class="board-internal-notes"><span class="mb-internal-only-badge">Internal notes</span><p>${escapeHtml(board.internalNotes)}</p></div>` : ''}
      ${renderStyleScaleMini(board, client)}
    </div>
  `).join('');

  document.querySelectorAll('.view-board-btn').forEach(btn => btn.addEventListener('click', () => viewBoard(btn.getAttribute('data-id'))));
  document.querySelectorAll('.edit-board-btn').forEach(btn => btn.addEventListener('click', () => startEditBoard(btn.getAttribute('data-id'))));
  document.querySelectorAll('.remove-board-btn').forEach(btn => btn.addEventListener('click', () => removeBoard(btn.getAttribute('data-id'))));
  document.querySelectorAll('.share-board-btn').forEach(btn => btn.addEventListener('click', () => toggleShare(btn.getAttribute('data-id'))));
  document.querySelectorAll('.moveto-production-btn').forEach(btn => btn.addEventListener('click', () => moveToProductionBoard(btn.getAttribute('data-id'))));
  document.querySelectorAll('.board-card-thumb[data-board-id]').forEach(img => {
    img.addEventListener('click', () => openAdminMoodBoardLightbox(img.getAttribute('data-board-id'), parseInt(img.getAttribute('data-idx'), 10)));
  });
  document.querySelectorAll('.board-card-video-thumb[data-board-id]').forEach(tile => {
    tile.addEventListener('click', () => openVideoLightbox(tile.getAttribute('data-board-id'), parseInt(tile.getAttribute('data-video-idx'), 10)));
  });
}

// ── View Mood Board (read-only, admin side) ──
// Opens mbViewBoardModal with everything about a SAVED board - including
// Visual Direction and Key Elements, neither of which the card summary
// above shows - without touching the in-progress edit form/draft state
// the way clicking Edit does. See the HTML comment on mbViewBoardModal
// for the full reasoning.
function viewBoard(id) {
  const client = currentClient();
  if (!client) return;
  const board = (client.moodBoards || []).find(b => b.id === id);
  if (!board) return;

  const modal = el('mbViewBoardModal');
  if (!modal) return;

  const titleEl = el('mbViewBoardTitle');
  if (titleEl) titleEl.textContent = board.title || 'Untitled';

  const badges = [`<span class="board-category-badge">${escapeHtml(board.category || 'Other')}</span>`];
  if (board.sharedWithClient) badges.push('<span class="board-shared-badge">Shared with client</span>');
  const badgesEl = el('mbViewBoardBadges');
  if (badgesEl) badgesEl.innerHTML = badges.join('');

  const fieldRows = [
    ['Idea Summary', board.ideaSummary],
    ['Visual Direction / Mood', board.visualDirection],
    ['Key Elements to Include', board.keyElements]
  ].filter(([, val]) => (val || '').trim());

  const fieldsHtml = fieldRows.map(([label, val]) => `
    <div class="mb-view-board-field">
      <div class="mb-view-board-field-label">${escapeHtml(label)}</div>
      <div class="mb-view-board-field-value">${escapeHtml(val)}</div>
    </div>`).join('');

  const notesHtml = (board.internalNotes || '').trim()
    ? `<div class="board-internal-notes" style="margin-top:16px;"><span class="mb-internal-only-badge">Internal notes</span><p>${escapeHtml(board.internalNotes)}</p></div>`
    : '';

  const fieldsContainer = el('mbViewBoardFields');
  if (fieldsContainer) fieldsContainer.innerHTML = fieldsHtml + notesHtml || '<p style="color:var(--color-text-secondary); font-size:13px; margin-top:16px;">No write-up added yet.</p>';

  const links = board.embedLinks || [];
  const images = links.filter(isImageEntry);
  const videos = links.filter(isVideoEntry);
  const plainLinks = links.filter(l => !isImageEntry(l) && !isVideoEntry(l));

  const imageTiles = images.map((l, idx) => `<img class="mb-view-board-gallery-img" src="${l.url}" alt="${escapeHtml(l.label)}" title="${escapeHtml(l.label)}" data-idx="${idx}">`).join('');
  const videoTiles = videos.map((l, idx) => `<div class="mb-view-board-gallery-video" data-video-idx="${idx}">▶<br>${escapeHtml(l.label || 'Video')}</div>`).join('');
  const linkTiles = plainLinks.map(l => `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" class="mb-view-board-gallery-link">🔗 ${escapeHtml(l.label || l.url)}</a>`).join('');

  const galleryEl = el('mbViewBoardGallery');
  if (galleryEl) {
    galleryEl.innerHTML = (imageTiles + videoTiles + linkTiles) ||
      '<p style="color:var(--color-text-secondary); font-size:13px;">No images, videos, or links on this board yet.</p>';

    // Full-size viewing/annotating is already handled by the existing
    // image/video lightboxes - hand off to those rather than building a
    // second viewer here.
    galleryEl.querySelectorAll('.mb-view-board-gallery-img').forEach(img => {
      img.addEventListener('click', () => {
        closeViewBoardModal();
        openAdminMoodBoardLightbox(id, parseInt(img.getAttribute('data-idx'), 10));
      });
    });
    galleryEl.querySelectorAll('.mb-view-board-gallery-video').forEach(tile => {
      tile.addEventListener('click', () => {
        closeViewBoardModal();
        openVideoLightbox(id, parseInt(tile.getAttribute('data-video-idx'), 10));
      });
    });
  }

  modal.style.display = 'flex';
}

function closeViewBoardModal() {
  const modal = el('mbViewBoardModal');
  if (modal) modal.style.display = 'none';
}

// ── Video lightbox (admin side) ──
// Deliberately simpler than openAdminMoodBoardLightbox above: no
// annotate toolbar, no prev/next stepping between videos - just plays
// the one video that was clicked. Reads from the SAVED board (like the
// image lightbox does), not draftEmbedLinks, for the same reason: this
// is for reviewing what's actually on a saved board, not the
// in-progress form.
function openVideoLightbox(boardId, videoIdx) {
  const client = currentClient();
  if (!client) return;
  const board = (client.moodBoards || []).find(b => b.id === boardId);
  if (!board) return;
  const videos = (board.embedLinks || []).filter(isVideoEntry);
  const v = videos[videoIdx];
  if (!v) return;

  const overlay = el('mbVideoLightbox');
  const content = el('mbVideoLightboxContent');
  const caption = el('mbVideoLightboxCaption');
  if (!overlay || !content) return;

  content.innerHTML = renderVideoPreviewMarkup(v).replace('<video ', '<video autoplay ');
  if (caption) caption.textContent = v.label || '';
  overlay.style.display = 'flex';
}

function closeVideoLightbox() {
  const overlay = el('mbVideoLightbox');
  const content = el('mbVideoLightboxContent');
  if (overlay) overlay.style.display = 'none';
  // Clearing the markup (rather than just hiding it) stops an uploaded
  // <video> or an embedded iframe's audio/video from continuing to play
  // in the background after the modal closes.
  if (content) content.innerHTML = '';
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
// Id of an existing admin-authored annotation currently being edited, or
// null when the popup is being used to add a brand new one instead - see
// startEditAdminAnnotation and saveAdminAnnotationDraft below.
let adminEditingAnnotationId = null;

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
  const pinsLayer = el('mbAdminAnnotationPinsLayer');
  if (!svg || !pinsLayer || !current) return;

  const annotations = getAdminImageAnnotations(current.id);
  svg.innerHTML = '';
  svg.setAttribute('viewBox', '0 0 100 100');
  pinsLayer.innerHTML = '';

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
      const marker = document.createElement('div');
      marker.className = 'moodboard-pin-marker' + (isAdmin ? ' admin-note' : '');
      marker.style.left = a.x + '%';
      marker.style.top = a.y + '%';
      marker.textContent = String(num);
      marker.title = a.comment;
      marker.addEventListener('click', () => scrollToAdminAnnotationItem(a.id));
      pinsLayer.appendChild(marker);
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
      ${a.author === 'admin' ? `
      <button type="button" class="moodboard-annotation-item-edit" data-id="${escapeHtml(a.id)}" aria-label="Edit note" title="Edit">✎</button>
      <button type="button" class="moodboard-annotation-item-delete" data-id="${escapeHtml(a.id)}" aria-label="Delete note" title="Delete">✕</button>
      ` : ''}
    </div>
  `).join('');
  list.querySelectorAll('.moodboard-annotation-item-edit').forEach(btn => {
    btn.addEventListener('click', () => startEditAdminAnnotation(btn.getAttribute('data-id')));
  });
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

// prefillComment is only passed by startEditAdminAnnotation below - a
// brand new note (adminPendingAnnotationDraft set instead) always starts
// blank. Title/Save-button text switch based on adminEditingAnnotationId
// so it's visually obvious which mode the popup is in.
function showAdminAnnotationPopup(clientX, clientY, prefillComment) {
  const popup = el('mbAdminAnnotationPopup');
  const input = el('mbAdminAnnotationCommentInput');
  const title = el('mbAdminAnnotationPopupTitle');
  const saveBtn = el('mbAdminAnnotationSaveBtn');
  if (!popup || !input) return;
  input.value = prefillComment || '';
  if (title) title.textContent = adminEditingAnnotationId ? 'Edit note' : 'Internal note';
  if (saveBtn) saveBtn.textContent = adminEditingAnnotationId ? 'Update Note' : 'Save Note';
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
  adminEditingAnnotationId = null;
}

// Opens the same popup a new note uses, pre-filled with an existing
// admin-authored annotation's text - positioned over that annotation's
// own marker on the image (same percent-to-pixel math the pin/circle
// tools use when placing a new one) so it doesn't pop up somewhere
// unrelated. Only admin's own notes are editable, same restriction
// deleteAdminAnnotation already enforces - a client's note is never
// something the Hub side should be able to silently rewrite.
function startEditAdminAnnotation(id) {
  const current = currentAdminAnnotationImage();
  if (!current) return;
  const list = getAdminImageAnnotations(current.id);
  const annotation = list.find(a => a.id === id);
  if (!annotation || annotation.author !== 'admin') return;

  const wrap = el('mbAdminImageWrap');
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const clientX = rect.left + (annotation.x / 100) * rect.width;
  const clientY = rect.top + (annotation.y / 100) * rect.height;

  adminPendingAnnotationDraft = null;
  adminEditingAnnotationId = id;
  showAdminAnnotationPopup(clientX, clientY, annotation.comment);
}

function saveAdminAnnotationDraft() {
  const input = el('mbAdminAnnotationCommentInput');
  const comment = input ? input.value.trim() : '';
  if (!comment) { hideAdminAnnotationPopup(); return; }

  const client = currentClient();
  const current = currentAdminAnnotationImage();
  if (!client || !current) { hideAdminAnnotationPopup(); return; }

  // Editing an existing note in place - only the comment text (and an
  // editedAt stamp) changes. Position/type/id/author/createdAt all stay
  // exactly as they were, so this can't be confused with a brand new note
  // by anything reading moodBoardAnnotations later.
  if (adminEditingAnnotationId) {
    const boardMap = (client.moodBoardAnnotations && client.moodBoardAnnotations[adminLightboxBoardId]) || {};
    const list = Array.isArray(boardMap[current.id]) ? boardMap[current.id] : [];
    const annotation = list.find(a => a.id === adminEditingAnnotationId);
    if (annotation) {
      annotation.comment = comment;
      annotation.editedAt = new Date().toISOString();
    }
    hideAdminAnnotationPopup();
    renderAdminAnnotations();
    persist();
    return;
  }

  if (!adminPendingAnnotationDraft) { hideAdminAnnotationPopup(); return; }

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
  if (window.initDismissibleCards) initDismissibleCards();

  populateClientSelect();
  el('clientSelect').addEventListener('change', renderState);
  el('saveBoardBtn').addEventListener('click', saveBoard);
  el('cancelEditBtn').addEventListener('click', resetForm);
  if (el('migrateImagesBtn')) el('migrateImagesBtn').addEventListener('click', migrateClientImagesToStorage);
  el('addEmbedBtn').addEventListener('click', addDraftEmbedLink);
  wireDropZone(el('imageDropZone'), el('imageFileInput'), handleDroppedImage);
  wireDropZone(el('videoDropZone'), el('videoFileInput'), handleDroppedVideo);

  // Same iframe-race fix used across the other client-aware modules: the
  // parent Hub's client database loads asynchronously, so poll briefly
  // and re-populate the dropdown once real data shows up.
  let clientPollAttempts = 0;
  const clientPoll = setInterval(() => {
    clientPollAttempts++;
    const hasClients = Object.keys(getClients()).length > 0;
    if (hasClients || clientPollAttempts > 30) {
      clearInterval(clientPoll);
      if (hasClients) {
        populateClientSelect();
        renderState();
      }
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

document.addEventListener('DOMContentLoaded', () => {
  const overlay = el('mbVideoLightbox');
  if (!overlay) return;
  el('mbVideoLightboxClose')?.addEventListener('click', closeVideoLightbox);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeVideoLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (overlay.style.display === 'flex' && e.key === 'Escape') closeVideoLightbox();
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const overlay = el('mbViewBoardModal');
  if (!overlay) return;
  el('mbViewBoardClose')?.addEventListener('click', closeViewBoardModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeViewBoardModal();
  });
  document.addEventListener('keydown', (e) => {
    if (overlay.style.display === 'flex' && e.key === 'Escape') closeViewBoardModal();
  });
});
