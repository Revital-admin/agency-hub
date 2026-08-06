/* ============================================================
   TEAM ROSTER & CAPACITY — APP LOGIC
   Agency-wide (not tied to a single client): stores its own list at
   agency/teamRoster, same optimistic-concurrency version-guard pattern
   as Change Order Generator / Subscription Tracker. Unlike Subscription
   Tracker (admin/leadership only, whole page), this one is viewable by
   everyone - same partial-gate model as Email Template Library and SOP
   Wiki: New/Edit/Delete are hidden for restricted teammates, but the
   roster itself (who's on the team, who has room for new client work)
   is useful for anyone doing onboarding/assignment.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

let members = [];
let editingId = null;
let docVersion = 0; // optimistic-concurrency guard, see persist() below
let isRestrictedUser = false;

// Live caseload data, keyed by lowercased email, built by the parent's
// getAccountManagerCapacitySnapshot() (see app.js) - matches Account
// Manager roster entries against every client's real
// portalConfig.accountManagerEmail assignment. Only meaningful for role
// === "Account Manager"; every other role has no equivalent per-client
// assignment field in this data model, so they keep the manually-typed
// currentClientCount instead (see getEffectiveLoad below).
let amCapacitySnapshot = {};
// Live hours-logged-this-week data, keyed by lowercased member name,
// built by the parent's getTeamHoursCapacitySnapshot() (see app.js) -
// the non-AM equivalent of amCapacitySnapshot above. Only applies to a
// roster entry once someone sets weeklyCapacityHours on it (opt-in);
// entries without that field keep using the old manual currentClientCount
// fallback, so this is purely additive - see getEffectiveLoad below.
let hoursCapacitySnapshot = {};
// Which row (by member id) currently has its assigned-client list
// expanded open - see toggleClientExpand/renderTable.
let expandedRosterId = null;

async function refreshCapacitySnapshot() {
  if (isEmbedded && window.parent.getAccountManagerCapacitySnapshot) {
    try {
      amCapacitySnapshot = await window.parent.getAccountManagerCapacitySnapshot();
    } catch (e) {
      console.warn("Couldn't refresh the account-manager capacity snapshot:", e);
      amCapacitySnapshot = {};
    }
  } else {
    amCapacitySnapshot = {};
  }

  if (isEmbedded && window.parent.getTeamHoursCapacitySnapshot) {
    try {
      hoursCapacitySnapshot = await window.parent.getTeamHoursCapacitySnapshot();
    } catch (e) {
      console.warn("Couldn't refresh the team hours capacity snapshot:", e);
      hoursCapacitySnapshot = {};
    }
  } else {
    hoursCapacitySnapshot = {};
  }
}

// Returns the number that should actually drive the capacity bar/bucket
// for this member: live-computed for Account Managers (real assigned
// clients), live-computed from actual logged hours for any other role
// that's opted in with a weeklyCapacityHours value, or falling back to
// the manually-typed client count otherwise. { clientNames: null } means
// "not live" - Team Roster's stale-data caption only applies to that
// manual branch. `unit` tells renderTable whether to label the bar in
// clients or hours.
function getEffectiveLoad(entry) {
  const max = parseInt(entry.maxClientCount) || 0;
  if (entry.role === "Account Manager") {
    const email = (entry.email || "").trim().toLowerCase();
    if (email) {
      const rec = amCapacitySnapshot[email];
      const clientNames = rec ? rec.clientNames : [];
      return { current: clientNames.length, max, isLive: true, clientNames, unit: 'clients' };
    }
  }

  const weeklyCapacityHours = parseFloat(entry.weeklyCapacityHours) || 0;
  if (weeklyCapacityHours > 0) {
    const name = (entry.memberName || "").trim().toLowerCase();
    const rec = name ? hoursCapacitySnapshot[name] : null;
    const hours = rec ? Math.round(rec.hours * 10) / 10 : 0;
    const clientNames = rec ? rec.clientNames : [];
    return { current: hours, max: weeklyCapacityHours, isLive: true, clientNames, unit: 'hrs' };
  }

  return { current: parseInt(entry.currentClientCount) || 0, max, isLive: false, clientNames: null, unit: 'clients' };
}

function daysAgoLabel(isoDateStr) {
  if (!isoDateStr) return "";
  const then = new Date(isoDateStr).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "updated today";
  if (days === 1) return "updated 1 day ago";
  return `updated ${days} days ago`;
}

function toggleClientExpand(id) {
  expandedRosterId = expandedRosterId === id ? null : id;
  renderTable();
}

// ── Time Off (lightweight - not a payroll/HR system) ──
// Each entry has its own timeOff: [{id, startDate, endDate, note}] list,
// same optimistic-concurrency save as everything else here. Deliberately
// small: no accrual, no approval workflow, no balance tracking - this is
// just "so the rest of the team can see who's out" visible right next to
// the same capacity info they're already checking before assigning new
// client work, not a replacement for whatever actually runs payroll.
function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function timeOffStatus(entry) {
  const timeOff = Array.isArray(entry.timeOff) ? entry.timeOff : [];
  if (!timeOff.length) return null;
  const today = todayStr();

  const active = timeOff.find(t => t.startDate <= today && today <= (t.endDate || t.startDate));
  if (active) return { text: `Out until ${formatShortDate(active.endDate || active.startDate)}`, color: '#ef4444' };

  const upcoming = timeOff
    .filter(t => t.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  if (upcoming) {
    const daysUntil = Math.round((new Date(upcoming.startDate + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    if (daysUntil <= 14) return { text: `Off starting ${formatShortDate(upcoming.startDate)}`, color: '#f68d5f' };
  }
  return null;
}

function renderTimeOffSection() {
  const section = el('timeOffSection');
  if (!section) return;
  if (!editingId) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  const entry = members.find(m => m.id === editingId);
  const listEl = el('timeOffList');
  const timeOff = (entry && Array.isArray(entry.timeOff)) ? entry.timeOff : [];

  listEl.innerHTML = timeOff.length
    ? timeOff.map(t => `
        <div style="display:flex; align-items:center; gap:8px; font-size:0.8rem; padding:5px 0; border-bottom:1px solid var(--border-color);">
          <span style="flex:1;">${formatShortDate(t.startDate)}${t.endDate && t.endDate !== t.startDate ? ' – ' + formatShortDate(t.endDate) : ''}${t.note ? ' — ' + escapeHtml(t.note) : ''}</span>
          <button type="button" class="time-off-remove-btn btn btn-secondary" data-id="${t.id}" style="padding:3px 10px; font-size:0.72rem;">Remove</button>
        </div>`).join('')
    : '<p style="font-size:0.78rem; color:var(--text-muted); margin:4px 0;">No time off scheduled.</p>';

  listEl.querySelectorAll('.time-off-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => removeTimeOff(btn.getAttribute('data-id')));
  });
}

async function addTimeOff() {
  const entry = members.find(m => m.id === editingId);
  if (!entry) return;
  const start = el('timeOffStart').value;
  const end = el('timeOffEnd').value || start;
  const note = el('timeOffNote').value.trim();
  if (!start) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Pick a start date first.');
    return;
  }
  if (!Array.isArray(entry.timeOff)) entry.timeOff = [];
  const previous = entry.timeOff;
  entry.timeOff = [...entry.timeOff, { id: uid(), startDate: start, endDate: end, note }]
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const ok = await persist();
  if (!ok) {
    entry.timeOff = previous;
    return;
  }
  el('timeOffStart').value = '';
  el('timeOffEnd').value = '';
  el('timeOffNote').value = '';
  renderTimeOffSection();
  refreshViews();
}

async function removeTimeOff(id) {
  const entry = members.find(m => m.id === editingId);
  if (!entry || !Array.isArray(entry.timeOff)) return;
  const previous = entry.timeOff;
  entry.timeOff = entry.timeOff.filter(t => t.id !== id);

  const ok = await persist();
  if (!ok) entry.timeOff = previous;
  renderTimeOffSection();
  refreshViews();
}

// ── Calendar view (rolling 30-day time-off timeline) ──
// A plain flex strip of day-cells, one row per team member, rather than a
// real Sun-Sat month grid: no month-navigation state to manage, no
// calendar date-math edge cases, and it's actually easier to spot two
// people's time off overlapping when every row starts at the same "today"
// origin. Reads the same per-member timeOff arrays the List view's row
// badges already use - this is just a second render of that same data.
let rosterView = 'list';

function pad2(n) { return String(n).padStart(2, '0'); }
function toIsoLocal(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function get30DayWindow() {
  const days = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function findTimeOffForDay(timeOff, iso) {
  return (Array.isArray(timeOff) ? timeOff : []).find(t => t.startDate <= iso && iso <= (t.endDate || t.startDate));
}

// Renders whichever view is currently active, plus the summary bar (which
// renderTable() always computes regardless of view) - call this instead of
// renderTable() directly anywhere state changes, so Calendar stays in sync
// without needing its own separate change-tracking.
function refreshViews() {
  renderTable();
  if (rosterView === 'calendar') renderTimeline();
}

function switchRosterView(view) {
  rosterView = view;
  el('viewListBtn').classList.toggle('is-active', view === 'list');
  el('viewCalendarBtn').classList.toggle('is-active', view === 'calendar');
  el('tableCard').style.display = view === 'list' ? '' : 'none';
  el('calendarCard').style.display = view === 'calendar' ? '' : 'none';
  if (view === 'calendar') renderTimeline();
}

function renderTimeline() {
  const days = get30DayWindow();
  const todayIso = toIsoLocal(days[0]);

  const filter = (el('filterInput').value || '').trim().toLowerCase();
  const rows = members.filter(m => {
    if (!filter) return true;
    return (m.memberName || '').toLowerCase().includes(filter) || (m.role || '').toLowerCase().includes(filter);
  });

  const headerCells = days.map((d, i) => {
    const showMonth = i === 0 || d.getDate() === 1;
    const label = showMonth ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : String(d.getDate());
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    return `<div class="timeline-daycell timeline-head${isWeekend ? ' timeline-weekend' : ''}" title="${d.toDateString()}">${label}</div>`;
  }).join('');
  el('timelineHeader').innerHTML = `<div class="timeline-row"><div class="timeline-namecell timeline-head">Team Member</div>${headerCells}</div>`;

  if (!rows.length) {
    el('timelineBody').innerHTML = '<p class="empty-state">No team members to show.</p>';
    return;
  }

  el('timelineBody').innerHTML = rows.map(m => {
    const cells = days.map(d => {
      const iso = toIsoLocal(d);
      const hit = findTimeOffForDay(m.timeOff, iso);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      let cls = 'timeline-daycell';
      let title = d.toDateString();
      if (hit) {
        cls += hit.startDate <= todayIso ? ' timeline-off-active' : ' timeline-off-upcoming';
        title += hit.note ? ` — ${hit.note}` : ' — Time off';
      } else if (isWeekend) {
        cls += ' timeline-weekend';
      }
      return `<div class="${cls}" title="${escapeHtml(title)}"></div>`;
    }).join('');
    return `<div class="timeline-row"><div class="timeline-namecell">${escapeHtml(m.memberName)}</div>${cells}</div>`;
  }).join('');
}

// ── Onboarding Checklist (new-hire setup, not client onboarding) ──
// Same "only shown once a member exists" pattern as Time Off - nothing
// to check off for a brand-new, not-yet-saved entry. A fixed list of
// steps rather than free-form (like QC Checklist/Red Flag Checklist),
// since "did we actually do the standard setup steps" is the whole
// point - a blank free-text box would just recreate the "did we
// remember to..." problem this exists to solve. Deliberately generic
// enough to cover both contractors and employees rather than two
// separate lists.
const ONBOARDING_ITEMS = [
  { key: 'email', label: 'Company email created', sopId: 'sop-new-hire-email-access-setup' },
  { key: 'clickup', label: 'Added to ClickUp' },
  { key: 'passwordmanager', label: 'Password manager access granted' },
  { key: 'agreement', label: 'Agreement sent (contractor) or offer signed (employee)' },
  { key: 'hubaccess', label: 'Hub login confirmed' },
  { key: 'firstclient', label: 'First client assigned' }
];

function getOnboardingState(entry) {
  if (!entry.onboarding || typeof entry.onboarding !== 'object') entry.onboarding = { items: {} };
  if (!entry.onboarding.items || typeof entry.onboarding.items !== 'object') entry.onboarding.items = {};
  return entry.onboarding;
}

function onboardingProgress(entry) {
  if (!entry.onboarding || !entry.onboarding.items) return { done: 0, total: ONBOARDING_ITEMS.length };
  const done = ONBOARDING_ITEMS.filter(item => entry.onboarding.items[item.key] && entry.onboarding.items[item.key].done).length;
  return { done, total: ONBOARDING_ITEMS.length };
}

// ── Legal / compliance (contractors only) ──
// W-9 is a hard requirement for every paid contractor, so it always nags
// until checked. Insurance is opt-in - plenty of contractor roles (a
// remote editor, say) never carry a liability policy for Revital, so an
// empty insuranceExpirationDate stays silent rather than flagging
// "insurance missing" for people who were never expected to have it.
function complianceIssues(entry) {
  if (entry.employmentType !== 'Contractor') return [];
  const issues = [];
  if (!entry.w9OnFile) {
    issues.push({ text: 'W-9 missing', color: '#ef4444' });
  }
  if (entry.insuranceExpirationDate) {
    const days = Math.round((new Date(entry.insuranceExpirationDate) - new Date(new Date().toDateString())) / 86400000);
    if (!Number.isNaN(days)) {
      if (days < 0) issues.push({ text: 'Insurance expired', color: '#ef4444' });
      else if (days <= 30) issues.push({ text: `Insurance expires ${days}d`, color: '#f68d5f' });
    }
  }
  return issues;
}

function renderOnboardingSection() {
  const section = el('onboardingSection');
  if (!section) return;
  if (!editingId) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  const entry = members.find(m => m.id === editingId);
  const listEl = el('onboardingList');
  if (!entry || !listEl) return;
  const state = getOnboardingState(entry);

  listEl.innerHTML = ONBOARDING_ITEMS.map(item => {
    const itemState = state.items[item.key] || { done: false };
    return `
      <label style="display:flex; align-items:center; gap:8px; font-size:0.82rem; padding:5px 0; border-bottom:1px solid var(--color-border); cursor:pointer;">
        <input type="checkbox" class="onboarding-item-checkbox" data-key="${item.key}" ${itemState.done ? 'checked' : ''} style="width:auto;">
        <span style="flex:1;">${escapeHtml(item.label)}</span>
        ${item.sopId ? `<button type="button" class="onboarding-sop-link-btn" data-sop-id="${item.sopId}" style="background:none; border:none; color:var(--color-accent); font-size:0.72rem; text-decoration:underline; cursor:pointer; padding:0; white-space:nowrap;">How to set this up</button>` : ''}
        ${itemState.done && itemState.doneDate ? `<span style="font-size:0.7rem; color:var(--color-text-muted);">${formatShortDate(itemState.doneDate)}</span>` : ''}
      </label>`;
  }).join('');

  listEl.querySelectorAll('.onboarding-item-checkbox').forEach(cb => {
    cb.addEventListener('change', () => toggleOnboardingItem(cb.getAttribute('data-key'), cb.checked));
  });

  // Jumps to the SOP Wiki tab for the referenced doc (e.g. New Hire Email
  // & Access Setup) - doesn't deep-link to the exact entry (SOP Wiki has
  // no URL-param support for that), just gets you to the right tool with
  // the doc one click/search away.
  listEl.querySelectorAll('.onboarding-sop-link-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isEmbedded && window.parent.navigateToTab) {
        window.parent.navigateToTab('tab-sopwiki');
      }
    });
  });
}

async function toggleOnboardingItem(key, checked) {
  const entry = members.find(m => m.id === editingId);
  if (!entry) return;
  const state = getOnboardingState(entry);
  const previous = { ...state.items };
  state.items = { ...state.items, [key]: { done: checked, doneDate: checked ? todayStr() : null } };

  const ok = await persist();
  if (!ok) { state.items = previous; renderOnboardingSection(); return; }
  renderOnboardingSection();
  renderTable();
}

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamRoster");
}

async function loadMembers() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      members = (data && data.list) || [];
      docVersion = (data && data.version) || 0;
      return;
    } catch (e) {
      console.error("Couldn't load team roster from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load the team roster: " + e.message);
      members = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('team-roster-list');
    members = saved ? JSON.parse(saved) : [];
  } catch (e) { members = []; }
}

async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: members, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save team roster:", result.error);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', result.reason === 'conflict'
          ? "Someone else updated the roster while you had it open. Reload the page to see their changes, then redo your edit."
          : "Couldn't save — your change may be lost: " + result.error.message);
      }
      return false;
    }
    docVersion = result.version;
    return true;
  }
  try { localStorage.setItem('team-roster-list', JSON.stringify(members)); } catch (e) {}
  return true;
}

function uid() { return 'tm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

/* ── Send Contractor Agreement (Docusign) ──
   Contractors don't belong in the Contract & Invoice Tracker's per-client
   rows (that tool's whole data model - contract status, invoice cycle,
   client reporting - is for people who pay Revital, not people Revital
   pays). Instead, this reads the same shared Contract Template Library
   (agency/contractTemplates, same Firestore doc the Tracker uses) to find
   the Independent Contractor Agreement and its NDA, and sends them via
   the same /api/docusign/send-envelope endpoint, keyed off this roster
   entry instead of a fake client row. See _worker.js's
   handleDocusignSendEnvelope for how fieldValues become textTabs. */
