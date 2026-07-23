/* ============================================================
   VENUE TECH-SPEC LIBRARY — APP LOGIC
   Agency-wide reference library (not tied to a single client, and
   not tied to a single job): stores its own list at agency/venueTechSpecs.
   Same optimistic-concurrency version-guard pattern as the other
   full-overwrite trackers (Release Forms, Run of Show, Team Roster).

   Venues get reused across many different clients/events, so this
   deliberately has no client field — it's a building reference, not
   a job log.
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
let expandedId = null;
let docVersion = 0; // optimistic-concurrency guard, see persist() below

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "venueTechSpecs");
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
      console.error("Couldn't load venue tech specs from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load venue tech specs: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('venue-tech-spec-library-list');
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
      console.error("Couldn't save venue entry:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't save — your change may be lost: " + e.message);
      return false;
    }
  }
  try { localStorage.setItem('venue-tech-spec-library-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'vts-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function populateVenueDatalist() {
  const list = el('venueOptions');
  const names = [...new Set(entries.map(e => e.venueName).filter(Boolean))].sort();
  list.innerHTML = names.map(name => `<option value="${name}">`).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

const FORM_FIELDS = ['venueName', 'address', 'contactName', 'contactPhone', 'networkAvailability', 'lastUsedDate', 'power', 'rigging', 'loadIn', 'notes'];

function resetForm() {
  editingId = null;
  FORM_FIELDS.forEach(id => { el(id).value = ''; });
  el('saveEntryBtn').textContent = 'Log Venue';
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => { entry[id] = el(id).value.trim(); });
  return entry;
}

function saveEntry() {
  const venueName = el('venueName').value.trim();
  if (!venueName) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Venue name is required.');
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
    populateVenueDatalist();
    renderTable();
    if (window.parent.showBanner) window.parent.showBanner('success', `Logged ${venueName}.`);
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
  if (!confirm(`Remove ${entry.venueName} from the library?`)) return;
  entries = entries.filter(e => e.id !== id);
  if (expandedId === id) expandedId = null;
  persist().then(ok => {
    if (!ok) return;
    if (editingId === id) resetForm();
    populateVenueDatalist();
    renderTable();
  });
}

function toggleExpand(id) {
  expandedId = expandedId === id ? null : id;
  renderTable();
}

function renderSummary() {
  el('summaryTotal').textContent = entries.length;
}

function renderTable() {
  renderSummary();

  const filter = el('filterInput').value.trim().toLowerCase();
  const rows = entries.filter(e => !filter || (e.venueName || '').toLowerCase().includes(filter));

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const tr = document.createElement('tr');
    const contactBits = [entry.contactName, entry.contactPhone].filter(Boolean).join(' — ');
    tr.innerHTML = `
      <td class="client-cell">${escapeHtml(entry.venueName)}</td>
      <td>${escapeHtml(entry.address) || '--'}</td>
      <td>${escapeHtml(contactBits) || '--'}</td>
      <td class="date-cell">${escapeHtml(entry.lastUsedDate) || '--'}</td>
      <td>
        <div class="row-actions">
          <button class="view-btn" data-id="${entry.id}">${expandedId === entry.id ? 'Hide' : 'View'}</button>
          <button class="edit-btn" data-id="${entry.id}">Edit</button>
          <button class="remove-btn" data-id="${entry.id}">Remove</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);

    if (expandedId === entry.id) {
      const detailTr = document.createElement('tr');
      detailTr.className = 'detail-row';
      detailTr.innerHTML = `
        <td colspan="5">
          <div class="detail-row-inner" style="grid-template-columns: 1fr 1fr 1fr;">
            <div class="detail-panel">
              <h4>Power / Circuits</h4>
              ${entry.power ? `<pre>${escapeHtml(entry.power)}</pre>` : `<p class="empty-hint">Not logged yet.</p>`}
            </div>
            <div class="detail-panel">
              <h4>Rigging Points & Weight Limits</h4>
              ${entry.rigging ? `<pre>${escapeHtml(entry.rigging)}</pre>` : `<p class="empty-hint">Not logged yet.</p>`}
            </div>
            <div class="detail-panel">
              <h4>Load-In Access</h4>
              ${entry.loadIn ? `<pre>${escapeHtml(entry.loadIn)}</pre>` : `<p class="empty-hint">Not logged yet.</p>`}
            </div>
          </div>
          ${entry.networkAvailability || entry.notes ? `<div class="detail-row-inner" style="padding-top:0;">
            ${entry.networkAvailability ? `<div class="detail-panel"><h4>Network / Wi-Fi</h4><pre>${escapeHtml(entry.networkAvailability)}</pre></div>` : ''}
            ${entry.notes ? `<div class="detail-panel"><h4>Notes</h4><pre>${escapeHtml(entry.notes)}</pre></div>` : ''}
          </div>` : ''}
        </td>
      `;
      tbody.appendChild(detailTr);
    }
  });

  document.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', () => toggleExpand(btn.getAttribute('data-id'))));
  document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => startEdit(btn.getAttribute('data-id'))));
  document.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => removeEntry(btn.getAttribute('data-id'))));
}

document.addEventListener('DOMContentLoaded', async () => {
  resetForm();
  await loadEntries();
  populateVenueDatalist();
  renderTable();

  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('filterInput').addEventListener('input', renderTable);
});
