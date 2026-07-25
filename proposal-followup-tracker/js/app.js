/* ============================================================
   PROPOSAL FOLLOW-UP SEQUENCE TRACKER — APP LOGIC
   (standalone: prospects tracked here are NOT clientsDb entries -
   most people you send a proposal to haven't signed yet, so this
   keeps its own list at agency/proposalFollowUps rather than forcing
   you to create a full Client Workspace just to track a follow-up.
   Existing client names still show up as autocomplete suggestions,
   for the occasional upsell/expansion proposal to someone you
   already work with.)
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

let proposals = [];
let docVersion = 0; // optimistic-concurrency guard, see persist() below

const STAGE_SEQUENCE = ['Sent', 'Day 3 Sent', 'Day 7 Sent', 'Day 12 Sent'];
const ALL_STAGES = ['Sent', 'Day 3 Sent', 'Day 7 Sent', 'Day 12 Sent', 'Closed Won', 'Closed Lost', 'Expired'];
const EXPIRY_DAYS = 14;

function el(id) { return document.getElementById(id); }

function getProposalsDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "proposalFollowUps");
}

async function loadProposals() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getProposalsDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      proposals = (data && data.list) || [];
      docVersion = (data && data.version) || 0;
      return;
    } catch (e) {
      console.error("Couldn't load proposals from the cloud:", e);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', "Couldn't load proposals from the cloud: " + e.message);
      }
      proposals = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('proposal-followup-tracker-list');
    proposals = saved ? JSON.parse(saved) : [];
  } catch (e) { proposals = []; }
}

// Optimistic-concurrency guard: this saves by overwriting the whole doc
// on every edit, so re-check the version right before writing and
// refuse to clobber a newer save made elsewhere in the meantime.
async function persist() {
  if (isEmbedded && window.parent.firebaseSetDoc && window.parent.firebaseGetDoc) {
    try {
      const ref = getProposalsDocRef();
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
      // A plain object literal built in this iframe's own JS realm gets
      // rejected by Firestore ("a custom Object object") when handed
      // straight to a Firestore call bound to the parent page - pass a
      // JSON string instead so the parent parses it in its own realm.
      await window.parent.firebaseSetDocFromJSON(ref, JSON.stringify({ list: proposals, version: docVersion }));
      return true;
    } catch (e) {
      console.error("Couldn't save proposals to the cloud:", e);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', "Couldn't save — your change may be lost on reload: " + e.message);
      }
      return false;
    }
  }
  try {
    localStorage.setItem('proposal-followup-tracker-list', JSON.stringify(proposals));
  } catch (e) {}
  return true;
}

function toDateOnly(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addDays(dateStr, days) {
  const dt = toDateOnly(dateStr);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function todayStr() {
  return toDateOnly(new Date()).toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStrVal) {
  const from = toDateOnly(fromStr);
  const to = toDateOnly(toStrVal);
  return Math.round((to - from) / 86400000);
}

function uid() {
  return 'prop-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

// Sweep every open proposal and flip stale rows to Expired once the
// window has passed, so the stage reflects reality without anyone
// having to notice and update it manually.
function reconcileExpiredRows() {
  let changed = false;
  proposals.forEach(p => {
    if (p.status !== 'open') return;
    const expiryDate = addDays(p.proposalSentDate, EXPIRY_DAYS);
    if (daysBetween(expiryDate, todayStr()) > 0 && STAGE_SEQUENCE.includes(p.followUpStage)) {
      p.followUpStage = 'Expired';
      changed = true;
    }
  });
  return changed;
}

function getUrgency(p) {
  if (p.status !== 'open') return 'closed';
  const expiryDate = addDays(p.proposalSentDate, EXPIRY_DAYS);
  const daysToExpiry = daysBetween(todayStr(), expiryDate);
  const daysOverdueFollowUp = p.nextFollowUpDate ? daysBetween(p.nextFollowUpDate, todayStr()) : 0;

  if (daysOverdueFollowUp >= 3 || daysToExpiry <= 2) return 'red';
  if (daysOverdueFollowUp >= 1) return 'yellow';
  return 'green';
}

function populateProspectDatalist() {
  const list = el('prospectOptions');
  if (!list) return;
  list.innerHTML = '';
  if (!isEmbedded || typeof window.parent.getAllClients !== 'function') return;
  let clients = {};
  try { clients = window.parent.getAllClients() || {}; } catch (e) { clients = {}; }
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    const opt = document.createElement('option');
    opt.value = name;
    list.appendChild(opt);
  });
}

function renderSummary() {
  const openRows = proposals.filter(p => p.status === 'open');
  const expiringThisWeek = openRows.filter(p => {
    const expiryDate = addDays(p.proposalSentDate, EXPIRY_DAYS);
    const d = daysBetween(todayStr(), expiryDate);
    return d >= 0 && d <= 7;
  });
  const overdue = openRows.filter(p => {
    if (!p.nextFollowUpDate) return false;
    return daysBetween(p.nextFollowUpDate, todayStr()) >= 1;
  });

  el('summaryOpen').textContent = openRows.length;
  el('summaryExpiring').textContent = expiringThisWeek.length;
  el('summaryOverdue').textContent = overdue.length;
}

function stageOptionsHtml(selected) {
  return ALL_STAGES.map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('');
}

function findProposal(id) {
  return proposals.find(p => p.id === id);
}

function renderTable() {
  const changed = reconcileExpiredRows();
  if (changed) persist();

  renderSummary();

  const showClosed = el('showClosedToggle').checked;

  const rows = [...proposals]
    .filter(p => showClosed || p.status === 'open')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return (a.nextFollowUpDate || '9999').localeCompare(b.nextFollowUpDate || '9999');
    });

  const tbody = el('trackerTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(p => {
    const expiryDate = addDays(p.proposalSentDate, EXPIRY_DAYS);
    const urgency = getUrgency(p);
    const tr = document.createElement('tr');
    tr.className = 'urgency-' + urgency;

    tr.innerHTML = `
      <td class="client-cell">${p.prospectName}</td>
      <td class="date-cell">${p.proposalSentDate || '--'}</td>
      <td class="date-cell">${expiryDate}</td>
      <td><select class="stage-select" data-id="${p.id}">${stageOptionsHtml(p.followUpStage)}</select></td>
      <td class="date-cell">${p.lastContactDate || '--'}</td>
      <td class="date-cell">${p.nextFollowUpDate || '--'}</td>
      <td><input type="text" class="notes-input" data-id="${p.id}" value="${(p.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="log-followup-btn" data-id="${p.id}" ${p.status !== 'open' ? 'disabled' : ''}>Log Follow-Up</button>
          <button class="win-btn" data-id="${p.id}" ${p.status !== 'open' ? 'disabled' : ''}>Mark as Won</button>
          <button class="lose-btn" data-id="${p.id}" ${p.status !== 'open' ? 'disabled' : ''}>Mark as Lost</button>
          <button class="delete-btn" data-id="${p.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  wireRowListeners();
}

function wireRowListeners() {
  document.querySelectorAll('.stage-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const p = findProposal(sel.getAttribute('data-id'));
      if (!p) return;
      p.followUpStage = sel.value;
      if (sel.value === 'Closed Won') p.status = 'won';
      else if (sel.value === 'Closed Lost') p.status = 'lost';
      else if (STAGE_SEQUENCE.includes(sel.value)) p.status = 'open';
      await persist();
      renderTable();
    });
  });

  document.querySelectorAll('.notes-input').forEach(inp => {
    inp.addEventListener('input', async () => {
      const p = findProposal(inp.getAttribute('data-id'));
      if (!p) return;
      p.notes = inp.value;
      await persist();
    });
  });

  document.querySelectorAll('.log-followup-btn').forEach(btn => {
    btn.addEventListener('click', () => logFollowUp(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.win-btn').forEach(btn => {
    btn.addEventListener('click', () => closeProposal(btn.getAttribute('data-id'), 'won'));
  });
  document.querySelectorAll('.lose-btn').forEach(btn => {
    btn.addEventListener('click', () => closeProposal(btn.getAttribute('data-id'), 'lost'));
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteProposal(btn.getAttribute('data-id')));
  });
}

async function logFollowUp(id) {
  const p = findProposal(id);
  if (!p || p.status !== 'open') return;

  const today = todayStr();
  p.lastContactDate = today;

  const idx = STAGE_SEQUENCE.indexOf(p.followUpStage);
  const nextStageMap = { 'Sent': 7, 'Day 3 Sent': 12, 'Day 7 Sent': 14 };

  if (idx >= 0 && idx < STAGE_SEQUENCE.length - 1) {
    p.followUpStage = STAGE_SEQUENCE[idx + 1];
    p.nextFollowUpDate = addDays(p.proposalSentDate, nextStageMap[STAGE_SEQUENCE[idx]] || (idx + 1) * 3 + 3);
  } else {
    p.nextFollowUpDate = addDays(p.proposalSentDate, EXPIRY_DAYS);
  }

  const ok = await persist();
  renderTable();

  if (ok && isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Logged follow-up for ${p.prospectName} — now at "${p.followUpStage}".`);
  }
}

async function closeProposal(id, outcome) {
  const p = findProposal(id);
  if (!p) return;
  p.status = outcome;
  p.followUpStage = outcome === 'won' ? 'Closed Won' : 'Closed Lost';
  const ok = await persist();
  renderTable();

  if (ok && isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Marked ${p.prospectName} as ${outcome === 'won' ? 'Won 🎉' : 'Lost'}.`);
  }
}

async function deleteProposal(id) {
  if (!confirm("Delete this proposal record? This can't be undone.")) return;
  const previous = proposals;
  proposals = proposals.filter(p => p.id !== id);
  const ok = await persist();
  if (!ok) {
    proposals = previous;
  }
  renderTable();
}

async function addTrackedProposal() {
  const nameInput = el('newProspectName');
  const dateInput = el('newSentDate');
  const prospectName = nameInput.value.trim();
  if (!prospectName) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Enter a prospect or company name first.');
    return;
  }
  const sentDate = dateInput.value || todayStr();

  proposals.push({
    id: uid(),
    prospectName,
    status: 'open',
    proposalSentDate: sentDate,
    followUpStage: 'Sent',
    lastContactDate: sentDate,
    nextFollowUpDate: addDays(sentDate, 3),
    notes: ''
  });

  const ok = await persist();
  if (!ok) {
    proposals.pop();
    renderTable();
    return;
  }

  nameInput.value = '';
  dateInput.value = '';
  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Now tracking a proposal for ${prospectName}.`);
  }
}

function initListeners() {
  el('addTrackedProposalBtn').addEventListener('click', addTrackedProposal);
  el('showClosedToggle').addEventListener('change', renderTable);
}

document.addEventListener('DOMContentLoaded', async () => {
  populateProspectDatalist();
  await loadProposals();
  renderTable();
  initListeners();

  // Same as Referral Tracker: the prospect-name autocomplete list is a
  // nice-to-have, not a blocker (you can always just type a name) - but
  // still worth backfilling once the parent's client data actually syncs
  // in, in case this iframe loaded first.
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    let clientCount = 0;
    try { clientCount = isEmbedded ? Object.keys(window.parent.getAllClients() || {}).length : 0; } catch (e) {}
    if (clientCount > 0) {
      populateProspectDatalist();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
