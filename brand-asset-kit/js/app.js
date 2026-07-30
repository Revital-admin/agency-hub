/* ============================================================
   BRAND ASSET KIT (LITE) — APP LOGIC
   Read-only quick-glance view, not an independent data store.

   HISTORY: this used to be its own editable tool writing to
   client.brandKit, completely separate from Brand Identity Vault
   (client.brandVault). Nothing kept the two in sync, and the Client
   Onboarding SOP only ever told staff to fill in the Vault - so a team
   could do everything the SOP asked and the client's own Portal (which
   reads client.brandKit, see portal/js/app.js renderBrandKit()) would
   still show an empty brand section.

   FIX: Brand Identity Vault is now the single real data-entry point.
   Saving it (see saveBrandVault() in the root app.js) derives and writes
   client.brandKit automatically, so filling in the Vault is enough on its
   own. This tool just displays that same data read-only, with a shortcut
   button back to the Vault - it doesn't write anything.

   Falls back to any pre-existing client.brandKit field the old editable
   version may have saved, for clients who had Kit data before this change
   but haven't touched Brand Identity Vault since - so nothing they
   already had appears to vanish.
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// Brand Identity Vault's 5 named colors (Primary, Secondary, Accent 1,
// Accent 2, Background) collapse down to the Lite view's 3-color summary -
// this mirrors the exact mapping saveBrandVault() uses to derive
// client.brandKit, so what's shown here always matches what the Portal is
// actually displaying to the client.
function getDerivedKit(client) {
  const bv = client.brandVault;
  const legacyKit = client.brandKit || {};
  const colors = (bv && bv.colors) || [];

  return {
    primaryColor: (colors[0] && colors[0].hex) || legacyKit.primaryColor || '',
    secondaryColor: (colors[1] && colors[1].hex) || legacyKit.secondaryColor || '',
    accentColor: (colors[2] && colors[2].hex) || legacyKit.accentColor || '',
    fontPrimary: (bv && bv.typography && bv.typography.primaryFont) || legacyKit.fontPrimary || '',
    fontSecondary: (bv && bv.typography && bv.typography.secondaryFont) || legacyKit.fontSecondary || '',
    toneOfVoice: (bv && bv.brandVoice && bv.brandVoice.adjectives) || legacyKit.toneOfVoice || '',
    logoUrl: (bv && bv.assets && bv.assets.logoUrl) || legacyKit.logoUrl || ''
  };
}

function renderState() {
  const clientName = el('clientSelect').value;
  if (!clientName) {
    el('emptyState').style.display = 'flex';
    el('brandKitInterface').style.display = 'none';
    return;
  }

  el('emptyState').style.display = 'none';
  el('brandKitInterface').style.display = 'block';

  const clients = getClients();
  const client = clients[clientName] || {};
  const kit = getDerivedKit(client);

  // Colors
  const colorDefs = [
    { label: 'Primary', hex: kit.primaryColor },
    { label: 'Secondary', hex: kit.secondaryColor },
    { label: 'Accent', hex: kit.accentColor }
  ];
  const colorsHtml = colorDefs
    .filter(c => c.hex)
    .map(c => `
      <div class="kit-color-row">
        <div class="kit-color-swatch" style="background-color:${escapeHtml(c.hex)};"></div>
        <span class="kit-color-label">${escapeHtml(c.label)}</span>
        <span class="kit-color-hex">${escapeHtml(c.hex)}</span>
      </div>
    `).join('');
  el('colorsReadout').innerHTML = colorsHtml || '<p class="kit-empty-note">No colors set yet in Brand Identity Vault.</p>';

  // Typography & Voice
  const typographyLines = [];
  if (kit.fontPrimary) typographyLines.push(`<div class="kit-readout-line"><strong>Primary Font:</strong> ${escapeHtml(kit.fontPrimary)}</div>`);
  if (kit.fontSecondary) typographyLines.push(`<div class="kit-readout-line"><strong>Secondary Font:</strong> ${escapeHtml(kit.fontSecondary)}</div>`);
  if (kit.toneOfVoice) typographyLines.push(`<div class="kit-readout-line"><strong>Tone of Voice:</strong> ${escapeHtml(kit.toneOfVoice)}</div>`);
  el('typographyReadout').innerHTML = typographyLines.join('') || '<p class="kit-empty-note">No typography or voice notes set yet in Brand Identity Vault.</p>';

  // Logo
  if (kit.logoUrl) {
    el('logoReadout').innerHTML = `<a href="${escapeHtml(kit.logoUrl)}" target="_blank" rel="noopener" class="btn-secondary" style="text-decoration:none;">Open Logo / Brand Folder</a>`;
  } else {
    el('logoReadout').innerHTML = '<p class="kit-empty-note">No logo link set yet in Brand Identity Vault.</p>';
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

// Jumps the parent Hub over to Brand Identity Vault - same mechanism the
// dashboard's own "Go to Brand Vault" quick-link button uses (see
// enableDashboardQuickLinks' [data-go] handler in the root app.js), just
// triggered from inside this iframe instead of from the top-level page.
function goToBrandVault() {
  if (!isEmbedded) return;
  try {
    const navBtn = window.parent.document.querySelector('.nav-item-btn[data-tab="tab-brandvault"]');
    if (navBtn) navBtn.click();
  } catch (e) { /* CORS - nothing we can do from in here */ }
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  autoSelectActiveClient();
  renderState();
  el('clientSelect').addEventListener('change', renderState);
  el('editInVaultBtn').addEventListener('click', goToBrandVault);

  // The parent Hub loads its client database asynchronously (instant
  // localStorage boot, then a Firestore sync on top of that). If this
  // module's iframe finishes loading before that data is ready,
  // populateClientSelect()/renderState() above run against an empty
  // client list and - since nothing else ever re-triggers them - the
  // dropdown stays empty forever, even after the real data arrives moments
  // later. Poll briefly and re-render once real client data shows up.
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
