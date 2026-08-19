/* ============================================================
   TEAM ONBOARDING & OFFBOARDING — APP LOGIC
   (agency-wide: not tied to a single client, stores its own list
   at agency/teamTransitions rather than living inside clientsDb).
   One entry per new hire or departing teammate, each holding its own
   checklist (from TRANSITION_CHECKLISTS in js/data.js) so nothing
   about accounts, tools, or client handoffs gets missed just because
   it's not Ronald personally walking someone in or out.
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
let expandedId = null;
let docVersion = 0; // optimistic-concurrency guard, see persist() below
let teamRosterMembers = [];
let amCapacitySnapshot = {};

function el(id) { return document.getElementById(id); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamTransitions");
}

async function loadEntries() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      entries = (data && data.list) || [];
      docVersion = (data && data.version) || 0;
      return;
    } catch (e) {
      console.error("Couldn't load team transitions from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load team transitions: " + e.message);
      entries = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('team-transitions-list');
    entries = saved ? JSON.parse(saved) : [];
  } catch (e) { entries = []; }
}

// Optimistic-concurrency guard - same reasoning as Access & Login Log and
// Ad Account Log, since this also saves by overwriting the whole doc.
async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: entries, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save team transitions:", result.error);
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
  try { localStorage.setItem('team-transitions-list', JSON.stringify(entries)); } catch (e) {}
  return true;
}

function uid() { return 'tt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

async function loadTeamRoster() {
  if (!isEmbedded || typeof window.parent.getTeamRosterMembers !== 'function') {
    teamRosterMembers = [];
    return;
  }
  try {
    teamRosterMembers = await window.parent.getTeamRosterMembers() || [];
  } catch (e) {
    teamRosterMembers = [];
  }
  populateRosterDatalist();
}

function populateRosterDatalist() {
  const list = el('teamRosterOptions');
  if (!list) return;
  list.innerHTML = teamRosterMembers
    .filter(m => m.memberName)
    .slice()
    .sort((a, b) => (a.memberName || '').localeCompare(b.memberName || ''))
    .map(m => `<option value="${(m.memberName || '').replace(/"/g, '&quot;')}">`)
    .join('');
}

function findRosterMemberByName(name) {
  const n = (name || '').trim().toLowerCase();
  if (!n) return null;
  return teamRosterMembers.find(m => (m.memberName || '').trim().toLowerCase() === n) || null;
}

async function refreshAmCapacitySnapshot() {
  try {
    if (window.parent.getAccountManagerCapacitySnapshot) {
      amCapacitySnapshot = await window.parent.getAccountManagerCapacitySnapshot();
    }
  } catch (e) {
    amCapacitySnapshot = {};
  }
}

const TOP_FIELDS = ['type', 'employeeName', 'role', 'email', 'employmentType', 'dateValue', 'manager', 'notes'];

function updateDateLabel() {
  el('dateValueLabel').textContent = el('type').value === 'offboarding' ? 'Last Day' : 'Start Date';
}

function resetForm() {
  editingId = null;
  TOP_FIELDS.forEach(id => {
    const field = el(id);
    if (field.tagName === 'SELECT') field.value = field.options[0].value;
    else field.value = '';
  });
  updateDateLabel();
  el('saveEntryBtn').textContent = 'Add Entry';
}

function saveEntry() {
  const employeeName = el('employeeName').value.trim();
  if (!employeeName) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Employee name is required.');
    return;
  }

  const type = el('type').value;

  // Snapshot before mutating so a failed persist() can be undone below.
  // The edit branch updates fields on the existing entry object in place
  // (rather than replacing it), so we snapshot its old field values; the
  // new-entry branch snapshots the list itself since unshift mutates in place.
  let previousFields = null;
  let previousList = null;

  if (editingId) {
    const entry = entries.find(e => e.id === editingId);
    if (entry) {
      previousFields = {};
      TOP_FIELDS.forEach(id => { previousFields[id] = entry[id]; });
      TOP_FIELDS.forEach(id => { entry[id] = el(id).value.trim ? el(id).value.trim() : el(id).value; });
    }
  } else {
    previousList = entries.slice();
    const entry = { id: uid(), checked: {}, notes: '', createdDate: new Date().toISOString(), completedAt: null };
    TOP_FIELDS.forEach(id => { entry[id] = el(id).value.trim ? el(id).value.trim() : el(id).value; });
    entries.unshift(entry);
  }

  persist().then(ok => {
    if (!ok) {
      // Roll back whichever mutation happened above so the failed save
      // doesn't linger in memory as if it stuck.
      if (previousFields) {
        const entry = entries.find(e => e.id === editingId);
        if (entry) Object.assign(entry, previousFields);
      } else if (previousList) {
        entries = previousList;
      }
      return;
    }
    resetForm();
    renderTable();
    if (window.parent.showBanner) window.parent.showBanner('success', `Saved ${type} entry for ${employeeName}.`);
  });
}

function startEdit(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  TOP_FIELDS.forEach(fieldId => { el(fieldId).value = entry[fieldId] || ''; });
  updateDateLabel();
  el('saveEntryBtn').textContent = 'Update Entry';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Remove the ${entry.type} entry for ${entry.employeeName}?`)) return;
  const previous = entries;
  entries = entries.filter(e => e.id !== id);
  if (expandedId === id) { expandedId = null; el('detailPanel').style.display = 'none'; }
  persist().then(ok => {
    if (!ok) {
      entries = previous; // roll back on a failed write
      return;
    }
    if (editingId === id) resetForm();
    renderTable();
  });
}

function getStats(entry) {
  const categories = TRANSITION_CHECKLISTS[entry.type] || [];
  let total = 0, done = 0;
  categories.forEach(cat => cat.items.forEach(item => {
    total++;
    if (entry.checked && entry.checked[item.id]) done++;
  }));
  return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

// Runs exactly once, the moment an entry's checklist first hits 100% -
// guarded by completedAt the same way Client Offboarding Checklist guards
// its own one-shot completion, so re-rendering or toggling an item back
// off-and-on doesn't re-fire it.
function markCompleteIfDone(entry) {
  const { total, done, pct } = getStats(entry);
  if (total > 0 && pct === 100 && !entry.completedAt) {
    entry.completedAt = new Date().toISOString();
    if (window.parent.logAdminActivity) window.parent.logAdminActivity(`Team ${entry.type} completed`, entry.employeeName);
    if (window.parent.pushAdminNotification) {
      window.parent.pushAdminNotification(
        entry.type === 'offboarding' ? 'team_offboarding_complete' : 'team_onboarding_complete',
        `${entry.employeeName}'s ${entry.type} checklist is complete.`,
        null
      );
    }
    return true;
  }
  return false;
}

function renderTable() {
  const tbody = el('logTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = entries.length === 0 ? 'block' : 'none';

  entries.forEach(entry => {
    const { total, done, pct } = getStats(entry);
    const status = entry.completedAt ? 'Complete' : (done > 0 ? 'In Progress' : 'Not Started');
    const statusClass = entry.completedAt ? 'status-active' : (done > 0 ? 'status-flagged' : 'status-removed');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="client-cell">${entry.employeeName}</td>
      <td>${entry.type === 'offboarding' ? 'Offboarding' : 'Onboarding'}</td>
      <td>${entry.role || '--'}</td>
      <td>${entry.dateValue || '--'}</td>
      <td>${done}/${total} (${pct}%)</td>
      <td><span class="section-tag ${statusClass}">${status}</span></td>
      <td>
        <div class="row-actions">
          <button class="open-btn" data-id="${entry.id}">Open Checklist</button>
          <button class="edit-btn" data-id="${entry.id}">Edit</button>
          <button class="remove-btn" data-id="${entry.id}">Remove</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.open-btn').forEach(btn => btn.addEventListener('click', () => openDetail(btn.getAttribute('data-id'))));
  document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => startEdit(btn.getAttribute('data-id'))));
  document.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => removeEntry(btn.getAttribute('data-id'))));
}

function renderAmClientsWarning(entry) {
  const warningEl = el('amClientsWarning');
  if (entry.type !== 'offboarding' || !entry.email) {
    warningEl.style.display = 'none';
    return;
  }
  const rec = amCapacitySnapshot[entry.email.trim().toLowerCase()];
  if (!rec || !rec.clientNames || rec.clientNames.length === 0) {
    warningEl.style.display = 'none';
    return;
  }
  warningEl.style.display = 'block';
  warningEl.textContent = `Heads up: ${entry.employeeName} is still the account manager on file for ${rec.clientNames.length} client${rec.clientNames.length === 1 ? '' : 's'} (${rec.clientNames.join(', ')}). Reassign them in Client Portal Manager before finishing this checklist.`;
}

function renderDetail() {
  const entry = entries.find(e => e.id === expandedId);
  const panel = el('detailPanel');
  if (!entry) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  el('detailNameLabel').textContent = `${entry.employeeName} — ${entry.type === 'offboarding' ? 'Offboarding' : 'Onboarding'}`;

  const { total, done, pct } = getStats(entry);
  el('detailProgressFill').style.width = pct + '%';
  el('detailProgressText').textContent = `${done} of ${total} items complete`;
  el('detailProgressPct').textContent = pct + '%';

  renderAmClientsWarning(entry);

  const completedNote = el('completedNote');
  if (entry.completedAt) {
    completedNote.style.display = 'block';
    completedNote.innerHTML = `<div class="section-tag status-active" style="padding:6px 12px;">Completed ${new Date(entry.completedAt).toLocaleDateString()}</div>`;
  } else {
    completedNote.style.display = 'none';
    completedNote.innerHTML = '';
  }

  const categories = TRANSITION_CHECKLISTS[entry.type] || [];
  el('detailCategoriesList').innerHTML = categories.map(cat => {
    const catDone = cat.items.filter(i => entry.checked[i.id]).length;
    return `
      <div class="step-card">
        <div class="category-header">
          <h3>${cat.category}</h3>
          <span class="category-progress">${catDone}/${cat.items.length}</span>
        </div>
        <div class="section-checkbox-grid vertical">
          ${cat.items.map(item => `
            <label class="checkbox-item">
              <div class="custom-checkbox">
                <input type="checkbox" class="transition-check" data-id="${item.id}" ${entry.checked[item.id] ? 'checked' : ''}>
                <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <span>${item.label}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.transition-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const itemId = cb.getAttribute('data-id');
      const previousChecked = entry.checked[itemId]; // for rollback if persist() fails
      entry.checked[itemId] = cb.checked;
      const justCompleted = markCompleteIfDone(entry);
      persist().then(ok => {
        if (!ok) {
          // Roll back the checklist toggle so it doesn't silently render as
          // checked next time anything re-renders. (A completion notification
          // that already fired above can't be un-sent, but the checklist
          // state itself shouldn't drift from what's actually saved.)
          entry.checked[itemId] = previousChecked;
          cb.checked = previousChecked;
          return;
        }
        renderDetail();
        renderTable();
        if (justCompleted && window.parent.showBanner) {
          window.parent.showBanner('success', `${entry.employeeName}'s ${entry.type} checklist is complete.`);
        }
      });
    });
  });
}

function openDetail(id) {
  expandedId = id;
  renderDetail();
  el('detailPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.addEventListener('DOMContentLoaded', async () => {
  resetForm();
  await loadEntries();
  renderTable();
  loadTeamRoster();
  refreshAmCapacitySnapshot();

  el('type').addEventListener('change', updateDateLabel);
  el('employeeName').addEventListener('change', () => {
    const member = findRosterMemberByName(el('employeeName').value);
    if (member) {
      if (member.email && !el('email').value) el('email').value = member.email;
      if (member.role && !el('role').value) el('role').value = member.role;
    }
  });
  el('saveEntryBtn').addEventListener('click', saveEntry);
  el('closeDetailBtn').addEventListener('click', () => {
    expandedId = null;
    el('detailPanel').style.display = 'none';
  });
});
