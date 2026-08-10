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

// Same partial gate as Team Roster/SOP Wiki/Email Template Library:
// everyone can still view the library and send contracts, but only
// unrestricted users (no entry in agency/teamAccess) see the
// Add/Replace/Delete/Review controls - previously this whole window had
// no permission check at all, so anyone who could open this tab could
// replace or delete any of the 6 shared contract templates.
let isRestrictedUser = false;
function applyContractLibraryEditPermission() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot) return;
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamAccess");
  window.parent.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap && docSnap.exists ? docSnap.data() : null;
    const users = (data && data.users) ? data.users : {};
    const currentEmail = (window.parent.currentAdminEmail || "").toLowerCase();
    isRestrictedUser = !!(currentEmail && Object.prototype.hasOwnProperty.call(users, currentEmail));

    const addForm = el('contractLibraryAddForm');
    if (addForm) addForm.style.display = isRestrictedUser ? 'none' : '';
    renderContractLibrary();
  }, (err) => {
    console.error("Edit-permission listener error:", err);
  });
}

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
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getRecordsDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: records, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save contract/invoice records to the cloud:", result.error);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', result.reason === 'conflict'
          ? "Someone else updated this list while you had it open. Reload the page to see their changes, then redo your edit."
          : "Couldn't save — your change may be lost on reload: " + result.error.message);
      }
      return false;
    }
    docVersion = result.version;
    // agency/contractInvoices lives outside clientsDb (see header
    // comment), so saving here never goes through the parent's own
    // saveDatabase() - which is what actually pushes fresh
    // billingSummary data out to each client's public portal doc (see
    // syncPublicPortalDocs and fetchBillingSummaries in the parent
    // Hub's app.js). Without this call, a client's Billing tab and
    // renewal banner would only pick up a status/date change here the
    // next time the admin happened to save something unrelated
    // elsewhere in the Hub - could be hours or days later.
    if (window.parent.saveDatabase) window.parent.saveDatabase();
    return true;
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

// ── Client name near-match warning ──
// QBR Generator, Agency Health Dashboard, and Client Portal Manager's
// billing visibility all match this tool's clientName field against a
// real Client Workspace name by exact (case-insensitive) string - there's
// no shared ID. A typo here doesn't error anywhere downstream, it just
// silently shows zero/blank data in those other tools. This is a
// lightweight "did you mean" check, not a hard block - typing a name
// that legitimately doesn't have a Workspace yet (a prospect) is the
// normal, expected case for this standalone tracker.
function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const row = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[n];
}

function findNearMatchClientName(typedName, realNames) {
  const typed = (typedName || '').trim().toLowerCase();
  if (!typed) return null;
  if (realNames.some(n => n.toLowerCase() === typed)) return null; // exact match - already correct
  let best = null, bestDist = Infinity;
  realNames.forEach(n => {
    const dist = levenshteinDistance(typed, n.toLowerCase());
    if (dist < bestDist) { bestDist = dist; best = n; }
  });
  if (!best) return null;
  // Allow more edit distance for longer names - "Acme Wellness Co" with
  // one typo shouldn't need a near-perfect match to trigger, but a short
  // name like "Nova" needs to be very close to avoid false positives
  // against every unrelated short prospect name.
  const threshold = Math.max(1, Math.floor(best.length * 0.25));
  return (bestDist > 0 && bestDist <= threshold) ? best : null;
}

function updateClientNameHint() {
  const hintEl = el('clientNameMatchHint');
  const nameInput = el('newClientName');
  if (!hintEl || !nameInput) return;
  if (!isEmbedded || typeof window.parent.getAllClients !== 'function') { hintEl.style.display = 'none'; return; }
  let clients = {};
  try { clients = window.parent.getAllClients() || {}; } catch (e) { clients = {}; }
  const realNames = Object.keys(clients).filter(n => n !== SANDBOX_NAME);
  const match = findNearMatchClientName(nameInput.value, realNames);
  if (match) {
    hintEl.textContent = `Did you mean "${match}"? Matching their Client Workspace name exactly keeps QBR Generator, Agency Health Dashboard, and their portal Billing tab linked to this client.`;
    hintEl.style.display = 'block';
  } else {
    hintEl.style.display = 'none';
  }
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

// invoiceAmount is a free-text field (placeholder "$0.00") - people type
// "$3,500", "3500", "3500.00", whatever - so this strips everything but
// digits/decimal/minus before parsing rather than trusting a clean number.
function parseAmountToNumber(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function formatCurrency(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
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

  // Dollar rollups, added alongside the existing counts above - there was
  // no aggregate revenue figure anywhere in the Hub before this (per-client
  // billing existed, nothing summed it up). "Active Billing" is a proxy
  // for MRR: every signed client's invoiceAmount, added together - not a
  // true MRR figure since nothing here enforces the invoice cycle is
  // monthly, but it's the best available signal from data that already
  // exists, not a new field to maintain.
  const activeBillingEl = el('summaryActiveBillingTotal');
  const overdueTotalEl = el('summaryOverdueTotal');
  const renewalsValueEl = el('summaryRenewalsDueTotal');
  if (activeBillingEl) {
    const activeBillingTotal = records
      .filter(r => r.contractStatus === 'Signed')
      .reduce((sum, r) => sum + parseAmountToNumber(r.invoiceAmount), 0);
    activeBillingEl.textContent = formatCurrency(activeBillingTotal);
  }
  if (overdueTotalEl) {
    const overdueTotal = overdue.reduce((sum, r) => sum + parseAmountToNumber(r.invoiceAmount), 0);
    overdueTotalEl.textContent = formatCurrency(overdueTotal);
  }
  if (renewalsValueEl) {
    const renewalsValue = renewalsDue.reduce((sum, r) => sum + parseAmountToNumber(r.invoiceAmount), 0);
    renewalsValueEl.textContent = formatCurrency(renewalsValue);
  }
}

function optionsHtml(list, selected) {
  return list.map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('');
}

function findRecord(id) {
  return records.find(r => r.id === id);
}

// ── Recurring Billing cell ──
// Real Stripe Billing (see /api/billing/create-subscription-checkout
// and /api/stripe/webhook in _worker.js), separate from the existing
// one-time invoiceAmount/invoiceStatus fields above - a client can be on
// a monthly subscription independent of whatever one-off invoice is
// also being tracked. Not set up yet -> small inline amount input +
// button. Once a checkout link exists but hasn't been paid -> "Link
// Sent" badge + copyable link. Once Stripe confirms a payment via
// webhook -> Active/Past Due/Canceled badge, no more admin action
// needed unless it lapses.
const BILLING_STATUS_LABELS = {
  active: 'Active',
  past_due: 'Payment Failed',
  canceled: 'Canceled',
  pending_checkout: 'Link Sent'
};

function billingCellHtml(r) {
  const rb = r.recurringBilling;
  if (!rb || !rb.status || rb.status === 'not_started') {
    return `
      <div class="billing-setup-form">
        <input type="text" inputmode="decimal" class="billing-amount-input" data-id="${r.id}" placeholder="Monthly $" value="${(r.recurringPendingAmount || '').toString().replace(/"/g, '&quot;')}">
        <label class="billing-mode-toggle"><input type="checkbox" class="billing-live-toggle" data-id="${r.id}"> Live</label>
        <button class="billing-setup-btn" data-id="${r.id}">Send Billing Link</button>
        <div class="billing-error hidden" data-id="${r.id}"></div>
      </div>
    `;
  }

  const label = BILLING_STATUS_LABELS[rb.status] || rb.status;
  const amountText = rb.monthlyAmount ? formatCurrency(Number(rb.monthlyAmount)) + '/mo' : '';
  const modeText = rb.mode === 'live' ? '' : ' (Test)';
  const badge = `<span class="billing-badge status-${rb.status}">${label}${amountText ? ' &middot; ' + amountText : ''}${modeText}</span>`;

  if (rb.status === 'pending_checkout' && rb.checkoutUrl) {
    return `
      <div>
        ${badge}
        <div class="billing-link-row">
          <button class="billing-copy-link-btn" data-url="${rb.checkoutUrl}">Copy billing link</button>
        </div>
      </div>
    `;
  }
  return badge;
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
      <td><input type="text" inputmode="decimal" class="amount-input" data-id="${r.id}" value="${(r.invoiceAmount || '').replace(/"/g, '&quot;')}" placeholder="0.00"></td>
      <td><input type="date" class="due-date-input" data-id="${r.id}" value="${r.invoiceDueDate || ''}"></td>
      <td class="date-cell">${r.invoicePaidDate || '--'}</td>
      <td class="billing-cell">${billingCellHtml(r)}</td>
      <td><input type="text" class="notes-input" data-id="${r.id}" value="${(r.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="send-contract-btn" data-id="${r.id}">Send Contract</button>
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

  document.querySelectorAll('.amount-input').forEach(inp => {
    if (typeof attachCommaFormatting === 'function') attachCommaFormatting(inp);
    if (typeof attachSpinnerButtons === 'function') attachSpinnerButtons(inp, { step: 1 });
    inp.addEventListener('change', async () => {
      const r = findRecord(inp.getAttribute('data-id'));
      if (!r) return;
      r.invoiceAmount = inp.value.trim();
      await persist();
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
  document.querySelectorAll('.send-contract-btn').forEach(btn => {
    btn.addEventListener('click', () => openSendContractPanel(btn.getAttribute('data-id')));
  });

  document.querySelectorAll('.billing-amount-input').forEach(inp => {
    if (typeof attachCommaFormatting === 'function') attachCommaFormatting(inp);
    inp.addEventListener('input', () => {
      const r = findRecord(inp.getAttribute('data-id'));
      if (r) r.recurringPendingAmount = inp.value; // not persisted on its own - just remembered for the button click below, cleared once billing actually starts
    });
  });

  document.querySelectorAll('.billing-setup-btn').forEach(btn => {
    btn.addEventListener('click', () => sendBillingLink(btn.getAttribute('data-id')));
  });

  document.querySelectorAll('.billing-copy-link-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = btn.getAttribute('data-url');
      try {
        await navigator.clipboard.writeText(url);
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = original; }, 1500);
      } catch (e) {
        if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', "Couldn't copy - here's the link: " + url);
      }
    });
  });
}

