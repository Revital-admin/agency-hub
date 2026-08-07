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
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: entries, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save change order log:", result.error);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', result.reason === 'conflict'
          ? "Someone else updated this log while you had it open. Reload the page to see their changes, then redo your edit."
          : "Couldn't save — your change may be lost: " + result.error.message);
      }
      return false;
    }
    docVersion = result.version;
    return true;
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
  FORM_FIELDS.forEach(fieldId => {
    if (fieldId === 'additionalCost') {
      setFormattedValue(el(fieldId), entry[fieldId] || '');
    } else {
      el(fieldId).value = entry[fieldId] || '';
    }
  });
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
// Pulled the container/opt building out of generateChangeOrderPdf so the
// Email to Client send flow below can produce the exact same signable
// document (as a data URI instead of a browser download) without
// duplicating this markup.
function buildChangeOrderPdfPayload(entry) {
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
      <tr><td style="padding:8px 12px; background:#f4f4f8; font-weight:700; width:50%;">Additional Cost</td><td style="padding:8px 12px; background:#f4f4f8;">${entry.additionalCost ? '$' + parseFormattedNumber(entry.additionalCost).toLocaleString() : '$0'}</td></tr>
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

  return { container, opt };
}

async function generateChangeOrderPdf(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  const { container, opt } = buildChangeOrderPdfPayload(entry);

  if (typeof html2pdf !== 'undefined') {
    await html2pdf().set(opt).from(container).save();
  } else if (window.parent.showBanner) {
    window.parent.showBanner('error', 'PDF library failed to load.');
  }
}

// clientName here is free text (typed against a <datalist>, not a locked
// dropdown - see clientOptions in index.html), so it isn't guaranteed to
// be an exact key into clientsDb the way it is in Renewal Tracker. Match
// case-insensitively/trimmed instead of a direct bracket lookup, same
// spirit as the agency-wide name-matching used for contractInvoices/
// referrals elsewhere in the Hub.
function findClientRecordByName(name) {
  const clients = getClients();
  const target = (name || '').trim().toLowerCase();
  if (!target) return null;
  const key = Object.keys(clients).find(k => k.trim().toLowerCase() === target);
  return key ? clients[key] : null;
}

/* ── Email to Client (real auto-send via Resend, PDF attached) ──
   Same pattern as Welcome Guide Gen / Intake Request Gen / Client
   Renewal Tracker: generate the PDF in-memory (reusing
   buildChangeOrderPdfPayload above) and POST it + the email fields to
   /api/send-email, using this change order's own row instead of a
   single active client. */

const emailToClientPanel = document.getElementById('emailToClientPanel');
const emailToClientTo = document.getElementById('emailToClientTo');
const emailToClientSubject = document.getElementById('emailToClientSubject');
const emailToClientBody = document.getElementById('emailToClientBody');
const emailToClientOpenBtn = document.getElementById('emailToClientOpenBtn');
const emailToClientCopyBtn = document.getElementById('emailToClientCopyBtn');
const emailToClientSendBtn = document.getElementById('emailToClientSendBtn');
const emailToClientStatus = document.getElementById('emailToClientStatus');
const emailToClientCloseBtn = document.getElementById('emailToClientCloseBtn');

let currentEmailContext = null; // { entry, from }

function refreshEmailToClientMailto() {
  if (!emailToClientOpenBtn || !emailToClientTo) return;
  emailToClientOpenBtn.href = `mailto:${encodeURIComponent(emailToClientTo.value)}?subject=${encodeURIComponent(emailToClientSubject.value)}&body=${encodeURIComponent(emailToClientBody.value)}`;
}

if (emailToClientCloseBtn) {
  emailToClientCloseBtn.addEventListener('click', () => {
    if (emailToClientPanel) emailToClientPanel.style.display = 'none';
  });
}

[emailToClientTo, emailToClientSubject, emailToClientBody].forEach(elx => {
  if (elx) elx.addEventListener('input', refreshEmailToClientMailto);
});

