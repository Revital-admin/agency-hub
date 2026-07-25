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

function saveGuideline() {
  const clientName = el('clientSelect').value;
  if (!clientName) return;
  const clients = getClients();

  clients[clientName].brandGuideline = {
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

  persist();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Brand Guidelines saved for ${clientName}.`);
  }
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
