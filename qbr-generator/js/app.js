/* ============================================================
   QBR GENERATOR — APP LOGIC
   Own client-select dropdown (same pattern as Case Study Builder), rather
   than the global active client. Read-only over data that already lives
   elsewhere - health history (client.weeklyCheckins), deliverables
   (client.approvalHistory), referrals (agency/referrals, name-matched -
   same pattern fetchReferralSummaries in the parent Hub's app.js uses),
   billing (agency/contractInvoices, name-matched), open revisions
   (agency/revisionFeedbackLog, name-matched - same source the Agency
   Health Dashboard uses), and budget pacing (client.budgetPacingList,
   same array the Budget Pacing Tracker reads/writes - a client can have
   more than one tracked project, Aug 2026). Nothing here writes
   anywhere.
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

function el(id) { return document.getElementById(id); }

function getClients() {
  if (isEmbedded) {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  return {};
}

function populateClientSelect() {
  const clients = getClients();
  const select = el('clientSelect');
  const prevValue = select.value;
  select.innerHTML = '<option value="">Select a client...</option>';
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  if (prevValue && clients[prevValue]) select.value = prevValue;
}

function currentClientName() { return el('clientSelect').value; }
function currentClient() { return getClients()[currentClientName()]; }

async function fetchAgencyList(docName) {
  if (!isEmbedded || !window.parent.firebaseDb || !window.parent.firebaseDb.collection) return [];
  try {
    const snap = await window.parent.firebaseDb.collection("agency").doc(docName).get();
    return (snap.exists && snap.data().list) || [];
  } catch (e) {
    console.warn(`Could not read agency/${docName}:`, e);
    return [];
  }
}

const HEALTH_DOT_CLASS = { Green: "qbr-health-green", Yellow: "qbr-health-yellow", Red: "qbr-health-red" };

function renderHealthTrend(client) {
  const listEl = el('healthTrendList');
  const checkins = Array.isArray(client.weeklyCheckins) ? client.weeklyCheckins.slice(0, 6) : [];
  if (checkins.length === 0) {
    listEl.innerHTML = '<div class="qbr-empty-note">No weekly check-ins logged yet.</div>';
    return;
  }
  listEl.innerHTML = checkins.map(c => `
    <div class="qbr-list-row">
      <span class="qbr-list-row-label"><span class="qbr-health-dot ${HEALTH_DOT_CLASS[c.healthRating] || 'qbr-health-none'}"></span>${c.date || 'Undated'}</span>
      <span class="qbr-list-row-meta">${c.healthRating || 'No rating'}${c.priority1 ? ' — ' + c.priority1 : ''}</span>
    </div>
  `).join('');
}

function renderDeliverables(client) {
  const history = Array.isArray(client.approvalHistory) ? client.approvalHistory : [];
  const approved = history.filter(h => h.decision === 'approved').length;
  const minor = history.filter(h => h.decision === 'minor').length;
  const revision = history.filter(h => h.decision === 'revision').length;

  el('deliverablesSummary').innerHTML = `
    <div class="qbr-stat"><div class="qbr-stat-num">${history.length}</div><div class="qbr-stat-label">Total decided</div></div>
    <div class="qbr-stat"><div class="qbr-stat-num">${approved}</div><div class="qbr-stat-label">Approved</div></div>
    <div class="qbr-stat"><div class="qbr-stat-num">${minor}</div><div class="qbr-stat-label">Minor corrections</div></div>
    <div class="qbr-stat"><div class="qbr-stat-num">${revision}</div><div class="qbr-stat-label">Revisions requested</div></div>
  `;

  const recent = history.slice().reverse().slice(0, 8);
  const listEl = el('deliverablesList');
  if (recent.length === 0) {
    listEl.innerHTML = '<div class="qbr-empty-note">No approval decisions logged yet.</div>';
    return;
  }
  listEl.innerHTML = recent.map(h => `
    <div class="qbr-list-row">
      <span class="qbr-list-row-label">${escapeHtml(h.title || 'Untitled')}</span>
      <span class="qbr-list-row-meta">${escapeHtml(h.decision || '')}${h.decidedAt ? ' — ' + new Date(h.decidedAt).toLocaleDateString() : ''}</span>
    </div>
  `).join('');
}

async function renderReferrals(clientName) {
  const list = await fetchAgencyList("referrals");
  const matches = list.filter(r => (r.referrerName || '').toLowerCase() === clientName.toLowerCase());
  const becameClient = matches.filter(r => r.status === 'Became Client').length;

  el('referralsSummary').innerHTML = `
    <div class="qbr-stat"><div class="qbr-stat-num">${matches.length}</div><div class="qbr-stat-label">Total referrals made</div></div>
    <div class="qbr-stat"><div class="qbr-stat-num">${becameClient}</div><div class="qbr-stat-label">Became clients</div></div>
  `;
}

async function renderBilling(clientName) {
  const list = await fetchAgencyList("contractInvoices");
  const match = list.find(r => (r.clientName || '').toLowerCase() === clientName.toLowerCase());
  const listEl = el('billingSummaryBlock');

  if (!match) {
    listEl.innerHTML = '<div class="qbr-empty-note">No contract/invoice record on file for this client.</div>';
    return;
  }

  listEl.innerHTML = `
    <div class="qbr-list-row"><span class="qbr-list-row-label">Contract status</span><span class="qbr-list-row-meta">${escapeHtml(match.contractStatus || '--')}</span></div>
    <div class="qbr-list-row"><span class="qbr-list-row-label">Renewal date</span><span class="qbr-list-row-meta">${escapeHtml(match.contractRenewalDate || '--')}</span></div>
    <div class="qbr-list-row"><span class="qbr-list-row-label">Invoice status</span><span class="qbr-list-row-meta">${escapeHtml(match.invoiceStatus || '--')}</span></div>
  `;
}

async function renderRevisions(clientName) {
  const list = await fetchAgencyList("revisionFeedbackLog");
  const open = list.filter(r => (r.clientName || '').toLowerCase() === clientName.toLowerCase() && !r.dateResolved).length;
  el('revisionsSummary').innerHTML = `
    <div class="qbr-stat"><div class="qbr-stat-num">${open}</div><div class="qbr-stat-label">Currently open</div></div>
  `;
}

function getPacingStatus(spent, total, startDate, endDate) {
  if (!total || total <= 0) return { label: 'Not set up', cls: 'qbr-health-none' };
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();
  if (now > end) return { label: 'Period ended', cls: 'qbr-health-none' };
  if (now < start) return { label: "Hasn't started", cls: 'qbr-health-none' };

  const totalDays = (end - start) / (1000 * 60 * 60 * 24);
  const daysPassed = (now - start) / (1000 * 60 * 60 * 24);
  const expectedPacingRatio = totalDays > 0 ? daysPassed / totalDays : 0;
  const actualPacingRatio = spent / total;

  if (actualPacingRatio > expectedPacingRatio * 1.15) return { label: 'Overspending', cls: 'qbr-health-red' };
  if (actualPacingRatio < expectedPacingRatio * 0.85) return { label: 'Underspending', cls: 'qbr-health-yellow' };
  return { label: 'On pace', cls: 'qbr-health-green' };
}

// A client can have more than one tracked project now (Budget Pacing
// Tracker, Aug 2026) - renders one block per project instead of one.
// Reads client.budgetPacingList defensively (falls back to a lone legacy
// client.budgetPacing) without migrating it, same convention as the root
// Hub's and Agency Health Dashboard's own copy of this helper.
function getBudgetPacingList(client) {
  if (!client) return [];
  if (Array.isArray(client.budgetPacingList)) return client.budgetPacingList;
  return client.budgetPacing ? [client.budgetPacing] : [];
}

function renderBudgetPacing(client) {
  const listEl = el('budgetPacingBlock');
  const projects = getBudgetPacingList(client);
  if (!projects.length) {
    listEl.innerHTML = '<div class="qbr-empty-note">No budget pacing tracked for this client.</div>';
    return;
  }
  const hasMultiple = projects.length > 1;
  const fmt = (p, v) => p.budgetType === 'Ad Spend' ? '$' + Number(v || 0).toLocaleString() : Number(v || 0) + ' hrs';

  listEl.innerHTML = projects.map(p => {
    const status = getPacingStatus(p.spentToDate, p.totalBudget, p.startDate, p.endDate);
    const label = hasMultiple ? `${escapeHtml(p.name || 'General')} — ${escapeHtml(p.budgetType || 'Retainer')}` : escapeHtml(p.budgetType || 'Retainer');
    return `
      <div class="qbr-list-row"><span class="qbr-list-row-label"><span class="qbr-health-dot ${status.cls}"></span>${label}</span><span class="qbr-list-row-meta">${status.label}</span></div>
      <div class="qbr-list-row"><span class="qbr-list-row-label">Spent to date</span><span class="qbr-list-row-meta">${fmt(p, p.spentToDate)} of ${fmt(p, p.totalBudget)}</span></div>
      <div class="qbr-list-row"><span class="qbr-list-row-label">Period</span><span class="qbr-list-row-meta">${escapeHtml(p.startDate || '--')} to ${escapeHtml(p.endDate || '--')}</span></div>
    `;
  }).join(hasMultiple ? '<div style="height:8px;"></div>' : '');
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

async function renderQbr() {
  const clientName = currentClientName();
  const client = currentClient();
  const emptyState = el('emptyState');
  const qbrInterface = el('qbrInterface');

  if (!clientName || !client) {
    emptyState.style.display = 'block';
    qbrInterface.style.display = 'none';
    return;
  }
  emptyState.style.display = 'none';
  qbrInterface.style.display = 'block';

  renderHealthTrend(client);
  renderDeliverables(client);
  renderBudgetPacing(client);
  await Promise.all([
    renderReferrals(clientName),
    renderBilling(clientName),
    renderRevisions(clientName)
  ]);
}

// Pulls the label/meta text out of the already-rendered ".qbr-list-row"
// rows inside a container (health trend, deliverables, billing, budget
// pacing all use this same row markup) - used as plain text for the PDF
// rather than re-fetching the underlying data a second time.
function rowsFromListBlock(id) {
  const container = document.getElementById(id);
  if (!container) return [];
  return Array.from(container.querySelectorAll('.qbr-list-row')).map(row => {
    const label = (row.querySelector('.qbr-list-row-label') || {}).textContent || '';
    const meta = (row.querySelector('.qbr-list-row-meta') || {}).textContent || '';
    return [label.trim(), meta.trim()];
  });
}

// Same idea for the ".qbr-stat" number+label cards (deliverables and
// referrals summaries both use this markup).
function statsFromBlock(id) {
  const container = document.getElementById(id);
  if (!container) return [];
  return Array.from(container.querySelectorAll('.qbr-stat')).map(stat => {
    const num = (stat.querySelector('.qbr-stat-num') || {}).textContent || '';
    const label = (stat.querySelector('.qbr-stat-label') || {}).textContent || '';
    return [label.trim(), num.trim()];
  });
}

function isEmptyNote(id) {
  const container = document.getElementById(id);
  return !!(container && container.querySelector('.qbr-empty-note'));
}

// Builds the QBR as a RevitalPDF report and returns the `r` wrapper
// (see ../shared/pdf-report.js) so the caller can either r.save(filename)
// for a browser download, or call r.doc.output(...) to get a data URI for
// the "Email to Client" send flow below - both need the exact same
// document, which is why this is split out from generateQbrPdf.
// Oct 2026 rebuild: switched from html2canvas/html2pdf (screenshotting a
// hidden container built from scraped, regex-stripped innerHTML) to the
// shared RevitalPDF module - reads the same already-rendered section data,
// but as structured text/table rows instead of HTML strings to strip.
function buildQbrReport(clientName) {
  if (typeof window.RevitalPDF === 'undefined') {
    throw new Error('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
  }
  const r = RevitalPDF.create({ reportTitle: 'QUARTERLY BUSINESS REVIEW', companyName: clientName });
  const period = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  r.coverPage({
    title: 'Quarterly Business Review',
    subLine: period,
    preparedFrom: `Account health, deliverables, referrals, billing, and budget pacing on file for ${clientName}.`,
  });

  r.newPage();
  r.sectionHeader('Client Health Trend');
  if (isEmptyNote('healthTrendList')) {
    r.paragraph('No weekly check-ins logged yet.', { italic: true, color: r.colors.GRAY });
  } else {
    r.tableBlock(['Date', 'Health / Priority'], rowsFromListBlock('healthTrendList'), [r.CONTENT_W * 0.3, r.CONTENT_W * 0.7]);
  }

  r.sectionHeader('Deliverables & Approvals');
  const delivStats = statsFromBlock('deliverablesSummary');
  if (delivStats.length) r.tableBlock(['Metric', 'Count'], delivStats, [r.CONTENT_W * 0.7, r.CONTENT_W * 0.3]);
  if (isEmptyNote('deliverablesList')) {
    r.paragraph('No approval decisions logged yet.', { italic: true, color: r.colors.GRAY });
  } else {
    r.paragraph('Recent decisions', { bold: true, size: 10, spaceAfter: 6 });
    r.tableBlock(['Title', 'Decision'], rowsFromListBlock('deliverablesList'), [r.CONTENT_W * 0.6, r.CONTENT_W * 0.4]);
  }

  r.newPage();
  r.sectionHeader('Referrals');
  const refStats = statsFromBlock('referralsSummary');
  if (refStats.length) r.tableBlock(['Metric', 'Count'], refStats, [r.CONTENT_W * 0.7, r.CONTENT_W * 0.3]);

  r.sectionHeader('Billing & Contract');
  if (isEmptyNote('billingSummaryBlock')) {
    r.paragraph('No contract/invoice record on file for this client.', { italic: true, color: r.colors.GRAY });
  } else {
    r.tableBlock(['Item', 'Status'], rowsFromListBlock('billingSummaryBlock'), [r.CONTENT_W * 0.4, r.CONTENT_W * 0.6]);
  }

  r.sectionHeader('Budget & Pacing');
  if (isEmptyNote('budgetPacingBlock')) {
    r.paragraph('No budget pacing tracked for this client.', { italic: true, color: r.colors.GRAY });
  } else {
    r.tableBlock(['Item', 'Status'], rowsFromListBlock('budgetPacingBlock'), [r.CONTENT_W * 0.4, r.CONTENT_W * 0.6]);
  }

  r.sectionHeader('Open Revisions');
  const revStats = statsFromBlock('revisionsSummary');
  if (revStats.length) r.tableBlock(['Metric', 'Count'], revStats, [r.CONTENT_W * 0.7, r.CONTENT_W * 0.3]);

  return r;
}

function qbrFilename(clientName) {
  return `${clientName.replace(/\s+/g, '_')}_QBR_${new Date().toISOString().slice(0, 10)}.pdf`;
}

async function generateQbrPdf() {
  const clientName = currentClientName();
  const client = currentClient();
  if (!clientName || !client) return;

  const btn = el('generatePdfBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Generating...";

  try {
    const r = buildQbrReport(clientName);
    r.save(qbrFilename(clientName));
    if (window.parent.logAdminActivity) {
      window.parent.logAdminActivity("QBR PDF generated", clientName);
    }
  } catch (e) {
    console.error("QBR PDF error:", e);
    if (window.parent.showBanner) window.parent.showBanner('error', 'Something went wrong generating the QBR PDF: ' + (e && e.message ? e.message : e));
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

/* ── Email to Client (real auto-send via Resend, PDF attached) ──
   Same pattern as Welcome Guide Gen / Intake Request Gen's "Email to
   Client" button: generate the PDF in-memory (reusing
   buildQbrPdfPayload above) and POST it + the email fields to
   /api/send-email, instead of triggering generateQbrPdf's browser
   download. */

