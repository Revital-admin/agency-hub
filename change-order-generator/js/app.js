/* ============================================================
   CHANGE ORDER GENERATOR — APP LOGIC
   Agency-wide (not tied to a single client): stores its own list at
   agency/changeOrders. Same optimistic-concurrency version-guard as the
   other full-overwrite trackers built this session. Adds one thing they
   don't need: a per-row "Generate PDF" button that builds a one-page
   branded change order document via html2pdf (same library the Proposal
   Calculator uses) for sending to the client for sign-off.
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

let entries = [];
let editingId = null;
let docVersion = 0; // optimistic-concurrency guard, see persist() below

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "changeOrders");
}

async function loadEntries() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      entries = (data && data.list) || [];
      docVersion = (data && data.version) || 0;
      return;
    } catch (e) {
      console.error("Couldn't load change orders from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load the change order log: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('change-order-generator-list');
    entries = saved ? JSON.parse(saved) : [];
  } catch (e) { entries = []; }
}

// Optimistic-concurrency guard, same pattern as the other full-overwrite
// trackers: re-check the doc's version right before writing and refuse
// to clobber a newer save made elsewhere in the meantime.
async function persist() {
  if (isEmbedded && window.parent.firebaseSetDocFromJSON && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const freshSnap = await window.parent.firebaseGetDoc(ref);
      const freshData = freshSnap && freshSnap.exists ? freshSnap.data() : null;
      const freshVersion = (freshData && freshData.version) || 0;

      if (freshVersion !== docVersion) {
        if (window.parent.showBanner) {
          window.parent.showBanner('error', "Someone else updated this log while you had it open. Reload the page to see their changes, then redo your edit.");
        }
        return false;
      }

      docVersion = freshVersion + 1;
      // A plain object literal built in this iframe's own JS realm gets
      // rejected by Firestore ("a custom Object object") when handed
      // straight to a Firestore call bound to the parent page - pass a
      // JSON string instead so the parent parses it in its own realm.
      await window.parent.firebaseSetDocFromJSON(ref, JSON.stringify({ list: entries, version: docVersion }));
      return true;
    } catch (e) {
      console.error("Couldn't save change order log:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't save — your change may be lost: " + e.message);
      return false;
    }
  }
  try { localStorage.setItem('change-order-generator-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'co-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function getClients() {
  if (isEmbedded && typeof window.parent.getAllClients === 'function') {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  return {};
}

function populateClientDatalist() {
  const list = el('clientOptions');
  const clients = getClients();
  list.innerHTML = Object.keys(clients).filter(name => name !== SANDBOX_NAME).sort().map(name => `<option value="${name}">`).join('');
}

const FORM_FIELDS = ['clientName', 'deliverableName', 'originalScope', 'requestedChange', 'reasonOutOfScope', 'additionalCost', 'additionalTimelineDays', 'dateCreated', 'status'];

function todayStr() {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

function resetForm() {
  editingId = null;
  FORM_FIELDS.forEach(id => { el(id).value = ''; });
  el('dateCreated').value = todayStr();
  el('status').value = 'Pending';
  el('saveEntryBtn').textContent = 'Log Change Order';
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    entry[id] = field.value.trim ? field.value.trim() : field.value;
  });
  return entry;
}

function saveEntry() {
  const clientName = el('clientName').value.trim();
  const deliverableName = el('deliverableName').value.trim();
  if (!clientName || !deliverableName) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Client name and deliverable are required.');
    return;
  }

  const entry = gatherForm();
  if (editingId) {
    const idx = entries.findIndex(e => e.id === editingId);
    if (idx >= 0) entries[idx] = entry;
  } else {
    entries.unshift(entry);
  }

  persist().then(ok => {
    if (!ok) return;
    resetForm();
    populateClientDatalist();
    renderTable();
    if (window.parent.showBanner) window.parent.showBanner('success', `Logged change order for ${clientName} — ${deliverableName}.`);
  });
}

function startEdit(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  FORM_FIELDS.forEach(fieldId => { el(fieldId).value = entry[fieldId] || ''; });
  el('saveEntryBtn').textContent = 'Update Change Order';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Remove the change order for ${entry.clientName} — ${entry.deliverableName}?`)) return;
  entries = entries.filter(e => e.id !== id);
  persist().then(ok => {
    if (!ok) return;
    if (editingId === id) resetForm();
    renderTable();
  });
}

// ── PDF Generation ──
async function generateChangeOrderPdf(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  const container = document.createElement('div');
  container.style.cssText = 'width: 8.5in; padding: 0.6in; font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff;';
  container.innerHTML = `
    <div style="border-bottom: 3px solid #6366f1; padding-bottom: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; letter-spacing: 1.5px; color: #6366f1; font-weight: 700; text-transform: uppercase;">Revital Productions</div>
      <h1 style="font-size: 26px; margin: 6px 0 0;">Change Order</h1>
    </div>
    <table style="width:100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
      <tr><td style="padding:6px 0; font-weight:700; width:180px;">Client</td><td style="padding:6px 0;">${entry.clientName}</td></tr>
      <tr><td style="padding:6px 0; font-weight:700;">Deliverable / Project</td><td style="padding:6px 0;">${entry.deliverableName}</td></tr>
      <tr><td style="padding:6px 0; font-weight:700;">Date</td><td style="padding:6px 0;">${entry.dateCreated || todayStr()}</td></tr>
    </table>
    <h3 style="font-size: 14px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; margin-bottom: 8px;">Original Scope</h3>
    <p style="font-size: 13px; line-height: 1.6; margin-bottom: 18px;">${entry.originalScope || '—'}</p>
    <h3 style="font-size: 14px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; margin-bottom: 8px;">Requested Change</h3>
    <p style="font-size: 13px; line-height: 1.6; margin-bottom: 18px;">${entry.requestedChange || '—'}</p>
    <h3 style="font-size: 14px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; margin-bottom: 8px;">Why This Falls Outside the Signed SOW</h3>
    <p style="font-size: 13px; line-height: 1.6; margin-bottom: 18px;">${entry.reasonOutOfScope || '—'}</p>
    <table style="width:100%; border-collapse: collapse; margin: 24px 0; font-size: 13px;">
      <tr><td style="padding:8px 12px; background:#f4f4f8; font-weight:700; width:50%;">Additional Cost</td><td style="padding:8px 12px; background:#f4f4f8;">${entry.additionalCost ? '$' + Number(entry.additionalCost).toLocaleString() : '$0'}</td></tr>
      <tr><td style="padding:8px 12px; font-weight:700;">Additional Timeline</td><td style="padding:8px 12px;">${entry.additionalTimelineDays ? entry.additionalTimelineDays + ' day(s)' : '0 days'}</td></tr>
    </table>
    <div style="margin-top: 60px; display:flex; gap:40px;">
      <div style="flex:1; border-top: 1px solid #1a1a1a; padding-top: 6px; font-size: 12px;">Client Signature &amp; Date</div>
      <div style="flex:1; border-top: 1px solid #1a1a1a; padding-top: 6px; font-size: 12px;">Revital Productions &amp; Date</div>
    </div>
  `;

  const opt = {
    margin: 0,
    filename: `${entry.clientName.replace(/\s+/g, '_')}_Change_Order_${entry.dateCreated || todayStr()}.pdf`,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, letterRendering: true, useCORS: true },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  if (typeof html2pdf !== 'undefined') {
    await html2pdf().set(opt).from(container).save();
  } else if (window.parent.showBanner) {
    window.parent.showBanner('error', 'PDF library failed to load.');
  }
}

function statusTagClass(status) {
  if (status === 'Approved') return 'status-approved';
  if (status === 'Declined') return 'status-declined';
  return 'status-pending';
}

function renderSummary() {
  el('summaryPending').textContent = entries.filter(e => e.status === 'Pending' || !e.status).length;
  el('summaryApproved').textContent = entries.filter(e => e.status === 'Approved').length;
  el('summaryDeclined').textContent = entries.filter(e => e.status === 'Declined').length;
}

function renderTable() {
  renderSummary();

  const showResolved = el('showResolvedToggle').checked;
  const filterClient = el('filterClientInput').value.trim().toLowerCase();

  const rows = entries.filter(e => {
    if (!showResolved && e.status && e.status !== 'Pending') return false;
    if (filterClient && !e.clientName.toLowerCase().includes(filterClient)) return false;
    return true;
  });

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="client-cell">${entry.clientName}</td>
      <td>${entry.deliverableName}</td>
      <td>${(entry.requestedChange || '').slice(0, 80)}${(entry.requestedChange || '').length > 80 ? '…' : ''}</td>
      <td>${entry.additionalCost ? '$' + Number(entry.additionalCost).toLocaleString() : '—'}</td>
      <td>${entry.additionalTimelineDays ? entry.additionalTimelineDays + 'd' : '—'}</td>
      <td><span class="section-tag ${statusTagClass(entry.status)}">${entry.status || 'Pending'}</span></td>
      <td>
        <div class="row-actions">
          <button class="pdf-btn btn-generate-pdf" data-id="${entry.id}">PDF</button>
          <button class="edit-btn" data-id="${entry.id}">Edit</button>
          <button class="remove-btn" data-id="${entry.id}">Remove</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => startEdit(btn.getAttribute('data-id'))));
  document.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => removeEntry(btn.getAttribute('data-id'))));
  document.querySelectorAll('.pdf-btn').forEach(btn => btn.addEventListener('click', () => generateChangeOrderPdf(btn.getAttribute('data-id'))));
}

document.addEventListener('DOMContentLoaded', async () => {
  populateClientDatalist();
  resetForm();
  await loadEntries();
  renderTable();

  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('showResolvedToggle').addEventListener('change', renderTable);
  el('filterClientInput').addEventListener('input', renderTable);

  // Same iframe-race fix used across the other cross-client tools: the
  // client datalist can be empty if this loads before the parent Hub's
  // clientsDb has synced. Poll briefly and re-populate once real data shows up.
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    if (Object.keys(getClients()).length > 0) {
      populateClientDatalist();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
