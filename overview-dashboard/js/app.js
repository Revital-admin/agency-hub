/* ============================================================
   OVERVIEW DASHBOARD — APP
   Extracted from the core shell (index.html's tab-dashboard section
   + app.js's renderDashboard/renderNeedsAttention/renderSalesPipeline
   Value/renderLeadSourceRoi/renderMoodBoardsAwaitingFeedback/
   renderProductionBoardAttention/renderWhosOutToday) into its own
   tool, Oct 2026, so the core shell no longer hardcodes it.

   Connected Mode only - this tool has no meaningful standalone mode,
   since every card on it reads either the active client or the
   whole clientsDb. Reached via window.parent:
     - getActiveClient()       - single-client cards (health,
       onboarding, every audit %, etc.)
     - getClientsDb()          - the six agency-wide cards (Needs
       Attention, Sales Pipeline Value, Lead Source ROI, Mood Boards
       Awaiting Feedback, Production Board Attention). NEW as of this
       extraction - no other tool needed cross-client data before, so
       there was nothing to expose until now. Read-only: this tool
       never mutates clientsDb or calls saveDatabase().
     - firebaseDb/firebaseDoc/firebaseGetDoc - same Firestore
       instance the shell already uses, several cards here read
       agency-wide docs (contractInvoices, proposalFollowUps,
       revisionFeedbackLog, changeOrders, shotList, permitTracker,
       releaseForms, callSheets, teamRoster) directly.
     - switchClient(name) / navigateToTab(tabId) - Needs Attention's
       rows jump to a different client + tab when clicked.

   Per the Hub's established convention (see parsePhaseAmountToNumber/
   isOverBudgetPace comments elsewhere in the shell's app.js), pure
   helper functions and threshold constants are DUPLICATED here rather
   than reached across the iframe boundary - only actions that mutate
   shared state, or genuinely agency-wide data with nowhere else to
   live, go through window.parent.

   Refresh model: window.parent.renderDashboard() (called from ~16
   other tools after a save) now just postMessages this iframe to
   re-render in place, instead of writing DOM directly - see
   setupRefreshListener() below and renderHealthDashboard-style
   setIframeAbsoluteSrc() in the shell's app.js for the first-load/
   nav-click path.
   ============================================================ */

/* ── Shared thresholds, duplicated from the shell's app.js per the
   convention above (keep these in sync if those are ever changed) ── */
const STALE_NUDGE_DAYS_THRESHOLD = 7;
const RENEWAL_NUDGE_DAYS_THRESHOLD = 30;
const SCOPE_CREEP_OPEN_REVISIONS_THRESHOLD = 3;
const STALE_APPROVAL_NUDGE_DAYS_THRESHOLD = 5;
const HEAVY_ACTION_ITEMS_THRESHOLD = 3;
const STALE_CONTACT_NUDGE_DAYS_THRESHOLD = 30;

function escapeHtmlCore(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function parsePhaseAmountToNumber(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function getBudgetPacingList(client) {
  if (!client) return [];
  if (Array.isArray(client.budgetPacingList)) return client.budgetPacingList;
  return client.budgetPacing ? [client.budgetPacing] : [];
}

// Mirrors agency-health-dashboard/js/app.js's getBudgetPaceClass
// (pace-danger branch) - duplicated here rather than reached across the
// iframe boundary, same convention as parsePhaseAmountToNumber above.
function isOverBudgetPace(p) {
  if (!p || !p.totalBudget || p.totalBudget <= 0) return false;
  const start = new Date(p.startDate);
  const end = new Date(p.endDate);
  const now = new Date();
  if (now > end) return true;
  if (now < start) return false;
  const totalDays = (end - start) / 86400000;
  const daysPassed = (now - start) / 86400000;
  const expectedPacingRatio = totalDays > 0 ? daysPassed / totalDays : 1;
  const actualPacingRatio = p.spentToDate / p.totalBudget;
  return actualPacingRatio > expectedPacingRatio * 1.15;
}

function calculateUxuiLetterGrade(pct) {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  if (pct >= 50) return "E";
  return "F";
}

async function fetchSignedClientNameSet() {
  const signed = new Set();
  if (!window.parent.firebaseDb || !window.parent.firebaseDoc || !window.parent.firebaseGetDoc) return signed;
  try {
    const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "contractInvoices");
    const snap = await window.parent.firebaseGetDoc(ref);
    const list = (snap.exists && snap.data().list) || [];
    list.forEach(r => { if (r.clientName && r.contractStatus === "Signed") signed.add(r.clientName); });
  } catch (e) {
    console.warn("Couldn't load signed-client list for Sales Pipeline Value:", e);
  }
  return signed;
}

// Agency-wide (unlike every other Overview Dashboard card, which is
// scoped to the active client): sums Proposal Calculator's
// computedMonthly across every client that isn't yet a signed contract.
// There was previously no way to see total open-proposal value without
// opening each client's Proposal Calculator one at a time and reading
// the on-screen total.
async function renderSalesPipelineValue() {
  const clientsDb = (window.parent.getClientsDb && window.parent.getClientsDb()) || {};
  const valueEl = document.getElementById("dashPipelineValue");
  const countEl = document.getElementById("dashPipelineCount");
  if (!valueEl) return;

  const signedNames = await fetchSignedClientNameSet();
  const sandboxName = "Quick Sandbox (One-Offs)";

  let total = 0, count = 0;
  Object.keys(clientsDb).forEach(name => {
    if (name === sandboxName || signedNames.has(name)) return;
    const proposal = clientsDb[name].proposal;
    const monthly = proposal && typeof proposal.computedMonthly === "number" ? proposal.computedMonthly : 0;
    if (monthly > 0) {
      total += monthly;
      count++;
    }
  });

  valueEl.textContent = "$" + Math.round(total).toLocaleString("en-US");
  if (countEl) countEl.textContent = count + (count === 1 ? " open proposal" : " open proposals");
}


// Same "days since" cadence as STALE_NUDGE_DAYS_THRESHOLD above - a board
// shared this recently isn't worth flagging as slow yet, clients don't
// always open a portal link the same day it's shared.
const MOODBOARD_AWAITING_DAYS_THRESHOLD = 7;

// Agency-wide, same reasoning as Sales Pipeline Value above: scans every
// client's shared mood boards for ones with no entry yet in
// moodBoardStyleFeedback (see mood-board-builder/js/app.js's saveBoard/
// toggleShare for how boards get shared, and portal/js/app.js's
// saveMoodBoardStyleFeedback for how a rating arrives). board.sharedAt is
// only set going forward (added alongside this card) - a board shared
// before that change has no sharedAt and so never counts toward the
// "waiting Nd" figure, only toward the plain awaiting-count.
function renderMoodBoardsAwaitingFeedback() {
  const clientsDb = (window.parent.getClientsDb && window.parent.getClientsDb()) || {};
  const valueEl = document.getElementById("dashMoodBoardsAwaitingVal");
  const descEl = document.getElementById("dashMoodBoardsAwaitingDesc");
  if (!valueEl) return;

  let awaitingCount = 0;
  let staleCount = 0;
  Object.values(clientsDb).forEach(client => {
    if (!client || !Array.isArray(client.moodBoards)) return;
    const feedbackMap = client.moodBoardStyleFeedback || {};
    client.moodBoards.forEach(board => {
      if (!board.sharedWithClient || feedbackMap[board.id]) return;
      awaitingCount++;
      const days = board.sharedAt ? Math.floor((Date.now() - new Date(board.sharedAt).getTime()) / 86400000) : null;
      if (days !== null && days >= MOODBOARD_AWAITING_DAYS_THRESHOLD) staleCount++;
    });
  });

  valueEl.textContent = String(awaitingCount);
  if (descEl) {
    if (awaitingCount === 0) {
      descEl.textContent = "all shared boards rated";
    } else if (staleCount > 0) {
      descEl.textContent = `${staleCount} waiting ${MOODBOARD_AWAITING_DAYS_THRESHOLD}+ days`;
    } else {
      descEl.textContent = awaitingCount === 1 ? "board shared, no rating yet" : "boards shared, no rating yet";
    }
  }
}


// Same 7-day threshold production-board/js/app.js's own stuckBadge uses -
// kept as a separate literal here for the same "each caller stays
// self-contained" reason as MOODBOARD_AWAITING_DAYS_THRESHOLD above.
const PRODUCTION_BOARD_STUCK_DAYS_THRESHOLD = 7;

// Agency-wide, same shape as Sales Pipeline Value / Mood Boards Awaiting
// Feedback above - scans every client's productionBoard for items that are
// either overdue (targetDate has passed) or stuck (no lastActivityAt/
// movedAt update in PRODUCTION_BOARD_STUCK_DAYS_THRESHOLD+ days), so
// something falling behind shows up here without needing to open every
// client one at a time in Production Board's own "By Client" view.
function renderProductionBoardAttention() {
  const clientsDb = (window.parent.getClientsDb && window.parent.getClientsDb()) || {};
  const valueEl = document.getElementById("dashProductionBoardVal");
  const descEl = document.getElementById("dashProductionBoardDesc");
  if (!valueEl) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let overdueCount = 0;
  let stuckCount = 0;
  Object.values(clientsDb).forEach(client => {
    if (!client || !Array.isArray(client.productionBoard)) return;
    client.productionBoard.forEach(item => {
      if (item.targetDate) {
        const due = new Date(item.targetDate);
        due.setHours(0, 0, 0, 0);
        if (due < today) overdueCount++;
      }
      const lastActive = item.lastActivityAt || item.movedAt;
      const days = lastActive ? Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000) : null;
      if (days !== null && days >= PRODUCTION_BOARD_STUCK_DAYS_THRESHOLD) stuckCount++;
    });
  });

  const total = overdueCount + stuckCount;
  valueEl.textContent = String(total);
  if (descEl) {
    if (total === 0) {
      descEl.textContent = "nothing overdue or stuck";
    } else {
      const parts = [];
      if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
      if (stuckCount > 0) parts.push(`${stuckCount} stuck`);
      descEl.textContent = parts.join(", ");
    }
  }
}


