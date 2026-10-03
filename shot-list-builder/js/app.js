/* ============================================================
   SHOT LIST BUILDER — APP LOGIC
   (agency-wide: not tied to a single client, stores its own list
   at agency/shotList rather than living inside clientsDb).
   Same pattern as Release Forms Tracker and Call Sheet Builder -
   a flat log of shots across every shoot, filterable by client,
   defaulting to what's not captured yet so the list doubles as a
   day-of "what's left" view instead of just a historical record.

   The load/persist/uid/datalist/form-CRUD plumbing below used to be
   hand-written inline here (and independently duplicated in Permit
   Tracker, Wrap Report, Release Forms Tracker, and Call Sheet Builder).
   It now comes from shared/agency-tracker.js instead - see that file's
   header comment for the full rationale. Only the parts that are
   genuinely specific to Shot List Builder stay in this file: table/
   summary rendering, the Download PDF export, and this tool's own
   validation/success-message wording.
   ============================================================ */

const tracker = AgencyTracker.create({
  docName: 'shotList',
  localStorageKey: 'shot-list-builder-list',
  idPrefix: 'sh',
  formFields: ['clientName', 'projectTitle', 'shotNumber', 'shotType', 'location', 'status', 'shotDescription', 'notes'],
  saveButtonId: 'saveEntryBtn',
  addLabel: 'Add Shot',
  updateLabel: 'Update Shot',
});

function el(id) { return document.getElementById(id); }

function saveEntry() {
  tracker.saveEntry({
    validate: () => {
      if (!el('clientName').value.trim() || !el('shotDescription').value.trim()) {
        return 'Client name and shot description are required.';
      }
    },
    onSuccess: (entry) => {
      tracker.populateClientDatalist('clientOptions');
      renderTable();
      if (window.parent.showBanner) window.parent.showBanner('success', `Added shot for ${entry.clientName}.`);
    },
  });
}

function removeEntry(id) {
  const target = tracker.entries.find(e => e.id === id);
  if (!target) return;
  tracker.removeEntry(id, {
    confirmMessage: (entry) => `Remove shot ${entry.shotNumber || ''} — ${entry.shotDescription}?`,
    onSuccess: () => renderTable(),
  });
}

function statusSlug(status) {
  return (status || 'Planned').toLowerCase().replace(/\s+/g, '-');
}

function renderSummary() {
  const planned = tracker.entries.filter(e => e.status === 'Planned');
  const reshoot = tracker.entries.filter(e => e.status === 'Needs Reshoot');
  const captured = tracker.entries.filter(e => e.status === 'Captured');
  el('summaryPlanned').textContent = planned.length;
  el('summaryReshoot').textContent = reshoot.length;
  el('summaryCaptured').textContent = captured.length;
}

function renderTable() {
  renderSummary();

  const filterClient = el('filterClientInput').value.trim().toLowerCase();
  const showAllStatuses = el('showAllStatusesToggle').checked;
  const rows = tracker.entries
    .filter(e => !filterClient || e.clientName.toLowerCase().includes(filterClient))
    .filter(e => showAllStatuses || e.status !== 'Captured');

  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(entry => {
    const statusClass = 'status-' + statusSlug(entry.status);
    const tr = document.createElement('tr');
    tr.className = entry.status === 'Needs Reshoot' ? 'row-pending' : '';
    tr.innerHTML = `
      <td class="client-cell">${entry.clientName}</td>
      <td>${entry.projectTitle || '--'}</td>
      <td>${entry.shotNumber || '--'}</td>
      <td>${entry.shotDescription}</td>
      <td>${entry.shotType || '--'}</td>
      <td><span class="section-tag ${statusClass}">${entry.status || 'Planned'}</span></td>
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

// ── Download PDF ──
// Exports exactly what's currently on screen - same filterClient/
// showAllStatuses state the table itself uses - so "Download PDF" always
// matches what you're looking at rather than silently exporting
// everything regardless of the active filter. This is the one Production
// tracker meant to be carried on set rather than just reviewed on a
// screen, which is why it gets this and Release Forms/Permit Tracker/
// Wrap Report don't.
function downloadShotListPdf() {
  const filterClient = el('filterClientInput').value.trim().toLowerCase();
  const showAllStatuses = el('showAllStatusesToggle').checked;
  const rows = tracker.entries
    .filter(e => !filterClient || e.clientName.toLowerCase().includes(filterClient))
    .filter(e => showAllStatuses || e.status !== 'Captured');

  if (!rows.length) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'No shots to export with the current filter.');
    return;
  }

  const btn = el('downloadPdfBtn');
  const origHtml = btn.innerHTML;
  btn.disabled = true; btn.textContent = 'Generating...';

  try {
    if (typeof window.RevitalPDF === 'undefined') {
      alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
      return;
    }
    const companyName = filterClient ? rows[0].clientName : 'All Clients';
    const r = RevitalPDF.create({ reportTitle: 'SHOT LIST', companyName });

    r.coverPage({
      title: 'Shot List',
      subLine: new Date().toLocaleDateString(),
      objective: showAllStatuses ? undefined : 'Shots still needed - captured shots are hidden. Check "Show captured shots" before exporting for the full list.',
    });

    r.newPage();
    r.sectionHeader('Shots');
    r.tableBlock(
      ['Client', 'Project', '#', 'Description', 'Type', 'Status'],
      rows.map(e => [e.clientName, e.projectTitle || '--', e.shotNumber || '--', e.shotDescription, e.shotType || '--', e.status || 'Planned']),
      [70, 85, 30, 150, 65, 65]
    );

    r.save(`Shot_List_${companyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (e) {
    console.error('Shot list PDF error:', e);
    alert('Something went wrong generating the PDF: ' + (e && e.message ? e.message : e));
  }

  btn.disabled = false; btn.innerHTML = origHtml;
}

// ── Download CSV ──
// Same filterClient/showAllStatuses state as the table and the PDF export
// above, so all three ("what's on screen", "Download PDF", "Download CSV")
// always agree with each other instead of CSV silently exporting
// everything regardless of the active filter.
function downloadShotListCsv() {
  const filterClient = el('filterClientInput').value.trim().toLowerCase();
  const showAllStatuses = el('showAllStatusesToggle').checked;
  const rows = tracker.entries
    .filter(e => !filterClient || e.clientName.toLowerCase().includes(filterClient))
    .filter(e => showAllStatuses || e.status !== 'Captured');

  if (!rows.length) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'No shots to export with the current filter.');
    return;
  }

  const csv = AgencyTracker.rowsToCsv([
    { label: 'Client', key: 'clientName' },
    { label: 'Project', key: 'projectTitle' },
    { label: 'Shot #', key: 'shotNumber' },
    { label: 'Description', key: 'shotDescription' },
    { label: 'Type', key: 'shotType' },
    { label: 'Location', key: 'location' },
    { label: 'Status', key: 'status' },
    { label: 'Notes', key: 'notes' },
  ], rows);

  const companyName = filterClient ? rows[0].clientName : 'All_Clients';
  AgencyTracker.downloadCsv(window, `Shot_List_${companyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`, csv);
}

document.addEventListener('DOMContentLoaded', async () => {
  tracker.populateClientDatalist('clientOptions');
  tracker.resetForm();
  await tracker.loadEntries();
  renderTable();

  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('filterClientInput').addEventListener('input', renderTable);
  el('showAllStatusesToggle').addEventListener('change', renderTable);
  el('downloadPdfBtn').addEventListener('click', downloadShotListPdf);
  el('downloadCsvBtn').addEventListener('click', downloadShotListCsv);

  tracker.pollForClients('clientOptions');
});
