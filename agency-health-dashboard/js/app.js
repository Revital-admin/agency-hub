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

    const needsAttention = healthRating === 'Red' || renewalDueSoon || heavyRevisions
      || overspending || staleApproval || heavyOpenActionItems || staleContact;

    // Written by the portal itself on page load (portal/js/app.js's
    // recordPortalVisit), pulled into clientsDb by the Hub's
    // ensureClientPortalListeners - just a simple "did they ever open the
    // link" / "how long ago" signal, not tied to any specific action.
    const portalLastVisitedAt = client.portalLastVisitedAt || null;
    const daysSinceVisit = portalLastVisitedAt ? daysBetween(portalLastVisitedAt.slice(0, 10), todayStr()) : null;

    return {
      name, healthRating, lastCheckinDate, daysSinceCheckin, staleCheckin,
      renewalDate, renewalDays, renewalDueSoon, openRevisions, heavyRevisions, needsAttention,
      portalLastVisitedAt, daysSinceVisit,
      budgetPace, overspending, upsellOpportunity,
      oldestPendingApprovalDays, staleApproval,
      lastMeetingDate, daysSinceMeeting, staleContact,
      openActionItems, heavyOpenActionItems
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
}

document.addEventListener('DOMContentLoaded', () => {
  el('filterClientInput').addEventListener('input', renderTable);
  el('showAttentionOnlyToggle').addEventListener('change', renderTable);

  listenToRevisionLog();
  renderTable();

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
