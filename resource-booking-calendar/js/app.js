/* ============================================================
   BOOKING CALENDAR — APP LOGIC
   Weekly view of who's booked on which client, at what hours/week,
   compared against Team Roster's existing weeklyCapacityHours field -
   the Hub's own version of Productive's Resource Planner "By Person"
   view (see the Aug 2026 tech-stack-plan conversation this was built
   from). A booking is a PLAN ("Sarah is booked on Client X, 15 hrs/wk,
   through end of month"), Hours & Time Log is the ACTUAL ("Sarah logged
   4.5 hrs on Client X today") - related but not the same data, same
   distinction Productive draws between bookings and time tracking.

   Storage: one Firestore document per booking, in a top-level
   `resourceBookings` collection (each doc id = the booking's own id) -
   NOT the "one big doc holding a growing list" pattern every other
   agency/* tool uses (Hours & Time Log, Team Roster, Contract & Invoice
   Tracker, etc.). That pattern is what forced clientsDb into an
   emergency shard migration once it grew past Firestore's ~1MB
   per-document limit (see data-loss-prevention-plan.md) - bookings
   accumulate forever with no natural pruning, so building this tool
   fresh (Aug 2026, no real data yet) on the pattern that already broke
   once elsewhere would just be scheduling the same problem for later.
   Per-document storage also means editing one booking can never
   version-conflict with someone else editing a different one, unlike
   the shared-doc tools. See window.firebaseCollection/firebaseGetDocs/
   firebaseDeleteDoc (index.html) for the new helpers this relies on,
   and resourceBookings' own rule block in firestore.rules.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

function el(id) { return document.getElementById(id); }

let bookings = [];
let members = [];
let currentWeekStart = startOfWeek(new Date());
let editingBookingId = null;

function startOfWeek(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() - dt.getDay()); // Sunday
  return dt;
}

function addDays(d, n) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt;
}

function toISO(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtShort(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function uid() { return 'bkg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

/* ── Data load/save (per-document subcollection - see header comment) ── */

function getBookingDocRef(bookingId) {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "resourceBookings", bookingId);
}

function getBookingsCollectionRef() {
  if (!isEmbedded || !window.parent.firebaseCollection || !window.parent.firebaseDb) return null;
  return window.parent.firebaseCollection(window.parent.firebaseDb, "resourceBookings");
}

async function loadBookings() {
  if (isEmbedded && window.parent.firebaseGetDocs) {
    try {
      const ref = getBookingsCollectionRef();
      bookings = await window.parent.firebaseGetDocs(ref);
      return;
    } catch (e) {
      console.error("Couldn't load bookings from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load bookings: " + e.message);
      bookings = [];
      return;
    }
  }
  bookings = [];
}

// Writes exactly one booking - no version guard needed (unlike every
// other agency/* tool's shared-doc save) since each booking is its own
// document and can never conflict with an edit to a DIFFERENT booking.
// Two people editing the exact same booking at once is still
// last-write-wins, same as it would be for any single Firestore
// document - an acceptable tradeoff nobody is likely to hit given how
// this tool is actually used (one admin adjusting one person's
// schedule at a time).
async function saveOneBooking(booking) {
  if (!isEmbedded || !window.parent.firebaseSetDocFromJSON) return true;
  try {
    const { id, ...rest } = booking;
    await window.parent.firebaseSetDocFromJSON(getBookingDocRef(booking.id), JSON.stringify(rest));
    return true;
  } catch (e) {
    console.error("Couldn't save booking:", e);
    if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't save: " + e.message);
    return false;
  }
}

async function deleteOneBooking(bookingId) {
  if (!isEmbedded || !window.parent.firebaseDeleteDoc) return true;
  try {
    await window.parent.firebaseDeleteDoc(getBookingDocRef(bookingId));
    return true;
  } catch (e) {
    console.error("Couldn't delete booking:", e);
    if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't delete: " + e.message);
    return false;
  }
}

async function loadMembers() {
  members = (isEmbedded && typeof window.parent.getTeamRosterMembers === 'function')
    ? await window.parent.getTeamRosterMembers()
    : [];
}

function getClients() {
  if (!isEmbedded || typeof window.parent.getAllClients !== 'function') return {};
  try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
}

/* ── Calendar sync (best-effort, non-blocking) ──
   Mirrors Team Roster's syncTimeOffToCalendar exactly - see that
   function's header comment. Pushes to a separate "Revital Team
   Bookings" shared calendar (not the "Revital Team Out" one Time Off
   uses, and no personal Busy block - a booking is a work assignment,
   not an absence, so blocking someone's personal calendar for it would
   be wrong). See upsertBookingCalendarEvent/deleteBookingCalendarEvent
   in _worker.js. */
