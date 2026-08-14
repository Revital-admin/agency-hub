/* ============================================================
   AGENCY HEALTH DASHBOARD — APP LOGIC
   Read-only cross-client view. Pulls from places that already exist
   rather than duplicating any data:
     - client.weeklyCheckins[0] (clientsDb, via getAllClients()) for
       Health rating + last check-in date - same data the per-client
       Dashboard's "Client Health" card already reads.
     - client.renewal (clientsDb, via getAllClients()) for renewal date/
       status - same field Renewal Tracker owns, the source of truth for
       this (not Contract & Invoice Tracker's contractRenewalDate, a
       second independent field that isn't guaranteed to agree with it).
     - agency/revisionFeedbackLog for open (unresolved) revision counts
       per client.
     - client.budgetPacing (clientsDb) for over/underspend status - same
       field Budget Pacing Tracker owns; getBudgetPaceClass below mirrors
       that tool's own getPacingClass() (including its divide-by-zero
       fix for same-day flights) so the two never disagree.
     - client.pendingApprovals (clientsDb) for how long the oldest
       still-open approval has been waiting on the client - same array
       Client Portal Manager owns; each entry's createdAt timestamp was
       already being written and just never read for staleness anywhere.
     - client.meetingNotes (clientsDb) for days since the last logged
       client contact and how many action items across all meetings are
       still unchecked - same array Meeting Notes Logger owns.
     - contractInvoiceRecords (its own top-level Firestore collection,
       outside clientsDb - see the parent's getContractInvoiceRecords)
       for overdue-invoice status - same field Contract & Invoice
       Tracker owns.
     - contractInvoiceRecords' recurringBilling.monthlyAmount (active
       Stripe subscriptions) joined against agency/hoursLog entries and
       Team Roster's hourlyRate, mirroring Budget Pacing Tracker's own
       cost-and-margin math (see getLaborCost/getActiveMonthlyBilling in
       budget-pacing-tracker/js/app.js) - scoped to month-to-date here
       instead of a tracked flight's date range, so every client shows
       up, not just the ones someone opted into Budget Pacing for.
   Nothing here writes anywhere - it's a lens over data owned by those
   other tools, so there's no version-guard/save logic to worry about.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.getAllClients === 'function') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const SANDBOX_NAME = "Quick Sandbox (One-Offs)";

let revisionRecords = [];

function el(id) { return document.getElementById(id); }

function todayStr() {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStrVal) {
  const from = new Date(fromStr); from.setHours(0, 0, 0, 0);
  const to = new Date(toStrVal); to.setHours(0, 0, 0, 0);
  return Math.round((to - from) / 86400000);
}

function getClients() {
  if (isEmbedded) {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  return {};
}

// ── Payment status + month-to-date profitability ──
// Loaded once via the parent's generic getTeamRosterMembers/
// getHoursLogEntries/getContractInvoiceRecords helpers, same as Budget
// Pacing Tracker does for its own per-client cost math (see that file's
// loadAuxData) - reused here for a cross-client view instead of a
// single tracked client. Deliberately NOT realtime, matching Budget
// Pacing Tracker and this file's own getClients() - a stale minute or
// two on labor-cost math is fine.
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
    console.warn("Couldn't load rate/hours/billing data for payment/profitability signals:", e);
  }
}

function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// Mirrors budget-pacing-tracker/js/app.js's getClientHoursInRange/
// getMemberRate/getLaborCost exactly (see that file's own comment on
// why missingRateHours is tracked rather than silently treated as
// $0/hr) - duplicated rather than imported since each tool's iframe is
// fully standalone, but kept intentionally identical so a client's
// margin never disagrees between the two tools.
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

function getLaborCostMTD(clientName) {
  const entries = getClientHoursInRange(clientName, monthStartStr(), todayStr());
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

// Active Stripe recurring billing amount for this client, if any - see
// Contract & Invoice Tracker's recurringBilling.status. Returns null
// (not 0) when there's no active subscription, so callers can tell "no
// revenue" apart from "no billing set up" and skip showing a misleading
// $0/negative margin for a client who was never billed this way (e.g.
// project/one-time work tracked elsewhere).
function getActiveMonthlyBilling(clientName) {
  const rec = contractInvoiceRecords.find(r => (r.clientName || '') === clientName && r.recurringBilling && r.recurringBilling.status === 'active');
  if (!rec) return null;
  const amount = parseFloat(rec.recurringBilling.monthlyAmount);
  return isNaN(amount) ? null : amount;
}

// Overdue-invoice signal, independent of recurring billing above (a
// one-time/project invoice can be overdue even for a client with no
// active subscription). Contract & Invoice Tracker's own
// reconcileOverdueInvoices() is what actually flips a stale "Sent"
// invoice to "Overdue" - this just reads whatever that tool last wrote,
// same as everything else in this file.
function getOverdueInvoiceInfo(clientName) {
  const overdueRecords = contractInvoiceRecords.filter(r => (r.clientName || '') === clientName && r.invoiceStatus === 'Overdue');
  if (!overdueRecords.length) return null;
  const amount = overdueRecords.reduce((sum, r) => sum + (parseFloat((r.invoiceAmount || '').toString().replace(/[^0-9.-]/g, '')) || 0), 0);
  const days = overdueRecords
    .map(r => r.invoiceDueDate ? daysBetween(r.invoiceDueDate, todayStr()) : 0)
    .reduce((max, d) => Math.max(max, d), 0);
  return { count: overdueRecords.length, amount, days };
}

// Mirrors budget-pacing-tracker/js/app.js's getPacingClass(), including
// its fix for a same-day (or misconfigured) flight dividing by zero -
// duplicated rather than imported since each tool's iframe is fully
// standalone, but kept intentionally identical so a client never shows
// "on track" here while the Budget Pacing Tracker itself is flagging it
// (or vice versa).
function getBudgetPaceClass(p) {
  if (!p || !p.totalBudget || p.totalBudget <= 0) return null;

  const start = new Date(p.startDate);
  const end = new Date(p.endDate);
  const now = new Date();

  if (now > end) return 'pace-danger';
  if (now < start) return 'pace-good';

  const totalDays = (end - start) / (1000 * 60 * 60 * 24);
  const daysPassed = (now - start) / (1000 * 60 * 60 * 24);
  const expectedPacingRatio = totalDays > 0 ? daysPassed / totalDays : 1;
  const actualPacingRatio = p.spentToDate / p.totalBudget;

  if (actualPacingRatio > expectedPacingRatio * 1.15) return 'pace-danger';
  if (actualPacingRatio < expectedPacingRatio * 0.85) return 'pace-warn';
  return 'pace-good';
}

// "Awaiting response" threshold for a still-pending client approval - long
// enough that it's a genuine follow-up candidate, not just "sent this
// morning." Matches the spirit of Revision & Feedback Tracker's 3-day
// overdue threshold, given a couple extra days since approvals often need
// a client to actually look at creative rather than just reply to an email.
const STALE_APPROVAL_DAYS = 5;
// "No recent contact" threshold for meeting notes - deliberately longer
// than the 14-day stale-checkin window above, since not every week
// necessarily has a client-facing meeting even on a healthy account.
const STALE_CONTACT_DAYS = 30;
// Matches heavyRevisions' "3+" bar below, for the same reason: a couple
// of open items is normal follow-up, three or more starts to suggest
// things are backing up.
const HEAVY_OPEN_ACTION_ITEMS = 3;

function listenToRevisionLog() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot) return;
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "revisionFeedbackLog");
  window.parent.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap && docSnap.exists ? docSnap.data() : null;
    revisionRecords = (data && data.list) || [];
    renderTable();
  }, (err) => console.error("Revision log listener error:", err));
}

// Most recent "QBR PDF generated" entry per client, read from the same
// agency/adminActivityLog every admin action writes to (see
// generateQbrPdf in qbr-generator/js/app.js, which calls
// window.parent.logAdminActivity("QBR PDF generated", clientName) - the
// clientName IS the log entry's `details` field). Note this log is
// capped at the 300 most recent agency-wide actions (see
// logAdminActivity in the parent app.js), so a genuinely old QBR can
// fall off the log even though it really happened - lastQbrDate is
// treated as "no QBR on record" in that case, not "never had one";
// the dashboard badge below is worded to match ("due" rather than
// "never had").
let lastQbrDateByClient = {};

function listenToAdminActivityLog() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot) return;
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "adminActivityLog");
  window.parent.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap && docSnap.exists ? docSnap.data() : null;
    const list = (data && data.list) || [];
    const byClient = {};
    list.forEach(entry => {
      if (entry.action !== "QBR PDF generated" || !entry.details) return;
      // list is newest-first (unshift on write) - only the first match
      // per client is the most recent one.
      if (!byClient[entry.details]) byClient[entry.details] = entry.createdAt;
    });
    lastQbrDateByClient = byClient;
    renderTable();
  }, (err) => console.error("Admin activity log listener error:", err));
}

function buildRows() {
  const clients = getClients();
  return Object.keys(clients).filter(name => name !== SANDBOX_NAME).map(name => {
    const client = clients[name];
    const checkins = Array.isArray(client.weeklyCheckins) ? client.weeklyCheckins : [];
    const latestCheckin = checkins.length ? checkins[0] : null;
    const healthRating = latestCheckin ? latestCheckin.healthRating : null;
    const lastCheckinDate = latestCheckin ? latestCheckin.date : null;
    const daysSinceCheckin = lastCheckinDate ? daysBetween(lastCheckinDate, todayStr()) : null;
    const staleCheckin = daysSinceCheckin === null || daysSinceCheckin > 14;

    // Renewal Tracker's own client.renewal is the source of truth for
    // this, not Contract & Invoice Tracker's contractRenewalDate - see
    // runRenewalNudgeCheck in the parent app.js for the same switch.
    // Only an open (On Track/At Risk) tracked renewal counts here.
    const renewalRec = client.renewal;
    const renewalIsOpen = renewalRec && (renewalRec.status === 'On Track' || renewalRec.status === 'At Risk');
    const renewalDate = renewalIsOpen ? renewalRec.renewalDate : null;
    const renewalDays = renewalDate ? daysBetween(todayStr(), renewalDate) : null;
    const renewalDueSoon = renewalDays !== null && renewalDays <= 30;

    // A renewal conversation without a QBR behind it is walking in with
    // less leverage than it should - flag it while there's still time
    // to actually run one (60 days out, not 30, since the renewal-due
    // window above is deliberately the "act now" threshold, not the
    // first warning).
    const lastQbrDate = lastQbrDateByClient[name] ? lastQbrDateByClient[name].slice(0, 10) : null;
    const daysSinceQbr = lastQbrDate ? daysBetween(lastQbrDate, todayStr()) : null;
    const renewalNeedsQbr = renewalIsOpen && renewalDays !== null && renewalDays <= 60
      && (lastQbrDate === null || daysSinceQbr > 90);

    const openRevisions = revisionRecords.filter(r =>
      (r.clientName || '').toLowerCase() === name.toLowerCase() && !r.dateResolved
    ).length;
    const heavyRevisions = openRevisions >= 3;

    // Budget Pacing Tracker only tracks clients someone has opted in there
    // (client.budgetPacing is undefined for everyone else), so budgetPace
    // is null - not "on track" - for any client not being tracked at all.
    const budgetPace = getBudgetPaceClass(client.budgetPacing);
    const overspending = budgetPace === 'pace-danger';
    // Same underlying fact as "overspending" (spending faster than the
    // retainer/budget covers), reframed as an opportunity rather than a
    // risk - but only when the relationship is actually healthy. An
    // overspending Red-health client is a churn risk, not someone to
    // pitch a bigger retainer to, so this deliberately excludes that
    // case rather than just re-badging the same condition.
    const upsellOpportunity = overspending && healthRating !== 'Red';

    const pendingApprovals = Array.isArray(client.pendingApprovals) ? client.pendingApprovals : [];
    const approvalAges = pendingApprovals
      .filter(a => a && a.createdAt)
      .map(a => daysBetween(a.createdAt.slice(0, 10), todayStr()));
    const oldestPendingApprovalDays = approvalAges.length ? Math.max(...approvalAges) : null;
    const staleApproval = oldestPendingApprovalDays !== null && oldestPendingApprovalDays >= STALE_APPROVAL_DAYS;

    // Unlike staleCheckin above, a client with ZERO meeting notes ever
    // logged is deliberately NOT treated as "stale contact" - Meeting
    // Notes Logger isn't necessarily used for every account yet (a quiet,
    // report-only retainer might genuinely have no logged meetings and be
    // perfectly healthy), and flagging every never-logged client as
    // needing attention would just be adoption noise, not a real signal.
    // Only a client who WAS being logged and then went quiet counts here.
    const meetingNotes = Array.isArray(client.meetingNotes) ? client.meetingNotes : [];
    const lastMeetingDate = meetingNotes.length
      ? meetingNotes.map(m => m.date).filter(Boolean).sort().slice(-1)[0]
      : null;
    const daysSinceMeeting = lastMeetingDate ? daysBetween(lastMeetingDate, todayStr()) : null;
    const staleContact = daysSinceMeeting !== null && daysSinceMeeting >= STALE_CONTACT_DAYS;
    const openActionItems = meetingNotes.reduce((sum, m) =>
      sum + (Array.isArray(m.actionItems) ? m.actionItems.filter(ai => !ai.completed).length : 0), 0);
    const heavyOpenActionItems = openActionItems >= HEAVY_OPEN_ACTION_ITEMS;

    // Late payment is one of the clearest early churn signals (right
    // alongside dropped engagement) - see getOverdueInvoiceInfo above.
    const overdueInvoice = getOverdueInvoiceInfo(name);

    // Client-submitted satisfaction pulse (client.clientPulseFeedback,
    // written from the client's own portal - see submitPulseFeedback in
    // portal/js/app.js). Distinct from healthRating above, which is the
    // account manager's own read on the relationship - this is the
    // client's self-reported voice, so a low rating here surfaces even
    // if the AM's own Weekly Check-In still shows Green.
    const pulseHistory = Array.isArray(client.clientPulseFeedback) ? client.clientPulseFeedback : [];
    const latestPulse = pulseHistory.length
      ? pulseHistory.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
      : null;
    const lowPulse = latestPulse && latestPulse.rating <= 2 && daysBetween(latestPulse.date, todayStr()) <= 30;

    // Monthly report staleness - only flags clients who HAVE at least one
    // prior report on file but it's gone stale (35d+), not brand-new
    // clients who haven't reached their first report cycle yet. See root
    // app.js's identical runReportOverdueNudgeCheck for the full reasoning.
    const reportArchive = Array.isArray(client.reportArchive) ? client.reportArchive : [];
    const lastReportDate = reportArchive.length
      ? reportArchive.map(r => r.dateAdded).filter(Boolean).sort().slice(-1)[0]
      : null;
    const daysSinceReport = lastReportDate ? daysBetween(lastReportDate.slice(0, 10), todayStr()) : null;
    const reportOverdue = reportArchive.length > 0 && daysSinceReport !== null && daysSinceReport >= 35;

    const needsAttention = healthRating === 'Red' || renewalDueSoon || heavyRevisions
      || overspending || staleApproval || heavyOpenActionItems || staleContact || !!overdueInvoice || renewalNeedsQbr || lowPulse || reportOverdue;

    // Written by the portal itself on page load (portal/js/app.js's
    // recordPortalVisit), pulled into clientsDb by the Hub's
    // ensureClientPortalListeners - just a simple "did they ever open the
    // link" / "how long ago" signal, not tied to any specific action.
    const portalLastVisitedAt = client.portalLastVisitedAt || null;
    const daysSinceVisit = portalLastVisitedAt ? daysBetween(portalLastVisitedAt.slice(0, 10), todayStr()) : null;

    // Month-to-date profitability - see getLaborCostMTD/
    // getActiveMonthlyBilling above. monthlyBilling stays null (not 0)
    // for a client with no active Stripe subscription, so margin is
    // left null too rather than showing a misleading negative number
    // for project-based clients who aren't billed this way.
    const laborMTD = getLaborCostMTD(name);
    const monthlyBilling = getActiveMonthlyBilling(name);
    const margin = monthlyBilling !== null ? monthlyBilling - laborMTD.cost : null;

    return {
      name, healthRating, lastCheckinDate, daysSinceCheckin, staleCheckin,
      renewalDate, renewalDays, renewalDueSoon, openRevisions, heavyRevisions, needsAttention,
      portalLastVisitedAt, daysSinceVisit,
      budgetPace, overspending, upsellOpportunity,
      oldestPendingApprovalDays, staleApproval,
      lastMeetingDate, daysSinceMeeting, staleContact,
      openActionItems, heavyOpenActionItems,
      overdueInvoice,
      lastQbrDate, daysSinceQbr, renewalNeedsQbr,
      latestPulse, lowPulse,
      daysSinceReport, reportOverdue,
      mtdHours: laborMTD.totalHours, mtdLaborCost: laborMTD.cost, missingRateHours: laborMTD.missingRateHours,
      monthlyBilling, margin
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function healthBadgeHtml(rating) {
  const map = { Green: 'health-green', Yellow: 'health-yellow', Red: 'health-red' };
  const cls = map[rating] || 'health-none';
  const label = rating || 'No check-in';
  return `<span class="health-badge ${cls}"><span class="dot"></span>${label}</span>`;
}

function portalVisitCellHtml(row) {
  if (!row.portalLastVisitedAt) return '<span class="date-cell">Never</span>';
  const d = row.daysSinceVisit;
  const label = d <= 0 ? 'Today' : d === 1 ? '1d ago' : `${d}d ago`;
  return `<span class="date-cell">${label}</span>`;
}

function renewalCellHtml(row) {
  if (!row.renewalDate) return '<span class="date-cell">—</span>';
  const label = row.renewalDays < 0
    ? `${Math.abs(row.renewalDays)}d overdue`
    : row.renewalDays === 0 ? 'Today' : `in ${row.renewalDays}d`;
  return `<span class="date-cell">${row.renewalDate} (${label})</span>`;
}

// One compact stacked-badge cell instead of three more full table columns
// - keeps the table from getting unreadably wide while still surfacing
// every new signal. Urgent ones (red) only show when actually triggered;
// "no meetings logged yet" shows as a muted, informational note instead
// of an urgent flag, since that's more likely a tool-adoption gap than an
// account actually going quiet (see the comment on staleContact above).
function signalBadgesHtml(row) {
  const badges = [];
  if (row.upsellOpportunity) badges.push(`<span class="signal-badge signal-opportunity">💡 Upsell Opportunity</span>`);
  if (row.overdueInvoice) badges.push(`<span class="signal-badge">💳 Invoice ${row.overdueInvoice.days}d overdue ($${Math.round(row.overdueInvoice.amount).toLocaleString()})</span>`);
  if (row.renewalNeedsQbr) badges.push(`<span class="signal-badge">📊 Renewal in ${row.renewalDays}d, ${row.lastQbrDate ? `last QBR ${row.daysSinceQbr}d ago` : 'no QBR on record'}</span>`);
  if (row.lowPulse) badges.push(`<span class="signal-badge">📉 Low satisfaction rating (${row.latestPulse.rating}/5)${row.latestPulse.comment ? ' w/ comment' : ''}</span>`);
  if (row.reportOverdue) badges.push(`<span class="signal-badge">📄 No monthly report in ${row.daysSinceReport}d</span>`);
  if (row.overspending) badges.push(`<span class="signal-badge">⚠ Overspending</span>`);
  if (row.staleApproval) badges.push(`<span class="signal-badge">⏳ Approval waiting ${row.oldestPendingApprovalDays}d</span>`);
  if (row.heavyOpenActionItems) badges.push(`<span class="signal-badge">☑ ${row.openActionItems} open action items</span>`);
  if (row.staleContact) badges.push(`<span class="signal-badge">💬 No contact ${row.daysSinceMeeting}d</span>`);
  if (!badges.length && row.lastMeetingDate === null) {
    badges.push(`<span class="signal-badge signal-muted">No meetings logged</span>`);
  }
  if (!badges.length) return '<span class="signal-none">—</span>';
  return `<div class="signal-badges">${badges.join('')}</div>`;
}

function renderTable() {
  const rows = buildRows();
  const filterText = el('filterClientInput').value.trim().toLowerCase();
  const attentionOnly = el('showAttentionOnlyToggle').checked;

  const visibleRows = rows.filter(r => {
    if (filterText && !r.name.toLowerCase().includes(filterText)) return false;
    if (attentionOnly && !r.needsAttention) return false;
    return true;
  });

  el('summaryUpsellOpportunities').textContent = rows.filter(r => r.upsellOpportunity).length;
  el('summaryRedHealth').textContent = rows.filter(r => r.healthRating === 'Red').length;
  el('summaryNoCheckin').textContent = rows.filter(r => r.staleCheckin).length;
  el('summaryRenewalsDue').textContent = rows.filter(r => r.renewalDueSoon).length;
  el('summaryOpenRevisions').textContent = rows.filter(r => r.heavyRevisions).length;
  el('summaryOverspending').textContent = rows.filter(r => r.overspending).length;
  el('summaryStaleApprovals').textContent = rows.filter(r => r.staleApproval).length;
  el('summaryNoContact').textContent = rows.filter(r => r.staleContact).length;
  el('summaryOverdueInvoices').textContent = rows.filter(r => r.overdueInvoice).length;
  if (el('summaryRenewalsNeedQbr')) el('summaryRenewalsNeedQbr').textContent = rows.filter(r => r.renewalNeedsQbr).length;
  if (el('summaryLowPulse')) el('summaryLowPulse').textContent = rows.filter(r => r.lowPulse).length;
  if (el('summaryReportOverdue')) el('summaryReportOverdue').textContent = rows.filter(r => r.reportOverdue).length;

  const tbody = el('dashboardTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = visibleRows.length === 0 ? 'block' : 'none';

  visibleRows.forEach(row => {
    const tr = document.createElement('tr');
    tr.className = row.needsAttention ? 'row-attention' : '';
    tr.innerHTML = `
      <td class="client-cell">${row.name}</td>
      <td>${healthBadgeHtml(row.healthRating)}</td>
      <td class="date-cell">${row.lastCheckinDate ? `${row.lastCheckinDate} (${row.daysSinceCheckin}d ago)` : 'Never'}</td>
      <td>${renewalCellHtml(row)}</td>
      <td>${row.openRevisions}</td>
      <td>${portalVisitCellHtml(row)}</td>
      <td>${signalBadgesHtml(row)}</td>
      <td><span class="section-tag ${row.needsAttention ? 'status-attention' : 'status-ok'}">${row.needsAttention ? 'Needs Attention' : 'On Track'}</span></td>
    `;
    tbody.appendChild(tr);
  });

  renderProfitabilityTable(rows);
}

// Only clients with an active Stripe subscription show up here -
// margin is meaningless without a revenue figure to weigh labor cost
// against (see getActiveMonthlyBilling's null-vs-0 comment above).
// Project/one-time clients aren't a gap in this table so much as out of
// scope for it; Budget Pacing Tracker's per-flight margin card is the
// right place for cost-vs-budget math on project work.
function renderProfitabilityTable(rows) {
  const body = el('profitabilityTableBody');
  const empty = el('profitabilityEmptyState');
  if (!body) return;

  const billedRows = rows.filter(r => r.monthlyBilling !== null).sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0));

  if (empty) empty.style.display = billedRows.length === 0 ? 'block' : 'none';

  body.innerHTML = billedRows.map(row => {
    const marginClass = row.margin >= 0 ? 'margin-positive' : 'margin-negative';
    const marginPct = row.monthlyBilling > 0 ? Math.round((row.margin / row.monthlyBilling) * 100) : null;
    return `
      <tr>
        <td class="client-cell">${row.name}</td>
        <td class="date-cell">${row.mtdHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}h${row.missingRateHours > 0 ? ` <span class="signal-badge signal-muted" style="margin-left:4px;">${row.missingRateHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}h no rate set</span>` : ''}</td>
        <td class="date-cell">$${Math.round(row.mtdLaborCost).toLocaleString()}</td>
        <td class="date-cell">$${Math.round(row.monthlyBilling).toLocaleString()}/mo</td>
        <td class="${marginClass}">${row.margin >= 0 ? '' : '-'}$${Math.abs(Math.round(row.margin)).toLocaleString()}${marginPct !== null ? ` (${marginPct}%)` : ''}</td>
      </tr>
    `;
  }).join('');

  const totalBilling = billedRows.reduce((sum, r) => sum + r.monthlyBilling, 0);
  const totalLabor = billedRows.reduce((sum, r) => sum + r.mtdLaborCost, 0);
  const totalMargin = totalBilling - totalLabor;
  const negativeMarginCount = billedRows.filter(r => r.margin < 0).length;

  if (el('summaryMtdMargin')) {
    el('summaryMtdMargin').textContent = `${totalMargin >= 0 ? '' : '-'}$${Math.abs(Math.round(totalMargin)).toLocaleString()}`;
  }
  if (el('summaryNegativeMargin')) el('summaryNegativeMargin').textContent = negativeMarginCount;
}

document.addEventListener('DOMContentLoaded', () => {
  el('filterClientInput').addEventListener('input', renderTable);
  el('showAttentionOnlyToggle').addEventListener('change', renderTable);

  listenToRevisionLog();
  listenToAdminActivityLog();
  renderTable();
  loadAuxData().then(renderTable);

  // Same iframe-race fix used across the other cross-client tools: clientsDb
  // can be empty if this loads before the parent Hub's data has synced.
  // Poll briefly and re-render once real data shows up.
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    if (Object.keys(getClients()).length > 0) {
      renderTable();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
