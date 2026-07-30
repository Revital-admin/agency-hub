/* ============================================================
   TEAM ROSTER & CAPACITY — APP LOGIC
   Agency-wide (not tied to a single client): stores its own list at
   agency/teamRoster, same optimistic-concurrency version-guard pattern
   as Change Order Generator / Subscription Tracker. Unlike Subscription
   Tracker (admin/leadership only, whole page), this one is viewable by
   everyone - same partial-gate model as Email Template Library and SOP
   Wiki: New/Edit/Delete are hidden for restricted teammates, but the
   roster itself (who's on the team, who has room for new client work)
   is useful for anyone doing onboarding/assignment.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

let members = [];
let editingId = null;
let docVersion = 0; // optimistic-concurrency guard, see persist() below
let isRestrictedUser = false;

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamRoster");
}

async function loadMembers() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      members = (data && data.list) || [];
      docVersion = (data && data.version) || 0;
      return;
    } catch (e) {
      console.error("Couldn't load team roster from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load the team roster: " + e.message);
      members = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('team-roster-list');
    members = saved ? JSON.parse(saved) : [];
  } catch (e) { members = []; }
}

async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: members, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save team roster:", result.error);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', result.reason === 'conflict'
          ? "Someone else updated the roster while you had it open. Reload the page to see their changes, then redo your edit."
          : "Couldn't save — your change may be lost: " + result.error.message);
      }
      return false;
    }
    docVersion = result.version;
    return true;
  }
  try { localStorage.setItem('team-roster-list', JSON.stringify(members)); } catch (e) {}
  return true;
}

function uid() { return 'tm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

/* ── Send Contractor Agreement (Docusign) ──
   Contractors don't belong in the Contract & Invoice Tracker's per-client
   rows (that tool's whole data model - contract status, invoice cycle,
   client reporting - is for people who pay Revital, not people Revital
   pays). Instead, this reads the same shared Contract Template Library
   (agency/contractTemplates, same Firestore doc the Tracker uses) to find
   the Independent Contractor Agreement and its NDA, and sends them via
   the same /api/docusign/send-envelope endpoint, keyed off this roster
   entry instead of a fake client row. See _worker.js's
   handleDocusignSendEnvelope for how fieldValues become textTabs. */
const CONTRACTOR_DOC_DEFS = [
  {
    key: 'ic-agreement',
    label: 'Independent Contractor Agreement',
    matchLabel: 'independent contractor agreement',
    fields: [
      { token: 'EFFECTIVE_DATE', label: 'Effective Date', default: () => todayStr() },
      { token: 'CONTRACTOR_NAME', label: 'Contractor Name', default: (m) => m && m.memberName },
      { token: 'CONTRACTOR_ADDRESS', label: 'Contractor Address', default: () => '' },
      { token: 'RATE', label: 'Rate ($)', default: () => '' },
      { token: 'INVOICE_DUE_DAY', label: 'Invoice Due Day of Month', default: () => '' },
      { token: 'NONCOMPETE_MONTHS', label: 'Non-Compete Period (months)', default: () => '' },
      { token: 'TERMINATION_NOTICE_DAYS', label: 'Termination Notice (days)', default: () => '' }
    ]
  },
  {
    key: 'ic-nda',
    label: 'NDA - Independent Contract',
    matchLabel: 'nda - independent contract',
    fields: [
      { token: 'EFFECTIVE_DATE', label: 'Effective Date', default: () => todayStr() },
      { token: 'PARTY_B_NAME', label: 'Contractor Name', default: (m) => m && m.memberName },
      { token: 'PARTY_B_ADDRESS', label: 'Contractor Address', default: () => '' },
      { token: 'JURISDICTION_COUNTY', label: 'Jurisdiction (Parish/County)', default: () => '' }
    ]
  }
];

// Every entry this tool creates/updates gets docCategory: 'contractor' so
// the Contract & Invoice Tracker's Send Contract checklist and Manage
// Contract Templates window (isContractorDoc, contract-invoice-tracker/
// js/app.js) can filter it out - a contractor document showing up as a
// selectable "client contract" would recreate the exact mixing problem
// this tool exists to avoid.
//
// This whole manager (detect+bake+review+delete) intentionally
// mirrors the Contract & Invoice Tracker's Contract Template Library
// exactly (same detectClientAnchors/bakeAnchorsAtDetection heuristic, same
// review panel, same manual override) - contractor docs live in the same
// shared agency/contractTemplates collection, just filtered to a different
// screen, so the management experience should be identical rather than a
// simplified stand-in.
let contractorEntries = []; // raw agency/contractTemplates entries belonging to this tool (known + custom)