// Matches Client Intake Pre-Qualifier's leadSource <select> options
// (intake-prequalifier/index.html) - kept here rather than imported
// across the iframe boundary, same "each caller stays self-contained"
// convention as parsePhaseAmountToNumber above.
const LEAD_SOURCE_LABELS = {
  referral: "Referral",
  cold_outreach: "Cold Outreach",
  website: "Website",
  social_media: "Social Media",
  networking: "Networking",
  partner: "Partner",
  other: "Other"
};

// Lead Source ROI: closes a loop nothing previously connected. Client
// Intake Pre-Qualifier already captures leadSource per client
// (client.intakeQualifier.data.leadSource - only set for clients who
// actually went through that tool, so clients onboarded without it
// simply don't contribute a source rather than counting as
// unattributed noise), and Contract & Invoice Tracker already knows
// who's Signed with a real invoiceAmount (same "paying, not just
// signed at $0" filter as renderPhase2Preview's parsePhaseAmountToNumber
// use). Shows win rate + attributed MRR per source so it's visible
// which channels are actually worth the effort.
async function renderLeadSourceRoi() {
  const clientsDb = (window.parent.getClientsDb && window.parent.getClientsDb()) || {};
  const el = document.getElementById("leadSourceRoiList");
  if (!el) return;

  const sandboxName = "Quick Sandbox (One-Offs)";
  const bySource = {};
  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client || name === sandboxName) return;
    const source = client.intakeQualifier && client.intakeQualifier.data && client.intakeQualifier.data.leadSource;
    if (!source) return;
    if (!bySource[source]) bySource[source] = { total: 0, names: [] };
    bySource[source].total++;
    bySource[source].names.push(name);
  });

  if (Object.keys(bySource).length === 0) {
    el.innerHTML = `<div style="color: var(--color-text-muted);">No lead source data yet - run new prospects through the Client Intake Pre-Qualifier to start tracking this.</div>`;
    return;
  }

  let revenueByName = {};
  if (window.parent.firebaseDb && window.parent.firebaseDb.collection) {
    try {
      const snap = await window.parent.firebaseDb.collection("agency").doc("contractInvoices").get();
      const list = (snap.exists && snap.data().list) || [];
      list.forEach(r => {
        if (r.contractStatus !== 'Signed') return;
        const amt = parsePhaseAmountToNumber(r.invoiceAmount);
        if (amt > 0) revenueByName[r.clientName] = amt;
      });
    } catch (e) {
      console.warn("Couldn't load contract data for Lead Source ROI:", e);
    }
  }

  const rows = Object.entries(bySource).map(([source, data]) => {
    const won = data.names.filter(name => Object.prototype.hasOwnProperty.call(revenueByName, name));
    const revenue = won.reduce((sum, name) => sum + revenueByName[name], 0);
    return { label: LEAD_SOURCE_LABELS[source] || source, total: data.total, wonCount: won.length, revenue };
  }).sort((a, b) => b.revenue - a.revenue || b.wonCount - a.wonCount);

  el.innerHTML = rows.map(r => {
    const pct = r.total > 0 ? Math.round((r.wonCount / r.total) * 100) : 0;
    return `
      <div style="padding:4px 0; display:flex; justify-content:space-between; gap:10px; align-items:baseline; border-bottom:1px solid var(--border-color, rgba(255,255,255,0.06));">
        <span><strong>${escapeHtmlCore(r.label)}</strong> &middot; ${r.wonCount}/${r.total} signed (${pct}%)</span>
        <span style="color:var(--color-text-muted); font-size:0.78rem; white-space:nowrap;">${r.revenue > 0 ? '$' + r.revenue.toLocaleString() + '/mo' : '--'}</span>
      </div>
    `;
  }).join("");
}


