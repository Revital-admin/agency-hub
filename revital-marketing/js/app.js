/* ============================================================
   REVITAL MARKETING — APP LOGIC
   (agency-wide: not tied to a client, stores its own doc at
   agency/ownMarketing). Two independent pieces sharing one doc:
     - contentItems: a plan/track calendar for Revital's OWN social
       and content posts. Doesn't publish anything anywhere - pair
       with an actual scheduler (Buffer/Later/etc.) for that. Same
       "plan vs. actual" distinction Content Calendar draws for
       client work, just scoped to Revital's own brand instead of a
       client (see that tool's own header comment for why reusing it
       directly would mean faking a "Revital Productions" client
       entry and leaking it into every client-scoped tool in the Hub).
     - checklistChecked/checklistNotes/checklistLastReset: a periodic
       SEO/social health checklist (see js/data.js), reset each review
       cycle rather than logged per-run - kept intentionally lighter
       than QC Checklist's full history log, since this is reviewed by
       whoever owns marketing, not audited per-deliverable.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const PLATFORM_OPTIONS = ['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'YouTube', 'Website / Blog', 'Other'];

let contentItems = [];
let checklistChecked = {};
let checklistNotes = '';
let checklistLastReset = null;
let docVersion = 0; // optimistic-concurrency guard, see persist() below

function el(id) { return document.getElementById(id); }
function uid() { return 'mk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function getDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "ownMarketing");
}

async function loadData() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      contentItems = (data && data.contentItems) || [];
      checklistChecked = (data && data.checklistChecked) || {};
      checklistNotes = (data && data.checklistNotes) || '';
      checklistLastReset = (data && data.checklistLastReset) || null;
      docVersion = (data && data.version) || 0;
      return;
    } catch (e) {
      console.error("Couldn't load Revital Marketing data from the cloud:", e);
      if (window.parent.showBanner) window.parent.showBanner('error', "Couldn't load: " + e.message);
      contentItems = [];
      checklistChecked = {};
      return;
    }
  }
  try {
    const saved = localStorage.getItem('revital-marketing-data');
    const data = saved ? JSON.parse(saved) : null;
    contentItems = (data && data.contentItems) || [];
    checklistChecked = (data && data.checklistChecked) || {};
    checklistNotes = (data && data.checklistNotes) || '';
    checklistLastReset = (data && data.checklistLastReset) || null;
  } catch (e) { contentItems = []; checklistChecked = {}; }
}

function currentState() {
  return {
    contentItems,
    checklistChecked,
    checklistNotes: el('checklistNotes') ? el('checklistNotes').value : checklistNotes,
    checklistLastReset
  };
}

// Optimistic-concurrency guard - same reasoning as every other agency-wide
// flat-doc tool (Access & Login Log, Ad Account Log, Team Transitions).
async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => Object.assign({ version: v }, currentState()),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save Revital Marketing data:", result.error);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', result.reason === 'conflict'
          ? "Someone else updated this while you had it open. Reload the page to see their changes, then redo your edit."
          : "Couldn't save — your change may be lost: " + result.error.message);
      }
      return false;
    }
    docVersion = result.version;
    return true;
  }
  try { localStorage.setItem('revital-marketing-data', JSON.stringify(currentState())); } catch (e) {}
  return true;
}

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
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function populatePlatformSelect() {
  el('mkPlatform').innerHTML = PLATFORM_OPTIONS.map(p => `<option value="${p}">${p}</option>`).join('');
}

// ── Content Calendar ──
function getUrgency(item) {
  if (item.status === 'Posted') return 'closed';
  const daysUntil = daysBetween(todayStr(), item.postDate);
  if (daysUntil < 0) return 'red';
  if (daysUntil <= 7) return 'yellow';
  return 'green';
}

function statusBadge(item) {
  if (item.status === 'Posted') return '<span class="posted-badge">Posted</span>';
  const daysUntil = daysBetween(todayStr(), item.postDate);
  if (daysUntil < 0) return `<span class="overdue-badge">${Math.abs(daysUntil)}d overdue</span>`;
  if (daysUntil === 0) return '<span class="scheduled-badge">Today</span>';
  return `<span class="scheduled-badge">${daysUntil}d</span>`;
}

function renderSummary() {
  const unposted = contentItems.filter(i => i.status !== 'Posted');
  const overdue = unposted.filter(i => daysBetween(todayStr(), i.postDate) < 0);
  const thisWeek = unposted.filter(i => {
    const d = daysBetween(todayStr(), i.postDate);
    return d >= 0 && d <= 7;
  });
  el('summaryOverdue').textContent = overdue.length;
  el('summaryThisWeek').textContent = thisWeek.length;
  el('summaryScheduled').textContent = unposted.length;
}

function renderContentTable() {
  renderSummary();

  const showPosted = el('showPostedToggle').checked;
  const filterText = el('filterTextInput').value.trim().toLowerCase();

  const rows = contentItems
    .filter(i => showPosted || i.status !== 'Posted')
    .filter(i => !filterText || (i.title || '').toLowerCase().includes(filterText) || (i.platform || '').toLowerCase().includes(filterText))
    .sort((a, b) => (a.postDate || '9999').localeCompare(b.postDate || '9999'));

  const tbody = el('calendarTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(item => {
    const urgency = getUrgency(item);
    const isOpen = item.status !== 'Posted';
    const tr = document.createElement('tr');
    tr.className = 'urgency-' + urgency;
    tr.innerHTML = `
      <td>${escapeHtml(item.title || '')}</td>
      <td>${escapeHtml(item.platform || 'Other')}</td>
      <td class="date-cell">${item.postDate || '--'}</td>
      <td>${statusBadge(item)}</td>
      <td class="link-cell">${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">Open ↗</a>` : '—'}</td>
      <td><input type="text" class="notes-input" data-id="${item.id}" value="${(item.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="posted-btn" data-id="${item.id}" ${!isOpen ? 'disabled' : ''}>Mark Posted</button>
          <button class="delete-item-btn" data-id="${item.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.notes-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const item = contentItems.find(i => i.id === inp.getAttribute('data-id'));
      if (!item) return;
      item.notes = inp.value;
      persist();
    });
  });
  document.querySelectorAll('.posted-btn').forEach(btn => {
    btn.addEventListener('click', () => markPosted(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.delete-item-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.getAttribute('data-id')));
  });
}

function markPosted(id) {
  const item = contentItems.find(i => i.id === id);
  if (!item) return;
  item.status = 'Posted';
  item.postedDate = todayStr();
  persist().then(ok => {
    if (!ok) return;
    renderContentTable();
    if (window.parent.showBanner) window.parent.showBanner('success', `Marked "${item.title}" as posted.`);
  });
}

function deleteItem(id) {
  const item = contentItems.find(i => i.id === id);
  if (!item) return;
  if (!confirm(`Delete "${item.title}"? This can't be undone.`)) return;
  contentItems = contentItems.filter(i => i.id !== id);
  persist().then(ok => { if (ok) renderContentTable(); });
}

function addContentItem() {
  const titleInput = el('mkTitle');
  const dateInput = el('mkPostDate');
  const title = titleInput.value.trim();

  if (!title) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Give this item a title first.');
    return;
  }
  if (!dateInput.value) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'Set a post date first.');
    return;
  }

  contentItems.push({
    id: uid(),
    title,
    platform: el('mkPlatform').value,
    postDate: dateInput.value,
    link: el('mkLink').value.trim(),
    notes: el('mkNotes').value.trim(),
    status: 'Scheduled',
    createdDate: todayStr()
  });

  persist().then(ok => {
    if (!ok) return;
    titleInput.value = '';
    dateInput.value = '';
    el('mkLink').value = '';
    el('mkNotes').value = '';
    el('mkPlatform').value = PLATFORM_OPTIONS[0];
    renderContentTable();
    if (window.parent.showBanner) window.parent.showBanner('success', `Scheduled "${title}".`);
  });
}

// ── SEO / Social Health Checklist ──
function getChecklistStats() {
  let total = 0, done = 0;
  MARKETING_CHECKLIST.forEach(cat => cat.items.forEach(item => {
    total++;
    if (checklistChecked[item.id]) done++;
  }));
  return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

function renderChecklist() {
  const { total, done, pct } = getChecklistStats();
  el('checklistProgressFill').style.width = pct + '%';
  el('checklistProgressText').textContent = `${done} of ${total} items complete`;
  el('checklistProgressPct').textContent = pct + '%';

  el('lastResetLabel').textContent = checklistLastReset ? `Cycle started ${new Date(checklistLastReset).toLocaleDateString()}` : '';

  el('checklistCategoriesList').innerHTML = MARKETING_CHECKLIST.map(cat => {
    const catDone = cat.items.filter(i => checklistChecked[i.id]).length;
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
                <input type="checkbox" class="marketing-check" data-id="${item.id}" ${checklistChecked[item.id] ? 'checked' : ''}>
                <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <span>${item.label}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.marketing-check').forEach(cb => {
    cb.addEventListener('change', () => {
      checklistChecked[cb.getAttribute('data-id')] = cb.checked;
      persist().then(ok => { if (ok) renderChecklist(); });
    });
  });
}

function resetChecklist() {
  if (!confirm('Start a new review cycle? This clears every checked item (notes are kept).')) return;
  checklistChecked = {};
  checklistLastReset = new Date().toISOString();
  persist().then(ok => {
    if (!ok) return;
    renderChecklist();
    if (window.parent.logAdminActivity) window.parent.logAdminActivity('Revital Marketing checklist reset', 'New review cycle started');
    if (window.parent.showBanner) window.parent.showBanner('success', 'Started a new review cycle.');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  populatePlatformSelect();
  await loadData();

  el('checklistNotes').value = checklistNotes;
  renderContentTable();
  renderChecklist();

  el('addContentBtn').addEventListener('click', addContentItem);
  el('showPostedToggle').addEventListener('change', renderContentTable);
  el('filterTextInput').addEventListener('input', renderContentTable);
  el('resetChecklistBtn').addEventListener('click', resetChecklist);
  el('checklistNotes').addEventListener('change', () => persist());
});