// Creates a Stripe Checkout Session (subscription mode) for this record
// via the Worker and stores the resulting link/status - see
// /api/billing/create-subscription-checkout in _worker.js. The actual
// "did they pay" status update comes later, asynchronously, from Stripe's
// webhook - this only gets as far as "a link exists to send them."
async function sendBillingLink(id) {
  const r = findRecord(id);
  if (!r) return;

  const row = document.querySelector(`.billing-setup-btn[data-id="${id}"]`);
  const errorEl = document.querySelector(`.billing-error[data-id="${id}"]`);
  const liveToggle = document.querySelector(`.billing-live-toggle[data-id="${id}"]`);
  const mode = liveToggle && liveToggle.checked ? 'live' : 'test';
  const amountRaw = (r.recurringPendingAmount || '').toString().replace(/,/g, '').trim();
  const amount = parseFloat(amountRaw);

  if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }

  if (!amount || amount <= 0) {
    if (errorEl) { errorEl.textContent = 'Enter a monthly amount first.'; errorEl.classList.remove('hidden'); }
    return;
  }

  if (mode === 'live') {
    const confirmed = confirm(`This creates a LIVE billing link for ${r.clientName} at ${formatCurrency(amount)}/mo - once they check out, their card is actually charged every month. Continue?`);
    if (!confirmed) return;
  }

  if (row) { row.disabled = true; row.textContent = 'Sending...'; }

  // Pre-fill the client's email on the Checkout Session so they don't have
  // to type it in fresh - same Client Workspace lookup (by clientName,
  // matched via findClientRecordByName) that openSendContractPanel above
  // already uses for the contract-sending flow. Falls back to Stripe just
  // asking for it on the checkout page if there's no Contact Email on file.
  const client = findClientRecordByName(r.clientName);
  const clientEmail = (client && client.portalConfig && client.portalConfig.clientContactEmail) || '';

  try {
    const res = await fetch('/api/billing/create-subscription-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordId: r.id, clientName: r.clientName, monthlyAmount: amount, mode, clientEmail })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');

    r.recurringBilling = {
      status: 'pending_checkout',
      monthlyAmount: amount,
      checkoutUrl: data.checkoutUrl,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      mode
    };
    delete r.recurringPendingAmount;
    await persist();
    renderTable();
    if (isEmbedded && window.parent.showBanner) {
      window.parent.showBanner('success', `Billing link created for ${r.clientName} - copy it from the Recurring Billing column to send.`);
    }
  } catch (e) {
    if (row) { row.disabled = false; row.textContent = 'Send Billing Link'; }
    if (errorEl) { errorEl.textContent = e.message; errorEl.classList.remove('hidden'); }
  }
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

/* ── Send Contract (real auto-send via Resend, original PDF attached) ──
   Deliberately different from the html2pdf-based Email-to-Client flows
   elsewhere in the Hub (Renewal Tracker, QBR Generator, Change Order
   Generator): these contract PDFs are pre-built legal documents with
   their own letterhead/signature-block design, stored as-is in
   /contracts, and must be sent byte-for-byte unchanged rather than
   regenerated from an HTML template - so this fetches the real file and
   base64-encodes it directly instead of rendering a pdfContainer through
   html2pdf. */

// docusignTemplateId/docusignRoleName are optional - only set on templates
// that have an actual Docusign Template built for them (see the Docusign
// send button below, which only appears when these are present). Every
// entry still works as a plain flat-PDF-attachment send either way.
// All 6 of the originally-hardcoded contract templates now live in the
// same self-service Contract Template Library as everything else
// (uploaded/replaceable without a redeploy - see contractLibrary below) -
// this array is intentionally empty and kept only so any code that still
// references CONTRACT_TEMPLATES (e.g. a default selection) degrades
// gracefully instead of throwing. docusignAnchorTags/docusignTemplateId/
// docusignRoleName now live as metadata on the library entry itself (see
// agency/contractTemplates in Firestore) and are read in
// resolveSelectedContractTemplate's 'uploaded:' branch below.
const CONTRACT_TEMPLATES = [];

function escapeHtmlLocal(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/* ── Contract Template Library ──
   Every contract template (including the original 6) lives here now -
   added/replaced/removed straight from this screen, no code change or
   redeploy required. Uploads go through /api/contracts (see _worker.js),
   which stores the actual PDF in an R2 bucket and returns a key; only
   that key + a label (+ optional Docusign metadata - docusignAnchorTags/
   docusignTemplateId/docusignRoleName, see resolveSelectedContractTemplate
   below) is saved to Firestore (agency/contractTemplates), same
   optimistic-concurrency read-check-write pattern as
   agency/contractInvoices above. */

let contractLibrary = [];
let contractLibraryDocVersion = 0;

// Contractor documents (Independent Contractor Agreement, its NDA, and
// anything else added the same way from Team Roster & Capacity) live in
// this same shared list/collection, but are sent from Team Roster instead
// of here - a contractor isn't a client, and shouldn't show up as one.
// Filtered out of both this tool's management list and its Send Contract
// checklist below. Matches by docCategory (set on anything created via
// Team Roster's contractor doc manager) or, for the 2 originally-migrated
// entries that may predate that tag, by label/filename keyword.
function isContractorDoc(entry) {
  if (!entry) return false;
  if (entry.docCategory === 'contractor') return true;
  const hay = ((entry.label || '') + ' ' + (entry.filename || '')).toLowerCase();
  return hay.includes('independent contractor agreement') || hay.includes('nda - independent contract');
}

function getContractLibraryDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "contractTemplates");
}

async function loadContractLibrary() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getContractLibraryDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      contractLibrary = (data && data.list) || [];
      contractLibraryDocVersion = (data && data.version) || 0;
    } catch (e) {
      console.error("Couldn't load the contract template library:", e);
      contractLibrary = [];
    }
  }
  renderContractLibrary();
  populateContractTemplateSelect();
}

async function persistContractLibrary() {
  if (!isEmbedded || !window.parent.saveVersionedAgencyDoc) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', "Can't save the contract library outside the Hub.");
    return false;
  }
  const result = await window.parent.saveVersionedAgencyDoc({
    docRef: getContractLibraryDocRef(),
    currentVersion: contractLibraryDocVersion,
    buildPayload: (v) => ({ list: contractLibrary, version: v }),
  });
  if (!result.ok) {
    if (result.reason === 'error') console.error("Couldn't save the contract template library:", result.error);
    if (window.parent.showBanner) {
      window.parent.showBanner('error', result.reason === 'conflict'
        ? "Someone else updated the contract library while you had it open. Reload to see their changes."
        : "Couldn't save: " + result.error.message);
    }
    return false;
  }
  contractLibraryDocVersion = result.version;
  return true;
}

let contractLibraryStatusTimer = null;

