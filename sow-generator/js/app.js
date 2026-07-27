/* ============================================================
   SOW GENERATOR — APP LOGIC
   One-shot document generator (no persisted log, unlike Change Order
   Generator) - fill in the deal details once, pick Full or One-Page
   Short Form, and get a finished, ready-to-sign Statement of Work PDF
   with no "(fill in)" placeholders left in it. Built from the two
   ClickUp SOW templates (the full 11-section version and the condensed
   one-pager) - internal-only "HOW TO USE" instructions and the
   attorney-review disclaimer from those source docs are intentionally
   left out of the generated PDF since a client should never see them.
   Same html2pdf pattern as Change Order Generator / Proposal Calculator.
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

function el(id) { return document.getElementById(id); }

function todayStr() {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

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

// clientName is free text (typed against a <datalist>), matched
// case-insensitively/trimmed - same pattern as Change Order Generator.
function findClientRecordByName(name) {
  const clients = getClients();
  const target = (name || '').trim().toLowerCase();
  if (!target) return null;
  const key = Object.keys(clients).find(k => k.trim().toLowerCase() === target);
  return key ? clients[key] : null;
}

let currentFormat = 'full';

const formatToggle = el('formatToggle');
if (formatToggle) {
  formatToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.format-toggle-btn');
    if (!btn) return;
    currentFormat = btn.getAttribute('data-format');
    formatToggle.querySelectorAll('.format-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
  });
}

function fmtDate(dateStr) {
  if (!dateStr) return '_____________________';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtMoney(value, waivedLabel) {
  const n = Number(value);
  if (!value || isNaN(n) || n <= 0) return waivedLabel || '$0';
  return '$' + n.toLocaleString();
}

const FORM_FIELDS = [
  'clientName', 'clientContactName', 'clientContactEmail', 'clientContactPhone',
  'preparedBy', 'sowDate', 'sowReference', 'proposalDate',
  'contractStartDate', 'contractEndDate', 'initialTerm',
  'monthlyRetainer', 'setupFee', 'governingParish'
];

function gatherForm() {
  const entry = {};
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    entry[id] = field.value.trim ? field.value.trim() : field.value;
  });
  entry.format = currentFormat;
  return entry;
}

function validateForm(entry) {
  if (!entry.clientName) return 'Enter a client name first.';
  return null;
}

// ── Signature block (shared by both formats) ──
// Wrapped in its own page-break-before:always div so it always lands as
// a fresh, predictable page - the #clientSigLine/#clientDateLine ids let
// generateSowPdfBytes() measure exactly where "Signature" and "Date"
// render for the Client column (via getBoundingClientRect, relative to
// #sowSignaturePage's own top-left) and bake real invisible
// [[SIG_CLIENT]]/[[DATE_CLIENT]] DocuSign anchor text at those precise
// coordinates after html2pdf rasterizes the page - see
// measureSignatureAnchors/bakeSignatureAnchors below.
function signatureBlockHtml(entry) {
  return `
    <div id="sowSignaturePage" style="page-break-before: always; margin:0; padding:0;">
    <h2 style="font-size: 16px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; margin: 28px 0 14px;">SIGNATURES</h2>
    <p style="font-size: 12px; line-height: 1.6; margin-bottom: 20px;">By signing below, both parties agree to the scope, fees, and terms outlined in this Statement of Work and the attached Proposal (Exhibit A).</p>
    <div style="display:flex; gap:40px; margin-bottom: 26px;">
      <div style="flex:1;">
        <div style="font-weight:700; font-size:12px; margin-bottom:10px;">Revital Productions</div>
        <div style="border-top:1px solid #1a1a1a; padding-top:4px; font-size:11px; margin-bottom:14px;">Signature</div>
        <div style="border-top:1px solid #1a1a1a; padding-top:4px; font-size:11px; margin-bottom:14px;">Printed Name</div>
        <div style="border-top:1px solid #1a1a1a; padding-top:4px; font-size:11px; margin-bottom:14px;">Title</div>
        <div style="border-top:1px solid #1a1a1a; padding-top:4px; font-size:11px;">Date</div>
      </div>
      <div style="flex:1;">
        <div style="font-weight:700; font-size:12px; margin-bottom:10px;">Client</div>
        <div id="clientSigLine" style="border-top:1px solid #1a1a1a; padding-top:4px; font-size:11px; margin-bottom:14px;">Signature</div>
        <div style="border-top:1px solid #1a1a1a; padding-top:4px; font-size:11px; margin-bottom:14px;">Printed Name</div>
        <div style="border-top:1px solid #1a1a1a; padding-top:4px; font-size:11px; margin-bottom:14px;">Title</div>
        <div style="border-top:1px solid #1a1a1a; padding-top:4px; font-size:11px; margin-bottom:14px;">Company: ${entry.clientName}</div>
        <div id="clientDateLine" style="border-top:1px solid #1a1a1a; padding-top:4px; font-size:11px;">Date</div>
      </div>
    </div>
    <h2 style="font-size: 15px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; margin: 20px 0 8px;">EXHIBIT A — PROPOSAL</h2>
    <p style="font-size: 12px; line-height: 1.6; color:#555;">Attach the Proposal PDF generated from the Hub Proposal Calculator, dated ${fmtDate(entry.proposalDate)}.</p>
    </div>
  `;
}

function headerHtml(entry, subtitle) {
  return `
    <div style="border-bottom: 3px solid #6366f1; padding-bottom: 16px; margin-bottom: 20px;">
      <div style="font-size: 11px; letter-spacing: 1.5px; color: #6366f1; font-weight: 700; text-transform: uppercase;">Revital Productions</div>
      <h1 style="font-size: 26px; margin: 6px 0 0;">Statement of Work${subtitle ? ' — ' + subtitle : ''}</h1>
    </div>
    <table style="width:100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; color:#555;">
      <tr><td style="padding:3px 0; width:160px;"><strong>SOW Date:</strong></td><td style="padding:3px 0;">${fmtDate(entry.sowDate)}</td></tr>
      <tr><td style="padding:3px 0;"><strong>SOW Reference #:</strong></td><td style="padding:3px 0;">${entry.sowReference || '—'}</td></tr>
      <tr><td style="padding:3px 0;"><strong>Proposal Reference:</strong></td><td style="padding:3px 0;">Proposal dated ${fmtDate(entry.proposalDate)} — attached as Exhibit A</td></tr>
      ${entry.preparedBy ? `<tr><td style="padding:3px 0;"><strong>Prepared By:</strong></td><td style="padding:3px 0;">${entry.preparedBy}</td></tr>` : ''}
    </table>
  `;
}

function partiesTableHtml(entry) {
  return `
    <table style="width:100%; border-collapse: collapse; margin-bottom: 14px; font-size: 12px;">
      <tr style="background:#f4f4f8;">
        <td style="padding:6px 10px;"></td>
        <td style="padding:6px 10px; font-weight:700;">Service Provider</td>
        <td style="padding:6px 10px; font-weight:700;">Client</td>
      </tr>
      <tr><td style="padding:6px 10px; font-weight:700;">Company</td><td style="padding:6px 10px;">Revital Productions</td><td style="padding:6px 10px;">${entry.clientName}</td></tr>
      <tr><td style="padding:6px 10px; font-weight:700;">Contact</td><td style="padding:6px 10px;">${entry.preparedBy || '—'}</td><td style="padding:6px 10px;">${entry.clientContactName || '—'}</td></tr>
      <tr><td style="padding:6px 10px; font-weight:700;">Email</td><td style="padding:6px 10px;">—</td><td style="padding:6px 10px;">${entry.clientContactEmail || '—'}</td></tr>
      <tr><td style="padding:6px 10px; font-weight:700;">Phone</td><td style="padding:6px 10px;">—</td><td style="padding:6px 10px;">${entry.clientContactPhone || '—'}</td></tr>
    </table>
    <p style="font-size: 12px; margin: 4px 0;"><strong>Contract Start Date:</strong> ${fmtDate(entry.contractStartDate)}</p>
    <p style="font-size: 12px; margin: 4px 0;"><strong>Contract End Date:</strong> ${entry.contractEndDate ? fmtDate(entry.contractEndDate) : 'Month-to-month'}</p>
    <p style="font-size: 12px; margin: 4px 0 14px;"><strong>Initial Term:</strong> ${entry.initialTerm || 'Month-to-month'}</p>
  `;
}

function sectionHtml(title, bodyHtml) {
  return `<h2 style="font-size: 15px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; margin: 20px 0 8px;">${title}</h2>${bodyHtml}`;
}

// ── FULL TEMPLATE (11 sections) ──
function buildFullSowContainer(entry) {
  const container = document.createElement('div');
  container.style.cssText = 'width: 8.5in; padding: 0.6in; font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff;';
  const p = (t) => `<p style="font-size: 12px; line-height: 1.6; margin: 0 0 10px;">${t}</p>`;

  container.innerHTML = `
    ${headerHtml(entry)}
    ${sectionHtml('SECTION 1 — PARTIES', partiesTableHtml(entry) + p('<strong>Renewal Terms:</strong> This SOW automatically renews for successive monthly periods unless either party provides written notice of cancellation in accordance with Section 6 below.'))}

    ${sectionHtml('SECTION 2 — SCOPE OF SERVICES', `
      ${p(`The services and investment to be provided under this Statement of Work are as outlined in the Proposal dated <strong>${fmtDate(entry.proposalDate)}</strong>, prepared by Revital Productions for <strong>${entry.clientName}</strong>, attached hereto as Exhibit A and incorporated herein by reference.`)}
      ${p(`The agreed monthly retainer is <strong>${fmtMoney(entry.monthlyRetainer)}</strong> per month. The agreed one-time setup fee is <strong>${fmtMoney(entry.setupFee, '$0 — waived')}</strong>.`)}
      ${p('<em>Specific deliverables, platforms, content quantities, and operational details will be confirmed at the kick-off call following completion of the Client Onboarding Form. Any confirmed details that expand on the Proposal scope will be documented in writing prior to work beginning.</em>')}
      <p style="font-size:12px; font-weight:700; margin: 12px 0 6px;">What Is Not Included:</p>
      <p style="font-size:12px; line-height:1.6; margin: 0 0 10px;">Unless explicitly listed in the attached Proposal, the following are excluded from this SOW and will be scoped and priced separately via Change Order: advertising platform fees and ad spend (billed directly to Client by the platform); software and platform subscription fees (e.g. email marketing tools, scheduling software); photography, videography, or on-location production shoots; and any services not explicitly listed in the attached Proposal.</p>
    `)}

    ${sectionHtml('SECTION 3 — FEES &amp; PAYMENT', `
      ${p('<strong>3.1 Payment Processor.</strong> All recurring retainer payments are processed through Stripe. By signing this SOW, Client authorizes Revital Productions to charge the payment method on file via Stripe on a recurring monthly basis.')}
      ${p('<strong>3.2 Billing Date.</strong> Recurring fees are billed on the 1st of each month, in advance for that month\'s services.')}
      ${p('<strong>3.3 First Payment.</strong> The first payment is due upon signing and confirms Client\'s intent to begin services. Work does not begin until the first payment is received.')}
      ${p('<strong>3.4 Payment Method.</strong> Client agrees to maintain a valid payment method on file with Stripe at all times. Client may update their payment method at any time via the Stripe customer portal.')}
      ${p('<strong>3.5 Failed Payments.</strong> If a payment fails, Stripe will automatically retry on Days 3, 5, 7, and 14. Client will receive automatic email notifications for each failed attempt.')}
      ${p('<strong>3.6 Service Suspension.</strong> If payment has not been collected after all retry attempts, Revital Productions reserves the right to immediately pause all services until the outstanding balance is resolved. Revital Productions is not liable for any delays or missed deadlines resulting from a service suspension due to non-payment.')}
      ${p('<strong>3.7 Reactivation.</strong> Services suspended due to non-payment will be reinstated within two business days of full payment received, subject to team availability. Revital Productions is not obligated to backfill work missed during the suspension period.')}
      ${p('<strong>3.8 Late Fee.</strong> Any outstanding balance not resolved within 30 days of the original billing date will accrue a late fee of 1.5% per month on the unpaid balance.')}
      ${p('<strong>3.9 Ad Spend.</strong> Ad spend is billed directly to Client by the advertising platform and is entirely separate from Revital Productions\' management fees. Client is solely responsible for funding their ad accounts.')}
      ${p('<strong>3.10 Chargebacks.</strong> Client agrees not to initiate a chargeback without first contacting Revital Productions in writing and allowing 10 business days to resolve the issue. Initiating a chargeback without prior notice constitutes a breach of this SOW.')}
      ${p('<strong>3.11 Refund Policy.</strong> All fees are non-refundable for services already rendered or the current billing period.')}
    `)}

    ${sectionHtml('SECTION 4 — HUB PORTAL ACCESS', `
      ${p('Upon signing, Client will receive access to their dedicated Hub portal at hub.revitalproductions.com. The Hub portal is Client\'s workspace for viewing active projects, content calendars, campaign briefs, assets, and completed work.')}
      ${p('<strong>4.1 Content Approvals.</strong> All content approvals must be submitted through the Hub portal Approvals tab.')}
      ${p('<strong>4.2 Revision Requests.</strong> All revision requests must be submitted through the Submit a Revision Quick Action in the Hub portal — not via email or text.')}
      ${p('<strong>4.3 Content Requests.</strong> New content ideas or campaign requests must be submitted through the Submit a Content Request Quick Action in the Hub portal.')}
      ${p('Hub portal access will be deactivated on the final day of service upon termination or expiration of this SOW.')}
    `)}

    ${sectionHtml('SECTION 5 — CLIENT RESPONSIBILITIES', `
      <p style="font-size:12px; line-height:1.6; margin:0 0 6px;">Client agrees to:</p>
      <ul style="font-size:12px; line-height:1.7; margin:0 0 10px; padding-left:20px;">
        <li>Complete the Client Onboarding Form before the kick-off call</li>
        <li>Submit all content approvals through the Hub portal Approvals tab within 48 hours of receiving a review notification</li>
        <li>Submit all revision requests through the Submit a Revision Quick Action in the Hub portal — not via email or text</li>
        <li>Provide access to all necessary platforms and accounts within 5 business days of signing</li>
        <li>Provide brand assets, content, and information requested by Revital Productions within 5 business days of the request</li>
        <li>Not make changes to any active campaigns or managed platforms without notifying Revital Productions first</li>
        <li>Maintain a valid payment method on file with Stripe at all times</li>
      </ul>
    `)}

    ${sectionHtml('SECTION 6 — TERM &amp; TERMINATION', `
      ${p('<strong>6.1</strong> Either party may terminate this SOW with 30 days written notice.')}
      ${p('<strong>6.2 Cancellation Deadline.</strong> Written cancellation notice must be received by Revital Productions no later than the 20th of the month to avoid being charged for the following month\'s retainer. Cancellations received after the 20th take effect at the end of the following billing cycle.')}
      ${p('<strong>6.3</strong> Revital Productions may terminate immediately if Client fails to pay any amount due within 15 days of the due date, initiates an unwarranted chargeback, or breaches any material term of this SOW.')}
      ${p('<strong>6.4</strong> Upon termination, Client shall pay all fees for services rendered through the termination date. No refunds will be issued for prepaid fees or the current billing period.')}
      ${p('<strong>6.5</strong> Hub portal access will be deactivated on the final day of service.')}
    `)}

    ${sectionHtml('SECTION 7 — SCOPE CHANGES', `
      ${p('<strong>7.1</strong> Any request that adds deliverables, platforms, or services not confirmed at kick-off requires a written Change Order signed by both parties before work begins.')}
      ${p('<strong>7.2</strong> Revital Productions will never begin out-of-scope work without a signed Change Order.')}
      ${p('<strong>7.3</strong> Rush delivery requests with less than 48 hours notice are subject to a rush fee of 25%–50% of the applicable fee.')}
    `)}

    ${sectionHtml('SECTION 8 — INTELLECTUAL PROPERTY', `
      ${p('<strong>8.1</strong> Upon receipt of full payment, all final deliverables become the exclusive property of Client.')}
      ${p('<strong>8.2</strong> Work in progress or unpaid deliverables remain the property of Revital Productions.')}
      ${p('<strong>8.3</strong> Revital Productions retains the right to display completed work in its portfolio and marketing materials unless Client requests otherwise in writing within 30 days of delivery.')}
      ${p('<strong>8.4</strong> Client grants Revital Productions a limited license to use Client\'s brand assets solely for the purpose of delivering services under this SOW.')}
    `)}

    ${sectionHtml('SECTION 9 — CONFIDENTIALITY', p('Both parties agree to keep all proprietary information, business strategies, client data, pricing, and trade secrets shared during this engagement strictly confidential. This obligation survives termination of this SOW for a period of three years.'))}

    ${sectionHtml('SECTION 10 — LIMITATION OF LIABILITY', `
      ${p('<strong>10.1</strong> Revital Productions\' total liability under this SOW shall not exceed the total fees paid by Client in the three months prior to the claim.')}
      ${p('<strong>10.2</strong> Revital Productions is not liable for indirect, incidental, or consequential damages.')}
      ${p('<strong>10.3</strong> Revital Productions does not guarantee specific results including revenue growth, follower counts, search rankings, or return on ad spend. Marketing outcomes depend on factors outside Revital Productions\' control.')}
    `)}

    ${sectionHtml('SECTION 11 — GENERAL PROVISIONS', `
      ${p('<strong>11.1 Entire Agreement.</strong> This SOW, together with the attached Proposal (Exhibit A) and any executed Master Service Agreement, constitutes the entire agreement between the parties with respect to the services described herein.')}
      ${p('<strong>11.2 Amendment.</strong> This SOW may only be amended by a written instrument signed by both parties or a signed Change Order.')}
      ${p(`<strong>11.3 Governing Law.</strong> This SOW is governed by the laws of the State of Louisiana. Any disputes shall be resolved in the courts of ${entry.governingParish ? entry.governingParish + ' Parish' : '_____________________ Parish'}, Louisiana.`)}
      ${p('<strong>11.4 Severability.</strong> If any provision of this SOW is found unenforceable, the remaining provisions continue in full effect.')}
      ${p('<strong>11.5 Force Majeure.</strong> Neither party shall be liable for delays caused by circumstances beyond their reasonable control.')}
    `)}

    ${signatureBlockHtml(entry)}
  `;
  return container;
}

// ── ONE-PAGE SHORT FORM ──
function buildShortSowContainer(entry) {
  const container = document.createElement('div');
  container.style.cssText = 'width: 8.5in; padding: 0.5in; font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff; font-size: 11px;';
  const p = (t) => `<p style="font-size: 11px; line-height: 1.5; margin: 0 0 8px;">${t}</p>`;

  container.innerHTML = `
    ${headerHtml(entry, 'Short Form')}
    ${partiesTableHtml(entry)}

    ${sectionHtml('SCOPE OF SERVICES', `
      ${p(`The services, deliverables, and investment for this engagement are as outlined in the Proposal dated <strong>${fmtDate(entry.proposalDate)}</strong>, attached as Exhibit A and incorporated herein by reference.`)}
      ${p(`<strong>Monthly Retainer:</strong> ${fmtMoney(entry.monthlyRetainer)} &nbsp;&nbsp; <strong>One-Time Setup Fee:</strong> ${fmtMoney(entry.setupFee, '$0 — waived')}`)}
      ${p('Specific deliverables, platforms, and content quantities will be confirmed at the kick-off call following completion of the Client Onboarding Form.')}
      ${p('<strong>Not Included:</strong> Ad spend and platform fees (billed directly to Client); software subscriptions; photography or video shoots; any services not in the attached Proposal.')}
    `)}

    ${sectionHtml('FEES &amp; PAYMENT', `
      <ul style="font-size:11px; line-height:1.6; margin:0 0 8px; padding-left:18px;">
        <li>Payment Processor: Stripe — Client authorizes recurring monthly charges to the payment method on file</li>
        <li>Billing Date: 1st of each month, in advance</li>
        <li>First Payment: Due upon signing — work begins after payment received</li>
        <li>Failed Payments: Stripe retries automatically on Days 3, 5, 7, and 14 — Client notified by email each attempt</li>
        <li>Service Suspension: Services paused if payment not collected after all retry attempts</li>
        <li>Late Fee: 1.5% per month on balances outstanding beyond 30 days</li>
        <li>Cancellation Deadline: Written notice must be received by the 20th of the month to avoid the following month's charge</li>
        <li>Ad Spend: Billed directly to Client by ad platform — entirely separate from management fees</li>
        <li>Chargebacks: Client agrees not to initiate a chargeback without first contacting Revital Productions and allowing 10 business days to resolve</li>
        <li>Refunds: Non-refundable for services already rendered or the current billing period</li>
      </ul>
    `)}

    ${sectionHtml('HUB PORTAL', p('Client receives access to their Hub portal at hub.revitalproductions.com upon signing. All content approvals must be submitted through the Hub portal Approvals tab. All revision requests must be submitted through the Submit a Revision Quick Action in the Hub portal — not via email or text. Hub portal access is deactivated on the final day of service.'))}

    ${sectionHtml('KEY TERMS', `
      ${p('<strong>Client Responsibilities:</strong> Complete the Client Onboarding Form before kick-off | Submit approvals within 48 hours via Hub portal | Grant platform access within 5 business days of signing | Maintain valid payment method on file with Stripe')}
      ${p('<strong>Scope Changes:</strong> Any work outside the attached Proposal requires a signed Change Order before work begins. Rush delivery under 48 hours notice subject to 25%–50% rush fee.')}
      ${p('<strong>Termination:</strong> Either party may terminate with 30 days written notice. Notice must be received by the 20th of the month to avoid the following month\'s charge. No refunds for services already rendered. Hub portal deactivated on final day.')}
      ${p('<strong>Intellectual Property:</strong> All final paid-for deliverables become Client property upon full payment. Revital Productions may display completed work in its portfolio unless Client requests otherwise in writing within 30 days of delivery.')}
      ${p('<strong>Confidentiality:</strong> Both parties keep all shared business information confidential during and for 3 years after this engagement.')}
      ${p('<strong>Limitation of Liability:</strong> Revital Productions\' liability is limited to fees paid in the prior 3 months. No guarantee of specific results including revenue, rankings, or ROAS.')}
      ${p(`<strong>Governing Law:</strong> Laws of the State of Louisiana. Disputes resolved in ${entry.governingParish ? entry.governingParish + ' Parish' : '_____________________ Parish'} courts.`)}
    `)}

    ${signatureBlockHtml(entry)}
  `;
  return container;
}

function buildSowPdfPayload(entry) {
  const container = entry.format === 'short' ? buildShortSowContainer(entry) : buildFullSowContainer(entry);
  const opt = {
    margin: 0,
    filename: `${(entry.clientName || 'Client').replace(/\s+/g, '_')}_SOW_${entry.sowDate || todayStr()}.pdf`,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, letterRendering: true, useCORS: true },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };
  return { container, opt };
}

/* ── DocuSign anchor tag baking ──
   html2pdf/html2canvas rasterizes the whole page into an image, so the
   PDF it produces has no real, searchable text layer at all - DocuSign's
   anchorString tabs can't match against pixels. To fix that, we measure
   exactly where the Client "Signature"/"Date" lines land on the (always
   page-break-forced) signature page BEFORE rendering, generate the flat
   PDF as normal, then use pdf-lib to stamp real (invisible) text at those
   coordinates on the finished PDF's last page. Same anchor strings
   ([[SIG_CLIENT]] / [[DATE_CLIENT]]) as the 6 built-in contract
   templates, so the Contract & Invoice Tracker's combined-envelope
   DocuSign flow treats a library-added SOW exactly like any other. */

