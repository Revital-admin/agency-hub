/* ============================================================
   SERVICE PRICING ADMIN — APP LOGIC
   Agency-wide default-price editor for the Proposal Calculator's
   ~85 services. Reads the service list from the shared
   SERVICE_CATALOG (proposal-calculator/js/service-catalog.js) and
   layers admin overrides on top, stored at agency/servicePricing.
   The calculator reads the same doc at runtime and prefers an
   override's price/feeType over its own HTML data-price/data-fee
   defaults whenever one exists.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

let docVersion = 0; // optimistic-concurrency guard, see persist() below
let savedOverrides = {};   // what's actually persisted right now: { "Service Name": { price, feeType } }
let workingOverrides = {}; // live in-memory edits, same shape, may differ from savedOverrides until Save is clicked

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "servicePricing");
}

function showBanner(type, message) {
  const banner = el('statusBanner');
  if (!banner) return;
  banner.className = 'status-banner ' + type;
  banner.textContent = message;
  banner.style.display = 'block';
  if (type === 'success') {
    setTimeout(() => { banner.style.display = 'none'; }, 4000);
  }
}

async function loadOverrides() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      savedOverrides = (data && data.prices) || {};
      docVersion = (data && data.version) || 0;
      workingOverrides = JSON.parse(JSON.stringify(savedOverrides));
      return;
    } catch (e) {
      console.error("Couldn't load service pricing overrides:", e);
      showBanner('error', "Couldn't load saved pricing — showing catalog defaults only: " + e.message);
      savedOverrides = {};
      workingOverrides = {};
      return;
    }
  }
  try {
    const raw = localStorage.getItem('service-pricing-admin-overrides');
    savedOverrides = raw ? JSON.parse(raw) : {};
  } catch (e) { savedOverrides = {}; }
  workingOverrides = JSON.parse(JSON.stringify(savedOverrides));
}

// Optimistic-concurrency guard, same pattern used across the other
// agency-wide standalone tools this session: re-check the doc's version
// right before writing so two admins editing pricing at once can't
// silently clobber each other's changes.
async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ prices: workingOverrides, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save service pricing:", result.error);
      showBanner('error', result.reason === 'conflict'
        ? "Someone else updated pricing while you had this open. Reload the page to see their changes, then redo your edit."
        : "Couldn't save — your changes may be lost: " + result.error.message);
      return false;
    }
    docVersion = result.version;
    savedOverrides = JSON.parse(JSON.stringify(workingOverrides));
    return true;
  }
  try {
    localStorage.setItem('service-pricing-admin-overrides', JSON.stringify(workingOverrides));
    savedOverrides = JSON.parse(JSON.stringify(workingOverrides));
  } catch (e) {}
  return true;
}

function flatCatalog() {
  const rows = [];
  (typeof SERVICE_CATALOG !== 'undefined' ? SERVICE_CATALOG : []).forEach(cat => {
    cat.services.forEach(svc => rows.push({ category: cat.category, ...svc }));
  });
  return rows;
}

function currentValueFor(svc) {
  const override = workingOverrides[svc.name];
  return {
    price: override ? override.price : svc.defaultPrice,
    feeType: override ? override.feeType : svc.defaultFeeType,
    cost: override && override.cost !== undefined ? override.cost : (svc.defaultCost || 0)
  };
}

function isDirty(svc) {
  const current = currentValueFor(svc);
  return current.price !== svc.defaultPrice || current.feeType !== svc.defaultFeeType || current.cost !== (svc.defaultCost || 0);
}

// Margin is only meaningful once a real cost has been entered - services
// still sitting at the $0 default cost show "—" rather than a misleading
// 100% margin.
function marginDisplayFor(current) {
  if (!current.cost || current.cost <= 0) return '—';
  if (!current.price || current.price <= 0) return '—';
  const marginPct = Math.round(((current.price - current.cost) / current.price) * 100);
  return marginPct + '%';
}

function hasUnsavedChanges() {
  return JSON.stringify(workingOverrides) !== JSON.stringify(savedOverrides);
}

function updateUnsavedBadge() {
  const badge = el('unsavedBadge');
  if (badge) badge.style.display = hasUnsavedChanges() ? 'inline-block' : 'none';
}

function setWorkingValue(name, price, feeType, cost, svc) {
  if (price === svc.defaultPrice && feeType === svc.defaultFeeType && cost === (svc.defaultCost || 0)) {
    delete workingOverrides[name];
  } else {
    workingOverrides[name] = { price, feeType, cost };
  }
  updateUnsavedBadge();
}

function render() {
  const container = el('catalogContainer');
  if (!container) return;
  const search = (el('searchInput').value || '').trim().toLowerCase();
  const onlyEdited = el('showOverriddenOnly').checked;

  const catalog = typeof SERVICE_CATALOG !== 'undefined' ? SERVICE_CATALOG : [];
  let totalShown = 0;
  let html = '';

  catalog.forEach(cat => {
    const rows = cat.services.filter(svc => {
      if (search && !svc.name.toLowerCase().includes(search)) return false;
      if (onlyEdited && !isDirty(svc)) return false;
      return true;
    });
    if (rows.length === 0) return;
    totalShown += rows.length;

    html += `<details class="service-category" open>
      <summary><h3>${cat.category} <span class="pricing-category-meta">(${rows.length})</span></h3></summary>
      <table class="pricing-row-table">
        <thead>
          <tr><th>Service</th><th>Price ($)</th><th>Type</th><th>Cost ($)</th><th>Margin</th><th></th></tr>
        </thead>
        <tbody>
          ${rows.map(svc => {
            const current = currentValueFor(svc);
            const dirty = isDirty(svc);
            return `<tr>
              <td class="pricing-service-name${dirty ? ' is-overridden' : ''}">${svc.name}</td>
              <td><input type="number" class="num-input pricing-price-input" min="0" step="50" value="${current.price}" data-name="${encodeURIComponent(svc.name)}" data-field="price"></td>
              <td>
                <select class="select-input pricing-fee-select" data-name="${encodeURIComponent(svc.name)}" data-field="feeType">
                  <option value="monthly" ${current.feeType === 'monthly' ? 'selected' : ''}>Monthly</option>
                  <option value="setup" ${current.feeType === 'setup' ? 'selected' : ''}>One-Time</option>
                </select>
              </td>
              <td><input type="number" class="num-input pricing-cost-input" min="0" step="10" value="${current.cost}" data-name="${encodeURIComponent(svc.name)}" data-field="cost" title="What this service actually costs you to deliver (contractor pay, ad-platform fees, software allocation, etc.)"></td>
              <td class="pricing-margin-cell">${marginDisplayFor(current)}</td>
              <td><button class="pricing-reset-btn" data-name="${encodeURIComponent(svc.name)}" ${dirty ? '' : 'disabled'}>Reset</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </details>`;
  });

  if (totalShown === 0) {
    html = '<p class="pricing-no-results">No services match.</p>';
  }

  container.innerHTML = html;
  el('serviceCount').textContent = `${totalShown} service${totalShown === 1 ? '' : 's'} shown`;
  wireRowEvents();
}

function wireRowEvents() {
  const catalog = flatCatalog();
  const byName = {};
  catalog.forEach(svc => { byName[svc.name] = svc; });

  document.querySelectorAll('.pricing-price-input').forEach(input => {
    input.addEventListener('change', () => {
      const name = decodeURIComponent(input.getAttribute('data-name'));
      const svc = byName[name];
      if (!svc) return;
      const price = Math.max(0, parseInt(input.value) || 0);
      input.value = price;
      const feeSelect = document.querySelector(`.pricing-fee-select[data-name="${input.getAttribute('data-name')}"]`);
      const costInput = document.querySelector(`.pricing-cost-input[data-name="${input.getAttribute('data-name')}"]`);
      const feeType = feeSelect ? feeSelect.value : svc.defaultFeeType;
      const cost = costInput ? (Math.max(0, parseInt(costInput.value) || 0)) : (svc.defaultCost || 0);
      setWorkingValue(name, price, feeType, cost, svc);
      render();
    });
  });

  document.querySelectorAll('.pricing-fee-select').forEach(select => {
    select.addEventListener('change', () => {
      const name = decodeURIComponent(select.getAttribute('data-name'));
      const svc = byName[name];
      if (!svc) return;
      const priceInput = document.querySelector(`.pricing-price-input[data-name="${select.getAttribute('data-name')}"]`);
      const costInput = document.querySelector(`.pricing-cost-input[data-name="${select.getAttribute('data-name')}"]`);
      const price = priceInput ? (Math.max(0, parseInt(priceInput.value) || 0)) : svc.defaultPrice;
      const cost = costInput ? (Math.max(0, parseInt(costInput.value) || 0)) : (svc.defaultCost || 0);
      setWorkingValue(name, price, select.value, cost, svc);
      render();
    });
  });

  document.querySelectorAll('.pricing-cost-input').forEach(input => {
    input.addEventListener('change', () => {
      const name = decodeURIComponent(input.getAttribute('data-name'));
      const svc = byName[name];
      if (!svc) return;
      const cost = Math.max(0, parseInt(input.value) || 0);
      input.value = cost;
      const priceInput = document.querySelector(`.pricing-price-input[data-name="${input.getAttribute('data-name')}"]`);
      const feeSelect = document.querySelector(`.pricing-fee-select[data-name="${input.getAttribute('data-name')}"]`);
      const price = priceInput ? (Math.max(0, parseInt(priceInput.value) || 0)) : svc.defaultPrice;
      const feeType = feeSelect ? feeSelect.value : svc.defaultFeeType;
      setWorkingValue(name, price, feeType, cost, svc);
      render();
    });
  });

  document.querySelectorAll('.pricing-reset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = decodeURIComponent(btn.getAttribute('data-name'));
      delete workingOverrides[name];
      updateUnsavedBadge();
      render();
    });
  });
}

// Same admin/leadership-only gate as Team Access Manager: only accounts
// with no entry in agency/teamAccess (full, unrestricted access) may open
// this tool. The footer button is already hidden for restricted
// teammates, but that's client-side-only - this check stops someone from
// seeing/editing pricing just by landing on the tab directly.
function initAccessGate() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot) {
    return; // not embedded - nothing to gate, matches other standalone tools
  }
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamAccess");
  window.parent.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap && docSnap.exists ? docSnap.data() : null;
    const users = (data && data.users) ? data.users : {};
    const currentEmail = (window.parent.currentAdminEmail || "").toLowerCase();
    const isRestricted = currentEmail && Object.prototype.hasOwnProperty.call(users, currentEmail);

    el('pricingAdminContent').style.display = isRestricted ? 'none' : '';
    el('notAuthorizedState').style.display = isRestricted ? '' : 'none';
  }, (err) => {
    console.error("Access gate listener error:", err);
  });
}

/* ============================================================
   PACKAGE PRESETS — admin CRUD
   Stored at agency/packagePresets, same optimistic-concurrency
   pattern as the pricing overrides above but a separate doc and a
   separate (immediate, not batched) save - each add/edit/delete
   persists right away rather than waiting for "Save All Changes",
   since preset edits are discrete actions rather than rapid-fire
   numeric field changes like the price table above.
   The Proposal Calculator reads this same doc and falls back to its
   own built-in defaults (Basic Social, Growth Ads, Full-Stack, and
   3 website/branding packages) if this doc doesn't exist yet - so
   nothing breaks for anyone who hasn't opened this panel.
   ============================================================ */