function setContractLibraryStatus(msg, isError) {
  const elx = el('contractLibraryStatus');
  if (!elx) return;
  elx.textContent = msg;
  elx.style.color = isError ? 'var(--color-error, #f68d5f)' : 'var(--color-success, #10b981)';

  if (contractLibraryStatusTimer) clearTimeout(contractLibraryStatusTimer);
  if (msg) {
    contractLibraryStatusTimer = setTimeout(() => {
      if (elx.textContent === msg) elx.textContent = '';
    }, 60000);
  }
}

// Row layout intentionally matches Team Roster & Capacity's contractor
// document cards (renderContractorDocManager, team-roster/js/app.js) -
// name + a small status/meta line + a single file-input-in-a-button-label
// control, instead of this tool's older separate-buttons layout.
function renderContractLibrary() {
  const list = el('contractLibraryList');
  if (!list) return;
  const visible = contractLibrary.filter(t => !isContractorDoc(t));
  if (visible.length === 0) {
    list.innerHTML = `<p style="font-size:13px;color:var(--color-text-muted);">No uploaded contracts yet — the 6 built-in templates are still available below in Send Contract.</p>`;
    return;
  }
  list.innerHTML = visible.map(t => `
    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 0; border-bottom:1px solid var(--border-color);" data-id="${t.id}">
      <div style="min-width:220px; flex:1;">
        <div style="font-size:0.85rem; font-weight:600;">${escapeHtmlLocal(t.label)}${t.needsAnchorReview ? '<span class="contract-needs-review-badge">Needs Review</span>' : ''}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtmlLocal(t.filename || '')} &middot; uploaded ${t.uploadedAt || '--'}</div>
      </div>
      ${isRestrictedUser ? '' : `
      ${t.needsAnchorReview ? `<button type="button" class="review-anchor-btn btn btn-secondary" data-id="${t.id}" style="padding:6px 12px; font-size:0.8rem;">Review</button>` : ''}
      <label class="btn btn-secondary" style="cursor:pointer; padding:6px 12px; font-size:0.8rem;">
        Replace File
        <input type="file" accept="application/pdf" data-id="${t.id}" class="replace-contract-input" style="display:none;">
      </label>
      <button type="button" class="delete-contract-btn btn btn-secondary" data-id="${t.id}" style="padding:6px 12px; font-size:0.8rem;">Delete</button>
      `}
    </div>
  `).join('');
}

// uploadPdfToR2, uploadBytesToR2, deleteR2Object, ensurePdfjsWorker,
// detectClientAnchors, normalizeAnchorDetections, and bakeAnchorsAtDetection
// all moved to ../shared-contract-pdf-tools.js (loaded in index.html) -
// this file and Team Roster's Contractor Documents both upload into the
// same agency/contractTemplates library and had byte-for-byte identical
// copies of all of it.

// Contract Template Library panel is hidden by default (see
// contractLibraryTrigger/contractLibraryCard in index.html) - opened
// on demand via "Manage Contract Templates" instead of always showing
// the full list of templates on the page.
const openContractLibraryBtn = el('openContractLibraryBtn');
const contractLibraryCloseBtn = el('contractLibraryCloseBtn');
const contractLibraryCard = el('contractLibraryCard');

