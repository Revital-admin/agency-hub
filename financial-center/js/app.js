/* ============================================================
   FINANCIAL CENTER — APP LOGIC
   Agency-wide (not tied to a single client): manual figures live at
   agency/financialCenter, same optimistic-concurrency version-guard
   pattern as Subscription Tracker. Admin/leadership-only whole-page gate,
   same agency/teamAccess check as Subscription Tracker/Service Pricing
   Admin, since this is financial info.

   Two sections pull LIVE data instead of manual entry, since the real
   source of truth already exists elsewhere in the Hub:
     - Software costs: reads agency/subscriptionTracker directly (the
       same doc Subscription Tracker itself owns).
     - Outstanding invoices: reads contractInvoiceRecords via the shared
       window.parent.getContractInvoiceRecords() helper Budget Pacing
       Tracker also uses (see app.js).

   Everything else (cash, revenue, expenses, credit card balance,
   available credit, tax reserve, owner funding) is manual for now,
   stored as { amount, source, lastUpdated } per field - source is
   'manual' until QuickBooks Sync (see qb-connect card) fills it, at
   which point source flips to 'quickbooks' with no change to the field
   shape. The QuickBooks OAuth + snapshot endpoints live in the root
   _worker.js (/api/quickbooks/*) - this file only ever calls them over
   fetch(), never touches a token or secret directly.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "financialCenter");
}

// The 7 manual-entry figures - key order here drives both the form grid
// and the summary bar mapping below. "quickbooksField" is the key the
// /api/quickbooks/snapshot response uses for this figure, so a sync only
// ever needs to loop this list rather than hardcoding each field twice.
const MANUAL_FIELDS = [
  { key: "cashAvailable", label: "Cash Available", hint: "Across operating + savings accounts", quickbooksField: "cashAvailable" },
  { key: "revenueThisMonth", label: "Revenue This Month", hint: "", quickbooksField: "revenueThisMonth" },
  { key: "expensesThisMonth", label: "Expenses This Month", hint: "", quickbooksField: "expensesThisMonth" },
  { key: "creditCardBalance", label: "Credit Card Balance", hint: "What's currently owed", quickbooksField: "creditCardBalance" },
  { key: "availableCredit", label: "Available Credit", hint: "Remaining limit across cards - QuickBooks doesn't track this, stays manual", quickbooksField: null },
  { key: "taxReserve", label: "Tax Reserve", hint: "Set aside for taxes", quickbooksField: "taxReserve" },
  { key: "ownerFunding", label: "Owner Funding", hint: "Owner contributions / draws balance", quickbooksField: "ownerFunding" }
];

let manualValues = {}; // key -> { amount, source, lastUpdated }
let docVersion = 0;

function emptyFieldValue() {
  return { amount: 0, source: "manual", lastUpdated: null };
}

function parseAmountToNumber(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function formatCurrency(n) {
  const rounded = Math.round(n || 0);
  return (rounded < 0 ? '-$' : '$') + Math.abs(rounded).toLocaleString('en-US');
}

function formatDate(iso) {
  if (!iso) return 'never';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return 'never';
  }
}

async function loadManualValues() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      if (data && data.fields) {
        manualValues = data.fields;
        docVersion = data.version || 0;
      } else {
        manualValues = {};
        docVersion = 0;
      }
    } catch (e) {
      console.error("Couldn't load Financial Center figures:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load saved figures: " + e.message);
      manualValues = {};
    }
  } else {
    try {
      const saved = localStorage.getItem('financial-center-fields');
      manualValues = saved ? JSON.parse(saved) : {};
    } catch (e) { manualValues = {}; }
  }
  MANUAL_FIELDS.forEach(f => {
    if (!manualValues[f.key]) manualValues[f.key] = emptyFieldValue();
  });
}

async function persistManualValues() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ fields: manualValues, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save Financial Center figures:", result.error);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', result.reason === 'conflict'
          ? "Someone else updated these figures while you had this open. Reload to see their changes, then redo your edit."
          : "Couldn't save — your change may be lost: " + result.error.message);
      }
      return false;
    }
    docVersion = result.version;
    return true;
  }
  try { localStorage.setItem('financial-center-fields', JSON.stringify(manualValues)); } catch (e) {}
  return true;
}

function renderManualFields() {
  const grid = el('manualFieldsGrid');
  grid.innerHTML = MANUAL_FIELDS.map(f => {
    const val = manualValues[f.key] || emptyFieldValue();
    const sourceLabel = val.source === 'quickbooks' ? 'QuickBooks' : 'Manual';
    const sourceClass = val.source === 'quickbooks' ? 'fc-source-quickbooks' : '';
    return `
      <div class="fc-field">
        <label for="fc-${f.key}">${f.label}</label>
        <input type="text" inputmode="decimal" id="fc-${f.key}" data-key="${f.key}" placeholder="0" value="${val.amount ? val.amount : ''}">
        <span class="fc-field-meta ${sourceClass}">${sourceLabel} &middot; updated ${formatDate(val.lastUpdated)}</span>
        ${f.hint ? `<span class="fc-field-meta">${f.hint}</span>` : ''}
      </div>
    `;
  }).join('');

  MANUAL_FIELDS.forEach(f => {
    const input = el(`fc-${f.key}`);
    if (input && typeof attachCommaFormatting === 'function') attachCommaFormatting(input);
  });
}

async function saveManualValues() {
  MANUAL_FIELDS.forEach(f => {
    const input = el(`fc-${f.key}`);
    if (!input) return;
    const amount = parseAmountToNumber(input.value);
    const prev = manualValues[f.key] || emptyFieldValue();
    // Only stamp a new lastUpdated/source if the number actually changed -
    // re-saving the form without touching a field shouldn't make it look
    // freshly updated.
    if (amount !== prev.amount) {
      manualValues[f.key] = { amount, source: 'manual', lastUpdated: new Date().toISOString() };
    }
  });
  const ok = await persistManualValues();
  if (ok) {
    renderManualFields();
    renderSummary();
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('success', 'Figures saved.');
  }
}

function renderSummary() {
  const cash = (manualValues.cashAvailable || emptyFieldValue()).amount;
  const revenue = (manualValues.revenueThisMonth || emptyFieldValue()).amount;
  const expenses = (manualValues.expensesThisMonth || emptyFieldValue()).amount;
  const burn = expenses - revenue;

  el('summaryCash').textContent = formatCurrency(cash);
  el('summaryRevenue').textContent = formatCurrency(revenue);
  el('summaryExpenses').textContent = formatCurrency(expenses);

  const burnEl = el('summaryBurn');
  burnEl.textContent = formatCurrency(Math.max(burn, 0));
  burnEl.classList.remove('positive', 'negative');
  burnEl.classList.add(burn > 0 ? 'negative' : 'positive');
}

// ── Software costs (live from agency/subscriptionTracker) ──
async function loadSoftwareCosts() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseGetDoc || !window.parent.firebaseDb) return;
  try {
    const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "subscriptionTracker");
    const snap = await window.parent.firebaseGetDoc(ref);
    const data = snap && snap.exists ? snap.data() : null;
    const list = (data && Array.isArray(data.list)) ? data.list : [];
    const active = list.filter(e => e.status === 'Active');
    const recurringMonthly = active.filter(e => e.billingCycle === 'Monthly').reduce((sum, e) => sum + (Number(e.monthlyCost) || 0), 0);
    const annual = active.filter(e => e.billingCycle === 'Annual').reduce((sum, e) => sum + (Number(e.monthlyCost) || 0), 0);
    el('summaryRecurringSoftware').textContent = formatCurrency(recurringMonthly);
    el('summaryAnnualSoftware').textContent = formatCurrency(annual);
  } catch (e) {
    console.warn("Couldn't load software costs from Subscription Tracker:", e);
  }
}

// ── Outstanding invoices (live from contractInvoiceRecords) ──
async function loadOutstandingInvoices() {
  if (!isEmbedded || typeof window.parent.getContractInvoiceRecords !== 'function') return;
  try {
    const snap = await window.parent.getContractInvoiceRecords();
    const docs = (snap && snap.docs) ? snap.docs : [];
    const records = docs.map(d => (typeof d.data === 'function' ? d.data() : d));
    const outstanding = records.filter(r => r.invoiceStatus === 'Sent' || r.invoiceStatus === 'Overdue');
    const overdue = records.filter(r => r.invoiceStatus === 'Overdue');
    const outstandingTotal = outstanding.reduce((sum, r) => sum + parseAmountToNumber(r.invoiceAmount), 0);
    const overdueTotal = overdue.reduce((sum, r) => sum + parseAmountToNumber(r.invoiceAmount), 0);
    el('summaryOutstanding').textContent = formatCurrency(outstandingTotal);
    el('summaryOverdueInvoices').textContent = formatCurrency(overdueTotal);
    el('summaryOutstandingCount').textContent = String(outstanding.length);
  } catch (e) {
    console.warn("Couldn't load outstanding invoices from Contract & Invoice Tracker:", e);
  }
}

// ── QuickBooks connect/sync ──
async function checkQbStatus() {
  try {
    const res = await fetch('/api/quickbooks/status');
    const data = await res.json().catch(() => ({}));
    updateQbStatusUI(!!data.connected, data.companyName, data.connectedAt);
  } catch (e) {
    console.warn("Couldn't check QuickBooks connection status:", e);
    updateQbStatusUI(false);
  }
}

function updateQbStatusUI(connected, companyName, connectedAt) {
  const badge = el('qbStatusBadge');
  const text = el('qbStatusText');
  const connectBtn = el('qbConnectBtn');
  const syncBtn = el('qbSyncBtn');

  if (connected) {
    badge.textContent = 'Connected';
    badge.className = 'section-tag status-active';
    text.textContent = `Connected to ${companyName || 'QuickBooks'}${connectedAt ? ' since ' + formatDate(connectedAt) : ''}. "Sync Now" pulls the latest cash, revenue, expenses, and credit card balance in.`;
    connectBtn.style.display = 'none';
    syncBtn.style.display = '';
  } else {
    badge.textContent = 'Not connected';
    badge.className = 'section-tag status-cancelled';
    text.textContent = 'Not connected yet. Once linked, "Sync Now" pulls cash, revenue, expenses, and credit card balance straight from QuickBooks instead of typing them in by hand.';
    connectBtn.style.display = '';
    syncBtn.style.display = 'none';
  }
}

async function syncFromQuickBooks() {
  const btn = el('qbSyncBtn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Syncing...';
  try {
    const res = await fetch('/api/quickbooks/snapshot', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (window.parent.showBanner) window.parent.showBanner('error', data.error || 'QuickBooks sync failed.');
      return;
    }
    const now = new Date().toISOString();
    let updatedCount = 0;
    MANUAL_FIELDS.forEach(f => {
      if (!f.quickbooksField) return;
      if (typeof data[f.quickbooksField] !== 'number') return;
      manualValues[f.key] = { amount: data[f.quickbooksField], source: 'quickbooks', lastUpdated: now };
      updatedCount++;
    });
    await persistManualValues();
    renderManualFields();
    renderSummary();
    if (window.parent.showBanner) window.parent.showBanner('success', `Synced ${updatedCount} figure${updatedCount === 1 ? '' : 's'} from QuickBooks.`);
  } catch (e) {
    console.error("QuickBooks sync failed:", e);
    if (window.parent.showBanner) window.parent.showBanner('error', "QuickBooks sync failed: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

// Full admin access OR a restricted teammate specifically granted the
// "finance" Team Access section (the FINANCE sidebar group, added Aug
// 2026 - see index.html) may open this tool. Mirrors resolveAllowedSections
// in the root app.js by hand (role-based vs. custom-sections shape) since
// that helper isn't exposed to iframes - same "keep it in sync manually"
// convention CLIENT_FIELD_SECTIONS documents in _worker.js.
function resolveFinanceSectionAccess(data, currentEmail) {
  const users = (data && data.users) ? data.users : {};
  const roleTiers = (data && data.roleTiers) ? data.roleTiers : {};
  if (!currentEmail || !Object.prototype.hasOwnProperty.call(users, currentEmail)) {
    return { isRestricted: false, sections: [] };
  }
  const entry = users[currentEmail] || {};
  const sections = (entry.role && roleTiers[entry.role])
    ? (roleTiers[entry.role].sections || [])
    : (Array.isArray(entry.sections) ? entry.sections : []);
  return { isRestricted: true, sections };
}

function initAccessGate() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot) {
    return; // not embedded - nothing to gate, matches other standalone tools
  }
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamAccess");
  window.parent.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap && docSnap.exists ? docSnap.data() : null;
    const currentEmail = (window.parent.currentAdminEmail || "").toLowerCase();
    const { isRestricted, sections } = resolveFinanceSectionAccess(data, currentEmail);
    const allowed = !isRestricted || sections.indexOf('finance') !== -1;

    el('trackerContent').style.display = allowed ? '' : 'none';
    el('notAuthorizedState').style.display = allowed ? 'none' : '';
  }, (err) => {
    console.error("Access gate listener error:", err);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initAccessGate();
  await loadManualValues();
  renderManualFields();
  renderSummary();
  loadSoftwareCosts();
  loadOutstandingInvoices();
  checkQbStatus();

  el('saveManualBtn').addEventListener('click', saveManualValues);
  el('qbConnectBtn').addEventListener('click', () => window.open('/api/quickbooks/oauth-start', '_blank'));
  el('qbSyncBtn').addEventListener('click', syncFromQuickBooks);
});
