/* ============================================================
   BUSINESS INSURANCE TRACKER — APP LOGIC
   Agency-wide (not tied to a single client): stores its own list at
   agency/businessInsurance, same optimistic-concurrency version-guard
   pattern as Subscription Tracker and the other full-overwrite trackers.
   Admin/leadership only - gated for the whole page like Subscription
   Tracker/Service Pricing Admin, since policy numbers/coverage/premium
   are financial info nobody else should be able to see.

   This tracks REVITAL PRODUCTIONS' OWN business insurance policies -
   General Liability, Errors & Omissions (E&O), Equipment/Inland Marine,
   Cyber Liability. It is NOT contractor/vendor insurance - that's the
   insuranceExpirationDate field on Team Roster, which tracks whether a
   contractor has their own liability coverage on file with us. Confirmed
   gap before building this: nothing in the Hub or QuickBooks tracked
   carrier/policy number/coverage/premium/renewal for Revital's own
   policies, and no policies are purchased yet - this starts as an
   empty shell with nothing to seed, ready to fill in the moment
   coverage is bound.
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
let docVersion = 0; // optimistic-concurrency guard, see persist() below

const EXPIRING_SOON_DAYS = 60;

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "businessInsurance");
}

// No policies purchased yet, so unlike Subscription Tracker's seedDefaults
// (real tool names pulled from ClickUp), this starts genuinely empty -
// there's nothing real to pre-fill.
function seedDefaults() {
  return [];
}

async function loadEntries() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      if (data && Array.isArray(data.list)) {
        entries = data.list;
        docVersion = data.version || 0;
      } else {
        entries = seedDefaults();
        docVersion = 0;
      }
      return;
    } catch (e) {
      console.error("Couldn't load business insurance list from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load the policy list: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('business-insurance-tracker-list');
    entries = saved ? JSON.parse(saved) : seedDefaults();
  } catch (e) { entries = seedDefaults(); }
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
      if (result.reason === 'error') console.error("Couldn't save business insurance list:", result.error);
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
  try { localStorage.setItem('business-insurance-tracker-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'ins-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function todayStr() {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

const FORM_FIELDS = ['coverageType', 'carrier', 'policyNumber', 'coverageAmount', 'annualPremium', 'effectiveDate', 'expirationDate', 'notes'];

function resetForm() {
  editingId = null;
  el('coverageType').value = 'General Liability';
  el('carrier').value = '';
  el('policyNumber').value = '';
  el('coverageAmount').value = '';
  el('annualPremium').value = '';
  el('effectiveDate').value = '';
  el('expirationDate').value = '';
  el('notes').value = '';
  el('saveEntryBtn').textContent = 'Add Policy';
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    if (id === 'coverageAmount' || id === 'annualPremium') {
      entry[id] = Math.max(0, parseFormattedNumber(field.value));
    } else {
      entry[id] = field.value.trim ? field.value.trim() : field.value;
    }
  });
  return entry;
}

function saveEntry() {
  const carrier = el('carrier').value.trim();
  if (!carrier) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Give this policy a carrier/insurer name first.');
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
    renderTable();
    if (window.parent.showBanner) window.parent.showBanner('success', `Saved ${carrier} policy.`);
  });
}

function startEdit(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  FORM_FIELDS.forEach(fieldId => {
    if (fieldId === 'coverageAmount' || fieldId === 'annualPremium') {
      setFormattedValue(el(fieldId), entry[fieldId] || '');
    } else {
      el(fieldId).value = entry[fieldId] || '';
    }
  });
  el('saveEntryBtn').textContent = 'Update Policy';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Remove the ${entry.coverageType || 'policy'} entry (${entry.carrier || 'no carrier'}) from the insurance tracker?`)) return;
  entries = entries.filter(e => e.id !== id);
  persist().then(ok => {
    if (!ok) return;
    if (editingId === id) resetForm();
    renderTable();
  });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date(todayStr() + 'T00:00:00');
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

// Status is auto-derived from the expiration date vs today, same
// renewal-aware spirit as Subscription Tracker's row-renewal-soon flag
// and Renewal Tracker's "Renewing Within 30/7 Days" stats - rather than
// a manual dropdown that can drift out of sync with the actual date.
// No expiration date on file yet (e.g. a policy just added before its
// dates are known) reads as Active rather than flagging a false alarm.
function deriveStatus(entry) {
  const days = daysUntil(entry.expirationDate);
  if (days === null) return 'Active';
  if (days < 0) return 'Expired';
  if (days <= EXPIRING_SOON_DAYS) return 'Pending Renewal';
  return 'Active';
}

function statusClassFor(status) {
  if (status === 'Expired') return 'status-expired';
  if (status === 'Pending Renewal') return 'status-pending';
  return 'status-active';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function updateSummary() {
  const withStatus = entries.map(e => ({ entry: e, status: deriveStatus(e) }));
  const active = withStatus.filter(x => x.status !== 'Expired');
  const totalAnnualPremium = active.reduce((sum, x) => sum + (parseFloat(x.entry.annualPremium) || 0), 0);
  const expiringSoon = withStatus.filter(x => x.status === 'Pending Renewal').length;

  el('summaryAnnualPremium').textContent = '$' + Math.round(totalAnnualPremium).toLocaleString();
  el('summaryActiveCount').textContent = active.length;
  el('summaryExpiringSoon').textContent = expiringSoon;
}

function renderTable() {
  updateSummary();

  const filter = (el('filterInput').value || '').trim().toLowerCase();

  const rows = entries.filter(e => {
    if (filter && !((e.coverageType || '').toLowerCase().includes(filter) || (e.carrier || '').toLowerCase().includes(filter))) return false;
    return true;
  });

  const tbody = el('logTableBody');
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  tbody.innerHTML = rows.map(e => {
    const status = deriveStatus(e);
    const rowClass = status === 'Expired' ? 'row-expired' : (status === 'Pending Renewal' ? 'row-renewal-soon' : '');
    return `<tr class="${rowClass}">
      <td class="client-cell">${escapeHtml(e.coverageType)}</td>
      <td>${escapeHtml(e.carrier) || '—'}</td>
      <td>${escapeHtml(e.policyNumber) || '—'}</td>
      <td>$${Math.round(parseFloat(e.coverageAmount) || 0).toLocaleString()}</td>
      <td>$${Math.round(parseFloat(e.annualPremium) || 0).toLocaleString()}</td>
      <td class="date-cell">${e.effectiveDate ? escapeHtml(e.effectiveDate) : '—'}</td>
      <td class="date-cell">${e.expirationDate ? escapeHtml(e.expirationDate) : '—'}</td>
      <td><span class="section-tag ${statusClassFor(status)}">${status}</span></td>
      <td>${escapeHtml(e.notes) || '—'}</td>
      <td>
        <div class="row-actions">
          <button class="edit-btn" data-id="${e.id}">Edit</button>
          <button class="remove-btn" data-id="${e.id}">Remove</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => startEdit(btn.getAttribute('data-id'))));
  tbody.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => removeEntry(btn.getAttribute('data-id'))));
}

// Same admin/leadership-only whole-page gate as Subscription Tracker/
// Service Pricing Admin: only accounts with no entry in agency/teamAccess
// (full, unrestricted access) may open this tool at all - not just edit
// within it, since policy numbers/coverage/premium are financial info
// nobody else should be able to see.
function initAccessGate() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot) {
    return; // not embedded - nothing to gate, matches other standalone tools
  }
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamAccess");
  window.parent.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap && docSnap.exists ? docSnap.data() : null;
    const users = (data && data.users) ? data.users : {};
    const currentEmail = (window.parent.currentAdminEmail || "").toLowerCase();
    const isRestricted = currentEmail && Object.prototype.hasOwnProperty.call(users, currentEmail);

    el('trackerContent').style.display = isRestricted ? 'none' : '';
    el('notAuthorizedState').style.display = isRestricted ? '' : 'none';
  }, (err) => {
    console.error("Access gate listener error:", err);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initAccessGate();
  resetForm();
  await loadEntries();
  renderTable();

  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('filterInput').addEventListener('input', renderTable);
  if (typeof attachCommaFormatting === 'function') {
    attachCommaFormatting(el('coverageAmount'));
    attachCommaFormatting(el('annualPremium'));
  }
  if (typeof attachSpinnerButtons === 'function') {
    attachSpinnerButtons(el('coverageAmount'), { step: 1 });
    attachSpinnerButtons(el('annualPremium'), { step: 1 });
  }
});