function isKnownContractorLabel(entry) {
  const hay = ((entry.label || '') + ' ' + (entry.filename || '')).toLowerCase();
  return CONTRACTOR_DOC_DEFS.some(def => hay.includes(def.matchLabel));
}

async function refreshContractorLibraryCache() {
  contractorEntries = [];
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseGetDoc) {
    return;
  }
  try {
    const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "contractTemplates");
    const snap = await window.parent.firebaseGetDoc(ref);
    const data = snap && snap.exists ? snap.data() : null;
    const list = (data && data.list) || [];
    contractorEntries = list.filter(t => t.docCategory === 'contractor' || isKnownContractorLabel(t));
  } catch (e) {
    console.error("Couldn't load the Contract Template Library:", e);
  }
}

function findKnownContractorEntry(def) {
  const hayMatch = (t) => ((t.label || '') + ' ' + (t.filename || '')).toLowerCase().includes(def.matchLabel);
  return contractorEntries.find(hayMatch) || null;
}

function getCustomContractorEntries() {
  return contractorEntries.filter(t => !isKnownContractorLabel(t));
}

// uploadBytesToR2 / deleteR2Object now live in ../shared-contract-pdf-tools.js
// (shared with Contract & Invoice Tracker, which uploads into this same
// agency/contractTemplates library).

// Shared read-detect-bake-upload step used by every upload/replace/add
// path below - identical to the Contract & Invoice Tracker's upload flow
// (same detectClientAnchors heuristic, same non-fatal fallback to a flat
// PDF if detection throws or finds nothing).
async function processContractorUpload(file) {
  const origBytes = new Uint8Array(await file.arrayBuffer());
  let detection = null;
  let uploadBytes = origBytes;
  try {
    detection = await detectClientAnchors(origBytes);
    if (detection) uploadBytes = await bakeAnchorsAtDetection(origBytes, detection);
  } catch (e) {
    console.warn('Anchor auto-detection failed (non-fatal - uploading as a flat PDF):', e);
    detection = null;
    uploadBytes = origBytes;
  }
  const key = await uploadBytesToR2(uploadBytes, file.name);
  return { key, detection };
}

async function writeContractorEntry(mutator) {
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "contractTemplates");
  const snap = await window.parent.firebaseGetDoc(ref);
  const data = snap && snap.exists ? snap.data() : null;
  const list = (data && data.list) || [];
  const version = (data && data.version) || 0;
  const nextList = mutator(list);
  await window.parent.firebaseSetDocFromJSON(ref, JSON.stringify({ list: nextList, version: version + 1 }));
}

async function saveContractorDocToLibrary(defKey, file) {
  const def = CONTRACTOR_DOC_DEFS.find(d => d.key === defKey);
  if (!def) return;
  const statusEl = el(`contractorDocStatus_${defKey}`);
  const setStatus = (msg, isError) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isError ? 'var(--color-error, #f68d5f)' : 'var(--color-success, #10b981)';
  };
  setStatus('Analyzing...', false);
  try {
    const { key, detection } = await processContractorUpload(file);
    setStatus('Uploading...', false);
    let oldKey = null;
    await writeContractorEntry((list) => {
      const idx = list.findIndex(t => ((t.label || '') + ' ' + (t.filename || '')).toLowerCase().includes(def.matchLabel));
      oldKey = idx >= 0 ? list[idx].r2Key : null;
      const entryPatch = {
        label: idx >= 0 ? list[idx].label : def.label,
        r2Key: key,
        filename: file.name,
        uploadedAt: todayStr(),
        docusignAnchorTags: false,
        needsAnchorReview: !!detection,
        anchorDetection: detection || null,
        docCategory: 'contractor'
      };
      if (idx >= 0) { list[idx] = { ...list[idx], ...entryPatch }; }
      else { list.push({ id: uid(), ...entryPatch }); }
      return list;
    });
    if (oldKey && oldKey !== key) deleteR2Object(oldKey);
    setStatus(
      detection
        ? `${def.label} uploaded - signature/date lines auto-detected. Click Review to confirm before it's DocuSign-ready.`
        : `${def.label} uploaded. Couldn't auto-detect signature lines - it's a flat PDF only for now (try re-uploading a version with a real, selectable text layer).`,
      false
    );
  } catch (e) {
    console.error(`Couldn't upload ${def.label}:`, e);
    setStatus("Couldn't upload: " + e.message, true);
  }
}

