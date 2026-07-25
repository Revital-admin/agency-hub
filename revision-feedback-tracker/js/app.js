/* ============================================================
   REVISION & FEEDBACK TRACKER — APP LOGIC
   (agency-wide: not tied to a single client, stores its own list
   at agency/revisionFeedbackLog rather than living inside clientsDb).
   A lightweight log of client revision requests — client, deliverable,
   round, reason, turnaround — separate from ClickUp's task-level
   revision workflow. Meant for spotting patterns across clients
   (chronic revisions, slow turnaround), not for running production.
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
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "revisionFeedbackLog");
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
      console.error("Couldn't load revision log from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load the revision log: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('revision-feedback-tracker-list');
    entries = saved ? JSON.parse(saved) : [];
  } catch (e) { entries = []; }
}

// Optimistic-concurrency guard, same pattern as the other full-overwrite
// trackers: re-check the doc's version right before writing and refuse
// to clobber a newer save made elsewhere in the meantime.
async function persist() {
  if (isEmbedded && window.parent.firebaseSetDoc && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const freshSnap = await window.parent.firebaseGetDoc(ref);
      const freshData = freshSnap && freshSnap.exists ? freshSnap.data() : null;
      const freshVersion = (freshData && freshData.version) || 0;

      if (freshVersion !== docVersion) {
        if (window.parent.showBanner) {
          window.parent.showBanner('error', "Someone else updated this log while you had it open. Reload the page to see their changes, then redo your edit.");
        }
        return false;
      }

      docVersion = freshVersion + 1;
      // A plain object literal built in this iframe's own JS realm gets
      // rejected by Firestore ("a custom Object object") when handed
      // straight to a Firestore call bound to the parent page - pass a
      // JSON string instead so the parent parses it in its own realm.
      await window.parent.firebaseSetDocFromJSON(ref, JSON.stringify({ list: entries, version: docVersion }));
      return true;
    } catch (e) {
      console.error("Couldn't save revision log:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't save — your change may be lost: " + e.message);
      return false;
    }
  }
  try { localStorage.setItem('revision-feedback-tracker-list', JSON.stringify(entries)); } catch (e) {}
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

const FORM_FIELDS = ['clientName', 'deliverableName', 'revisionRound', 'requestedBy', 'dateRequested', 'dateResolved', 'reason', 'notes'];

function todayStr() {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

function toDateOnly(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function daysBetween(fromStr, toStrVal) {
  const from = toDateOnly(fromStr);
  const to = toDateOnly(toStrVal);
  return Math.round((to - from) / 86400000);
}

function resetForm() {
  editingId = null;
  FORM_FIELDS.forEach(id => { el(id).value = ''; });
  el('revisionRound').value = '1';
  el('dateRequested').value = todayStr();
  el('saveEntryBtn').textContent = 'Log Revision';
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => { entry[id] = el(id).value.trim(); });
  return entry;
}

function saveEntry() {
  const clientName = el('clientName').value.trim();
  const deliverableName = el('deliverableName').value.trim();
  if (!clientName || !deliverableName) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Client name and deliverable are required.');
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
    populateClientDatalist();
    renderTable();
    if (window.parent.showBanner) window.parent.showBanner('success', `Logged revision for ${clientName} — ${deliverableName}.`);
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
  if (!confirm(`Remove the revision log entry for ${entry.clientName} — ${entry.deliverableName}?`)) return;
  entries = entries.filter(e => e.id !== id);
  persist().then(ok => {
    if (!ok) return;
    if (editingId === id) resetForm();
    renderTable();
  });
}

function renderSummary() {
  const openRows = entries.filter(e => !e.dateResolved);
  const overdue = openRows.filter(e => e.dateRequested && daysBetween(e.dateRequested, todayStr()) >= 3);

  const thirtyDaysAgo = (() => {
    const dt = toDateOnly(todayStr());
    dt.setDate(dt.getDate() - 30);
    return dt.toISOString().slice(0, 10);
  })();
  const recentResolved = entries.filter(e => e.dateResolved && e.dateRequested && e.dateResolved >= thirtyDaysAgo);
  const avgTurnaround = recentResolved.length
    ? Math.round(recentResolved.reduce((sum, e) => sum + daysBetween(e.dateRequested, e.dateResolved), 0) / recentResolved.length * 10) / 10
    : null;

  el('summaryOpen').textContent = openRows.length;
  el('summaryOverdue').textContent = overdue.length;
  el('summaryAvgTurnaround').textContent = avgTurnaround === null ? '--' : `${avgTurnaround}d`;
}

function renderTable() {
  renderSummary();

  const showResolved = el('showResolvedToggle').checked;
  const filterClient = el('filterClientInput').value.trim().toLowerCase();

  const rows = entries.filter(e => {
    if (!showResolved && e.dateResolved) return false;
    if (filterClient && !e.clientName.toLowerCase().includes(filterClient)) return false;
    return true;
  });

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const isResolved = !!entry.dateResolved;
    const isOverdue = !isResolved && entry.dateRequested && daysBetween(entry.dateRequested, todayStr()) >= 3;
    const turnaround = isResolved && entry.dateRequested
      ? `${daysBetween(entry.dateRequested, entry.dateResolved)}d`
      : (entry.dateRequested ? `${daysBetween(entry.dateRequested, todayStr())}d open` : '--');

    const tr = document.createElement('tr');
    tr.className = isResolved ? 'row-resolved' : (isOverdue ? 'row-overdue' : '');
    tr.innerHTML = `
      <td class="client-cell">${entry.clientName}</td>
      <td>${entry.deliverableName}</td>
      <td>${entry.revisionRound || '1'}</td>
      <td class="date-cell">${entry.dateRequested || '--'}</td>
      <td class="date-cell">${entry.dateResolved || '--'}</td>
      <td>${turnaround}</td>
      <td><span class="section-tag ${isResolved ? 'status-resolved' : 'status-open'}">${isResolved ? 'Resolved' : 'Open'}</span></td>
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
  el('showResolvedToggle').addEventListener('change', renderTable);
  el('filterClientInput').addEventListener('input', renderTable);

  // Same iframe-race fix used across the other cross-client tools: the
  // client datalist can be empty if this loads before the parent Hub's
  // clientsDb has synced. Poll briefly and re-populate once real data shows up.
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