const CONTRACTOR_DOC_DEFS = [
  {
    key: 'ic-agreement',
    label: 'Independent Contractor Agreement',
    matchLabel: 'independent contractor agreement',
    fields: [
      { token: 'EFFECTIVE_DATE', label: 'Effective Date', default: () => todayStr() },
      { token: 'CONTRACTOR_NAME', label: 'Contractor Name', default: (m) => m && m.memberName },
      { token: 'CONTRACTOR_ADDRESS', label: 'Contractor Address', default: () => '' },
      { token: 'RATE', label: 'Rate ($)', default: () => '' },
      { token: 'INVOICE_DUE_DAY', label: 'Invoice Due Day of Month', default: () => '' },
      { token: 'NONCOMPETE_MONTHS', label: 'Non-Compete Period (months)', default: () => '' },
      { token: 'TERMINATION_NOTICE_DAYS', label: 'Termination Notice (days)', default: () => '' }
    ]
  },
  {
    key: 'ic-nda',
    label: 'NDA - Independent Contract',
    matchLabel: 'nda - independent contract',
    fields: [
      { token: 'EFFECTIVE_DATE', label: 'Effective Date', default: () => todayStr() },
      { token: 'PARTY_B_NAME', label: 'Contractor Name', default: (m) => m && m.memberName },
      { token: 'PARTY_B_ADDRESS', label: 'Contractor Address', default: () => '' },
      { token: 'JURISDICTION_COUNTY', label: 'Jurisdiction (Parish/County)', default: () => '' }
    ]
  }
];

