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
  if (isEmbedded && window.parent.firebaseSetDoc && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const freshSnap = await window.parent.firebaseGetDoc(ref);
      const freshData = freshSnap && freshSnap.exists ? freshSnap.data() : null;
      const freshVersion = (freshData && freshData.version) || 0;

      if (freshVersion !== docVersion) {
        if (window.parent.showBanner) {
          window.parent.showBanner('error', "Someone else updated this log while you had it open. Reload the page to see their changes, then redo your edit.");
        }
        return false;
      }

      docVersion = freshVersion + 1;
      // A plain object literal built in this iframe's own JS realm gets
      // rejected by Firestore ("a custom Object object") when handed
      // straight to a Firestore call bound to the parent page - pass a
      // JSON string instead so the parent parses it in its own realm.
      await window.parent.firebaseSetDocFromJSON(ref, JSON.stringify({ list: entries, version: docVersion }));
      return true;
    } catch (e) {
      console.error("Couldn't save ad account log:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't save — your change may be lost: " + e.message);
      return false;
    }
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
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="client-cell">${entry.clientName}</td>
      <td>${entry.totalMonthlyBudget ? '$' + entry.totalMonthlyBudget : '--'}</td>
      <td>${platformNames}</td>
      <td>${platforms.length}</td>
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
