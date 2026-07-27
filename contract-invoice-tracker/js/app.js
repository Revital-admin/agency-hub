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
      <td><input type="text" class="amount-input" data-id="${r.id}" value="${(r.invoiceAmount || '').replace(/"/g, '&quot;')}" placeholder="$0.00"></td>
      <td><input type="date" class="due-date-input" data-id="${r.id}" value="${r.invoiceDueDate || ''}"></td>
      <td class="date-cell">${r.invoicePaidDate || '--'}</td>
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
// docusignAnchorTags: true means the PDF has invisible "[[SIG_CLIENT]]" /
// "[[DATE_CLIENT]]" text baked into the Client signature block (all 6, as
// of this session), letting it be combined with any other anchor-tagged
// document into a single Docusign envelope. MSA additionally has a real
// Docusign Template (docusignTemplateId/docusignRoleName) - that solo
// path is used only when MSA is the *only* document checked; anything
// else (MSA plus others, or any other document alone) goes through the
// combined-envelope anchor-tag path instead. See handleDocusignSendEnvelope
// in _worker.js.
const CONTRACT_TEMPLATES = [
  { id: 'msa', label: 'Master Service Agreement', file: 'Master Service Agreement - Revital Productions.pdf', docusignTemplateId: '9021581d-1a78-4dc4-8400-288845f74dfa', docusignRoleName: 'Client', docusignAnchorTags: true },
  { id: 'independent-contractor', label: 'Independent Contractor Agreement', file: 'Independent Contractor Agreement - Revital Productions.pdf', docusignAnchorTags: true },
  { id: 'creative-services', label: 'Creative Services Agreement', file: 'Creative Services Agreement - Revital Productions.pdf', docusignAnchorTags: true },
  { id: 'social-media-growth', label: 'Social Media Growth Agreement', file: 'Social Media Growth Agreement - Revital Productions.pdf', docusignAnchorTags: true },
  { id: 'nda-msa', label: 'NDA (Tied to MSA)', file: 'NDA - Tied To MSA - Revital Productions.pdf', docusignAnchorTags: true },
  { id: 'nda-independent', label: 'NDA (Independent Contract)', file: 'NDA - Independent Contract - Revital Productions.pdf', docusignAnchorTags: true }
];

function escapeHtmlLocal(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/* ── Contract Template Library (uploaded contracts, on top of the 6
   built-ins above) ──
   The 6 CONTRACT_TEMPLATES above still live as static files under
   /contracts/ - editing one means replacing the file in the codebase and
   redeploying. Anything added here instead goes through /api/contracts
   (see _worker.js), which stores the actual PDF in an R2 bucket and
   returns a key; only that key + a label is saved to Firestore
   (agency/contractTemplates), same optimistic-concurrency read-check-
   write pattern as agency/contractInvoices above. This is what lets
   contracts be added/replaced/removed from this screen directly, no
   code change or redeploy required. */

let contractLibrary = [];
let contractLibraryDocVersion = 0;

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
  if (!isEmbedded || !window.parent.firebaseSetDocFromJSON || !window.parent.firebaseGetDoc) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', "Can't save the contract library outside the Hub.");
    return false;
  }
  try {
    const ref = getContractLibraryDocRef();
    const freshSnap = await window.parent.firebaseGetDoc(ref);
    const freshData = freshSnap && freshSnap.exists ? freshSnap.data() : null;
    const freshVersion = (freshData && freshData.version) || 0;
    if (freshVersion !== contractLibraryDocVersion) {
      if (window.parent.showBanner) {
        window.parent.showBanner('error', "Someone else updated the contract library while you had it open. Reload to see their changes.");
      }
      return false;
    }
    contractLibraryDocVersion = freshVersion + 1;
    await window.parent.firebaseSetDocFromJSON(ref, JSON.stringify({ list: contractLibrary, version: contractLibraryDocVersion }));
    return true;
  } catch (e) {
    console.error("Couldn't save the contract template library:", e);
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', "Couldn't save: " + e.message);
    return false;
  }
}