// Custom contractor docs (uploaded via "Add Another Contractor Document" /
// "Include As-Is") that need real signer-fillable DocuSign tabs beyond
// just a signature - matched the same way as CONTRACTOR_DOC_DEFS
// (matchLabel against the doc's label/filename). Unlike CONTRACTOR_DOC_DEFS'
// `fields`, which the admin types in here before sending (Effective Date,
// Rate, etc. - locked once sent), everything listed below is left BLANK
// on purpose: the contractor fills these in themselves during their own
// signing session (see blankFields/blankCheckboxFields in
// handleDocusignSendEnvelope, _worker.js). That's what lets a document
// like the Vendor Information Sheet go out and come back complete without
// anyone printing, signing, or scanning anything - the tokens below have
// to match the invisible "[[TOKEN]]" anchors baked into that PDF at
// generation time (the anchor technique itself is the same one
// bakeAnchorsAtDetection uses).
//
// NOTE: a Direct Deposit / ACH Authorization Form used to live here too,
// collecting a contractor's routing/account number via this same
// blank-signer-fillable-PDF mechanism. It was retired (Aug 2026) now that
// QuickBooks Contractor Payments collects and stores that banking info
// directly - contractors self-enter it in QuickBooks' own portal, which is
// both more secure than routing bank numbers through a PDF/DocuSign packet
// and avoids Revital handling/storing that data at all.
const CONTRACTOR_BLANK_FIELD_DEFS = [
  {
    matchLabel: 'vendor information sheet',
    blankFields: [
      'VIS_FULL_NAME', 'VIS_BUSINESS_NAME', 'VIS_EMAIL', 'VIS_PHONE', 'VIS_ADDRESS', 'VIS_CITY_STATE_ZIP',
      'VIS_SERVICES', 'VIS_PORTFOLIO', 'VIS_INSURANCE_PROVIDER', 'VIS_INSURANCE_EXP',
      'VIS_EMERGENCY_NAME', 'VIS_EMERGENCY_RELATIONSHIP', 'VIS_EMERGENCY_PHONE'
    ],
    blankCheckboxFields: [
      'VIS_TYPE_INDIVIDUAL', 'VIS_TYPE_LLC', 'VIS_TYPE_CORP', 'VIS_TYPE_PARTNERSHIP', 'VIS_TYPE_OTHER',
      'VIS_INSURANCE_YES', 'VIS_INSURANCE_NO'
    ]
  }
];

function collectBlankFieldsForSelectedDocs(selectedDefs) {
  const blankFields = new Set();
  const blankCheckboxFields = new Set();
  selectedDefs.forEach(def => {
    const hay = (def.label || '').toLowerCase();
    CONTRACTOR_BLANK_FIELD_DEFS.forEach(bdef => {
      if (!hay.includes(bdef.matchLabel)) return;
      bdef.blankFields.forEach(t => blankFields.add(t));
      bdef.blankCheckboxFields.forEach(t => blankCheckboxFields.add(t));
    });
  });
  return { blankFields: Array.from(blankFields), blankCheckboxFields: Array.from(blankCheckboxFields) };
}

// Every entry this tool creates/updates gets docCategory: 'contractor' so
// the Contract & Invoice Tracker's Send Contract checklist and Manage
// Contract Templates window (isContractorDoc, contract-invoice-tracker/
// js/app.js) can filter it out - a contractor document showing up as a
// selectable "client contract" would recreate the exact mixing problem
// this tool exists to avoid.
//
// This whole manager (detect+bake+review+delete) intentionally
// mirrors the Contract & Invoice Tracker's Contract Template Library
// exactly (same detectClientAnchors/bakeAnchorsAtDetection heuristic, same
// review panel, same manual override) - contractor docs live in the same
// shared agency/contractTemplates collection, just filtered to a different
// screen, so the management experience should be identical rather than a
// simplified stand-in.
let contractorEntries = []; // raw agency/contractTemplates entries belonging to this tool (known + custom)

function isKnownContractorLabel(entry) {
  const hay = ((entry.label || '') + ' ' + (entry.filename || '')).toLowerCase();
  return CONTRACTOR_DOC_DEFS.some(def => hay.includes(def.matchLabel));
}

async function refreshContractorLibraryCache() {
  contractorEntries = [];
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseGetDoc) {
    return;
  }
  try {
    const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "contractTemplates");
    const snap = await window.parent.firebaseGetDoc(ref);
    const data = snap && snap.exists ? snap.data() : null;
    const list = (data && data.list) || [];
    contractorEntries = list.filter(t => t.docCategory === 'contractor' || isKnownContractorLabel(t));
  } catch (e) {
    console.error("Couldn't load the Contract Template Library:", e);
  }
}

function findKnownContractorEntry(def) {
  const hayMatch = (t) => ((t.label || '') + ' ' + (t.filename || '')).toLowerCase().includes(def.matchLabel);
  return contractorEntries.find(hayMatch) || null;
}

function getCustomContractorEntries() {
  return contractorEntries.filter(t => !isKnownContractorLabel(t));
}

// uploadBytesToR2 / deleteR2Object now live in ../shared-contract-pdf-tools.js
// (shared with Contract & Invoice Tracker, which uploads into this same
// agency/contractTemplates library).