// Needs Attention: consolidates three signals that already exist as
// separate mechanisms elsewhere - runStaleClientNudgeCheck's stale-portal
// check, runRenewalNudgeCheck's upcoming-renewal check, and
// renderMoodBoardsAwaitingFeedback's per-board threshold - into one
// glanceable agency-wide list instead of three separate places to check.
// Deliberately reads clientsDb directly rather than adminNotifications:
// the bell's nudge history is cooldown-gated (STALE_NUDGE_COOLDOWN_MS /
// RENEWAL_NUDGE_COOLDOWN_MS - so it won't re-show something you were
// already pinged about recently), but this card answers "what's
// outstanding right now", so it should always reflect current state
// regardless of nudge cooldowns. Thresholds/constants (STALE_NUDGE_
// DAYS_THRESHOLD, RENEWAL_NUDGE_DAYS_THRESHOLD, MOODBOARD_AWAITING_
// DAYS_THRESHOLD) are shared with those existing checks further down
// this file - referencing them here rather than duplicating the numbers
// keeps this card in lockstep with whatever those nudges consider
// "worth flagging".
async function renderNeedsAttention() {
  const clientsDb = (window.parent.getClientsDb && window.parent.getClientsDb()) || {};
  const el = document.getElementById("needsAttentionList");
  if (!el) return;

  const now = Date.now();
  const sandboxName = "Quick Sandbox (One-Offs)";
  const items = [];

  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client || name === sandboxName) return;

    if (client.portalConfig && client.portalConfig.magicToken) {
      // Same signal as runStaleClientNudgeCheck.
      const pendingCount = Array.isArray(client.pendingApprovals) ? client.pendingApprovals.length : 0;
      if (pendingCount > 0) {
        const lastVisited = client.portalLastVisitedAt ? new Date(client.portalLastVisitedAt).getTime() : null;
        const daysSinceVisit = lastVisited ? Math.floor((now - lastVisited) / 86400000) : null;
        if (daysSinceVisit === null || daysSinceVisit >= STALE_NUDGE_DAYS_THRESHOLD) {
          const visitPhrase = daysSinceVisit === null ? "never opened portal" : `no portal visit in ${daysSinceVisit}d`;
          const approvalPhrase = pendingCount === 1 ? "1 approval" : `${pendingCount} approvals`;
          items.push({ name, urgency: daysSinceVisit === null ? 9999 : 1000 + daysSinceVisit, message: `${approvalPhrase} waiting, ${visitPhrase}` });
        }
      }

      // Same signal as runRenewalNudgeCheck.
      const rec = client.renewal;
      if (rec && rec.renewalDate && (rec.status === 'On Track' || rec.status === 'At Risk')) {
        const days = Math.round((new Date(rec.renewalDate) - new Date(new Date().toDateString())) / 86400000);
        if (!Number.isNaN(days) && days <= RENEWAL_NUDGE_DAYS_THRESHOLD) {
          const phrase = days < 0 ? `renewal overdue by ${Math.abs(days)}d` : days === 0 ? "renews today" : `renews in ${days}d`;
          items.push({ name, urgency: days < 0 ? 2000 + Math.abs(days) : (RENEWAL_NUDGE_DAYS_THRESHOLD - days), message: phrase });
        }
      }

      // Same signal as runStaleApprovalNudgeCheck - distinct from the
      // portal-visit-based check above, this keys off the approval's own
      // age (a client can visit regularly and still leave one sitting).
      const pendingApprovals = Array.isArray(client.pendingApprovals) ? client.pendingApprovals : [];
      const approvalAges = pendingApprovals.filter(a => a && a.createdAt).map(a => Math.floor((now - new Date(a.createdAt).getTime()) / 86400000));
      const oldestApprovalDays = approvalAges.length ? Math.max(...approvalAges) : null;
      if (oldestApprovalDays !== null && oldestApprovalDays >= STALE_APPROVAL_NUDGE_DAYS_THRESHOLD) {
        items.push({ name, urgency: 600 + oldestApprovalDays, message: `an approval has been sitting for ${oldestApprovalDays}d` });
      }
    }

    // Same per-board threshold as renderMoodBoardsAwaitingFeedback, rolled
    // up per client here instead of as a single agency-wide count.
    if (Array.isArray(client.moodBoards)) {
      const feedbackMap = client.moodBoardStyleFeedback || {};
      let staleBoards = 0;
      let oldestDays = 0;
      client.moodBoards.forEach(board => {
        if (!board.sharedWithClient || feedbackMap[board.id]) return;
        const days = board.sharedAt ? Math.floor((now - new Date(board.sharedAt).getTime()) / 86400000) : null;
        if (days !== null && days >= MOODBOARD_AWAITING_DAYS_THRESHOLD) {
          staleBoards++;
          oldestDays = Math.max(oldestDays, days);
        }
      });
      if (staleBoards > 0) {
        const boardPhrase = staleBoards === 1 ? "1 mood board" : `${staleBoards} mood boards`;
        items.push({ name, urgency: oldestDays, message: `${boardPhrase} awaiting feedback ${oldestDays}+ days` });
      }
    }

    // Latest health rating, shared by the Red-health row and the upsell
    // check right below - same "checkins[0] is most recent" convention as
    // Agency Health Dashboard's buildRows.
    const checkins = Array.isArray(client.weeklyCheckins) ? client.weeklyCheckins : [];
    const healthRating = checkins.length ? checkins[0].healthRating : null;

    // Same current-state signal as Agency Health Dashboard's needsAttention
    // (healthRating === 'Red' is the first condition there) and the
    // health_red_flip nudge in weekly-account-checkin - but this is a
    // persistent "is it Red right now" check rather than a one-time flip
    // event, so a lingering Red client keeps showing here even if the flip
    // itself happened days ago and its nudge already cooled down.
    if (healthRating === 'Red') {
      items.push({ name, urgency: 700, message: "health check-in is Red", goTab: 'tab-weeklycheckin' });
    }

    // Same overspending+healthy signal as Agency Health Dashboard's
    // upsellOpportunity / runUpsellNudgeCheck - not a risk to flag urgently,
    // just a heads-up worth a bigger-retainer conversation, so a flat
    // mid-range urgency rather than a days-based one.
    if (getBudgetPacingList(client).some(p => isOverBudgetPace(p)) && healthRating !== 'Red') {
      items.push({ name, urgency: 40, message: "pacing over budget - possible upsell opportunity" });
    }

    // Same two signals as runHeavyActionItemsNudgeCheck / runStaleContactNudgeCheck
    // below, and Agency Health Dashboard's heavyOpenActionItems/staleContact
    // badges - both read client.meetingNotes directly, not gated by
    // portalConfig since Meeting Notes Logger isn't portal-dependent.
    const meetingNotes = Array.isArray(client.meetingNotes) ? client.meetingNotes : [];
    const openActionItems = meetingNotes.reduce((sum, m) =>
      sum + (Array.isArray(m.actionItems) ? m.actionItems.filter(ai => !ai.completed).length : 0), 0);
    if (openActionItems >= HEAVY_ACTION_ITEMS_THRESHOLD) {
      items.push({ name, urgency: 500 + openActionItems, message: `${openActionItems} open action items across meeting notes`, goTab: 'tab-meetingnotes' });
    }

    // A client with zero meeting notes ever logged is deliberately NOT
    // flagged here - same reasoning as Agency Health Dashboard's own
    // staleContact (a quiet, report-only retainer might genuinely have
    // none and be perfectly healthy). Only a client who WAS being logged
    // and then went quiet counts.
    if (meetingNotes.length > 0) {
      const lastMeetingDate = meetingNotes.map(m => m.date).filter(Boolean).sort().slice(-1)[0];
      if (lastMeetingDate) {
        const daysSinceMeeting = Math.floor((now - new Date(lastMeetingDate).getTime()) / 86400000);
        if (daysSinceMeeting >= STALE_CONTACT_NUDGE_DAYS_THRESHOLD) {
          items.push({ name, urgency: 300 + daysSinceMeeting, message: `no meeting logged in ${daysSinceMeeting}d`, goTab: 'tab-meetingnotes' });
        }
      }
    }
  });

  // Overdue proposal follow-ups: same signal as
  // runProposalFollowupNudgeCheck. A separate agency doc (not on
  // clientsDb), so fetched here rather than inside the loop above -
  // matches renderPhase2Preview's contractInvoices fetch pattern.
  if (window.parent.firebaseDb && window.parent.firebaseDb.collection) {
    try {
      const snap = await window.parent.firebaseDb.collection("agency").doc("proposalFollowUps").get();
      const list = (snap.exists && snap.data().list) || [];
      const today = new Date().toDateString();
      list.forEach(p => {
        if (p.status !== 'open' || !p.nextFollowUpDate || !p.prospectName) return;
        const daysOverdue = Math.round((new Date(today) - new Date(p.nextFollowUpDate)) / 86400000);
        if (daysOverdue < 1) return;
        items.push({ name: p.prospectName, urgency: 1800 + daysOverdue, message: `proposal follow-up ${daysOverdue}d overdue (${p.followUpStage || 'no stage set'})` });
      });
    } catch (e) {
      console.warn("Couldn't load proposal follow-ups for Needs Attention:", e);
    }
  }

  // Scope creep: same signal as runScopeCreepNudgeCheck - a client with
  // SCOPE_CREEP_OPEN_REVISIONS_THRESHOLD+ open revisions (matching Agency
  // Health Dashboard's heavyRevisions bar) and no Pending/Approved change
  // order already covering them. goTab sends this row straight to Change
  // Order Generator instead of the dashboard, since that's the actual next
  // action - see the goTab handling in the click wiring below.
  if (window.parent.firebaseDb && window.parent.firebaseDb.collection) {
    try {
      const [revSnap, coSnap] = await Promise.all([
        window.parent.firebaseDb.collection("agency").doc("revisionFeedbackLog").get(),
        window.parent.firebaseDb.collection("agency").doc("changeOrders").get()
      ]);
      const revisions = (revSnap.exists && revSnap.data().list) || [];
      const changeOrders = (coSnap.exists && coSnap.data().list) || [];

      const openByClient = {};
      revisions.forEach(r => {
        if (!r.clientName || r.dateResolved) return;
        if (!openByClient[r.clientName]) openByClient[r.clientName] = [];
        openByClient[r.clientName].push(r);
      });

      Object.entries(openByClient).forEach(([clientName, openRows]) => {
        if (openRows.length < SCOPE_CREEP_OPEN_REVISIONS_THRESHOLD) return;

        const oldestRequestDate = openRows.map(r => r.dateRequested).filter(Boolean).sort()[0];
        const alreadyCovered = changeOrders.some(co =>
          co.clientName === clientName &&
          (co.status === 'Pending' || co.status === 'Approved') &&
          (!oldestRequestDate || !co.dateCreated || co.dateCreated >= oldestRequestDate)
        );
        if (alreadyCovered) return;

        items.push({
          name: clientName,
          urgency: 900 + openRows.length,
          message: `${openRows.length} open revisions, no change order in motion`,
          goTab: 'tab-changeorder'
        });
      });
    } catch (e) {
      console.warn("Couldn't load revisions/change orders for Needs Attention:", e);
    }
  }

  // Production trackers (Shot List Builder, Permit Tracker, Release Forms
  // Tracker, Call Sheet Builder): each already computes its own "what still
  // needs action" filter for its own table (see each tool's renderTable),
  // but that list was only ever visible by opening that specific tracker -
  // nothing surfaced it here. Same agency-doc fetch pattern as the
  // proposal-followups/revisions blocks above. Wrap Report is deliberately
  // excluded - per its own header comment, a wrap report has nothing left
  // to action once it's written, so there's no "needs attention" signal to
  // raise for it.
  if (window.parent.firebaseDb && window.parent.firebaseDb.collection) {
    try {
      const [shotSnap, permitSnap, releaseSnap, callSheetSnap] = await Promise.all([
        window.parent.firebaseDb.collection("agency").doc("shotList").get(),
        window.parent.firebaseDb.collection("agency").doc("permitTracker").get(),
        window.parent.firebaseDb.collection("agency").doc("releaseForms").get(),
        window.parent.firebaseDb.collection("agency").doc("callSheets").get(),
      ]);

      // Shot List: shots marked Needs Reshoot, grouped per client so one
      // row per client (not one row per shot) matches the density of
      // everything else in this list.
      const shots = (shotSnap.exists && shotSnap.data().list) || [];
      const reshootsByClient = {};
      shots.forEach(s => {
        if (s.status !== 'Needs Reshoot' || !s.clientName) return;
        reshootsByClient[s.clientName] = (reshootsByClient[s.clientName] || 0) + 1;
      });
      Object.entries(reshootsByClient).forEach(([clientName, count]) => {
        items.push({
          name: clientName,
          urgency: 850 + count,
          message: count === 1 ? '1 shot needs a reshoot' : `${count} shots need a reshoot`,
          goTab: 'tab-shotlist',
        });
      });

      // Permit Tracker: same "expiring inside 30 days" window as the
      // tracker's own isExpiringSoon, plus any permit stuck in Denied,
      // since that's actively blocking a shoot rather than just pending.
      const permits = (permitSnap.exists && permitSnap.data().list) || [];
      const now = Date.now();
      permits.forEach(p => {
        if (!p.clientName) return;
        if (p.status === 'Approved' && p.expirationDate) {
          const expires = new Date(p.expirationDate + 'T00:00:00');
          if (!isNaN(expires.getTime())) {
            const daysUntil = (expires - now) / 86400000;
            if (daysUntil >= 0 && daysUntil <= 30) {
              items.push({
                name: p.clientName,
                urgency: 1400 + (30 - Math.floor(daysUntil)),
                message: `${p.permitType || 'permit'} expires in ${Math.floor(daysUntil)}d`,
                goTab: 'tab-permittracker',
              });
            }
          }
        } else if (p.status === 'Denied') {
          items.push({
            name: p.clientName,
            urgency: 1300,
            message: `${p.permitType || 'permit'} was denied - needs a new application`,
            goTab: 'tab-permittracker',
          });
        }
      });

      // Release Forms: Pending entries, grouped per client - same density
      // reasoning as the Shot List reshoot rollup above.
      const releases = (releaseSnap.exists && releaseSnap.data().list) || [];
      const pendingReleasesByClient = {};
      releases.forEach(r => {
        if (r.status !== 'Pending' || !r.clientName) return;
        pendingReleasesByClient[r.clientName] = (pendingReleasesByClient[r.clientName] || 0) + 1;
      });
      Object.entries(pendingReleasesByClient).forEach(([clientName, count]) => {
        items.push({
          name: clientName,
          urgency: 800 + count,
          message: count === 1 ? '1 release form still pending' : `${count} release forms still pending`,
          goTab: 'tab-releaseforms',
        });
      });

      // Call Sheets: Confirmed shoots happening within 3 days - same "soon"
      // window as the tracker's own row-soon highlight, surfaced here as a
      // heads-up rather than a blocking item (hence the lower urgency band).
      const callSheets = (callSheetSnap.exists && callSheetSnap.data().list) || [];
      callSheets.forEach(c => {
        if (c.status !== 'Confirmed' || !c.shootDate || !c.clientName) return;
        const shootDate = new Date(c.shootDate + 'T00:00:00');
        if (isNaN(shootDate.getTime())) return;
        const daysOut = Math.round((shootDate - new Date(new Date().toDateString())) / 86400000);
        if (daysOut >= 0 && daysOut <= 3) {
          items.push({
            name: c.clientName,
            urgency: 1000 + (3 - daysOut),
            message: daysOut === 0 ? `shoot is today (${c.shootTitle || 'untitled'})` : `shoot in ${daysOut}d (${c.shootTitle || 'untitled'})`,
            goTab: 'tab-callsheet',
          });
        }
      });
    } catch (e) {
      console.warn("Couldn't load production trackers for Needs Attention:", e);
    }
  }

  if (items.length === 0) {
    el.innerHTML = `<div style="color: var(--color-text-muted);">Nothing needs attention right now.</div>`;
    return;
  }

  items.sort((a, b) => b.urgency - a.urgency);

  el.innerHTML = items.map(item => `
    <div class="needs-attention-row" data-client="${escapeHtmlCore(item.name)}" data-go-tab="${escapeHtmlCore(item.goTab || 'tab-dashboard')}" style="padding:5px 0; cursor:pointer; display:flex; justify-content:space-between; gap:10px; align-items:baseline; border-bottom:1px solid var(--border-color, rgba(255,255,255,0.06));">
      <span><strong>${escapeHtmlCore(item.name)}</strong> &middot; ${escapeHtmlCore(item.message)}</span>
      <span style="color:var(--color-text-muted); font-size:0.72rem; white-space:nowrap;">Open &rarr;</span>
    </div>
  `).join("");

  el.querySelectorAll(".needs-attention-row").forEach(row => {
    row.addEventListener("click", () => {
      window.parent.switchClient(row.getAttribute("data-client"));
      window.parent.navigateToTab(row.getAttribute("data-go-tab") || "tab-dashboard");
    });
  });
}

