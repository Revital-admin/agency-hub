/* ============================================================
   HOURS & TIME LOG — APP LOGIC
   Exists to pair actual hours worked against Proposal Calculator's
   *estimated* monthly fee (client.proposal.computedMonthly, inside
   clientsDb) - Proposal Calculator only ever captures the estimate at
   sale time, nothing before this tracked what was actually spent
   delivering it. See renderRollup() for that comparison.

   Storage (Aug 2026): one Firestore document per entry, in a top-level
   hoursLogEntries collection - NOT the old agency/hoursLog
   {list: [...]} single document. Hours accumulate forever with no
   natural pruning, so this was the collection most likely to eventually
   hit Firestore's ~1MB single-document limit the way clientsDb once did
   (see data-loss-prevention-plan.md) - probably sooner than most, since
   it grows with usage, not revenue. migrateHoursLogEntriesIfNeeded
   below does a one-time, idempotent copy of whatever's in the old doc
   into the new collection the first time this tool loads after the
   update - see that function's own comment for why it's safe to run
   more than once (including a second copy of the same check server-side,
   in _worker.js's migrateHoursLogIfNeeded, for the Contractor Portal's
   own hours read/write path). The old agency/hoursLog document is left
   untouched, not deleted, as an extra passive backup.
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

// ── Delete permission ──
// Aug 2026: any teammate with Team Ops access (now everyone, since Team
// Ops was made universal) could delete ANY entry here, including hours
// someone else logged - a Hub Admin or team lead deleting a stray test
// entry is fine, but a regular teammate clearing out a coworker's real
// logged time is not. Gate the Delete button to: Hub Admins (same
// agency/teamAccess.hubAdmins list Team Roster's Contractor Documents
// card already uses), or whoever's own entry it is. memberName is free
// text matched via a <datalist>, not a strict foreign key (see
// getTeamHoursCapacitySnapshot in the parent Hub's app.js for the same
// caveat), so "own entry" is resolved by matching the signed-in
// account's email to a Team Roster member, then comparing that member's
// name against the entry's memberName - the best identity signal
// available without restructuring how entries are logged. This is a
// client-side-only gate (Firestore's own hoursLogEntries rule stays
// broadly admin-domain-wide, matching every other "Hub Admin" gate in
// this codebase - e.g. Team Roster's Contractor Documents card - none of
// which are enforced at the rules layer either), so it's a workflow
// guardrail against accidental deletes through the normal UI, not a
// defense against someone deliberately reaching in via devtools.
let isHubAdmin = false;
let currentUserEmail = '';
let currentMemberName = '';

async function applyDeletePermission() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot || !window.parent.firebaseGetDoc) return;
  currentUserEmail = (window.parent.currentAdminEmail || '').toLowerCase();

  // Resolve the signed-in account to its own Team Roster memberName
  // (one-time read - roster membership/name doesn't change mid-session
  // often enough to justify a live listener here).
  try {
    const rosterRef = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamRoster");
    const rosterSnap = await window.parent.firebaseGetDoc(rosterRef);
    const rosterData = rosterSnap && rosterSnap.exists ? rosterSnap.data() : null;
    const members = (rosterData && rosterData.list) || [];
    const mine = currentUserEmail ? members.find(m => (m.email || '').trim().toLowerCase() === currentUserEmail) : null;
    currentMemberName = mine ? (mine.memberName || '').trim().toLowerCase() : '';
  } catch (e) {
    console.warn("Couldn't resolve the signed-in account to a roster member:", e);
  }

  // Hub Admins list stays live (same pattern as Team Roster's own
  // applyEditPermission) so a mid-session Team Access change takes effect
  // without a reload.
  const teamAccessRef = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamAccess");
  window.parent.firebaseOnSnapshot(teamAccessRef, (docSnap) => {
    const data = docSnap && docSnap.exists ? docSnap.data() : null;
    const hubAdmins = Array.isArray(data && data.hubAdmins) ? data.hubAdmins : ["admin@revitalproductions.com"];
    isHubAdmin = !!(currentUserEmail && hubAdmins.includes(currentUserEmail));
    renderTable();
  }, (err) => {
    console.error("Hours & Time Log: hub-admin listener error:", err);
  });
}

function canDeleteEntry(entry) {
  if (isHubAdmin) return true;
  if (!currentMemberName) return false;
  return (entry.memberName || '').trim().toLowerCase() === currentMemberName;
}

function el(id) { return document.getElementById(id); }

/* ── Data load/save (per-document collection - see header comment) ──
   No docVersion / optimistic-concurrency guard anymore: each entry is
   its own document, so two people logging hours at the same time can
   never conflict with each other the way whole-list saves used to.
   Editing/deleting the exact same entry at once is still last-write-
   wins, same as any single Firestore document - a fine tradeoff for
   how this tool is actually used. */

function getEntryDocRef(id) {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "hoursLogEntries", id);
}

function getEntriesCollectionRef() {
  if (!isEmbedded || !window.parent.firebaseCollection || !window.parent.firebaseDb) return null;
  return window.parent.firebaseCollection(window.parent.firebaseDb, "hoursLogEntries");
}