// Shared read-detect-bake-upload step used by every upload/replace/add
// path below - identical to the Contract & Invoice Tracker's upload flow
// (same detectClientAnchors heuristic, same non-fatal fallback to a flat
// PDF if detection throws or finds nothing).
async function processContractorUpload(file) {
  const origBytes = new Uint8Array(await file.arrayBuffer());
  let detection = null;
  let uploadBytes = origBytes;
  try {
    detection = await detectClientAnchors(origBytes);
    if (detection) uploadBytes = await bakeAnchorsAtDetection(origBytes, detection);
  } catch (e) {
    console.warn('Anchor auto-detection failed (non-fatal - uploading as a flat PDF):', e);
    detection = null;
    uploadBytes = origBytes;
  }
  const key = await uploadBytesToR2(uploadBytes, file.name);
  return { key, detection };
}

async function writeContractorEntry(mutator) {
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "contractTemplates");
  const snap = await window.parent.firebaseGetDoc(ref);
  const data = snap && snap.exists ? snap.data() : null;
  const list = (data && data.list) || [];
  const version = (data && data.version) || 0;
  const nextList = mutator(list);
  await window.parent.firebaseSetDocFromJSON(ref, JSON.stringify({ list: nextList, version: version + 1 }));
}

async function saveContractorDocToLibrary(defKey, file) {
  const def = CONTRACTOR_DOC_DEFS.find(d => d.key === defKey);
  if (!def) return;
  const statusEl = el(`contractorDocStatus_${defKey}`);
  const setStatus = (msg, isError) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isError ? 'var(--color-error, #f68d5f)' : 'var(--color-success, #10b981)';
  };
  setStatus('Analyzing...', false);
  try {
    const { key, detection } = await processContractorUpload(file);
    setStatus('Uploading...', false);
    let oldKey = null;
    await writeContractorEntry((list) => {
      const idx = list.findIndex(t => ((t.label || '') + ' ' + (t.filename || '')).toLowerCase().includes(def.matchLabel));
      oldKey = idx >= 0 ? list[idx].r2Key : null;
      const entryPatch = {
        label: idx >= 0 ? list[idx].label : def.label,
        r2Key: key,
        filename: file.name,
        uploadedAt: todayStr(),
        docusignAnchorTags: false,
        needsAnchorReview: !!detection,
        anchorDetection: detection || null,
        flatReference: false,
        docCategory: 'contractor'
      };
      if (idx >= 0) { list[idx] = { ...list[idx], ...entryPatch }; }
      else { list.push({ id: uid(), ...entryPatch }); }
      return list;
    });
    if (oldKey && oldKey !== key) deleteR2Object(oldKey);
    setStatus(
      detection
        ? `${def.label} uploaded - signature/date lines auto-detected. Click Review to confirm before it's DocuSign-ready.`
        : `${def.label} uploaded. Couldn't auto-detect signature lines - it's a flat PDF only for now (try re-uploading a version with a real, selectable text layer).`,
      false
    );
  } catch (e) {
    console.error(`Couldn't upload ${def.label}:`, e);
    setStatus("Couldn't upload: " + e.message, true);
  }
}

// Adds a new, custom contractor document beyond the 2 fixed slots above
// (e.g. a Model Release, an NDA variant, whatever else comes up).
async function addCustomContractorDoc(label, file) {
  const statusEl = el('contractorDocAddStatus');
  const setStatus = (msg, isError) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isError ? 'var(--color-error, #f68d5f)' : 'var(--color-success, #10b981)';
  };
  setStatus('Analyzing...', false);
  try {
    const { key, detection } = await processContractorUpload(file);
    setStatus('Uploading...', false);
    await writeContractorEntry((list) => {
      list.push({
        id: uid(),
        label,
        r2Key: key,
        filename: file.name,
        uploadedAt: todayStr(),
        docusignAnchorTags: false,
        needsAnchorReview: !!detection,
        anchorDetection: detection || null,
        flatReference: false,
        docCategory: 'contractor'
      });
      return list;
    });
    setStatus(
      detection
        ? `Added "${label}" - signature/date lines auto-detected. Click Review to confirm before it's DocuSign-ready.`
        : `Added "${label}". Couldn't auto-detect signature lines - it's a flat PDF only for now.`,
      false
    );
    renderContractorDocManager();
  } catch (e) {
    console.error('Could not add contractor document:', e);
    setStatus("Couldn't upload: " + e.message, true);
  }
}

async function replaceCustomContractorDoc(id, file) {
  const entry = getCustomContractorEntries().find(t => t.id === id);
  if (!entry) return;
  const oldKey = entry.r2Key;
  try {
    const { key, detection } = await processContractorUpload(file);
    await writeContractorEntry((list) => {
      const idx = list.findIndex(t => t.id === id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          r2Key: key,
          filename: file.name,
          uploadedAt: todayStr(),
          docusignAnchorTags: false,
          needsAnchorReview: !!detection,
          anchorDetection: detection || null,
          flatReference: false
        };
      }
      return list;
    });
    if (oldKey && oldKey !== key) deleteR2Object(oldKey);
  } catch (e) {
    console.error('Could not replace contractor document:', e);
    if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't replace: " + e.message);
  }
}

async function deleteContractorEntry(id) {
  const entry = contractorEntries.find(t => t.id === id);
  if (!entry) return;
  const isKnown = isKnownContractorLabel(entry);
  if (!confirm(isKnown
    ? `Remove the uploaded file for "${entry.label}"? This clears the slot back to "Not uploaded yet" - it won't delete the document type itself.`
    : `Remove "${entry.label}" from Contractor Documents? This can't be undone.`)) return;
  try {
    await writeContractorEntry((list) => list.filter(t => t.id !== id));
    deleteR2Object(entry.r2Key);
    renderContractorDocManager();
  } catch (e) {
    console.error('Could not remove contractor document:', e);
    if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't remove: " + e.message);
  }
}

function contractorStatusText(entry) {
  if (!entry) return { text: 'Not uploaded yet', color: 'var(--text-muted)' };
  if (entry.docusignAnchorTags && entry.flatReference) return { text: `✓ Included as-is (${escapeHtml(entry.filename || '')}) — no auto sign tab`, color: 'var(--color-success, #10b981)' };
  if (entry.docusignAnchorTags) return { text: `✓ DocuSign-ready (${escapeHtml(entry.filename || '')})`, color: 'var(--color-success, #10b981)' };
  if (entry.needsAnchorReview) return { text: `Needs Review (${escapeHtml(entry.filename || '')})`, color: '#f68d5f' };
  return { text: `Flat PDF only (${escapeHtml(entry.filename || '')})`, color: 'var(--text-muted)' };
}

// Single-signer documents (this doc has only the contractor filling it
// in, no separate "Revital Signature" line) will never trip
// detectClientAnchors - that heuristic specifically requires two
// Signature/Date label pairs (client column + Revital column), see
// shared-contract-pdf-tools.js. Without this manual override, a doc like
// that would be permanently stuck at "Flat PDF only" with no path to
// ever showing up in the Send Agreement picker, even though there's
// nothing actually wrong with it - it just doesn't need an auto-placed
// signature tab to ride along in the envelope as a reference/fill-in
// document. flatReference:true just distinguishes this from a real
// two-party detected+reviewed doc in the status label above.
async function markContractorDocReadyAsIs(id) {
  try {
    await writeContractorEntry((list) => {
      const idx = list.findIndex(t => t.id === id);
      if (idx >= 0) list[idx] = { ...list[idx], docusignAnchorTags: true, needsAnchorReview: false, flatReference: true };
      return list;
    });
    renderContractorDocManager();
  } catch (e) {
    console.error('Could not mark contractor document ready:', e);
    if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't update: " + e.message);
  }
}

