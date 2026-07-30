/* ============================================================
   ACCESS & LOGIN LOG — APP LOGIC
   (agency-wide: not tied to a single client, stores its own list
   at agency/accessLoginLog rather than living inside clientsDb).
   Replaces the copy-paste "Access & Login Log Template" SOP doc
   with a real structured tracker. Never stores actual passwords —
   only a reference to where they live in the password manager.
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
let docVersion = 0; // optimistic-concurrency guard, see persist() below

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "accessLoginLog");
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
      console.error("Couldn't load access log from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load the access log: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('access-login-log-list');
    entries = saved ? JSON.parse(saved) : [];
  } catch (e) { entries = []; }
}

// Optimistic-concurrency guard: this list is saved by overwriting the
// whole doc, so if two people had it open at once a plain save could
// silently wipe out whichever one saved first. Before writing, re-check
// the doc's version against what we loaded - if it moved on without us,
// refuse the write (rather than clobber it) and tell the user to reload
// and redo their edit against the latest data.
async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: entries, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save access log:", result.error);
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
  try { localStorage.setItem('access-login-log-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'al-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

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

const FORM_FIELDS = [
  'clientName', 'platformName', 'platformUrl', 'accountType', 'accountId', 'usernameEmail',
  'personType', 'vendorName', 'ndaSigned',
  'passwordLocation', 'twoFAEnabled', 'twoFAMethod', 'twoFADeviceOwner',
  'ourAccessType', 'canPublish', 'canManageBilling', 'accessRestrictions',
  'dateGranted', 'dateRemoved', 'notes'
];

function resetForm() {
  editingId = null;
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    if (field.tagName === 'SELECT') field.value = field.options[0].value;
    else field.value = '';
  });
  el('dateGranted').value = todayStr();
  el('saveEntryBtn').textContent = 'Add Entry';
}

function todayStr() {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => { entry[id] = el(id).value.trim(); });
  return entry;
}

function saveEntry() {
  const clientName = el('clientName').value.trim();
  const platformName = el('platformName').value.trim();
  if (!clientName || !platformName) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Client name and platform name are required.');
    return;
  }

  const entry = gatherForm();
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
    if (window.parent.showBanner) window.parent.showBanner('success', `Saved access log entry for ${clientName} — ${platformName}.`);
  });
}

function startEdit(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  FORM_FIELDS.forEach(fieldId => { el(fieldId).value = entry[fieldId] || ''; });
  el('saveEntryBtn').textContent = 'Update Entry';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Remove the access log entry for ${entry.clientName} — ${entry.platformName}?`)) return;
  entries = entries.filter(e => e.id !== id);
  persist().then(ok => {
    if (!ok) return;
    if (editingId === id) resetForm();
    renderTable();
  });
}

function renderTable() {
  const showRemoved = el('showRemovedToggle').checked;
  const filterClient = el('filterClientInput').value.trim().toLowerCase();

  const rows = entries.filter(e => {
    if (!showRemoved && e.dateRemoved) return false;
    if (filterClient && !e.clientName.toLowerCase().includes(filterClient)) return false;
    return true;
  });

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const tr = document.createElement('tr');
    const status = entry.dateRemoved ? 'Removed' : 'Active';
    tr.className = entry.dateRemoved ? 'row-removed' : '';
    const grantedTo = entry.personType && entry.personType !== 'Staff'
      ? `${entry.personType}${entry.vendorName ? ' — ' + entry.vendorName : ''}`
      : (entry.personType || 'Staff');
    tr.innerHTML = `
      <td class="client-cell">${entry.clientName}</td>
      <td>${grantedTo}</td>
      <td>${entry.platformName}</td>
      <td>${entry.accountType || '--'}</td>
      <td>${entry.ourAccessType || '--'}</td>
      <td>${entry.twoFAEnabled || '--'}</td>
      <td><span class="section-tag ${entry.dateRemoved ? 'status-removed' : 'status-active'}">${status}</span></td>
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
  resetForm();
  await loadEntries();
  renderTable();

  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('showRemovedToggle').addEventListener('change', renderTable);
  el('filterClientInput').addEventListener('input', renderTable);

  // Same iframe-race fix used across the other cross-client tools: the
  // client datalist can be empty if this loads before the parent Hub's
  // clientsDb has synced. Poll briefly and re-populate once real data shows up.
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