if (emailToClientCopyBtn) {
  emailToClientCopyBtn.addEventListener('click', async () => {
    const text = `To: ${emailToClientTo.value}\nSubject: ${emailToClientSubject.value}\n\n${emailToClientBody.value}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        emailToClientBody.select();
        document.execCommand('copy');
      }
      const original = emailToClientCopyBtn.textContent;
      emailToClientCopyBtn.textContent = 'Copied!';
      setTimeout(() => { emailToClientCopyBtn.textContent = original; }, 2000);
    } catch (err) {
      console.error('Failed to copy change order email', err);
      alert('Failed to copy. Please manually select and copy the text.');
    }
  });
}

function openEmailToClientPanel(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  const client = findClientRecordByName(entry.clientName);
  const config = (client && client.portalConfig) || {};
  if (!config.clientContactEmail) {
    alert(`${entry.clientName} has no Contact Email set in Client Portal Manager yet (or the name here doesn't exactly match a client in the Hub) - add one before emailing this change order.`);
    return;
  }

  const amName = (config.accountManagerName || '').trim();
  const amEmail = (config.accountManagerEmail || '').trim();
  const contactName = config.clientContactName || entry.clientName;

  emailToClientTo.value = config.clientContactEmail;
  emailToClientSubject.value = `Change Order for Sign-Off — ${entry.deliverableName}`;
  emailToClientBody.value = `Hi ${contactName.split(' ')[0]},\n\nAttached is a change order covering a request that falls outside our current signed scope for ${entry.deliverableName}. It outlines what's changing, why, and the additional cost/timeline impact.\n\nCould you review, sign, and send it back when you get a chance? Happy to jump on a call first if that's easier.\n\nThanks,\n${amName || 'The Revital Productions team'}`;
  refreshEmailToClientMailto();

  currentEmailContext = {
    entry,
    from: (amEmail && amName) ? `${amName} <${amEmail}>` : null
  };

  if (emailToClientSendBtn) {
    emailToClientSendBtn.style.display = currentEmailContext.from ? 'inline-block' : 'none';
    emailToClientSendBtn.disabled = false;
    emailToClientSendBtn.textContent = 'Send with PDF attached';
  }
  if (emailToClientStatus) {
    emailToClientStatus.textContent = currentEmailContext.from ? '' : `Add ${entry.clientName}'s Account Manager Name + Email in Client Portal Manager to enable sending.`;
    emailToClientStatus.style.color = 'var(--text-muted)';
  }

  if (emailToClientPanel) {
    emailToClientPanel.style.display = 'block';
    emailToClientPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

if (emailToClientSendBtn) {
  emailToClientSendBtn.addEventListener('click', async () => {
    if (!currentEmailContext || !currentEmailContext.from) return;
    if (typeof html2pdf === 'undefined') {
      alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
      return;
    }

    emailToClientSendBtn.disabled = true;
    emailToClientSendBtn.textContent = 'Generating PDF...';
    if (emailToClientStatus) emailToClientStatus.textContent = '';

    const { entry } = currentEmailContext;

    try {
      const { container, opt } = buildChangeOrderPdfPayload(entry);
      const dataUri = await html2pdf().set(opt).from(container).outputPdf('datauristring');
      const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
      if (!base64) throw new Error('PDF generation produced no data');

      emailToClientSendBtn.textContent = 'Sending...';

      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailToClientTo.value,
          subject: emailToClientSubject.value,
          body: emailToClientBody.value,
          from: currentEmailContext.from,
          attachments: [{ filename: opt.filename, content: base64 }]
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }

      emailToClientSendBtn.textContent = 'Sent ✓';
      if (emailToClientStatus) {
        emailToClientStatus.textContent = 'Sent successfully with the Change Order PDF attached.';
        emailToClientStatus.style.color = 'var(--color-success, #10b981)';
      }
      if (isEmbedded && window.parent.logAdminActivity) {
        window.parent.logAdminActivity('Change order emailed to client', entry.clientName);
      }
      if (isEmbedded && window.parent.showBanner) {
        window.parent.showBanner('success', `Change order emailed to ${entry.clientName}.`);
      }
    } catch (e) {
      console.error('Send change order email failed:', e);
      emailToClientSendBtn.disabled = false;
      emailToClientSendBtn.textContent = 'Send with PDF attached';
      if (emailToClientStatus) {
        emailToClientStatus.textContent = "Couldn't send automatically (" + e.message + ") - use Copy or \"Open in Email App\" instead.";
        emailToClientStatus.style.color = 'var(--color-error, #f68d5f)';
      }
    }
  });
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
      <td>${entry.additionalCost ? '$' + parseFormattedNumber(entry.additionalCost).toLocaleString() : '—'}</td>
      <td>${entry.additionalTimelineDays ? entry.additionalTimelineDays + 'd' : '—'}</td>
      <td><span class="section-tag ${statusTagClass(entry.status)}">${entry.status || 'Pending'}</span></td>
      <td>
        <div class="row-actions">
          <button class="pdf-btn btn-generate-pdf" data-id="${entry.id}">PDF</button>
          <button class="email-client-btn" data-id="${entry.id}">Email Client</button>
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
  document.querySelectorAll('.email-client-btn').forEach(btn => btn.addEventListener('click', () => openEmailToClientPanel(btn.getAttribute('data-id'))));
}

document.addEventListener('DOMContentLoaded', async () => {
  populateClientDatalist();
  resetForm();
  await loadEntries();
  renderTable();

  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('showResolvedToggle').addEventListener('change', renderTable);
  el('filterClientInput').addEventListener('input', renderTable);
  if (typeof attachCommaFormatting === 'function') attachCommaFormatting(el('additionalCost'));
  if (typeof attachSpinnerButtons === 'function') attachSpinnerButtons(el('additionalCost'), { step: 50 });

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
