/* ============================================================
   PERMIT TRACKER — APP LOGIC
   (agency-wide: not tied to a single client, stores its own list
   at agency/permitTracker rather than living inside clientsDb).
   Same pattern as Release Forms Tracker and Shot List Builder -
   a flat log of permits across every shoot, filterable by client,
   defaulting to what still needs action (Not Started / Applied /
   Denied) so it doubles as a "what's blocking this shoot" view,
   plus a computed Expiring Soon flag (Approved with an expiration
   date inside the next 30 days) since an expired permit on
   shoot day is the whole point of tracking these at all.
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
const EXPIRING_SOON_DAYS = 30;

let entries = [];
let editingId = null;
let docVersion = 0; // optimistic-concurrency guard, see persist() below

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "permitTracker");
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
      console.error("Couldn't load permits from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load permits: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('permit-tracker-list');
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
      if (result.reason === 'error') console.error("Couldn't save permit entry:", result.error);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', result.reason === 'conflict'
          ? "Someone else updated this list while you had it open. Reload the page to see their changes, then redo your edit."
          : "Couldn't save — your change may be lost: " + result.error.message);
      }
      return false;
    }
    docVersion = result.version;
    return true;
  }
  try { localStorage.setItem('permit-tracker-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'pm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

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

const FORM_FIELDS = ['clientName', 'projectTitle', 'permitType', 'issuingAuthority', 'location', 'status', 'applicationDate', 'expirationDate', 'permitDocLink', 'notes'];

function resetForm() {
  editingId = null;
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    if (field.tagName === 'SELECT') field.value = field.options[0].value;
    else field.value = '';
  });
  el('saveEntryBtn').textContent = 'Log Permit';
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => { entry[id] = el(id).value.trim(); });
  return entry;
}

function saveEntry() {
  const clientName = el('clientName').value.trim();
  const location = el('location').value.trim();
  if (!clientName || !location) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Client name and location are required.');
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
    if (window.parent.showBanner) window.parent.showBanner('success', `Logged permit for ${clientName}.`);
  });
}

function startEdit(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  FORM_FIELDS.forEach(fieldId => { el(fieldId).value = entry[fieldId] || ''; });
  el('saveEntryBtn').textContent = 'Update Permit';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Remove the ${entry.permitType || 'permit'} entry for ${entry.clientName}?`)) return;
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

function statusSlug(status) {
  return (status || 'Not Started').toLowerCase().replace(/\s+/g, '-');
}

// Approved and expiring inside the next 30 days - the one thing this
// tracker exists to catch before it becomes a problem on shoot day.
function isExpiringSoon(entry) {
  if (entry.status !== 'Approved' || !entry.expirationDate) return false;
  const expires = new Date(entry.expirationDate + 'T00:00:00');
  if (isNaN(expires.getTime())) return false;
  const daysUntil = (expires - new Date()) / (1000 * 60 * 60 * 24);
  return daysUntil >= 0 && daysUntil <= EXPIRING_SOON_DAYS;
}

function renderSummary() {
  const pending = entries.filter(e => ['Not Started', 'Applied', 'Denied'].includes(e.status || 'Not Started'));
  const approved = entries.filter(e => e.status === 'Approved');
  const expiring = entries.filter(isExpiringSoon);
  el('summaryPending').textContent = pending.length;
  el('summaryApproved').textContent = approved.length;
  el('summaryExpiring').textContent = expiring.length;
}

function renderTable() {
  renderSummary();

  const filterClient = el('filterClientInput').value.trim().toLowerCase();
  const showAllStatuses = el('showAllStatusesToggle').checked;
  const rows = entries
    .filter(e => !filterClient || e.clientName.toLowerCase().includes(filterClient))
    .filter(e => showAllStatuses || e.status !== 'Approved' || isExpiringSoon(e));

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const statusClass = 'status-' + statusSlug(entry.status);
    const expiringSoon = isExpiringSoon(entry);
    const tr = document.createElement('tr');
    tr.className = expiringSoon ? 'row-expiring' : (['Not Started', 'Applied'].includes(entry.status || 'Not Started') ? 'row-pending' : '');
    tr.innerHTML = `
      <td class="client-cell">${entry.clientName}</td>
      <td>${entry.projectTitle || '--'}</td>
      <td>${entry.permitType || '--'}</td>
      <td>${entry.location}</td>
      <td class="date-cell">${entry.expirationDate || '--'}${expiringSoon ? ' ⚠️' : ''}</td>
      <td><span class="section-tag ${statusClass}">${entry.status || 'Not Started'}</span></td>
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
  el('filterClientInput').addEventListener('input', renderTable);
  el('showAllStatusesToggle').addEventListener('change', renderTable);

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