let presetsDocVersion = 0;
let presetsList = [];
let editingPresetId = null;
let draftSelectedServices = [];

function getPresetsDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "packagePresets");
}

async function loadPresetsData() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getPresetsDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      presetsList = (data && data.presets) || [];
      presetsDocVersion = (data && data.version) || 0;
      return;
    } catch (e) {
      console.error("Couldn't load package presets:", e);
      showBanner('error', "Couldn't load package presets: " + e.message);
      presetsList = [];
      return;
    }
  }
  try {
    const raw = localStorage.getItem('service-pricing-admin-presets');
    presetsList = raw ? JSON.parse(raw) : [];
  } catch (e) { presetsList = []; }
}

async function persistPresets() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getPresetsDocRef(),
      currentVersion: presetsDocVersion,
      buildPayload: (v) => ({ presets: presetsList, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save package presets:", result.error);
      showBanner('error', result.reason === 'conflict'
        ? "Someone else updated presets while you had this open. Reload the page to see their changes, then redo your edit."
        : "Couldn't save preset — your change may be lost: " + result.error.message);
      return false;
    }
    presetsDocVersion = result.version;
    return true;
  }
  try { localStorage.setItem('service-pricing-admin-presets', JSON.stringify(presetsList)); } catch (e) {}
  return true;
}