function contractorDocRowHtml(label, entry, fileInputAttr, includeDelete, deleteId) {
  const status = contractorStatusText(entry);
  const showMarkReady = entry && !entry.needsAnchorReview && !entry.docusignAnchorTags;
  return `
    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 0; border-bottom:1px solid var(--border-color);">
      <div style="min-width:220px; flex:1;">
        <div style="font-size:0.85rem; font-weight:600;">${escapeHtml(label)}</div>
        <div style="font-size:0.75rem; color:${status.color};">${status.text}</div>
      </div>
      ${entry && entry.needsAnchorReview ? `<button type="button" class="btn btn-secondary contractor-doc-review-btn" data-id="${entry.id}" style="padding:6px 12px; font-size:0.8rem;">Review</button>` : ''}
      ${showMarkReady ? `<button type="button" class="btn btn-secondary contractor-doc-mark-ready-btn" data-id="${entry.id}" title="For single-signer documents (like a form only the contractor fills in) that will never auto-detect a Revital signature line." style="padding:6px 12px; font-size:0.8rem;">Include As-Is</button>` : ''}
      <label class="btn btn-secondary" style="cursor:pointer; padding:6px 12px; font-size:0.8rem;">
        ${entry ? 'Replace File' : 'Upload File'}
        <input type="file" accept="application/pdf" ${fileInputAttr} class="contractor-doc-file-input" style="display:none;">
      </label>
      ${includeDelete ? `<button type="button" class="btn btn-secondary contractor-doc-delete-btn" data-id="${deleteId}" style="padding:6px 12px; font-size:0.8rem;">Delete</button>` : ''}
    </div>`;
}

async function renderContractorDocManager() {
  const container = el('contractorDocManager');
  if (!container) return;
  await refreshContractorLibraryCache();

  const knownRows = CONTRACTOR_DOC_DEFS.map(def => {
    const entry = findKnownContractorEntry(def);
    return contractorDocRowHtml(def.label, entry, `data-def-key="${def.key}"`, !!entry, entry ? entry.id : null);
  }).join('');

  const customRows = getCustomContractorEntries().map(entry => {
    return contractorDocRowHtml(entry.label, entry, `data-custom-id="${entry.id}"`, true, entry.id);
  }).join('');

  container.innerHTML = knownRows + customRows + `
    <div style="padding-top: 12px; margin-top: 4px;">
      <div style="font-size:0.8rem; font-weight:600; margin-bottom: 6px;">Add Another Contractor Document</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <input type="text" id="contractorDocAddLabel" placeholder="Document name (e.g. Model Release)" style="flex:1; min-width:220px;">
        <label class="btn btn-secondary" style="cursor:pointer; padding:6px 12px; font-size:0.8rem;">
          Choose File
          <input type="file" accept="application/pdf" id="contractorDocAddFile" style="display:none;">
        </label>
        <span id="contractorDocAddFileName" style="font-size:0.75rem; color:var(--text-muted);">No file chosen</span>
        <button type="button" id="contractorDocAddBtn" class="btn-primary" style="padding:6px 14px; font-size:0.8rem;">Add</button>
      </div>
      <div id="contractorDocAddStatus" style="font-size:0.75rem; margin-top:6px;"></div>
    </div>`;

  container.querySelectorAll('.contractor-doc-file-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const defKey = e.target.getAttribute('data-def-key');
      const customId = e.target.getAttribute('data-custom-id');
      if (defKey) {
        await saveContractorDocToLibrary(defKey, file);
      } else if (customId) {
        await replaceCustomContractorDoc(customId, file);
      }
      e.target.value = '';
      renderContractorDocManager();
    });
  });
  container.querySelectorAll('.contractor-doc-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteContractorEntry(btn.getAttribute('data-id')));
  });
  container.querySelectorAll('.contractor-doc-review-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = contractorEntries.find(t => t.id === btn.getAttribute('data-id'));
      if (entry) openAnchorReview(entry);
    });
  });
  container.querySelectorAll('.contractor-doc-mark-ready-btn').forEach(btn => {
    btn.addEventListener('click', () => markContractorDocReadyAsIs(btn.getAttribute('data-id')));
  });
  const addFileInput = el('contractorDocAddFile');
  const addFileName = el('contractorDocAddFileName');
  if (addFileInput) {
    addFileInput.addEventListener('change', () => {
      addFileName.textContent = addFileInput.files[0] ? addFileInput.files[0].name : 'No file chosen';
    });
  }
  const addBtn = el('contractorDocAddBtn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const label = (el('contractorDocAddLabel').value || '').trim();
      const file = addFileInput.files[0];
      if (!label) { el('contractorDocAddStatus').textContent = 'Enter a name for this document first.'; el('contractorDocAddStatus').style.color = 'var(--color-error, #f68d5f)'; return; }
      if (!file) { el('contractorDocAddStatus').textContent = 'Choose a PDF file first.'; el('contractorDocAddStatus').style.color = 'var(--color-error, #f68d5f)'; return; }
      addBtn.disabled = true;
      await addCustomContractorDoc(label, file);
      addBtn.disabled = false;
    });
  }
}

// ensurePdfjsWorker, detectClientAnchors, normalizeAnchorDetections, and
// bakeAnchorsAtDetection now live in ../shared-contract-pdf-tools.js
// (shared with Contract & Invoice Tracker - see that file's comments for
// the full heuristic explanation).

/* ── Anchor review panel (identical UI/behavior to Contract & Invoice
   Tracker's - see that file's anchorReviewPanel markup/comments) ── */
const anchorReviewPanel = el('anchorReviewPanel');
const anchorReviewLabel = el('anchorReviewLabel');
const anchorReviewCanvasWrap = el('anchorReviewCanvasWrap');
const anchorReviewCloseBtn = el('anchorReviewCloseBtn');
const anchorReviewApproveBtn = el('anchorReviewApproveBtn');
const anchorReviewRejectBtn = el('anchorReviewRejectBtn');
const anchorReviewStatus = el('anchorReviewStatus');
let currentAnchorReviewId = null;

