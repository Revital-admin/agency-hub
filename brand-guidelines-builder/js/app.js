/* ============================================================
   BRAND GUIDELINES BUILDER — APP LOGIC
   The "deep" complement to Brand Asset Kit (Lite). Same own
   client-select pattern, same clients[name].* + saveDatabase()
   persistence, stored separately at client.brandGuideline so it
   doesn't collide with the Lite tool's client.brandKit object -
   the two are intentionally independent, not layered on each other.
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
  const g = clients[clientName].brandGuideline || blankGuideline();

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
// (a lead, or use it for Revital's own materials) outside the Hub. Same
// html2pdf pattern as the rest of the Hub's Download PDF buttons, built
// from scratch (not reusing an on-screen preview, since this tool doesn't
// have one) covering every section: overview, logo, colors, typography,
// voice/tone, messaging, imagery.
function colorSwatchHtml(hex, label, usage) {
  const safeHex = /^#[0-9A-F]{3,8}$/i.test(hex || '') ? hex : '#ffffff';
  return `
    <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:14px;">
      <div style="width:44px; height:44px; border-radius:8px; border:1px solid #e2e8f0; background:${safeHex}; flex-shrink:0;"></div>
      <div>
        <div style="font-weight:600; color:#0f172a;">${escapeHtml(label)} <span style="font-weight:400; color:#64748b; font-family:monospace; font-size:12px;">${escapeHtml(hex || '--')}</span></div>
        ${usage ? `<div style="color:#475569; font-size:12.5px; margin-top:2px;">${escapeHtml(usage)}</div>` : ''}
      </div>
    </div>`;
}

function imageGridHtml(list, emptyLabel) {
  if (!list || !list.length) return `<p style="color:#94a3b8; font-size:13px;">${emptyLabel}</p>`;
  return `<div style="display:flex; flex-wrap:wrap; gap:12px;">${list.map(l => {
    const isImage = l.isImage || (l.url || '').startsWith('data:image');
    const thumb = isImage
      ? `<img src="${l.url}" style="width:120px; height:90px; object-fit:contain; border:1px solid #e2e8f0; border-radius:6px; background:#f8fafc;">`
      : `<div style="width:120px; height:90px; border:1px solid #e2e8f0; border-radius:6px; background:#f8fafc; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; text-align:center; padding:4px; overflow:hidden;">${escapeHtml(l.url || '')}</div>`;
    return `<div style="width:120px;">${thumb}<div style="font-size:11px; color:#475569; margin-top:4px; text-align:center;">${escapeHtml(l.label || '')}</div></div>`;
  }).join('')}</div>`;
}

function pdfSectionHtml(title, bodyHtml) {
  return `
    <div style="margin-bottom:26px; page-break-inside:avoid;">
      <h2 style="font-size:16px; color:#0f172a; border-bottom:2px solid #e2e8f0; padding-bottom:6px; margin-bottom:12px;">${title}</h2>
      ${bodyHtml}
    </div>`;
}

function pdfTextBlockHtml(label, value) {
  return value ? `<div style="margin-bottom:10px;"><strong style="color:#0f172a;">${label}:</strong> <span style="color:#334155; white-space:pre-wrap;">${escapeHtml(value)}</span></div>` : '';
}

function buildGuidelinePdfHtml(clientName, g) {
  return `
    <img src="assets/logo.png" onerror="this.src='../logo.png'" alt="Revital Hub" style="height:50px; width:144px; object-fit:contain; margin-bottom:30px;">
    <h1 style="font-size:26px; font-weight:700; color:#0f172a; border-bottom:4px solid #f59e0b; padding-bottom:16px; margin-bottom:6px;">Brand Guidelines: ${escapeHtml(clientName)}</h1>
    <p style="color:#64748b; font-size:13px; margin-bottom:28px;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>

    ${pdfSectionHtml('Brand Overview', `
      ${pdfTextBlockHtml('Mission', g.mission)}
      ${pdfTextBlockHtml('Story', g.story)}
      ${pdfTextBlockHtml('Core Values', g.values)}
      ${pdfTextBlockHtml('Target Audience', g.audience)}
    `)}

    ${pdfSectionHtml('Logo', `
      ${g.primaryLogoUrl ? `<img src="${g.primaryLogoUrl}" style="max-width:200px; max-height:120px; object-fit:contain; border:1px solid #e2e8f0; border-radius:6px; padding:10px; margin-bottom:14px; background:#f8fafc;">` : `<p style="color:#94a3b8; font-size:13px;">No primary logo uploaded.</p>`}
      <div style="font-weight:600; color:#0f172a; margin:14px 0 8px;">Logo Variations</div>
      ${imageGridHtml(g.logoVariations, 'None added yet.')}
      ${pdfTextBlockHtml('Clear Space', g.clearSpace)}
      ${pdfTextBlockHtml("Don'ts", g.logoDonts)}
    `)}

    ${pdfSectionHtml('Color Palette', `
      ${colorSwatchHtml(g.primaryColor, 'Primary', g.primaryColorUsage)}
      ${colorSwatchHtml(g.secondaryColor, 'Secondary', g.secondaryColorUsage)}
      ${colorSwatchHtml(g.accentColor, 'Accent', g.accentColorUsage)}
      ${colorSwatchHtml(g.neutralColor, 'Neutral', g.neutralColorUsage)}
    `)}

    ${pdfSectionHtml('Typography', `
      ${pdfTextBlockHtml('Primary Font', g.fontPrimary)}
      ${pdfTextBlockHtml('Secondary Font', g.fontSecondary)}
      ${pdfTextBlockHtml('Type Scale', g.typeScale)}
      ${pdfTextBlockHtml('Font License', g.fontLicenseUrl)}
    `)}

    ${pdfSectionHtml('Voice & Tone', `
      ${pdfTextBlockHtml('Personality', g.personality)}
      ${pdfTextBlockHtml('Tone', g.toneDescription)}
      ${pdfTextBlockHtml("Writing Do's", g.writingDos)}
      ${pdfTextBlockHtml("Writing Don'ts", g.writingDonts)}
    `)}

    ${pdfSectionHtml('Messaging', `
      ${pdfTextBlockHtml('Tagline', g.tagline)}
      ${pdfTextBlockHtml('Elevator Pitch', g.elevatorPitch)}
      ${pdfTextBlockHtml('Messaging Pillars', g.messagingPillars)}
    `)}

    ${pdfSectionHtml('Imagery', `
      ${pdfTextBlockHtml('Imagery Style', g.imageryStyle)}
      <div style="font-weight:600; color:#0f172a; margin:14px 0 8px;">Reference Images</div>
      ${imageGridHtml(g.imageryRefs, 'None added yet.')}
    `)}
  `;
}

async function downloadGuidelinePdf() {
  const clientName = el('clientSelect').value;
  if (!clientName) return;
  const btn = el('downloadGuidelinePdfBtn');
  const origHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>Generating...</span>';

  const g = collectGuidelineFromForm();

  const container = document.createElement('div');
  container.style.cssText = 'font-family: "Inter", sans-serif, Arial; color:#1e293b; font-size:14px; line-height:1.6; width:100%; padding:40px; box-sizing:border-box; background:white;';
  container.innerHTML = buildGuidelinePdfHtml(clientName, g);

  try {
    const opt = {
      margin: 0,
      filename: `Brand_Guidelines_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.92 },
      html2canvas: { scale: 2, letterRendering: true, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    if (typeof html2pdf !== 'undefined') {
      await html2pdf().set(opt).from(container).save();
    } else {
      alert("PDF library failed to load.");
    }
  } catch (e) {
    console.error("PDF error:", e);
    alert("Something went wrong generating the PDF.");
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