function presetUid() { return 'preset-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function renderPresetsList() {
  const container = el('presetsListContainer');
  if (!container) return;
  if (presetsList.length === 0) {
    container.innerHTML = '<p class="pricing-no-results">No custom presets yet — the Proposal Calculator is showing its built-in defaults (Basic Social, Growth Ads, Full-Stack, and 3 website/branding packages). Add one below to start customizing.</p>';
    return;
  }
  container.innerHTML = presetsList.map(p => {
    const summary = p.type === 'services'
      ? `${(p.services || []).length} service${(p.services || []).length === 1 ? '' : 's'}`
      : `$${(p.price || 0).toLocaleString()} ${p.feeType === 'monthly' ? '/mo' : 'one-time'}`;
    return `<div class="preset-card">
      <div class="preset-card-main">
        <span class="preset-card-name">${p.name}</span>
        <span class="preset-card-type">${p.type === 'services' ? 'Service Bundle' : 'Flat Package'}</span>
        <span class="preset-card-summary">${summary}</span>
      </div>
      <div class="preset-card-actions">
        <button class="preset-edit-btn" data-id="${p.id}">Edit</button>
        <button class="preset-delete-btn" data-id="${p.id}">Delete</button>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.preset-edit-btn').forEach(btn => btn.addEventListener('click', () => startEditPreset(btn.getAttribute('data-id'))));
  container.querySelectorAll('.preset-delete-btn').forEach(btn => btn.addEventListener('click', () => deletePreset(btn.getAttribute('data-id'))));
}

function renderServiceChecklist() {
  const container = el('presetServiceChecklist');
  if (!container) return;
  const search = (el('presetServiceSearch').value || '').trim().toLowerCase();
  const rows = flatCatalog().filter(svc => !search || svc.name.toLowerCase().includes(search));

  container.innerHTML = rows.map(svc => `
    <label class="cb-label preset-service-row">
      <input type="checkbox" class="preset-service-cb" value="${encodeURIComponent(svc.name)}" ${draftSelectedServices.includes(svc.name) ? 'checked' : ''}>
      ${svc.name}
    </label>
  `).join('');

  container.querySelectorAll('.preset-service-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const name = decodeURIComponent(cb.value);
      if (cb.checked) {
        if (!draftSelectedServices.includes(name)) draftSelectedServices.push(name);
      } else {
        draftSelectedServices = draftSelectedServices.filter(n => n !== name);
      }
      updateSelectedCount();
    });
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  const countEl = el('presetSelectedCount');
  if (countEl) countEl.textContent = `${draftSelectedServices.length} selected`;
}

function togglePresetTypeFields() {
  const type = el('presetTypeInput').value;
  el('presetServicesFields').style.display = type === 'services' ? '' : 'none';
  el('presetFlatFields').style.display = type === 'flat' ? '' : 'none';
}

function resetPresetForm() {
  editingPresetId = null;
  draftSelectedServices = [];
  el('presetFormTitle').textContent = 'Add New Preset';
  el('presetNameInput').value = '';
  el('presetTypeInput').value = 'services';
  el('presetItemNameInput').value = '';
  el('presetPriceInput').value = '';
  el('presetFeeTypeInput').value = 'setup';
  el('presetServiceSearch').value = '';
  el('addPresetBtn').textContent = 'Add Preset';
  el('cancelPresetEditBtn').style.display = 'none';
  togglePresetTypeFields();
  renderServiceChecklist();
}

function startEditPreset(id) {
  const preset = presetsList.find(p => p.id === id);
  if (!preset) return;
  editingPresetId = id;
  el('presetFormTitle').textContent = `Editing "${preset.name}"`;
  el('presetNameInput').value = preset.name;
  el('presetTypeInput').value = preset.type;
  togglePresetTypeFields();
  if (preset.type === 'services') {
    draftSelectedServices = [...(preset.services || [])];
  } else {
    draftSelectedServices = [];
    el('presetItemNameInput').value = preset.itemName || '';
    el('presetPriceInput').value = preset.price || '';
    el('presetFeeTypeInput').value = preset.feeType || 'setup';
  }
  el('addPresetBtn').textContent = 'Update Preset';
  el('cancelPresetEditBtn').style.display = 'inline';
  renderServiceChecklist();
  el('presetFormTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function deletePreset(id) {
  const preset = presetsList.find(p => p.id === id);
  if (!preset) return;
  if (!confirm(`Delete the "${preset.name}" preset? This can't be undone.`)) return;
  presetsList = presetsList.filter(p => p.id !== id);
  persistPresets().then(ok => {
    if (!ok) return;
    if (editingPresetId === id) resetPresetForm();
    renderPresetsList();
    showBanner('success', `Deleted "${preset.name}".`);
  });
}

function savePresetFromForm() {
  const name = el('presetNameInput').value.trim();
  const type = el('presetTypeInput').value;
  if (!name) {
    showBanner('error', 'Give the preset a name first.');
    return;
  }

  let preset;
  if (type === 'services') {
    if (draftSelectedServices.length === 0) {
      showBanner('error', 'Select at least one service for this bundle.');
      return;
    }
    preset = { id: editingPresetId || presetUid(), name, type: 'services', services: [...draftSelectedServices] };
  } else {
    const itemName = el('presetItemNameInput').value.trim() || name;
    const price = Math.max(0, parseInt(el('presetPriceInput').value) || 0);
    const feeType = el('presetFeeTypeInput').value;
    if (price <= 0) {
      showBanner('error', 'Enter a price greater than $0.');
      return;
    }
    preset = { id: editingPresetId || presetUid(), name, type: 'flat', itemName, price, feeType };
  }

  if (editingPresetId) {
    const idx = presetsList.findIndex(p => p.id === editingPresetId);
    if (idx >= 0) presetsList[idx] = preset; else presetsList.push(preset);
  } else {
    presetsList.push(preset);
  }

  persistPresets().then(ok => {
    if (!ok) return;
    resetPresetForm();
    renderPresetsList();
    showBanner('success', `Saved "${preset.name}".`);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initAccessGate();
  await loadOverrides();
  render();
  updateUnsavedBadge();

  el('searchInput').addEventListener('input', render);
  el('showOverriddenOnly').addEventListener('change', render);

  el('saveAllBtn').addEventListener('click', async () => {
    const ok = await persist();
    if (ok) {
      updateUnsavedBadge();
      showBanner('success', 'Pricing saved. The Proposal Calculator will use these prices for new selections.');
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Package Presets panel
  await loadPresetsData();
  renderPresetsList();
  resetPresetForm();

  el('presetTypeInput').addEventListener('change', togglePresetTypeFields);
  el('presetServiceSearch').addEventListener('input', renderServiceChecklist);
  el('addPresetBtn').addEventListener('click', savePresetFromForm);
  el('cancelPresetEditBtn').addEventListener('click', resetPresetForm);
});