// Renders ONE mini-preview per detected Client signature location, since
// a document (e.g. one with a separate Appendix acknowledgment page) can
// need the Client to sign in more than one spot - approving here approves
// the whole set together, since DocuSign will place a tab at every one
// of them from the same anchor string.
async function openAnchorReview(entry) {
  currentAnchorReviewId = entry.id;
  if (anchorReviewLabel) anchorReviewLabel.textContent = entry.label;
  if (anchorReviewStatus) anchorReviewStatus.textContent = '';
  if (anchorReviewPanel) {
    anchorReviewPanel.style.display = 'block';
    anchorReviewPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  if (anchorReviewApproveBtn) { anchorReviewApproveBtn.disabled = true; anchorReviewApproveBtn.textContent = 'Loading preview...'; }
  if (anchorReviewRejectBtn) anchorReviewRejectBtn.disabled = true;
  if (anchorReviewCanvasWrap) anchorReviewCanvasWrap.innerHTML = '';

  try {
    const detections = normalizeAnchorDetections(entry.anchorDetection);
    if (!detections.length) throw new Error('No detection data saved for this document.');

    const res = await fetch('/api/contracts/' + encodeURIComponent(entry.r2Key));
    if (!res.ok) throw new Error(`Couldn't load the file (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    ensurePdfjsWorker();
    const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    const doc = await lib.getDocument({ data: bytes }).promise;

    for (let i = 0; i < detections.length; i++) {
      const detection = detections[i];
      const page = await doc.getPage(detection.page + 1);
      const scale = 1.4;
      const viewport = page.getViewport({ scale });

      const block = document.createElement('div');
      if (detections.length > 1) {
        const heading = document.createElement('p');
        heading.style.cssText = 'font-size:0.78rem; font-weight:600; margin: 10px 0 4px;';
        heading.textContent = `Signature location ${i + 1} of ${detections.length} (page ${detection.page + 1})`;
        block.appendChild(heading);
      }
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      block.appendChild(canvas);
      anchorReviewCanvasWrap.appendChild(block);

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const toCanvas = (x, y) => ({ cx: x * scale, cy: viewport.height - (y * scale) });
      const sigPt = toCanvas(detection.sigX, detection.sigY);
      const datePt = toCanvas(detection.dateX, detection.dateY);

      const drawMarker = (pt, color) => {
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(pt.cx, pt.cy, 10, 0, Math.PI * 2);
        ctx.stroke();
      };
      drawMarker(sigPt, '#f68d5f');
      drawMarker(datePt, '#6366f1');
    }

    if (anchorReviewApproveBtn) { anchorReviewApproveBtn.disabled = false; anchorReviewApproveBtn.textContent = 'Looks correct — enable for DocuSign'; }
    if (anchorReviewRejectBtn) anchorReviewRejectBtn.disabled = false;
  } catch (e) {
    console.error('Could not render the anchor review preview:', e);
    if (anchorReviewStatus) {
      anchorReviewStatus.textContent = "Couldn't load the preview: " + e.message;
      anchorReviewStatus.style.color = 'var(--color-error, #f68d5f)';
    }
    if (anchorReviewRejectBtn) anchorReviewRejectBtn.disabled = false;
  }
}

if (anchorReviewCloseBtn) {
  anchorReviewCloseBtn.addEventListener('click', () => {
    if (anchorReviewPanel) anchorReviewPanel.style.display = 'none';
    currentAnchorReviewId = null;
  });
}

if (anchorReviewApproveBtn) {
  anchorReviewApproveBtn.addEventListener('click', async () => {
    if (!currentAnchorReviewId) return;
    anchorReviewApproveBtn.disabled = true;
    if (anchorReviewRejectBtn) anchorReviewRejectBtn.disabled = true;
    try {
      await writeContractorEntry((list) => {
        const idx = list.findIndex(t => t.id === currentAnchorReviewId);
        if (idx >= 0) list[idx] = { ...list[idx], docusignAnchorTags: true, needsAnchorReview: false };
        return list;
      });
      if (anchorReviewPanel) anchorReviewPanel.style.display = 'none';
      currentAnchorReviewId = null;
      renderContractorDocManager();
    } catch (err) {
      if (anchorReviewStatus) {
        anchorReviewStatus.textContent = "Couldn't save: " + err.message;
        anchorReviewStatus.style.color = 'var(--color-error, #f68d5f)';
      }
    } finally {
      anchorReviewApproveBtn.disabled = false;
      if (anchorReviewRejectBtn) anchorReviewRejectBtn.disabled = false;
    }
  });
}

if (anchorReviewRejectBtn) {
  anchorReviewRejectBtn.addEventListener('click', async () => {
    if (!currentAnchorReviewId) return;
    if (anchorReviewApproveBtn) anchorReviewApproveBtn.disabled = true;
    anchorReviewRejectBtn.disabled = true;
    try {
      await writeContractorEntry((list) => {
        const idx = list.findIndex(t => t.id === currentAnchorReviewId);
        if (idx >= 0) list[idx] = { ...list[idx], docusignAnchorTags: false, needsAnchorReview: false };
        return list;
      });
      if (anchorReviewPanel) anchorReviewPanel.style.display = 'none';
      currentAnchorReviewId = null;
      renderContractorDocManager();
    } catch (err) {
      if (anchorReviewStatus) {
        anchorReviewStatus.textContent = "Couldn't save: " + err.message;
        anchorReviewStatus.style.color = 'var(--color-error, #f68d5f)';
      }
    } finally {
      if (anchorReviewApproveBtn) anchorReviewApproveBtn.disabled = false;
      anchorReviewRejectBtn.disabled = false;
    }
  });
}

async function fetchPdfAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load ${url} (${res.status})`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read PDF'));
    reader.readAsDataURL(blob);
  });
}

let sendAgreementMemberId = null;
let sendAgreementSelectedDefs = [];

async function openSendAgreementPanel(memberId) {
  const member = members.find(m => m.id === memberId);
  if (!member) return;
  sendAgreementMemberId = memberId;

  const panel = el('sendAgreementPanel');
  const docList = el('sendAgreementDocList');
  const statusEl = el('sendAgreementStatus');
  if (!panel || !docList) return;

  el('sendAgreementTitle').textContent = `Send Contractor Agreement — ${member.memberName}`;
  el('sendAgreementTo').value = member.email || '';
  if (statusEl) statusEl.textContent = '';
  docList.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted);">Loading available documents...</p>';
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  await refreshContractorLibraryCache();
  // Unify the 2 known, field-schema'd docs with any custom ones added
  // below into one shape so the rest of this flow doesn't need to care
  // which kind it's dealing with - custom docs just have an empty fields
  // list (no auto-fill, signature-only). Only docusignAnchorTags===true
  // entries are offered here - a "Needs Review"/flat-PDF doc can't be
  // reliably sent for signature yet, same rule Contract Library follows.
  const knownAvailable = CONTRACTOR_DOC_DEFS.map(def => ({ def, entry: findKnownContractorEntry(def) }))
    .filter(x => x.entry && x.entry.docusignAnchorTags)
    .map(x => ({ key: x.def.key, label: x.entry.label, filename: x.entry.filename, r2Key: x.entry.r2Key, fields: x.def.fields }));
  const customAvailable = getCustomContractorEntries().filter(entry => entry.docusignAnchorTags).map(entry => ({
    key: 'custom:' + entry.id, label: entry.label, filename: entry.filename,
    r2Key: entry.r2Key, fields: []
  }));
  const available = [...knownAvailable, ...customAvailable];
  if (!available.length) {
    docList.innerHTML = '<p style="font-size:0.8rem;color:var(--color-error, #f68d5f);">No DocuSign-ready contractor documents yet — upload one and complete its review in Contractor Documents above.</p>';
    return;
  }

  docList.innerHTML = available.map(def => `
    <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem;">
      <input type="checkbox" class="agreement-doc-checkbox" value="${def.key}" checked>
      ${escapeHtml(def.label)}
    </label>
  `).join('');

  const updateFields = () => {
    sendAgreementSelectedDefs = available.filter(def =>
      docList.querySelector(`.agreement-doc-checkbox[value="${def.key}"]`).checked
    );
    renderAgreementFields(member);
  };
  docList.querySelectorAll('.agreement-doc-checkbox').forEach(cb => cb.addEventListener('change', updateFields));
  updateFields();
}

function renderAgreementFields(member) {
  const container = el('sendAgreementFields');
  if (!container) return;
  const seen = new Map();
  sendAgreementSelectedDefs.forEach(def => {
    def.fields.forEach(f => { if (!seen.has(f.token)) seen.set(f.token, f); });
  });
  const fields = Array.from(seen.values());
  container.innerHTML = fields.map(f => {
    const def = typeof f.default === 'function' ? (f.default(member) || '') : '';
    return `
      <div class="form-group">
        <label for="saf_${f.token}">${escapeHtml(f.label)}</label>
        <input type="text" id="saf_${f.token}" value="${escapeHtml(def)}">
      </div>`;
  }).join('');
}

