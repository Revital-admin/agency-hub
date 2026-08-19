/* ============================================================
   CALL SHEET / SHOOT SCHEDULE BUILDER — APP LOGIC
   (agency-wide: not tied to a single client, stores its own list
   at agency/callSheets rather than living inside clientsDb).
   Logs shoot-day logistics. Crew and equipment live in their own
   outside apps (crew scheduling / gear checkout) - the fields here
   are free-text references for the day-of sheet, not a source of
   truth for booking or availability.
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
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "callSheets");
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
      console.error("Couldn't load call sheets from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load call sheets: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('call-sheet-builder-list');
    entries = saved ? JSON.parse(saved) : [];
  } catch (e) { entries = []; }
}

// Optimistic-concurrency guard, same pattern as the other full-overwrite
// trackers: re-check the doc's version right before writing and refuse
// to clobber a newer save made elsewhere in the meantime.
async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: entries, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save call sheet:", result.error);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', result.reason === 'conflict'
          ? "Someone else updated this list while you had it open. Reload the page to see their changes, then redo your edit."
          : "Couldn't save — your change may be lost: " + result.error.message);
      }
      return false;
    }
    docVersion = result.version;
    return true;
  }
  try { localStorage.setItem('call-sheet-builder-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'cs-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

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
  'clientName', 'shootTitle', 'shootDate', 'callTime', 'wrapTime', 'status',
  'locationName', 'locationAddress', 'onSiteContactName', 'onSiteContactPhone',
  'clientAttendees', 'weatherBackupPlan', 'crewAssigned', 'equipmentNeeded', 'shotListNotes'
];

function todayStr() {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStrVal) {
  const from = new Date(fromStr); from.setHours(0, 0, 0, 0);
  const to = new Date(toStrVal); to.setHours(0, 0, 0, 0);
  return Math.round((to - from) / 86400000);
}

function resetForm() {
  editingId = null;
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    if (field.tagName === 'SELECT') field.value = field.options[0].value;
    else field.value = '';
  });
  el('saveEntryBtn').textContent = 'Save Call Sheet';
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => { entry[id] = el(id).value.trim(); });
  return entry;
}

function saveEntry() {
  const clientName = el('clientName').value.trim();
  const shootTitle = el('shootTitle').value.trim();
  const shootDate = el('shootDate').value;
  if (!clientName || !shootTitle || !shootDate) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Client name, shoot title, and shoot date are required.');
    return;
  }

  const entry = gatherForm();
  // Snapshot before mutating: push/index-replace/sort below all mutate `entries`
  // in place, so we need a real copy (not just the reference) to restore from
  // if persist() fails, otherwise the "previous" state would already reflect
  // the unsaved change too.
  const previous = entries.slice();
  if (editingId) {
    const idx = entries.findIndex(e => e.id === editingId);
    if (idx >= 0) entries[idx] = entry;
  } else {
    entries.push(entry);
  }
  entries.sort((a, b) => (a.shootDate || '9999').localeCompare(b.shootDate || '9999'));

  persist().then(ok => {
    if (!ok) {
      entries = previous; // roll back the unsaved add/edit so it doesn't silently stick around in memory
      return;
    }
    resetForm();
    populateClientDatalist();
    renderTable();
    if (window.parent.showBanner) window.parent.showBanner('success', `Saved call sheet for ${clientName} — ${shootTitle}.`);
  });
}

function startEdit(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  FORM_FIELDS.forEach(fieldId => { el(fieldId).value = entry[fieldId] || ''; });
  el('saveEntryBtn').textContent = 'Update Call Sheet';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Remove the call sheet for ${entry.clientName} — ${entry.shootTitle}?`)) return;
  const previous = entries;
  entries = entries.filter(e => e.id !== id);
  persist().then(ok => {
    if (!ok) {
      entries = previous; // roll back the removal on a failed write
      return;
    }
    if (editingId === id) resetForm();
    renderTable();
  });
}

function renderTable() {
  const showCancelled = el('showCancelledToggle').checked;
  const filterClient = el('filterClientInput').value.trim().toLowerCase();

  const rows = entries.filter(e => {
    if (!showCancelled && e.status === 'Cancelled') return false;
    if (filterClient && !e.clientName.toLowerCase().includes(filterClient)) return false;
    return true;
  });

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const daysOut = entry.shootDate ? daysBetween(todayStr(), entry.shootDate) : null;
    const soon = entry.status === 'Confirmed' && daysOut !== null && daysOut >= 0 && daysOut <= 3;
    const statusClass = 'status-' + (entry.status || 'Draft').toLowerCase();

    const tr = document.createElement('tr');
    tr.className = entry.status === 'Cancelled' ? 'row-cancelled' : (soon ? 'row-soon' : '');
    tr.innerHTML = `
      <td class="client-cell">${entry.clientName}</td>
      <td>${entry.shootTitle}</td>
      <td class="date-cell">${entry.shootDate || '--'}</td>
      <td class="date-cell">${entry.callTime || '--'}</td>
      <td>${entry.locationName || '--'}</td>
      <td><span class="section-tag ${statusClass}">${entry.status || 'Draft'}</span></td>
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

// Venue Tech-Spec Library autofill - keyed by venue name so a repeat
// venue's address never has to be re-typed (or drift from what the
// library has on file). Only fills the Address field, and only when
// it's empty - never overwrites something already typed, e.g. a
// one-off/temporary address for a venue that happens to share a name.
let venueLibrary = [];

async function loadVenueLibrary() {
  if (!isEmbedded || !window.parent.getVenueTechSpecs) return;
  try {
    venueLibrary = await window.parent.getVenueTechSpecs();
  } catch (e) {
    venueLibrary = [];
  }
  populateVenueDatalist();
}

function populateVenueDatalist() {
  const list = el('venueOptions');
  if (!list) return;
  list.innerHTML = [...new Set(venueLibrary.map(v => v.venueName).filter(Boolean))]
    .sort()
    .map(name => `<option value="${name.replace(/"/g, '&quot;')}">`)
    .join('');
}

function autofillVenueAddress() {
  const name = el('locationName').value.trim().toLowerCase();
  const addressInput = el('locationAddress');
  if (!name || !addressInput || addressInput.value.trim()) return;
  const match = venueLibrary.find(v => (v.venueName || '').trim().toLowerCase() === name);
  if (match && match.address) addressInput.value = match.address;
}

document.addEventListener('DOMContentLoaded', async () => {
  populateClientDatalist();
  resetForm();
  await loadEntries();
  renderTable();
  loadVenueLibrary();

  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('showCancelledToggle').addEventListener('change', renderTable);
  el('filterClientInput').addEventListener('input', renderTable);
  el('locationName').addEventListener('change', autofillVenueAddress);

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
