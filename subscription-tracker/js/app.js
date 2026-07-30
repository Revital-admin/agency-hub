/* ============================================================
   SUBSCRIPTION & TOOL COST TRACKER — APP LOGIC
   Agency-wide (not tied to a single client): stores its own list at
   agency/subscriptionTracker, same optimistic-concurrency version-guard
   pattern as Change Order Generator and the other full-overwrite
   trackers. Admin/leadership only - not just edit-gated like the SOP
   Wiki/Email Template Library, but gated for the whole page like
   Service Pricing Admin, since subscription costs are financial info.
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
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "subscriptionTracker");
}

// Starter list seeded from the tools actually found sitting in ClickUp's
// Software Subscriptions list (all stuck in "backlog" status with no
// cost/renewal tracked) - real tool names, $0 placeholders for cost/
// renewal since those weren't populated anywhere yet.
function seedDefaults() {
  const today = todayStr();
  return [
    { id: uid(), toolName: "ClickUp", category: "Project Management", monthlyCost: 0, billingCycle: "Monthly", renewalDate: "", owner: "", status: "Active", notes: "" },
    { id: uid(), toolName: "Zapier", category: "Automation", monthlyCost: 0, billingCycle: "Monthly", renewalDate: "", owner: "", status: "Active", notes: "" },
    { id: uid(), toolName: "Jotform", category: "Forms", monthlyCost: 0, billingCycle: "Monthly", renewalDate: "", owner: "", status: "Active", notes: "" },
    { id: uid(), toolName: "GoDaddy Domain", category: "Domain / Hosting", monthlyCost: 0, billingCycle: "Annual", renewalDate: "", owner: "", status: "Active", notes: "" },
    { id: uid(), toolName: "Framer", category: "Design", monthlyCost: 0, billingCycle: "Monthly", renewalDate: "", owner: "", status: "Active", notes: "" },
    { id: uid(), toolName: "Google Workspace", category: "Productivity", monthlyCost: 0, billingCycle: "Monthly", renewalDate: "", owner: "", status: "Active", notes: "" }
  ];
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
        // First time this doc has ever been opened - seed it with the real
        // tools found in ClickUp so there's something to fill in numbers
        // for, instead of a totally blank list.
        entries = seedDefaults();
        docVersion = 0;
      }
      return;
    } catch (e) {
      console.error("Couldn't load subscription tracker from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load the subscription list: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('subscription-tracker-list');
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
      if (result.reason === 'error') console.error("Couldn't save subscription list:", result.error);
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
  try { localStorage.setItem('subscription-tracker-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'sub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function todayStr() {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

const FORM_FIELDS = ['toolName', 'category', 'monthlyCost', 'billingCycle', 'renewalDate', 'owner', 'status', 'notes'];

function resetForm() {
  editingId = null;
  el('toolName').value = '';
  el('category').value = 'Project Management';
  el('monthlyCost').value = '';
  el('billingCycle').value = 'Monthly';
  el('renewalDate').value = '';
  el('owner').value = '';
  el('status').value = 'Active';
  el('notes').value = '';
  el('saveEntryBtn').textContent = 'Add Subscription';
}

function gatherForm() {
  const entry = { id: editingId || uid() };
  FORM_FIELDS.forEach(id => {
    const field = el(id);
    if (id === 'monthlyCost') {
      entry[id] = Math.max(0, parseFloat(field.value) || 0);
    } else {
      entry[id] = field.value.trim ? field.value.trim() : field.value;
    }
  });
  return entry;
}

function saveEntry() {
  const toolName = el('toolName').value.trim();
  if (!toolName) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Give this subscription a tool/vendor name first.');
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
    if (window.parent.showBanner) window.parent.showBanner('success', `Saved ${toolName}.`);
  });
}

function startEdit(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  FORM_FIELDS.forEach(fieldId => { el(fieldId).value = entry[fieldId] || ''; });
  el('saveEntryBtn').textContent = 'Update Subscription';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Remove ${entry.toolName} from the subscription tracker?`)) return;
  entries = entries.filter(e => e.id !== id);
  persist().then(ok => {
    if (!ok) return;
    if (editingId === id) resetForm();
    renderTable();
  });
}

function monthlyEquivalent(entry) {
  const cost = parseFloat(entry.monthlyCost) || 0;
  return entry.billingCycle === 'Annual' ? cost / 12 : cost;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date(todayStr() + 'T00:00:00');
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function updateSummary() {
  const active = entries.filter(e => e.status !== 'Cancelled');
  const totalMonthly = active.reduce((sum, e) => sum + monthlyEquivalent(e), 0);
  const renewingSoon = active.filter(e => {
    const days = daysUntil(e.renewalDate);
    return days !== null && days >= 0 && days <= 30;
  }).length;

  el('summaryMonthlyCost').textContent = '$' + Math.round(totalMonthly).toLocaleString();
  el('summaryAnnualCost').textContent = '$' + Math.round(totalMonthly * 12).toLocaleString();
  el('summaryActiveCount').textContent = active.length;
  el('summaryRenewingSoon').textContent = renewingSoon;
}

function renderTable() {
  updateSummary();

  const filter = (el('filterInput').value || '').trim().toLowerCase();
  const showCancelled = el('showCancelledToggle').checked;

  const rows = entries.filter(e => {
    if (!showCancelled && e.status === 'Cancelled') return false;
    if (filter && !((e.toolName || '').toLowerCase().includes(filter) || (e.category || '').toLowerCase().includes(filter))) return false;
    return true;
  });

  const tbody = el('logTableBody');
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  tbody.innerHTML = rows.map(e => {
    const days = daysUntil(e.renewalDate);
    const renewalSoon = days !== null && days >= 0 && days <= 30;
    const statusClass = e.status === 'Cancelled' ? 'status-cancelled' : 'status-active';
    return `<tr class="${renewalSoon ? 'row-renewal-soon' : ''}">
      <td class="client-cell">${escapeHtml(e.toolName)}</td>
      <td>${escapeHtml(e.category)}</td>
      <td>$${Math.round(parseFloat(e.monthlyCost) || 0).toLocaleString()}</td>
      <td>${escapeHtml(e.billingCycle)}</td>
      <td class="date-cell">${e.renewalDate ? escapeHtml(e.renewalDate) : '—'}</td>
      <td>${escapeHtml(e.owner) || '—'}</td>
      <td><span class="section-tag ${statusClass}">${escapeHtml(e.status)}</span></td>
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

// Same admin/leadership-only whole-page gate as Service Pricing Admin:
// only accounts with no entry in agency/teamAccess (full, unrestricted
// access) may open this tool at all - not just edit within it, since
// subscription costs are financial info nobody else should be able to see.
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
  el('renewalDate').value = '';
  await loadEntries();
  renderTable();

  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('filterInput').addEventListener('input', renderTable);
  el('showCancelledToggle').addEventListener('change', renderTable);
});