async function performSendAgreement() {
  const member = members.find(m => m.id === sendAgreementMemberId);
  const statusEl = el('sendAgreementStatus');
  const sendBtn = el('sendAgreementSendBtn');
  if (!member || !sendAgreementSelectedDefs.length) return;

  const email = (el('sendAgreementTo').value || '').trim();
  if (!email) {
    if (statusEl) { statusEl.textContent = 'Enter the contractor\'s email first.'; statusEl.style.color = 'var(--color-error, #f68d5f)'; }
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Preparing documents...';
  if (statusEl) statusEl.textContent = '';

  try {
    const documents = await Promise.all(sendAgreementSelectedDefs.map(async (def) => {
      const base64 = await fetchPdfAsBase64('/api/contracts/' + encodeURIComponent(def.r2Key));
      return { name: def.filename, base64 };
    }));

    const seen = new Map();
    sendAgreementSelectedDefs.forEach(def => def.fields.forEach(f => { if (!seen.has(f.token)) seen.set(f.token, f); }));
    const fieldValues = {};
    seen.forEach((f, token) => {
      const input = el(`saf_${token}`);
      if (input && input.value.trim()) fieldValues[token] = input.value.trim();
    });

    // Signer-fillable fields (e.g. the Vendor Information Sheet's contact
    // details) - see CONTRACTOR_BLANK_FIELD_DEFS above. Purely a function
    // of which docs are selected, no admin input involved.
    const { blankFields, blankCheckboxFields } = collectBlankFieldsForSelectedDocs(sendAgreementSelectedDefs);

    sendBtn.textContent = 'Sending for signature...';
    const res = await fetch('/api/docusign/send-envelope', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documents,
        signerName: member.memberName,
        signerEmail: email,
        emailSubject: `Your Agreement with Revital Productions — ${member.memberName}`,
        fieldValues,
        ...(blankFields.length ? { blankFields } : {}),
        ...(blankCheckboxFields.length ? { blankCheckboxFields } : {})
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || `Send failed (${res.status})`);

    member.agreementStatus = 'Sent';
    member.agreementSentDate = todayStr();
    member.agreementEnvelopeId = data.envelopeId;
    await persist();
    renderTable();

    if (statusEl) { statusEl.textContent = `Sent for e-signature (envelope ${data.envelopeId}).`; statusEl.style.color = 'var(--color-success, #10b981)'; }
    if (window.parent.logAdminActivity) window.parent.logAdminActivity('Contractor agreement sent for e-signature', member.memberName);
    if (window.parent.showBanner) window.parent.showBanner('success', `Agreement sent to ${member.memberName} for e-signature.`);
    sendBtn.textContent = 'Sent ✓';
    setTimeout(() => { el('sendAgreementPanel').style.display = 'none'; sendBtn.disabled = false; sendBtn.textContent = 'Send for E-Signature (DocuSign)'; }, 1500);
  } catch (e) {
    console.error('Contractor agreement send failed:', e);
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send for E-Signature (DocuSign)';
    if (statusEl) { statusEl.textContent = "Couldn't send: " + e.message; statusEl.style.color = 'var(--color-error, #f68d5f)'; }
  }
}

const FORM_FIELDS = ['memberName', 'role', 'employmentType', 'email', 'startDate', 'currentClientCount', 'maxClientCount', 'weeklyCapacityHours', 'notes', 'insuranceExpirationDate'];

// Full month/day/year date display (e.g. "Jan 5, 2024") - used for Start
// Date in the roster table. Distinct from formatShortDate above (no year,
// used for time-off badges where the year is always "now-ish" and would
// just be clutter) - same { month, day, year } shape used repo-wide for
// dates where the year actually matters (see e.g. Subscription Tracker's
// formatDateNice, Renewal Tracker).
function formatDateNice(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Account Managers' load is live-computed (see getEffectiveLoad) - the
// manual "Current Client Load" field is meaningless for them, so hide it
// and explain why instead of leaving a number nobody should touch. The
// weekly-hours field is the opt-in live alternative for every other
// role (production/creative) - also not applicable to AMs, so it hides
// alongside the manual client-count field.
function updateCapacityFieldsVisibility() {
  const isAM = el('role').value === 'Account Manager';
  const group = el('currentClientCountGroup');
  const note = el('liveLoadNote');
  const hoursGroup = el('weeklyCapacityHoursGroup');
  if (group) group.style.display = isAM ? 'none' : '';
  if (note) note.style.display = isAM ? '' : 'none';
  if (hoursGroup) hoursGroup.style.display = isAM ? 'none' : '';
}

// W-9 / insurance only make sense for Contractors - Full-Time/Part-Time
// staff don't file a W-9 with Revital or carry their own liability
// insurance, so the whole section hides for them (same show/hide pattern
// as updateCapacityFieldsVisibility above, keyed off a different field).
function updateComplianceFieldsVisibility() {
  const isContractor = el('employmentType').value === 'Contractor';
  const section = el('complianceSection');
  if (section) section.style.display = isContractor ? '' : 'none';
}

function resetForm() {
  editingId = null;
  el('memberName').value = '';
  el('role').value = 'Account Manager';
  el('employmentType').value = 'Full-Time';
  el('email').value = '';
  el('startDate').value = '';
  el('currentClientCount').value = '';
  el('maxClientCount').value = '';
  el('weeklyCapacityHours').value = '';
  el('notes').value = '';
  el('w9OnFile').checked = false;
  el('insuranceExpirationDate').value = '';
  el('formTitle').textContent = 'New Team Member';
  el('saveMemberBtn').textContent = 'Add Team Member';
  el('cancelEditBtn').style.display = 'none';
  el('formCard').style.display = 'none';
  updateCapacityFieldsVisibility();
  updateComplianceFieldsVisibility();
  renderTimeOffSection();
  renderOnboardingSection();
}

// Merges onto `base` (the previous entry, when editing) rather than
// building a bare object from FORM_FIELDS alone - the old version
// replaced the whole entry on every save, which silently wiped out
// fields the form doesn't show (agreementStatus/agreementSentDate/
// agreementEnvelopeId from Send Agreement, manualCurrentClientCountUpdatedAt
// below) any time someone edited a contractor's info afterward.
function gatherForm(base) {
  const entry = { ...(base || {}), id: editingId || uid() };
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    if (id === 'currentClientCount' || id === 'maxClientCount') {
      entry[id] = Math.max(0, parseInt(field.value) || 0);
    } else if (id === 'weeklyCapacityHours') {
      entry[id] = Math.max(0, parseFloat(field.value) || 0);
    } else {
      entry[id] = field.value.trim ? field.value.trim() : field.value;
    }
  });
  entry.w9OnFile = el('w9OnFile').checked;
  return entry;
}

function saveMember() {
  const name = el('memberName').value.trim();
  if (!name) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Give this team member a name first.');
    return;
  }

  const prev = editingId ? members.find(m => m.id === editingId) : null;
  const entry = gatherForm(prev);

  // Stamp when the manually-typed load actually changed, so non-AM rows
  // (no live data source) can show "updated X days ago" - a fresh add
  // or an untouched number on edit doesn't reset the clock.
  if (!prev || (parseInt(prev.currentClientCount) || 0) !== entry.currentClientCount) {
    entry.manualCurrentClientCountUpdatedAt = todayStr();
  }

  if (editingId) {
    const idx = members.findIndex(m => m.id === editingId);
    if (idx >= 0) members[idx] = entry;
  } else {
    members.unshift(entry);
  }

  persist().then(async ok => {
    if (!ok) return;
    // Role/email edits change who matches which client, so re-pull the
    // live snapshot before re-rendering rather than waiting for a reload.
    await refreshCapacitySnapshot();
    resetForm();
    refreshViews();
    if (window.parent.showBanner) window.parent.showBanner('success', `Saved ${name}.`);
  });
}

