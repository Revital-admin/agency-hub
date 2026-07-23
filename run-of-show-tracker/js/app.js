/* ============================================================
   RUN OF SHOW TRACKER — APP LOGIC
   (agency-wide: not tied to a single client's data blob, stores its
   own list at agency/runOfShow, same pattern as Release Forms /
   Raw Footage / Call Sheet Builder.)

   Deliberately lightweight: this does NOT build a run of show from
   scratch. In most event work the client or their planner already
   owns the schedule. This just gives you a place to (a) paste in
   whatever they handed you, and (b) layer Revital's own AV technical
   cues on top of it, per event.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

let entries = [];
let editingId = null;
let expandedId = null;
let docVersion = 0; // optimistic-concurrency guard, see persist() below

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "runOfShow");
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
      console.error("Couldn't load run of show entries from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load run of show entries: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('run-of-show-tracker-list');
    entries = saved ? JSON.parse(saved) : [];
  } catch (e) { entries = []; }
}

async function persist() {
  if (isEmbedded && window.parent.firebaseSetDocFromJSON && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const freshSnap = await window.parent.firebaseGetDoc(ref);
      const freshData = freshSnap && freshSnap.exists ? freshSnap.data() : null;
      const freshVersion = (freshData && freshData.version) || 0;

      if (freshVersion !== docVersion) {
        if (window.parent.showBanner) {
          window.parent.showBanner('error', "Someone else updated this list while you had it open. Reload the page to see their changes, then redo your edit.");
        }
        return false;
      }

      docVersion = freshVersion + 1;
      await window.parent.firebaseSetDocFromJSON(ref, JSON.stringify({ list: entries, version: docVersion }));
      return true;
    } catch (e) {
      console.error("Couldn't save run of show entry:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't save — your change may be lost: " + e.message);
      return false;
    }
  }
  try { localStorage.setItem('run-of-show-tracker-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'ros-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function getClients() {
  if (isEmbedded && typeof window.parent.getAllClients === 'function') {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  return {};
}

function populateClientDatalist() {
  const list = el('clientOptions');
  const clients = getClients();
  list.innerHTML = Object.keys(clients).sort().map(name => `<option value="${name}">`).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

const FORM_FIELDS = ['clientName', 'eventTitle', 'eventDate', 'venueName', 'status', 'sourceLink', 'clientRunOfShow', 'avCues', 'notes'];

function resetForm() {
  editingId = null;
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    if (field.tagName === 'SELECT') field.value = field.options[0].value;
    else field.value = '';
  });
  el('saveEntryBtn').textContent = 'Log Event';
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => { entry[id] = el(id).value.trim(); });
  return entry;
}

function saveEntry() {
  const clientName = el('clientName').value.trim();
  const eventTitle = el('eventTitle').value.trim();
  if (!clientName || !eventTitle) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Client name and event title are required.');
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
    if (window.parent.showBanner) window.parent.showBanner('success', `Logged ${eventTitle} — ${clientName}.`);
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
  if (!confirm(`Remove the run of show entry for ${entry.eventTitle}?`)) return;
  entries = entries.filter(e => e.id !== id);
  if (expandedId === id) expandedId = null;
  persist().then(ok => {
    if (!ok) return;
    if (editingId === id) resetForm();
    renderTable();
  });
}

function toggleExpand(id) {
  expandedId = expandedId === id ? null : id;
  renderTable();
}

function renderSummary() {
  const confirmed = entries.filter(e => e.status === 'Confirmed');
  const draft = entries.filter(e => e.status === 'Draft');
  el('summaryTotal').textContent = entries.length;
  el('summaryConfirmed').textContent = confirmed.length;
  el('summaryDraft').textContent = draft.length;
}

function renderTable() {
  renderSummary();

  const filterClient = el('filterClientInput').value.trim().toLowerCase();
  const rows = entries.filter(e => !filterClient || e.clientName.toLowerCase().includes(filterClient));

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const statusClass = 'status-' + (entry.status || 'Draft').toLowerCase();
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="client-cell">${escapeHtml(entry.clientName)}</td>
      <td>${escapeHtml(entry.eventTitle) || '--'}</td>
      <td class="date-cell">${escapeHtml(entry.eventDate) || '--'}</td>
      <td>${escapeHtml(entry.venueName) || '--'}</td>
      <td><span class="section-tag ${statusClass}">${escapeHtml(entry.status) || 'Draft'}</span></td>
      <td>
        <div class="row-actions">
          <button class="view-btn" data-id="${entry.id}">${expandedId === entry.id ? 'Hide' : 'View'}</button>
          <button class="edit-btn" data-id="${entry.id}">Edit</button>
          <button class="remove-btn" data-id="${entry.id}">Remove</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);

    if (expandedId === entry.id) {
      const detailTr = document.createElement('tr');
      detailTr.className = 'detail-row';
      const linkHtml = entry.sourceLink ? `<p style="margin:8px 0 0;"><a href="${escapeHtml(entry.sourceLink)}" target="_blank" rel="noopener">Original doc link</a></p>` : '';
      detailTr.innerHTML = `
        <td colspan="6">
          <div class="detail-row-inner">
            <div class="detail-panel">
              <h4>Client Run of Show</h4>
              ${entry.clientRunOfShow ? `<pre>${escapeHtml(entry.clientRunOfShow)}</pre>` : `<p class="empty-hint">Nothing pasted in yet.</p>`}
              ${linkHtml}
            </div>
            <div class="detail-panel">
              <h4>AV Technical Cues</h4>
              ${entry.avCues ? `<pre>${escapeHtml(entry.avCues)}</pre>` : `<p class="empty-hint">No AV cues added yet.</p>`}
            </div>
          </div>
        </td>
      `;
      tbody.appendChild(detailTr);
    }
  });

  document.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', () => toggleExpand(btn.getAttribute('data-id'))));
  document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => startEdit(btn.getAttribute('data-id'))));
  document.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => removeEntry(btn.getAttribute('data-id'))));
}

document.addEventListener('DOMContentLoaded', async () => {
  populateClientDatalist();
  resetForm();
  await loadEntries();
  renderTable();

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