function todayIsoLocalForDashboard() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function renderWhosOutToday() {
  const el = document.getElementById('whosOutTodayList');
  if (!el) return;
  if (!window.parent.firebaseDb || !window.parent.firebaseDoc || !window.parent.firebaseGetDoc) return;
  try {
    const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamRoster");
    const snap = await window.parent.firebaseGetDoc(ref);
    const data = snap && snap.exists ? snap.data() : null;
    const members = (data && data.list) || [];
    const today = todayIsoLocalForDashboard();

    const outToday = members.filter(m => {
      const timeOff = Array.isArray(m.timeOff) ? m.timeOff : [];
      return timeOff.some(t => t.startDate <= today && today <= (t.endDate || t.startDate));
    });

    el.innerHTML = outToday.length
      ? outToday.map(m => `<div style="padding:3px 0;">${escapeHtmlCore(m.memberName)}</div>`).join('')
      : `<div style="color: var(--color-text-muted);">Everyone's in today.</div>`;
  } catch (e) {
    console.warn("Couldn't load who's out today:", e);
    el.innerHTML = `<div style="color: var(--color-text-muted);">Couldn't load.</div>`;
  }
}

function renderDashboard() {
  const client = window.parent.getActiveClient();
  if (!client) return;

  // Active client summary details
  const hero = document.getElementById("dashHeroClientName"); if (hero) hero.textContent = client.name;
  const heroUrl = document.getElementById("dashHeroTargetUrl"); if (heroUrl) heroUrl.textContent = client.targetUrl || "No website logged yet";
  const heroDate = document.getElementById("dashHeroCreatedDate"); if (heroDate) heroDate.textContent = client.createdDate || "N/A";

  const dashClickupUrl = document.getElementById("dashClickupUrl");
  const dashClickupBtn = document.getElementById("dashClickupBtn");
  if (dashClickupUrl && dashClickupBtn) {
    dashClickupUrl.value = client.clickupUrl || "";
    if (client.clickupUrl) {
      dashClickupBtn.href = client.clickupUrl;
      dashClickupBtn.style.display = "flex";
    } else {
      dashClickupBtn.style.display = "none";
    }
  }

  // Client Health — pulled from the latest Weekly Account Check-In, if any
  const healthVal = document.getElementById("dashHealthVal");
  const healthDesc = document.getElementById("dashHealthDesc");
  const healthProgress = document.getElementById("dashHealthProgress");
  if (healthVal && healthDesc && healthProgress) {
    const checkins = Array.isArray(client.weeklyCheckins) ? client.weeklyCheckins : [];
    const latest = checkins.length ? checkins[0] : null; // already kept newest-first
    if (latest && latest.healthRating) {
      const colors = { Green: "#22c55e", Yellow: "#eab308", Red: "#ef4444" };
      const color = colors[latest.healthRating] || "var(--color-text-secondary)";
      healthVal.textContent = latest.healthRating;
      healthVal.style.color = color;
      healthDesc.textContent = `Week of ${latest.date}${latest.q1_responsive ? ' — client ' + latest.q1_responsive.toLowerCase() : ''}`;
      healthProgress.style.width = "100%";
      healthProgress.style.background = color;
    } else {
      healthVal.textContent = "No check-in yet";
      healthVal.style.color = "";
      healthDesc.textContent = "Run a Weekly Account Check-In to populate this";
      healthProgress.style.width = "0%";
      healthProgress.style.background = "";
    }
  }

  // Calculate Onboarding completion %
  let totalOb = 0;
  let checkedOb = 0;
  if (client.onboardingChecklist && Array.isArray(client.onboardingChecklist)) {
    client.onboardingChecklist.forEach(cat => {
      if (cat.items && Array.isArray(cat.items)) {
        cat.items.forEach(item => {
          totalOb++;
          if (item.checked) checkedOb++;
        });
      }
    });
  }
  const obPct = totalOb > 0 ? Math.round((checkedOb / totalOb) * 100) : 0;
  document.getElementById("dashOnboardingVal").textContent = `${obPct}%`;
  document.getElementById("dashOnboardingProgress").style.width = `${obPct}%`;

  // Calculate UX/UI Checklist progress (40 items total)
  let totalUx = 40;
  let checkedUx = 0;
  if (client.uxuiAudit && client.uxuiAudit.checked) {
    Object.keys(client.uxuiAudit.checked).forEach(k => {
      if (client.uxuiAudit.checked[k]) {
        checkedUx++;
      }
    });
  }
  const uxPct = Math.round((checkedUx / totalUx) * 100);
  const uxGrade = calculateUxuiLetterGrade(uxPct);
  document.getElementById("dashUxuiVal").textContent = `${uxPct}% (${uxGrade})`;
  document.getElementById("dashUxuiProgress").style.width = `${uxPct}%`;

  // Calculate SEO checklist checked % (23 items total)
  const seoTotal = 23;
  let seoFilled = 0;
  if (client.seoAudit && client.seoAudit.checked) {
    Object.keys(client.seoAudit.checked).forEach(k => {
      if (client.seoAudit.checked[k]) {
        seoFilled++;
      }
    });
  }
  const seoPct = seoTotal > 0 ? Math.round((seoFilled / seoTotal) * 100) : 0;
  document.getElementById("dashSeoVal").textContent = `${seoPct}%`;
  document.getElementById("dashSeoProgress").style.width = `${seoPct}%`;
  

  // Calculate Campaign Launch Checklist
  let totalCampaignLaunch = 23; // 23 items total
  let checkedCampaignLaunch = 0;
  if (client.campaignLaunch && client.campaignLaunch.checked) {
    Object.keys(client.campaignLaunch.checked).forEach(k => {
      if (client.campaignLaunch.checked[k]) {
        checkedCampaignLaunch++;
      }
    });
  }
  const campaignLaunchPct = Math.round((checkedCampaignLaunch / totalCampaignLaunch) * 100);
  document.getElementById("dashCampaignLaunchVal").textContent = `${campaignLaunchPct}%`;
  document.getElementById("dashCampaignLaunchProgress").style.width = `${campaignLaunchPct}%`;

  // Calculate Paid Ads Audit (16 items total)
  const paTotal = 16;
  let paFilled = 0;
  if (client.paidAdsAudit && client.paidAdsAudit.checked) {
    Object.keys(client.paidAdsAudit.checked).forEach(k => {
      if (client.paidAdsAudit.checked[k]) {
        paFilled++;
      }
    });
  }
  const dashPaAuditFill = document.getElementById('dashPaidAdsProgress');
  const dashPaidAdsVal = document.getElementById('dashPaidAdsVal');
  if (dashPaAuditFill && dashPaidAdsVal) {
    const paPct = paTotal > 0 ? Math.round((paFilled / paTotal) * 100) : 0;
    dashPaAuditFill.style.width = paPct + '%';
    dashPaidAdsVal.textContent = paPct + '%';
  }

  // Calculate Email Audit (16 items total)
  const emTotal = 16;
  let emFilled = 0;
  if (client.emailAudit && client.emailAudit.checked) {
    Object.keys(client.emailAudit.checked).forEach(k => {
      if (client.emailAudit.checked[k]) {
        emFilled++;
      }
    });
  }
  const dashEmailAuditFill = document.getElementById('dashEmailStrategyProgress');
  const dashEmailAuditVal = document.getElementById('dashEmailStrategyVal');
  if (dashEmailAuditFill && dashEmailAuditVal) {
    const emPct = emTotal > 0 ? Math.round((emFilled / emTotal) * 100) : 0;
    dashEmailAuditFill.style.width = emPct + '%';
    dashEmailAuditVal.textContent = emPct + '%';
  }
  // Calculate Content Audit (42 items total)
  const caTotal = 42;
  let caFilled = 0;
  if (client.contentAudit && client.contentAudit.checked) {
    Object.keys(client.contentAudit.checked).forEach(k => {
      if (client.contentAudit.checked[k]) {
        caFilled++;
      }
    });
  }
  const dashContentAuditFill = document.getElementById('dashContentAuditProgress');
  const dashContentAuditVal = document.getElementById('dashContentAuditVal');
  if (dashContentAuditFill && dashContentAuditVal) {
    const caPct = caTotal > 0 ? Math.round((caFilled / caTotal) * 100) : 0;
    dashContentAuditFill.style.width = caPct + '%';
    dashContentAuditVal.textContent = caPct + '%';
  }


  // Calculate Content Strategy checklist progress (40 items total)
  let totalStrategy = 40;
  let checkedStrategy = 0;
  if (client.contentStrategy && client.contentStrategy.checked) {
    Object.keys(client.contentStrategy.checked).forEach(k => {
      if (client.contentStrategy.checked[k]) {
        checkedStrategy++;
      }
    });
  }
  const strategyPct = Math.round((checkedStrategy / totalStrategy) * 100);
  document.getElementById("dashStrategyVal").textContent = `${strategyPct}%`;
  document.getElementById("dashStrategyProgress").style.width = `${strategyPct}%`;

  // Calculate Strategy Builder progress (56 + 3 * N fields total)
  let strategyBuilderPct = 0;
  if (client.strategyBuilder && client.strategyBuilder.data) {
    const data = client.strategyBuilder.data;
    const platforms = Array.isArray(data.platforms) ? data.platforms : [];
    let totalFields = 56 + (platforms.length * 3);
    let filledFields = 0;

    const textKeys = [
      'businessName', 'industry', 'primaryServices', 'brandMission', 'brandVision', 'coreValues', 'usp',
      'goalsShortTerm', 'goalsLongTerm', 'marketingChallenges',
      'audienceAge', 'audienceLocation', 'audienceIndustry', 'audienceIncome', 'audiencePainPoints', 'audienceDesires', 'audienceBuyingBehavior',
      'brandVoice', 'brandColors', 'brandVisuals',
      'mainCompetitors', 'competitorStrengths', 'competitorDifferentiate', 'brandsAdmire',
      'pillar1Name', 'pillar1Topics', 'pillar2Name', 'pillar2Topics', 'pillar3Name', 'pillar3Topics', 'pillar4Name', 'pillar4Topics',
      'ideasEducational', 'ideasPromotional', 'ideasSocialProof', 'ideasViral', 'ideasBehindScenes',
      'kpisBenchmarks', 'commContact', 'commRevisions', 'commTimeline',
      'finalFocus', 'notesSection'
    ];
    const checkboxKeys = [
      'primaryGoals', 'brandPersonality', 'existingAssets', 'primaryContentGoals',
      'workflowPre', 'workflowProd', 'workflowPost', 'workflowPub',
      'kpisMetrics', 'kpisFrequency', 'commMethods', 'nextSteps'
    ];

    textKeys.forEach(key => {
      const val = data[key];
      if (val && typeof val === 'string' && val.trim() !== '') filledFields++;
    });

    checkboxKeys.forEach(key => {
      const arr = data[key];
      if (arr && Array.isArray(arr) && arr.length > 0) filledFields++;
    });

    const a1 = data['action1'] || '';
    const a2 = data['action2'] || '';
    const a3 = data['action3'] || '';
    const a4 = data['action4'] || '';
    if (a1.trim() !== '' || a2.trim() !== '' || a3.trim() !== '' || a4.trim() !== '') {
      filledFields++;
    }

    // Dynamic platforms check (3 fields per platform)
    platforms.forEach(p => {
      if (p.purpose && p.purpose.trim() !== '') filledFields++;
      if (p.frequency && p.frequency.trim() !== '') filledFields++;
      if (p.contentTypes && Array.isArray(p.contentTypes) && p.contentTypes.length > 0) filledFields++;
    });

    strategyBuilderPct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
  }
  document.getElementById("dashStrategyBuilderVal").textContent = `${strategyBuilderPct}%`;
  document.getElementById("dashStrategyBuilderProgress").style.width = `${strategyBuilderPct}%`;


  // Calculate Personal Branding Builder progress (approx 29 fields total)
  let personalBrandPct = 0;
  if (client.personalBranding && client.personalBranding.data) {
    let filledPbFields = 0;
    let totalPbFields = 0;
    
    // Simplistic check: count all string properties that are not empty.
    // "platforms" is deliberately skipped here and counted separately below,
    // because the builder auto-seeds a default (empty) LinkedIn platform row
    // the moment the tab is opened -- counting the array itself as "filled"
    // just because it's non-empty produced a false-positive percentage even
    // when the user hadn't entered anything.
    const countFields = (obj) => {
      if (typeof obj === 'string') {
        totalPbFields++;
        if (obj.trim() !== '') filledPbFields++;
      } else if (Array.isArray(obj)) {
        totalPbFields++;
        if (obj.length > 0) filledPbFields++;
      } else if (typeof obj === 'object' && obj !== null) {
        Object.entries(obj).forEach(([key, val]) => {
          if (key === 'platforms') return;
          countFields(val);
        });
      }
    };
    countFields(client.personalBranding.data);
    
    // Also add platforms manually like strategy builder
    const pbPlatforms = client.personalBranding.data.platforms || [];
    pbPlatforms.forEach(p => {
      if (p.purpose && p.purpose.trim() !== '') filledPbFields++;
      if (p.contentTypes && Array.isArray(p.contentTypes) && p.contentTypes.length > 0) filledPbFields++;
    });
    totalPbFields += pbPlatforms.length * 2;
    
    // In the actual builder it's out of ~29
    personalBrandPct = totalPbFields > 0 ? Math.min(100, Math.round((filledPbFields / 29) * 100)) : 0;
  }
  document.getElementById("dashPersonalBrandVal").textContent = `${personalBrandPct}%`;
  document.getElementById("dashPersonalBrandProgress").style.width = `${personalBrandPct}%`;

  // Calculate Social Media Audit checklist progress (40 items total)
  let totalSocialAudit = 40;
  let checkedSocialAudit = 0;
  if (client.socialAudit && client.socialAudit.checked) {
    Object.keys(client.socialAudit.checked).forEach(k => {
      if (client.socialAudit.checked[k]) {
        checkedSocialAudit++;
      }
    });
  }
  const socialAuditPct = Math.round((checkedSocialAudit / totalSocialAudit) * 100);
  document.getElementById("dashSocialAuditVal").textContent = `${socialAuditPct}%`;
  document.getElementById("dashSocialAuditProgress").style.width = `${socialAuditPct}%`;

  // Logged Website Competitors count
  // client.webComp may be entirely absent for restricted Team Access users
  // whose filtered clientsDb data omits the strategy-competition section -
  // guard instead of assuming it's always present (was crashing the whole
  // sync/render cycle for those users, see "Couldn't sync with the cloud
  // database" banner bug).
  let loggedWebComps = 0;
  (client.webComp && Array.isArray(client.webComp.names) ? client.webComp.names : []).forEach(name => {
    if (name && name !== "Competitor A" && name !== "Competitor B" && name !== "Competitor C" && name.trim() !== "") {
      loggedWebComps++;
    }
  });
  document.getElementById("dashWebCompetitorVal").textContent = `${loggedWebComps} / 3`;
  document.getElementById("dashWebCompetitorProgress").style.width = `${(loggedWebComps / 3) * 100}%`;

  let loggedSocialComps = 0;
  (client.socialComp && Array.isArray(client.socialComp.names) ? client.socialComp.names : []).forEach(name => {
    if (name && name !== "Competitor A" && name !== "Competitor B" && name !== "Competitor C" && name.trim() !== "") {
      loggedSocialComps++;
    }
  });
  document.getElementById("dashSocialCompetitorVal").textContent = `${loggedSocialComps} / 3`;
  document.getElementById("dashSocialCompetitorProgress").style.width = `${(loggedSocialComps / 3) * 100}%`;

  // Calculate Copywriting Assistant stats
  let copyWords = 0;
  if (client.copywriting && client.copywriting.notes) {
    const text = client.copywriting.notes.trim();
    copyWords = text === "" ? 0 : text.split(/\s+/).length;
  }
  document.getElementById("dashCopywritingVal").textContent = `${copyWords} words`;
  
  // Calculate Brand Vault completion
  let bvTotal = 14; // 3 assets, 2 typo, 2 voice, 2 audience, 5 colors
  let bvFilled = 0;
  if (client.brandVault) {
    const bv = client.brandVault;
    if (bv.assets) {
      if (bv.assets.logoUrl?.trim()) bvFilled++;
      if (bv.assets.driveLink?.trim()) bvFilled++;
      if (bv.assets.canvaLink?.trim()) bvFilled++;
    }
    if (bv.typography) {
      if (bv.typography.primaryFont?.trim()) bvFilled++;
      if (bv.typography.secondaryFont?.trim()) bvFilled++;
    }
    if (bv.brandVoice) {
      if (bv.brandVoice.adjectives?.trim()) bvFilled++;
      if (bv.brandVoice.missionStatement?.trim()) bvFilled++;
    }
    if (bv.targetAudience) {
      if (bv.targetAudience.demographic?.trim()) bvFilled++;
      if (bv.targetAudience.painPoints?.trim()) bvFilled++;
    }
    if (bv.colors && Array.isArray(bv.colors)) {
      bv.colors.forEach(c => {
        // Count a color as filled if it's not default black and has a name
        if (c.hex && c.hex !== "#000000") bvFilled++;
      });
    }
  }
  const bvPct = Math.round((bvFilled / bvTotal) * 100);
  document.getElementById("dashBrandVaultVal").textContent = `${bvPct}%`;
  document.getElementById("dashBrandVaultProgress").style.width = `${bvPct > 100 ? 100 : bvPct}%`;
  }

