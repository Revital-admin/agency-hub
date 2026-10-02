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

// Each case study renders as its own full page.
// Oct 2026 rebuild: switched from html2canvas/html2pdf screenshotting an
// HTML mockup to the shared RevitalPDF module - draws straight onto the
// jsPDF doc instead of building markup.
function caseStudyPdfPage(r, cs) {
  const C = r.colors;
  r.newPage();
  r.sectionHeader(cs.title || 'Case Study');
  r.paragraph((cs.clientName || '') + (cs.industry ? '   |   ' + cs.industry : ''), { size: 9, color: C.ACCENT, bold: true, spaceAfter: 14 });

  if (cs.servicesProvided) {
    r.paragraph('Services Provided', { bold: true, size: 9.5, spaceAfter: 3 });
    r.paragraph(cs.servicesProvided, { size: 9.5, color: C.GRAY, spaceAfter: 14 });
  }

  r.paragraph('The Challenge', { bold: true, size: 10.5, spaceAfter: 6 });
  r.paragraph(cs.challenge || '—', { spaceAfter: 14 });

  r.paragraph('Our Solution', { bold: true, size: 10.5, spaceAfter: 6 });
  r.paragraph(cs.solution || '—', { spaceAfter: 14 });

  r.paragraph('The Results', { bold: true, size: 10.5, spaceAfter: 6 });
  r.paragraph(cs.results || '—', { bold: true, spaceAfter: 14 });

  if (cs.testimonial) {
    r.calloutBox(cs.testimonialAuthor || 'Client Testimonial', '"' + cs.testimonial + '"');
  }
}

function generatePortfolioPdf() {
  const selected = items.filter(i => selectedIds.has(i.id));
  if (selected.length === 0) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Select at least one case study first.');
    return;
  }
  if (typeof window.RevitalPDF === 'undefined') {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'PDF library failed to load.');
    return;
  }

  const preparedFor = el('preparedFor').value.trim();
  const coverNote = el('coverNote').value.trim();
  const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  try {
    const r = RevitalPDF.create({ reportTitle: 'PORTFOLIO & CASE STUDIES', companyName: preparedFor || 'Revital Productions' });

    r.coverPage({
      title: 'Portfolio & Case Studies',
      subLine: todayStr,
      objective: coverNote || undefined,
      preparedFrom: preparedFor ? ('Prepared for: ' + preparedFor) : undefined,
    });

    selected.forEach(function (cs) { caseStudyPdfPage(r, cs); });

    r.save(`Revital_Productions_Portfolio${preparedFor ? '_' + preparedFor.replace(/\s+/g, '_') : ''}.pdf`);
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('success', `Generated a ${selected.length}-case-study portfolio PDF.`);
    recordPortfolioPdfGenerated(selected.length, preparedFor);
  } catch (e) {
    console.error('Portfolio PDF error:', e);
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Could not generate PDF: ' + (e && e.message ? e.message : e));
  }
}

// This tool has no Firestore doc of its own (see the file header) since
// every case study it pulls from already lives on its client - but the
// dashboard's Phase 1 Progress card (renderPhaseProgress in root app.js)
// needs to know WHETHER a portfolio PDF has ever been generated at all,
// and there's nowhere else that signal could come from (the PDF itself
// saves straight to the browser's downloads, nothing persists). One
// small agency-wide doc just for that, written through the same shared
// saveVersionedAgencyDoc optimistic-concurrency helper every other
// agency/* doc in the Hub uses (see its comment in root app.js) - keeps
// this consistent with the rest of the Hub rather than a one-off raw
// write, even though this doc's own stakes are low (a "last generated"
// status stamp, not user-edited field data).
let portfolioDocVersion = 0;

function getPortfolioShowcaseDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "portfolioShowcase");
}

async function loadPortfolioShowcaseDocVersion() {
  const ref = getPortfolioShowcaseDocRef();
  if (!ref || !window.parent.firebaseGetDoc) return;
  try {
    const snap = await window.parent.firebaseGetDoc(ref);
    portfolioDocVersion = (snap && snap.exists && typeof snap.data().version === 'number') ? snap.data().version : 0;
  } catch (e) {
    console.warn("Couldn't load portfolio showcase doc version:", e);
  }
}

async function recordPortfolioPdfGenerated(caseStudyCount, preparedFor) {
  const ref = getPortfolioShowcaseDocRef();
  if (!ref || !window.parent.saveVersionedAgencyDoc) return;

  const buildPayload = (nextVersion) => ({
    lastGeneratedAt: new Date().toISOString(),
    caseStudyCount: caseStudyCount,
    preparedFor: preparedFor || "",
    version: nextVersion
  });

  let result = await window.parent.saveVersionedAgencyDoc({ docRef: ref, currentVersion: portfolioDocVersion, buildPayload });
  if (result.ok) {
    portfolioDocVersion = result.version;
    return;
  }
  if (result.reason === "conflict") {
    // Unlike clientsDb's hard-block-and-ask (which protects real,
    // user-edited data), this doc is just a status stamp nobody directly
    // edits - safe to retry once with the fresh version instead of
    // bothering the person with a banner over something this low-stakes.
    portfolioDocVersion = result.freshVersion;
    result = await window.parent.saveVersionedAgencyDoc({ docRef: ref, currentVersion: portfolioDocVersion, buildPayload });
    if (result.ok) {
      portfolioDocVersion = result.version;
      return;
    }
  }
  console.warn("Couldn't record portfolio PDF generation:", result.error || result.reason);
}

document.addEventListener('DOMContentLoaded', () => {
  loadItems();
  renderList();
  loadPortfolioShowcaseDocVersion();

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
