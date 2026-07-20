/* ============================================================
   CONTRACT & INVOICE STATUS TRACKER — APP LOGIC
   (cross-client: reads/writes every client's `contractInvoice` record)
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
const CONTRACT_STATUSES = ['Not Sent', 'Sent', 'Signed'];
const INVOICE_STATUSES = ['Not Sent', 'Sent', 'Paid', 'Overdue'];

function el(id) { return document.getElementById(id); }

function getClients() {
  if (isEmbedded) {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  try {
    const saved = localStorage.getItem('contract-invoice-tracker-clients');
    return saved ? JSON.parse(saved) : {};
  } catch (e) { return {}; }
}

function persist() {
  if (isEmbedded) {
    window.parent.saveDatabase();
  } else {
    try { localStorage.setItem('contract-invoice-tracker-clients', JSON.stringify(getClients())); } catch (e) {}
  }
}

function toDateOnly(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function todayStr() {
  return toDateOnly(new Date()).toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStrVal) {
  const from = toDateOnly(fromStr);
  const to = toDateOnly(toStrVal);
  return Math.round((to - from) / 86400000);
}

// Sweep every tracked client and flip a stale "Sent" invoice to
// "Overdue" once its due date has passed, so the status reflects
// reality without anyone having to notice and update it by hand.
function reconcileOverdueInvoices(clients) {
  let changed = false;
  Object.keys(clients).forEach(name => {
    const ci = clients[name].contractInvoice;
    if (!ci || ci.invoiceStatus !== 'Sent' || !ci.invoiceDueDate) return;
    if (daysBetween(ci.invoiceDueDate, todayStr()) >= 1) {
      ci.invoiceStatus = 'Overdue';
      changed = true;
    }
  });
  return changed;
}

function getUrgency(ci) {
  const settled = ci.contractStatus === 'Signed' && (ci.invoiceStatus === 'Paid' || ci.invoiceStatus === 'Not Sent');
  if (settled) return 'closed';
  if (ci.invoiceStatus === 'Overdue') return 'red';
  if (ci.invoiceStatus === 'Sent' && ci.invoiceDueDate && daysBetween(todayStr(), ci.invoiceDueDate) <= 7) return 'yellow';
  if (ci.contractStatus === 'Sent') return 'yellow';
  return 'green';
}

function populateClientSelect() {
  const clients = getClients();
  const select = el('newClientSelect');
  select.innerHTML = '<option value="">Select a client to track...</option>';
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    if (clients[name].contractInvoice) return; // already being tracked
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

function renderSummary(rows) {
  const awaitingSignature = rows.filter(r => r.ci.contractStatus === 'Sent');
  const dueSoon = rows.filter(r => r.ci.invoiceStatus === 'Sent' && r.ci.invoiceDueDate && daysBetween(todayStr(), r.ci.invoiceDueDate) <= 7 && daysBetween(todayStr(), r.ci.invoiceDueDate) >= 0);
  const overdue = rows.filter(r => r.ci.invoiceStatus === 'Overdue');

  el('summaryAwaitingSignature').textContent = awaitingSignature.length;
  el('summaryDueSoon').textContent = dueSoon.length;
  el('summaryOverdue').textContent = overdue.length;
}

function optionsHtml(list, selected) {
  return list.map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('');
}

function renderTable() {
  const clients = getClients();
  const changed = reconcileOverdueInvoices(clients);
  if (changed) persist();

  const showClosed = el('showClosedToggle').checked;

  const allRows = Object.keys(clients)
    .filter(name => clients[name].contractInvoice)
    .map(name => ({ name, ci: clients[name].contractInvoice }));

  renderSummary(allRows);

  const rows = allRows
    .filter(r => showClosed || getUrgency(r.ci) !== 'closed')
    .sort((a, b) => a.name.localeCompare(b.name));

  const tbody = el('trackerTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(row => {
    const { name, ci } = row;
    const urgency = getUrgency(ci);
    const tr = document.createElement('tr');
    tr.className = 'urgency-' + urgency;

    tr.innerHTML = `
      <td class="client-cell">${name}</td>
      <td><select class="contract-select" data-client="${name}">${optionsHtml(CONTRACT_STATUSES, ci.contractStatus)}</select></td>
      <td class="date-cell">${ci.contractSentDate || '--'}</td>
      <td class="date-cell">${ci.contractSignedDate || '--'}</td>
      <td><select class="invoice-select" data-client="${name}">${optionsHtml(INVOICE_STATUSES, ci.invoiceStatus)}</select></td>
      <td><input type="date" class="due-date-input" data-client="${name}" value="${ci.invoiceDueDate || ''}"></td>
      <td class="date-cell">${ci.invoicePaidDate || '--'}</td>
      <td><input type="text" class="notes-input" data-client="${name}" value="${(ci.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="reset-btn" data-client="${name}">Reset for New Cycle</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  wireRowListeners();
}

function wireRowListeners() {
  document.querySelectorAll('.contract-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const clients = getClients();
      const ci = clients[sel.getAttribute('data-client')].contractInvoice;
      ci.contractStatus = sel.value;
      if (sel.value === 'Sent' && !ci.contractSentDate) ci.contractSentDate = todayStr();
      if (sel.value === 'Signed' && !ci.contractSignedDate) ci.contractSignedDate = todayStr();
      if (sel.value === 'Not Sent') { ci.contractSentDate = ''; ci.contractSignedDate = ''; }
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.invoice-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const clients = getClients();
      const ci = clients[sel.getAttribute('data-client')].contractInvoice;
      ci.invoiceStatus = sel.value;
      if (sel.value === 'Sent' && !ci.invoiceSentDate) ci.invoiceSentDate = todayStr();
      if (sel.value === 'Paid') ci.invoicePaidDate = todayStr();
      if (sel.value === 'Not Sent') { ci.invoiceSentDate = ''; ci.invoiceDueDate = ''; ci.invoicePaidDate = ''; }
      persist();
      renderTable();

      if (isEmbedded && window.parent.showBanner && sel.value === 'Paid') {
        window.parent.showBanner('success', `Invoice marked paid for ${sel.getAttribute('data-client')}.`);
      }
    });
  });

  document.querySelectorAll('.due-date-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const clients = getClients();
      const ci = clients[inp.getAttribute('data-client')].contractInvoice;
      ci.invoiceDueDate = inp.value;
      // Setting a due date implicitly means the invoice has gone out.
      if (inp.value && ci.invoiceStatus === 'Not Sent') {
        ci.invoiceStatus = 'Sent';
        ci.invoiceSentDate = ci.invoiceSentDate || todayStr();
      }
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.notes-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const clients = getClients();
      clients[inp.getAttribute('data-client')].contractInvoice.notes = inp.value;
      persist();
    });
  });

  document.querySelectorAll('.reset-btn').forEach(btn => {
    btn.addEventListener('click', () => resetCycle(btn.getAttribute('data-client')));
  });
}

function resetCycle(clientName) {
  const clients = getClients();
  if (!clients[clientName]) return;
  const notes = clients[clientName].contractInvoice ? clients[clientName].contractInvoice.notes : '';
  clients[clientName].contractInvoice = {
    contractStatus: 'Not Sent',
    contractSentDate: '',
    contractSignedDate: '',
    invoiceStatus: 'Not Sent',
    invoiceSentDate: '',
    invoiceDueDate: '',
    invoicePaidDate: '',
    notes: notes || ''
  };
  persist();
  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Reset contract/invoice cycle for ${clientName}.`);
  }
}

function addTrackedClient() {
  const select = el('newClientSelect');
  const clientName = select.value;
  if (!clientName) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Choose a client first.');
    return;
  }

  const clients = getClients();
  if (!clients[clientName]) return;

  clients[clientName].contractInvoice = {
    contractStatus: 'Not Sent',
    contractSentDate: '',
    contractSignedDate: '',
    invoiceStatus: 'Not Sent',
    invoiceSentDate: '',
    invoiceDueDate: '',
    invoicePaidDate: '',
    notes: ''
  };

  persist();
  select.value = '';
  populateClientSelect();
  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Now tracking contract & invoice status for ${clientName}.`);
  }
}

function initListeners() {
  el('addTrackedClientBtn').addEventListener('click', addTrackedClient);
  el('showClosedToggle').addEventListener('change', renderTable);
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  renderTable();
  initListeners();

  // This iframe can finish loading before the parent Hub's clientsDb
  // has synced from Firestore, in which case getClients() returns {}
  // and the "select a client" dropdown is stuck empty forever - it
  // only ever populates once, right here. Poll briefly and re-populate
  // once real data shows up.
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    if (Object.keys(getClients()).length > 0) {
      populateClientSelect();
      renderTable();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