/* ── Orchestration ──────────────────────────────────────────────
   Runs every single-client + agency-wide card. Called once on load,
   and again any time the shell posts a refresh message (see
   setupRefreshListener below) - e.g. after a checkbox toggle in one
   of the ~16 tools that call window.parent.renderDashboard(). ── */

/* ── Audits & Competitor Analysis Overview ───────────────────────
   Activity strip + priority list read every client (agency-wide);
   the grade cards show the active client, so they follow the
   workspace switcher like the rest of the page. Audit tools stamp
   <audit>.updatedAt on save (added Oct 2026) - audits last touched
   before that show no activity date until they're next edited. ── */
const AO_AUDITS = [
  { key: 'seoAudit',     label: 'SEO Audit Checklist',        short: 'SEO audit',         total: 23 },
  { key: 'paidAdsAudit', label: 'Paid Ads Audit',             short: 'Paid ads audit',    total: 16 },
  { key: 'uxuiAudit',    label: 'UX/UI Audit Checklist',      short: 'UX/UI audit',       total: 40 },
  { key: 'contentAudit', label: 'Content Audit',              short: 'Content audit',     total: 42 },
  { key: 'emailAudit',   label: 'Email Marketing Audit',      short: 'Email marketing audit', total: 16 },
  { key: 'socialAudit',  label: 'Social Media Audit',         short: 'Social media audit', total: 40 },
];
const AO_COMPS = [
  { key: 'webComp',    label: 'Website Competitor Analysis', cells: 33 },
  { key: 'socialComp', label: 'Social Competitor Analysis',  cells: 30 },
];
const AO_COLORS = { success: '#10b981', info: '#3b82f6', warning: '#f59e0b', danger: '#ef4444', none: '#8a887f' };

