/* ============================================================
   CALL SHEET / SHOOT SCHEDULE BUILDER — APP LOGIC
   (agency-wide: not tied to a single client, stores its own list
   at agency/callSheets rather than living inside clientsDb).
   Logs shoot-day logistics. Crew and equipment live in their own
   outside apps (crew scheduling / gear checkout) - the fields here
   are free-text references for the day-of sheet, not a source of
   truth for booking or availability.

   The load/persist/uid/datalist/startEdit/removeEntry plumbing below
   comes from shared/agency-tracker.js (see that file's header comment)
   instead of being hand-written inline here. saveEntry() is the one
   exception - every other migrated tracker tool simply unshifts a new
   entry onto the front of the list, but this one inserts then re-sorts
   by shoot date (so the table always reads soonest-shoot-first rather
   than most-recently-logged-first), so it uses the lower-level
   tracker.gatherForm()/persist() primitives directly instead of the
   generic tracker.saveEntry() helper, which assumes the unshift shape.
   ============================================================ */

const tracker = AgencyTracker.create({
  docName: 'callSheets',
  localStorageKey: 'call-sheet-builder-list',
  idPrefix: 'cs',
  formFields: [
    'clientName', 'shootTitle', 'shootDate', 'callTime', 'wrapTime', 'status',
    'locationName', 'locationAddress', 'onSiteContactName', 'onSiteContactPhone',
    'clientAttendees', 'weatherBackupPlan', 'crewAssigned', 'equipmentNeeded', 'shotListNotes'
  ],
  saveButtonId: 'saveEntryBtn',
  addLabel: 'Save Call Sheet',
  updateLabel: 'Update Call Sheet',
});

function el(id) { return document.getElementById(id); }

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

function saveEntry() {
  const clientName = el('clientName').value.trim();
  const shootTitle = el('shootTitle').value.trim();
  const shootDate = el('shootDate').value;
  if (!clientName || !shootTitle || !shootDate) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Client name, shoot title, and shoot date are required.');
    return;
  }

  const entry = tracker.gatherForm();
  // Snapshot before mutating: push/index-replace/sort below all mutate
  // tracker.entries in place, so we need a real copy (not just the
  // reference) to restore from if persist() fails, otherwise "previous"
  // would already reflect the unsaved change too.
  const previous = tracker.entries.slice();
  if (tracker.editingId) {
    const idx = tracker.entries.findIndex(e => e.id === tracker.editingId);
    if (idx >= 0) tracker.entries[idx] = entry;
  } else {
    tracker.entries.push(entry);
  }
  tracker.entries.sort((a, b) => (a.shootDate || '9999').localeCompare(b.shootDate || '9999'));

  tracker.persist().then(ok => {
    if (!ok) {
      tracker.entries = previous; // roll back the unsaved add/edit so it doesn't silently stick around in memory
      return;
    }
    tracker.resetForm();
    tracker.populateClientDatalist('clientOptions');
    renderTable();
    if (window.parent.showBanner) window.parent.showBanner('success', `Saved call sheet for ${clientName} — ${shootTitle}.`);
  });
}

function removeEntry(id) {
  tracker.removeEntry(id, {
    confirmMessage: (entry) => `Remove the call sheet for ${entry.clientName} — ${entry.shootTitle}?`,
    onSuccess: () => renderTable(),
  });
}

function renderTable() {
  const showCancelled = el('showCancelledToggle').checked;
  const filterClient = el('filterClientInput').value.trim().toLowerCase();

  const rows = tracker.entries.filter(e => {
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
          <button class="pdf-btn" data-id="${entry.id}">PDF</button>
          <button class="remove-btn" data-id="${entry.id}">Remove</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => tracker.startEdit(btn.getAttribute('data-id'))));
  document.querySelectorAll('.pdf-btn').forEach(btn => btn.addEventListener('click', () => downloadCallSheetPdf(btn.getAttribute('data-id'))));
  document.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => removeEntry(btn.getAttribute('data-id'))));
}

// ── Download PDF ──
// One call sheet = one printable page, since that's how these actually
// get used on set - handed to crew as a single-shoot reference, not
// bundled into a multi-shoot report. Exports whatever's saved for this
// entry (not the live form), matching the Edit/Remove buttons next to it
// which also act on the saved record. This is the only other Production
// tracker that gets a PDF export besides Shot List Builder - both are
// working documents meant to be carried on location, unlike Release
// Forms/Permit Tracker/Wrap Report, which stay logs reviewed on screen.
function pdfField(r, label, value) {
  if (!value) return;
  r.paragraph(label.toUpperCase(), { bold: true, size: 9, spaceAfter: 2, color: r.colors.ACCENT });
  r.paragraph(value, { spaceAfter: 12 });
}