// Adds a new, custom contractor document beyond the 2 fixed slots above
// (e.g. a Model Release, an NDA variant, whatever else comes up).
async function addCustomContractorDoc(label, file) {
  const statusEl = el('contractorDocAddStatus');
  const setStatus = (msg, isError) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isError ? 'var(--color-error, #f68d5f)' : 'var(--color-success, #10b981)';
  };
  setStatus('Analyzing...', false);
  try {
    const { key, detection } = await processContractorUpload(file);
    setStatus('Uploading...', false);
    await writeContractorEntry((list) => {
      list.push({
        id: uid(),
        label,
        r2Key: key,
        filename: file.name,
        uploadedAt: todayStr(),
        docusignAnchorTags: false,
        needsAnchorReview: !!detection,
        anchorDetection: detection || null,
        docCategory: 'contractor'
      });
      return list;
    });
    setStatus(
      detection
        ? `Added "${label}" - signature/date lines auto-detected. Click Review to confirm before it's DocuSign-ready.`
        : `Added "${label}". Couldn't auto-detect signature lines - it's a flat PDF only for now.`,
      false
    );
    renderContractorDocManager();
  } catch (e) {
    console.error('Could not add contractor document:', e);
    setStatus("Couldn't upload: " + e.message, true);
  }
}

async function replaceCustomContractorDoc(id, file) {
  const entry = getCustomContractorEntries().find(t => t.id === id);
  if (!entry) return;
  const oldKey = entry.r2Key;
  try {
    const { key, detection } = await processContractorUpload(file);
    await writeContractorEntry((list) => {
      const idx = list.findIndex(t => t.id === id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          r2Key: key,
          filename: file.name,
          uploadedAt: todayStr(),
          docusignAnchorTags: false,
          needsAnchorReview: !!detection,
          anchorDetection: detection || null
        };
      }
      return list;
    });
    if (oldKey && oldKey !== key) deleteR2Object(oldKey);
  } catch (e) {
    console.error('Could not replace contractor document:', e);
    if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't replace: " + e.message);
  }
}

async function deleteContractorEntry(id) {
  const entry = contractorEntries.find(t => t.id === id);
  if (!entry) return;
  const isKnown = isKnownContractorLabel(entry);
  if (!confirm(isKnown
    ? `Remove the uploaded file for "${entry.label}"? This clears the slot back to "Not uploaded yet" - it won't delete the document type itself.`
    : `Remove "${entry.label}" from Contractor Documents? This can't be undone.`)) return;
  try {
    await writeContractorEntry((list) => list.filter(t => t.id !== id));
    deleteR2Object(entry.r2Key);
    renderContractorDocManager();
  } catch (e) {
    console.error('Could not remove contractor document:', e);
    if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't remove: " + e.message);
  }
}

function contractorStatusText(entry) {
  if (!entry) return { text: 'Not uploaded yet', color: 'var(--text-muted)' };
  if (entry.docusignAnchorTags) return { text: `✓ DocuSign-ready (${escapeHtml(entry.filename || '')})`, color: 'var(--color-success, #10b981)' };
  if (entry.needsAnchorReview) return { text: `Needs Review (${escapeHtml(entry.filename || '')})`, color: '#f68d5f' };
  return { text: `Flat PDF only (${escapeHtml(entry.filename || '')})`, color: 'var(--text-muted)' };
}

function contractorDocRowHtml(label, entry, fileInputAttr, includeDelete, deleteId) {
  const status = contractorStatusText(entry);
  return `
    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 0; border-bottom:1px solid var(--border-color);">
      <div style="min-width:220px; flex:1;">
        <div style="font-size:0.85rem; font-weight:600;">${escapeHtml(label)}</div>
        <div style="font-size:0.75rem; color:${status.color};">${status.text}</div>
      </div>
      ${entry && entry.needsAnchorReview ? `<button type="button" class="btn btn-secondary contractor-doc-review-btn" data-id="${entry.id}" style="padding:6px 12px; font-size:0.8rem;">Review</button>` : ''}
      <label class="btn btn-secondary" style="cursor:pointer; padding:6px 12px; font-size:0.8rem;">
        ${entry ? 'Replace File' : 'Upload File'}
        <input type="file" accept="application/pdf" ${fileInputAttr} class="contractor-doc-file-input" style="display:none;">
      </label>
      ${includeDelete ? `<button type="button" class="btn btn-secondary contractor-doc-delete-btn" data-id="${deleteId}" style="padding:6px 12px; font-size:0.8rem;">Delete</button>` : ''}
    </div>`;
}