function aoGrade(pct) {
  if (pct >= 97) return { letter: 'A+', cls: 'success' };
  if (pct >= 93) return { letter: 'A',  cls: 'success' };
  if (pct >= 90) return { letter: 'A-', cls: 'success' };
  if (pct >= 87) return { letter: 'B+', cls: 'info' };
  if (pct >= 83) return { letter: 'B',  cls: 'info' };
  if (pct >= 80) return { letter: 'B-', cls: 'info' };
  if (pct >= 77) return { letter: 'C+', cls: 'warning' };
  if (pct >= 73) return { letter: 'C',  cls: 'warning' };
  if (pct >= 70) return { letter: 'C-', cls: 'warning' };
  if (pct >= 67) return { letter: 'D+', cls: 'warning' };
  if (pct >= 60) return { letter: 'D',  cls: 'warning' };
  return { letter: 'F', cls: 'danger' };
}

function aoAuditPct(client, a) {
  const checked = client && client[a.key] && client[a.key].checked;
  if (!checked) return 0;
  const done = Object.keys(checked).filter(k => checked[k]).length;
  return Math.min(100, Math.round((done / a.total) * 100));
}

function aoCompPct(client, c) {
  const d = client && client[c.key];
  if (!d) return 0;
  let filled = 0;
  Object.values(d.rows || {}).forEach(arr => (arr || []).forEach(v => { if (v && String(v).trim()) filled++; }));
  return Math.min(100, Math.round((filled / c.cells) * 100));
}

