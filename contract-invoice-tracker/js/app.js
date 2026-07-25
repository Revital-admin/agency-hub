/* ============================================================
   CONTRACT & INVOICE STATUS TRACKER — APP LOGIC
   (standalone: clients tracked here are NOT clientsDb entries - a
   contract often goes out before someone is a fully onboarded client,
   so this keeps its own list at agency/contractInvoices rather than
   forcing you to create a full Client Workspace just to track a
   contract/invoice. Existing client names still show up as
   autocomplete suggestions.)
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const SANDBOX_NAME = "Quick Sandbox (One-Offs)";

let records = [];
let docVersion = 0; // optimistic-concurrency guard, see persist() below

const CONTRACT_STATUSES = ['Not Sent', 'Sent', 'Signed'];
const INVOICE_STATUSES = ['Not Sent', 'Sent', 'Paid', 'Overdue'];

function el(id) { return document.getElementById(id); }

function getRecordsDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "contractInvoices");
}

async function loadRecords() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getRecordsDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      records = (data && data.list) || [];
      docVersion = (data && data.version) || 0;
      return;
    } catch (e) {
      console.error("Couldn't load contract/invoice records from the cloud:", e);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', "Couldn't load from the cloud: " + e.message);
      }
      records = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('contract-invoice-tracker-list');
    records = saved ? JSON.parse(saved) : [];
  } catch (e) { records = []; }
}

// Optimistic-concurrency guard: this saves by overwriting the whole doc
// on every edit, so re-check the version right before writing and
// refuse to clobber a newer save made elsewhere in the meantime.
async function persist() {
  if (isEmbedded && window.parent.firebaseSetDoc && window.parent.firebaseGetDoc) {
    try {
      const ref = getRecordsDocRef();
      const freshSnap = await window.parent.firebaseGetDoc(ref);
      const freshData = freshSnap && freshSnap.exists ? freshSnap.data() : null;
      const freshVersion = (freshData && freshData.version) || 0;

      if (freshVersion !== docVersion) {
        if (window.parent.showBanner) {
          window.parent.showBanner('error', "Someone else updated this list while you had it open. Reload the page to see their changes, then redo your edit.");
        }
        return false;
      }

      docVersion = freshVersion + 1;
      // A plain object literal built in this iframe's own JS realm gets
      // rejected by Firestore ("a custom Object object") when handed
      // straight to a Firestore call bound to the parent page - pass a
      // JSON string instead so the parent parses it in its own realm.
      await window.parent.firebaseSetDocFromJSON(ref, JSON.stringify({ list: records, version: docVersion }));
      return true;
    } catch (e) {
      console.error("Couldn't save contract/invoice records to the cloud:", e);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', "Couldn't save — your change may be lost on reload: " + e.message);
      }
      return false;
    }
  }
  try {
    localStorage.setItem('contract-invoice-tracker-list', JSON.stringify(records));
  } catch (e) {}
  return true;
}

function uid() {
  return 'ci-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
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

// Sweep every record and flip a stale "Sent" invoice to "Overdue" once
// its due date has passed, so the status reflects reality without
// anyone having to notice and update it by hand.
function reconcileOverdueInvoices() {
  let changed = false;
  records.forEach(r => {
    if (r.invoiceStatus !== 'Sent' || !r.invoiceDueDate) return;
    if (daysBetween(r.invoiceDueDate, todayStr()) >= 1) {
      r.invoiceStatus = 'Overdue';
      changed = true;
    }
  });
  return changed;
}

function getUrgency(r) {
  // Renewal urgency takes priority over the "settled/closed" shortcut
  // below - a signed, fully-paid contract that's about to expire still
  // needs to surface, not get hidden with the fully-settled rows.
  const renewalDays = (r.contractStatus === 'Signed' && r.contractRenewalDate) ? daysBetween(todayStr(), r.contractRenewalDate) : null;
  const renewalOverdue = renewalDays !== null && renewalDays <= 0;
  const renewalSoon = renewalDays !== null && renewalDays > 0 && renewalDays <= 30;

  if (renewalOverdue || r.invoiceStatus === 'Overdue') return 'red';
  if (renewalSoon) return 'yellow';
  if (r.invoiceStatus === 'Sent' && r.invoiceDueDate && daysBetween(todayStr(), r.invoiceDueDate) <= 7) return 'yellow';
  if (r.contractStatus === 'Sent') return 'yellow';

  const settled = r.contractStatus === 'Signed' && (r.invoiceStatus === 'Paid' || r.invoiceStatus === 'Not Sent');
  if (settled) return 'closed';
  return 'green';
}

function populateClientDatalist() {
  const list = el('trackerClientOptions');
  if (!list) return;
  list.innerHTML = '';
  if (!isEmbedded || typeof window.parent.getAllClients !== 'function') return;
  let clients = {};
  try { clients = window.parent.getAllClients() || {}; } catch (e) { clients = {}; }
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    const opt = document.createElement('option');
    opt.value = name;
    list.appendChild(opt);
  });
}

function renderSummary() {
  const awaitingSignature = records.filter(r => r.contractStatus === 'Sent');
  const renewalsDue = records.filter(r => {
    if (r.contractStatus !== 'Signed' || !r.contractRenewalDate) return false;
    const d = daysBetween(todayStr(), r.contractRenewalDate);
    return d <= 30;
  });
  const dueSoon = records.filter(r => r.invoiceStatus === 'Sent' && r.invoiceDueDate && daysBetween(todayStr(), r.invoiceDueDate) <= 7 && daysBetween(todayStr(), r.invoiceDueDate) >= 0);
  const overdue = records.filter(r => r.invoiceStatus === 'Overdue');

  el('summaryAwaitingSignature').textContent = awaitingSignature.length;
  el('summaryRenewalsDue').textContent = renewalsDue.length;
  el('summaryDueSoon').textContent = dueSoon.length;
  el('summaryOverdue').textContent = overdue.length;
}

function optionsHtml(list, selected) {
  return list.map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('');
}

function findRecord(id) {
  return records.find(r => r.id === id);
}

function renderTable() {
  const changed = reconcileOverdueInvoices();
  if (changed) persist();

  renderSummary();

  const showClosed = el('showClosedToggle').checked;

  const rows = [...records]
    .filter(r => showClosed || getUrgency(r) !== 'closed')
    .sort((a, b) => a.clientName.localeCompare(b.clientName));

  const tbody = el('trackerTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(r => {
    const urgency = getUrgency(r);
    const tr = document.createElement('tr');
    tr.className = 'urgency-' + urgency;

    tr.innerHTML = `
      <td class="client-cell">${r.clientName}</td>
      <td><select class="contract-select" data-id="${r.id}">${optionsHtml(CONTRACT_STATUSES, r.contractStatus)}</select></td>
      <td class="date-cell">${r.contractSentDate || '--'}</td>
      <td class="date-cell">${r.contractSignedDate || '--'}</td>
      <td><input type="date" class="renewal-date-input" data-id="${r.id}" value="${r.contractRenewalDate || ''}"></td>
      <td><select class="invoice-select" data-id="${r.id}">${optionsHtml(INVOICE_STATUSES, r.invoiceStatus)}</select></td>
      <td><input type="date" class="due-date-input" data-id="${r.id}" value="${r.invoiceDueDate || ''}"></td>
      <td class="date-cell">${r.invoicePaidDate || '--'}</td>
      <td><input type="text" class="notes-input" data-id="${r.id}" value="${(r.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="reset-btn" data-id="${r.id}">Reset for New Cycle</button>
          <button class="delete-btn" data-id="${r.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  wireRowListeners();
}

function wireRowListeners() {
  document.querySelectorAll('.contract-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const r = findRecord(sel.getAttribute('data-id'));
      if (!r) return;
      r.contractStatus = sel.value;
      if (sel.value === 'Sent' && !r.contractSentDate) r.contractSentDate = todayStr();
      if (sel.value === 'Signed' && !r.contractSignedDate) r.contractSignedDate = todayStr();
      if (sel.value === 'Not Sent') { r.contractSentDate = ''; r.contractSignedDate = ''; }
      await persist();
      renderTable();
    });
  });

  document.querySelectorAll('.invoice-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const r = findRecord(sel.getAttribute('data-id'));
      if (!r) return;
      r.invoiceStatus = sel.value;
      if (sel.value === 'Sent' && !r.invoiceSentDate) r.invoiceSentDate = todayStr();
      if (sel.value === 'Paid') r.invoicePaidDate = todayStr();
      if (sel.value === 'Not Sent') { r.invoiceSentDate = ''; r.invoiceDueDate = ''; r.invoicePaidDate = ''; }
      await persist();
      renderTable();

      if (isEmbedded && window.parent.showBanner && sel.value === 'Paid') {
        window.parent.showBanner('success', `Invoice marked paid for ${r.clientName}.`);
      }
    });
  });

  document.querySelectorAll('.renewal-date-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const r = findRecord(inp.getAttribute('data-id'));
      if (!r) return;
      r.contractRenewalDate = inp.value;
      await persist();
      renderTable();
    });
  });

  document.querySelectorAll('.due-date-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const r = findRecord(inp.getAttribute('data-id'));
      if (!r) return;
      r.invoiceDueDate = inp.value;
      if (inp.value && r.invoiceStatus === 'Not Sent') {
        r.invoiceStatus = 'Sent';
        r.invoiceSentDate = r.invoiceSentDate || todayStr();
      }
      await persist();
      renderTable();
    });
  });

  document.querySelectorAll('.notes-input').forEach(inp => {
    inp.addEventListener('input', async () => {
      const r = findRecord(inp.getAttribute('data-id'));
      if (!r) return;
      r.notes = inp.value;
      await persist();
    });
  });

  document.querySelectorAll('.reset-btn').forEach(btn => {
    btn.addEventListener('click', () => resetCycle(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteRecord(btn.getAttribute('data-id')));
  });
}

async function resetCycle(id) {
  const r = findRecord(id);
  if (!r) return;
  r.contractStatus = 'Not Sent';
  r.contractSentDate = '';
  r.contractSignedDate = '';
  r.contractRenewalDate = '';
  r.invoiceStatus = 'Not Sent';
  r.invoiceSentDate = '';
  r.invoiceDueDate = '';
  r.invoicePaidDate = '';
  const ok = await persist();
  renderTable();

  if (ok && isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Reset contract/invoice cycle for ${r.clientName}.`);
  }
}

async function deleteRecord(id) {
  const r = findRecord(id);
  if (!confirm(`Stop tracking ${r ? r.clientName : 'this client'}? This can't be undone.`)) return;
  const previous = records;
  records = records.filter(rec => rec.id !== id);
  const ok = await persist();
  if (!ok) {
    records = previous;
  }
  renderTable();
}

async function addTrackedClient() {
  const nameInput = el('newClientName');
  const clientName = nameInput.value.trim();
  if (!clientName) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Enter a client or company name first.');
    return;
  }
  if (records.some(r => r.clientName.toLowerCase() === clientName.toLowerCase())) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', `${clientName} is already being tracked.`);
    return;
  }

  records.push({
    id: uid(),
    clientName,
    contractStatus: 'Not Sent',
    contractSentDate: '',
    contractSignedDate: '',
    contractRenewalDate: '',
    invoiceStatus: 'Not Sent',
    invoiceSentDate: '',
    invoiceDueDate: '',
    invoicePaidDate: '',
    notes: ''
  });

  const ok = await persist();
  if (!ok) {
    records.pop();
    renderTable();
    return;
  }

  nameInput.value = '';
  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Now tracking contract & invoice status for ${clientName}.`);
  }
}

function initListeners() {
  el('addTrackedClientBtn').addEventListener('click', addTrackedClient);
  el('showClosedToggle').addEventListener('change', renderTable);
}

document.addEventListener('DOMContentLoaded', async () => {
  populateClientDatalist();
  await loadRecords();
  renderTable();
  initListeners();

  // Same as the other trackers: the client-name autocomplete list is a
  // nice-to-have, not a blocker - but still worth backfilling once the
  // parent's client data actually syncs in, in case this iframe loaded
  // first.
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    let clientCount = 0;
    try { clientCount = isEmbedded ? Object.keys(window.parent.getAllClients() || {}).length : 0; } catch (e) {}
    if (clientCount > 0) {
      populateClientDatalist();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
