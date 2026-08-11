/* ============================================================
   MY TIME OFF — APP LOGIC
   Self-service companion to Team Roster & Capacity's Time Off feature.
   Any signed-in teammate can request time off here; it lands as a
   pending request on the SAME agency/teamRoster Firestore doc Team
   Roster itself owns (each member gets a new pendingTimeOff array
   alongside their existing timeOff array), so approving it in Team
   Roster is just moving one entry from one array to the other and
   reusing that tool's existing Google Calendar sync - there's no
   separate approval pipeline or second source of truth.
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function uid() { return 'mto-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

let members = [];
let docVersion = 0;
let currentEmail = null;
let myMemberId = null;

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamRoster");
}

async function loadRoster() {
  if (!isEmbedded || !window.parent.firebaseGetDoc) { members = []; return; }
  try {
    const ref = getDocRef();
    const snap = await window.parent.firebaseGetDoc(ref);
    const data = snap && snap.exists ? snap.data() : null;
    members = (data && data.list) || [];
    docVersion = (data && data.version) || 0;
  } catch (e) {
    console.error("Couldn't load the team roster:", e);
    members = [];
  }
}

// Same conflict-safe versioned write Team Roster itself uses - see
// saveVersionedAgencyDoc in root app.js.
async function persist() {
  if (!isEmbedded || !window.parent.saveVersionedAgencyDoc) return false;
  const result = await window.parent.saveVersionedAgencyDoc({
    docRef: getDocRef(),
    currentVersion: docVersion,
    buildPayload: (v) => ({ list: members, version: v }),
  });
  if (!result.ok) {
    if (result.reason === 'conflict') {
      setFormStatus('Someone else updated the roster. Reloading...', 'error');
      setTimeout(() => location.reload(), 1500);
    } else {
      setFormStatus("Couldn't save: " + (result.error ? result.error.message : 'unknown error'), 'error');
    }
    return false;
  }
  docVersion = result.version;
  return true;
}

function setFormStatus(msg, cls) {
  const statusEl = el('mtoFormStatus');
  if (!statusEl) return;
  statusEl.textContent = msg || '';
  statusEl.className = 'form-status' + (cls ? ' ' + cls : '');
}

function myMember() {
  return members.find(m => m.id === myMemberId) || null;
}

function renderMyRequests() {
  const listEl = el('myRequestsList');
  const emptyEl = el('myRequestsEmptyState');
  const member = myMember();
  if (!listEl || !emptyEl || !member) return;

  const pending = (member.pendingTimeOff || []).filter(r => (r.requestedByEmail || '').toLowerCase() === currentEmail)
    .map(r => ({ startDate: r.startDate, endDate: r.endDate, note: r.note, status: r.status, sortKey: r.requestedAt || r.startDate, id: r.id, cancellable: r.status === 'pending' }));
  const approved = (member.timeOff || []).filter(r => (r.requestedByEmail || '').toLowerCase() === currentEmail)
    .map(r => ({ startDate: r.startDate, endDate: r.endDate, note: r.note, status: 'approved', sortKey: r.startDate, id: r.id, cancellable: false }));

  const all = [...pending, ...approved].sort((a, b) => (b.sortKey || '').localeCompare(a.sortKey || ''));

  if (!all.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  listEl.innerHTML = all.map(r => `
    <div class="mto-request-row">
      <div style="flex:1; min-width:200px;">
        <div class="mto-request-dates">${formatShortDate(r.startDate)} &ndash; ${formatShortDate(r.endDate)}</div>
        ${r.note ? `<div class="mto-request-note">${escapeHtml(r.note)}</div>` : ''}
      </div>
      <span class="mto-status-badge mto-status-${r.status}">${escapeHtml(r.status)}</span>
      ${r.cancellable ? `<button type="button" class="btn btn-secondary mto-cancel-btn" data-req-id="${escapeHtml(r.id)}" style="padding:5px 12px; font-size:0.78rem;">Cancel</button>` : ''}
    </div>`).join('');

  listEl.querySelectorAll('.mto-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => cancelMyRequest(btn.getAttribute('data-req-id')));
  });
}

async function submitRequest() {
  const member = myMember();
  if (!member) return;
  const start = el('mtoStart').value;
  const end = el('mtoEnd').value || start;
  const note = el('mtoNote').value.trim();
  if (!start) { setFormStatus('Pick a start date first.', 'error'); return; }
  if (end < start) { setFormStatus('End date is before the start date.', 'error'); return; }

  const submitBtn = el('mtoSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;
  setFormStatus('Submitting...', '');

  if (!Array.isArray(member.pendingTimeOff)) member.pendingTimeOff = [];
  const previous = member.pendingTimeOff;
  const newEntry = {
    id: uid(),
    startDate: start,
    endDate: end,
    note,
    status: 'pending',
    requestedByEmail: currentEmail,
    requestedAt: new Date().toISOString()
  };
  member.pendingTimeOff = [...member.pendingTimeOff, newEntry];

  const ok = await persist();
  if (submitBtn) submitBtn.disabled = false;
  if (!ok) { member.pendingTimeOff = previous; return; }

  setFormStatus('Request submitted - waiting on approval.', 'success');
  el('mtoStart').value = '';
  el('mtoEnd').value = '';
  el('mtoNote').value = '';
  renderMyRequests();

  if (window.parent.pushAdminNotification) {
    window.parent.pushAdminNotification(
      'time_off_request',
      `${member.memberName || 'A teammate'} requested time off ${formatShortDate(start)}–${formatShortDate(end)} (Team Roster → approve/decline).`,
      null,
      null
    );
  }
}

async function cancelMyRequest(reqId) {
  const member = myMember();
  if (!member || !Array.isArray(member.pendingTimeOff)) return;
  const req = member.pendingTimeOff.find(r => r.id === reqId && r.status === 'pending');
  if (!req) return;
  const previous = member.pendingTimeOff;
  member.pendingTimeOff = member.pendingTimeOff.filter(r => r.id !== reqId);
  const ok = await persist();
  if (!ok) { member.pendingTimeOff = previous; return; }
  renderMyRequests();
}

async function init() {
  await loadRoster();
  const email = (currentEmail || '').toLowerCase();
  const match = members.find(m => (m.email || '').trim().toLowerCase() === email);
  myMemberId = match ? match.id : null;

  if (!match) {
    el('notOnRosterState').style.display = 'block';
    el('myTimeOffContent').style.display = 'none';
    return;
  }
  el('notOnRosterState').style.display = 'none';
  el('myTimeOffContent').style.display = 'block';
  renderMyRequests();
}

document.addEventListener('DOMContentLoaded', () => {
  el('mtoSubmitBtn').addEventListener('click', submitRequest);

  // window.parent.currentAdminEmail is set once the parent Hub's own
  // silent Firebase sign-in resolves (see initAdminAuthGate in root
  // app.js) - can still be unset for a moment after this iframe's own
  // load fires, same iframe-race every other client-aware tool here
  // guards against. Poll briefly rather than assume it's ready.
  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    const email = isEmbedded && window.parent.currentAdminEmail;
    if (email || attempts > 30) {
      clearInterval(poll);
      if (email) {
        currentEmail = email.toLowerCase();
        init();
      } else {
        el('notOnRosterState').style.display = 'block';
        el('notOnRosterState').querySelector('p').textContent = "Couldn't confirm your sign-in. Reload the page and try again.";
      }
    }
  }, 250);
});
