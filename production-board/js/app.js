/* ============================================================
   PRODUCTION BOARD — APP LOGIC
   Two view modes: "By Client" (own independent client-select dropdown,
   same pattern as Mood Board Builder) and "All Clients" (flattened
   cross-client view, same {clientName, item} row pattern Content
   Calendar/Email Campaign Tracker/SEO Rank Tracker use for their own
   cross-client lists - data-client attributes on every action button so
   the right client object gets mutated regardless of which view is
   showing). Items land here via Mood Board Builder's "Move to Production
   Board" button, which writes directly to clients[name].productionBoard
   and removes the source board from clients[name].moodBoards.

   Sits between Mood Board Builder (the idea) and QC Checklist/Client
   Portal Manager Content Approvals (the finished piece going out) - this
   is just a place for an idea to live while it's actively being built
   instead of disappearing into a ClickUp task with no trace back to the
   mood board it came from. Marking an item complete (individually or in
   bulk) queues a lightweight pointer into client.qcQueue, which QC
   Checklist's own "Awaiting QC" section reads (see renderQcQueue in
   qc-checklist/js/app.js) - that's the only auto-sync that exists; Client
   Portal Manager's Content Approvals still isn't touched by this tool.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.getAllClients === 'function') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const SANDBOX_NAME = "Quick Sandbox (One-Offs)";

function el(id) { return document.getElementById(id); }

function getClients() {
  if (isEmbedded) {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  return {};
}

function getClientByName(name) {
  const clients = getClients();
  return clients[name] || null;
}

function persist() {
  if (isEmbedded) window.parent.saveDatabase();
}

// Same reverse-lookup convenience as Mood Board Builder - just picks a
// sensible first default for this tool's own independent dropdown, no
// ongoing sync with the global active client after that.
function getGlobalActiveClientName() {
  if (!isEmbedded) return null;
  try {
    const active = window.parent.getActiveClient && window.parent.getActiveClient();
    if (!active) return null;
    const clients = getClients();
    return Object.keys(clients).find(name => clients[name] === active) || null;
  } catch (e) {
    return null;
  }
}

function populateClientSelect() {
  const clients = getClients();
  const select = el('clientSelect');
  const prevValue = select.value;
  select.innerHTML = '<option value="">Select a client...</option>';
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  if (prevValue && clients[prevValue]) {
    select.value = prevValue;
  } else if (!prevValue) {
    const activeName = getGlobalActiveClientName();
    if (activeName && clients[activeName]) select.value = activeName;
  }
}

function currentClientName() { return el('clientSelect').value; }

function currentClient() {
  const name = currentClientName();
  if (!name) return null;
  return getClientByName(name);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return '';
  }
}

// Same date-math helpers Content Calendar uses for its overdue/due-soon
// logic (toDateOnly/todayStr/daysBetween), duplicated here rather than
// imported since every tool's js/app.js in this codebase is self-contained.
function toDateOnly(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function todayStr() {
  return toDateOnly(new Date()).toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStrVal) {
  const from = toDateOnly(fromStr);
  const to = toDateOnly(toStrVal);
  return Math.round((to - from) / 86400000);
}

function daysSince(isoString) {
  if (!isoString) return null;
  return Math.floor((Date.now() - new Date(isoString).getTime()) / 86400000);
}

// Same 7-day threshold Mood Board Builder uses for its "Awaiting feedback"
// badge - reused here so "something's been sitting too long" means the
// same thing across both tools.
const STUCK_DAYS_THRESHOLD = 7;

function dueBadge(item) {
  if (!item.targetDate) return '';
  const daysUntil = daysBetween(todayStr(), item.targetDate);
  if (daysUntil < 0) return `<span class="prod-due-badge prod-due-overdue">${Math.abs(daysUntil)}d overdue</span>`;
  if (daysUntil === 0) return `<span class="prod-due-badge prod-due-soon">Due today</span>`;
  if (daysUntil <= 3) return `<span class="prod-due-badge prod-due-soon">Due in ${daysUntil}d</span>`;
  return `<span class="prod-due-badge prod-due-ontrack">Due ${formatDate(item.targetDate)}</span>`;
}

function stuckBadge(item) {
  const days = daysSince(item.lastActivityAt || item.movedAt);
  if (days === null || days < STUCK_DAYS_THRESHOLD) return '';
  return `<span class="prod-stuck-badge">Stuck — no activity in ${days}d</span>`;
}

function linksBlock(item) {
  const links = Array.isArray(item.embedLinks) ? item.embedLinks.filter(l => l && l.url) : [];
  if (!links.length) return '';
  return `
    <div class="prod-links-wrap">
      ${links.map(l => `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label || l.url)}</a>`).join('')}
    </div>
  `;
}

// Same 7-option list Mood Board Builder's own edit form uses (mbCategory
// select in mood-board-builder/index.html) - kept identical so an item's
// category means the same thing on both boards.
const CATEGORY_OPTIONS = ['Website Design', 'Social Post', 'Ad Campaign', 'Video/Reel', 'Print', 'Email', 'Other'];

const PRIORITY_OPTIONS = ['Low', 'Medium', 'High'];
const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };

// "single" = the classic per-client dropdown view. "all" = every client's
// productionBoard flattened into one list (see collectAllRows).
let viewMode = 'single';

// Tracks which item (if any) is currently showing its edit form instead of
// the read-only card. Only one item can be in edit mode at a time - both
// id and clientName are needed to identify it since "All Clients" mode can
// have items sharing similar-looking data across different clients.
let editingItemId = null;
let editingClientName = null;

// Team Roster names for the "who's working on this" assignee field - same
// shared-parent-helper pattern Resource Booking Calendar and Hours Tracker
// use, rather than a hardcoded name list, so it stays in sync with whoever
// is actually on Team Roster.
let teamMembers = [];

async function loadTeamMembers() {
  teamMembers = (isEmbedded && typeof window.parent.getTeamRosterMembers === 'function')
    ? await window.parent.getTeamRosterMembers()
    : [];
  populateAssigneeDatalist();
  populateFilterAssignee();
}

function populateAssigneeDatalist() {
  const list = el('assigneeOptions');
  if (!list) return;
  list.innerHTML = '';
  teamMembers.map(m => m.memberName).filter(Boolean).sort().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    list.appendChild(opt);
  });
}

function populateFilterAssignee() {
  const select = el('filterAssignee');
  if (!select) return;
  const prevValue = select.value;
  select.innerHTML = '<option value="">All assignees</option><option value="__unassigned__">Unassigned</option>';
  teamMembers.map(m => m.memberName).filter(Boolean).sort().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  if (prevValue) select.value = prevValue;
}

// Bulk-selection state: item id -> clientName. Keyed by id rather than a
// composite "client::id" string since ids are already globally unique
// (uid()/timestamp-based) - avoids any delimiter-parsing edge case with
// client names. Cleared on view-mode switch or client change so a
// selection never silently carries into a different filtered context.
let selectedItems = new Map();

// Flattens every client's own productionBoard (or productionBoardCompleted)
// array into one list of { clientName, item } pairs - same shape Content
// Calendar's collectAllItems uses for its own cross-client list.
function collectAllRows(field) {
  const clients = getClients();
  const rows = [];
  Object.keys(clients).forEach(name => {
    if (name === SANDBOX_NAME) return;
    const items = Array.isArray(clients[name][field]) ? clients[name][field] : [];
    items.forEach(item => rows.push({ clientName: name, item }));
  });
  return rows;
}

function getActiveRows() {
  if (viewMode === 'all') return collectAllRows('productionBoard');
  const clientName = currentClientName();
  if (!clientName) return [];
  const client = getClientByName(clientName);
  const items = client && Array.isArray(client.productionBoard) ? client.productionBoard : [];
  return items.map(item => ({ clientName, item }));
}

function getActiveCompletedRows() {
  if (viewMode === 'all') return collectAllRows('productionBoardCompleted');
  const clientName = currentClientName();
  if (!clientName) return [];
  const client = getClientByName(clientName);
  const items = client && Array.isArray(client.productionBoardCompleted) ? client.productionBoardCompleted : [];
  return items.map(item => ({ clientName, item }));
}

function sortRows(rows) {
  const sortBy = el('sortBy').value;
  const sorted = rows.slice();
  if (sortBy === 'priority') {
    sorted.sort((a, b) => PRIORITY_ORDER[a.item.priority || 'Medium'] - PRIORITY_ORDER[b.item.priority || 'Medium']);
  } else if (sortBy === 'dueDate') {
    sorted.sort((a, b) => {
      if (!a.item.targetDate && !b.item.targetDate) return 0;
      if (!a.item.targetDate) return 1;
      if (!b.item.targetDate) return -1;
      return new Date(a.item.targetDate) - new Date(b.item.targetDate);
    });
  } else if (sortBy === 'assignee') {
    // Unassigned items sort to the end - "zzz" sorts after any real name.
    sorted.sort((a, b) => (a.item.assignee || 'zzz').localeCompare(b.item.assignee || 'zzz'));
  }
  // "newest" (default) keeps natural order - items are unshifted on arrival
  // so the array is already newest-first.
  return sorted;
}

function setViewMode(mode) {
  viewMode = mode;
  selectedItems.clear();
  el('viewModeSingleBtn').classList.toggle('active', mode === 'single');
  el('viewModeAllBtn').classList.toggle('active', mode === 'all');
  el('clientSelectGroup').style.display = mode === 'single' ? 'block' : 'none';
  renderState();
}

function renderState() {
  if (viewMode === 'all') {
    el('emptyState').style.display = 'none';
    el('productionInterface').style.display = 'block';
    renderItemsList();
    return;
  }
  const clientName = currentClientName();
  if (!clientName) {
    el('emptyState').style.display = 'flex';
    el('productionInterface').style.display = 'none';
    return;
  }
  el('emptyState').style.display = 'none';
  el('productionInterface').style.display = 'block';
  renderItemsList();
}

function matchesFilters(item) {
  const search = el('filterSearchInput').value.trim().toLowerCase();
  const assignee = el('filterAssignee').value;
  const priority = el('filterPriority').value;
  if (search && !(item.title || '').toLowerCase().includes(search)) return false;
  if (assignee === '__unassigned__' && item.assignee) return false;
  if (assignee && assignee !== '__unassigned__' && item.assignee !== assignee) return false;
  if (priority && (item.priority || 'Medium') !== priority) return false;
  return true;
}

function renderItemsList() {
  const container = el('itemsList');
  const rows = sortRows(getActiveRows().filter(r => matchesFilters(r.item)));

  el('itemsEmptyState').style.display = rows.length === 0 ? 'block' : 'none';
  container.innerHTML = rows.map(({ clientName, item }) =>
    (item.id === editingItemId && clientName === editingClientName) ? editCardTemplate(item, clientName) : viewCardTemplate(item, clientName)
  ).join('');

  document.querySelectorAll('.complete-item-btn').forEach(btn => {
    btn.addEventListener('click', () => markComplete(btn.getAttribute('data-client'), btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.sendback-item-btn').forEach(btn => {
    btn.addEventListener('click', () => sendBackToMoodBoard(btn.getAttribute('data-client'), btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.edit-item-btn').forEach(btn => {
    btn.addEventListener('click', () => startEditItem(btn.getAttribute('data-client'), btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.save-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => saveEditItem(btn.getAttribute('data-client'), btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.cancel-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => cancelEditItem());
  });
  container.querySelectorAll('textarea[data-id]').forEach(ta => {
    ta.addEventListener('input', () => {
      const client = getClientByName(ta.getAttribute('data-client'));
      if (!client || !Array.isArray(client.productionBoard)) return;
      const it = client.productionBoard.find(i => i.id === ta.getAttribute('data-id'));
      if (!it) return;
      it.productionNotes = ta.value;
      it.lastActivityAt = new Date().toISOString();
      persist();
    });
  });
  container.querySelectorAll('.prod-select-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.getAttribute('data-id');
      const clientName = cb.getAttribute('data-client');
      if (cb.checked) selectedItems.set(id, clientName);
      else selectedItems.delete(id);
      renderBulkBar();
    });
  });

  renderBulkBar();
  renderCompletedList();
}

function renderBulkBar() {
  const bar = el('bulkActionBar');
  const count = selectedItems.size;
  bar.style.display = count > 0 ? 'flex' : 'none';
  el('bulkSelectedCount').textContent = count + (count === 1 ? ' item selected' : ' items selected');
}

function renderCompletedList() {
  const section = el('completedSection');
  const showCompleted = el('showCompletedToggle').checked;
  section.style.display = showCompleted ? 'block' : 'none';
  if (!showCompleted) return;

  const container = el('completedList');
  const rows = getActiveCompletedRows();

  el('completedEmptyState').style.display = rows.length === 0 ? 'block' : 'none';
  container.innerHTML = rows.map(({ clientName, item }) => `
    <div class="prod-card prod-card-completed">
      <div class="prod-card-header">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <span class="prod-category-badge">${escapeHtml(item.category || 'Other')}</span>
            ${viewMode === 'all' ? `<span class="prod-client-badge">${escapeHtml(clientName)}</span>` : ''}
            <span class="prod-meta">${item.assignee ? `Assigned to ${escapeHtml(item.assignee)}` : 'Unassigned'}</span>
            <span class="prod-meta">Completed ${formatDate(item.completedAt)}</span>
          </div>
        </div>
        <div class="prod-actions">
          <button class="restore-item-btn" data-client="${escapeHtml(clientName)}" data-id="${item.id}">Restore to Board</button>
        </div>
      </div>
      ${item.ideaSummary ? `<p class="prod-body-text">${escapeHtml(item.ideaSummary)}</p>` : ''}
    </div>
  `).join('');

  document.querySelectorAll('.restore-item-btn').forEach(btn => {
    btn.addEventListener('click', () => restoreCompletedItem(btn.getAttribute('data-client'), btn.getAttribute('data-id')));
  });
}

function priorityBadge(priority) {
  const p = priority || 'Medium';
  const cls = p === 'High' ? 'prod-priority-high' : p === 'Low' ? 'prod-priority-low' : 'prod-priority-medium';
  return `<span class="prod-priority-badge ${cls}">${escapeHtml(p)} priority</span>`;
}

function viewCardTemplate(item, clientName) {
  return `
    <div class="prod-card">
      <div class="prod-card-header">
        <div style="display:flex; align-items:flex-start; gap:8px;">
          <span class="prod-select-wrap">
            <input type="checkbox" class="prod-select-checkbox" data-client="${escapeHtml(clientName)}" data-id="${item.id}" ${selectedItems.has(item.id) ? 'checked' : ''}>
          </span>
          <div>
          <strong>${escapeHtml(item.title)}</strong>
          <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            ${viewMode === 'all' ? `<span class="prod-client-badge">${escapeHtml(clientName)}</span>` : ''}
            <span class="prod-category-badge">${escapeHtml(item.category || 'Other')}</span>
            ${priorityBadge(item.priority)}
            ${dueBadge(item)}
            ${stuckBadge(item)}
            <span class="prod-meta">${item.assignee ? `Assigned to ${escapeHtml(item.assignee)}` : 'Unassigned'}</span>
            <span class="prod-meta">Moved to the board ${formatDate(item.movedAt)}</span>
          </div>
          </div>
        </div>
        <div class="prod-actions">
          <button class="edit-item-btn" data-client="${escapeHtml(clientName)}" data-id="${item.id}">Edit</button>
          <button class="complete-item-btn" data-client="${escapeHtml(clientName)}" data-id="${item.id}">Mark Complete</button>
          <button class="sendback-item-btn" data-client="${escapeHtml(clientName)}" data-id="${item.id}">Send Back to Mood Boards</button>
        </div>
      </div>
      ${item.ideaSummary ? `<p class="prod-body-text">${escapeHtml(item.ideaSummary)}</p>` : ''}
      ${item.visualDirection ? `<p class="prod-body-text"><strong>Visual direction:</strong> ${escapeHtml(item.visualDirection)}</p>` : ''}
      ${item.keyElements ? `<p class="prod-body-text"><strong>Key elements:</strong> ${escapeHtml(item.keyElements)}</p>` : ''}
      ${item.internalNotes ? `<p class="prod-body-text"><strong>Internal notes:</strong> ${escapeHtml(item.internalNotes)}</p>` : ''}
      ${linksBlock(item)}
      <div class="prod-notes-wrap">
        <label for="prodNotes-${item.id}">Production notes</label>
        <textarea id="prodNotes-${item.id}" rows="4" data-client="${escapeHtml(clientName)}" data-id="${item.id}" placeholder="Status, blockers, who's on it...">${escapeHtml(item.productionNotes || '')}</textarea>
      </div>
    </div>
  `;
}

function editCardTemplate(item, clientName) {
  return `
    <div class="prod-card prod-card-editing">
      ${viewMode === 'all' ? `<span class="prod-client-badge" style="align-self:flex-start;">${escapeHtml(clientName)}</span>` : ''}
      <div class="form-group">
        <label for="edit-title-${item.id}">Title</label>
        <input type="text" id="edit-title-${item.id}" value="${escapeHtml(item.title)}">
      </div>
      <div class="prod-edit-row">
        <div class="form-group">
          <label for="edit-category-${item.id}">Category</label>
          <select id="edit-category-${item.id}">
            ${CATEGORY_OPTIONS.map(opt => `<option${opt === item.category ? ' selected' : ''}>${opt}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="edit-priority-${item.id}">Priority</label>
          <select id="edit-priority-${item.id}">
            ${PRIORITY_OPTIONS.map(opt => `<option${opt === (item.priority || 'Medium') ? ' selected' : ''}>${opt}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="edit-assignee-${item.id}">Assigned to</label>
          <input type="text" id="edit-assignee-${item.id}" list="assigneeOptions" value="${escapeHtml(item.assignee || '')}" placeholder="Who's working on this?">
        </div>
        <div class="form-group">
          <label for="edit-targetdate-${item.id}">Target date</label>
          <input type="date" id="edit-targetdate-${item.id}" value="${item.targetDate || ''}">
        </div>
      </div>
      <div class="form-group">
        <label for="edit-summary-${item.id}">Idea summary</label>
        <textarea id="edit-summary-${item.id}" rows="3">${escapeHtml(item.ideaSummary || '')}</textarea>
      </div>
      <div class="form-group">
        <label for="edit-visual-${item.id}">Visual direction</label>
        <textarea id="edit-visual-${item.id}" rows="3">${escapeHtml(item.visualDirection || '')}</textarea>
      </div>
      <div class="form-group">
        <label for="edit-elements-${item.id}">Key elements</label>
        <textarea id="edit-elements-${item.id}" rows="3">${escapeHtml(item.keyElements || '')}</textarea>
      </div>
      <div class="form-group">
        <label for="edit-internal-${item.id}">Internal notes</label>
        <textarea id="edit-internal-${item.id}" rows="3">${escapeHtml(item.internalNotes || '')}</textarea>
      </div>
      <div class="prod-actions">
        <button class="save-edit-btn" data-client="${escapeHtml(clientName)}" data-id="${item.id}">Save Changes</button>
        <button class="cancel-edit-btn" data-client="${escapeHtml(clientName)}" data-id="${item.id}">Cancel</button>
      </div>
    </div>
  `;
}

function startEditItem(clientName, id) {
  editingItemId = id;
  editingClientName = clientName;
  renderItemsList();
}

function cancelEditItem() {
  editingItemId = null;
  editingClientName = null;
  renderItemsList();
}

function saveEditItem(clientName, id) {
  const client = getClientByName(clientName);
  if (!client || !Array.isArray(client.productionBoard)) return;
  const item = client.productionBoard.find(i => i.id === id);
  if (!item) return;

  const title = el(`edit-title-${id}`).value.trim();
  if (!title) {
    alert('Title can\'t be empty.');
    return;
  }
  item.title = title;
  item.category = el(`edit-category-${id}`).value;
  item.priority = el(`edit-priority-${id}`).value;
  item.assignee = el(`edit-assignee-${id}`).value.trim();
  item.targetDate = el(`edit-targetdate-${id}`).value;
  item.ideaSummary = el(`edit-summary-${id}`).value;
  item.visualDirection = el(`edit-visual-${id}`).value;
  item.keyElements = el(`edit-elements-${id}`).value;
  item.internalNotes = el(`edit-internal-${id}`).value;
  item.lastActivityAt = new Date().toISOString();

  persist();
  editingItemId = null;
  editingClientName = null;
  renderItemsList();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `"${item.title}" updated.`);
  }
}

// Same stale-iframe issue solved for Mood Board Builder - QC Checklist's
// tab id (see root app.js's dispatch switch, case "tab-qc") needs flagging
// whenever a queue push might leave its already-loaded iframe stale.
function flagQcReload() {
  if (isEmbedded && window.parent.iframeNeedsReload) {
    window.parent.iframeNeedsReload["tab-qc"] = true;
  }
}

// Shared by markComplete and bulkMarkComplete: archives the item into
// client.productionBoardCompleted (viewable via "Show completed") rather
// than deleting it outright, and queues a lightweight pointer into
// client.qcQueue so QC Checklist's own "Awaiting QC" section (see
// renderQcQueue in qc-checklist/js/app.js) can pick it up - the queue
// entry is a nudge, not a hard link, so this stays decoupled from
// whatever QC does with it afterward.
function archiveItemAsComplete(client, item) {
  const completedAt = new Date().toISOString();

  if (!Array.isArray(client.productionBoardCompleted)) client.productionBoardCompleted = [];
  client.productionBoardCompleted.unshift({ ...item, completedAt });

  if (!Array.isArray(client.qcQueue)) client.qcQueue = [];
  client.qcQueue.unshift({
    id: 'qcq-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    title: item.title,
    category: item.category,
    assignee: item.assignee,
    completedAt,
    productionBoardItemId: item.id
  });

  client.productionBoard = client.productionBoard.filter(i => i.id !== item.id);
}

function markComplete(clientName, id) {
  const client = getClientByName(clientName);
  if (!client || !Array.isArray(client.productionBoard)) return;
  const item = client.productionBoard.find(i => i.id === id);
  if (!item) return;
  if (!confirm(`Mark "${item.title}" complete? It'll come off the Production Board, move to Completed, and get queued for QC.`)) return;

  archiveItemAsComplete(client, item);
  persist();
  flagQcReload();
  renderItemsList();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `"${item.title}" marked complete and queued for QC.`);
  }
}

// Safety valve for a complete that was a mistake - puts the item back on
// the active board exactly as it was, minus the completedAt stamp, and
// pulls any matching QC-queue pointer back out since it'd otherwise point
// at a "completed" item that no longer is.
function restoreCompletedItem(clientName, id) {
  const client = getClientByName(clientName);
  if (!client || !Array.isArray(client.productionBoardCompleted)) return;
  const item = client.productionBoardCompleted.find(i => i.id === id);
  if (!item) return;
  if (!confirm(`Restore "${item.title}" to the active Production Board?`)) return;

  const { completedAt, ...restored } = item;
  restored.lastActivityAt = new Date().toISOString();
  if (!Array.isArray(client.productionBoard)) client.productionBoard = [];
  client.productionBoard.unshift(restored);
  client.productionBoardCompleted = client.productionBoardCompleted.filter(i => i.id !== id);
  if (Array.isArray(client.qcQueue)) {
    client.qcQueue = client.qcQueue.filter(q => q.productionBoardItemId !== id);
  }
  persist();
  flagQcReload();
  renderItemsList();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `"${item.title}" restored to the board.`);
  }
}

// Safety valve for a move that was a mistake or a piece that stalled and
// needs to go back to the idea stage - reconstructs a mood board entry
// from what's still on the production board item (title/category/
// ideaSummary/visualDirection/keyElements/internalNotes/embedLinks
// carried over when it was originally moved). Always lands back as NOT
// shared with the client, regardless of whether the original board was -
// re-sharing is a deliberate call to make again, not something to
// silently restore.
function sendBackToMoodBoard(clientName, id) {
  const client = getClientByName(clientName);
  if (!client || !Array.isArray(client.productionBoard)) return;
  const item = client.productionBoard.find(i => i.id === id);
  if (!item) return;
  if (!confirm(`Send "${item.title}" back to Mood Boards? It'll disappear from the Production Board.`)) return;

  if (!Array.isArray(client.moodBoards)) client.moodBoards = [];
  client.moodBoards.unshift({
    id: 'mb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    title: item.title,
    category: item.category,
    ideaSummary: item.ideaSummary,
    visualDirection: item.visualDirection,
    keyElements: item.keyElements,
    internalNotes: item.internalNotes,
    embedLinks: item.embedLinks || [],
    sharedWithClient: false,
    createdDate: new Date().toISOString().slice(0, 10)
  });
  client.productionBoard = client.productionBoard.filter(i => i.id !== id);
  persist();
  // Same stale-iframe issue as the forward move - flag Mood Board Builder's
  // iframe so it re-fetches next time someone switches to that tab, instead
  // of silently missing the item until a full app reload.
  if (isEmbedded && window.parent.iframeNeedsReload) {
    window.parent.iframeNeedsReload["tab-moodboard"] = true;
  }
  renderItemsList();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `"${item.title}" sent back to Mood Boards.`);
  }
}

function bulkMarkComplete() {
  if (selectedItems.size === 0) return;
  const count = selectedItems.size;
  if (!confirm(`Mark ${count} item${count === 1 ? '' : 's'} complete? They'll come off the Production Board, move to Completed, and get queued for QC.`)) return;

  selectedItems.forEach((clientName, id) => {
    const client = getClientByName(clientName);
    if (!client || !Array.isArray(client.productionBoard)) return;
    const item = client.productionBoard.find(i => i.id === id);
    if (!item) return;
    archiveItemAsComplete(client, item);
  });

  persist();
  flagQcReload();
  selectedItems.clear();
  renderItemsList();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `${count} item${count === 1 ? '' : 's'} marked complete.`);
  }
}

function bulkReassign() {
  if (selectedItems.size === 0) return;
  const assignee = el('bulkAssigneeInput').value.trim();
  if (!assignee) {
    alert("Enter a name to reassign to first.");
    return;
  }
  const count = selectedItems.size;

  selectedItems.forEach((clientName, id) => {
    const client = getClientByName(clientName);
    if (!client || !Array.isArray(client.productionBoard)) return;
    const item = client.productionBoard.find(i => i.id === id);
    if (!item) return;
    item.assignee = assignee;
    item.lastActivityAt = new Date().toISOString();
  });

  persist();
  selectedItems.clear();
  el('bulkAssigneeInput').value = '';
  renderItemsList();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Reassigned ${count} item${count === 1 ? '' : 's'} to ${assignee}.`);
  }
}

function bulkClearSelection() {
  selectedItems.clear();
  renderItemsList();
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  loadTeamMembers();
  el('clientSelect').addEventListener('change', () => {
    selectedItems.clear();
    renderState();
  });
  el('viewModeSingleBtn').addEventListener('click', () => setViewMode('single'));
  el('viewModeAllBtn').addEventListener('click', () => setViewMode('all'));
  el('filterSearchInput').addEventListener('input', renderItemsList);
  el('filterAssignee').addEventListener('change', renderItemsList);
  el('filterPriority').addEventListener('change', renderItemsList);
  el('sortBy').addEventListener('change', renderItemsList);
  el('showCompletedToggle').addEventListener('change', renderCompletedList);
  el('selectAllVisible').addEventListener('change', () => {
    const rows = sortRows(getActiveRows().filter(r => matchesFilters(r.item)));
    if (el('selectAllVisible').checked) {
      rows.forEach(r => selectedItems.set(r.item.id, r.clientName));
    } else {
      rows.forEach(r => selectedItems.delete(r.item.id));
    }
    renderItemsList();
  });
  el('bulkCompleteBtn').addEventListener('click', bulkMarkComplete);
  el('bulkReassignBtn').addEventListener('click', bulkReassign);
  el('bulkClearBtn').addEventListener('click', bulkClearSelection);

  // Same iframe-race fix used across the other client-aware modules: the
  // parent Hub's client database loads asynchronously, so poll briefly
  // and re-populate the dropdown once real data shows up.
  let clientPollAttempts = 0;
  const clientPoll = setInterval(() => {
    clientPollAttempts++;
    const hasClients = Object.keys(getClients()).length > 0;
    if (hasClients || clientPollAttempts > 30) {
      clearInterval(clientPoll);
      if (hasClients) {
        populateClientSelect();
        renderState();
      }
    }
  }, 250);
});
