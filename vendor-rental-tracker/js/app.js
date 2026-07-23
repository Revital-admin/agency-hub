/* ============================================================
   VENDOR / RENTAL & COI TRACKER — APP LOGIC
   Agency-wide (not tied to a single client's data blob): stores its
   own list at agency/vendorRentalTracker, same optimistic-concurrency
   version-guard pattern as Release Forms / Run of Show / Team Roster.

   Covers two related but distinct things in one lightweight log:
   (1) gear rented FROM outside companies for a job, and
   (2) certificates of insurance on file for vendors/subcontractors
       brought onto a job. Many venues require a COI before load-in,
       so COI status gets its own flagging in the summary bar.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

let entries = [];
let editingId = null;
let docVersion = 0; // optimistic-concurrency guard, see persist() below

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "vendorRentalTracker");
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
      console.error("Couldn't load vendor/rental entries from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load vendor/rental entries: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('vendor-rental-tracker-list');
    entries = saved ? JSON.parse(saved) : [];
  } catch (e) { entries = []; }
}

async function persist() {
  if (isEmbedded && window.parent.firebaseSetDocFromJSON && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const freshSnap = await window.parent.firebaseGetDoc(ref);
      const freshData = freshSnap && freshSnap.exists ? freshSnap.data() : null;
      const freshVersion = (freshData && freshData.version) || 0;

      if (freshVersion !== docVersion) {
        if (window.parent.showBanner) {
          window.parent.showBanner('error', "Someone else updated this list while you had it open. Reload the page to see their changes, then redo your edit.");
        }
        return false;
      }

      docVersion = freshVersion + 1;
      await window.parent.firebaseSetDocFromJSON(ref, JSON.stringify({ list: entries, version: docVersion }));
      return true;
    } catch (e) {
      console.error("Couldn't save vendor/rental entry:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't save — your change may be lost: " + e.message);
      return false;
    }
  }
  try { localStorage.setItem('vendor-rental-tracker-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'vrt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function getClients() {
  if (isEmbedded && typeof window.parent.getAllClients === 'function') {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  return {};
}

function populateDatalists() {
  const clientList = el('clientOptions');
  const clients = getClients();
  clientList.innerHTML = Object.keys(clients).sort().map(name => `<option value="${name}">`).join('');

  const vendorList = el('vendorOptions');
  const vendorNames = [...new Set(entries.map(e => e.vendorName).filter(Boolean))].sort();
  vendorList.innerHTML = vendorNames.map(name => `<option value="${name}">`).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function coiSlug(status) {
  return 'status-' + (status || 'Not Required').toLowerCase().replace(/[^a-z]/g, '');
}

const FORM_FIELDS = ['vendorName', 'recordType', 'itemService', 'jobReference', 'startDate', 'endDate', 'cost', 'status', 'coiStatus', 'coiExpiration', 'conditionNotes', 'notes'];

function resetForm() {
  editingId = null;
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    if (field.tagName === 'SELECT') field.value = field.options[0].value;
    else field.value = '';
  });
  el('saveEntryBtn').textContent = 'Log Entry';
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => { entry[id] = el(id).value.trim ? el(id).value.trim() : el(id).value; });
  return entry;
}

function saveEntry() {
  const vendorName = el('vendorName').value.trim();
  const itemService = el('itemService').value.trim();
  if (!vendorName || !itemService) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Vendor name and item/service are required.');
    return;
  }

  const entry = gatherForm();
  if (editingId) {
    const idx = entries.findIndex(e => e.id === editingId);
    if (idx >= 0) entries[idx] = entry;
  } else {
    entries.unshift(entry);
  }

  persist().then(ok => {
    if (!ok) return;
    resetForm();
    populateDatalists();
    renderTable();
    if (window.parent.showBanner) window.parent.showBanner('success', `Logged ${itemService} — ${vendorName}.`);
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
  if (!confirm(`Remove the entry for ${entry.vendorName} — ${entry.itemService}?`)) return;
  entries = entries.filter(e => e.id !== id);
  persist().then(ok => {
    if (!ok) return;
    if (editingId === id) resetForm();
    populateDatalists();
    renderTable();
  });
}

function renderSummary() {
  const active = entries.filter(e => e.status === 'Active');
  const flagged = entries.filter(e => e.coiStatus === 'Missing' || e.coiStatus === 'Expired');
  el('summaryActive').textContent = active.length;
  el('summaryMissingCoi').textContent = flagged.length;
  el('summaryTotal').textContent = entries.length;
}

function renderTable() {
  renderSummary();

  const filter = el('filterInput').value.trim().toLowerCase();
  const rows = entries.filter(e => !filter || (e.vendorName || '').toLowerCase().includes(filter));

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const flagged = entry.coiStatus === 'Missing' || entry.coiStatus === 'Expired';
    const tr = document.createElement('tr');
    tr.className = flagged ? 'row-coi-flag' : '';
    const dateRange = [entry.startDate, entry.endDate].filter(Boolean).join(' → ') || '--';
    const costText = entry.cost ? `$${Number(entry.cost).toLocaleString()}` : '';
    tr.innerHTML = `
      <td class="client-cell">${escapeHtml(entry.vendorName)}</td>
      <td><span class="section-tag">${escapeHtml(entry.recordType) || '--'}</span></td>
      <td>${escapeHtml(entry.itemService) || '--'}${costText ? ` <span style="color:var(--color-text-muted);">(${costText})</span>` : ''}</td>
      <td>${escapeHtml(entry.jobReference) || '--'}</td>
      <td class="date-cell">${escapeHtml(dateRange)}</td>
      <td><span class="section-tag ${coiSlug(entry.coiStatus)}">${escapeHtml(entry.coiStatus) || 'Not Required'}</span></td>
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
  resetForm();
  await loadEntries();
  populateDatalists();
  renderTable();

  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('filterInput').addEventListener('input', renderTable);

  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    if (Object.keys(getClients()).length > 0) {
      populateDatalists();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