function startEdit(id) {
  const entry = members.find(m => m.id === id);
  if (!entry) return;
  editingId = id;
  FORM_FIELDS.forEach(fieldId => { el(fieldId).value = entry[fieldId] || ''; });
  el('w9OnFile').checked = !!entry.w9OnFile;
  el('formTitle').textContent = 'Edit Team Member';
  el('saveMemberBtn').textContent = 'Update Team Member';
  el('cancelEditBtn').style.display = 'inline-block';
  el('formCard').style.display = 'block';
  updateCapacityFieldsVisibility();
  updateComplianceFieldsVisibility();
  renderTimeOffSection();
  renderOnboardingSection();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeMember(id) {
  const entry = members.find(m => m.id === id);
  if (!entry) return;
  if (!confirm(`Remove ${entry.memberName} from the roster?`)) return;
  members = members.filter(m => m.id !== id);
  persist().then(async ok => {
    if (!ok) return;
    await refreshCapacitySnapshot();
    if (editingId === id) resetForm();
    refreshViews();
  });
}

function capacityInfo(current, max) {
  if (max <= 0) return { label: '—', cls: 'capacity-unknown' };
  if (current >= max) return { label: 'At Capacity', cls: 'capacity-full' };
  if (current >= max * 0.8) return { label: 'Near Capacity', cls: 'capacity-near' };
  return { label: 'Has Room', cls: 'capacity-room' };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function updateSummary() {
  let hasRoom = 0, nearCapacity = 0, atCapacity = 0;
  members.forEach(m => {
    const load = getEffectiveLoad(m);
    const info = capacityInfo(load.current, load.max);
    if (info.cls === 'capacity-room') hasRoom++;
    else if (info.cls === 'capacity-near') nearCapacity++;
    else if (info.cls === 'capacity-full') atCapacity++;
  });
  el('summaryTeamCount').textContent = members.length;
  el('summaryHasRoom').textContent = hasRoom;
  el('summaryNearCapacity').textContent = nearCapacity;
  el('summaryAtCapacity').textContent = atCapacity;
}

function renderTable() {
  updateSummary();

  const filter = (el('filterInput').value || '').trim().toLowerCase();
  const rows = members.filter(m => {
    if (!filter) return true;
    return (m.memberName || '').toLowerCase().includes(filter) || (m.role || '').toLowerCase().includes(filter);
  });

  const tbody = el('rosterTableBody');
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  tbody.innerHTML = rows.map(m => {
    const load = getEffectiveLoad(m);
    const info = capacityInfo(load.current, load.max);
    const current = load.current;
    const max = load.max;
    const loadText = max > 0 ? `${current} / ${max}${load.unit === 'hrs' ? ' hrs' : ''}` : (current || '—');
    const percent = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
    const barFillClass = info.cls === 'capacity-unknown' ? '' : info.cls;
    const staleCaption = (!load.isLive && m.manualCurrentClientCountUpdatedAt)
      ? `<div style="font-size:0.68rem; color:var(--text-muted); margin-top:2px;">${daysAgoLabel(m.manualCurrentClientCountUpdatedAt)}</div>`
      : '';
    const loadCell = max > 0
      ? `<div class="capacity-bar-cell">
           <div class="capacity-bar-wrap" title="${percent}% of capacity">
             <div class="capacity-bar-fill ${barFillClass}" style="width:${percent}%;"></div>
           </div>
           <span class="capacity-bar-label">${loadText}</span>
           ${staleCaption}
         </div>`
      : loadText + staleCaption;
    const isContractor = m.employmentType === 'Contractor';
    let agreementCell = '—';
    if (isContractor) {
      if (m.agreementStatus === 'Sent') {
        agreementCell = `<span class="section-tag" title="Envelope ${escapeHtml(m.agreementEnvelopeId || '')}">Sent ${escapeHtml(m.agreementSentDate || '')}</span>`;
      } else {
        agreementCell = `<span class="section-tag capacity-unknown">Not Sent</span>`;
      }
    }
    // Only live rows (Account Manager caseload or hours-tracked roles)
    // have a real client list behind them worth expanding - manually-
    // tracked roles have no client-name data to show, so their tag isn't
    // clickable.
    const expandTitle = load.unit === 'hrs' ? 'Click to see clients logged this week' : 'Click to see assigned clients';
    const capacityCell = load.isLive
      ? `<span class="section-tag ${info.cls} roster-capacity-toggle" data-id="${m.id}" style="cursor:pointer;" title="${expandTitle}">${info.label} ${expandedRosterId === m.id ? '▴' : '▾'}</span>`
      : `<span class="section-tag ${info.cls}">${info.label}</span>`;
    const timeOffInfo = timeOffStatus(m);
    const timeOffBadge = timeOffInfo
      ? `<div style="font-size:0.68rem; color:${timeOffInfo.color}; margin-top:2px;">${timeOffInfo.text}</div>`
      : '';
    // Only nag about unfinished onboarding - once complete, the badge
    // disappears rather than sitting there permanently as a "✓ done"
    // that nobody needs to see again.
    const onboardingProg = onboardingProgress(m);
    const onboardingBadge = onboardingProg.done < onboardingProg.total
      ? `<div style="font-size:0.68rem; color:#f68d5f; margin-top:2px;">Onboarding ${onboardingProg.done}/${onboardingProg.total}</div>`
      : '';
    const complianceBadge = complianceIssues(m)
      .map(issue => `<div style="font-size:0.68rem; color:${issue.color}; margin-top:2px;">${escapeHtml(issue.text)}</div>`)
      .join('');
    let rowHtml = `<tr>
      <td class="client-cell">${escapeHtml(m.memberName)}${timeOffBadge}${onboardingBadge}${complianceBadge}</td>
      <td>${escapeHtml(m.role)}${isContractor ? ' <span class="section-tag" style="margin-left:4px;">Contractor</span>' : ''}</td>
      <td>${escapeHtml(m.employmentType)}</td>
      <td>${escapeHtml(formatDateNice(m.startDate)) || '—'}</td>
      <td>${loadCell}</td>
      <td>${capacityCell}</td>
      <td>${agreementCell}</td>
      <td>${escapeHtml(m.notes) || '—'}</td>
      <td class="roster-actions-cell" style="display:${isRestrictedUser ? 'none' : ''};">
        <div class="row-actions">
          ${isContractor ? `<button class="send-agreement-btn" data-id="${m.id}">Send Agreement</button>` : ''}
          <button class="edit-btn" data-id="${m.id}">Edit</button>
          <button class="remove-btn" data-id="${m.id}">Remove</button>
        </div>
      </td>
    </tr>`;
    if (load.isLive && expandedRosterId === m.id) {
      const expandLabel = load.unit === 'hrs' ? 'Clients logged this week' : 'Assigned clients';
      const emptyText = load.unit === 'hrs' ? 'No hours logged against a client yet this week.' : 'No clients assigned yet.';
      const names = load.clientNames.length
        ? load.clientNames.map(escapeHtml).join(', ')
        : emptyText;
      rowHtml += `<tr class="roster-expand-row"><td colspan="9" style="padding:6px 14px 12px; font-size:0.8rem; color:var(--text-muted);"><strong>${expandLabel}:</strong> ${names}</td></tr>`;
    }
    return rowHtml;
  }).join('');

  tbody.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => startEdit(btn.getAttribute('data-id'))));
  tbody.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => removeMember(btn.getAttribute('data-id'))));
  tbody.querySelectorAll('.send-agreement-btn').forEach(btn => btn.addEventListener('click', () => openSendAgreementPanel(btn.getAttribute('data-id'))));
  tbody.querySelectorAll('.roster-capacity-toggle').forEach(tag => tag.addEventListener('click', () => toggleClientExpand(tag.getAttribute('data-id'))));
}

// Same partial gate as Email Template Library/SOP Wiki: everyone can view
// the roster (useful for anyone assigning new client work), but only
// admin/leadership can add, edit, or remove team members.
function applyEditPermission() {
  if (!window.parent || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot) return;
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamAccess");
  window.parent.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap && docSnap.exists ? docSnap.data() : null;
    const users = (data && data.users) ? data.users : {};
    const currentEmail = (window.parent.currentAdminEmail || "").toLowerCase();
    isRestrictedUser = !!(currentEmail && Object.prototype.hasOwnProperty.call(users, currentEmail));

    el('newMemberBtn').style.display = isRestrictedUser ? 'none' : '';
    el('actionsHeader').style.display = isRestrictedUser ? 'none' : '';
    if (isRestrictedUser) el('formCard').style.display = 'none';
    const contractorDocCard = el('contractorDocCard');
    if (contractorDocCard) {
      contractorDocCard.style.display = isRestrictedUser ? 'none' : 'block';
      if (!isRestrictedUser) renderContractorDocManager();
    }
    renderTable();
  }, (err) => {
    console.error("Edit-permission listener error:", err);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  applyEditPermission();
  resetForm();
  await Promise.all([loadMembers(), refreshCapacitySnapshot()]);
  refreshViews();

  el('newMemberBtn').addEventListener('click', () => {
    resetForm();
    el('formCard').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  el('saveMemberBtn').addEventListener('click', saveMember);
  el('cancelEditBtn').addEventListener('click', resetForm);
  el('role').addEventListener('change', updateCapacityFieldsVisibility);
  el('employmentType').addEventListener('change', updateComplianceFieldsVisibility);
  el('filterInput').addEventListener('input', refreshViews);
  el('viewListBtn').addEventListener('click', () => switchRosterView('list'));
  el('viewCalendarBtn').addEventListener('click', () => switchRosterView('calendar'));
  const timeOffAddBtn = el('timeOffAddBtn');
  if (timeOffAddBtn) timeOffAddBtn.addEventListener('click', addTimeOff);

  const sendAgreementCloseBtn = el('sendAgreementCloseBtn');
  const sendAgreementSendBtn = el('sendAgreementSendBtn');
  if (sendAgreementCloseBtn) {
    sendAgreementCloseBtn.addEventListener('click', () => { el('sendAgreementPanel').style.display = 'none'; });
  }
  if (sendAgreementSendBtn) {
    sendAgreementSendBtn.addEventListener('click', performSendAgreement);
  }
});
