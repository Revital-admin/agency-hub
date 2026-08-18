let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.getAllClients === 'function') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const SANDBOX_NAME = "Quick Sandbox (One-Offs)";

function el(id) { return document.getElementById(id); }
function uid() { return 'bp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function getClients() {
  if (isEmbedded) {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  return {};
}

function persist() {
  if (isEmbedded) window.parent.saveDatabase();
}

// ── Multiple simultaneous projects per client (Aug 2026) ──
// Was a single client.budgetPacing object - one client could only ever
// have ONE tracked budget/flight at a time, so a client running a
// retainer AND a one-off shoot in the same month had no way to tell
// their cost/margin apart (see the Hub Integration Roadmap doc, "$500K+
// Revenue" section, for the fuller reasoning - this is the fix for the
// one real gap identified there vs. buying Productive). Now
// client.budgetPacingList is an array of named projects, each with the
// same shape the old single object had plus id/name.
//
// This is the ONLY place that migrates the legacy field - every other
// reader of this data (Agency Health Dashboard, QBR Generator, the root
// Hub's upsell nudge, the Worker's health digest) reads defensively
// instead (falls back to treating a lone client.budgetPacing as a
// single-item list) rather than each trying to migrate/write it
// themselves, so there's no race between tools over who converts a given
// client first.
function ensureBudgetPacingList(client) {
  if (Array.isArray(client.budgetPacingList)) return client.budgetPacingList;
  if (client.budgetPacing) {
    client.budgetPacingList = [{ id: uid(), name: 'General', ...client.budgetPacing }];
    delete client.budgetPacing;
    persist();
    return client.budgetPacingList;
  }
  client.budgetPacingList = [];
  return client.budgetPacingList;
}

// ── Live labor cost / retainer utilization ──
// Team Roster's hourlyRate (Hub Admin-only field) joined against
// agency/hoursLog entries, scoped to each tracked client's own
// startDate/endDate window. Loaded once via the parent's generic
// getTeamRosterMembers/getHoursLogEntries/getContractInvoiceRecords
// helpers (see app.js) rather than duplicating those reads here.
// Deliberately NOT realtime - same one-shot-load-then-poll-for-clients
// pattern this file already uses for getClients(), so a stale minute or
// two here is consistent with how the rest of this tool already
// behaves, not a regression.
let teamRosterMembers = [];
let hoursLogEntries = [];
let contractInvoiceRecords = [];

async function loadAuxData() {
  if (!isEmbedded) return;
  try {
    const [members, hours, invoices] = await Promise.all([
      typeof window.parent.getTeamRosterMembers === 'function' ? window.parent.getTeamRosterMembers() : [],
      typeof window.parent.getHoursLogEntries === 'function' ? window.parent.getHoursLogEntries() : [],
      typeof window.parent.getContractInvoiceRecords === 'function' ? window.parent.getContractInvoiceRecords() : []
    ]);
    teamRosterMembers = members || [];
    hoursLogEntries = hours || [];
    contractInvoiceRecords = invoices || [];
  } catch (e) {
    console.warn("Couldn't load rate/hours/billing data for cost math:", e);
  }
}

// projectName/requireProjectMatch: only used when a client has more than
// one project tracked at once - see ensureBudgetPacingList above. With a
// single project (the common case, unchanged from before this feature),
// every hour logged for the client counts toward it regardless of
// whether that hour entry has a project name set, so nothing changes for
// anyone who never adopts per-project logging.
function getClientHoursInRange(clientName, startDate, endDate, projectName, requireProjectMatch) {
  const start = startDate ? new Date(startDate + 'T00:00:00') : null;
  const end = endDate ? new Date(endDate + 'T23:59:59') : null;
  const wantProject = requireProjectMatch ? (projectName || '').trim().toLowerCase() : null;
  return hoursLogEntries.filter(e => {
    if ((e.clientName || '') !== clientName) return false;
    if (wantProject !== null && (e.projectName || '').trim().toLowerCase() !== wantProject) return false;
    const d = new Date((e.date || '') + 'T00:00:00');
    if (isNaN(d.getTime())) return false;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

function getMemberRate(memberName) {
  const key = (memberName || '').trim().toLowerCase();
  if (!key) return null;
  const m = teamRosterMembers.find(m => (m.memberName || '').trim().toLowerCase() === key);
  const rate = m ? parseFloat(m.hourlyRate) : NaN;
  return (m && !isNaN(rate) && rate > 0) ? rate : null;
}

// Returns { cost, totalHours, missingRateHours } for a client's logged
// hours in [startDate, endDate]. missingRateHours is hours logged by
// someone with no hourlyRate set on their roster entry yet - excluded
// from cost rather than silently treated as $0/hr, and surfaced in the
// UI so the number's known incompleteness is visible instead of hidden.
function getLaborCost(clientName, startDate, endDate, projectName, requireProjectMatch) {
  const entries = getClientHoursInRange(clientName, startDate, endDate, projectName, requireProjectMatch);
  let cost = 0;
  let totalHours = 0;
  let missingRateHours = 0;
  entries.forEach(e => {
    const hrs = parseFloat(e.hours) || 0;
    totalHours += hrs;
    const rate = getMemberRate(e.memberName);
    if (rate === null) { missingRateHours += hrs; return; }
    cost += hrs * rate;
  });
  return { cost, totalHours, missingRateHours };
}

// Active Stripe recurring billing amount for this client, if any (see
// Contract & Invoice Tracker's recurringBilling.status). Returns null
// (not 0) when there's no active subscription, so callers can tell
// "no revenue" apart from "no billing set up" and skip showing a
// misleading $0 margin.
function getActiveMonthlyBilling(clientName) {
  const rec = contractInvoiceRecords.find(r => (r.clientName || '') === clientName && r.recurringBilling && r.recurringBilling.status === 'active');
  if (!rec) return null;
  const amount = parseFloat(rec.recurringBilling.monthlyAmount);
  return isNaN(amount) ? null : amount;
}

// No longer skips already-tracked clients - a client can have more than
// one project tracked at once now (see ensureBudgetPacingList above), so
// "+ Track New Client" doubles as "+ Add Another Project" for someone
// already tracked.
function populateClientSelect() {
  const clients = getClients();
  const select = el('newClientSelect');
  select.innerHTML = '<option value="">Select a client...</option>';
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

function getPacingClass(spent, total, startDate, endDate) {
  if (!total || total <= 0) return 'pace-good';

  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();

  if (now > end) return 'pace-danger'; // past end date
  if (now < start) return 'pace-good'; // hasn't started

  const totalDays = (end - start) / (1000 * 60 * 60 * 24);
  const daysPassed = (now - start) / (1000 * 60 * 60 * 24);
  // A same-day (or misconfigured start-after-end) flight makes totalDays
  // 0, which used to divide out to NaN - NaN fails every comparison
  // below, so this silently fell through to the default "pace-good"
  // instead of ever flagging over/underspend. Treat a zero-or-less-day
  // flight as fully due today (100% of budget expected), which is what
  // "the whole flight is today" actually means.
  const expectedPacingRatio = totalDays > 0 ? daysPassed / totalDays : 1;
  const actualPacingRatio = spent / total;

  if (actualPacingRatio > expectedPacingRatio * 1.15) return 'pace-danger'; // Overspending
  if (actualPacingRatio < expectedPacingRatio * 0.85) return 'pace-warn';   // Underspending
  return 'pace-good';
}

function formatValue(type, val) {
  if (type === 'Ad Spend') return '$' + Number(val || 0).toLocaleString();
  return Number(val || 0).toString() + ' hrs';
}

// Hours logged for this client, within the union of all its tracked
// projects' date ranges, with no project name set - i.e. hours that
// aren't counted toward ANY of the client's projects once they have more
// than one. Surfaced rather than silently dropped, same reasoning as
// missingRateHours above.
function getUnassignedHoursNote(clientName, projects) {
  if (projects.length < 2) return '';
  const starts = projects.map(p => p.startDate).filter(Boolean).sort();
  const ends = projects.map(p => p.endDate).filter(Boolean).sort();
  if (!starts.length || !ends.length) return '';
  const rangeStart = starts[0];
  const rangeEnd = ends[ends.length - 1];
  const unassigned = getClientHoursInRange(clientName, rangeStart, rangeEnd, '', true);
  const hrs = unassigned.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);
  if (hrs <= 0) return '';
  return `<p class="unassigned-hours-note" style="font-size:11px; color:var(--color-text-muted, #8a887f); margin:6px 0 0;">⚠ ${hrs.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs logged for ${escapeHtmlBp(clientName)} with no Project set - not counted toward any project below. Set a Project on those Hours &amp; Time Log entries to include them.</p>`;
}

function escapeHtmlBp(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ── Jump to the Hub's active client on load ──
// This tool tracks every client's budget on one screen rather than being
// scoped to a single active client like most other tools - useful, but it
// meant there was no way to land here from the Hub's client switcher and
// actually see the client you'd just switched to; you had to scroll/hunt
// for their card among everyone else's. Runs once per page load, right
// after client data is actually populated - boot calls renderTable()
// several times as data trickles in (see DOMContentLoaded below), and
// this is deliberately only invoked from those boot call sites, not from
// renderTable() itself, so it doesn't re-trigger on every routine field
// edit the tool makes afterward.
let scrolledToActiveClient = false;
function scrollToActiveClientOnce() {
  if (scrolledToActiveClient || !isEmbedded) return;
  // getActiveClient() returns the active client OBJECT, not its name - the
  // parent's activeClientName variable isn't exposed on window (top-level
  // let/const don't attach to window). Reverse-lookup by object identity
  // instead (works because getAllClients() returns the live clientsDb
  // object by reference across this same-origin iframe boundary, not a
  // serialized copy) - same pattern Mood Board Builder's
  // getGlobalActiveClientName() already uses.
  let activeName = null;
  try {
    const active = typeof window.parent.getActiveClient === 'function' ? window.parent.getActiveClient() : null;
    if (!active) return;
    const clients = getClients();
    activeName = Object.keys(clients).find(n => clients[n] === active) || null;
  } catch (e) { return; }
  if (!activeName) return;

  const cards = document.querySelectorAll(`.pacing-card[data-client-name="${CSS.escape(activeName)}"]`);
  if (!cards.length) return; // not tracked here yet, or data hasn't loaded - a later boot call will retry

  scrolledToActiveClient = true;
  cards[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  cards.forEach(card => {
    card.classList.add('pacing-card-active-highlight');
    setTimeout(() => card.classList.remove('pacing-card-active-highlight'), 2200);
  });
}

function renderTable() {
  const clients = getClients();
  const listEl = el('trackerList');
  listEl.innerHTML = '';

  const trackedNames = Object.keys(clients).filter(name => {
    const list = ensureBudgetPacingList(clients[name]);
    return list.length > 0;
  });

  el('emptyState').style.display = trackedNames.length === 0 ? 'flex' : 'none';

  trackedNames.sort().forEach(name => {
    const projects = clients[name].budgetPacingList;
    const hasMultiple = projects.length > 1;

    // Cards stay direct children of #trackerList (not wrapped in a group
    // div) so the existing 2-column grid CSS keeps working unmodified -
    // the heading/note below are just full-width items in that same grid
    // (see .pacing-client-heading/.unassigned-hours-note in css/style.css).
    if (hasMultiple) {
      const heading = document.createElement('h3');
      heading.className = 'pacing-client-heading';
      heading.textContent = name;
      listEl.appendChild(heading);
    }

    projects.forEach(p => {
      const isRetainerHours = p.budgetType === 'Retainer Hours';

      // Retainer Hours clients get a live spentToDate computed from Hours
      // & Time Log instead of the manual figure - see getClientHoursInRange
      // above. Ad Spend has no equivalent live source (ad platform spend
      // isn't logged in the Hub anywhere), so it stays fully manual.
      const liveHours = isRetainerHours ? getClientHoursInRange(name, p.startDate, p.endDate, p.name, hasMultiple) : null;
      const liveHoursTotal = liveHours ? liveHours.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0) : null;
      const effectiveSpent = isRetainerHours ? (liveHoursTotal || 0) : p.spentToDate;

      const pct = p.totalBudget ? Math.min(100, Math.round((effectiveSpent / p.totalBudget) * 100)) : 0;
      const paceClass = getPacingClass(effectiveSpent, p.totalBudget, p.startDate, p.endDate);

      const labor = getLaborCost(name, p.startDate, p.endDate, p.name, hasMultiple);
      const monthlyBilling = getActiveMonthlyBilling(name);
      const margin = monthlyBilling !== null ? monthlyBilling - labor.cost : null;

      const spentFieldHtml = isRetainerHours ? `
          <div class="form-group" style="margin:0">
            <label style="font-size:10px">Spent to Date (live, from Hours &amp; Time Log)</label>
            <input type="text" class="form-control" value="${formatValue('Retainer Hours', effectiveSpent)}" disabled>
          </div>
        ` : `
          <div class="form-group" style="margin:0">
            <label style="font-size:10px">Spent to Date</label>
            <input type="text" inputmode="decimal" class="form-control spent-input" data-client="${name}" data-project-id="${p.id}" value="${formatNumberWithCommas(p.spentToDate)}">
          </div>
        `;

      const costMarginHtml = `
        <div class="pacing-stats" style="margin-top:8px; padding-top:8px; border-top:1px solid var(--color-border, rgba(255,255,255,0.08));">
          <span class="spent">Labor Cost (period): $${labor.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          ${margin !== null ? `<span class="total" style="color:${margin >= 0 ? '#4ade80' : '#ef4444'};">Margin vs. billing: ${margin >= 0 ? '' : '-'}$${Math.abs(margin).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>` : `<span class="total" style="opacity:0.6;">No active billing on file</span>`}
        </div>
        ${labor.missingRateHours > 0 ? `<p style="font-size:10px; color:var(--color-text-muted, #8a887f); margin:4px 0 0;">${labor.missingRateHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs excluded - no billable rate set for that team member yet.</p>` : ''}
      `;

      const card = document.createElement('div');
      card.className = 'pacing-card';
      card.dataset.clientName = name;

      card.innerHTML = `
        <div class="card-header">
          <div>
            <h3 class="card-title">${hasMultiple ? escapeHtmlBp(p.name || 'General') : escapeHtmlBp(name)}</h3>
            <span class="card-type">${p.budgetType || 'Retainer'}</span>
          </div>
          <button class="btn-remove-action delete-btn" data-client="${name}" data-project-id="${p.id}">✕</button>
        </div>

        <div class="progress-container">
          <div class="progress-bar ${paceClass}" style="width: ${pct}%"></div>
        </div>

        <div class="pacing-stats">
          <span class="spent">${formatValue(p.budgetType, effectiveSpent)} Spent</span>
          <span class="total">${formatValue(p.budgetType, p.totalBudget)} Total</span>
        </div>

        ${costMarginHtml}

        <div class="card-actions">
          ${spentFieldHtml}
          <div class="form-group" style="margin:0">
            <label style="font-size:10px">Total Budget</label>
            <input type="text" inputmode="decimal" class="form-control total-input" data-client="${name}" data-project-id="${p.id}" value="${formatNumberWithCommas(p.totalBudget)}">
          </div>
        </div>
        <div class="form-row mt-2">
          <div class="form-group" style="flex:1; margin:0">
            <label style="font-size:10px">Start Date</label>
            <input type="date" class="form-control start-input" data-client="${name}" data-project-id="${p.id}" value="${p.startDate}">
          </div>
          <div class="form-group" style="flex:1; margin:0">
            <label style="font-size:10px">End Date</label>
            <input type="date" class="form-control end-input" data-client="${name}" data-project-id="${p.id}" value="${p.endDate}">
          </div>
        </div>
      `;
      listEl.appendChild(card);
    });

    if (hasMultiple) {
      const note = getUnassignedHoursNote(name, projects);
      if (note) {
        const noteEl = document.createElement('div');
        noteEl.innerHTML = note;
        listEl.appendChild(noteEl.firstChild);
      }
    }
  });

  wireListeners();
}

function findProject(clientName, projectId) {
  const clients = getClients();
  const list = clients[clientName] && clients[clientName].budgetPacingList;
  return list ? list.find(p => p.id === projectId) : null;
}

function wireListeners() {
  document.querySelectorAll('.spent-input').forEach(inp => {
    if (typeof attachCommaFormatting === 'function') attachCommaFormatting(inp);
    if (typeof attachSpinnerButtons === 'function') attachSpinnerButtons(inp, { step: 1 });
    inp.addEventListener('change', (e) => {
      const p = findProject(e.target.getAttribute('data-client'), e.target.getAttribute('data-project-id'));
      if (!p) return;
      p.spentToDate = parseFormattedNumber(e.target.value);
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.total-input').forEach(inp => {
    if (typeof attachCommaFormatting === 'function') attachCommaFormatting(inp);
    if (typeof attachSpinnerButtons === 'function') attachSpinnerButtons(inp, { step: 1 });
    inp.addEventListener('change', (e) => {
      const p = findProject(e.target.getAttribute('data-client'), e.target.getAttribute('data-project-id'));
      if (!p) return;
      p.totalBudget = parseFormattedNumber(e.target.value);
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.start-input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const p = findProject(e.target.getAttribute('data-client'), e.target.getAttribute('data-project-id'));
      if (!p) return;
      p.startDate = e.target.value;
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.end-input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const p = findProject(e.target.getAttribute('data-client'), e.target.getAttribute('data-project-id'));
      if (!p) return;
      p.endDate = e.target.value;
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const clientName = e.target.getAttribute('data-client');
      const projectId = e.target.getAttribute('data-project-id');
      const p = findProject(clientName, projectId);
      if (!confirm(`Stop tracking ${p && p.name ? '"' + p.name + '"' : 'this budget'} for ${clientName}?`)) return;
      const clients = getClients();
      clients[clientName].budgetPacingList = clients[clientName].budgetPacingList.filter(x => x.id !== projectId);
      persist();
      populateClientSelect();
      renderTable();
    });
  });
}

function getNextMonthEnd() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(0); // last day of current month
  return d.toISOString().slice(0, 10);
}

function getMonthStart() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

el('addTrackerBtn').addEventListener('click', () => {
  const clientName = el('newClientSelect').value;
  if (!clientName) {
    alert("Select a client first.");
    return;
  }

  const clients = getClients();
  const list = ensureBudgetPacingList(clients[clientName]);
  const type = confirm("Track Ad Spend? (Cancel for Retainer Hours)") ? 'Ad Spend' : 'Retainer Hours';

  // Only prompted when the client already has a project tracked - keeps
  // the common single-project case exactly as quick as it always was
  // (two clicks, no typing) and only asks for a name once it's actually
  // needed to tell projects apart.
  let name = 'General';
  if (list.length > 0) {
    name = (prompt('Name this project (e.g. "Q3 Event Shoot") so it stays separate from the existing tracked budget below:', '') || '').trim() || `Project ${list.length + 1}`;
  }

  list.push({
    id: uid(),
    name,
    budgetType: type,
    totalBudget: type === 'Ad Spend' ? 5000 : 20,
    spentToDate: 0,
    startDate: getMonthStart(),
    endDate: getNextMonthEnd()
  });

  persist();
  el('newClientSelect').value = '';
  populateClientSelect();
  renderTable();
});

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  renderTable();
  scrollToActiveClientOnce();

  // Rate/hours/billing data for the cost-and-margin panel loads
  // separately from client data (three more Firestore reads) - render
  // once immediately with whatever's cached, then again once this
  // resolves so the panel doesn't sit blank/stale on first load.
  loadAuxData().then(() => { renderTable(); scrollToActiveClientOnce(); });

  // The parent Hub loads its client database asynchronously (instant
  // localStorage boot, then a Firestore sync on top of that). If this
  // module's iframe finishes loading before that data is ready,
  // populateClientSelect()/renderTable() above run against an empty
  // client list and - since nothing else ever re-triggers them - the
  // dropdown (and any already-tracked budgets) stay missing forever,
  // even after the real data arrives moments later. Poll briefly and
  // re-render once real client data shows up.
  let clientPollAttempts = 0;
  const clientPoll = setInterval(() => {
    clientPollAttempts++;
    const hasClients = Object.keys(getClients()).length > 0;
    if (hasClients || clientPollAttempts > 30) {
      clearInterval(clientPoll);
      if (hasClients) {
        populateClientSelect();
        renderTable();
        scrollToActiveClientOnce();
      }
    }
  }, 250);
});