const PX_TO_PT = 0.75; // CSS reference: 96px = 1in, PDF points: 72pt = 1in

async function measureSignatureAnchors(container) {
  // getBoundingClientRect() only returns real values once an element is
  // part of the document's layout tree, so attach off-screen first. The
  // container's own width is a fixed `8.5in` (not viewport-relative), so
  // this produces identical geometry to whatever html2canvas renders.
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden;';
  wrapper.appendChild(container);
  document.body.appendChild(wrapper);

  let offsets = null;
  try {
    const pageBreakEl = container.querySelector('#sowSignaturePage');
    const sigEl = container.querySelector('#clientSigLine');
    const dateEl = container.querySelector('#clientDateLine');
    if (pageBreakEl && sigEl && dateEl) {
      const pageRect = pageBreakEl.getBoundingClientRect();
      const sigRect = sigEl.getBoundingClientRect();
      const dateRect = dateEl.getBoundingClientRect();
      offsets = {
        sigXPt: (sigRect.left - pageRect.left) * PX_TO_PT,
        sigYPt: (sigRect.top - pageRect.top) * PX_TO_PT,
        dateXPt: (dateRect.left - pageRect.left) * PX_TO_PT,
        dateYPt: (dateRect.top - pageRect.top) * PX_TO_PT
      };
    }
  } finally {
    wrapper.removeChild(container);
    document.body.removeChild(wrapper);
  }
  return offsets;
}

