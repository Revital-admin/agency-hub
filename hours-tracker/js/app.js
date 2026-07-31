/* ============================================================
   HOURS & TIME LOG — APP LOGIC
   (agency-wide: not tied to a single client, so this stores its own
   list at agency/hoursLog, same shape as Referral Tracker. Exists to
   pair actual hours worked against Proposal Calculator's *estimated*
   monthly fee (client.proposal.computedMonthly, inside clientsDb) -
   Proposal Calculator only ever captures the estimate at sale time,
   nothing before this tracked what was actually spent delivering it.
   See renderRollup() for that comparison.)
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const INTERNAL_CLIENT_NAME = "Internal / Non-Billable";

let entries = [];
let docVersion = 0; // optimistic-concurrency guard, see persist() below

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "hoursLog");
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
      console.error("Couldn't load the hours log from the cloud:", e);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', "Couldn't load the hours log: " + e.message);
      }
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('hours-tracker-list');
    entries = saved ? JSON.parse(saved) : [];
  } catch (e) { entries = []; }
}

async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: entries, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save the hours log:", result.error);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', result.reason === 'conflict'
          ? "Someone else logged hours while you had this open. Reload the page to see their changes, then redo your entry."
          : "Couldn't save — your entry may be lost: " + result.error.message);
      }
      return false;
    }
    docVersion = result.version;
    return true;
  }
  try { localStorage.setItem('hours-tracker-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'hrs-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
function todayStr() {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

// ── Datalists (member + client autocomplete) ──
// Members come straight from agency/teamRoster (read-only here - this
// tool doesn't manage the roster, just borrows its names) rather than
// free text, so entries stay matchable against the roster later without
// relying on everyone spelling a name the same way every time.
async function populateMemberDatalist() {
  const list = el('memberOptions');
  if (!list || !isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseGetDoc) return;
  try {
    const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamRoster");
    const snap = await window.parent.firebaseGetDoc(ref);
    const data = snap && snap.exists ? snap.data() : null;
    const members = (data && data.list) || [];
    list.innerHTML = '';
    members.map(m => m.memberName).filter(Boolean).sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      list.appendChild(opt);
    });
  } catch (e) {
    console.warn("Couldn't load team roster for the member autocomplete:", e);
  }
}

function populateClientDatalist() {
  const list = el('clientOptions');
  if (!list) return;
  list.innerHTML = `<option value="${INTERNAL_CLIENT_NAME}"></option>`;
  if (!isEmbedded || typeof window.parent.getAllClients !== 'function') return;
  let clients = {};
  try { clients = window.parent.getAllClients() || {}; } catch (e) { clients = {}; }
  Object.keys(clients).sort().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    list.appendChild(opt);
  });
}

// ── Summary bar ──
function isThisWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday start
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  return d >= startOfWeek && d < endOfWeek;
}
function isThisMonth(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function renderSummary() {
  const weekEntries = entries.filter(e => isThisWeek(e.date));
  const monthEntries = entries.filter(e => isThisMonth(e.date));
  const weekHours = weekEntries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);
  const monthHours = monthEntries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);
  const billableMonthHours = monthEntries.filter(e => e.billable).reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);

  el('summaryWeekHours').textContent = weekHours ? weekHours.toFixed(2).replace(/\.?0+$/, '') : '0';
  el('summaryMonthHours').textContent = monthHours ? monthHours.toFixed(2).replace(/\.?0+$/, '') : '0';
  el('summaryBillablePct').textContent = monthHours > 0 ? Math.round((billableMonthHours / monthHours) * 100) + '%' : '—';
}

// ── Monthly-by-client rollup ──
// Rough signal, not a real profitability report: computedMonthly is a
// point-in-time proposal estimate (it isn't re-priced if scope changes
// later), and this month's hours may not map 1:1 onto that month's fee
// if a project runs long or short of a calendar month. Good enough to
// flag "this client is eating way more time than the proposal assumed."
function renderRollup() {
  const card = el('rollupCard');
  const monthEntries = entries.filter(e => isThisMonth(e.date) && e.clientName && e.clientName !== INTERNAL_CLIENT_NAME);
  if (!monthEntries.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  let clients = {};
  if (isEmbedded && typeof window.parent.getAllClients === 'function') {
    try { clients = window.parent.getAllClients() || {}; } catch (e) { clients = {}; }
  }

  const byClient = {};
  monthEntries.forEach(e => {
    const name = e.clientName;
    byClient[name] = (byClient[name] || 0) + (parseFloat(e.hours) || 0);
  });

  const rows = Object.keys(byClient).sort((a, b) => byClient[b] - byClient[a]).map(name => {
    const hours = byClient[name];
    const client = clients[name];
    const fee = client && client.proposal && typeof client.proposal.computedMonthly === 'number' ? client.proposal.computedMonthly : null;
    const rate = fee && hours > 0 ? fee / hours : null;
    return `<tr>
      <td class="name-cell">${escapeHtml(name)}</td>
      <td class="hours-cell">${hours.toFixed(2).replace(/\.?0+$/, '')}</td>
      <td>${fee !== null ? '$' + fee.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</td>
      <td>${rate !== null ? '$' + rate.toFixed(0) + '/hr' : '—'}</td>
    </tr>`;
  }).join('');

  el('rollupTableBody').innerHTML = rows;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function renderTable() {
  renderSummary();
  renderRollup();

  const rows = [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const tbody = el('trackerTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(e => {
    const tr = document.createElement('tr');
    if (!e.billable) tr.className = 'row-nonbillable';
    tr.innerHTML = `
      <td class="date-cell">${escapeHtml(e.date || '--')}</td>
      <td class="name-cell">${escapeHtml(e.memberName)}</td>
      <td>${escapeHtml(e.clientName)}</td>
      <td class="hours-cell">${(parseFloat(e.hours) || 0).toFixed(2).replace(/\.?0+$/, '')}</td>
      <td>${e.billable ? 'Yes' : 'No'}</td>
      <td><input type="text" class="notes-input" data-id="${e.id}" value="${(e.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="delete-btn" data-id="${e.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  wireRowListeners();
}

function findEntry(id) {
  return entries.find(e => e.id === id);
}

function wireRowListeners() {
  document.querySelectorAll('.notes-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const e = findEntry(inp.getAttribute('data-id'));
      if (!e) return;
      const previous = e.notes;
      e.notes = inp.value;
      const ok = await persist();
      if (!ok) e.notes = previous;
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteEntry(btn.getAttribute('data-id')));
  });
}

async function deleteEntry(id) {
  if (!confirm("Delete this time entry? This can't be undone.")) return;
  const previous = entries;
  entries = entries.filter(e => e.id !== id);
  const ok = await persist();
  if (!ok) entries = previous;
  renderTable();
}

async function addEntry() {
  const dateInput = el('newEntryDate');
  const memberInput = el('newEntryMember');
  const clientInput = el('newEntryClient');
  const hoursInput = el('newEntryHours');
  const billableInput = el('newEntryBillable');
  const notesInput = el('newEntryNotes');

  const memberName = memberInput.value.trim();
  const clientName = clientInput.value.trim();
  const hours = parseFloat(hoursInput.value);

  if (!memberName || !clientName) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Enter both a team member and a client (or "Internal / Non-Billable").');
    return;
  }
  if (!hours || hours <= 0) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Enter how many hours were worked.');
    return;
  }

  entries.push({
    id: uid(),
    date: dateInput.value || todayStr(),
    memberName,
    clientName,
    hours,
    billable: clientName === INTERNAL_CLIENT_NAME ? false : !!billableInput.checked,
    notes: notesInput.value.trim()
  });

  const ok = await persist();
  if (!ok) {
    entries.pop();
    renderTable();
    return;
  }

  memberInput.value = '';
  clientInput.value = '';
  hoursInput.value = '';
  notesInput.value = '';
  billableInput.checked = true;
  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Logged ${hours}h for ${memberName} — ${clientName}.`);
  }
}

function initListeners() {
  el('addEntryBtn').addEventListener('click', addEntry);
  el('newEntryClient').addEventListener('change', () => {
    // Internal/Non-Billable is, definitionally, not billable - keep the
    // checkbox from lying the moment this client is picked, but leave it
    // fully editable again the instant a different client is chosen.
    if (el('newEntryClient').value.trim() === INTERNAL_CLIENT_NAME) {
      el('newEntryBillable').checked = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  el('newEntryDate').value = todayStr();
  populateClientDatalist();
  populateMemberDatalist();
  await loadEntries();
  renderTable();
  initListeners();

  // Same class of fix as the other trackers: if this iframe finishes
  // loading before the parent Hub's clientsDb has synced, the client
  // autocomplete list comes up with just "Internal / Non-Billable" and
  // never refills since it only ever populates once. Poll briefly and
  // re-populate once real data shows up (harmless no-op once it's
  // already populated).
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    let clientCount = 0;
    try { clientCount = isEmbedded ? Object.keys(window.parent.getAllClients() || {}).length : 0; } catch (e) {}
    if (clientCount > 0) {
      populateClientDatalist();
      renderRollup();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
