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

function getClients() {
  if (isEmbedded) {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  return {};
}

function persist() {
  if (isEmbedded) window.parent.saveDatabase();
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

function getClientHoursInRange(clientName, startDate, endDate) {
  const start = startDate ? new Date(startDate + 'T00:00:00') : null;
  const end = endDate ? new Date(endDate + 'T23:59:59') : null;
  return hoursLogEntries.filter(e => {
    if ((e.clientName || '') !== clientName) return false;
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
function getLaborCost(clientName, startDate, endDate) {
  const entries = getClientHoursInRange(clientName, startDate, endDate);
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

function populateClientSelect() {
  const clients = getClients();
  const select = el('newClientSelect');
  select.innerHTML = '<option value="">Select a client to track...</option>';
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    if (clients[name].budgetPacing) return; // already tracked
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

function renderTable() {
  const clients = getClients();
  const listEl = el('trackerList');
  listEl.innerHTML = '';

  const tracked = Object.keys(clients).filter(name => clients[name].budgetPacing);

  if (tracked.length === 0) {
    el('emptyState').style.display = 'flex';
  } else {
    el('emptyState').style.display = 'none';
  }

  tracked.forEach(name => {
    const p = clients[name].budgetPacing;
    const isRetainerHours = p.budgetType === 'Retainer Hours';

    // Retainer Hours clients get a live spentToDate computed from Hours
    // & Time Log instead of the manual figure - see getClientHoursInRange
    // above. Ad Spend has no equivalent live source (ad platform spend
    // isn't logged in the Hub anywhere), so it stays fully manual.
    const liveHours = isRetainerHours ? getClientHoursInRange(name, p.startDate, p.endDate) : null;
    const liveHoursTotal = liveHours ? liveHours.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0) : null;
    const effectiveSpent = isRetainerHours ? (liveHoursTotal || 0) : p.spentToDate;

    const pct = p.totalBudget ? Math.min(100, Math.round((effectiveSpent / p.totalBudget) * 100)) : 0;
    const paceClass = getPacingClass(effectiveSpent, p.totalBudget, p.startDate, p.endDate);

    const labor = getLaborCost(name, p.startDate, p.endDate);
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
          <input type="text" inputmode="decimal" class="form-control spent-input" data-client="${name}" value="${formatNumberWithCommas(p.spentToDate)}">
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

    card.innerHTML = `
      <div class="card-header">
        <div>
          <h3 class="card-title">${name}</h3>
          <span class="card-type">${p.budgetType || 'Retainer'}</span>
        </div>
        <button class="btn-remove-action delete-btn" data-client="${name}">✕</button>
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
          <input type="text" inputmode="decimal" class="form-control total-input" data-client="${name}" value="${formatNumberWithCommas(p.totalBudget)}">
        </div>
      </div>
      <div class="form-row mt-2">
        <div class="form-group" style="flex:1; margin:0">
          <label style="font-size:10px">Start Date</label>
          <input type="date" class="form-control start-input" data-client="${name}" value="${p.startDate}">
        </div>
        <div class="form-group" style="flex:1; margin:0">
          <label style="font-size:10px">End Date</label>
          <input type="date" class="form-control end-input" data-client="${name}" value="${p.endDate}">
        </div>
      </div>
    `;
    listEl.appendChild(card);
  });

  wireListeners();
}

function wireListeners() {
  const clients = getClients();

  document.querySelectorAll('.spent-input').forEach(inp => {
    if (typeof attachCommaFormatting === 'function') attachCommaFormatting(inp);
    if (typeof attachSpinnerButtons === 'function') attachSpinnerButtons(inp, { step: 1 });
    inp.addEventListener('change', (e) => {
      const c = e.target.getAttribute('data-client');
      clients[c].budgetPacing.spentToDate = parseFormattedNumber(e.target.value);
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.total-input').forEach(inp => {
    if (typeof attachCommaFormatting === 'function') attachCommaFormatting(inp);
    if (typeof attachSpinnerButtons === 'function') attachSpinnerButtons(inp, { step: 1 });
    inp.addEventListener('change', (e) => {
      const c = e.target.getAttribute('data-client');
      clients[c].budgetPacing.totalBudget = parseFormattedNumber(e.target.value);
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.start-input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const c = e.target.getAttribute('data-client');
      clients[c].budgetPacing.startDate = e.target.value;
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.end-input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const c = e.target.getAttribute('data-client');
      clients[c].budgetPacing.endDate = e.target.value;
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!confirm("Stop tracking this budget?")) return;
      const c = e.target.getAttribute('data-client');
      delete clients[c].budgetPacing;
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
  const type = confirm("Track Ad Spend? (Cancel for Retainer Hours)") ? 'Ad Spend' : 'Retainer Hours';

  clients[clientName].budgetPacing = {
    budgetType: type,
    totalBudget: type === 'Ad Spend' ? 5000 : 20,
    spentToDate: 0,
    startDate: getMonthStart(),
    endDate: getNextMonthEnd()
  };

  persist();
  el('newClientSelect').value = '';
  populateClientSelect();
  renderTable();
});

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  renderTable();

  // Rate/hours/billing data for the cost-and-margin panel loads
  // separately from client data (three more Firestore reads) - render
  // once immediately with whatever's cached, then again once this
  // resolves so the panel doesn't sit blank/stale on first load.
  loadAuxData().then(() => renderTable());

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
      }
    }
  }, 250);
});