async function renderContractorDocManager() {
  const container = el('contractorDocManager');
  if (!container) return;
  await refreshContractorLibraryCache();

  const knownRows = CONTRACTOR_DOC_DEFS.map(def => {
    const entry = findKnownContractorEntry(def);
    return contractorDocRowHtml(def.label, entry, `data-def-key="${def.key}"`, !!entry, entry ? entry.id : null);
  }).join('');

  const customRows = getCustomContractorEntries().map(entry => {
    return contractorDocRowHtml(entry.label, entry, `data-custom-id="${entry.id}"`, true, entry.id);
  }).join('');

  container.innerHTML = knownRows + customRows + `
    <div style="padding-top: 12px; margin-top: 4px;">
      <div style="font-size:0.8rem; font-weight:600; margin-bottom: 6px;">Add Another Contractor Document</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <input type="text" id="contractorDocAddLabel" placeholder="Document name (e.g. Model Release)" style="flex:1; min-width:220px;">
        <label class="btn btn-secondary" style="cursor:pointer; padding:6px 12px; font-size:0.8rem;">
          Choose File
          <input type="file" accept="application/pdf" id="contractorDocAddFile" style="display:none;">
        </label>
        <span id="contractorDocAddFileName" style="font-size:0.75rem; color:var(--text-muted);">No file chosen</span>
        <button type="button" id="contractorDocAddBtn" class="btn-primary" style="padding:6px 14px; font-size:0.8rem;">Add</button>
      </div>
      <div id="contractorDocAddStatus" style="font-size:0.75rem; margin-top:6px;"></div>
    </div>`;

  container.querySelectorAll('.contractor-doc-file-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const defKey = e.target.getAttribute('data-def-key');
      const customId = e.target.getAttribute('data-custom-id');
      if (defKey) {
        await saveContractorDocToLibrary(defKey, file);
      } else if (customId) {
        await replaceCustomContractorDoc(customId, file);
      }
      e.target.value = '';
      renderContractorDocManager();
    });
  });
  container.querySelectorAll('.contractor-doc-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteContractorEntry(btn.getAttribute('data-id')));
  });
  container.querySelectorAll('.contractor-doc-review-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = contractorEntries.find(t => t.id === btn.getAttribute('data-id'));
      if (entry) openAnchorReview(entry);
    });
  });
  const addFileInput = el('contractorDocAddFile');
  const addFileName = el('contractorDocAddFileName');
  if (addFileInput) {
    addFileInput.addEventListener('change', () => {
      addFileName.textContent = addFileInput.files[0] ? addFileInput.files[0].name : 'No file chosen';
    });
  }
  const addBtn = el('contractorDocAddBtn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const label = (el('contractorDocAddLabel').value || '').trim();
      const file = addFileInput.files[0];
      if (!label) { el('contractorDocAddStatus').textContent = 'Enter a name for this document first.'; el('contractorDocAddStatus').style.color = 'var(--color-error, #f68d5f)'; return; }
      if (!file) { el('contractorDocAddStatus').textContent = 'Choose a PDF file first.'; el('contractorDocAddStatus').style.color = 'var(--color-error, #f68d5f)'; return; }
      addBtn.disabled = true;
      await addCustomContractorDoc(label, file);
      addBtn.disabled = false;
    });
  }
}

// ensurePdfjsWorker, detectClientAnchors, normalizeAnchorDetections, and
// bakeAnchorsAtDetection now live in ../shared-contract-pdf-tools.js
// (shared with Contract & Invoice Tracker - see that file's comments for
// the full heuristic explanation).

/* ── Anchor review panel (identical UI/behavior to Contract & Invoice
   Tracker's - see that file's anchorReviewPanel markup/comments) ── */
const anchorReviewPanel = el('anchorReviewPanel');
const anchorReviewLabel = el('anchorReviewLabel');
const anchorReviewCanvasWrap = el('anchorReviewCanvasWrap');
const anchorReviewCloseBtn = el('anchorReviewCloseBtn');
const anchorReviewApproveBtn = el('anchorReviewApproveBtn');
const anchorReviewRejectBtn = el('anchorReviewRejectBtn');
const anchorReviewStatus = el('anchorReviewStatus');
let currentAnchorReviewId = null;

