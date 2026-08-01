/* ============================================================
   BUSINESS EXPENSE TRACKER — APP LOGIC
   Agency-wide (not tied to a single client): stores its own list at
   agency/expenseTracker, same optimistic-concurrency version-guard
   pattern as Subscription Tracker and the other full-overwrite
   trackers. Admin/leadership only - gated for the whole page like
   Subscription Tracker, since expense data is financial info.

   Deliberately does NOT cover recurring SaaS/tool costs - those stay in
   Subscription Tracker so there's exactly one place each kind of cost
   lives, rather than two trackers arguing about which one is current.
   This tool is for everything else: contractor payouts, equipment,
   travel, insurance, and other one-off or recurring business costs.
   Cash Flow Snapshot reads both this doc and agency/subscriptionTracker
   to build a combined revenue-vs-cost picture.
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

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "expenseTracker");
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
        entries = [];
        docVersion = 0;
      }
      return;
    } catch (e) {
      console.error("Couldn't load expense tracker from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load the expense list: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('expense-tracker-list');
    entries = saved ? JSON.parse(saved) : [];
  } catch (e) { entries = []; }
}

// Optimistic-concurrency guard, same pattern as Subscription Tracker.
async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: entries, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save expense list:", result.error);
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
  try { localStorage.setItem('expense-tracker-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'exp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function todayStr() {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

function updateFrequencyVisibility() {
  const group = el('frequencyGroup');
  if (group) group.style.display = el('recurring').checked ? '' : 'none';
}

const FORM_FIELDS = ['expenseDate', 'category', 'payee', 'amount', 'description', 'notes'];

function resetForm() {
  editingId = null;
  el('expenseDate').value = todayStr();
  el('category').value = 'Contractor Payouts';
  el('payee').value = '';
  el('amount').value = '';
  el('recurring').checked = false;
  el('frequency').value = 'Monthly';
  el('description').value = '';
  el('notes').value = '';
  el('saveEntryBtn').textContent = 'Add Expense';
  updateFrequencyVisibility();
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    if (id === 'amount') {
      entry[id] = Math.max(0, parseFloat(field.value) || 0);
    } else {
      entry[id] = field.value.trim ? field.value.trim() : field.value;
    }
  });
  entry.recurring = el('recurring').checked;
  entry.frequency = entry.recurring ? el('frequency').value : '';
  return entry;
}

function saveEntry() {
  const payee = el('payee').value.trim();
  const amount = parseFloat(el('amount').value) || 0;
  if (!payee) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Enter a payee/vendor for this expense first.');
    return;
  }
  if (!amount) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Enter an amount for this expense first.');
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
    if (window.parent.showBanner) window.parent.showBanner('success', `Saved expense: ${payee}.`);
  });
}

function startEdit(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  FORM_FIELDS.forEach(fieldId => { el(fieldId).value = entry[fieldId] || ''; });
  el('recurring').checked = !!entry.recurring;
  el('frequency').value = entry.frequency || 'Monthly';
  updateFrequencyVisibility();
  el('saveEntryBtn').textContent = 'Update Expense';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Remove this ${entry.payee} expense from the tracker?`)) return;
  entries = entries.filter(e => e.id !== id);
  persist().then(ok => {
    if (!ok) return;
    if (editingId === id) resetForm();
    renderTable();
  });
}

// Normalizes any recurring expense down to a monthly-equivalent figure,
// same idea as Subscription Tracker's monthlyEquivalent() - lets
// Quarterly/Annually entries roll into one comparable "recurring monthly
// commitment" number instead of only ever being counted the month they
// happen to land in.
function monthlyEquivalent(entry) {
  if (!entry.recurring) return 0;
  const amount = parseFloat(entry.amount) || 0;
  if (entry.frequency === 'Quarterly') return amount / 3;
  if (entry.frequency === 'Annually') return amount / 12;
  return amount; // Monthly (default)
}

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isThisYear(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === new Date().getFullYear();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatCurrency(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function updateSummary() {
  const monthTotal = entries.filter(e => isThisMonth(e.expenseDate)).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const yearTotal = entries.filter(e => isThisYear(e.expenseDate)).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const recurringMonthly = entries.reduce((sum, e) => sum + monthlyEquivalent(e), 0);

  el('summaryMonthTotal').textContent = formatCurrency(monthTotal);
  el('summaryYearTotal').textContent = formatCurrency(yearTotal);
  el('summaryRecurringMonthly').textContent = formatCurrency(recurringMonthly);
  el('summaryEntryCount').textContent = entries.length;
}

function renderTable() {
  updateSummary();

  const filter = (el('filterInput').value || '').trim().toLowerCase();
  const categoryFilter = el('categoryFilter').value;

  const rows = entries.filter(e => {
    if (categoryFilter && e.category !== categoryFilter) return false;
    if (filter) {
      const haystack = ((e.payee || '') + ' ' + (e.category || '') + ' ' + (e.description || '')).toLowerCase();
      if (!haystack.includes(filter)) return false;
    }
    return true;
  }).sort((a, b) => (b.expenseDate || '').localeCompare(a.expenseDate || ''));

  const tbody = el('logTableBody');
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  tbody.innerHTML = rows.map(e => {
    const recurringLabel = e.recurring ? `${escapeHtml(e.frequency || 'Monthly')}` : 'One-off';
    const recurringClass = e.recurring ? 'status-active' : '';
    return `<tr>
      <td class="date-cell">${escapeHtml(e.expenseDate) || '—'}</td>
      <td>${escapeHtml(e.category)}</td>
      <td class="client-cell">${escapeHtml(e.payee)}</td>
      <td>${escapeHtml(e.description) || '—'}</td>
      <td>${formatCurrency(parseFloat(e.amount) || 0)}</td>
      <td><span class="section-tag ${recurringClass}">${recurringLabel}</span></td>
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

// Same admin/leadership-only whole-page gate as Subscription Tracker:
// only accounts with no entry in agency/teamAccess (full, unrestricted
// access) may open this tool at all, since expense data is financial
// info nobody else should be able to see.
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
  el('categoryFilter').addEventListener('change', renderTable);
  el('recurring').addEventListener('change', updateFrequencyVisibility);
});
