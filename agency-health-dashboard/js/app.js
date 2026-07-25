/* ============================================================
   AGENCY HEALTH DASHBOARD — APP LOGIC
   Read-only cross-client view. Pulls from three places that already
   exist rather than duplicating any data:
     - client.weeklyCheckins[0] (clientsDb, via getAllClients()) for
       Health rating + last check-in date - same data the per-client
       Dashboard's "Client Health" card already reads.
     - agency/contractInvoiceLog for contractRenewalDate per client.
     - agency/revisionFeedbackLog for open (unresolved) revision counts
       per client.
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

let contractRecords = [];
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

function listenToContractLog() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot) return;
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "contractInvoiceLog");
  window.parent.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap && docSnap.exists ? docSnap.data() : null;
    contractRecords = (data && data.list) || [];
    renderTable();
  }, (err) => console.error("Contract log listener error:", err));
}

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

    const contract = contractRecords.find(r => (r.clientName || '').toLowerCase() === name.toLowerCase());
    const renewalDate = (contract && contract.contractStatus === 'Signed') ? contract.contractRenewalDate : null;
    const renewalDays = renewalDate ? daysBetween(todayStr(), renewalDate) : null;
    const renewalDueSoon = renewalDays !== null && renewalDays <= 30;

    const openRevisions = revisionRecords.filter(r =>
      (r.clientName || '').toLowerCase() === name.toLowerCase() && !r.dateResolved
    ).length;
    const heavyRevisions = openRevisions >= 3;

    const needsAttention = healthRating === 'Red' || renewalDueSoon || heavyRevisions;

    return {
      name, healthRating, lastCheckinDate, daysSinceCheckin, staleCheckin,
      renewalDate, renewalDays, renewalDueSoon, openRevisions, heavyRevisions, needsAttention
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function healthBadgeHtml(rating) {
  const map = { Green: 'health-green', Yellow: 'health-yellow', Red: 'health-red' };
  const cls = map[rating] || 'health-none';
  const label = rating || 'No check-in';
  return `<span class="health-badge ${cls}"><span class="dot"></span>${label}</span>`;
}

function renewalCellHtml(row) {
  if (!row.renewalDate) return '<span class="date-cell">—</span>';
  const label = row.renewalDays < 0
    ? `${Math.abs(row.renewalDays)}d overdue`
    : row.renewalDays === 0 ? 'Today' : `in ${row.renewalDays}d`;
  return `<span class="date-cell">${row.renewalDate} (${label})</span>`;
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

  el('summaryRedHealth').textContent = rows.filter(r => r.healthRating === 'Red').length;
  el('summaryNoCheckin').textContent = rows.filter(r => r.staleCheckin).length;
  el('summaryRenewalsDue').textContent = rows.filter(r => r.renewalDueSoon).length;
  el('summaryOpenRevisions').textContent = rows.filter(r => r.heavyRevisions).length;

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
      <td><span class="section-tag ${row.needsAttention ? 'status-attention' : 'status-ok'}">${row.needsAttention ? 'Needs Attention' : 'On Track'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  el('filterClientInput').addEventListener('input', renderTable);
  el('showAttentionOnlyToggle').addEventListener('change', renderTable);

  listenToContractLog();
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
