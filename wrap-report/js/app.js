/* ============================================================
   WRAP REPORT — APP LOGIC
   (agency-wide: not tied to a single client, stores its own list
   at agency/wrapReports rather than living inside clientsDb).
   Same pattern as Release Forms Tracker, Shot List Builder, and
   Permit Tracker - a flat log across every shoot, filterable by
   client. Unlike those three, this one isn't a to-do queue (a
   wrap report has nothing left to action once it's written), so
   the default filter surfaces Rough-rated shoots instead - the
   ones actually worth someone reading before the next shoot with
   that client - rather than "not yet done" rows.

   The load/persist/uid/datalist/form-CRUD plumbing below comes from
   shared/agency-tracker.js (see that file's header comment) instead of
   being hand-written inline here - only what's genuinely specific to
   Wrap Report stays in this file: table/summary rendering and this
   tool's own validation/success-message wording.
   ============================================================ */

const tracker = AgencyTracker.create({
  docName: 'wrapReports',
  localStorageKey: 'wrap-report-list',
  idPrefix: 'wr',
  formFields: ['clientName', 'projectTitle', 'shootDate', 'rating', 'scheduleNotes', 'whatWentWell', 'whatWentWrong', 'vendorIssues', 'actionItems'],
  saveButtonId: 'saveEntryBtn',
  addLabel: 'Log Wrap Report',
  updateLabel: 'Update Wrap Report',
});

function el(id) { return document.getElementById(id); }

function saveEntry() {
  tracker.saveEntry({
    validate: () => {
      if (!el('clientName').value.trim() || !el('shootDate').value.trim()) {
        return 'Client name and shoot date are required.';
      }
    },
    onSuccess: (entry) => {
      tracker.populateClientDatalist('clientOptions');
      renderTable();
      if (window.parent.showBanner) window.parent.showBanner('success', `Logged wrap report for ${entry.clientName}.`);
    },
  });
}

function removeEntry(id) {
  tracker.removeEntry(id, {
    confirmMessage: (entry) => `Remove the wrap report for ${entry.clientName} (${entry.shootDate})?`,
    onSuccess: () => renderTable(),
  });
}

function statusSlug(status) {
  return (status || 'Good').toLowerCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function truncate(str, max) {
  if (!str) return '--';
  return str.length > max ? str.slice(0, max).trim() + '…' : str;
}

function renderSummary() {
  const great = tracker.entries.filter(e => e.rating === 'Great');
  const good = tracker.entries.filter(e => e.rating === 'Good');
  const rough = tracker.entries.filter(e => e.rating === 'Rough');
  el('summaryGreat').textContent = great.length;
  el('summaryGood').textContent = good.length;
  el('summaryRough').textContent = rough.length;
}

function renderTable() {
  renderSummary();

  const filterClient = el('filterClientInput').value.trim().toLowerCase();
  const showAllStatuses = el('showAllStatusesToggle').checked;
  const rows = tracker.entries
    .filter(e => !filterClient || e.clientName.toLowerCase().includes(filterClient))
    .filter(e => showAllStatuses || e.rating === 'Rough');

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const statusClass = 'status-' + statusSlug(entry.rating);
    const tr = document.createElement('tr');
    tr.className = entry.rating === 'Rough' ? 'row-pending' : '';
    tr.innerHTML = `
      <td class="client-cell">${escapeHtml(entry.clientName)}</td>
      <td>${escapeHtml(entry.projectTitle) || '--'}</td>
      <td class="date-cell">${escapeHtml(entry.shootDate)}</td>
      <td><span class="section-tag ${statusClass}">${escapeHtml(entry.rating) || 'Good'}</span></td>
      <td class="wrap-text">${escapeHtml(truncate(entry.actionItems, 100))}</td>
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

// ── Download CSV ──
// Same filterClient/showAllStatuses state as the table, so the export
// always matches whatever's currently on screen.
function downloadWrapReportsCsv() {
  const filterClient = el('filterClientInput').value.trim().toLowerCase();
  const showAllStatuses = el('showAllStatusesToggle').checked;
  const rows = tracker.entries
    .filter(e => !filterClient || e.clientName.toLowerCase().includes(filterClient))
    .filter(e => showAllStatuses || e.rating === 'Rough');

  if (!rows.length) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'No wrap reports to export with the current filter.');
    return;
  }

  const csv = AgencyTracker.rowsToCsv([
    { label: 'Client', key: 'clientName' },
    { label: 'Project', key: 'projectTitle' },
    { label: 'Shoot Date', key: 'shootDate' },
    { label: 'Rating', key: 'rating' },
    { label: 'Schedule Notes', key: 'scheduleNotes' },
    { label: 'What Went Well', key: 'whatWentWell' },
    { label: 'What Went Wrong', key: 'whatWentWrong' },
    { label: 'Vendor Issues', key: 'vendorIssues' },
    { label: 'Action Items', key: 'actionItems' },
  ], rows);

  const companyName = filterClient ? rows[0].clientName : 'All_Clients';
  AgencyTracker.downloadCsv(window, `Wrap_Reports_${companyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`, csv);
}

document.addEventListener('DOMContentLoaded', async () => {
  tracker.populateClientDatalist('clientOptions');
  tracker.resetForm();
  await tracker.loadEntries();
  renderTable();

  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('downloadCsvBtn').addEventListener('click', downloadWrapReportsCsv);
  el('filterClientInput').addEventListener('input', renderTable);
  el('showAllStatusesToggle').addEventListener('change', renderTable);

  tracker.pollForClients('clientOptions');
});