function setContractLibraryStatus(msg, isError) {
  const elx = el('contractLibraryStatus');
  if (!elx) return;
  elx.textContent = msg;
  elx.style.color = isError ? 'var(--color-error, #f68d5f)' : 'var(--color-success, #10b981)';
}

function renderContractLibrary() {
  const list = el('contractLibraryList');
  if (!list) return;
  if (contractLibrary.length === 0) {
    list.innerHTML = `<p style="font-size:13px;color:var(--color-text-muted);">No uploaded contracts yet — the 6 built-in templates are still available below in Send Contract.</p>`;
    return;
  }
  list.innerHTML = contractLibrary.map(t => `
    <div class="contract-library-row" data-id="${t.id}">
      <div>
        <div class="contract-library-name">${escapeHtmlLocal(t.label)}</div>
        <div class="contract-library-meta">${escapeHtmlLocal(t.filename || '')} &middot; uploaded ${t.uploadedAt || '--'}</div>
      </div>
      <div class="contract-library-actions">
        <label class="contract-replace-label">
          Replace
          <input type="file" accept="application/pdf" data-id="${t.id}" class="replace-contract-input" style="display:none;">
        </label>
        <button type="button" class="delete-contract-btn" data-id="${t.id}">Delete</button>
      </div>
    </div>
  `).join('');
}

async function uploadPdfToR2(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/contracts', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || `Upload failed (${res.status})`);
  return data.key;
}

function deleteR2Object(key) {
  // Best-effort cleanup - if this fails, an orphaned object is left in
  // R2, which costs a few cents of storage but breaks nothing, so it's
  // not worth blocking or surfacing an error over.
  fetch('/api/contracts/' + encodeURIComponent(key), { method: 'DELETE' }).catch(e => {
    console.warn('Could not delete old contract file from storage (non-fatal):', e);
  });
}

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
    const label = newContractLabel.value.trim();
    const file = newContractFile.files[0];
    if (!label) { setContractLibraryStatus('Enter a name for this contract first.', true); return; }
    if (!file) { setContractLibraryStatus('Choose a PDF file first.', true); return; }
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setContractLibraryStatus('Please choose a PDF file.', true);
      return;
    }

    uploadContractBtn.disabled = true;
    uploadContractBtn.textContent = 'Uploading...';
    try {
      const key = await uploadPdfToR2(file);
      contractLibrary.push({ id: uid(), label, r2Key: key, filename: file.name, uploadedAt: todayStr() });
      const ok = await persistContractLibrary();
      if (!ok) { contractLibrary.pop(); throw new Error('Could not save — try again'); }
      newContractLabel.value = '';
      newContractFile.value = '';
      refreshNewContractFileName();
      renderContractLibrary();
      populateContractTemplateSelect();
      setContractLibraryStatus(`Added "${label}".`, false);
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
  const id = e.target.getAttribute('data-id');
  const file = e.target.files[0];
  if (!file) return;
  const entry = contractLibrary.find(t => t.id === id);
  if (!entry) return;

  setContractLibraryStatus(`Replacing "${entry.label}"...`, false);
  const oldKey = entry.r2Key;
  try {
    const key = await uploadPdfToR2(file);
    entry.r2Key = key;
    entry.filename = file.name;
    entry.uploadedAt = todayStr();
    const ok = await persistContractLibrary();
    if (!ok) throw new Error('Could not save — try again');
    deleteR2Object(oldKey);
    renderContractLibrary();
    populateContractTemplateSelect();
    setContractLibraryStatus(`Replaced "${entry.label}".`, false);
  } catch (err) {
    console.error('Contract replace failed:', err);
    setContractLibraryStatus("Couldn't replace: " + err.message, true);
  } finally {
    e.target.value = '';
  }
});