async function bakeSignatureAnchors(pdfBytes, offsets) {
  if (!offsets || typeof PDFLib === 'undefined') return pdfBytes; // degrades to a plain flat PDF
  try {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1]; // signature page is always last (forced page-break, nothing follows it)
    const { height: pageHeightPt } = lastPage.getSize();
    const place = (text, xPt, yFromTopPt) => {
      lastPage.drawText(text, {
        x: Math.max(xPt, 0),
        y: Math.max(pageHeightPt - yFromTopPt - 9, 0), // -9 nudges onto the label's line itself
        size: 1,
        font,
        color: rgb(1, 1, 1), // white
        opacity: 0            // and fully transparent - belt and suspenders
      });
    };
    place('[[SIG_CLIENT]]', offsets.sigXPt, offsets.sigYPt);
    place('[[DATE_CLIENT]]', offsets.dateXPt, offsets.dateYPt);
    return await pdfDoc.save();
  } catch (e) {
    console.error('Could not embed DocuSign anchor tags in SOW PDF (non-fatal - flat PDF still works):', e);
    return pdfBytes;
  }
}

// Single source of truth for generating the SOW's final PDF bytes -
// used by Download, Email to Client, and Add to Contract Library alike,
// so all three always produce the exact same (anchor-tagged) file.
async function generateSowPdfBytes(entry) {
  const { container, opt } = buildSowPdfPayload(entry);
  const offsets = await measureSignatureAnchors(container);
  const arrayBuffer = await html2pdf().set(opt).from(container).outputPdf('arraybuffer');
  const bytes = await bakeSignatureAnchors(new Uint8Array(arrayBuffer), offsets);
  return { bytes, filename: opt.filename };
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function downloadSowPdf() {
  const entry = gatherForm();
  const err = validateForm(entry);
  if (err) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', err);
    else alert(err);
    return;
  }
  if (typeof html2pdf === 'undefined') {
    alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
    return;
  }
  const { bytes, filename } = await generateSowPdfBytes(entry);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const downloadPdfBtn = el('downloadPdfBtn');
if (downloadPdfBtn) {
  downloadPdfBtn.addEventListener('click', async () => {
    downloadPdfBtn.disabled = true;
    const original = downloadPdfBtn.textContent;
    downloadPdfBtn.textContent = 'Generating...';
    try {
      await downloadSowPdf();
    } finally {
      downloadPdfBtn.disabled = false;
      downloadPdfBtn.textContent = original;
    }
  });
}

/* ── Email to Client (real auto-send via Resend, PDF attached) ──
   Same pattern as Change Order Generator. */

const emailToClientPanel = el('emailToClientPanel');
const emailToClientTo = el('emailToClientTo');
const emailToClientSubject = el('emailToClientSubject');
const emailToClientBody = el('emailToClientBody');
const emailToClientOpenBtn = el('emailToClientOpenBtn');
const emailToClientCopyBtn = el('emailToClientCopyBtn');
const emailToClientSendBtn = el('emailToClientSendBtn');
const emailToClientStatus = el('emailToClientStatus');
const emailToClientCloseBtn = el('emailToClientCloseBtn');

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
      console.error('Failed to copy SOW email', err);
      alert('Failed to copy. Please manually select and copy the text.');
    }
  });
}

