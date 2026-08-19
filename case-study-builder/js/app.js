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
// to a prospect as "services proof" - same html2pdf approach as the
// Change Order Generator.
async function generateCaseStudyPdf(id) {
  const client = currentClient();
  const clientName = currentClientName();
  if (!client) return;
  const cs = (client.caseStudies || []).find(c => c.id === id);
  if (!cs) return;

  const container = document.createElement('div');
  container.style.cssText = 'width: 8.5in; padding: 0.6in; font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff;';
  container.innerHTML = `
    <div style="border-bottom: 3px solid #6366f1; padding-bottom: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; letter-spacing: 1.5px; color: #6366f1; font-weight: 700; text-transform: uppercase;">Revital Productions — Case Study</div>
      <h1 style="font-size: 26px; margin: 6px 0 0;">${escapeHtml(cs.title)}</h1>
      <div style="margin-top: 10px; display:flex; gap:8px; flex-wrap:wrap;">
        <span style="display:inline-block; background:#eef0fe; color:#6366f1; font-size:11px; font-weight:700; padding:3px 10px; border-radius:100px;">${escapeHtml(clientName || '')}</span>
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
    <div style="margin-top: 28px; padding: 16px 20px; background:#f9f9fc; border-left: 3px solid #6366f1; border-radius: 0 6px 6px 0;">
      <p style="font-size: 13px; font-style: italic; margin:0;">"${escapeHtml(cs.testimonial)}"</p>
      ${cs.testimonialAuthor ? `<p style="font-size: 12px; font-weight:700; margin: 8px 0 0; color:#6366f1;">— ${escapeHtml(cs.testimonialAuthor)}</p>` : ''}
    </div>` : ''}
    ${(cs.embedLinks || []).some(l => l.isImage || (l.url || '').startsWith('data:image')) ? `
    <h3 style="font-size: 14px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; margin: 24px 0 12px;">Reference Images</h3>
    <div style="display:flex; flex-wrap:wrap; gap:12px;">
      ${cs.embedLinks.filter(l => l.isImage || (l.url || '').startsWith('data:image')).map(l => `
        <div style="width: 47%;">
          <img src="${l.url}" style="width:100%; border-radius:6px; border:1px solid #e5e5e5; display:block;">
          <p style="font-size:11px; color:#888; margin:4px 0 0;">${escapeHtml(l.label)}</p>
        </div>
      `).join('')}
    </div>` : ''}
    <div style="margin-top: 48px; border-top: 1px solid #e5e5e5; padding-top: 12px; font-size: 11px; color:#888;">Revital Productions — revitalproductions.com</div>
  `;

  const opt = {
    margin: 0,
    filename: `${(clientName || 'Client').replace(/\s+/g, '_')}_${cs.title.replace(/\s+/g, '_')}_Case_Study.pdf`,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, letterRendering: true, useCORS: true },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  if (typeof html2pdf !== 'undefined') {
    await html2pdf().set(opt).from(container).save();
  } else if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('error', 'PDF library failed to load.');
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