// Renders ONE mini-preview per detected Client signature location, since
// a document (e.g. one with a separate Appendix acknowledgment page) can
// need the Client to sign in more than one spot - approving here approves
// the whole set together, since DocuSign will place a tab at every one
// of them from the same anchor string.
async function openAnchorReview(entry) {
  currentAnchorReviewId = entry.id;
  if (anchorReviewLabel) anchorReviewLabel.textContent = entry.label;
  if (anchorReviewStatus) anchorReviewStatus.textContent = '';
  if (anchorReviewPanel) {
    anchorReviewPanel.style.display = 'block';
    anchorReviewPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  if (anchorReviewApproveBtn) { anchorReviewApproveBtn.disabled = true; anchorReviewApproveBtn.textContent = 'Loading preview...'; }
  if (anchorReviewRejectBtn) anchorReviewRejectBtn.disabled = true;
  if (anchorReviewCanvasWrap) anchorReviewCanvasWrap.innerHTML = '';

  try {
    const detections = normalizeAnchorDetections(entry.anchorDetection);
    if (!detections.length) throw new Error('No detection data saved for this document.');

    const res = await fetch('/api/contracts/' + encodeURIComponent(entry.r2Key));
    if (!res.ok) throw new Error(`Couldn't load the file (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    ensurePdfjsWorker();
    const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    const doc = await lib.getDocument({ data: bytes }).promise;

    for (let i = 0; i < detections.length; i++) {
      const detection = detections[i];
      const page = await doc.getPage(detection.page + 1);
      const scale = 1.4;
      const viewport = page.getViewport({ scale });

      const block = document.createElement('div');
      if (detections.length > 1) {
        const heading = document.createElement('p');
        heading.style.cssText = 'font-size:0.78rem; font-weight:600; margin: 10px 0 4px;';
        heading.textContent = `Signature location ${i + 1} of ${detections.length} (page ${detection.page + 1})`;
        block.appendChild(heading);
      }
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      block.appendChild(canvas);
      anchorReviewCanvasWrap.appendChild(block);

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const toCanvas = (x, y) => ({ cx: x * scale, cy: viewport.height - (y * scale) });
      const sigPt = toCanvas(detection.sigX, detection.sigY);
      const datePt = toCanvas(detection.dateX, detection.dateY);

      const drawMarker = (pt, color) => {
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(pt.cx, pt.cy, 10, 0, Math.PI * 2);
        ctx.stroke();
      };
      drawMarker(sigPt, '#f68d5f');
      drawMarker(datePt, '#6366f1');
    }

    if (anchorReviewApproveBtn) { anchorReviewApproveBtn.disabled = false; anchorReviewApproveBtn.textContent = 'Looks correct — enable for DocuSign'; }
    if (anchorReviewRejectBtn) anchorReviewRejectBtn.disabled = false;
  } catch (e) {
    console.error('Could not render the anchor review preview:', e);
    if (anchorReviewStatus) {
      anchorReviewStatus.textContent = "Couldn't load the preview: " + e.message;
      anchorReviewStatus.style.color = 'var(--color-error, #f68d5f)';
    }
    if (anchorReviewRejectBtn) anchorReviewRejectBtn.disabled = false;
  }
}

if (anchorReviewCloseBtn) {
  anchorReviewCloseBtn.addEventListener('click', () => {
    if (anchorReviewPanel) anchorReviewPanel.style.display = 'none';
    currentAnchorReviewId = null;
  });
}

if (anchorReviewApproveBtn) {
  anchorReviewApproveBtn.addEventListener('click', async () => {
    if (!currentAnchorReviewId) return;
    anchorReviewApproveBtn.disabled = true;
    if (anchorReviewRejectBtn) anchorReviewRejectBtn.disabled = true;
    try {
      await writeContractorEntry((list) => {
        const idx = list.findIndex(t => t.id === currentAnchorReviewId);
        if (idx >= 0) list[idx] = { ...list[idx], docusignAnchorTags: true, needsAnchorReview: false };
        return list;
      });
      if (anchorReviewPanel) anchorReviewPanel.style.display = 'none';
      currentAnchorReviewId = null;
      renderContractorDocManager();
    } catch (err) {
      if (anchorReviewStatus) {
        anchorReviewStatus.textContent = "Couldn't save: " + err.message;
        anchorReviewStatus.style.color = 'var(--color-error, #f68d5f)';
      }
    } finally {
      anchorReviewApproveBtn.disabled = false;
      if (anchorReviewRejectBtn) anchorReviewRejectBtn.disabled = false;
    }
  });
}

if (anchorReviewRejectBtn) {
  anchorReviewRejectBtn.addEventListener('click', async () => {
    if (!currentAnchorReviewId) return;
    if (anchorReviewApproveBtn) anchorReviewApproveBtn.disabled = true;
    anchorReviewRejectBtn.disabled = true;
    try {
      await writeContractorEntry((list) => {
        const idx = list.findIndex(t => t.id === currentAnchorReviewId);
        if (idx >= 0) list[idx] = { ...list[idx], docusignAnchorTags: false, needsAnchorReview: false };
        return list;
      });
      if (anchorReviewPanel) anchorReviewPanel.style.display = 'none';
      currentAnchorReviewId = null;
      renderContractorDocManager();
    } catch (err) {
      if (anchorReviewStatus) {
        anchorReviewStatus.textContent = "Couldn't save: " + err.message;
        anchorReviewStatus.style.color = 'var(--color-error, #f68d5f)';
      }
    } finally {
      if (anchorReviewApproveBtn) anchorReviewApproveBtn.disabled = false;
      anchorReviewRejectBtn.disabled = false;
    }
  });
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

let sendAgreementMemberId = null;
let sendAgreementSelectedDefs = [];

async function openSendAgreementPanel(memberId) {
  const member = members.find(m => m.id === memberId);
  if (!member) return;
  sendAgreementMemberId = memberId;

  const panel = el('sendAgreementPanel');
  const docList = el('sendAgreementDocList');
  const statusEl = el('sendAgreementStatus');
  if (!panel || !docList) return;

  el('sendAgreementTitle').textContent = `Send Contractor Agreement — ${member.memberName}`;
  el('sendAgreementTo').value = member.email || '';
  if (statusEl) statusEl.textContent = '';
  docList.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted);">Loading available documents...</p>';
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  await refreshContractorLibraryCache();
  // Unify the 2 known, field-schema'd docs with any custom ones added
  // below into one shape so the rest of this flow doesn't need to care
  // which kind it's dealing with - custom docs just have an empty fields
  // list (no auto-fill, signature-only). Only docusignAnchorTags===true
  // entries are offered here - a "Needs Review"/flat-PDF doc can't be
  // reliably sent for signature yet, same rule Contract Library follows.
  const knownAvailable = CONTRACTOR_DOC_DEFS.map(def => ({ def, entry: findKnownContractorEntry(def) }))
    .filter(x => x.entry && x.entry.docusignAnchorTags)
    .map(x => ({ key: x.def.key, label: x.entry.label, filename: x.entry.filename, r2Key: x.entry.r2Key, fields: x.def.fields }));
  const customAvailable = getCustomContractorEntries().filter(entry => entry.docusignAnchorTags).map(entry => ({
    key: 'custom:' + entry.id, label: entry.label, filename: entry.filename,
    r2Key: entry.r2Key, fields: []
  }));
  const available = [...knownAvailable, ...customAvailable];
  if (!available.length) {
    docList.innerHTML = '<p style="font-size:0.8rem;color:var(--color-error, #f68d5f);">No DocuSign-ready contractor documents yet — upload one and complete its review in Contractor Documents above.</p>';
    return;
  }

  docList.innerHTML = available.map(def => `
    <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem;">
      <input type="checkbox" class="agreement-doc-checkbox" value="${def.key}" checked>
      ${escapeHtml(def.label)}
    </label>
  `).join('');

  const updateFields = () => {
    sendAgreementSelectedDefs = available.filter(def =>
      docList.querySelector(`.agreement-doc-checkbox[value="${def.key}"]`).checked
    );
    renderAgreementFields(member);
  };
  docList.querySelectorAll('.agreement-doc-checkbox').forEach(cb => cb.addEventListener('change', updateFields));
  updateFields();
}

function renderAgreementFields(member) {
  const container = el('sendAgreementFields');
  if (!container) return;
  const seen = new Map();
  sendAgreementSelectedDefs.forEach(def => {
    def.fields.forEach(f => { if (!seen.has(f.token)) seen.set(f.token, f); });
  });
  const fields = Array.from(seen.values());
  container.innerHTML = fields.map(f => {
    const def = typeof f.default === 'function' ? (f.default(member) || '') : '';
    return `
      <div class="form-group">
        <label for="saf_${f.token}">${escapeHtml(f.label)}</label>
        <input type="text" id="saf_${f.token}" value="${escapeHtml(def)}">
      </div>`;
  }).join('');
}

async function performSendAgreement() {
  const member = members.find(m => m.id === sendAgreementMemberId);
  const statusEl = el('sendAgreementStatus');
  const sendBtn = el('sendAgreementSendBtn');
  if (!member || !sendAgreementSelectedDefs.length) return;

  const email = (el('sendAgreementTo').value || '').trim();
  if (!email) {
    if (statusEl) { statusEl.textContent = 'Enter the contractor\'s email first.'; statusEl.style.color = 'var(--color-error, #f68d5f)'; }
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Preparing documents...';
  if (statusEl) statusEl.textContent = '';

  try {
    const documents = await Promise.all(sendAgreementSelectedDefs.map(async (def) => {
      const base64 = await fetchPdfAsBase64('/api/contracts/' + encodeURIComponent(def.r2Key));
      return { name: def.filename, base64 };
    }));

    const seen = new Map();
    sendAgreementSelectedDefs.forEach(def => def.fields.forEach(f => { if (!seen.has(f.token)) seen.set(f.token, f); }));
    const fieldValues = {};
    seen.forEach((f, token) => {
      const input = el(`saf_${token}`);
      if (input && input.value.trim()) fieldValues[token] = input.value.trim();
    });

    sendBtn.textContent = 'Sending for signature...';
    const res = await fetch('/api/docusign/send-envelope', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documents,
        signerName: member.memberName,
        signerEmail: email,
        emailSubject: `Your Agreement with Revital Productions — ${member.memberName}`,
        fieldValues
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || `Send failed (${res.status})`);

    member.agreementStatus = 'Sent';
    member.agreementSentDate = todayStr();
    member.agreementEnvelopeId = data.envelopeId;
    await persist();
    renderTable();

    if (statusEl) { statusEl.textContent = `Sent for e-signature (envelope ${data.envelopeId}).`; statusEl.style.color = 'var(--color-success, #10b981)'; }
    if (window.parent.logAdminActivity) window.parent.logAdminActivity('Contractor agreement sent for e-signature', member.memberName);
    if (window.parent.showBanner) window.parent.showBanner('success', `Agreement sent to ${member.memberName} for e-signature.`);
    sendBtn.textContent = 'Sent ✓';
    setTimeout(() => { el('sendAgreementPanel').style.display = 'none'; sendBtn.disabled = false; sendBtn.textContent = 'Send for E-Signature (DocuSign)'; }, 1500);
  } catch (e) {
    console.error('Contractor agreement send failed:', e);
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send for E-Signature (DocuSign)';
    if (statusEl) { statusEl.textContent = "Couldn't send: " + e.message; statusEl.style.color = 'var(--color-error, #f68d5f)'; }
  }
}

const FORM_FIELDS = ['memberName', 'role', 'employmentType', 'email', 'currentClientCount', 'maxClientCount', 'notes'];

function resetForm() {
  editingId = null;
  el('memberName').value = '';
  el('role').value = 'Account Manager';
  el('employmentType').value = 'Full-Time';
  el('email').value = '';
  el('currentClientCount').value = '';
  el('maxClientCount').value = '';
  el('notes').value = '';
  el('formTitle').textContent = 'New Team Member';
  el('saveMemberBtn').textContent = 'Add Team Member';
  el('cancelEditBtn').style.display = 'none';
  el('formCard').style.display = 'none';
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    if (id === 'currentClientCount' || id === 'maxClientCount') {
      entry[id] = Math.max(0, parseInt(field.value) || 0);
    } else {
      entry[id] = field.value.trim ? field.value.trim() : field.value;
    }
  });
  return entry;
}

function saveMember() {
  const name = el('memberName').value.trim();
  if (!name) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Give this team member a name first.');
    return;
  }

  const entry = gatherForm();
  if (editingId) {
    const idx = members.findIndex(m => m.id === editingId);
    if (idx >= 0) members[idx] = entry;
  } else {
    members.unshift(entry);
  }

  persist().then(ok => {
    if (!ok) return;
    resetForm();
    renderTable();
    if (window.parent.showBanner) window.parent.showBanner('success', `Saved ${name}.`);
  });
}

function startEdit(id) {
  const entry = members.find(m => m.id === id);
  if (!entry) return;
  editingId = id;
  FORM_FIELDS.forEach(fieldId => { el(fieldId).value = entry[fieldId] || ''; });
  el('formTitle').textContent = 'Edit Team Member';
  el('saveMemberBtn').textContent = 'Update Team Member';
  el('cancelEditBtn').style.display = 'inline-block';
  el('formCard').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeMember(id) {
  const entry = members.find(m => m.id === id);
  if (!entry) return;
  if (!confirm(`Remove ${entry.memberName} from the roster?`)) return;
  members = members.filter(m => m.id !== id);
  persist().then(ok => {
    if (!ok) return;
    if (editingId === id) resetForm();
    renderTable();
  });
}

function capacityInfo(entry) {
  const current = parseInt(entry.currentClientCount) || 0;
  const max = parseInt(entry.maxClientCount) || 0;
  if (max <= 0) return { label: '—', cls: 'capacity-unknown' };
  if (current >= max) return { label: 'At Capacity', cls: 'capacity-full' };
  if (current >= max * 0.8) return { label: 'Near Capacity', cls: 'capacity-near' };
  return { label: 'Has Room', cls: 'capacity-room' };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function updateSummary() {
  let hasRoom = 0, nearCapacity = 0, atCapacity = 0;
  members.forEach(m => {
    const info = capacityInfo(m);
    if (info.cls === 'capacity-room') hasRoom++;
    else if (info.cls === 'capacity-near') nearCapacity++;
    else if (info.cls === 'capacity-full') atCapacity++;
  });
  el('summaryTeamCount').textContent = members.length;
  el('summaryHasRoom').textContent = hasRoom;
  el('summaryNearCapacity').textContent = nearCapacity;
  el('summaryAtCapacity').textContent = atCapacity;
}

function renderTable() {
  updateSummary();

  const filter = (el('filterInput').value || '').trim().toLowerCase();
  const rows = members.filter(m => {
    if (!filter) return true;
    return (m.memberName || '').toLowerCase().includes(filter) || (m.role || '').toLowerCase().includes(filter);
  });

  const tbody = el('rosterTableBody');
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  tbody.innerHTML = rows.map(m => {
    const info = capacityInfo(m);
    const current = parseInt(m.currentClientCount) || 0;
    const max = parseInt(m.maxClientCount) || 0;
    const loadText = max > 0 ? `${current} / ${max}` : (current || '—');
    const percent = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
    const barFillClass = info.cls === 'capacity-unknown' ? '' : info.cls;
    const loadCell = max > 0
      ? `<div class="capacity-bar-cell">
           <div class="capacity-bar-wrap" title="${percent}% of capacity">
             <div class="capacity-bar-fill ${barFillClass}" style="width:${percent}%;"></div>
           </div>
           <span class="capacity-bar-label">${loadText}</span>
         </div>`
      : loadText;
    const isContractor = m.employmentType === 'Contractor';
    let agreementCell = '—';
    if (isContractor) {
      if (m.agreementStatus === 'Sent') {
        agreementCell = `<span class="section-tag" title="Envelope ${escapeHtml(m.agreementEnvelopeId || '')}">Sent ${escapeHtml(m.agreementSentDate || '')}</span>`;
      } else {
        agreementCell = `<span class="section-tag capacity-unknown">Not Sent</span>`;
      }
    }
    return `<tr>
      <td class="client-cell">${escapeHtml(m.memberName)}</td>
      <td>${escapeHtml(m.role)}${isContractor ? ' <span class="section-tag" style="margin-left:4px;">Contractor</span>' : ''}</td>
      <td>${escapeHtml(m.employmentType)}</td>
      <td>${loadCell}</td>
      <td><span class="section-tag ${info.cls}">${info.label}</span></td>
      <td>${agreementCell}</td>
      <td>${escapeHtml(m.notes) || '—'}</td>
      <td class="roster-actions-cell" style="display:${isRestrictedUser ? 'none' : ''};">
        <div class="row-actions">
          ${isContractor ? `<button class="send-agreement-btn" data-id="${m.id}">Send Agreement</button>` : ''}
          <button class="edit-btn" data-id="${m.id}">Edit</button>
          <button class="remove-btn" data-id="${m.id}">Remove</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => startEdit(btn.getAttribute('data-id'))));
  tbody.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => removeMember(btn.getAttribute('data-id'))));
  tbody.querySelectorAll('.send-agreement-btn').forEach(btn => btn.addEventListener('click', () => openSendAgreementPanel(btn.getAttribute('data-id'))));
}