async function syncBookingToCalendar(action, payload) {
  if (!isEmbedded) return null;
  try {
    const res = await fetch('/api/resource-booking/sync-calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `Sync failed (${res.status})`);
    return data;
  } catch (e) {
    console.warn("Couldn't sync booking to Google Calendar (the booking itself is still saved):", e);
    if (window.parent.showBanner) {
      window.parent.showBanner('error', "Booking saved, but couldn't sync it to Google Calendar: " + e.message);
    }
    return null;
  }
}

/* ── Capacity math ──
   Any booking whose [startDate,endDate] overlaps ANY day of the
   displayed week counts its full hoursPerWeek toward that week's load -
   a booking that only covers part of a week still needs that much time
   carved out of it, so this doesn't prorate by the number of days
   actually in-range. */
function getWeekLoad(memberName, weekStart, weekEnd) {
  const weekStartIso = toISO(weekStart);
  const weekEndIso = toISO(weekEnd);
  return bookings
    .filter(b => b.memberName === memberName && b.startDate <= weekEndIso && b.endDate >= weekStartIso)
    .reduce((sum, b) => sum + (parseFloat(b.hoursPerWeek) || 0), 0);
}

function capacityClass(load, capacity) {
  if (!capacity || capacity <= 0) return 'capacity-unset';
  const ratio = load / capacity;
  if (ratio > 1) return 'capacity-over';
  if (ratio >= 0.8) return 'capacity-warn';
  return 'capacity-good';
}

/* ── Rendering ── */

function renderWeekLabel() {
  const weekEnd = addDays(currentWeekStart, 6);
  el('weekLabel').textContent = `Week of ${fmtShort(currentWeekStart)} – ${fmtShort(weekEnd)}`;
}

function renderGrid() {
  const headerRow = el('gridHeaderRow');
  const body = el('gridBody');
  const emptyState = el('emptyState');

  if (!members.length) {
    headerRow.innerHTML = '';
    body.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  const days = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const weekEnd = days[6];

  headerRow.innerHTML = '<th style="width:170px;">Team Member</th>' +
    days.map(d => `<th>${d.toLocaleDateString('en-US', { weekday: 'short' })}<br>${fmtShort(d)}</th>`).join('');

  const sorted = [...members].sort((a, b) => (a.memberName || '').localeCompare(b.memberName || ''));

  body.innerHTML = sorted.map(m => {
    const capacity = parseFloat(m.weeklyCapacityHours) || 0;
    const load = getWeekLoad(m.memberName, currentWeekStart, weekEnd);
    const capClass = capacityClass(load, capacity);
    const capLabel = capacity > 0 ? `${load}/${capacity} hrs` : (load > 0 ? `${load} hrs booked` : 'No capacity set');

    const dayCells = days.map(d => {
      const dayIso = toISO(d);
      const dayBookings = bookings.filter(b => b.memberName === m.memberName && b.startDate <= dayIso && b.endDate >= dayIso);
      const chips = dayBookings.map(b => `
        <div class="booking-chip" data-id="${b.id}" title="${escapeHtml(b.clientName)} — ${b.hoursPerWeek} hrs/wk${b.notes ? ' — ' + escapeHtml(b.notes) : ''}">${escapeHtml(b.clientName)}</div>
      `).join('');
      return `<td class="day-cell" data-member="${escapeHtml(m.memberName)}" data-date="${dayIso}">${chips}<button type="button" class="add-chip-btn" data-member="${escapeHtml(m.memberName)}" data-date="${dayIso}">+</button></td>`;
    }).join('');

    return `<tr>
      <td class="member-cell">
        <div class="member-name">${escapeHtml(m.memberName)}</div>
        <span class="member-capacity ${capClass}">${capLabel}</span>
      </td>
      ${dayCells}
    </tr>`;
  }).join('');

  // Chip click -> edit; "+" click -> new booking prefilled for that member/date
  body.querySelectorAll('.booking-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      openBookingForm(bookings.find(b => b.id === chip.getAttribute('data-id')));
    });
  });
  body.querySelectorAll('.add-chip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openBookingForm(null, { memberName: btn.getAttribute('data-member'), date: btn.getAttribute('data-date') });
    });
  });
}

function renderAll() {
  renderWeekLabel();
  renderGrid();
}

/* ── Booking form ── */

function populateFormDatalists() {
  const memberList = el('bookingMemberOptions');
  memberList.innerHTML = '';
  [...members].map(m => m.memberName).filter(Boolean).sort().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    memberList.appendChild(opt);
  });

  const clientList = el('bookingClientOptions');
  clientList.innerHTML = '';
  Object.keys(getClients()).sort().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    clientList.appendChild(opt);
  });
}

