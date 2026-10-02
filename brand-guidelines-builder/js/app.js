/* ============================================================
   BRAND GUIDELINES BUILDER — APP LOGIC
   The "deep" complement to Brand Asset Kit (Lite). Same own
   client-select pattern, same clients[name].* + saveDatabase()
   persistence, stored separately at client.brandGuideline so it
   doesn't collide with the Lite tool's client.brandKit object.
   Storage stays independent, but a brand-new guideline (nothing saved
   here yet) now prefills colors/fonts/logo/audience from Brand Identity
   Vault instead of generic blank defaults - see prefilledBlankGuideline
   below. Everything here stays fully editable after that; this is a
   one-time starting point, not an ongoing sync.
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

function uid() { return 'lv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function syncColorInputs(pickerId, textId) {
  const picker = el(pickerId);
  const text = el(textId);
  picker.addEventListener('input', () => { text.value = picker.value.toUpperCase(); });
  text.addEventListener('input', () => {
    const val = text.value.trim();
    if (/^#[0-9A-F]{6}$/i.test(val)) picker.value = val;
  });
}

let logoVariations = [];
let imageryRefs = [];

function addLinkToList(labelId, urlId, arr, rerender) {
  const label = el(labelId).value.trim();
  const url = el(urlId).value.trim();
  if (!url) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Enter a URL first.');
    return;
  }
  arr.push({ id: uid(), label: label || url, url });
  el(labelId).value = '';
  el(urlId).value = '';
  rerender();
}

function renderLinkList(listId, arr, removeFn) {
  const list = el(listId);
  if (arr.length === 0) {
    list.innerHTML = '<p style="color:var(--color-text-secondary); font-size:13px; margin:0;">None added yet.</p>';
    return;
  }
  list.innerHTML = arr.map(l => {
    const isImage = l.isImage || (l.url || '').startsWith('data:image');
    const main = isImage
      ? `<img class="embed-thumb" src="${l.url}" alt=""><span><strong>${escapeHtml(l.label)}</strong> — uploaded image</span>`
      : `<span><strong>${escapeHtml(l.label)}</strong> — ${escapeHtml(l.url)}</span>`;
    return `
    <li class="embed-link-chip">
      <div class="embed-link-main">${main}</div>
      <button data-id="${l.id}" class="${removeFn}">✕</button>
    </li>
  `;
  }).join('');
}

let imageDropCounter = 0;

// Dropping/uploading an image adds it straight to the given list (Logo
// Variations or Imagery References) as a thumbnail, same mechanism as
// Mood Board Builder / Case Study Builder's reference-image drops.
function handleDroppedImageIntoList(file, arr, rerender) {
  processImageFile(file, { maxWidth: 800 }).then(dataUrl => {
    imageDropCounter++;
    const label = (file.name || `Image ${imageDropCounter}`).replace(/\.[^.]+$/, '');
    arr.push({ id: uid(), label, url: dataUrl, isImage: true });
    rerender();
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('success', `Added "${label}".`);
  }).catch(errMsg => {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', errMsg);
  });
}

// Primary logo is a single field (bgPrimaryLogoUrl), not a list - drop
// compresses the file and fills the URL field directly, same as Client
// Portal Manager's own logo drop zone, plus a small preview here too.
function handleDroppedPrimaryLogo(file) {
  processImageFile(file, { maxWidth: 800, keepPng: true }).then(dataUrl => {
    el('bgPrimaryLogoUrl').value = dataUrl;
    updatePrimaryLogoPreview(dataUrl);
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('success', 'Primary logo added.');
  }).catch(errMsg => {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', errMsg);
  });
}

function updatePrimaryLogoPreview(url) {
  const preview = el('primaryLogoPreview');
  const text = el('primaryLogoDropZoneText');
  if (url) {
    preview.src = url;
    preview.style.display = 'block';
    text.style.display = 'none';
  } else {
    preview.style.display = 'none';
    text.style.display = 'block';
  }
}

function renderLogoVariations() {
  renderLinkList('logoVariationsList', logoVariations, 'remove-logo-var-btn');
  document.querySelectorAll('.remove-logo-var-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      logoVariations = logoVariations.filter(l => l.id !== btn.getAttribute('data-id'));
      renderLogoVariations();
    });
  });
}

function renderImageryRefs() {
  renderLinkList('imageryRefsList', imageryRefs, 'remove-img-ref-btn');
  document.querySelectorAll('.remove-img-ref-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      imageryRefs = imageryRefs.filter(l => l.id !== btn.getAttribute('data-id'));
      renderImageryRefs();
    });
  });
}

function blankGuideline() {
  return {
    mission: '', story: '', values: '', audience: '',
    primaryLogoUrl: '', logoVariations: [], clearSpace: '', logoDonts: '',
    primaryColor: '#000000', primaryColorUsage: '',
    secondaryColor: '#FFFFFF', secondaryColorUsage: '',
    accentColor: '#FF0000', accentColorUsage: '',
    neutralColor: '#F5F5F5', neutralColorUsage: '',
    fontPrimary: '', fontSecondary: '', typeScale: '', fontLicenseUrl: '',
    personality: '', toneDescription: '', writingDos: '', writingDonts: '',
    tagline: '', elevatorPitch: '', messagingPillars: '',
    imageryStyle: '', imageryRefs: []
  };
}

// Brand Identity Vault and this tool used to capture colors/fonts/logo/
// audience completely independently - two places for the same facts to
// disagree. Only runs the very first time this tool is opened for a
// client (no client.brandGuideline saved yet) - once anything's been
// saved here, that saved data is always what's shown, this never
// overwrites it. Same "prefill once, no overwrite" pattern already used
// for Brand Asset Kit (Lite)'s client.brandKit derivation from the Vault.
function prefilledBlankGuideline(client) {
  const g = blankGuideline();
  const bv = client && client.brandVault;
  if (!bv) return g;

  if (bv.colors && bv.colors[0] && bv.colors[0].hex) g.primaryColor = bv.colors[0].hex;
  if (bv.colors && bv.colors[1] && bv.colors[1].hex) g.secondaryColor = bv.colors[1].hex;
  if (bv.colors && bv.colors[2] && bv.colors[2].hex) g.accentColor = bv.colors[2].hex;

  if (bv.typography) {
    if (bv.typography.primaryFont) g.fontPrimary = bv.typography.primaryFont;
    if (bv.typography.secondaryFont) g.fontSecondary = bv.typography.secondaryFont;
  }

  if (bv.assets && bv.assets.logoUrl) g.primaryLogoUrl = bv.assets.logoUrl;

  if (bv.targetAudience) {
    const parts = [bv.targetAudience.demographic, bv.targetAudience.painPoints].filter(Boolean);
    if (parts.length) g.audience = parts.join('\n\n');
  }

  return g;
}

function renderState() {
  const clientName = el('clientSelect').value;
  if (!clientName) {
    el('emptyState').style.display = 'flex';
    el('guidelineInterface').style.display = 'none';
    return;
  }
  el('emptyState').style.display = 'none';
  el('guidelineInterface').style.display = 'flex';

  const clients = getClients();
  const g = clients[clientName].brandGuideline || prefilledBlankGuideline(clients[clientName]);

  el('bgMission').value = g.mission || '';
  el('bgStory').value = g.story || '';
  el('bgValues').value = g.values || '';
  el('bgAudience').value = g.audience || '';

  el('bgPrimaryLogoUrl').value = g.primaryLogoUrl || '';
  updatePrimaryLogoPreview(g.primaryLogoUrl || '');
  logoVariations = (g.logoVariations || []).map(l => ({ ...l }));
  renderLogoVariations();
  el('bgClearSpace').value = g.clearSpace || '';
  el('bgLogoDonts').value = g.logoDonts || '';

  el('primaryColorText').value = g.primaryColor || '#000000';
  el('primaryColorPick').value = g.primaryColor || '#000000';
  el('primaryColorUsage').value = g.primaryColorUsage || '';
  el('secondaryColorText').value = g.secondaryColor || '#FFFFFF';
  el('secondaryColorPick').value = g.secondaryColor || '#FFFFFF';
  el('secondaryColorUsage').value = g.secondaryColorUsage || '';
  el('accentColorText').value = g.accentColor || '#FF0000';
  el('accentColorPick').value = g.accentColor || '#FF0000';
  el('accentColorUsage').value = g.accentColorUsage || '';
  el('neutralColorText').value = g.neutralColor || '#F5F5F5';
  el('neutralColorPick').value = g.neutralColor || '#F5F5F5';
  el('neutralColorUsage').value = g.neutralColorUsage || '';

  el('bgFontPrimary').value = g.fontPrimary || '';
  el('bgFontSecondary').value = g.fontSecondary || '';
  el('bgTypeScale').value = g.typeScale || '';
  el('bgFontLicenseUrl').value = g.fontLicenseUrl || '';

  el('bgPersonality').value = g.personality || '';
  el('bgToneDescription').value = g.toneDescription || '';
  el('bgWritingDos').value = g.writingDos || '';
  el('bgWritingDonts').value = g.writingDonts || '';

  el('bgTagline').value = g.tagline || '';
  el('bgElevatorPitch').value = g.elevatorPitch || '';
  el('bgMessagingPillars').value = g.messagingPillars || '';

  el('bgImageryStyle').value = g.imageryStyle || '';
  imageryRefs = (g.imageryRefs || []).map(l => ({ ...l }));
  renderImageryRefs();
}

// Pulled out of saveGuideline so the Download PDF button (below) can read
// exactly what's currently on screen - including edits not yet saved -
// instead of either duplicating this whole field list a second time or
// exporting the last-saved snapshot and silently dropping anything the
// user just typed but hasn't clicked Save Brand Guidelines for yet.
function collectGuidelineFromForm() {
  return {
    mission: el('bgMission').value.trim(),
    story: el('bgStory').value.trim(),
    values: el('bgValues').value.trim(),
    audience: el('bgAudience').value.trim(),

    primaryLogoUrl: el('bgPrimaryLogoUrl').value.trim(),
    logoVariations: logoVariations,
    clearSpace: el('bgClearSpace').value.trim(),
    logoDonts: el('bgLogoDonts').value.trim(),

    primaryColor: el('primaryColorText').value.trim(),
    primaryColorUsage: el('primaryColorUsage').value.trim(),
    secondaryColor: el('secondaryColorText').value.trim(),
    secondaryColorUsage: el('secondaryColorUsage').value.trim(),
    accentColor: el('accentColorText').value.trim(),
    accentColorUsage: el('accentColorUsage').value.trim(),
    neutralColor: el('neutralColorText').value.trim(),
    neutralColorUsage: el('neutralColorUsage').value.trim(),

    fontPrimary: el('bgFontPrimary').value.trim(),
    fontSecondary: el('bgFontSecondary').value.trim(),
    typeScale: el('bgTypeScale').value.trim(),
    fontLicenseUrl: el('bgFontLicenseUrl').value.trim(),

    personality: el('bgPersonality').value.trim(),
    toneDescription: el('bgToneDescription').value.trim(),
    writingDos: el('bgWritingDos').value.trim(),
    writingDonts: el('bgWritingDonts').value.trim(),

    tagline: el('bgTagline').value.trim(),
    elevatorPitch: el('bgElevatorPitch').value.trim(),
    messagingPillars: el('bgMessagingPillars').value.trim(),

    imageryStyle: el('bgImageryStyle').value.trim(),
    imageryRefs: imageryRefs
  };
}

// Keeps the Client Portal's synced brand colors from going stale.
// client.portalConfig.primaryColor/secondaryColor/accentColor actually
// re-skin the live client-facing Portal (the --color-primary theme
// variable) - Client Portal Manager's "Sync Colors from Brand Kit"
// button used to be the only way these ever got set, which meant
// editing colors here after the last manual sync left the Portal
// showing stale ones until someone remembered to click Sync again.
// Mirrors that button's own field mapping exactly (see
// client-portal-manager/js/app.js's syncFromBrandKitBtn handler).
function syncBrandColorsToPortal(client, guideline) {
  if (!client) return;
  if (!guideline.primaryColor && !guideline.secondaryColor && !guideline.accentColor) return;
  if (!client.portalConfig) client.portalConfig = {};
  if (guideline.primaryColor) client.portalConfig.primaryColor = guideline.primaryColor;
  if (guideline.secondaryColor) client.portalConfig.secondaryColor = guideline.secondaryColor;
  if (guideline.accentColor) client.portalConfig.accentColor = guideline.accentColor;
}

function saveGuideline() {
  const clientName = el('clientSelect').value;
  if (!clientName) return;
  const clients = getClients();
  const guideline = collectGuidelineFromForm();
  clients[clientName].brandGuideline = guideline;
  syncBrandColorsToPortal(clients[clientName], guideline);
  persist();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Brand Guidelines saved for ${clientName}.`);
  }
}

// ── Download PDF ──
// Brand Guidelines Builder had zero export before this - you could build
// out a full guideline here but had no way to actually hand it to anyone
// (a lead, or use it for Revital's own materials) outside the Hub.
// Oct 2026: built with the shared RevitalPDF module (../shared/pdf-report.js)
// rather than html2canvas/html2pdf - see that file for the full rationale.
// Covers every section: overview, logo, colors, typography, voice/tone,
// messaging, imagery. Logo/reference images are drawn directly via jsPDF's
// addImage() (same approach as Case Study Builder); color swatches are
// drawn as real filled rectangles.

function pdfTextBlock(r, label, value) {
  if (!value) return;
  r.paragraph(label, { bold: true, size: 10, spaceAfter: 3 });
  r.paragraph(value, { spaceAfter: 12 });
}

function hexToRgbArr(hex) {
  if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex || '')) return [255, 255, 255];
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

function pdfColorRow(r, hex, label, usage) {
  const doc = r.doc; const C = r.colors;
  r.ensureSpace(50);
  doc.setFillColor.apply(doc, hexToRgbArr(hex));
  doc.rect(r.MARGIN, r.y, 36, 36, 'F');
  doc.setDrawColor(226, 232, 240); doc.rect(r.MARGIN, r.y, 36, 36);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor.apply(doc, C.DARK);
  doc.text(`${label}  ${hex || '--'}`, r.MARGIN + 46, r.y + 14);
  if (usage) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, C.GRAY);
    doc.text(doc.splitTextToSize(usage, r.CONTENT_W - 46), r.MARGIN + 46, r.y + 28);
  }
  r.y += 50;
}

function pdfImageList(r, list, emptyLabel) {
  const C = r.colors;
  if (!list || !list.length) {
    r.paragraph(emptyLabel, { italic: true, size: 9, color: C.GRAY, spaceAfter: 10 });
    return;
  }
  list.forEach(l => {
    const isImage = l.isImage || (l.url || '').startsWith('data:image');
    if (!isImage) {
      r.bulletList([`${l.label || 'Reference'}: ${l.url || ''}`]);
      return;
    }
    try {
      const props = r.doc.getImageProperties(l.url);
      const w = Math.min(180, r.CONTENT_W);
      const h = w * (props.height / props.width);
      r.ensureSpace(h + 24);
      const fmt = l.url.indexOf('data:image/png') === 0 ? 'PNG' : 'JPEG';
      r.doc.addImage(l.url, fmt, r.MARGIN, r.y, w, h);
      r.y += h + 4;
      if (l.label) r.paragraph(l.label, { size: 8.5, italic: true, color: C.GRAY, spaceAfter: 10 });
    } catch (e) {
      console.warn('Skipping image in brand guidelines PDF:', e);
    }
  });
}

function downloadGuidelinePdf() {
  const clientName = el('clientSelect').value;
  if (!clientName) return;
  const btn = el('downloadGuidelinePdfBtn');
  const origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>Generating...</span>';

  const g = collectGuidelineFromForm();

  try {
    if (typeof window.RevitalPDF === 'undefined') {
      alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
      btn.disabled = false; btn.innerHTML = origHtml;
      return;
    }
    const r = RevitalPDF.create({ reportTitle: 'BRAND GUIDELINES', companyName: clientName });

    r.coverPage({
      title: 'Brand Guidelines',
      subLine: new Date().toLocaleDateString(),
      objective: g.mission || undefined,
    });

    r.newPage();
    r.sectionHeader('Brand Overview');
    pdfTextBlock(r, 'Mission', g.mission);
    pdfTextBlock(r, 'Story', g.story);
    pdfTextBlock(r, 'Core Values', g.values);
    pdfTextBlock(r, 'Target Audience', g.audience);

    r.sectionHeader('Logo');
    if (g.primaryLogoUrl) {
      try {
        const props = r.doc.getImageProperties(g.primaryLogoUrl);
        const w = Math.min(200, r.CONTENT_W);
        const h = w * (props.height / props.width);
        r.ensureSpace(h + 20);
        const fmt = g.primaryLogoUrl.indexOf('data:image/png') === 0 ? 'PNG' : 'JPEG';
        r.doc.addImage(g.primaryLogoUrl, fmt, r.MARGIN, r.y, w, h);
        r.y += h + 14;
      } catch (e) { console.warn('Skipping primary logo in PDF:', e); }
    } else {
      r.paragraph('No primary logo uploaded.', { italic: true, size: 9, color: r.colors.GRAY, spaceAfter: 10 });
    }
    r.paragraph('Logo Variations', { bold: true, size: 10, spaceAfter: 6 });
    pdfImageList(r, g.logoVariations, 'None added yet.');
    pdfTextBlock(r, 'Clear Space', g.clearSpace);
    pdfTextBlock(r, "Don'ts", g.logoDonts);

    r.newPage();
    r.sectionHeader('Color Palette');
    pdfColorRow(r, g.primaryColor, 'Primary', g.primaryColorUsage);
    pdfColorRow(r, g.secondaryColor, 'Secondary', g.secondaryColorUsage);
    pdfColorRow(r, g.accentColor, 'Accent', g.accentColorUsage);
    pdfColorRow(r, g.neutralColor, 'Neutral', g.neutralColorUsage);

    r.sectionHeader('Typography');
    pdfTextBlock(r, 'Primary Font', g.fontPrimary);
    pdfTextBlock(r, 'Secondary Font', g.fontSecondary);
    pdfTextBlock(r, 'Type Scale', g.typeScale);
    pdfTextBlock(r, 'Font License', g.fontLicenseUrl);

    r.newPage();
    r.sectionHeader('Voice & Tone');
    pdfTextBlock(r, 'Personality', g.personality);
    pdfTextBlock(r, 'Tone', g.toneDescription);
    pdfTextBlock(r, "Writing Do's", g.writingDos);
    pdfTextBlock(r, "Writing Don'ts", g.writingDonts);

    r.sectionHeader('Messaging');
    pdfTextBlock(r, 'Tagline', g.tagline);
    pdfTextBlock(r, 'Elevator Pitch', g.elevatorPitch);
    pdfTextBlock(r, 'Messaging Pillars', g.messagingPillars);

    r.newPage();
    r.sectionHeader('Imagery');
    pdfTextBlock(r, 'Imagery Style', g.imageryStyle);
    r.paragraph('Reference Images', { bold: true, size: 10, spaceAfter: 6 });
    pdfImageList(r, g.imageryRefs, 'None added yet.');

    r.save(`Brand_Guidelines_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (e) {
    console.error("PDF error:", e);
    alert("Something went wrong generating the PDF: " + (e && e.message ? e.message : e));
  }

  btn.disabled = false;
  btn.innerHTML = origHtml;
}

function autoSelectActiveClient() {
  if (!isEmbedded) return;
  try {
    const active = window.parent.getActiveClient && window.parent.getActiveClient();
    const activeName = active && active.name;
    const select = el('clientSelect');
    if (activeName && Array.from(select.options).some(o => o.value === activeName)) {
      select.value = activeName;
    }
  } catch (e) { /* CORS or not embedded - leave picker on "Select a client..." */ }
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  autoSelectActiveClient();
  renderState();
  el('clientSelect').addEventListener('change', renderState);
  el('saveGuidelineBtn').addEventListener('click', saveGuideline);
  const downloadPdfBtn = el('downloadGuidelinePdfBtn');
  if (downloadPdfBtn) downloadPdfBtn.addEventListener('click', downloadGuidelinePdf);
  el('addLogoVarBtn').addEventListener('click', () => addLinkToList('logoVarLabel', 'logoVarUrl', logoVariations, renderLogoVariations));
  el('addImgRefBtn').addEventListener('click', () => addLinkToList('imgRefLabel', 'imgRefUrl', imageryRefs, renderImageryRefs));

  wireDropZone(el('primaryLogoDropZone'), el('primaryLogoFileInput'), handleDroppedPrimaryLogo);
  wireDropZone(el('logoVarDropZone'), el('logoVarFileInput'), (file) => handleDroppedImageIntoList(file, logoVariations, renderLogoVariations));
  wireDropZone(el('imgRefDropZone'), el('imgRefFileInput'), (file) => handleDroppedImageIntoList(file, imageryRefs, renderImageryRefs));

  syncColorInputs('primaryColorPick', 'primaryColorText');
  syncColorInputs('secondaryColorPick', 'secondaryColorText');
  syncColorInputs('accentColorPick', 'accentColorText');
  syncColorInputs('neutralColorPick', 'neutralColorText');

  let clientPollAttempts = 0;
  const clientPoll = setInterval(() => {
    clientPollAttempts++;
    const hasClients = Object.keys(getClients()).length > 0;
    if (hasClients || clientPollAttempts > 30) {
      clearInterval(clientPoll);
      if (hasClients) {
        populateClientSelect();
        autoSelectActiveClient();
        renderState();
      }
    }
  }, 250);
});