function aoDayLabel(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today - that) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return that.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function renderAuditOverview() {
  const root = document.getElementById('auditOverview');
  if (!root) return;
  const clientsDb = (window.parent.getClientsDb && window.parent.getClientsDb()) || {};
  const active = window.parent.getActiveClient();
  const sandbox = 'Quick Sandbox (One-Offs)';
  const esc = escapeHtmlCore;
  const now = Date.now();

  // Agency-wide pass: activity + attention
  const events = [];
  const attention = [];
  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client || name === sandbox) return;
    AO_AUDITS.forEach(a => {
      const pct = aoAuditPct(client, a);
      const g = aoGrade(pct);
      const ts = client[a.key] && client[a.key].updatedAt ? new Date(client[a.key].updatedAt).getTime() : null;
      if (ts) events.push({ ts, name, a, pct, g });
      if (pct === 0 || pct >= 100) return;
      const days = ts ? Math.floor((now - ts) / 86400000) : null;
      if (days !== null && days >= 14) {
        attention.push({ rank: 0, color: AO_COLORS.danger, title: `${a.short} stalled at ${pct}%`, sub: `${name} \u2014 untouched ${days} days` });
      } else if (g.letter === 'F' || g.letter === 'D' || g.letter === 'D+') {
        attention.push({ rank: 1, color: AO_COLORS.warning, title: `${a.short} \u2014 low score`, sub: `${name} \u2014 graded ${g.letter} (${pct}%)` });
      }
    });
  });

  // Timeline: most recent 7 audit saves
  events.sort((x, y) => y.ts - x.ts);
  const recent = events.slice(0, 7).reverse();
  const tl = document.getElementById('aoTimeline');
  if (tl) {
    tl.innerHTML = recent.length ? recent.map(e => `
      <div class="ao-node" style="--c:${AO_COLORS[e.g.cls]}">
        <div class="ao-dot"></div>
        <div class="ao-node-day">${esc(aoDayLabel(e.ts))}</div>
        <div class="ao-node-text">${esc(e.a.short)} updated &mdash; ${esc(e.name)} (${e.g.letter}, ${e.pct}%)</div>
      </div>`).join('') : '<div class="ao-empty">Activity shows up here as audits are updated.</div>';
  }

  // Needs attention
  attention.sort((x, y) => x.rank - y.rank);
  const al = document.getElementById('aoAttentionList');
  if (al) {
    al.innerHTML = attention.length ? attention.slice(0, 6).map(i => `
      <div class="ao-attn-item" style="--c:${i.color}">
        <div class="ao-attn-dot"></div>
        <div><div class="ao-attn-title">${esc(i.title)}</div><div class="ao-attn-sub">${esc(i.sub)}</div></div>
      </div>`).join('') : '<div class="ao-empty">Nothing stalled or scoring low across your clients.</div>';
  }

  // Grade cards (active client)
  const cards = document.getElementById('aoGradeCards');
  if (cards && active) {
    const items = AO_AUDITS.map(a => ({ label: a.label, pct: aoAuditPct(active, a) }))
      .concat(AO_COMPS.map(c => ({ label: c.label, pct: aoCompPct(active, c) })));
    cards.innerHTML = items.map(it => {
      const started = it.pct > 0;
      const g = started ? aoGrade(it.pct) : { letter: '\u2014', cls: 'none' };
      const color = AO_COLORS[g.cls];
      return `
        <div class="ao-grade-card" style="--c:${color}">
          <div class="ao-grade-top">
            <div><div class="ao-grade-name">${esc(it.label)}</div><div class="ao-grade-client">${esc(active.name)}</div></div>
            <div class="ao-ring">${g.letter}</div>
          </div>
          <div>
            <div class="ao-grade-row"><span>${started ? 'Checks passed' : 'Not started'}</span><strong>${it.pct}%</strong></div>
            <div class="ao-bar"><span style="width:${it.pct}%"></span></div>
          </div>
        </div>`;
    }).join('');
  }
  const foot = document.getElementById('aoFoot');
  if (foot) foot.textContent = 'Cards show the active workspace; activity and attention cover every client. Competitor % = analysis cells filled in.';
}