if (openContractLibraryBtn) {
  openContractLibraryBtn.addEventListener('click', () => {
    if (contractLibraryCard) {
      contractLibraryCard.style.display = 'block';
      contractLibraryCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}
if (contractLibraryCloseBtn) {
  contractLibraryCloseBtn.addEventListener('click', () => {
    if (contractLibraryCard) contractLibraryCard.style.display = 'none';
  });
}

/* ── Recently Deleted (restore from the copy-on-delete R2 backup) ──
   Reads/writes /api/contracts-backup(/restore) in _worker.js. Restoring
   adds a brand-new entry to contractLibrary pointing at a freshly copied
   R2 object (see handleContractsBackupRestore) - it doesn't try to
   resurrect the exact original Firestore entry, since that metadata
   (docCategory, DocuSign anchor state, etc.) is already gone by the time
   a delete happens. If the restored label matches a known contractor doc
   name, isContractorDoc's label/filename fallback picks it back up into
   Team Roster's Contractor Documents automatically - same as any
   originally-migrated entry. */

const openDeletedFilesBtn = el('openDeletedFilesBtn');
const deletedFilesCloseBtn = el('deletedFilesCloseBtn');
const deletedFilesCard = el('deletedFilesCard');
const deletedFilesList = el('deletedFilesList');
const deletedFilesStatus = el('deletedFilesStatus');

function formatDeletedDate(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadDeletedFiles() {
  if (deletedFilesStatus) deletedFilesStatus.textContent = '';
  if (deletedFilesList) deletedFilesList.innerHTML = '<p style="font-size:13px;color:var(--color-text-muted);">Loading...</p>';
  try {
    const res = await fetch('/api/contracts-backup');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't load (${res.status})`);
    renderDeletedFiles(data.items || []);
  } catch (e) {
    console.error('Could not load deleted files:', e);
    if (deletedFilesList) deletedFilesList.innerHTML = '';
    if (deletedFilesStatus) {
      deletedFilesStatus.textContent = "Couldn't load: " + e.message + " - the backup bucket may not be created yet (see the Data Backup & Disaster Recovery SOP).";
      deletedFilesStatus.style.color = 'var(--color-error, #f68d5f)';
    }
  }
}

function renderDeletedFiles(items) {
  if (!deletedFilesList) return;
  if (!items.length) {
    deletedFilesList.innerHTML = `<p style="font-size:13px;color:var(--color-text-muted);">Nothing's been deleted yet.</p>`;
    return;
  }
  // Same restricted-user gating as the main library's Replace/Delete
  // buttons - viewing what's been deleted is fine for everyone, but
  // restoring is an "add back" action, so it follows the same
  // unrestricted-users-only rule.
  deletedFilesList.innerHTML = items.map(item => `
    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 0; border-bottom:1px solid var(--border-color);" data-key="${escapeHtmlLocal(item.key)}">
      <div style="min-width:220px; flex:1;">
        <div style="font-size:0.85rem; font-weight:600;">${escapeHtmlLocal(item.originalLabel || item.key)}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">Deleted ${formatDeletedDate(item.deletedAt)}</div>
      </div>
      ${isRestrictedUser ? '' : `<button type="button" class="restore-deleted-file-btn btn btn-secondary" data-key="${escapeHtmlLocal(item.key)}" data-label="${escapeHtmlLocal(item.originalLabel || '')}" style="padding:6px 12px; font-size:0.8rem;">Restore</button>`}
    </div>
  `).join('');
}

if (openDeletedFilesBtn) {
  openDeletedFilesBtn.addEventListener('click', () => {
    if (deletedFilesCard) {
      deletedFilesCard.style.display = 'block';
      deletedFilesCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    loadDeletedFiles();
  });
}
if (deletedFilesCloseBtn) {
  deletedFilesCloseBtn.addEventListener('click', () => {
    if (deletedFilesCard) deletedFilesCard.style.display = 'none';
  });
}

document.addEventListener('click', async (e) => {
  if (!e.target.matches('.restore-deleted-file-btn')) return;
  if (isRestrictedUser) return; // defense in depth - this button is hidden for restricted users
  const btn = e.target;
  const backupKey = btn.getAttribute('data-key');
  const label = btn.getAttribute('data-label') || 'Restored document';
  btn.disabled = true;
  btn.textContent = 'Restoring...';
  try {
    const res = await fetch('/api/contracts-backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: backupKey })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || `Restore failed (${res.status})`);

    contractLibrary.push({
      id: uid(),
      label: data.label || label,
      r2Key: data.key,
      filename: (data.label || label) + '.pdf',
      uploadedAt: todayStr(),
      docusignAnchorTags: false,
      needsAnchorReview: false,
      anchorDetection: null
    });
    const ok = await persistContractLibrary();
    if (!ok) throw new Error('Restored the file, but could not save it into the library - try again.');

    renderContractLibrary();
    populateContractTemplateSelect();
    btn.textContent = 'Restored ✓';
    if (deletedFilesStatus) {
      deletedFilesStatus.textContent = `"${data.label || label}" restored - it's back in the Contract Template Library above.`;
      deletedFilesStatus.style.color = 'var(--color-success, #10b981)';
    }
  } catch (e) {
    console.error('Restore failed:', e);
    btn.disabled = false;
    btn.textContent = 'Restore';
    if (deletedFilesStatus) {
      deletedFilesStatus.textContent = "Couldn't restore: " + e.message;
      deletedFilesStatus.style.color = 'var(--color-error, #f68d5f)';
    }
  }
});

const newContractLabel = el('newContractLabel');
const newContractFile = el('newContractFile');
const newContractFileName = el('newContractFileName');
const uploadContractBtn = el('uploadContractBtn');

function refreshNewContractFileName() {
  if (!newContractFileName) return;
  const file = newContractFile.files[0];
  newContractFileName.textContent = file ? file.name : 'No file chosen';
}
if (newContractFile) {
  newContractFile.addEventListener('change', refreshNewContractFileName);
}

if (uploadContractBtn) {
  uploadContractBtn.addEventListener('click', async () => {
    if (isRestrictedUser) return; // defense in depth - the button is hidden for restricted users, but don't trust the DOM alone
    const label = newContractLabel.value.trim();
    const file = newContractFile.files[0];
    if (!label) { setContractLibraryStatus('Enter a name for this contract first.', true); return; }
    if (!file) { setContractLibraryStatus('Choose a PDF file first.', true); return; }
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setContractLibraryStatus('Please choose a PDF file.', true);
      return;
    }

    uploadContractBtn.disabled = true;
    uploadContractBtn.textContent = 'Analyzing...';
    try {
      const origBytes = new Uint8Array(await file.arrayBuffer());
      let detection = null;
      let uploadBytes = origBytes;
      try {
        detection = await detectClientAnchors(origBytes);
        if (detection) uploadBytes = await bakeAnchorsAtDetection(origBytes, detection);
      } catch (detErr) {
        console.warn('DocuSign anchor auto-detection failed (non-fatal - uploading as a flat PDF):', detErr);
        detection = null;
        uploadBytes = origBytes;
      }

      uploadContractBtn.textContent = 'Uploading...';
      const key = await uploadBytesToR2(uploadBytes, file.name);
      contractLibrary.push({
        id: uid(),
        label,
        r2Key: key,
        filename: file.name,
        uploadedAt: todayStr(),
        docusignAnchorTags: false,
        needsAnchorReview: !!detection,
        anchorDetection: detection || null
      });
      const ok = await persistContractLibrary();
      if (!ok) { contractLibrary.pop(); throw new Error('Could not save — try again'); }
      newContractLabel.value = '';
      newContractFile.value = '';
      refreshNewContractFileName();
      renderContractLibrary();
      populateContractTemplateSelect();
      setContractLibraryStatus(
        detection
          ? `Added "${label}" — DocuSign signature/date lines auto-detected. Click Review to confirm placement before it's sendable via DocuSign.`
          : `Added "${label}". Couldn't auto-detect signature lines for DocuSign, so it's a flat PDF only for now — let me know if you want it DocuSign-enabled and I'll wire it up by hand.`,
        false
      );
    } catch (e) {
      console.error('Contract upload failed:', e);
      setContractLibraryStatus("Couldn't upload: " + e.message, true);
    } finally {
      uploadContractBtn.disabled = false;
      uploadContractBtn.textContent = '+ Add Contract';
    }
  });
}

// Delegated listeners (not re-bound per render) for the Replace/Delete
// controls, since renderContractLibrary() replaces the whole list's
// innerHTML on every change.
document.addEventListener('change', async (e) => {
  if (!e.target.matches('.replace-contract-input')) return;
  if (isRestrictedUser) return; // defense in depth - this input is hidden for restricted users
  const id = e.target.getAttribute('data-id');
  const file = e.target.files[0];
  if (!file) return;
  const entry = contractLibrary.find(t => t.id === id);
  if (!entry) return;

  setContractLibraryStatus(`Replacing "${entry.label}"...`, false);
  const oldKey = entry.r2Key;
  try {
    const origBytes = new Uint8Array(await file.arrayBuffer());
    let detection = null;
    let uploadBytes = origBytes;
    try {
      detection = await detectClientAnchors(origBytes);
      if (detection) uploadBytes = await bakeAnchorsAtDetection(origBytes, detection);
    } catch (detErr) {
      console.warn('DocuSign anchor auto-detection failed on replace (non-fatal):', detErr);
      detection = null;
      uploadBytes = origBytes;
    }

    const key = await uploadBytesToR2(uploadBytes, file.name);
    entry.r2Key = key;
    entry.filename = file.name;
    entry.uploadedAt = todayStr();
    // The old file's DocuSign approval doesn't carry over to a
    // different file - re-detect and require review again.
    entry.docusignAnchorTags = false;
    entry.needsAnchorReview = !!detection;
    entry.anchorDetection = detection || null;
    const ok = await persistContractLibrary();
    if (!ok) throw new Error('Could not save — try again');
    deleteR2Object(oldKey, entry.label);
    renderContractLibrary();
    populateContractTemplateSelect();
    setContractLibraryStatus(
      detection
        ? `Replaced "${entry.label}" — DocuSign signature/date lines auto-detected. Click Review to confirm placement before it's sendable via DocuSign.`
        : `Replaced "${entry.label}". Couldn't auto-detect signature lines for DocuSign this time — it's a flat PDF only for now.`,
      false
    );
  } catch (err) {
    console.error('Contract replace failed:', err);
    setContractLibraryStatus("Couldn't replace: " + err.message, true);
  } finally {
    e.target.value = '';
  }
});

document.addEventListener('click', async (e) => {
  if (!e.target.matches('.delete-contract-btn')) return;
  if (isRestrictedUser) return; // defense in depth - this button is hidden for restricted users
  const id = e.target.getAttribute('data-id');
  const entry = contractLibrary.find(t => t.id === id);
  if (!entry) return;
  if (!confirm(`Delete "${entry.label}"? This can't be undone.`)) return;

  const previous = contractLibrary;
  contractLibrary = contractLibrary.filter(t => t.id !== id);
  const ok = await persistContractLibrary();
  if (!ok) { contractLibrary = previous; return; }
  deleteR2Object(entry.r2Key, entry.label);
  renderContractLibrary();
  populateContractTemplateSelect();
});

/* ── Anchor review panel ──
   Renders the detected page (via pdf.js, straight from the actual
   uploaded/tagged file in R2) with a marker circle at exactly the
   coordinates the invisible [[SIG_CLIENT]]/[[DATE_CLIENT]] tags were
   placed - a human can then confirm or reject the auto-detection before
   it becomes usable in Send Contract's DocuSign flow. */

const anchorReviewPanel = el('anchorReviewPanel');
const anchorReviewLabel = el('anchorReviewLabel');
const anchorReviewCanvasWrap = el('anchorReviewCanvasWrap');
const anchorReviewCloseBtn = el('anchorReviewCloseBtn');
const anchorReviewApproveBtn = el('anchorReviewApproveBtn');
const anchorReviewRejectBtn = el('anchorReviewRejectBtn');
const anchorReviewStatus = el('anchorReviewStatus');
let currentAnchorReviewId = null;

if (anchorReviewCloseBtn) {
  anchorReviewCloseBtn.addEventListener('click', () => {
    if (anchorReviewPanel) anchorReviewPanel.style.display = 'none';
    currentAnchorReviewId = null;
  });
}

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

      // detection.sigX/sigY/dateX/dateY are unscaled PDF points
      // (bottom-left origin) - convert to this canvas's pixel space
      // (top-left origin, scaled) to draw the markers in the right spot.
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

document.addEventListener('click', (e) => {
  if (!e.target.matches('.review-anchor-btn')) return;
  if (isRestrictedUser) return; // defense in depth - this button is hidden for restricted users
  const id = e.target.getAttribute('data-id');
  const entry = contractLibrary.find(t => t.id === id);
  if (!entry) return;
  openAnchorReview(entry);
});

if (anchorReviewApproveBtn) {
  anchorReviewApproveBtn.addEventListener('click', async () => {
    if (!currentAnchorReviewId) return;
    const entry = contractLibrary.find(t => t.id === currentAnchorReviewId);
    if (!entry) return;
    anchorReviewApproveBtn.disabled = true;
    if (anchorReviewRejectBtn) anchorReviewRejectBtn.disabled = true;
    try {
      entry.docusignAnchorTags = true;
      entry.needsAnchorReview = false;
      const ok = await persistContractLibrary();
      if (!ok) throw new Error('Could not save — try again');
      renderContractLibrary();
      populateContractTemplateSelect();
      if (anchorReviewPanel) anchorReviewPanel.style.display = 'none';
      currentAnchorReviewId = null;
      setContractLibraryStatus(`"${entry.label}" is now enabled for DocuSign.`, false);
    } catch (err) {
      entry.docusignAnchorTags = false;
      entry.needsAnchorReview = true;
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
    const entry = contractLibrary.find(t => t.id === currentAnchorReviewId);
    if (!entry) return;
    if (anchorReviewApproveBtn) anchorReviewApproveBtn.disabled = true;
    anchorReviewRejectBtn.disabled = true;
    try {
      // The invisible tags stay baked into the file either way (they're
      // harmless), but with needsAnchorReview/docusignAnchorTags both
      // false the document just behaves as a normal flat-PDF-only
      // attachment going forward - the Review button won't show again.
      entry.needsAnchorReview = false;
      entry.docusignAnchorTags = false;
      const ok = await persistContractLibrary();
      if (!ok) throw new Error('Could not save — try again');
      renderContractLibrary();
      populateContractTemplateSelect();
      if (anchorReviewPanel) anchorReviewPanel.style.display = 'none';
      currentAnchorReviewId = null;
      setContractLibraryStatus(`"${entry.label}" kept as a flat PDF only (not DocuSign-enabled).`, false);
    } catch (err) {
      entry.needsAnchorReview = true;
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

function resolveSelectedContractTemplate(value) {
  if (!value) return null;
  if (value.startsWith('builtin:')) {
    const t = CONTRACT_TEMPLATES.find(x => x.id === value.slice('builtin:'.length));
    if (!t) return null;
    return {
      label: t.label,
      filename: t.file,
      fetchUrl: '../contracts/' + encodeURIComponent(t.file),
      docusignTemplateId: t.docusignTemplateId || null,
      docusignRoleName: t.docusignRoleName || null,
      docusignAnchorTags: !!t.docusignAnchorTags
    };
  }
  if (value.startsWith('uploaded:')) {
    const t = contractLibrary.find(x => x.id === value.slice('uploaded:'.length));
    if (!t) return null;
    return {
      label: t.label,
      filename: t.filename || (t.label + '.pdf'),
      fetchUrl: '/api/contracts/' + encodeURIComponent(t.r2Key),
      // Most uploaded documents are arbitrary PDFs with no guaranteed
      // anchor text, so this defaults to false/null - but a handful
      // (the 6 migrated from the old hardcoded list, see the
      // Firestore agency/contractTemplates doc) carry this metadata
      // from when they were uploaded, preserving both the Docusign
      // combined-envelope eligibility and MSA's solo Template send.
      docusignAnchorTags: !!t.docusignAnchorTags,
      docusignTemplateId: t.docusignTemplateId || null,
      docusignRoleName: t.docusignRoleName || null
    };
  }
  return null;
}

/* ── Contract fill-in-the-blank fields (Client Name, Effective Date, fees,
   etc) ──
   Each of the 5 anchor-eligible built-in contracts (everything except the
   MSA's solo-Template send) has an invisible "[[TOKEN_NAME]]" anchor baked
   in next to its blank lines - same technique as [[SIG_CLIENT]]/
   [[DATE_CLIENT]]. This schema drives the "Fill Contract Details" panel
   shown before a Docusign send, and the resulting values are passed as
   fieldValues to /api/docusign/send-envelope, which turns them into
   textTabs (see handleDocusignSendEnvelope in _worker.js). Anchors that
   aren't present in whichever document(s) are actually being sent are
   silently ignored by Docusign, so one merged field list safely covers a
   combined send of several contract types at once. */
const CONTRACT_FIELD_SCHEMA = {
  'Creative Services Agreement - Revital Productions.pdf': [
    { token: 'EFFECTIVE_DATE', label: 'Effective Date', default: () => todayStr() },
    { token: 'CLIENT_NAME', label: 'Client Name', default: (r) => r && r.clientName },
    { token: 'CLIENT_ADDRESS', label: 'Client Address', default: () => '' },
    { token: 'REVISION_WINDOW_HOURS', label: 'Revision Window (hours)', default: () => '' },
    { token: 'PROJECT_FEE', label: 'Project Fee ($)', default: () => '' },
    { token: 'DEPOSIT', label: 'Deposit ($)', default: () => '' },
    { token: 'BALANCE', label: 'Balance ($)', default: () => '' },
    { token: 'RUSH_FEE', label: 'Rush Fee ($)', default: () => '' },
    { token: 'KILL_FEE', label: 'Kill Fee ($)', default: () => '' },
    { token: 'REVISION_ROUNDS_INCLUDED', label: 'Revision Rounds Included', default: () => '' },
    { token: 'ADDITIONAL_REVISION_RATE', label: 'Additional Revision Rate ($/hour)', default: () => '' },
    { token: 'USAGE_RIGHTS', label: 'Usage Rights Description', default: () => '' }
  ],
  'Independent Contractor Agreement - Revital Productions.pdf': [
    { token: 'EFFECTIVE_DATE', label: 'Effective Date', default: () => todayStr() },
    { token: 'CONTRACTOR_NAME', label: 'Contractor Name', default: (r) => r && r.clientName },
    { token: 'CONTRACTOR_ADDRESS', label: 'Contractor Address', default: () => '' },
    { token: 'RATE', label: 'Rate ($)', default: () => '' },
    { token: 'INVOICE_DUE_DAY', label: 'Invoice Due Day of Month', default: () => '' },
    { token: 'NONCOMPETE_MONTHS', label: 'Non-Compete Period (months)', default: () => '' },
    { token: 'TERMINATION_NOTICE_DAYS', label: 'Termination Notice (days)', default: () => '' }
  ],
  'Master Service Agreement - Revital Productions.pdf': [
    { token: 'EFFECTIVE_DATE', label: 'Effective Date', default: () => todayStr() },
    { token: 'CLIENT_NAME', label: 'Client Name', default: (r) => r && r.clientName },
    { token: 'CLIENT_ADDRESS', label: 'Client Address', default: () => '' }
  ],
  'NDA - Independent Contract - Revital Productions.pdf': [
    { token: 'EFFECTIVE_DATE', label: 'Effective Date', default: () => todayStr() },
    { token: 'PARTY_B_NAME', label: 'Other Party Name', default: (r) => r && r.clientName },
    { token: 'PARTY_B_ADDRESS', label: 'Other Party Address', default: () => '' },
    { token: 'JURISDICTION_COUNTY', label: 'Jurisdiction (Parish/County)', default: () => '' }
  ],
  'NDA - Tied To MSA - Revital Productions.pdf': [
    { token: 'MSA_DATE', label: 'MSA Date', default: () => '' },
    { token: 'CLIENT_NAME', label: 'Client Name', default: (r) => r && r.clientName },
    { token: 'EFFECTIVE_DATE', label: 'Effective Date', default: () => todayStr() },
    { token: 'PARTY_B_NAME', label: 'Other Party Name', default: (r) => r && r.clientName },
    { token: 'PARTY_B_ADDRESS', label: 'Other Party Address', default: () => '' },
    { token: 'JURISDICTION_COUNTY', label: 'Jurisdiction (Parish/County)', default: () => '' }
  ],
  // Note: this PDF's body text is flattened images (no real text layer),
  // unlike the other 5 - its anchors were positioned via OCR estimation
  // rather than exact text coordinates, so double-check placement with a
  // test send before relying on it for a real client.
  'Social Media Growth Agreement - Revital Productions.pdf': [
    { token: 'EFFECTIVE_DATE', label: 'Effective Date', default: () => todayStr() },
    { token: 'CLIENT_NAME', label: 'Client Name', default: (r) => r && r.clientName },
    { token: 'CLIENT_ADDRESS', label: 'Client Address', default: () => '' },
    { token: 'FIRST_PAYMENT_DATE', label: 'First Payment Due Date', default: () => '' },
    { token: 'LATE_FEE', label: 'Late Fee ($)', default: () => '' },
    { token: 'TERM_END_DATE', label: 'Term End Date (3 months from start)', default: () => '' }
  ]
};

function getContractFieldTokensForFilename(filename) {
  if (!filename) return [];
  if (CONTRACT_FIELD_SCHEMA[filename]) return CONTRACT_FIELD_SCHEMA[filename];
  // Fallback keyword match, in case a library entry was re-labeled/renamed
  // on upload and no longer matches the original filename exactly. Ordered
  // most-specific-first since "NDA - Tied To MSA" would otherwise also
  // match the plain NDA and Master Service checks below.
  const f = filename.toLowerCase();
  if (f.includes('social media growth')) return CONTRACT_FIELD_SCHEMA['Social Media Growth Agreement - Revital Productions.pdf'];
  if (f.includes('tied to msa') || (f.includes('nda') && f.includes('msa'))) return CONTRACT_FIELD_SCHEMA['NDA - Tied To MSA - Revital Productions.pdf'];
  if (f.includes('nda') || f.includes('non-disclosure') || f.includes('non disclosure')) return CONTRACT_FIELD_SCHEMA['NDA - Independent Contract - Revital Productions.pdf'];
  if (f.includes('independent contractor')) return CONTRACT_FIELD_SCHEMA['Independent Contractor Agreement - Revital Productions.pdf'];
  if (f.includes('master service')) return CONTRACT_FIELD_SCHEMA['Master Service Agreement - Revital Productions.pdf'];
  if (f.includes('creative services')) return CONTRACT_FIELD_SCHEMA['Creative Services Agreement - Revital Productions.pdf'];
  return [];
}

function getMergedContractFields(templates) {
  const seen = new Map();
  templates.forEach(t => {
    getContractFieldTokensForFilename(t.filename).forEach(f => {
      if (!seen.has(f.token)) seen.set(f.token, f);
    });
  });
  return Array.from(seen.values());
}

// Records here are tracked by free-text client name (see header comment -
// a contract often goes out before someone is a full Client Workspace),
// so look up the matching Client Workspace case-insensitively/trimmed
// rather than a direct bracket lookup, same as Change Order Generator.
function findClientRecordByName(name) {
  if (!isEmbedded || typeof window.parent.getAllClients !== 'function') return null;
  let clients = {};
  try { clients = window.parent.getAllClients() || {}; } catch (e) { return null; }
  const target = (name || '').trim().toLowerCase();
  const key = Object.keys(clients).find(k => k.trim().toLowerCase() === target);
  return key ? clients[key] : null;
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

const sendContractPanel = el('sendContractPanel');
const sendContractTemplateList = el('sendContractTemplateList');
const sendContractRecipientNameGroup = el('sendContractRecipientNameGroup');
const sendContractRecipientName = el('sendContractRecipientName');
const sendContractTo = el('sendContractTo');
const sendContractSubject = el('sendContractSubject');
const sendContractBody = el('sendContractBody');
const sendContractOpenBtn = el('sendContractOpenBtn');
const sendContractGmailBtn = el('sendContractGmailBtn');
const sendContractCopyBtn = el('sendContractCopyBtn');
const sendContractSendBtn = el('sendContractSendBtn');
const sendContractDocusignBtn = el('sendContractDocusignBtn');
const sendContractStatus = el('sendContractStatus');
const sendContractCloseBtn = el('sendContractCloseBtn');

// Reads whichever checkboxes are currently ticked in the contract
// checklist and resolves each into a full template object (built-in or
// uploaded) - this is what lets more than one document be attached to a
// single send, instead of only ever picking one from a dropdown.
function getSelectedContractTemplates() {
  if (!sendContractTemplateList) return [];
  return Array.from(sendContractTemplateList.querySelectorAll('.contract-attach-checkbox:checked'))
    .map(cb => resolveSelectedContractTemplate(cb.value))
    .filter(Boolean);
}

// Two ways the Docusign button can become available:
//  1) MSA checked alone - uses its real Docusign Template (proven, unchanged
//     since it first shipped).
//  2) Any checked document(s) that all have anchor tags baked in - combined
//     into one envelope via the anchor-tag path (see _worker.js). Uploaded
//     library documents never have guaranteed anchor tags, so mixing one in
//     disqualifies the whole selection and hides the button (flat-PDF email
//     attachment is still available for those either way).
function updateDocusignButtonVisibility() {
  if (!sendContractDocusignBtn) return;
  const templates = getSelectedContractTemplates();
  const soloMsa = templates.length === 1 && !!(templates[0].docusignTemplateId && templates[0].docusignRoleName);
  const allAnchorEligible = templates.length > 0 && templates.every(t => t.docusignAnchorTags);
  const hasDocusign = soloMsa || allAnchorEligible;
  sendContractDocusignBtn.style.display = hasDocusign ? 'flex' : 'none';
  sendContractDocusignBtn.disabled = false;
  sendContractDocusignBtn.textContent = 'Send for E-Signature (DocuSign)';
}

let currentContractContext = null; // { record, from }

function contractChecklistRowHtml(value, label, selectedValues) {
  const checked = selectedValues.has(value) ? ' checked' : '';
  return `<label class="contract-attach-row"><input type="checkbox" class="contract-attach-checkbox" value="${value}"${checked}><span>${escapeHtmlLocal(label)}</span></label>`;
}

function populateContractTemplateChecklist(defaultSelectedValues) {
  if (!sendContractTemplateList) return;
  const selectedValues = new Set(defaultSelectedValues || []);
  // CONTRACT_TEMPLATES is intentionally empty now (see its declaration
  // above) - every template, including the original 6, lives in
  // contractLibrary. Kept as a no-op map so nothing breaks if it's ever
  // reintroduced for a one-off case.
  const clientLibrary = contractLibrary.filter(t => !isContractorDoc(t));
  const builtIn = CONTRACT_TEMPLATES.map(t => contractChecklistRowHtml(`builtin:${t.id}`, t.label, selectedValues)).join('');
  const uploaded = clientLibrary.map(t => contractChecklistRowHtml(`uploaded:${t.id}`, t.label, selectedValues)).join('');
  if (!clientLibrary.length && !CONTRACT_TEMPLATES.length) {
    sendContractTemplateList.innerHTML = '<div class="contract-attach-group-label">No contract templates yet - add one in the Contract Template Library above.</div>';
    return;
  }
  sendContractTemplateList.innerHTML =
    (CONTRACT_TEMPLATES.length ? `<div class="contract-attach-group-label">Built-in Templates</div>${builtIn}` : '') +
    (clientLibrary.length ? `<div class="contract-attach-group-label">Contract Templates</div>${uploaded}` : '');
}

// Re-renders the checklist (e.g. after an upload/replace/delete in the
// Contract Template Library changes what's available) without losing
// whatever the user already had checked in an open Send Contract panel.
function populateContractTemplateSelect() {
  const stillCheckedValues = sendContractTemplateList
    ? Array.from(sendContractTemplateList.querySelectorAll('.contract-attach-checkbox:checked')).map(cb => cb.value)
    : [];
  populateContractTemplateChecklist(stillCheckedValues);
}

function refreshSendContractMailto() {
  if (!sendContractTo) return;
  if (sendContractOpenBtn) {
    sendContractOpenBtn.href = `mailto:${encodeURIComponent(sendContractTo.value)}?subject=${encodeURIComponent(sendContractSubject.value)}&body=${encodeURIComponent(sendContractBody.value)}`;
  }
  if (sendContractGmailBtn) {
    // Gmail's web compose URL - opens the Gmail web app (or the Gmail
    // app, if it's set as the OS/browser handler for these links) with
    // the To/Subject/Body pre-filled, instead of whatever the OS default
    // mail app happens to be. Like mailto, this can't pre-attach the PDF -
    // that still has to be attached manually, or sent via the "Send with
    // PDF attached" button instead.
    const params = new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: sendContractTo.value,
      su: sendContractSubject.value,
      body: sendContractBody.value,
    });
    sendContractGmailBtn.href = `https://mail.google.com/mail/?${params.toString()}`;
  }
}

if (sendContractCloseBtn) {
  sendContractCloseBtn.addEventListener('click', () => {
    if (sendContractPanel) sendContractPanel.style.display = 'none';
  });
}

[sendContractTo, sendContractSubject, sendContractBody].forEach(elx => {
  if (elx) elx.addEventListener('input', refreshSendContractMailto);
});

if (sendContractCopyBtn) {
  sendContractCopyBtn.addEventListener('click', async () => {
    const text = `To: ${sendContractTo.value}\nSubject: ${sendContractSubject.value}\n\n${sendContractBody.value}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        sendContractBody.select();
        document.execCommand('copy');
      }
      const original = sendContractCopyBtn.textContent;
      sendContractCopyBtn.textContent = 'Copied!';
      setTimeout(() => { sendContractCopyBtn.textContent = original; }, 2000);
    } catch (err) {
      console.error('Failed to copy contract email', err);
      alert('Failed to copy. Please manually select and copy the text.');
    }
  });
}

// contractLabels may be a single string (back-compat) or an array - an
// array of more than one produces "X, Y and Z" phrasing plus "is"/"are"
// agreement, since Send Contract can now attach multiple documents at once.
async function buildContractEmailText(clientName, contactName, contractLabels, amName) {
  const labels = Array.isArray(contractLabels) ? contractLabels : [contractLabels];
  const isPlural = labels.length > 1;
  const docPhrase = labels.length <= 1
    ? (labels[0] || '')
    : labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];

  let subject = `Your Contract${isPlural ? 's' : ''} with Revital Productions — ${clientName}`;
  let body = `Hi ${(contactName || clientName).split(' ')[0]},\n\nAttached ${isPlural ? 'are' : 'is'} your ${docPhrase} for ${clientName} — please review, sign, and return at your earliest convenience.\n\nIf anything in the agreement needs clarifying, just reply here and I'm happy to walk through it.\n\nThanks,\n${amName || 'The Revital Productions team'}`;

  if (isEmbedded && window.parent.fetchEmailTemplateById && window.parent.fillTemplateVars && window.parent.templateHtmlToPlainText) {
    try {
      const tpl = await window.parent.fetchEmailTemplateById('tpl-contract-send-21');
      if (tpl) {
        const vars = { contactName: contactName || clientName, clientName, contractName: docPhrase, accountManagerName: amName || 'The Revital Productions team' };
        subject = window.parent.fillTemplateVars(tpl.subjectLine || subject, vars);
        body = window.parent.templateHtmlToPlainText(window.parent.fillTemplateVars(tpl.content, vars));
      }
    } catch (e) {
      console.warn('Could not load contract email template, using fallback text:', e);
    }
  }
  return { subject, body };
}

async function openSendContractPanel(id) {
  const r = findRecord(id);
  if (!r) return;

  const client = findClientRecordByName(r.clientName);
  const config = (client && client.portalConfig) || {};
  const amName = (config.accountManagerName || '').trim();
  const amEmail = (config.accountManagerEmail || '').trim();
  const contactName = config.clientContactName || r.clientName;

  // Default to the first available template (built-in list first, then
  // the Contract Template Library) rather than assuming index 0 of either
  // array exists - CONTRACT_TEMPLATES is normally empty now.
  const defaultValue = CONTRACT_TEMPLATES.length
    ? `builtin:${CONTRACT_TEMPLATES[0].id}`
    : (contractLibrary.length ? `uploaded:${contractLibrary[0].id}` : null);
  populateContractTemplateChecklist(defaultValue ? [defaultValue] : []);
  const selectedLabels = getSelectedContractTemplates().map(t => t.label);
  const fallbackLabel = CONTRACT_TEMPLATES[0] ? CONTRACT_TEMPLATES[0].label : (contractLibrary[0] ? contractLibrary[0].label : 'contract');
  const { subject, body } = await buildContractEmailText(r.clientName, contactName, selectedLabels.length ? selectedLabels : [fallbackLabel], amName);

  sendContractTo.value = config.clientContactEmail || '';
  sendContractSubject.value = subject;
  sendContractBody.value = body;
  refreshSendContractMailto();

  currentContractContext = {
    record: r,
    contactName,
    amName,
    from: (amEmail && amName) ? `${amName} <${amEmail}>` : null
  };

  if (sendContractStatus) {
    sendContractStatus.textContent = currentContractContext.from
      ? (config.clientContactEmail ? '' : `No Contact Email on file for ${r.clientName} yet — enter one above before sending.`)
      : `Add ${r.clientName}'s Account Manager Name + Email in Client Portal Manager to enable sending.`;
    sendContractStatus.style.color = 'var(--text-muted)';
  }
  if (sendContractSendBtn) {
    sendContractSendBtn.disabled = !currentContractContext.from;
    sendContractSendBtn.textContent = 'Send with PDF attached';
  }
  updateDocusignButtonVisibility();

  if (sendContractRecipientNameGroup) sendContractRecipientNameGroup.style.display = 'none';

  if (sendContractPanel) {
    sendContractPanel.style.display = 'block';
    sendContractPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// For documents that don't have a tracked client to send against - a
// Model & Property Release going to talent/a location owner, a White-Label
// & Agency Partner Agreement going to another agency, etc. Same panel as
// openSendContractPanel above, but record stays null throughout (every
// downstream handler below checks for that instead of assuming a client
// record exists), and the recipient's name is typed in fresh each time
// instead of being pulled from a Client Portal Manager config that
// wouldn't apply to a non-client recipient anyway. "from" is left unset,
// which the /api/send-email worker already defaults sensibly (see
// handleSendEmail in _worker.js) - no Account Manager config needed.
async function openSendContractPanelStandalone() {
  const defaultValue = CONTRACT_TEMPLATES.length
    ? `builtin:${CONTRACT_TEMPLATES[0].id}`
    : (contractLibrary.length ? `uploaded:${contractLibrary[0].id}` : null);
  populateContractTemplateChecklist(defaultValue ? [defaultValue] : []);

  if (sendContractRecipientName) sendContractRecipientName.value = '';
  sendContractTo.value = '';
  sendContractSubject.value = '';
  sendContractBody.value = '';
  refreshSendContractMailto();

  currentContractContext = {
    record: null,
    contactName: '',
    amName: '',
    from: null
  };

  if (sendContractRecipientNameGroup) sendContractRecipientNameGroup.style.display = '';
  if (sendContractStatus) {
    sendContractStatus.textContent = 'Enter a recipient name and email, choose a document, then send.';
    sendContractStatus.style.color = 'var(--text-muted)';
  }
  if (sendContractSendBtn) {
    sendContractSendBtn.disabled = false;
    sendContractSendBtn.textContent = 'Send with PDF attached';
  }
  updateDocusignButtonVisibility();

  if (sendContractPanel) {
    sendContractPanel.style.display = 'block';
    sendContractPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

const openOneOffSendBtn = el('openOneOffSendBtn');
if (openOneOffSendBtn) {
  openOneOffSendBtn.addEventListener('click', openSendContractPanelStandalone);
}

if (sendContractRecipientName) {
  sendContractRecipientName.addEventListener('input', async () => {
    if (!currentContractContext || currentContractContext.record) return;
    const templates = getSelectedContractTemplates();
    const fallbackLabel = CONTRACT_TEMPLATES[0] ? CONTRACT_TEMPLATES[0].label : (contractLibrary[0] ? contractLibrary[0].label : 'document');
    const labels = templates.length ? templates.map(t => t.label) : [fallbackLabel];
    const name = sendContractRecipientName.value.trim() || 'there';
    const { subject, body } = await buildContractEmailText(name, name, labels, '');
    sendContractSubject.value = subject;
    sendContractBody.value = body;
    refreshSendContractMailto();
  });
}

if (sendContractTemplateList) {
  sendContractTemplateList.addEventListener('change', async (e) => {
    if (!e.target.classList || !e.target.classList.contains('contract-attach-checkbox')) return;
    if (!currentContractContext) return;
    const templates = getSelectedContractTemplates();
    const { record, contactName, amName } = currentContractContext;
    const fallbackLabel = CONTRACT_TEMPLATES[0] ? CONTRACT_TEMPLATES[0].label : (contractLibrary[0] ? contractLibrary[0].label : 'contract');
    const labels = templates.length ? templates.map(t => t.label) : [fallbackLabel];
    const nameForEmail = record ? record.clientName : ((sendContractRecipientName && sendContractRecipientName.value.trim()) || 'there');
    const { subject, body } = await buildContractEmailText(nameForEmail, record ? contactName : nameForEmail, labels, amName);
    sendContractSubject.value = subject;
    sendContractBody.value = body;
    refreshSendContractMailto();
    updateDocusignButtonVisibility();
  });
}

if (sendContractSendBtn) {
  sendContractSendBtn.addEventListener('click', async () => {
    if (!currentContractContext) return;
    // Per-client sends still require an Account Manager (from) configured
    // in Client Portal Manager, same as before - but a one-off send (no
    // tracked client, currentContractContext.record === null) never has
    // one to pull from, so it's exempt: the /api/send-email worker already
    // supplies a sensible default "from" when none is given.
    if (currentContractContext.record && !currentContractContext.from) return;
    if (!sendContractTo.value.trim()) {
      if (sendContractStatus) {
        sendContractStatus.textContent = 'Enter a recipient email address first.';
        sendContractStatus.style.color = 'var(--color-error, #f68d5f)';
      }
      return;
    }

    const templates = getSelectedContractTemplates();
    if (!templates.length) {
      if (sendContractStatus) {
        sendContractStatus.textContent = 'Choose at least one contract to attach.';
        sendContractStatus.style.color = 'var(--color-error, #f68d5f)';
      }
      return;
    }
    const { record } = currentContractContext;
    const recipientLabel = record ? record.clientName : ((sendContractRecipientName && sendContractRecipientName.value.trim()) || sendContractTo.value.trim());
    const labelList = templates.map(t => t.label).join(', ');

    sendContractSendBtn.disabled = true;
    sendContractSendBtn.textContent = templates.length > 1 ? 'Loading contracts...' : 'Loading contract...';
    if (sendContractStatus) sendContractStatus.textContent = '';

    try {
      const attachments = await Promise.all(templates.map(async (t) => {
        const base64 = await fetchPdfAsBase64(t.fetchUrl);
        if (!base64) throw new Error(`${t.label} produced no data`);
        return { filename: t.filename, content: base64 };
      }));

      sendContractSendBtn.textContent = 'Sending...';

      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: sendContractTo.value,
          subject: sendContractSubject.value,
          body: sendContractBody.value,
          from: currentContractContext.from,
          attachments
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }

      sendContractSendBtn.textContent = 'Sent ✓';
      if (sendContractStatus) {
        sendContractStatus.textContent = `Sent successfully with ${labelList} attached.`;
        sendContractStatus.style.color = 'var(--color-success, #10b981)';
      }

      // Reflect the send in the tracker itself, same as flipping the
      // Contract status dropdown by hand - only applies to a real tracked
      // client, obviously, since a one-off recipient has no such record.
      if (record && record.contractStatus === 'Not Sent') {
        record.contractStatus = 'Sent';
        record.contractSentDate = record.contractSentDate || todayStr();
        await persist();
        renderTable();
      }

      if (isEmbedded && window.parent.logAdminActivity) {
        window.parent.logAdminActivity('Contract sent for signature', recipientLabel);
      }
      if (isEmbedded && window.parent.showBanner) {
        window.parent.showBanner('success', `${labelList} emailed to ${recipientLabel}.`);
      }
    } catch (e) {
      console.error('Send contract email failed:', e);
      sendContractSendBtn.disabled = false;
      sendContractSendBtn.textContent = 'Send with PDF attached';
      if (sendContractStatus) {
        sendContractStatus.textContent = "Couldn't send automatically (" + e.message + ") - use Copy or \"Open in Email App\" instead.";
        sendContractStatus.style.color = 'var(--color-error, #f68d5f)';
      }
    }
  });
}

// Sends a real Docusign envelope for e-signature instead of a flat PDF
// attachment. Two paths (see updateDocusignButtonVisibility above):
//  - MSA checked alone: the existing Docusign-Template-based send.
//  - Any other selection where every checked document has anchor tags:
//    fetch each PDF, send them all as one combined envelope so the client
//    signs everything in one session (see handleDocusignSendEnvelope in
//    _worker.js for how the anchor tags get turned into tabs).
if (sendContractDocusignBtn) {
  sendContractDocusignBtn.addEventListener('click', async () => {
    if (!currentContractContext) return;
    if (!sendContractTo.value.trim()) {
      if (sendContractStatus) {
        sendContractStatus.textContent = 'Enter a recipient email address first.';
        sendContractStatus.style.color = 'var(--color-error, #f68d5f)';
      }
      return;
    }

    const templates = getSelectedContractTemplates();
    if (!templates.length) return;
    const soloMsa = templates.length === 1 && !!(templates[0].docusignTemplateId && templates[0].docusignRoleName);
    const allAnchorEligible = templates.every(t => t.docusignAnchorTags);
    if (!soloMsa && !allAnchorEligible) return;

    // The combined-documents path (everything except the MSA's solo
    // Docusign-Template send) has fill-in-the-blank fields baked in as
    // invisible anchors (Client Name, Effective Date, fees, etc - see
    // CONTRACT_FIELD_SCHEMA above). Collect those from the sender before
    // building the envelope so the client isn't signing a contract with
    // blank lines. If none apply (e.g. an arbitrary uploaded PDF with no
    // matching schema), skip straight to sending.
    if (!soloMsa) {
      const fields = getMergedContractFields(templates);
      if (fields.length) {
        openContractFieldFillPanel(fields, templates, soloMsa);
        return;
      }
    }
    await performDocusignSend(templates, soloMsa, {});
  });
}

function openContractFieldFillPanel(fields, templates, soloMsa) {
  const panel = el('contractFieldFillPanel');
  const container = el('contractFieldFillFields');
  const continueBtn = el('contractFieldFillContinueBtn');
  const closeBtn = el('contractFieldFillCloseBtn');
  if (!panel || !container || !continueBtn || !closeBtn) {
    // Panel markup missing for some reason - fall back to sending with no
    // field values rather than silently blocking the send entirely.
    performDocusignSend(templates, soloMsa, {});
    return;
  }
  const { record } = currentContractContext || {};
  container.innerHTML = fields.map(f => {
    const def = typeof f.default === 'function' ? (f.default(record) || '') : '';
    return `
      <div class="form-group">
        <label for="cff_${f.token}">${escapeHtmlLocal(f.label)}</label>
        <input type="text" id="cff_${f.token}" value="${escapeHtmlLocal(def)}">
      </div>`;
  }).join('');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  function cleanup() {
    continueBtn.removeEventListener('click', onContinue);
    closeBtn.removeEventListener('click', onClose);
  }
  async function onContinue() {
    const fieldValues = {};
    fields.forEach(f => {
      const input = el(`cff_${f.token}`);
      if (input && input.value.trim()) fieldValues[f.token] = input.value.trim();
    });
    panel.style.display = 'none';
    cleanup();
    await performDocusignSend(templates, soloMsa, fieldValues);
  }
  function onClose() {
    panel.style.display = 'none';
    cleanup();
  }
  continueBtn.addEventListener('click', onContinue);
  closeBtn.addEventListener('click', onClose);
}

async function performDocusignSend(templates, soloMsa, fieldValues) {
  const { record, contactName } = currentContractContext;
  const recipientLabel = record ? (contactName || record.clientName) : ((sendContractRecipientName && sendContractRecipientName.value.trim()) || sendContractTo.value.trim());
  const labelList = templates.map(t => t.label).join(', ');

  sendContractDocusignBtn.disabled = true;
  sendContractDocusignBtn.textContent = templates.length > 1 ? 'Preparing documents...' : 'Sending for signature...';
  if (sendContractStatus) sendContractStatus.textContent = '';

  try {
    let res;
    if (soloMsa) {
      res = await fetch('/api/docusign/send-envelope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: templates[0].docusignTemplateId,
          templateRoleName: templates[0].docusignRoleName,
          signerName: recipientLabel,
          signerEmail: sendContractTo.value,
          emailSubject: sendContractSubject.value
        })
      });
    } else {
      const documents = await Promise.all(templates.map(async (t) => {
        const base64 = await fetchPdfAsBase64(t.fetchUrl);
        if (!base64) throw new Error(`${t.label} produced no data`);
        return { name: t.filename, base64 };
      }));

      sendContractDocusignBtn.textContent = 'Sending for signature...';
      res = await fetch('/api/docusign/send-envelope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents,
          signerName: recipientLabel,
          signerEmail: sendContractTo.value,
          emailSubject: sendContractSubject.value,
          fieldValues
        })
      });
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Send failed (${res.status})`);
    }

    sendContractDocusignBtn.textContent = 'Sent ✓';
    if (sendContractStatus) {
      sendContractStatus.textContent = `Sent for e-signature via Docusign (envelope ${data.envelopeId}) - ${labelList}.`;
      sendContractStatus.style.color = 'var(--color-success, #10b981)';
    }

    // Same tracker-status reflection as the flat-PDF send path - only
    // applies to a real tracked client.
    if (record && record.contractStatus === 'Not Sent') {
      record.contractStatus = 'Sent';
      record.contractSentDate = record.contractSentDate || todayStr();
      await persist();
      renderTable();
    }

    if (isEmbedded && window.parent.logAdminActivity) {
      window.parent.logAdminActivity('Contract sent for e-signature (Docusign)', recipientLabel);
    }
    if (isEmbedded && window.parent.showBanner) {
      window.parent.showBanner('success', `${labelList} sent to ${recipientLabel} for e-signature via Docusign.`);
    }
  } catch (e) {
    console.error('Docusign envelope send failed:', e);
    sendContractDocusignBtn.disabled = false;
    sendContractDocusignBtn.textContent = 'Send for E-Signature (DocuSign)';
    if (sendContractStatus) {
      sendContractStatus.textContent = "Couldn't send via Docusign (" + e.message + ") - try \"Send with PDF attached\" instead.";
      sendContractStatus.style.color = 'var(--color-error, #f68d5f)';
    }
  }
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
    invoiceAmount: '',
    notes: ''
  });

  const ok = await persist();
  if (!ok) {
    records.pop();
    renderTable();
    return;
  }

  nameInput.value = '';
  updateClientNameHint();
  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Now tracking contract & invoice status for ${clientName}.`);
  }
}

function initListeners() {
  el('addTrackedClientBtn').addEventListener('click', addTrackedClient);
  el('showClosedToggle').addEventListener('change', renderTable);
  const nameInput = el('newClientName');
  if (nameInput) nameInput.addEventListener('input', updateClientNameHint);
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.initDismissibleCards) initDismissibleCards();
  applyContractLibraryEditPermission();
  populateClientDatalist();
  await loadRecords();
  renderTable();
  initListeners();
  await loadContractLibrary();

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
