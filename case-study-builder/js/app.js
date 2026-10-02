/* ============================================================
   CASE STUDY BUILDER — APP LOGIC
   Per-client, own client-select dropdown (same pattern as Brand Asset
   Kit / Mood Board Builder) rather than the global "active client" -
   lets you jump between clients' completed work without switching what's
   active elsewhere in the Hub. Data lives at clients[name].caseStudies,
   an array of case study objects, saved through the parent Hub's own
   clientsDb + saveDatabase() (same mechanism as Mood Board Builder).
   Internal-only for now, like Brand Guidelines - not yet wired into the
   client portal, since these are meant for sales/website use rather
   than something the client themselves needs to see.
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

function persist() {
  if (isEmbedded) window.parent.saveDatabase();
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

let editingCaseStudyId = null;
let draftEmbedLinks = [];

function uid() { return 'cs-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function currentClientName() { return el('clientSelect').value; }

function currentClient() {
  const name = currentClientName();
  if (!name) return null;
  const clients = getClients();
  return clients[name] || null;
}

function resetForm() {
  editingCaseStudyId = null;
  draftEmbedLinks = [];
  el('csTitle').value = '';
  el('csIndustry').value = '';
  el('csServices').value = '';
  el('csChallenge').value = '';
  el('csSolution').value = '';
  el('csResults').value = '';
  el('csTestimonial').value = '';
  el('csTestimonialAuthor').value = '';
  el('csFeatured').checked = false;
  el('embedLabel').value = '';
  el('embedUrl').value = '';
  renderEmbedLinksList();
  el('formTitle').textContent = 'New Case Study';
  el('saveCaseStudyBtn').textContent = 'Save Case Study';
  el('cancelEditBtn').style.display = 'none';
  updatePullTestimonialVisibility();
}

// Testimonial Tracker link (full audit finding #12): client.testimonialSubmission
// is the quote a client typed into their portal's "Leave a Testimonial"
// view (synced in by the root app.js). Before this, filling in a case
// study's testimonial meant retyping or copy-pasting that quote by hand
// from Testimonial Tracker - this pulls it directly instead. Only fills
// the fields on an explicit click (never silently overwrites a draft in
// progress), matching the opt-in pattern used elsewhere in the Hub.
function updatePullTestimonialVisibility() {
  const wrap = el('pullTestimonialWrap');
  if (!wrap) return;
  const client = currentClient();
  const submission = client && client.testimonialSubmission;
  wrap.style.display = (submission && submission.quote) ? 'block' : 'none';
}

function pullTestimonialFromSubmission() {
  const client = currentClient();
  const submission = client && client.testimonialSubmission;
  if (!submission || !submission.quote) return;
  const authorLine = [submission.authorName, submission.authorTitle].filter(Boolean).join(' — ');
  el('csTestimonial').value = submission.quote;
  el('csTestimonialAuthor').value = authorLine;
  if (isEmbedded && window.parent.showBanner) window.parent.showBanner('success', 'Pulled the testimonial submission in.');
}

function addDraftEmbedLink() {
  const label = el('embedLabel').value.trim();
  const url = el('embedUrl').value.trim();
  if (!url) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Enter a URL for this reference link.');
    return;
  }
  draftEmbedLinks.push({ id: uid(), label: label || url, url });
  el('embedLabel').value = '';
  el('embedUrl').value = '';
  renderEmbedLinksList();
}

function removeDraftEmbedLink(id) {
  draftEmbedLinks = draftEmbedLinks.filter(l => l.id !== id);
  renderEmbedLinksList();
}

let imageDropCounter = 0;

// Dropping/uploading an image adds it straight to the reference list as
// a thumbnail - useful here especially for before/after screenshots,
// which is literally the example given in the field's placeholder text.
// Stored as a compressed data URL (see shared-dropzone.js), same
// mechanism as Client Portal Manager's logo upload.
function handleDroppedImage(file) {
  processImageFile(file, { maxWidth: 800 }).then(dataUrl => {
    imageDropCounter++;
    const label = (file.name || `Image ${imageDropCounter}`).replace(/\.[^.]+$/, '');
    draftEmbedLinks.push({ id: uid(), label, url: dataUrl, isImage: true });
    renderEmbedLinksList();
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('success', `Added "${label}" as a reference image.`);
  }).catch(errMsg => {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', errMsg);
  });
}

function renderEmbedLinksList() {
  const list = el('embedLinksList');
  if (draftEmbedLinks.length === 0) {
    list.innerHTML = '<p style="color:var(--color-text-secondary); font-size:13px; margin:0;">No reference links added yet.</p>';
    return;
  }
  list.innerHTML = draftEmbedLinks.map(l => {
    const isImage = l.isImage || (l.url || '').startsWith('data:image');
    const main = isImage
      ? `<img class="embed-thumb" src="${l.url}" alt=""><span><strong>${escapeHtml(l.label)}</strong> — uploaded image</span>`
      : `<span><strong>${escapeHtml(l.label)}</strong> — ${escapeHtml(l.url)}</span>`;
    return `
    <li class="embed-link-chip">
      <div class="embed-link-main">${main}</div>
      <button data-id="${l.id}" class="remove-embed-btn">✕</button>
    </li>
  `;
  }).join('');
  document.querySelectorAll('.remove-embed-btn').forEach(btn => {
    btn.addEventListener('click', () => removeDraftEmbedLink(btn.getAttribute('data-id')));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function saveCaseStudy() {
  const client = currentClient();
  if (!client) return;

  const title = el('csTitle').value.trim();
  if (!title) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Give this case study a title first.');
    return;
  }

  if (!Array.isArray(client.caseStudies)) client.caseStudies = [];

  const caseStudy = {
    id: editingCaseStudyId || uid(),
    title,
    industry: el('csIndustry').value.trim(),
    servicesProvided: el('csServices').value.trim(),
    challenge: el('csChallenge').value.trim(),
    solution: el('csSolution').value.trim(),
    results: el('csResults').value.trim(),
    testimonial: el('csTestimonial').value.trim(),
    testimonialAuthor: el('csTestimonialAuthor').value.trim(),
    embedLinks: draftEmbedLinks,
    featured: el('csFeatured').checked,
    createdDate: editingCaseStudyId
      ? (client.caseStudies.find(c => c.id === editingCaseStudyId) || {}).createdDate || new Date().toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  };

  if (editingCaseStudyId) {
    const idx = client.caseStudies.findIndex(c => c.id === editingCaseStudyId);
    if (idx >= 0) client.caseStudies[idx] = caseStudy;
  } else {
    client.caseStudies.unshift(caseStudy);
  }

  persist();
  resetForm();
  renderCaseStudiesList();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Saved case study "${title}".`);
  }
}

function startEditCaseStudy(id) {
  const client = currentClient();
  if (!client) return;
  const caseStudy = (client.caseStudies || []).find(c => c.id === id);
  if (!caseStudy) return;

  editingCaseStudyId = id;
  el('csTitle').value = caseStudy.title || '';
  el('csIndustry').value = caseStudy.industry || '';
  el('csServices').value = caseStudy.servicesProvided || '';
  el('csChallenge').value = caseStudy.challenge || '';
  el('csSolution').value = caseStudy.solution || '';
  el('csResults').value = caseStudy.results || '';
  el('csTestimonial').value = caseStudy.testimonial || '';
  el('csTestimonialAuthor').value = caseStudy.testimonialAuthor || '';
  el('csFeatured').checked = !!caseStudy.featured;
  draftEmbedLinks = (caseStudy.embedLinks || []).map(l => ({ ...l }));
  renderEmbedLinksList();

  el('formTitle').textContent = 'Edit Case Study';
  el('saveCaseStudyBtn').textContent = 'Update Case Study';
  el('cancelEditBtn').style.display = 'inline-block';
  updatePullTestimonialVisibility();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeCaseStudy(id) {
  const client = currentClient();
  if (!client) return;
  const caseStudy = (client.caseStudies || []).find(c => c.id === id);
  if (!caseStudy) return;
  if (!confirm(`Delete the case study "${caseStudy.title}"? This can't be undone.`)) return;
  client.caseStudies = (client.caseStudies || []).filter(c => c.id !== id);
  persist();
  if (editingCaseStudyId === id) resetForm();
  renderCaseStudiesList();
}

function toggleFeatured(id) {
  const client = currentClient();
  if (!client) return;
  const caseStudy = (client.caseStudies || []).find(c => c.id === id);
  if (!caseStudy) return;
  caseStudy.featured = !caseStudy.featured;
  persist();
  renderCaseStudiesList();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', caseStudy.featured ? `"${caseStudy.title}" marked portfolio-ready.` : `"${caseStudy.title}" unmarked as portfolio-ready.`);
  }
}

// ── PDF Generation ──
// One-pager, branded, meant to be attached to a proposal or sent straight
// to a prospect as "services proof".
// Oct 2026 rebuild: switched from html2canvas/html2pdf to the shared
// RevitalPDF module (../shared/pdf-report.js) - see that file for the
// full rationale (white-on-white text, content sliced mid-sentence at
// page breaks). Reference images are drawn directly via jsPDF's own
// addImage() (they're already stored as data URLs - see
// handleDroppedImage above), since that's a case this tool needs that
// none of the other rebuilt tools so far have had.
function generateCaseStudyPdf(id) {
  const client = currentClient();
  const clientName = currentClientName();
  if (!client) return;
  const cs = (client.caseStudies || []).find(c => c.id === id);
  if (!cs) return;

  if (typeof window.RevitalPDF === 'undefined') {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'PDF library failed to load.');
    return;
  }

  try {
    const r = RevitalPDF.create({ reportTitle: 'CASE STUDY', companyName: clientName || 'Client' });
    const C = r.colors;

    r.coverPage({
      title: cs.title,
      subLine: [cs.industry, 'Revital Productions'].filter(Boolean).join('   |   '),
      objective: cs.servicesProvided ? ('Services provided: ' + cs.servicesProvided) : undefined,
      preparedFrom: 'Case study prepared for use in proposals and portfolio materials.',
    });

    r.newPage();
    r.sectionHeader('The Challenge');
    r.paragraph(cs.challenge || 'Not yet filled in.', { spaceAfter: 16 });
    r.paragraph('Our Solution', { bold: true, size: 13, spaceAfter: 6 });
    r.paragraph(cs.solution || 'Not yet filled in.', { spaceAfter: 16 });
    r.paragraph('The Results', { bold: true, size: 13, spaceAfter: 6 });
    r.paragraph(cs.results || 'Not yet filled in.', { bold: true, spaceAfter: 16 });

    if (cs.testimonial) {
      r.calloutBox('Client Testimonial', '"' + cs.testimonial + '"' + (cs.testimonialAuthor ? '\n— ' + cs.testimonialAuthor : ''));
    }

    const images = (cs.embedLinks || []).filter(l => l.isImage || (l.url || '').startsWith('data:image'));
    if (images.length) {
      r.newPage();
      r.sectionHeader('Reference Images');
      images.forEach(function (img) {
        try {
          const fmt = img.url.indexOf('data:image/png') === 0 ? 'PNG' : 'JPEG';
          const props = r.doc.getImageProperties(img.url);
          const w = r.CONTENT_W;
          const h = Math.min(400, w * (props.height / props.width));
          r.ensureSpace(h + 30);
          r.doc.addImage(img.url, fmt, r.MARGIN, r.y, w, h);
          r.y += h + 6;
          if (img.label) {
            r.paragraph(img.label, { size: 8.5, italic: true, color: C.GRAY, spaceAfter: 14 });
          } else {
            r.y += 14;
          }
        } catch (imgErr) {
          console.warn('Skipping image in case study PDF:', imgErr);
        }
      });
    }

    const nonImageLinks = (cs.embedLinks || []).filter(l => !(l.isImage || (l.url || '').startsWith('data:image')));
    if (nonImageLinks.length) {
      r.paragraph('Reference Links', { bold: true, size: 10.5, spaceAfter: 6 });
      r.bulletList(nonImageLinks.map(l => l.label + ': ' + l.url));
    }

    r.save(`${(clientName || 'Client').replace(/\s+/g, '_')}_${cs.title.replace(/\s+/g, '_')}_Case_Study.pdf`);
  } catch (err) {
    console.error('PDF generation failed:', err);
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'PDF generation failed: ' + (err && err.message ? err.message : err));
  }
}

function renderCaseStudiesList() {
  const client = currentClient();
  const container = el('caseStudiesList');
  const caseStudies = client && Array.isArray(client.caseStudies) ? client.caseStudies : [];

  el('caseStudiesEmptyState').style.display = caseStudies.length === 0 ? 'block' : 'none';
  container.innerHTML = caseStudies.map(cs => `
    <div class="board-card">
      <div class="board-card-header">
        <div>
          <strong>${escapeHtml(cs.title)}</strong>
          <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
            ${cs.industry ? `<span class="board-category-badge">${escapeHtml(cs.industry)}</span>` : ''}
            ${cs.featured ? '<span class="board-shared-badge featured-badge">Portfolio-Ready</span>' : ''}
          </div>
        </div>
        <div class="board-actions">
          <button class="pdf-board-btn" data-id="${cs.id}">PDF</button>
          <button class="share-board-btn" data-id="${cs.id}">${cs.featured ? 'Unmark' : 'Mark Portfolio-Ready'}</button>
          <button class="edit-board-btn" data-id="${cs.id}">Edit</button>
          <button class="remove-board-btn" data-id="${cs.id}">Delete</button>
        </div>
      </div>
      ${cs.results ? `<p style="margin:12px 0 0; font-size:13px; color:var(--color-text-secondary);"><strong>Results:</strong> ${escapeHtml(cs.results)}</p>` : ''}
      ${cs.testimonial ? `<div class="testimonial-preview">"${escapeHtml(cs.testimonial)}"${cs.testimonialAuthor ? ' — ' + escapeHtml(cs.testimonialAuthor) : ''}</div>` : ''}
      ${(cs.embedLinks || []).length ? `<p style="margin:8px 0 0; font-size:12px; color:var(--color-text-secondary);">${cs.embedLinks.length} reference link${cs.embedLinks.length === 1 ? '' : 's'}</p>` : ''}
    </div>
  `).join('');

  document.querySelectorAll('.edit-board-btn').forEach(btn => btn.addEventListener('click', () => startEditCaseStudy(btn.getAttribute('data-id'))));
  document.querySelectorAll('.remove-board-btn').forEach(btn => btn.addEventListener('click', () => removeCaseStudy(btn.getAttribute('data-id'))));
  document.querySelectorAll('.share-board-btn').forEach(btn => btn.addEventListener('click', () => toggleFeatured(btn.getAttribute('data-id'))));
  document.querySelectorAll('.pdf-board-btn').forEach(btn => btn.addEventListener('click', () => generateCaseStudyPdf(btn.getAttribute('data-id'))));
}

function renderState() {
  const clientName = currentClientName();
  if (!clientName) {
    el('emptyState').style.display = 'flex';
    el('caseStudyInterface').style.display = 'none';
    return;
  }
  el('emptyState').style.display = 'none';
  el('caseStudyInterface').style.display = 'block';
  resetForm();
  renderCaseStudiesList();
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  el('clientSelect').addEventListener('change', renderState);
  el('saveCaseStudyBtn').addEventListener('click', saveCaseStudy);
  el('cancelEditBtn').addEventListener('click', resetForm);
  el('addEmbedBtn').addEventListener('click', addDraftEmbedLink);
  el('pullTestimonialBtn').addEventListener('click', pullTestimonialFromSubmission);
  wireDropZone(el('imageDropZone'), el('imageFileInput'), handleDroppedImage);

  // Same iframe-race fix used across the other client-aware modules: the
  // parent Hub's client database loads asynchronously, so poll briefly
  // and re-populate the dropdown once real data shows up.
  let clientPollAttempts = 0;
  const clientPoll = setInterval(() => {
    clientPollAttempts++;
    const hasClients = Object.keys(getClients()).length > 0;
    if (hasClients || clientPollAttempts > 30) {
      clearInterval(clientPoll);
      if (hasClients) populateClientSelect();
    }
  }, 250);
});
