/* ============================================================
   PORTFOLIO SHOWCASE — APP LOGIC
   Read-only, agency-wide: no Firestore doc of its own. Pulls every
   case study across every client's clients[name].caseStudies array
   (same source Case Study Builder writes to) where featured === true
   ("Portfolio-Ready"), lets you pick which ones to include and add an
   optional "Prepared For" name + cover note, then renders a single
   branded multi-page PDF via html2pdf (cover page + one page per
   selected case study) — the sales-facing deliverable this data was
   captured for in the first place.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.getAllClients === 'function') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

function el(id) { return document.getElementById(id); }

function getClients() {
  if (isEmbedded) {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  return {};
}

const SANDBOX_NAME = "Quick Sandbox (One-Offs)";

let items = []; // portfolio-ready case studies, each with a clientName tacked on
let selectedIds = new Set();

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function collectPortfolioReadyCaseStudies() {
  const clients = getClients();
  const result = [];
  Object.keys(clients).forEach(clientName => {
    if (clientName === SANDBOX_NAME) return;
    const client = clients[clientName];
    const caseStudies = client && Array.isArray(client.caseStudies) ? client.caseStudies : [];
    caseStudies.forEach(cs => {
      if (cs.featured) result.push({ ...cs, clientName });
    });
  });
  result.sort((a, b) => (b.createdDate || '').localeCompare(a.createdDate || ''));
  return result;
}

function loadItems() {
  items = collectPortfolioReadyCaseStudies();
  // Keep prior selections for items that still exist; default new/first
  // loads to everything selected.
  const stillValid = new Set(items.map(i => i.id));
  selectedIds = new Set([...selectedIds].filter(id => stillValid.has(id)));
  if (selectedIds.size === 0) items.forEach(i => selectedIds.add(i.id));
}

function updateSummary() {
  el('summaryTotal').textContent = items.length;
  el('summarySelected').textContent = selectedIds.size;
  const selectedClients = new Set(items.filter(i => selectedIds.has(i.id)).map(i => i.clientName));
  el('summaryClients').textContent = selectedClients.size;
}

function renderList() {
  updateSummary();
  const container = el('showcaseList');
  el('emptyState').style.display = items.length === 0 ? 'block' : 'none';

  container.innerHTML = items.map(cs => {
    const checked = selectedIds.has(cs.id);
    return `<label class="showcase-card ${checked ? '' : 'is-unchecked'}">
      <input type="checkbox" class="showcase-checkbox" data-id="${cs.id}" ${checked ? 'checked' : ''}>
      <div class="showcase-card-body">
        <div class="showcase-card-title-row">
          <span class="showcase-card-title">${escapeHtml(cs.title)}</span>
          <span class="showcase-tag client-tag">${escapeHtml(cs.clientName)}</span>
          ${cs.industry ? `<span class="showcase-tag">${escapeHtml(cs.industry)}</span>` : ''}
        </div>
        ${cs.results ? `<p class="showcase-results">${escapeHtml(cs.results)}</p>` : ''}
        ${cs.testimonial ? `<p class="showcase-testimonial-flag">Includes client testimonial${cs.testimonialAuthor ? ' — ' + escapeHtml(cs.testimonialAuthor) : ''}</p>` : ''}
      </div>
    </label>`;
  }).join('');

  container.querySelectorAll('.showcase-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.getAttribute('data-id');
      if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
      renderList();
    });
  });
}

function selectAll() {
  items.forEach(i => selectedIds.add(i.id));
  renderList();
}

function selectNone() {
  selectedIds.clear();
  renderList();
}

// Each case study renders as its own full page - page-break-before keeps
// it starting on a fresh sheet regardless of how long the previous one ran.
function caseStudyPdfPageHtml(cs) {
  return `
    <div style="page-break-before: always; box-sizing: border-box; width: 8.5in; padding: 0.6in; font-family: Helvetica, Arial, sans-serif; color: #1a1a1a;">
      <div style="border-bottom: 3px solid #6366f1; padding-bottom: 16px; margin-bottom: 24px;">
        <div style="font-size: 11px; letter-spacing: 1.5px; color: #6366f1; font-weight: 700; text-transform: uppercase;">Revital Productions — Case Study</div>
        <h1 style="font-size: 26px; margin: 6px 0 0;">${escapeHtml(cs.title)}</h1>
        <div style="margin-top: 10px; display:flex; gap:8px; flex-wrap:wrap;">
          <span style="display:inline-block; background:#eef0fe; color:#6366f1; font-size:11px; font-weight:700; padding:3px 10px; border-radius:100px;">${escapeHtml(cs.clientName || '')}</span>
          ${cs.industry ? `<span style="display:inline-block; background:#f4f4f8; color:#555; font-size:11px; font-weight:600; padding:3px 10px; border-radius:100px;">${escapeHtml(cs.industry)}</span>` : ''}
        </div>
      </div>
      ${cs.servicesProvided ? `<p style="font-size: 12px; color:#555; margin-bottom: 20px;"><strong>Services Provided:</strong> ${escapeHtml(cs.servicesProvided)}</p>` : ''}
      <h3 style="font-size: 14px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; margin-bottom: 8px;">The Challenge</h3>
      <p style="font-size: 13px; line-height: 1.6; margin-bottom: 18px;">${escapeHtml(cs.challenge) || '—'}</p>
      <h3 style="font-size: 14px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; margin-bottom: 8px;">Our Solution</h3>
      <p style="font-size: 13px; line-height: 1.6; margin-bottom: 18px;">${escapeHtml(cs.solution) || '—'}</p>
      <h3 style="font-size: 14px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; margin-bottom: 8px;">The Results</h3>
      <p style="font-size: 13px; line-height: 1.6; margin-bottom: 18px; font-weight:600;">${escapeHtml(cs.results) || '—'}</p>
      ${cs.testimonial ? `
      <div style="margin-top: 20px; padding: 16px 20px; background:#f9f9fc; border-left: 3px solid #6366f1; border-radius: 0 6px 6px 0;">
        <p style="font-size: 13px; font-style: italic; margin:0;">"${escapeHtml(cs.testimonial)}"</p>
        ${cs.testimonialAuthor ? `<p style="font-size: 12px; font-weight:700; margin: 8px 0 0; color:#6366f1;">— ${escapeHtml(cs.testimonialAuthor)}</p>` : ''}
      </div>` : ''}
    </div>
  `;
}

async function generatePortfolioPdf() {
  const selected = items.filter(i => selectedIds.has(i.id));
  if (selected.length === 0) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Select at least one case study first.');
    return;
  }

  const preparedFor = el('preparedFor').value.trim();
  const coverNote = el('coverNote').value.trim();
  const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const container = document.createElement('div');
  container.style.cssText = 'width: 8.5in; font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff;';

  const coverHtml = `
    <div style="width: 8.5in; height: 11in; box-sizing: border-box; padding: 1in 0.8in; display:flex; flex-direction:column; justify-content:center;">
      <div style="font-size: 12px; letter-spacing: 2px; color: #6366f1; font-weight: 700; text-transform: uppercase;">Revital Productions</div>
      <h1 style="font-size: 42px; margin: 16px 0 0; line-height:1.15;">Portfolio &amp;<br>Case Studies</h1>
      ${coverNote ? `<p style="font-size: 15px; color:#444; margin-top:20px; max-width:5.5in; line-height:1.5;">${escapeHtml(coverNote)}</p>` : ''}
      <div style="margin-top: 48px; font-size: 13px; color:#555;">
        ${preparedFor ? `<div><strong>Prepared for:</strong> ${escapeHtml(preparedFor)}</div>` : ''}
        <div style="margin-top:6px;"><strong>Date:</strong> ${todayStr}</div>
      </div>
      <div style="margin-top: 60px; font-size: 11px; color:#888;">revitalproductions.com</div>
    </div>
  `;

  container.innerHTML = coverHtml + selected.map(caseStudyPdfPageHtml).join('');

  const opt = {
    margin: 0,
    filename: `Revital_Productions_Portfolio${preparedFor ? '_' + preparedFor.replace(/\s+/g, '_') : ''}.pdf`,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, letterRendering: true, useCORS: true },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
    pagebreak: { mode: ['css'] }
  };

  if (typeof html2pdf !== 'undefined') {
    await html2pdf().set(opt).from(container).save();
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('success', `Generated a ${selected.length}-case-study portfolio PDF.`);
  } else if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('error', 'PDF library failed to load.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadItems();
  renderList();

  el('selectAllBtn').addEventListener('click', selectAll);
  el('selectNoneBtn').addEventListener('click', selectNone);
  el('generatePdfBtn').addEventListener('click', generatePortfolioPdf);

  // Same iframe-race fix used across the other cross-client tools: the
  // parent Hub's client database loads asynchronously, so poll briefly
  // and re-load the list once real data shows up.
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    const hasClients = Object.keys(getClients()).length > 0;
    if (hasClients || pollAttempts > 30) {
      clearInterval(pollTimer);
      if (hasClients) { loadItems(); renderList(); }
    }
  }, 250);
});
