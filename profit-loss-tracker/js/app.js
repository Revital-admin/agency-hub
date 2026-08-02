/* ============================================================
   PROFIT & LOSS TRACKER — APP LOGIC
   Agency-wide (agency/profitLossHistory), same optimistic-concurrency
   version-guard as every other shared agency doc (see
   window.parent.saveVersionedAgencyDoc).

   The live "this month" numbers are computed with the exact same
   functions as Cash Flow Snapshot (copied verbatim, not reinvented) so
   the two tools never quietly disagree about what "revenue" or "costs"
   means. What this tool adds on top: a "Record This Month" action that
   snapshots those numbers into history, building a real trend over
   time - Cash Flow Snapshot explicitly disclaims being a P&L or having
   any history; this is the tool that actually is one.

   Deliberately does NOT backfill or estimate past months - there's no
   historical revenue ledger to compute that from (Contract & Invoice
   Tracker only has each client's CURRENT invoiceAmount, not a per-month
   billing history). The trend starts empty and grows one real recorded
   month at a time, rather than faking a history that never happened.
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
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
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

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthKeyToLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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

// ── Same math as Cash Flow Snapshot, copied verbatim ──
function subscriptionMonthlyTotal(data) {
  const list = (data && Array.isArray(data.list)) ? data.list : [];
  return list
    .filter(e => e.status !== 'Cancelled')
    .reduce((sum, e) => {
      const cost = parseFloat(e.monthlyCost) || 0;
      return sum + (e.billingCycle === 'Annual' ? cost / 12 : cost);
    }, 0);
}

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

function revenueActiveBilling(data) {
  const records = (data && Array.isArray(data.list)) ? data.list : [];
  return records
    .filter(r => r.contractStatus === 'Signed')
    .reduce((sum, r) => sum + parseAmountToNumber(r.invoiceAmount), 0);
}

function getHistoryDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "profitLossHistory");
}

let historyList = [];
let historyVersion = 0;
let liveRevenue = 0;
let liveCosts = 0;

async function loadHistory() {
  const data = await fetchAgencyDoc('profitLossHistory');
  historyList = (data && Array.isArray(data.list)) ? data.list : [];
  historyVersion = (data && data.version) || 0;
}

async function computeLiveMonth() {
  const [invoiceData, subscriptionData, expenseData] = await Promise.all([
    fetchAgencyDoc('contractInvoices'),
    fetchAgencyDoc('subscriptionTracker'),
    fetchAgencyDoc('expenseTracker'),
  ]);
  liveRevenue = revenueActiveBilling(invoiceData);
  liveCosts = subscriptionMonthlyTotal(subscriptionData) + expenseRecurringMonthlyTotal(expenseData) + expenseOneOffThisMonthTotal(expenseData);
}

function marginPct(revenue, costs) {
  if (revenue <= 0) return 0;
  return ((revenue - costs) / revenue) * 100;
}

function renderSummary() {
  const net = liveRevenue - liveCosts;
  const margin = marginPct(liveRevenue, liveCosts);
  el('summaryRevenue').textContent = formatCurrency(liveRevenue);
  el('summaryCosts').textContent = formatCurrency(liveCosts);
  el('summaryNet').textContent = formatCurrency(net);
  el('summaryNet').style.color = net < 0 ? 'var(--color-error, #f68d5f)' : '';
  el('summaryMargin').textContent = margin.toFixed(1) + '%';
  el('summaryMargin').style.color = margin < 0 ? 'var(--color-error, #f68d5f)' : '';

  const key = currentMonthKey();
  el('recordMonthLabel').textContent = monthKeyToLabel(key);
  const existing = historyList.find(m => m.month === key);
  el('recordStatusNote').textContent = existing
    ? `Recorded for ${monthKeyToLabel(key)} - click "Record ${monthKeyToLabel(key)}" again to update with today's numbers.`
    : `Not recorded yet for ${monthKeyToLabel(key)}.`;
}

function renderTrendChart() {
  const chart = el('trendChart');
  const sorted = [...historyList].sort((a, b) => a.month.localeCompare(b.month));
  if (sorted.length === 0) {
    chart.innerHTML = '';
    el('trendEmptyState').style.display = 'block';
    return;
  }
  el('trendEmptyState').style.display = 'none';

  const maxVal = Math.max(1, ...sorted.map(m => Math.max(m.revenue, m.costs)));
  chart.innerHTML = sorted.map(m => {
    const revH = Math.max(2, Math.round((m.revenue / maxVal) * 140));
    const costH = Math.max(2, Math.round((m.costs / maxVal) * 140));
    const margin = marginPct(m.revenue, m.costs);
    return `
      <div class="trend-month-col" title="${monthKeyToLabel(m.month)}: ${formatCurrency(m.revenue)} revenue, ${formatCurrency(m.costs)} costs">
        <div class="trend-bars">
          <div class="trend-bar revenue-bar" style="height:${revH}px;"></div>
          <div class="trend-bar cost-bar" style="height:${costH}px;"></div>
        </div>
        <span class="trend-margin-label" style="color:${margin < 0 ? '#ef4444' : '#22c55e'};">${margin.toFixed(0)}%</span>
        <span class="trend-month-label">${m.month.slice(5)}/${m.month.slice(2, 4)}</span>
      </div>`;
  }).join('');
}

function renderHistoryTable() {
  const sorted = [...historyList].sort((a, b) => b.month.localeCompare(a.month));
  const body = el('historyTableBody');
  body.innerHTML = sorted.map((m, idx) => {
    const net = m.revenue - m.costs;
    const margin = marginPct(m.revenue, m.costs);
    // "vs prior month" compares against the month immediately before this
    // one chronologically, not just the next row - sorted descending here
    // for display, so look the prior month up by key rather than by index.
    const priorKey = previousMonthKey(m.month);
    const prior = historyList.find(h => h.month === priorKey);
    let changeHtml = '<span class="change-flat">—</span>';
    if (prior) {
      const priorNet = prior.revenue - prior.costs;
      const diff = net - priorNet;
      if (Math.abs(diff) < 1) changeHtml = '<span class="change-flat">flat</span>';
      else if (diff > 0) changeHtml = `<span class="change-up">+${formatCurrency(diff)}</span>`;
      else changeHtml = `<span class="change-down">${formatCurrency(diff)}</span>`;
    }
    return `<tr>
      <td class="month-cell">${monthKeyToLabel(m.month)}</td>
      <td>${formatCurrency(m.revenue)}</td>
      <td>${formatCurrency(m.costs)}</td>
      <td style="color:${net < 0 ? '#ef4444' : ''};">${formatCurrency(net)}</td>
      <td style="color:${margin < 0 ? '#ef4444' : ''};">${margin.toFixed(1)}%</td>
      <td>${changeHtml}</td>
      <td class="row-actions"><button class="remove-month-btn" data-month="${m.month}">Remove</button></td>
    </tr>`;
  }).join('');

  document.querySelectorAll('.remove-month-btn').forEach(btn => {
    btn.addEventListener('click', () => removeMonth(btn.getAttribute('data-month')));
  });
}

function previousMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 2, 1); // m is 1-indexed; m-2 goes back one month from (m-1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function saveHistory(newList) {
  if (!isEmbedded || !window.parent.saveVersionedAgencyDoc) return false;
  const result = await window.parent.saveVersionedAgencyDoc({
    docRef: getHistoryDocRef(),
    currentVersion: historyVersion,
    buildPayload: (v) => ({ list: newList, version: v }),
  });
  if (!result.ok) {
    if (result.reason === 'error') console.error("Couldn't save P&L history:", result.error);
    if (window.parent.showBanner) {
      window.parent.showBanner('error', result.reason === 'conflict'
        ? "Someone else updated this while you had it open. Reload the page to see their changes, then redo your edit."
        : "Couldn't save — your change may be lost: " + result.error.message);
    }
    return false;
  }
  historyVersion = result.version;
  historyList = newList;
  return true;
}

async function recordThisMonth() {
  const key = currentMonthKey();
  const entry = { month: key, revenue: liveRevenue, costs: liveCosts, recordedAt: new Date().toISOString() };
  const newList = historyList.filter(m => m.month !== key).concat([entry]);
  const ok = await saveHistory(newList);
  if (ok) {
    renderSummary();
    renderTrendChart();
    renderHistoryTable();
    if (window.parent.showBanner) window.parent.showBanner('success', `Recorded ${monthKeyToLabel(key)}.`);
  }
}

async function removeMonth(key) {
  if (!confirm(`Remove the recorded snapshot for ${monthKeyToLabel(key)}? This can't be undone.`)) return;
  const newList = historyList.filter(m => m.month !== key);
  const ok = await saveHistory(newList);
  if (ok) {
    renderSummary();
    renderTrendChart();
    renderHistoryTable();
  }
}

// Same admin/leadership-only whole-page gate as Cash Flow Snapshot /
// Expense Tracker / Subscription Tracker, since this is financial info.
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

    el('trackerContent').style.display = isRestricted ? 'none' : '';
    el('notAuthorizedState').style.display = isRestricted ? '' : 'none';
  }, (err) => {
    console.error("Access gate listener error:", err);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initAccessGate();
  try {
    await Promise.all([loadHistory(), computeLiveMonth()]);
    renderSummary();
    renderTrendChart();
    renderHistoryTable();
  } catch (e) {
    console.error("Couldn't build the P&L view:", e);
  }
  el('recordMonthBtn').addEventListener('click', recordThisMonth);
});
