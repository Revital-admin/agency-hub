/* ============================================================
   CLIENT RENEWAL TRACKER — APP LOGIC
   (cross-client: reads/writes every client's `renewal` record)
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
const STATUS_OPTIONS = ['On Track', 'At Risk', 'Renewed', 'Churned'];

function el(id) { return document.getElementById(id); }

function getClients() {
  if (isEmbedded) {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  try {
    const saved = localStorage.getItem('renewal-tracker-clients');
    return saved ? JSON.parse(saved) : {};
  } catch (e) { return {}; }
}

function persist() {
  if (isEmbedded) {
    window.parent.saveDatabase();
  } else {
    try { localStorage.setItem('renewal-tracker-clients', JSON.stringify(getClients())); } catch (e) {}
  }
}

function toDateOnly(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addMonths(dateStr, months) {
  const dt = toDateOnly(dateStr);
  dt.setMonth(dt.getMonth() + Number(months || 12));
  return dt.toISOString().slice(0, 10);
}

function todayStr() {
  return toDateOnly(new Date()).toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStrVal) {
  const from = toDateOnly(fromStr);
  const to = toDateOnly(toStrVal);
  return Math.round((to - from) / 86400000);
}

function getUrgency(r) {
  if (r.status === 'Renewed' || r.status === 'Churned') return 'closed';
  const daysUntil = daysBetween(todayStr(), r.renewalDate);
  if (r.status === 'At Risk' || daysUntil <= 7) return 'red';
  if (daysUntil <= 30) return 'yellow';
  return 'green';
}

function populateClientSelect() {
  const clients = getClients();
  const select = el('newClientSelect');
  select.innerHTML = '<option value="">Select a client to track...</option>';
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    const r = clients[name].renewal;
    if (r && (r.status === 'On Track' || r.status === 'At Risk')) return; // already being tracked
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

function renderSummary(rows) {
  const tracked = rows.filter(r => r.rec.status === 'On Track' || r.rec.status === 'At Risk');
  const within30 = tracked.filter(r => daysBetween(todayStr(), r.rec.renewalDate) <= 30);
  const within7 = tracked.filter(r => daysBetween(todayStr(), r.rec.renewalDate) <= 7);

  el('summaryTracked').textContent = tracked.length;
  el('summary30').textContent = within30.length;
  el('summary7').textContent = within7.length;
}

function statusOptionsHtml(selected) {
  return STATUS_OPTIONS.map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('');
}

function renderTable() {
  const clients = getClients();
  const showClosed = el('showClosedToggle').checked;

  const allRows = Object.keys(clients)
    .filter(name => clients[name].renewal)
    .map(name => ({ name, rec: clients[name].renewal }));

  renderSummary(allRows);

  const rows = allRows
    .filter(r => showClosed || (r.rec.status === 'On Track' || r.rec.status === 'At Risk'))
    .sort((a, b) => (a.rec.renewalDate || '9999').localeCompare(b.rec.renewalDate || '9999'));

  const tbody = el('trackerTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(row => {
    const { name, rec } = row;
    const daysUntil = daysBetween(todayStr(), rec.renewalDate);
    const urgency = getUrgency(rec);
    const tr = document.createElement('tr');
    tr.className = 'urgency-' + urgency;

    const isOpen = rec.status === 'On Track' || rec.status === 'At Risk';

    tr.innerHTML = `
      <td class="client-cell">${name}</td>
      <td class="date-cell">${rec.renewalDate || '--'}</td>
      <td class="date-cell">${isOpen ? (daysUntil >= 0 ? daysUntil + 'd' : Math.abs(daysUntil) + 'd overdue') : '--'}</td>
      <td class="date-cell">${rec.contractLengthMonths || 12} mo</td>
      <td><select class="status-select" data-client="${name}">${statusOptionsHtml(rec.status)}</select></td>
      <td><input type="text" class="notes-input" data-client="${name}" value="${(rec.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="renewed-btn" data-client="${name}" ${!isOpen ? 'disabled' : ''}>Mark Renewed</button>
          <button class="churned-btn" data-client="${name}" ${!isOpen ? 'disabled' : ''}>Mark Churned</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  wireRowListeners();
}

function wireRowListeners() {
  document.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const clients = getClients();
      const rec = clients[sel.getAttribute('data-client')].renewal;
      rec.status = sel.value;
      persist();
      renderTable();
      populateClientSelect();
    });
  });

  document.querySelectorAll('.notes-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const clients = getClients();
      clients[inp.getAttribute('data-client')].renewal.notes = inp.value;
      persist();
    });
  });

  document.querySelectorAll('.renewed-btn').forEach(btn => {
    btn.addEventListener('click', () => markRenewed(btn.getAttribute('data-client')));
  });
  document.querySelectorAll('.churned-btn').forEach(btn => {
    btn.addEventListener('click', () => markChurned(btn.getAttribute('data-client')));
  });
}

function markRenewed(clientName) {
  const clients = getClients();
  const rec = clients[clientName].renewal;
  if (!rec) return;

  // Advance the renewal date forward by the contract length instead of
  // just flipping a flag, so the tracker is already set up for the next
  // cycle without anyone having to remember to re-add it.
  rec.renewalDate = addMonths(rec.renewalDate, rec.contractLengthMonths || 12);
  rec.status = 'On Track';
  rec.lastRenewedDate = todayStr();

  persist();
  renderTable();
  populateClientSelect();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `${clientName} renewed — next renewal set to ${rec.renewalDate}.`);
  }
}

function markChurned(clientName) {
  const clients = getClients();
  const rec = clients[clientName].renewal;
  if (!rec) return;
  rec.status = 'Churned';
  persist();
  renderTable();
  populateClientSelect();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Marked ${clientName} as churned.`);
  }
}

function addTrackedRenewal() {
  const select = el('newClientSelect');
  const dateInput = el('newRenewalDate');
  const lengthInput = el('newContractLength');
  const clientName = select.value;
  if (!clientName) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Choose a client first.');
    return;
  }
  if (!dateInput.value) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Set a renewal date first.');
    return;
  }

  const clients = getClients();
  if (!clients[clientName]) return;

  clients[clientName].renewal = {
    status: 'On Track',
    renewalDate: dateInput.value,
    contractLengthMonths: Number(lengthInput.value) || 12,
    lastRenewedDate: '',
    notes: ''
  };

  persist();
  select.value = '';
  dateInput.value = '';
  lengthInput.value = '12';
  populateClientSelect();
  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Now tracking renewal for ${clientName}.`);
  }
}

function initListeners() {
  el('addTrackedRenewalBtn').addEventListener('click', addTrackedRenewal);
  el('showClosedToggle').addEventListener('change', renderTable);
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  renderTable();
  initListeners();
});
