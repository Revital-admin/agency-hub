/* ============================================================
   SHOT LIST BUILDER — APP LOGIC
   (agency-wide: not tied to a single client, stores its own list
   at agency/shotList rather than living inside clientsDb).
   Same pattern as Release Forms Tracker and Call Sheet Builder -
   a flat log of shots across every shoot, filterable by client,
   defaulting to what's not captured yet so the list doubles as a
   day-of "what's left" view instead of just a historical record.
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
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "shotList");
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
      console.error("Couldn't load shot list from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load shot list: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('shot-list-builder-list');
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
      if (result.reason === 'error') console.error("Couldn't save shot entry:", result.error);
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
  try { localStorage.setItem('shot-list-builder-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'sh-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

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

const FORM_FIELDS = ['clientName', 'projectTitle', 'shotNumber', 'shotType', 'location', 'status', 'shotDescription', 'notes'];

function resetForm() {
  editingId = null;
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    if (field.tagName === 'SELECT') field.value = field.options[0].value;
    else field.value = '';
  });
  el('saveEntryBtn').textContent = 'Add Shot';
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => { entry[id] = el(id).value.trim(); });
  return entry;
}

function saveEntry() {
  const clientName = el('clientName').value.trim();
  const shotDescription = el('shotDescription').value.trim();
  if (!clientName || !shotDescription) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Client name and shot description are required.');
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
    if (window.parent.showBanner) window.parent.showBanner('success', `Added shot for ${clientName}.`);
  });
}

function startEdit(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  FORM_FIELDS.forEach(fieldId => { el(fieldId).value = entry[fieldId] || ''; });
  el('saveEntryBtn').textContent = 'Update Shot';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Remove shot ${entry.shotNumber || ''} — ${entry.shotDescription}?`)) return;
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
  return (status || 'Planned').toLowerCase().replace(/\s+/g, '-');
}

function renderSummary() {
  const planned = entries.filter(e => e.status === 'Planned');
  const reshoot = entries.filter(e => e.status === 'Needs Reshoot');
  const captured = entries.filter(e => e.status === 'Captured');
  el('summaryPlanned').textContent = planned.length;
  el('summaryReshoot').textContent = reshoot.length;
  el('summaryCaptured').textContent = captured.length;
}

function renderTable() {
  renderSummary();

  const filterClient = el('filterClientInput').value.trim().toLowerCase();
  const showAllStatuses = el('showAllStatusesToggle').checked;
  const rows = entries
    .filter(e => !filterClient || e.clientName.toLowerCase().includes(filterClient))
    .filter(e => showAllStatuses || e.status !== 'Captured');

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const statusClass = 'status-' + statusSlug(entry.status);
    const tr = document.createElement('tr');
    tr.className = entry.status === 'Needs Reshoot' ? 'row-pending' : '';
    tr.innerHTML = `
      <td class="client-cell">${entry.clientName}</td>
      <td>${entry.projectTitle || '--'}</td>
      <td>${entry.shotNumber || '--'}</td>
      <td>${entry.shotDescription}</td>
      <td>${entry.shotType || '--'}</td>
      <td><span class="section-tag ${statusClass}">${entry.status || 'Planned'}</span></td>
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

// ── Download PDF ──
// Exports exactly what's currently on screen - same filterClient/
// showAllStatuses state the table itself uses - so "Download PDF" always
// matches what you're looking at rather than silently exporting
// everything regardless of the active filter. This is the one Production
// tracker meant to be carried on set rather than just reviewed on a
// screen, which is why it gets this and Release Forms/Permit Tracker/
// Wrap Report don't.
function downloadShotListPdf() {
  const filterClient = el('filterClientInput').value.trim().toLowerCase();
  const showAllStatuses = el('showAllStatusesToggle').checked;
  const rows = entries
    .filter(e => !filterClient || e.clientName.toLowerCase().includes(filterClient))
    .filter(e => showAllStatuses || e.status !== 'Captured');

  if (!rows.length) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'No shots to export with the current filter.');
    return;
  }

  const btn = el('downloadPdfBtn');
  const origHtml = btn.innerHTML;
  btn.disabled = true; btn.textContent = 'Generating...';

  try {
    if (typeof window.RevitalPDF === 'undefined') {
      alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
      return;
    }
    const companyName = filterClient ? rows[0].clientName : 'All Clients';
    const r = RevitalPDF.create({ reportTitle: 'SHOT LIST', companyName });

    r.coverPage({
      title: 'Shot List',
      subLine: new Date().toLocaleDateString(),
      objective: showAllStatuses ? undefined : 'Shots still needed - captured shots are hidden. Check "Show captured shots" before exporting for the full list.',
    });

    r.newPage();
    r.sectionHeader('Shots');
    r.tableBlock(
      ['Client', 'Project', '#', 'Description', 'Type', 'Status'],
      rows.map(e => [e.clientName, e.projectTitle || '--', e.shotNumber || '--', e.shotDescription, e.shotType || '--', e.status || 'Planned']),
      [70, 85, 30, 150, 65, 65]
    );

    r.save(`Shot_List_${companyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (e) {
    console.error('Shot list PDF error:', e);
    alert('Something went wrong generating the PDF: ' + (e && e.message ? e.message : e));
  }

  btn.disabled = false; btn.innerHTML = origHtml;
}

document.addEventListener('DOMContentLoaded', async () => {
  populateClientDatalist();
  resetForm();
  await loadEntries();
  renderTable();

  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('filterClientInput').addEventListener('input', renderTable);
  el('showAllStatusesToggle').addEventListener('change', renderTable);
  el('downloadPdfBtn').addEventListener('click', downloadShotListPdf);

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