document.addEventListener('click', async (e) => {
  if (!e.target.matches('.delete-contract-btn')) return;
  const id = e.target.getAttribute('data-id');
  const entry = contractLibrary.find(t => t.id === id);
  if (!entry) return;
  if (!confirm(`Delete "${entry.label}"? This can't be undone.`)) return;

  const previous = contractLibrary;
  contractLibrary = contractLibrary.filter(t => t.id !== id);
  const ok = await persistContractLibrary();
  if (!ok) { contractLibrary = previous; return; }
  deleteR2Object(entry.r2Key);
  renderContractLibrary();
  populateContractTemplateSelect();
});

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
      docusignAnchorTags: false,
      docusignTemplateId: null,
      docusignRoleName: null
    };
  }
  return null;
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
const sendContractTo = el('sendContractTo');
const sendContractSubject = el('sendContractSubject');
const sendContractBody = el('sendContractBody');
const sendContractOpenBtn = el('sendContractOpenBtn');
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
  const builtIn = CONTRACT_TEMPLATES.map(t => contractChecklistRowHtml(`builtin:${t.id}`, t.label, selectedValues)).join('');
  const uploaded = contractLibrary.map(t => contractChecklistRowHtml(`uploaded:${t.id}`, t.label, selectedValues)).join('');
  sendContractTemplateList.innerHTML =
    `<div class="contract-attach-group-label">Built-in Templates</div>${builtIn}` +
    (contractLibrary.length ? `<div class="contract-attach-group-label">Uploaded Templates</div>${uploaded}` : '');
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
  if (!sendContractOpenBtn || !sendContractTo) return;
  sendContractOpenBtn.href = `mailto:${encodeURIComponent(sendContractTo.value)}?subject=${encodeURIComponent(sendContractSubject.value)}&body=${encodeURIComponent(sendContractBody.value)}`;
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

  populateContractTemplateChecklist([`builtin:${CONTRACT_TEMPLATES[0].id}`]);
  const selectedLabels = getSelectedContractTemplates().map(t => t.label);
  const { subject, body } = await buildContractEmailText(r.clientName, contactName, selectedLabels.length ? selectedLabels : [CONTRACT_TEMPLATES[0].label], amName);

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

  if (sendContractPanel) {
    sendContractPanel.style.display = 'block';
    sendContractPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

if (sendContractTemplateList) {
  sendContractTemplateList.addEventListener('change', async (e) => {
    if (!e.target.classList || !e.target.classList.contains('contract-attach-checkbox')) return;
    if (!currentContractContext) return;
    const templates = getSelectedContractTemplates();
    const { record, contactName, amName } = currentContractContext;
    const labels = templates.length ? templates.map(t => t.label) : [CONTRACT_TEMPLATES[0].label];
    const { subject, body } = await buildContractEmailText(record.clientName, contactName, labels, amName);
    sendContractSubject.value = subject;
    sendContractBody.value = body;
    refreshSendContractMailto();
    updateDocusignButtonVisibility();
  });
}

if (sendContractSendBtn) {
  sendContractSendBtn.addEventListener('click', async () => {
    if (!currentContractContext || !currentContractContext.from) return;
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
      // Contract status dropdown by hand.
      if (record.contractStatus === 'Not Sent') {
        record.contractStatus = 'Sent';
        record.contractSentDate = record.contractSentDate || todayStr();
        await persist();
        renderTable();
      }

      if (isEmbedded && window.parent.logAdminActivity) {
        window.parent.logAdminActivity('Contract sent for signature', record.clientName);
      }
      if (isEmbedded && window.parent.showBanner) {
        window.parent.showBanner('success', `${labelList} emailed to ${record.clientName}.`);
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

    const { record, contactName } = currentContractContext;
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
            signerName: contactName || record.clientName,
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
            signerName: contactName || record.clientName,
            signerEmail: sendContractTo.value,
            emailSubject: sendContractSubject.value
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

      // Same tracker-status reflection as the flat-PDF send path.
      if (record.contractStatus === 'Not Sent') {
        record.contractStatus = 'Sent';
        record.contractSentDate = record.contractSentDate || todayStr();
        await persist();
        renderTable();
      }

      if (isEmbedded && window.parent.logAdminActivity) {
        window.parent.logAdminActivity('Contract sent for e-signature (Docusign)', record.clientName);
      }
      if (isEmbedded && window.parent.showBanner) {
        window.parent.showBanner('success', `${labelList} sent to ${record.clientName} for e-signature via Docusign.`);
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
  });
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