const openEmailBtn = el('openEmailBtn');
if (openEmailBtn) {
  openEmailBtn.addEventListener('click', () => {
    const entry = gatherForm();
    const err = validateForm(entry);
    if (err) {
      if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', err);
      else alert(err);
      return;
    }

    const client = findClientRecordByName(entry.clientName);
    const config = (client && client.portalConfig) || {};
    const amName = (config.accountManagerName || entry.preparedBy || '').trim();
    const amEmail = (config.accountManagerEmail || '').trim();
    const contactName = config.clientContactName || entry.clientContactName || entry.clientName;

    emailToClientTo.value = entry.clientContactEmail || config.clientContactEmail || '';
    emailToClientSubject.value = `Your Statement of Work — ${entry.clientName}`;
    emailToClientBody.value = `Hi ${contactName.split(' ')[0]},\n\nAttached is your Statement of Work for ${entry.clientName} — please review, sign, and return at your earliest convenience along with the attached Proposal (Exhibit A).\n\nIf anything needs clarifying, just reply here and I'm happy to walk through it.\n\nThanks,\n${amName || 'The Revital Productions team'}`;
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
      emailToClientStatus.textContent = currentEmailContext.from
        ? (emailToClientTo.value ? '' : 'Enter a recipient email address above before sending.')
        : `Add ${entry.clientName}'s Account Manager Name + Email in Client Portal Manager to enable one-click sending (or use Copy / Open in Email App instead).`;
      emailToClientStatus.style.color = 'var(--text-muted)';
    }

    if (emailToClientPanel) {
      emailToClientPanel.style.display = 'block';
      emailToClientPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

if (emailToClientSendBtn) {
  emailToClientSendBtn.addEventListener('click', async () => {
    if (!currentEmailContext || !currentEmailContext.from) return;
    if (!emailToClientTo.value.trim()) {
      if (emailToClientStatus) {
        emailToClientStatus.textContent = 'Enter a recipient email address first.';
        emailToClientStatus.style.color = 'var(--color-error, #f68d5f)';
      }
      return;
    }
    if (typeof html2pdf === 'undefined') {
      alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
      return;
    }

    emailToClientSendBtn.disabled = true;
    emailToClientSendBtn.textContent = 'Generating PDF...';
    if (emailToClientStatus) emailToClientStatus.textContent = '';

    const { entry } = currentEmailContext;

    try {
      const { bytes, filename } = await generateSowPdfBytes(entry);
      const base64 = bytesToBase64(bytes);
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
          attachments: [{ filename, content: base64 }]
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }

      emailToClientSendBtn.textContent = 'Sent ✓';
      if (emailToClientStatus) {
        emailToClientStatus.textContent = 'Sent successfully with the SOW PDF attached.';
        emailToClientStatus.style.color = 'var(--color-success, #10b981)';
      }
      if (isEmbedded && window.parent.logAdminActivity) {
        window.parent.logAdminActivity('SOW emailed to client', entry.clientName);
      }
      if (isEmbedded && window.parent.showBanner) {
        window.parent.showBanner('success', `SOW emailed to ${entry.clientName}.`);
      }
    } catch (e) {
      console.error('Send SOW email failed:', e);
      emailToClientSendBtn.disabled = false;
      emailToClientSendBtn.textContent = 'Send with PDF attached';
      if (emailToClientStatus) {
        emailToClientStatus.textContent = "Couldn't send automatically (" + e.message + ") - use Copy or \"Open in Email App\" instead.";
        emailToClientStatus.style.color = 'var(--color-error, #f68d5f)';
      }
    }
  });
}

/* ── Add to Contract Template Library (for DocuSign e-signature) ──
   Bakes the anchor-tagged PDF (same generateSowPdfBytes() used by
   Download/Email above), uploads it to R2 via the same /api/contracts
   route the Contract & Invoice Tracker's own upload form uses, then adds
   an entry to agency/contractTemplates in Firestore with
   docusignAnchorTags: true. From that point on it behaves exactly like
   any other library contract - selectable, replaceable, deletable, and
   combinable with the MSA/other templates in one DocuSign envelope from
   the tracker's Send Contract panel. */

function sowUid() {
  return 'sow-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

async function uploadSowPdfToR2(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const form = new FormData();
  form.append('file', blob, filename);
  const res = await fetch('/api/contracts', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || `Upload failed (${res.status})`);
  return data.key;
}

function getContractLibraryDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "contractTemplates");
}

async function addSowToContractLibrary(entry, bytes, filename) {
  if (!isEmbedded || !window.parent.firebaseGetDoc || !window.parent.firebaseSetDocFromJSON) {
    throw new Error("Can't reach the Contract Template Library outside the Hub.");
  }
  const ref = getContractLibraryDocRef();
  const key = await uploadSowPdfToR2(bytes, filename);

  // Re-read right before writing (rather than trusting a version read at
  // the start) so a concurrent edit made in the Contract & Invoice
  // Tracker while this upload was in flight isn't clobbered.
  const snap = await window.parent.firebaseGetDoc(ref);
  const data = snap && snap.exists ? snap.data() : null;
  const list = (data && data.list) || [];
  const version = (data && data.version) || 0;

  const label = `${entry.clientName} SOW (${entry.format === 'short' ? 'Short Form' : 'Full'})`;
  list.push({
    id: sowUid(),
    label,
    r2Key: key,
    filename,
    uploadedAt: todayStr(),
    docusignAnchorTags: true
  });

  await window.parent.firebaseSetDocFromJSON(ref, JSON.stringify({ list, version: version + 1 }));
  return label;
}

let addToLibraryStatusTimer = null;
function setAddToLibraryStatus(msg, isError) {
  const elx = el('addToLibraryStatus');
  if (!elx) return;
  elx.textContent = msg;
  elx.style.color = isError ? 'var(--color-error, #f68d5f)' : 'var(--color-success, #10b981)';
  if (addToLibraryStatusTimer) clearTimeout(addToLibraryStatusTimer);
  if (msg) {
    addToLibraryStatusTimer = setTimeout(() => {
      if (elx.textContent === msg) elx.textContent = '';
    }, 60000);
  }
}

const addToLibraryBtn = el('addToLibraryBtn');
if (addToLibraryBtn) {
  addToLibraryBtn.addEventListener('click', async () => {
    const entry = gatherForm();
    const err = validateForm(entry);
    if (err) {
      if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', err);
      else alert(err);
      return;
    }
    if (typeof html2pdf === 'undefined') {
      alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
      return;
    }
    if (typeof PDFLib === 'undefined') {
      alert('The DocuSign anchor library failed to load. Please check your internet connection or disable ad-blockers.');
      return;
    }
    if (!isEmbedded) {
      setAddToLibraryStatus("Open this tool from inside the Hub dashboard to add to the Contract Template Library.", true);
      return;
    }

    const original = addToLibraryBtn.textContent;
    addToLibraryBtn.disabled = true;
    addToLibraryBtn.textContent = 'Generating PDF...';
    setAddToLibraryStatus('', false);

    try {
      const { bytes, filename } = await generateSowPdfBytes(entry);
      addToLibraryBtn.textContent = 'Uploading...';
      const label = await addSowToContractLibrary(entry, bytes, filename);
      setAddToLibraryStatus(`Added "${label}" to the Contract Template Library — it's now selectable (and combinable with the MSA/other templates) in Send Contract's DocuSign flow.`, false);
      if (window.parent.logAdminActivity) window.parent.logAdminActivity('SOW added to Contract Template Library', entry.clientName);
      if (window.parent.showBanner) window.parent.showBanner('success', `Added "${label}" to the Contract Template Library.`);
    } catch (e) {
      console.error('Add SOW to Contract Library failed:', e);
      setAddToLibraryStatus("Couldn't add to the library: " + e.message, true);
    } finally {
      addToLibraryBtn.disabled = false;
      addToLibraryBtn.textContent = original;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  el('sowDate').value = todayStr();
  el('proposalDate').value = todayStr();
  el('contractStartDate').value = todayStr();
  populateClientDatalist();
});