const emailToClientPanel = document.getElementById('emailToClientPanel');
const emailToClientTo = document.getElementById('emailToClientTo');
const emailToClientSubject = document.getElementById('emailToClientSubject');
const emailToClientBody = document.getElementById('emailToClientBody');
const emailToClientOpenBtn = document.getElementById('emailToClientOpenBtn');
const emailToClientCopyBtn = document.getElementById('emailToClientCopyBtn');
const emailToClientSendBtn = document.getElementById('emailToClientSendBtn');
const emailToClientStatus = document.getElementById('emailToClientStatus');
const emailToClientCloseBtn = document.getElementById('emailToClientCloseBtn');
const emailToClientBtn = document.getElementById('emailToClientBtn');

let currentEmailToClientFrom = null;

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
      console.error('Failed to copy QBR email', err);
      alert('Failed to copy. Please manually select and copy the text.');
    }
  });
}

if (emailToClientBtn) {
  emailToClientBtn.addEventListener('click', () => {
    const clientName = currentClientName();
    const client = currentClient();
    if (!clientName || !client) {
      alert('Select a client first.');
      return;
    }
    const config = client.portalConfig || {};
    if (!config.clientContactEmail) {
      alert(`${clientName} has no Contact Email set in Client Portal Manager yet - add one before emailing the QBR.`);
      return;
    }

    const amName = (config.accountManagerName || '').trim();
    const amEmail = (config.accountManagerEmail || '').trim();
    const contactName = config.clientContactName || clientName;
    const period = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    emailToClientTo.value = config.clientContactEmail;
    emailToClientSubject.value = `Your Quarterly Business Review — ${clientName}`;
    emailToClientBody.value = `Hi ${contactName.split(' ')[0]},\n\nAttached is your Quarterly Business Review for ${period} - covering account health, deliverables, referrals, and billing/contract status.\n\nLet me know if you'd like to set up time to walk through it together.\n\nThanks,\n${amName || 'The Revital Productions team'}`;
    refreshEmailToClientMailto();

    currentEmailToClientFrom = (amEmail && amName) ? `${amName} <${amEmail}>` : null;
    if (emailToClientSendBtn) {
      emailToClientSendBtn.style.display = currentEmailToClientFrom ? 'inline-block' : 'none';
      emailToClientSendBtn.disabled = false;
      emailToClientSendBtn.textContent = 'Send with PDF attached';
    }
    if (emailToClientStatus) {
      emailToClientStatus.textContent = currentEmailToClientFrom ? '' : `Add ${clientName}'s Account Manager Name + Email in Client Portal Manager to enable sending.`;
      emailToClientStatus.style.color = 'var(--color-text-muted)';
    }

    if (emailToClientPanel) {
      emailToClientPanel.style.display = 'block';
      emailToClientPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

if (emailToClientSendBtn) {
  emailToClientSendBtn.addEventListener('click', async () => {
    if (!currentEmailToClientFrom) return;

    const clientName = currentClientName();
    const client = currentClient();
    if (!clientName || !client) return;

    emailToClientSendBtn.disabled = true;
    emailToClientSendBtn.textContent = 'Generating PDF...';
    if (emailToClientStatus) emailToClientStatus.textContent = '';

    try {
      const r = buildQbrReport(clientName);
      const filename = qbrFilename(clientName);
      // jsPDF's own datauristring output (replaces html2pdf's
      // outputPdf('datauristring') - same base64-after-the-comma shape).
      const dataUri = r.doc.output('datauristring');
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
          from: currentEmailToClientFrom,
          attachments: [{ filename: filename, content: base64 }]
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }

      emailToClientSendBtn.textContent = 'Sent ✓';
      if (emailToClientStatus) {
        emailToClientStatus.textContent = 'Sent successfully with the QBR PDF attached.';
        emailToClientStatus.style.color = 'var(--color-success, #22c55e)';
      }
      if (window.parent.logAdminActivity) {
        window.parent.logAdminActivity('QBR emailed to client', clientName);
      }
      if (window.parent.showBanner) {
        window.parent.showBanner('success', `QBR emailed to ${clientName}.`);
      }
    } catch (e) {
      console.error('Send QBR email failed:', e);
      emailToClientSendBtn.disabled = false;
      emailToClientSendBtn.textContent = 'Send with PDF attached';
      if (emailToClientStatus) {
        emailToClientStatus.textContent = "Couldn't send automatically (" + e.message + ") - use Copy or \"Open in Email App\" instead.";
        emailToClientStatus.style.color = 'var(--color-error, #ef4444)';
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  el('clientSelect').addEventListener('change', () => {
    // The email panel's To/Subject/Body and the pending PDF are all
    // scoped to whichever client was selected when it was opened -
    // hide it on a client switch rather than risk sending the new
    // client's QBR to the previous client's contact email (or vice
    // versa) if the account manager forgets to reopen it.
    if (emailToClientPanel) emailToClientPanel.style.display = 'none';
    renderQbr();
  });
  el('generatePdfBtn').addEventListener('click', generateQbrPdf);
  renderQbr();

  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    if (Object.keys(getClients()).length > 0) {
      populateClientSelect();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