async function loadEntries() {
  // getHoursLogEntries() (parent app.js) runs the one-time migration off
  // agency/hoursLog the first time it's called, then reads hoursLogEntries -
  // reuse it here instead of duplicating that logic in every tool that
  // needs the list (this tool, Team Roster's capacity view, Budget Pacing
  // Tracker, Timeline Scheduler).
  if (isEmbedded && typeof window.parent.getHoursLogEntries === 'function') {
    try {
      entries = await window.parent.getHoursLogEntries();
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

async function saveOneEntry(entry) {
  if (!isEmbedded || !window.parent.firebaseSetDocFromJSON) {
    try { localStorage.setItem('hours-tracker-list', JSON.stringify(entries)); } catch (e) {}
    return true;
  }
  try {
    const { id, ...rest } = entry;
    await window.parent.firebaseSetDocFromJSON(getEntryDocRef(id), JSON.stringify(rest));
    return true;
  } catch (e) {
    console.error("Couldn't save the hours entry:", e);
    if (window.parent.showBanner) {
      window.parent.showBanner('error', "Couldn't save — your entry may be lost: " + e.message);
    }
    return false;
  }
}

async function deleteOneEntry(id) {
  if (!isEmbedded || !window.parent.firebaseDeleteDoc) {
    try { localStorage.setItem('hours-tracker-list', JSON.stringify(entries)); } catch (e) {}
    return true;
  }
  try {
    await window.parent.firebaseDeleteDoc(getEntryDocRef(id));
    return true;
  } catch (e) {
    console.error("Couldn't delete the hours entry:", e);
    if (window.parent.showBanner) {
      window.parent.showBanner('error', "Couldn't delete: " + e.message);
    }
    return false;
  }
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

// Only matters once a client has more than one project tracked in Budget
// Pacing (see that tool's client.budgetPacingList) - suggests exact
// project names so hours actually count toward the right one instead of
// silently landing in neither (see getUnassignedHoursNote there). A
// client with zero or one tracked project needs nothing typed here at
// all; every hour still counts toward them either way.
function populateProjectDatalist() {
  const list = el('projectOptions');
  if (!list) return;
  list.innerHTML = '';
  const clientName = el('newEntryClient') ? el('newEntryClient').value.trim() : '';
  if (!clientName || !isEmbedded || typeof window.parent.getAllClients !== 'function') return;
  let clients = {};
  try { clients = window.parent.getAllClients() || {}; } catch (e) { clients = {}; }
  const client = clients[clientName];
  const projects = client && Array.isArray(client.budgetPacingList) ? client.budgetPacingList : [];
  projects.forEach(p => {
    if (!p.name) return;
    const opt = document.createElement('option');
    opt.value = p.name;
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
      <td>${escapeHtml(e.projectName || '--')}</td>
      <td class="hours-cell">${(parseFloat(e.hours) || 0).toFixed(2).replace(/\.?0+$/, '')}</td>
      <td>${e.billable ? 'Yes' : 'No'}</td>
      <td><input type="text" class="notes-input" data-id="${e.id}" value="${(e.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          ${canDeleteEntry(e) ? `<button class="delete-btn" data-id="${e.id}">Delete</button>` : ''}
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
      const ok = await saveOneEntry(e);
      if (!ok) e.notes = previous;
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteEntry(btn.getAttribute('data-id')));
  });
}

async function deleteEntry(id) {
  const entry = findEntry(id);
  // Defense-in-depth re-check, not just trusting that the Delete button
  // was hidden correctly - guards against a stale render (e.g. the hub-
  // admin listener above hasn't fired yet).
  if (!entry || !canDeleteEntry(entry)) return;
  if (!confirm("Delete this time entry? This can't be undone.")) return;
  const previous = entries;
  entries = entries.filter(e => e.id !== id);
  const ok = await deleteOneEntry(id);
  if (!ok) entries = previous;
  renderTable();
}

async function addEntry() {
  const dateInput = el('newEntryDate');
  const memberInput = el('newEntryMember');
  const clientInput = el('newEntryClient');
  const projectInput = el('newEntryProject');
  const hoursInput = el('newEntryHours');
  const billableInput = el('newEntryBillable');
  const notesInput = el('newEntryNotes');

  const memberName = memberInput.value.trim();
  const clientName = clientInput.value.trim();
  const projectName = projectInput.value.trim();
  const hours = parseFloat(hoursInput.value);

  if (!memberName || !clientName) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Enter both a team member and a client (or "Internal / Non-Billable").');
    return;
  }
  if (!hours || hours <= 0) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Enter how many hours were worked.');
    return;
  }

  const newEntry = {
    id: uid(),
    date: dateInput.value || todayStr(),
    memberName,
    clientName,
    projectName,
    hours,
    billable: clientName === INTERNAL_CLIENT_NAME ? false : !!billableInput.checked,
    notes: notesInput.value.trim()
  };
  entries.push(newEntry);

  const ok = await saveOneEntry(newEntry);
  if (!ok) {
    entries.pop();
    renderTable();
    return;
  }

  memberInput.value = '';
  clientInput.value = '';
  projectInput.value = '';
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
    populateProjectDatalist();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  el('newEntryDate').value = todayStr();
  populateClientDatalist();
  populateMemberDatalist();
  await loadEntries();
  renderTable();
  initListeners();
  applyDeletePermission().catch(e => console.error("Couldn't apply delete permission:", e));

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
