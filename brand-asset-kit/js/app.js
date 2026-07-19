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
  select.innerHTML = '<option value="">Select a client...</option>';
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

function syncColorInputs(pickerId, textId) {
  const picker = el(pickerId);
  const text = el(textId);

  picker.addEventListener('input', () => { text.value = picker.value.toUpperCase(); });
  text.addEventListener('input', () => {
    const val = text.value.trim();
    if (/^#[0-9A-F]{6}$/i.test(val)) {
      picker.value = val;
    }
  });
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
  const kit = clients[clientName].brandKit || {
    primaryColor: '#000000',
    secondaryColor: '#FFFFFF',
    accentColor: '#FF0000',
    fontPrimary: '',
    fontSecondary: '',
    toneOfVoice: '',
    logoUrl: ''
  };

  el('primaryColorPick').value = kit.primaryColor || '#000000';
  el('primaryColorText').value = kit.primaryColor || '#000000';

  el('secondaryColorPick').value = kit.secondaryColor || '#FFFFFF';
  el('secondaryColorText').value = kit.secondaryColor || '#FFFFFF';

  el('accentColorPick').value = kit.accentColor || '#FF0000';
  el('accentColorText').value = kit.accentColor || '#FF0000';

  el('fontPrimary').value = kit.fontPrimary || '';
  el('fontSecondary').value = kit.fontSecondary || '';
  el('toneOfVoice').value = kit.toneOfVoice || '';
  el('logoUrl').value = kit.logoUrl || '';
}

function saveBrandKit() {
  const clientName = el('clientSelect').value;
  if (!clientName) return;

  const clients = getClients();

  clients[clientName].brandKit = {
    primaryColor: el('primaryColorText').value.trim(),
    secondaryColor: el('secondaryColorText').value.trim(),
    accentColor: el('accentColorText').value.trim(),
    fontPrimary: el('fontPrimary').value.trim(),
    fontSecondary: el('fontSecondary').value.trim(),
    toneOfVoice: el('toneOfVoice').value.trim(),
    logoUrl: el('logoUrl').value.trim()
  };

  persist();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', 'Brand Asset Kit saved and synced to Client Portal!');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  el('clientSelect').addEventListener('change', renderState);
  el('saveBrandKitBtn').addEventListener('click', saveBrandKit);

  syncColorInputs('primaryColorPick', 'primaryColorText');
  syncColorInputs('secondaryColorPick', 'secondaryColorText');
  syncColorInputs('accentColorPick', 'accentColorText');

  // The parent Hub loads its client database asynchronously (instant
  // localStorage boot, then a Firestore sync on top of that). If this
  // module's iframe finishes loading before that data is ready,
  // populateClientSelect() above runs against an empty client list and -
  // since nothing else ever re-triggers it - the dropdown stays empty
  // forever, even after the real data arrives moments later. Poll
  // briefly and re-populate once real client data shows up.
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
