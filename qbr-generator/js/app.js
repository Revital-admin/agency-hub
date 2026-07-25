/* ============================================================
   QBR GENERATOR — APP LOGIC
   Own client-select dropdown (same pattern as Case Study Builder), rather
   than the global active client. Read-only over data that already lives
   elsewhere - health history (client.weeklyCheckins), deliverables
   (client.approvalHistory), referrals (agency/referrals, name-matched -
   same pattern fetchReferralSummaries in the parent Hub's app.js uses),
   billing (agency/contractInvoices, name-matched), and open revisions
   (agency/revisionFeedbackLog, name-matched - same source the Agency
   Health Dashboard uses). Nothing here writes anywhere.
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
  await Promise.all([
    renderReferrals(clientName),
    renderBilling(clientName),
    renderRevisions(clientName)
  ]);
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
    const container = document.createElement('div');
    container.style.cssText = 'width: 8.5in; padding: 0.6in; font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff;';

    const healthHtml = document.getElementById('healthTrendList').innerHTML;
    const deliverablesSummaryHtml = document.getElementById('deliverablesSummary').innerHTML;
    const deliverablesListHtml = document.getElementById('deliverablesList').innerHTML;
    const referralsHtml = document.getElementById('referralsSummary').innerHTML;
    const billingHtml = document.getElementById('billingSummaryBlock').innerHTML;
    const revisionsHtml = document.getElementById('revisionsSummary').innerHTML;

    // Reuse the already-rendered section markup but strip the dark-theme
    // classes down to plain text - this document needs to print on white,
    // same convention as the Change Order Generator's signable PDF.
    const stripToText = (html) => html
      .replace(/<span class="qbr-health-dot[^"]*"><\/span>/g, '')
      .replace(/<[^>]+>/g, (tag) => tag.startsWith('</div') || tag.startsWith('<div') ? '\n' : ' ')
      .replace(/\s+\n/g, '\n').trim();

    container.innerHTML = `
      <div style="border-bottom: 3px solid #6366f1; padding-bottom: 16px; margin-bottom: 24px;">
        <div style="font-size: 11px; letter-spacing: 1.5px; color: #6366f1; font-weight: 700; text-transform: uppercase;">Revital Productions</div>
        <h1 style="font-size: 26px; margin: 6px 0 0;">Quarterly Business Review</h1>
        <p style="font-size: 13px; color: #555; margin: 4px 0 0;">${escapeHtml(clientName)} — ${new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
      </div>
      <h3 style="font-size: 14px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px;">Client health trend</h3>
      <pre style="font-size:12px; white-space:pre-wrap; font-family:inherit; margin-bottom:18px;">${stripToText(healthHtml)}</pre>
      <h3 style="font-size: 14px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px;">Deliverables &amp; approvals</h3>
      <pre style="font-size:12px; white-space:pre-wrap; font-family:inherit;">${stripToText(deliverablesSummaryHtml)}</pre>
      <pre style="font-size:12px; white-space:pre-wrap; font-family:inherit; margin-bottom:18px;">${stripToText(deliverablesListHtml)}</pre>
      <h3 style="font-size: 14px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px;">Referrals</h3>
      <pre style="font-size:12px; white-space:pre-wrap; font-family:inherit; margin-bottom:18px;">${stripToText(referralsHtml)}</pre>
      <h3 style="font-size: 14px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px;">Billing &amp; contract</h3>
      <pre style="font-size:12px; white-space:pre-wrap; font-family:inherit; margin-bottom:18px;">${stripToText(billingHtml)}</pre>
      <h3 style="font-size: 14px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px;">Open revisions</h3>
      <pre style="font-size:12px; white-space:pre-wrap; font-family:inherit;">${stripToText(revisionsHtml)}</pre>
    `;

    const opt = {
      margin: 0,
      filename: `${clientName.replace(/\s+/g, '_')}_QBR_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, letterRendering: true, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    if (typeof html2pdf !== 'undefined') {
      await html2pdf().set(opt).from(container).save();
      if (window.parent.logAdminActivity) {
        window.parent.logAdminActivity("QBR PDF generated", clientName);
      }
    } else if (window.parent.showBanner) {
      window.parent.showBanner('error', 'PDF library failed to load.');
    }
  } catch (e) {
    console.error("QBR PDF error:", e);
    if (window.parent.showBanner) window.parent.showBanner('error', 'Something went wrong generating the QBR PDF.');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  el('clientSelect').addEventListener('change', renderQbr);
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
