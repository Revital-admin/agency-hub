/* ============================================================
   PERMIT TRACKER — APP LOGIC
   (agency-wide: not tied to a single client, stores its own list
   at agency/permitTracker rather than living inside clientsDb).
   Same pattern as Release Forms Tracker and Shot List Builder -
   a flat log of permits across every shoot, filterable by client,
   defaulting to what still needs action (Not Started / Applied /
   Denied) so it doubles as a "what's blocking this shoot" view,
   plus a computed Expiring Soon flag (Approved with an expiration
   date inside the next 30 days) since an expired permit on
   shoot day is the whole point of tracking these at all.

   The load/persist/uid/datalist/form-CRUD plumbing below comes from
   shared/agency-tracker.js (see that file's header comment) instead of
   being hand-written inline here - only what's genuinely specific to
   Permit Tracker stays in this file: the Expiring Soon computation,
   table/summary rendering, and this tool's own validation/success-
   message wording.
   ============================================================ */

const EXPIRING_SOON_DAYS = 30;

const tracker = AgencyTracker.create({
  docName: 'permitTracker',
  localStorageKey: 'permit-tracker-list',
  idPrefix: 'pm',
  formFields: ['clientName', 'projectTitle', 'permitType', 'issuingAuthority', 'location', 'status', 'applicationDate', 'expirationDate', 'permitDocLink', 'notes'],
  saveButtonId: 'saveEntryBtn',
  addLabel: 'Log Permit',
  updateLabel: 'Update Permit',
});

function el(id) { return document.getElementById(id); }

function saveEntry() {
  tracker.saveEntry({
    validate: () => {
      if (!el('clientName').value.trim() || !el('location').value.trim()) {
        return 'Client name and location are required.';
      }
    },
    onSuccess: (entry) => {
      tracker.populateClientDatalist('clientOptions');
      renderTable();
      if (window.parent.showBanner) window.parent.showBanner('success', `Logged permit for ${entry.clientName}.`);
    },
  });
}

function removeEntry(id) {
  tracker.removeEntry(id, {
    confirmMessage: (entry) => `Remove the ${entry.permitType || 'permit'} entry for ${entry.clientName}?`,
    onSuccess: () => renderTable(),
  });
}

function statusSlug(status) {
  return (status || 'Not Started').toLowerCase().replace(/\s+/g, '-');
}

// Approved and expiring inside the next 30 days - the one thing this
// tracker exists to catch before it becomes a problem on shoot day.
function isExpiringSoon(entry) {
  if (entry.status !== 'Approved' || !entry.expirationDate) return false;
  const expires = new Date(entry.expirationDate + 'T00:00:00');
  if (isNaN(expires.getTime())) return false;
  const daysUntil = (expires - new Date()) / (1000 * 60 * 60 * 24);
  return daysUntil >= 0 && daysUntil <= EXPIRING_SOON_DAYS;
}

function renderSummary() {
  const pending = tracker.entries.filter(e => ['Not Started', 'Applied', 'Denied'].includes(e.status || 'Not Started'));
  const approved = tracker.entries.filter(e => e.status === 'Approved');
  const expiring = tracker.entries.filter(isExpiringSoon);
  el('summaryPending').textContent = pending.length;
  el('summaryApproved').textContent = approved.length;
  el('summaryExpiring').textContent = expiring.length;
}

function renderTable() {
  renderSummary();

  const filterClient = el('filterClientInput').value.trim().toLowerCase();
  const showAllStatuses = el('showAllStatusesToggle').checked;
  const rows = tracker.entries
    .filter(e => !filterClient || e.clientName.toLowerCase().includes(filterClient))
    .filter(e => showAllStatuses || e.status !== 'Approved' || isExpiringSoon(e));

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const statusClass = 'status-' + statusSlug(entry.status);
    const expiringSoon = isExpiringSoon(entry);
    const tr = document.createElement('tr');
    tr.className = expiringSoon ? 'row-expiring' : (['Not Started', 'Applied'].includes(entry.status || 'Not Started') ? 'row-pending' : '');
    tr.innerHTML = `
      <td class="client-cell">${entry.clientName}</td>
      <td>${entry.projectTitle || '--'}</td>
      <td>${entry.permitType || '--'}</td>
      <td>${entry.location}</td>
      <td class="date-cell">${entry.expirationDate || '--'}${expiringSoon ? ' ⚠️' : ''}</td>
      <td><span class="section-tag ${statusClass}">${entry.status || 'Not Started'}</span></td>
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
