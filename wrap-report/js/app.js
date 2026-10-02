/* ============================================================
   WRAP REPORT — APP LOGIC
   (agency-wide: not tied to a single client, stores its own list
   at agency/wrapReports rather than living inside clientsDb).
   Same pattern as Release Forms Tracker, Shot List Builder, and
   Permit Tracker - a flat log across every shoot, filterable by
   client. Unlike those three, this one isn't a to-do queue (a
   wrap report has nothing left to action once it's written), so
   the default filter surfaces Rough-rated shoots instead - the
   ones actually worth someone reading before the next shoot with
   that client - rather than "not yet done" rows.
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
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "wrapReports");
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
      console.error("Couldn't load wrap reports from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load wrap reports: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('wrap-report-list');
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
      if (result.reason === 'error') console.error("Couldn't save wrap report:", result.error);
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
  try { localStorage.setItem('wrap-report-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'wr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

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

const FORM_FIELDS = ['clientName', 'projectTitle', 'shootDate', 'rating', 'scheduleNotes', 'whatWentWell', 'whatWentWrong', 'vendorIssues', 'actionItems'];

function resetForm() {
  editingId = null;
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    if (field.tagName === 'SELECT') field.value = field.options[0].value;
    else field.value = '';
  });
  el('saveEntryBtn').textContent = 'Log Wrap Report';
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => { entry[id] = el(id).value.trim(); });
  return entry;
}

function saveEntry() {
  const clientName = el('clientName').value.trim();
  const shootDate = el('shootDate').value.trim();
  if (!clientName || !shootDate) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Client name and shoot date are required.');
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
    if (window.parent.showBanner) window.parent.showBanner('success', `Logged wrap report for ${clientName}.`);
  });
}

function startEdit(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  FORM_FIELDS.forEach(fieldId => { el(fieldId).value = entry[fieldId] || ''; });
  el('saveEntryBtn').textContent = 'Update Wrap Report';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Remove the wrap report for ${entry.clientName} (${entry.shootDate})?`)) return;
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
  return (status || 'Good').toLowerCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function truncate(str, max) {
  if (!str) return '--';
  return str.length > max ? str.slice(0, max).trim() + '…' : str;
}

function renderSummary() {
  const great = entries.filter(e => e.rating === 'Great');
  const good = entries.filter(e => e.rating === 'Good');
  const rough = entries.filter(e => e.rating === 'Rough');
  el('summaryGreat').textContent = great.length;
  el('summaryGood').textContent = good.length;
  el('summaryRough').textContent = rough.length;
}

function renderTable() {
  renderSummary();

  const filterClient = el('filterClientInput').value.trim().toLowerCase();
  const showAllStatuses = el('showAllStatusesToggle').checked;
  const rows = entries
    .filter(e => !filterClient || e.clientName.toLowerCase().includes(filterClient))
    .filter(e => showAllStatuses || e.rating === 'Rough');

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const statusClass = 'status-' + statusSlug(entry.rating);
    const tr = document.createElement('tr');
    tr.className = entry.rating === 'Rough' ? 'row-pending' : '';
    tr.innerHTML = `
      <td class="client-cell">${escapeHtml(entry.clientName)}</td>
      <td>${escapeHtml(entry.projectTitle) || '--'}</td>
      <td class="date-cell">${escapeHtml(entry.shootDate)}</td>
      <td><span class="section-tag ${statusClass}">${escapeHtml(entry.rating) || 'Good'}</span></td>
      <td class="wrap-text">${escapeHtml(truncate(entry.actionItems, 100))}</td>
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