function renderAll() {
  try { renderAuditOverview(); } catch (e) { console.error("Error in renderAuditOverview:", e); }
  try { renderDashboard(); } catch (e) { console.error("Error in renderDashboard:", e); }
  renderSalesPipelineValue().catch(e => console.error("Error in renderSalesPipelineValue:", e));
  renderWhosOutToday().catch(e => console.error("Error in renderWhosOutToday:", e));
  try { renderMoodBoardsAwaitingFeedback(); } catch (e) { console.error("Error in renderMoodBoardsAwaitingFeedback:", e); }
  try { renderProductionBoardAttention(); } catch (e) { console.error("Error in renderProductionBoardAttention:", e); }
  renderNeedsAttention().catch(e => console.error("Error in renderNeedsAttention:", e));
  renderLeadSourceRoi().catch(e => console.error("Error in renderLeadSourceRoi:", e));
  try { applySalesPipelineCardGating(); } catch (e) { console.error("Error in applySalesPipelineCardGating:", e); }
}

/* ── Live refresh from the shell ──────────────────────────────────
   The shell's renderDashboard() (called from ~16 other tools' save
   handlers) now postMessages this iframe instead of writing DOM
   directly across the frame boundary - see the shell's app.js for
   the matching window.postMessage call. Checking event.source keeps
   this from reacting to an unrelated message some other script on
   the page might post. ── */
function setupRefreshListener() {
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    if (!event.data || event.data.type !== 'hub:refresh-overview-dashboard') return;
    renderAll();
  });
}

/* ── ClickUp Folder URL input (hero card) ──────────────────────────
   Mirrors the shell's own dashClickupUrl/dashClickupBtn wiring -
   lets you paste/update the active client's ClickUp folder link
   straight from the dashboard the same way the shell used to. ── */
function initClickupUrlInput() {
  const input = document.getElementById("dashClickupUrl");
  if (!input) return;
  input.addEventListener("input", () => {
    const client = window.parent.getActiveClient();
    if (!client) return;
    client.clickupUrl = input.value;
    window.parent.saveDatabase();
    const btn = document.getElementById("dashClickupBtn");
    if (btn) {
      if (input.value) {
        btn.href = input.value;
        btn.style.display = "flex";
      } else {
        btn.style.display = "none";
      }
    }
  });
}

/* ── ClickUp "Open" button - desktop-app-first, falls back to web ──────
   Ported verbatim from the shell's initParentEventListeners() (same
   function names/comments) - that copy is now dead code in the shell
   (dashClickupBtn no longer exists in its document) but was left in
   place rather than deleted, per this extraction's "duplicate pure
   logic, don't delete working code in a 500KB production file" approach. ── */
function openAppOrWeb(webUrl, appUrl) {
  if (!webUrl) return;
  if (!appUrl) { window.open(webUrl, '_blank', 'noopener'); return; }

  let handedOff = false;
  const onBlur = () => { handedOff = true; };
  window.addEventListener('blur', onBlur, { once: true });

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  try {
    iframe.contentWindow.location.href = appUrl;
  } catch (err) {
    // Some browsers throw synchronously for an unregistered custom
    // scheme instead of just failing silently - either way, fall
    // through to the web link below.
  }

  setTimeout(() => {
    window.removeEventListener('blur', onBlur);
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    if (!handedOff) {
      window.open(webUrl, '_blank', 'noopener');
    }
  }, 800);
}

function clickupAppUrlFor(webUrl) {
  if (!webUrl) return null;
  if (!/^https?:\/\/([a-z0-9-]+\.)?clickup\.com\//i.test(webUrl)) return null;
  return webUrl.replace(/^https?:\/\//i, 'clickup://');
}

function initClickupOpenButton() {
  const dashClickupBtn = document.getElementById("dashClickupBtn");
  if (!dashClickupBtn) return;
  dashClickupBtn.addEventListener("click", (e) => {
    const webUrl = dashClickupBtn.getAttribute("href");
    if (!webUrl || webUrl === "#") return;
    e.preventDefault();
    openAppOrWeb(webUrl, clickupAppUrlFor(webUrl));
  });
}

/* ── "Go to Tool" quick-link buttons (data-go="tab-x") ──────────────
   These used to be caught by a single delegated listener in the
   shell's initTabNavigation(), which worked because the buttons lived
   in the same document. Now that they're inside this iframe, that
   listener can't see them, so this tool wires its own and just hands
   off to the shell's existing navigateToTab(). ── */
function initQuickLinks() {
  document.querySelectorAll("[data-go]").forEach(btn => {
    btn.addEventListener("click", () => {
      window.parent.navigateToTab(btn.getAttribute("data-go"));
    });
  });
}

/* ── Sales-pipeline access gate (security-relevant, not cosmetic) ──────
   Mirrors applyTeamAccessRestrictions() in the shell's app.js exactly:
   a restricted team member who has 'core' access (so they can see this
   tab at all) but NOT 'sales-pipeline' access must not see these two
   cards, since they surface real revenue numbers pulled from tools
   gated behind 'sales-pipeline' specifically. That gating used to run
   directly against this DOM from the shell's document; now that this
   markup is a separate document, it can no longer reach it, so this
   tool re-applies the same check itself against the cached
   window.parent.currentAllowedSections (set inside
   applyTeamAccessRestrictions right before it used to do this). Called
   on every renderAll() too, in case team access changes while this tab
   is open. */
function applySalesPipelineCardGating() {
  const allowed = window.parent.currentAllowedSections;
  const canSee = !allowed || allowed.indexOf('sales-pipeline') !== -1;
  [document.getElementById('dashPipelineValue'), document.getElementById('leadSourceRoiList')].forEach(el => {
    const card = el ? el.closest('.tool-progress-card') : null;
    if (card) card.style.display = canSee ? '' : 'none';
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initClickupUrlInput();
  initClickupOpenButton();
  initQuickLinks();
  setupRefreshListener();
  applySalesPipelineCardGating();
  renderAll();
});