function openBookingForm(existing, prefill) {
  editingBookingId = existing ? existing.id : null;
  el('bookingFormTitle').textContent = existing ? 'Edit Booking' : 'New Booking';
  el('bookingMember').value = existing ? existing.memberName : (prefill && prefill.memberName) || '';
  el('bookingClient').value = existing ? existing.clientName : '';
  el('bookingStart').value = existing ? existing.startDate : (prefill && prefill.date) || toISO(currentWeekStart);
  el('bookingEnd').value = existing ? existing.endDate : (prefill && prefill.date) || toISO(addDays(currentWeekStart, 4));
  el('bookingHours').value = existing ? existing.hoursPerWeek : '';
  el('bookingNotes').value = existing ? (existing.notes || '') : '';
  el('deleteBookingBtn').style.display = existing ? 'inline-block' : 'none';
  el('bookingFormStatus').textContent = '';
  el('bookingFormCard').style.display = 'block';
  el('bookingFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeBookingForm() {
  editingBookingId = null;
  el('bookingFormCard').style.display = 'none';
}

async function saveBooking() {
  const memberName = el('bookingMember').value.trim();
  const clientName = el('bookingClient').value.trim();
  const startDate = el('bookingStart').value;
  const endDate = el('bookingEnd').value || startDate;
  const hoursPerWeek = parseFloat(el('bookingHours').value);
  const notes = el('bookingNotes').value.trim();

  if (!memberName || !clientName || !startDate || !hoursPerWeek || hoursPerWeek <= 0) {
    el('bookingFormStatus').textContent = 'Team member, client, start date, and hours/week are required.';
    el('bookingFormStatus').className = 'form-status status-err';
    return;
  }
  if (endDate < startDate) {
    el('bookingFormStatus').textContent = 'End date is before the start date.';
    el('bookingFormStatus').className = 'form-status status-err';
    return;
  }

  const saveBtn = el('saveBookingBtn');
  saveBtn.disabled = true;
  try {
    let booking;
    let previousBookingState = null;
    let isNewBooking = false;
    if (editingBookingId) {
      booking = bookings.find(b => b.id === editingBookingId);
      previousBookingState = { ...booking }; // snapshot so we can roll back if the save fails
      Object.assign(booking, { memberName, clientName, startDate, endDate, hoursPerWeek, notes });
    } else {
      isNewBooking = true;
      booking = { id: uid(), memberName, clientName, startDate, endDate, hoursPerWeek, notes, calendarEventId: null, createdAt: new Date().toISOString() };
      bookings.push(booking);
    }

    const ok = await saveOneBooking(booking);
    if (!ok) {
      // This tool has no realtime listener re-fetching from the server
      // (loadBookings is a one-time fetch), so an un-rolled-back mutation
      // here would sit wrong in memory - and keep looking "saved" on the
      // next unrelated render - for the rest of the session.
      if (isNewBooking) {
        bookings = bookings.filter(b => b.id !== booking.id);
      } else {
        Object.assign(booking, previousBookingState);
      }
      renderAll();
      return;
    }

    const calResult = await syncBookingToCalendar('upsert', {
      calendarEventId: booking.calendarEventId,
      memberName: booking.memberName,
      clientName: booking.clientName,
      startDate: booking.startDate,
      endDate: booking.endDate,
      hoursPerWeek: booking.hoursPerWeek,
      notes: booking.notes
    });
    if (calResult && calResult.calendarEventId) {
      booking.calendarEventId = calResult.calendarEventId;
      await saveOneBooking(booking);
    }

    closeBookingForm();
    renderAll();
  } finally {
    saveBtn.disabled = false;
  }
}

async function deleteBooking() {
  if (!editingBookingId) return;
  if (!confirm('Delete this booking?')) return;
  const booking = bookings.find(b => b.id === editingBookingId);
  if (!booking) return;

  const ok = await deleteOneBooking(editingBookingId);
  if (!ok) return;
  bookings = bookings.filter(b => b.id !== editingBookingId);

  if (booking.calendarEventId) {
    syncBookingToCalendar('delete', { calendarEventId: booking.calendarEventId });
  }

  closeBookingForm();
  renderAll();
}

/* ── Init ── */

document.addEventListener('DOMContentLoaded', async () => {
  el('prevWeekBtn').addEventListener('click', () => { currentWeekStart = addDays(currentWeekStart, -7); renderAll(); });
  el('nextWeekBtn').addEventListener('click', () => { currentWeekStart = addDays(currentWeekStart, 7); renderAll(); });
  el('thisWeekBtn').addEventListener('click', () => { currentWeekStart = startOfWeek(new Date()); renderAll(); });
  el('newBookingBtn').addEventListener('click', () => openBookingForm(null, { date: toISO(currentWeekStart) }));
  el('cancelBookingBtn').addEventListener('click', closeBookingForm);
  el('saveBookingBtn').addEventListener('click', saveBooking);
  el('deleteBookingBtn').addEventListener('click', deleteBooking);

  await Promise.all([loadBookings(), loadMembers()]);
  populateFormDatalists();
  renderAll();

  // Same "parent client data loads async" reasoning as every other tool
  // here - clients (for the datalist) may not be ready yet on first
  // paint.
  let pollAttempts = 0;
  const poll = setInterval(() => {
    pollAttempts++;
    const hasClients = Object.keys(getClients()).length > 0;
    if (hasClients || pollAttempts > 30) {
      clearInterval(poll);
      if (hasClients) populateFormDatalists();
    }
  }, 250);
});