function downloadCallSheetPdf(id) {
  const entry = tracker.entries.find(e => e.id === id);
  if (!entry) return;

  if (typeof window.RevitalPDF === 'undefined') {
    alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
    return;
  }

  try {
    const r = RevitalPDF.create({ reportTitle: 'CALL SHEET', companyName: entry.clientName || 'Client' });

    const timing = [entry.shootDate, entry.callTime ? `Call Time ${entry.callTime}` : null, entry.wrapTime ? `Est. Wrap ${entry.wrapTime}` : null]
      .filter(Boolean).join('   •   ');

    r.coverPage({
      title: entry.shootTitle || 'Shoot',
      subLine: timing,
      objective: entry.status ? `Status: ${entry.status}` : undefined,
    });

    pdfField(r, 'Location', [entry.locationName, entry.locationAddress].filter(Boolean).join(' — '));
    pdfField(r, 'On-Site Contact', [entry.onSiteContactName, entry.onSiteContactPhone].filter(Boolean).join(' — '));
    pdfField(r, 'Client Attendees', entry.clientAttendees);
    pdfField(r, 'Weather / Backup Plan', entry.weatherBackupPlan);
    pdfField(r, 'Crew Assigned', entry.crewAssigned);
    pdfField(r, 'Equipment Needed', entry.equipmentNeeded);
    pdfField(r, 'Shot List / Notes', entry.shotListNotes);

    r.save(`Call_Sheet_${(entry.clientName || 'Client').replace(/\s+/g, '_')}_${(entry.shootTitle || 'Shoot').replace(/\s+/g, '_')}_${entry.shootDate || ''}.pdf`);
  } catch (e) {
    console.error('Call sheet PDF error:', e);
    alert('Something went wrong generating the PDF: ' + (e && e.message ? e.message : e));
  }
}

// Venue Tech-Spec Library autofill - keyed by venue name so a repeat
// venue's address never has to be re-typed (or drift from what the
// library has on file). Only fills the Address field, and only when
// it's empty - never overwrites something already typed, e.g. a
// one-off/temporary address for a venue that happens to share a name.
let venueLibrary = [];

async function loadVenueLibrary() {
  if (!tracker.isEmbedded || !window.parent.getVenueTechSpecs) return;
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

// ── Download CSV ──
// Same showCancelled/filterClient state as the table, so the export
// always matches whatever's currently on screen.
function downloadCallSheetsCsv() {
  const showCancelled = el('showCancelledToggle').checked;
  const filterClient = el('filterClientInput').value.trim().toLowerCase();
  const rows = tracker.entries.filter(e => {
    if (!showCancelled && e.status === 'Cancelled') return false;
    if (filterClient && !e.clientName.toLowerCase().includes(filterClient)) return false;
    return true;
  });

  if (!rows.length) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'No call sheets to export with the current filter.');
    return;
  }

  const csv = AgencyTracker.rowsToCsv([
    { label: 'Client', key: 'clientName' },
    { label: 'Shoot Title', key: 'shootTitle' },
    { label: 'Shoot Date', key: 'shootDate' },
    { label: 'Call Time', key: 'callTime' },
    { label: 'Wrap Time', key: 'wrapTime' },
    { label: 'Status', key: 'status' },
    { label: 'Location Name', key: 'locationName' },
    { label: 'Location Address', key: 'locationAddress' },
    { label: 'On-Site Contact', key: 'onSiteContactName' },
    { label: 'On-Site Contact Phone', key: 'onSiteContactPhone' },
    { label: 'Client Attendees', key: 'clientAttendees' },
    { label: 'Weather / Backup Plan', key: 'weatherBackupPlan' },
    { label: 'Crew Assigned', key: 'crewAssigned' },
    { label: 'Equipment Needed', key: 'equipmentNeeded' },
    { label: 'Shot List / Notes', key: 'shotListNotes' },
  ], rows);

  const companyName = filterClient ? rows[0].clientName : 'All_Clients';
  AgencyTracker.downloadCsv(window, `Call_Sheets_${companyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`, csv);
}

document.addEventListener('DOMContentLoaded', async () => {
  tracker.populateClientDatalist('clientOptions');
  tracker.resetForm();
  await tracker.loadEntries();
  renderTable();
  loadVenueLibrary();

  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('showCancelledToggle').addEventListener('change', renderTable);
  el('filterClientInput').addEventListener('input', renderTable);
  el('locationName').addEventListener('change', autofillVenueAddress);
  el('downloadCsvBtn').addEventListener('click', downloadCallSheetsCsv);

  tracker.pollForClients('clientOptions');
});
