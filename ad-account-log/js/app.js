/* ============================================================
   CLIENT AD ACCOUNT LOG — APP LOGIC
   (agency-wide: not tied to a single client, stores its own list
   at agency/adAccountLog rather than living inside clientsDb).
   Replaces the copy-paste "Client Ad Account Log Template" SOP
   doc with a real structured tracker. One entry per client, each
   holding a list of ad platforms (Meta, Google, TikTok, LinkedIn,
   or Other) since most clients run more than one.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const SANDBOX_NAME = "Quick Sandbox (One-Offs)";

let entries = [];
let editingId = null;
let draftPlatforms = [];
let docVersion = 0; // optimistic-concurrency guard, see persist() below

const PLATFORM_OPTIONS = ['Meta', 'Google', 'TikTok', 'LinkedIn', 'Other'];
const STATUS_OPTIONS = ['Active', 'Restricted', 'Flagged', 'Disabled', 'Pending'];

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "adAccountLog");
}

async function loadEntries() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      entries = (data && data.list) || [];
      docVersion = (data && data.version) || 0;
      return;
    } catch (e) {
      console.error("Couldn't load ad account log from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load the ad account log: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('ad-account-log-list');
    entries = saved ? JSON.parse(saved) : [];
  } catch (e) { entries = []; }
}

// Optimistic-concurrency guard: same reasoning as Access & Login Log -
// this saves by overwriting the whole doc, so re-check the version
// before writing and refuse to clobber a newer save made elsewhere.
async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: entries, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save ad account log:", result.error);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', result.reason === 'conflict'
          ? "Someone else updated this log while you had it open. Reload the page to see their changes, then redo your edit."
          : "Couldn't save — your change may be lost: " + result.error.message);
      }
      return false;
    }
    docVersion = result.version;
    return true;
  }
  try { localStorage.setItem('ad-account-log-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid(prefix) { return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function getClients() {
  if (isEmbedded && typeof window.parent.getAllClients === 'function') {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  return {};
}

function populateClientDatalist() {
  const list = el('clientOptions');
  const clients = getClients();
  list.innerHTML = Object.keys(clients).filter(name => name !== SANDBOX_NAME).sort().map(name => `<option value="${name}">`).join('');
}

function populatePlatformSelect() {
  el('platformSelect').innerHTML = PLATFORM_OPTIONS.map(p => `<option value="${p}">${p}</option>`).join('');
  el('platformStatusSelect').innerHTML = STATUS_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join('');
}

// Ad Account Setup (the per-client, one-time technical-setup checklist)
// already captures each platform's real Account ID and spend limit as
// part of walking through Business Manager/Ads Manager configuration -
// this used to get typed a second time here with no connection to that,
// so the two could quietly disagree if either one changed later. Maps
// this tool's platform names to the field keys Ad Account Setup stores
// them under (client.adAccountSetup.<schemaKey>.<field> - see that
// tool's PLATFORM_SCHEMAS for the source of these key names).
const AD_SETUP_FIELD_MAP = {
  Meta: { schemaKey: 'meta', idField: 'adAccountId', budgetField: 'monthlySpendLimit' },
  Google: { schemaKey: 'google', idField: 'googleAdsAccountId', budgetField: 'monthlyBudget' },
  TikTok: { schemaKey: 'tiktok', idField: 'adAccountId', budgetField: 'monthlySpendLimit' },
  LinkedIn: { schemaKey: 'linkedin', idField: 'accountId', budgetField: 'monthlyBudget' }
};

// Autofill only - never overwrites something already typed, and never
// runs for "Other" (no matching Ad Account Setup schema). Fires when
// either the client or the platform changes, since both are needed to
// know which client.adAccountSetup.<platform> object to read.
function autofillFromAdAccountSetup() {
  const clientName = el('clientName').value.trim();
  const platform = el('platformSelect').value;
  const map = AD_SETUP_FIELD_MAP[platform];
  if (!clientName || !map) return;

  const client = getClients()[clientName];
  const setup = client && client.adAccountSetup && client.adAccountSetup[map.schemaKey];
  if (!setup) return;

  const idInput = el('platformAccountId');
  const spendInput = el('platformSpendLimit');
  if (idInput && !idInput.value.trim() && setup[map.idField]) {
    idInput.value = setup[map.idField];
  }
  if (spendInput && !spendInput.value.trim() && setup[map.budgetField]) {
    spendInput.value = setup[map.budgetField];
  }
}

function addDraftPlatform() {
  const platform = el('platformSelect').value;
  const accountName = el('platformAccountName').value.trim();
  if (!accountName) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Enter an account name for this platform first.');
    return;
  }
  draftPlatforms.push({
    id: uid('plat'),
    platform,
    accountName,
    accountId: el('platformAccountId').value.trim(),
    accessLevel: el('platformAccessLevel').value.trim(),
    ownedBy: el('platformOwnedBy').value,
    billingMethod: el('platformBillingMethod').value.trim(),
    spendLimit: el('platformSpendLimit').value.trim(),
    status: el('platformStatusSelect').value,
    notes: el('platformNotes').value.trim()
  });
  ['platformAccountName', 'platformAccountId', 'platformAccessLevel', 'platformBillingMethod', 'platformSpendLimit', 'platformNotes'].forEach(id => el(id).value = '');
  renderDraftPlatforms();
}

function removeDraftPlatform(id) {
  draftPlatforms = draftPlatforms.filter(p => p.id !== id);
  renderDraftPlatforms();
}

function renderDraftPlatforms() {
  const container = el('draftPlatformsList');
  if (draftPlatforms.length === 0) {
    container.innerHTML = '<p class="empty-state-inline">No platforms added to this entry yet.</p>';
    return;
  }
  container.innerHTML = draftPlatforms.map(p => `
    <div class="platform-chip">
      <div>
        <strong>${p.platform}</strong> — ${p.accountName} ${p.accountId ? '(' + p.accountId + ')' : ''}
        <span class="section-tag status-${p.status.toLowerCase()}">${p.status}</span>
        <span class="section-tag ${(p.ownedBy || 'Client') === 'Revital Productions' ? 'status-flagged' : 'status-active'}">${p.ownedBy || 'Client'}</span>
      </div>
      <button class="remove-platform-btn" data-id="${p.id}">Remove</button>
    </div>
  `).join('');

  document.querySelectorAll('.remove-platform-btn').forEach(btn => {
    btn.addEventListener('click', () => removeDraftPlatform(btn.getAttribute('data-id')));
  });
}

const TOP_FIELDS = ['clientName', 'primaryAdContact', 'contactEmail', 'totalMonthlyBudget', 'overallNotes'];

function resetForm() {
  editingId = null;
  draftPlatforms = [];
  TOP_FIELDS.forEach(id => { el(id).value = ''; });
  ['platformAccountName', 'platformAccountId', 'platformAccessLevel', 'platformBillingMethod', 'platformSpendLimit', 'platformNotes'].forEach(id => el(id).value = '');
  renderDraftPlatforms();
  el('saveEntryBtn').textContent = 'Save Client Entry';
}

function saveEntry() {
  const clientName = el('clientName').value.trim();
  if (!clientName) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Client name is required.');
    return;
  }

  const entry = { id: editingId || uid('adacct') };
  TOP_FIELDS.forEach(id => { entry[id] = el(id).value.trim(); });
  entry.platforms = draftPlatforms;

  if (editingId) {
    const idx = entries.findIndex(e => e.id === editingId);
    if (idx >= 0) entries[idx] = entry;
  } else {
    entries.unshift(entry);
  }

  persist().then(ok => {
    if (!ok) return;
    resetForm();
    populateClientDatalist();
    renderTable();
    if (window.parent.showBanner) window.parent.showBanner('success', `Saved ad account entry for ${clientName}.`);
  });
}

function startEdit(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  TOP_FIELDS.forEach(fieldId => { el(fieldId).value = entry[fieldId] || ''; });
  draftPlatforms = (entry.platforms || []).map(p => ({ ...p }));
  renderDraftPlatforms();
  el('saveEntryBtn').textContent = 'Update Client Entry';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Remove the ad account log entry for ${entry.clientName}?`)) return;
  entries = entries.filter(e => e.id !== id);
  persist().then(ok => {
    if (!ok) return;
    if (editingId === id) resetForm();
    renderTable();
  });
}

function renderTable() {
  const filterClient = el('filterClientInput').value.trim().toLowerCase();
  const rows = entries.filter(e => !filterClient || e.clientName.toLowerCase().includes(filterClient));

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const platforms = entry.platforms || [];
    const platformNames = platforms.length ? platforms.map(p => p.platform).join(', ') : '--';
    const hasFlag = platforms.some(p => p.status === 'Restricted' || p.status === 'Flagged' || p.status === 'Disabled');
    const ownerSet = new Set(platforms.map(p => p.ownedBy || 'Client'));
    const ownershipLabel = ownerSet.size === 0 ? '--' : ownerSet.size > 1 ? 'Mixed' : [...ownerSet][0];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="client-cell">${entry.clientName}</td>
      <td>${entry.totalMonthlyBudget ? '$' + entry.totalMonthlyBudget : '--'}</td>
      <td>${platformNames}</td>
      <td>${platforms.length}</td>
      <td><span class="section-tag ${ownershipLabel === 'Revital Productions' || ownershipLabel === 'Mixed' ? 'status-flagged' : 'status-active'}">${ownershipLabel}</span></td>
      <td>${hasFlag ? '<span class="section-tag status-restricted">Needs attention</span>' : '<span class="section-tag status-active">OK</span>'}</td>
      <td>
        <div class="row-actions">
          <button class="edit-btn" data-id="${entry.id}">Edit</button>
          <button class="remove-btn" data-id="${entry.id}">Remove</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => startEdit(btn.getAttribute('data-id'))));
  document.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => removeEntry(btn.getAttribute('data-id'))));
}

document.addEventListener('DOMContentLoaded', async () => {
  populateClientDatalist();
  populatePlatformSelect();
  resetForm();
  await loadEntries();
  renderTable();

  el('addPlatformBtn').addEventListener('click', addDraftPlatform);
  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('filterClientInput').addEventListener('input', renderTable);
  el('clientName').addEventListener('change', autofillFromAdAccountSetup);
  el('platformSelect').addEventListener('change', autofillFromAdAccountSetup);

  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    if (Object.keys(getClients()).length > 0) {
      populateClientDatalist();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
