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
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: entries, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save revision log:", result.error);
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
  updateClientNameHint();
}

// ── Client name near-match warning ──
// Agency Health Dashboard's "open revisions" flag and QBR Generator's
// Open Revisions count both match this field against a real Client
// Workspace name by exact, case-insensitive string - no shared ID. A
// typo here silently drops the entry out of both. Not a hard block - a
// client with no Workspace yet is a valid (if unusual) case here, so
// this only fires when the typed name is close enough to a real one to
// look like a typo.
function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const row = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[n];
}

function findNearMatchClientName(typedName, realNames) {
  const typed = (typedName || '').trim().toLowerCase();
  if (!typed) return null;
  if (realNames.some(n => n.toLowerCase() === typed)) return null; // exact match - already correct
  let best = null, bestDist = Infinity;
  realNames.forEach(n => {
    const dist = levenshteinDistance(typed, n.toLowerCase());
    if (dist < bestDist) { bestDist = dist; best = n; }
  });
  if (!best) return null;
  const threshold = Math.max(1, Math.floor(best.length * 0.25));
  return (bestDist > 0 && bestDist <= threshold) ? best : null;
}

function updateClientNameHint() {
  const hintEl = el('clientNameMatchHint');
  const nameInput = el('clientName');
  if (!hintEl || !nameInput) return;
  const clients = getClients();
  const realNames = Object.keys(clients).filter(n => n !== SANDBOX_NAME);
  const match = findNearMatchClientName(nameInput.value, realNames);
  if (match) {
    hintEl.textContent = `Did you mean "${match}"? Matching their Client Workspace name exactly keeps this counted in Agency Health Dashboard and QBR Generator.`;
    hintEl.style.display = 'block';
  } else {
    hintEl.style.display = 'none';
  }
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
  el('clientName').addEventListener('input', updateClientNameHint);

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
