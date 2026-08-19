/* ============================================================
   RAW FOOTAGE & DELIVERY TRACKER — APP LOGIC
   (agency-wide: not tied to a single client, stores its own list
   at agency/rawFootageLog rather than living inside clientsDb).
   Tracks where raw footage lives, backup status, delivery status,
   and when it's safe to archive/delete - a paper trail from shoot
   to delivery to archive so nothing gets lost or kept forever by
   accident.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const SANDBOX_NAME = "Quick Sandbox (One-Offs)";

let entries = [];
let editingId = null;
let docVersion = 0; // optimistic-concurrency guard, see persist() below

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "rawFootageLog");
}

async function loadEntries() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      entries = (data && data.list) || [];
      docVersion = (data && data.version) || 0;
      return;
    } catch (e) {
      console.error("Couldn't load footage log from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load the footage log: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('raw-footage-tracker-list');
    entries = saved ? JSON.parse(saved) : [];
  } catch (e) { entries = []; }
}

// Optimistic-concurrency guard, same pattern as the other full-overwrite
// trackers: re-check the doc's version right before writing and refuse
// to clobber a newer save made elsewhere in the meantime.
async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: entries, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save footage log:", result.error);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', result.reason === 'conflict'
          ? "Someone else updated this log while you had it open. Reload the page to see their changes, then redo your edit."
          : "Couldn't save — your change may be lost: " + result.error.message);
      }
      return false;
    }
    docVersion = result.version;
    return true;
  }
  try { localStorage.setItem('raw-footage-tracker-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'rf-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function getClients() {
  if (isEmbedded && typeof window.parent.getAllClients === 'function') {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  return {};
}

function populateClientDatalist() {
  const list = el('clientOptions');
  const clients = getClients();
  list.innerHTML = Object.keys(clients).filter(name => name !== SANDBOX_NAME).sort().map(name => `<option value="${name}">`).join('');
}

const FORM_FIELDS = [
  'clientName', 'projectTitle', 'shootDate', 'footageSize', 'storageLocation', 'backupStatus',
  'editorAssigned', 'deliveryStatus', 'deliveryDate', 'archiveStatus', 'archiveDate', 'notes'
];

function resetForm() {
  editingId = null;
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    if (field.tagName === 'SELECT') field.value = field.options[0].value;
    else field.value = '';
  });
  el('saveEntryBtn').textContent = 'Log Footage';
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => { entry[id] = el(id).value.trim(); });
  return entry;
}

function saveEntry() {
  const clientName = el('clientName').value.trim();
  const projectTitle = el('projectTitle').value.trim();
  if (!clientName || !projectTitle) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Client name and project title are required.');
    return;
  }

  const entry = gatherForm();
  // Snapshot before mutating - idx-assign/unshift edit the array in place,
  // so we need the actual old contents (not just a reference) to undo it.
  const previous = entries.slice();
  if (editingId) {
    const idx = entries.findIndex(e => e.id === editingId);
    if (idx >= 0) entries[idx] = entry;
  } else {
    entries.unshift(entry);
  }

  persist().then(ok => {
    if (!ok) {
      entries = previous; // roll back so the failed save doesn't linger in memory as if it stuck
      return;
    }
    resetForm();
    populateClientDatalist();
    renderTable();
    if (window.parent.showBanner) window.parent.showBanner('success', `Logged footage for ${clientName} — ${projectTitle}.`);
  });
}

function startEdit(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  FORM_FIELDS.forEach(fieldId => { el(fieldId).value = entry[fieldId] || ''; });
  el('saveEntryBtn').textContent = 'Update Entry';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Remove the footage log entry for ${entry.clientName} — ${entry.projectTitle}?`)) return;
  const previous = entries;
  entries = entries.filter(e => e.id !== id);
  persist().then(ok => {
    if (!ok) {
      entries = previous; // roll back on a failed write
      return;
    }
    if (editingId === id) resetForm();
    renderTable();
  });
}

function renderSummary() {
  const notBackedUp = entries.filter(e => e.backupStatus === 'Not Backed Up');
  const inEditing = entries.filter(e => e.deliveryStatus === 'In Editing' || e.deliveryStatus === 'Client Review');
  const readyToArchive = entries.filter(e => e.archiveStatus === 'Ready to Archive');

  el('summaryNotBackedUp').textContent = notBackedUp.length;
  el('summaryInEditing').textContent = inEditing.length;
  el('summaryReadyToArchive').textContent = readyToArchive.length;
}

function renderTable() {
  renderSummary();

  const showArchived = el('showArchivedToggle').checked;
  const filterClient = el('filterClientInput').value.trim().toLowerCase();

  const rows = entries.filter(e => {
    if (!showArchived && (e.archiveStatus === 'Archived' || e.archiveStatus === 'Scheduled for Deletion')) return false;
    if (filterClient && !e.clientName.toLowerCase().includes(filterClient)) return false;
    return true;
  });

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const atRisk = entry.backupStatus === 'Not Backed Up';
    const settled = entry.deliveryStatus === 'Delivered' && (entry.archiveStatus === 'Archived' || entry.archiveStatus === 'Scheduled for Deletion');
    const deliveryClass = entry.deliveryStatus === 'Delivered' ? 'delivery-delivered' : 'delivery-progress';
    const archiveClass = (entry.archiveStatus === 'Ready to Archive' || entry.archiveStatus === 'Scheduled for Deletion') ? 'archive-scheduled' : 'archive-neutral';

    const tr = document.createElement('tr');
    tr.className = atRisk ? 'row-risk' : (settled ? 'row-settled' : '');
    tr.innerHTML = `
      <td class="client-cell">${entry.clientName}</td>
      <td>${entry.projectTitle}</td>
      <td class="date-cell">${entry.shootDate || '--'}</td>
      <td>${entry.storageLocation || '--'}</td>
      <td><span class="section-tag ${atRisk ? 'backup-not' : 'backup-ok'}">${entry.backupStatus || '--'}</span></td>
      <td><span class="section-tag ${deliveryClass}">${entry.deliveryStatus || '--'}</span></td>
      <td><span class="section-tag ${archiveClass}">${entry.archiveStatus || '--'}</span></td>
      <td>
        <div class="row-actions">
          <button class="edit-btn" data-id="${entry.id}">Edit</button>
          <button class="remove-btn" data-id="${entry.id}">Remove</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => startEdit(btn.getAttribute('data-id'))));
  document.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => removeEntry(btn.getAttribute('data-id'))));
}

document.addEventListener('DOMContentLoaded', async () => {
  populateClientDatalist();
  resetForm();
  await loadEntries();
  renderTable();

  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('showArchivedToggle').addEventListener('change', renderTable);
  el('filterClientInput').addEventListener('input', renderTable);

  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    if (Object.keys(getClients()).length > 0) {
      populateClientDatalist();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
