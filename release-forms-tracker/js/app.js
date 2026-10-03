/* ============================================================
   RELEASE FORMS TRACKER — APP LOGIC
   (agency-wide: not tied to a single client, stores its own list
   at agency/releaseForms rather than living inside clientsDb).
   Logs signed talent/location releases per shoot so nothing gets
   used publicly without documentation on file - a compliance log,
   not a document generator or e-sign tool.

   The load/persist/uid/datalist/form-CRUD plumbing below comes from
   shared/agency-tracker.js (see that file's header comment) instead of
   being hand-written inline here - only what's genuinely specific to
   Release Forms Tracker stays in this file: table/summary rendering and
   this tool's own validation/success-message wording.
   ============================================================ */

const tracker = AgencyTracker.create({
  docName: 'releaseForms',
  localStorageKey: 'release-forms-tracker-list',
  idPrefix: 'rl',
  formFields: ['clientName', 'projectTitle', 'signeeName', 'signeeType', 'releaseType', 'status', 'dateSigned', 'formLocation', 'notes'],
  saveButtonId: 'saveEntryBtn',
  addLabel: 'Log Release',
  updateLabel: 'Update Entry',
});

function el(id) { return document.getElementById(id); }

function saveEntry() {
  tracker.saveEntry({
    validate: () => {
      if (!el('clientName').value.trim() || !el('signeeName').value.trim()) {
        return 'Client name and signee name are required.';
      }
    },
    onSuccess: (entry) => {
      tracker.populateClientDatalist('clientOptions');
      renderTable();
      if (window.parent.showBanner) window.parent.showBanner('success', `Logged release for ${entry.signeeName} — ${entry.clientName}.`);
    },
  });
}

function removeEntry(id) {
  tracker.removeEntry(id, {
    confirmMessage: (entry) => `Remove the release form entry for ${entry.signeeName}?`,
    onSuccess: () => renderTable(),
  });
}

function renderSummary() {
  const pending = tracker.entries.filter(e => e.status === 'Pending');
  const signed = tracker.entries.filter(e => e.status === 'Signed');
  el('summaryPending').textContent = pending.length;
  el('summarySigned').textContent = signed.length;
}

function renderTable() {
  renderSummary();

  const filterClient = el('filterClientInput').value.trim().toLowerCase();
  const showAllStatuses = el('showAllStatusesToggle').checked;
  const rows = tracker.entries
    .filter(e => !filterClient || e.clientName.toLowerCase().includes(filterClient))
    .filter(e => showAllStatuses || e.status === 'Pending');

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const statusClass = 'status-' + (entry.status || 'Pending').toLowerCase();
    const tr = document.createElement('tr');
    tr.className = entry.status === 'Pending' ? 'row-pending' : '';
    tr.innerHTML = `
      <td class="client-cell">${entry.clientName}</td>
      <td>${entry.projectTitle || '--'}</td>
      <td>${entry.signeeName}</td>
      <td>${entry.releaseType || '--'}</td>
      <td class="date-cell">${entry.dateSigned || '--'}</td>
      <td><span class="section-tag ${statusClass}">${entry.status || 'Pending'}</span></td>
      <td>
        <div class="row-actions">
          <button class="edit-btn" data-id="${entry.id}">Edit</button>
          <button class="remove-btn" data-id="${entry.id}">Remove</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => tracker.startEdit(btn.getAttribute('data-id'))));
  document.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => removeEntry(btn.getAttribute('data-id'))));
}

document.addEventListener('DOMContentLoaded', async () => {
  tracker.populateClientDatalist('clientOptions');
  tracker.resetForm();
  await tracker.loadEntries();
  renderTable();

  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('filterClientInput').addEventListener('input', renderTable);
  el('showAllStatusesToggle').addEventListener('change', renderTable);

  tracker.pollForClients('clientOptions');
});
