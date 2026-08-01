/* ============================================================
   CASH FLOW SNAPSHOT — APP LOGIC
   Read-only lens (no writes, no forms) - same idea as Agency Health
   Dashboard, but for money instead of client health. Aggregates 3
   existing docs that were never summed against each other before:

     agency/contractInvoices   (Contract & Invoice Tracker) - revenue
     agency/subscriptionTracker (Subscription Tracker)      - recurring costs
     agency/expenseTracker      (Business Expense Tracker)  - all other costs

   "Active Billing" (every signed client's invoiceAmount, added
   together) is reused as-is from Contract & Invoice Tracker's own
   summary - it's a proxy for MRR, not a true one, since nothing
   enforces the invoice cycle is actually monthly. This tool doesn't
   pretend to be more precise than that; it just puts the number next
   to the cost side for the first time.
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

function formatCurrency(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function parseAmountToNumber(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function toDateOnly(d) {
  const dt = (d instanceof Date) ? new Date(d) : new Date(d + 'T00:00:00');
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function daysBetween(fromStr, toStrVal) {
  const from = toDateOnly(fromStr);
  const to = toDateOnly(toStrVal);
  return Math.round((to - from) / 86400000);
}

function todayStr() {
  return toDateOnly(new Date()).toISOString().slice(0, 10);
}

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

async function fetchAgencyDoc(docName) {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseGetDoc) return null;
  try {
    const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", docName);
    const snap = await window.parent.firebaseGetDoc(ref);
    return snap && snap.exists ? snap.data() : null;
  } catch (e) {
    console.error(`Couldn't load agency/${docName}:`, e);
    return null;
  }
}

// Same monthly-equivalent normalization as Subscription Tracker itself
// (Annual -> /12), only counting entries that aren't Cancelled.
function subscriptionMonthlyTotal(data) {
  const list = (data && Array.isArray(data.list)) ? data.list : [];
  return list
    .filter(e => e.status !== 'Cancelled')
    .reduce((sum, e) => {
      const cost = parseFloat(e.monthlyCost) || 0;
      return sum + (e.billingCycle === 'Annual' ? cost / 12 : cost);
    }, 0);
}

// Same monthly-equivalent normalization as Business Expense Tracker
// itself (Quarterly -> /3, Annually -> /12), for recurring entries only.
function expenseRecurringMonthlyTotal(data) {
  const list = (data && Array.isArray(data.list)) ? data.list : [];
  return list
    .filter(e => e.recurring)
    .reduce((sum, e) => {
      const amount = parseFloat(e.amount) || 0;
      if (e.frequency === 'Quarterly') return sum + amount / 3;
      if (e.frequency === 'Annually') return sum + amount / 12;
      return sum + amount;
    }, 0);
}

function expenseOneOffThisMonthTotal(data) {
  const list = (data && Array.isArray(data.list)) ? data.list : [];
  return list
    .filter(e => !e.recurring && isThisMonth(e.expenseDate))
    .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
}

// Reuses Contract & Invoice Tracker's own definitions exactly, so this
// number always matches what that tool shows - no separate "revenue"
// concept invented here.
function revenueBreakdown(data) {
  const records = (data && Array.isArray(data.list)) ? data.list : [];
  const activeBilling = records
    .filter(r => r.contractStatus === 'Signed')
    .reduce((sum, r) => sum + parseAmountToNumber(r.invoiceAmount), 0);

  const overdue = records.filter(r => {
    if (r.invoiceStatus === 'Overdue') return true;
    // Mirror Contract & Invoice Tracker's own reconcileOverdueInvoices
    // sweep (Sent + past due date counts as overdue) without needing to
    // write anything back to that doc from here - this tool is read-only.
    return r.invoiceStatus === 'Sent' && r.invoiceDueDate && daysBetween(r.invoiceDueDate, todayStr()) >= 1;
  });
  const overdueTotal = overdue.reduce((sum, r) => sum + parseAmountToNumber(r.invoiceAmount), 0);

  const renewalsDue = records.filter(r => {
    if (r.contractStatus !== 'Signed' || !r.contractRenewalDate) return false;
    return daysBetween(todayStr(), r.contractRenewalDate) <= 30;
  });
  const renewalsTotal = renewalsDue.reduce((sum, r) => sum + parseAmountToNumber(r.invoiceAmount), 0);

  return { activeBilling, overdueTotal, renewalsTotal };
}

async function loadSnapshot() {
  const [invoiceData, subscriptionData, expenseData] = await Promise.all([
    fetchAgencyDoc('contractInvoices'),
    fetchAgencyDoc('subscriptionTracker'),
    fetchAgencyDoc('expenseTracker'),
  ]);

  const revenue = revenueBreakdown(invoiceData);
  const subscriptionsMonthly = subscriptionMonthlyTotal(subscriptionData);
  const expenseRecurringMonthly = expenseRecurringMonthlyTotal(expenseData);
  const expenseOneOff = expenseOneOffThisMonthTotal(expenseData);
  const totalCosts = subscriptionsMonthly + expenseRecurringMonthly + expenseOneOff;
  const net = revenue.activeBilling - totalCosts;

  el('summaryRevenue').textContent = formatCurrency(revenue.activeBilling);
  el('summaryCosts').textContent = formatCurrency(totalCosts);
  el('summaryNet').textContent = (net < 0 ? '-' : '') + formatCurrency(Math.abs(net));
  el('summaryNet').style.color = net < 0 ? 'var(--color-error, #f68d5f)' : '';
  el('summaryOverdueAR').textContent = formatCurrency(revenue.overdueTotal);

  el('revActiveBilling').textContent = formatCurrency(revenue.activeBilling);
  el('revOverdue').textContent = formatCurrency(revenue.overdueTotal);
  el('revRenewals').textContent = formatCurrency(revenue.renewalsTotal);

  el('costSubscriptions').textContent = formatCurrency(subscriptionsMonthly);
  el('costRecurringExpenses').textContent = formatCurrency(expenseRecurringMonthly);
  el('costOneOff').textContent = formatCurrency(expenseOneOff);

  el('loadingState').style.display = 'none';
}

// Same admin/leadership-only whole-page gate as Subscription Tracker /
// Business Expense Tracker, since this combines financial info from
// both into one place.
function initAccessGate() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot) {
    return;
  }
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamAccess");
  window.parent.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap && docSnap.exists ? docSnap.data() : null;
    const users = (data && data.users) ? data.users : {};
    const currentEmail = (window.parent.currentAdminEmail || "").toLowerCase();
    const isRestricted = currentEmail && Object.prototype.hasOwnProperty.call(users, currentEmail);

    el('dashboardContent').style.display = isRestricted ? 'none' : '';
    el('notAuthorizedState').style.display = isRestricted ? '' : 'none';
  }, (err) => {
    console.error("Access gate listener error:", err);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initAccessGate();
  try {
    await loadSnapshot();
  } catch (e) {
    console.error("Couldn't build the cash flow snapshot:", e);
    el('loadingState').style.display = 'none';
    el('errorState').textContent = "Couldn't load the snapshot: " + e.message;
    el('errorState').style.display = 'block';
  }
});