// Same partial gate as Email Template Library/SOP Wiki: everyone can view
// the roster (useful for anyone assigning new client work), but only
// admin/leadership can add, edit, or remove team members.
function applyEditPermission() {
  if (!window.parent || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot) return;
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamAccess");
  window.parent.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap && docSnap.exists ? docSnap.data() : null;
    const users = (data && data.users) ? data.users : {};
    const currentEmail = (window.parent.currentAdminEmail || "").toLowerCase();
    isRestrictedUser = !!(currentEmail && Object.prototype.hasOwnProperty.call(users, currentEmail));

    el('newMemberBtn').style.display = isRestrictedUser ? 'none' : '';
    el('actionsHeader').style.display = isRestrictedUser ? 'none' : '';
    if (isRestrictedUser) el('formCard').style.display = 'none';
    const contractorDocCard = el('contractorDocCard');
    if (contractorDocCard) {
      contractorDocCard.style.display = isRestrictedUser ? 'none' : 'block';
      if (!isRestrictedUser) renderContractorDocManager();
    }
    renderTable();
  }, (err) => {
    console.error("Edit-permission listener error:", err);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  applyEditPermission();
  resetForm();
  await loadMembers();
  renderTable();

  el('newMemberBtn').addEventListener('click', () => {
    resetForm();
    el('formCard').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  el('saveMemberBtn').addEventListener('click', saveMember);
  el('cancelEditBtn').addEventListener('click', resetForm);
  el('filterInput').addEventListener('input', renderTable);

  const sendAgreementCloseBtn = el('sendAgreementCloseBtn');
  const sendAgreementSendBtn = el('sendAgreementSendBtn');
  if (sendAgreementCloseBtn) {
    sendAgreementCloseBtn.addEventListener('click', () => { el('sendAgreementPanel').style.display = 'none'; });
  }
  if (sendAgreementSendBtn) {
    sendAgreementSendBtn.addEventListener('click', performSendAgreement);
  }
});
