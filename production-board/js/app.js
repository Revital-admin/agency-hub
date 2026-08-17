/* ============================================================
   PRODUCTION BOARD — APP LOGIC
   Per-client, own client-select dropdown (same independent pattern as
   Mood Board Builder, rather than the global "active client") - items
   land here via that tool's "Move to Production Board" button, which
   writes directly to clients[name].productionBoard and removes the
   source board from clients[name].moodBoards, so this tool just needs
   to be pointed at the same client to see what showed up.

   Sits between Mood Board Builder (the idea) and QC Checklist/Client
   Portal Manager Content Approvals (the finished piece going out) -
   nothing here auto-syncs to those; this is just a place for an idea
   to live while it's actively being built instead of disappearing
   into a ClickUp task with no trace back to the mood board it came
   from.
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
  const clients = getClients();
  return clients[name] || null;
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

// Same 7-option list Mood Board Builder's own edit form uses (mbCategory
// select in mood-board-builder/index.html) - kept identical so an item's
// category means the same thing on both boards.
const CATEGORY_OPTIONS = ['Website Design', 'Social Post', 'Ad Campaign', 'Video/Reel', 'Print', 'Email', 'Other'];

const PRIORITY_OPTIONS = ['Low', 'Medium', 'High'];

// Tracks which item (if any) is currently showing its edit form instead of
// the read-only card. Only one item can be in edit mode at a time.
let editingItemId = null;

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

function renderState() {
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

function renderItemsList() {
  const client = currentClient();
  const container = el('itemsList');
  const items = client && Array.isArray(client.productionBoard) ? client.productionBoard : [];

  el('itemsEmptyState').style.display = items.length === 0 ? 'block' : 'none';
  container.innerHTML = items.map(item => item.id === editingItemId ? editCardTemplate(item) : viewCardTemplate(item)).join('');

  document.querySelectorAll('.complete-item-btn').forEach(btn => {
    btn.addEventListener('click', () => markComplete(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.sendback-item-btn').forEach(btn => {
    btn.addEventListener('click', () => sendBackToMoodBoard(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.edit-item-btn').forEach(btn => {
    btn.addEventListener('click', () => startEditItem(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.save-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => saveEditItem(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.cancel-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => cancelEditItem());
  });
  container.querySelectorAll('textarea[data-id]').forEach(ta => {
    ta.addEventListener('input', () => {
      const c = currentClient();
      if (!c || !Array.isArray(c.productionBoard)) return;
      const it = c.productionBoard.find(i => i.id === ta.getAttribute('data-id'));
      if (!it) return;
      it.productionNotes = ta.value;
      persist();
    });
  });
}

function priorityBadge(priority) {
  const p = priority || 'Medium';
  const cls = p === 'High' ? 'prod-priority-high' : p === 'Low' ? 'prod-priority-low' : 'prod-priority-medium';
  return `<span class="prod-priority-badge ${cls}">${escapeHtml(p)} priority</span>`;
}

function viewCardTemplate(item) {
  return `
    <div class="prod-card">
      <div class="prod-card-header">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <span class="prod-category-badge">${escapeHtml(item.category || 'Other')}</span>
            ${priorityBadge(item.priority)}
            <span class="prod-meta">${item.assignee ? `Assigned to ${escapeHtml(item.assignee)}` : 'Unassigned'}</span>
            <span class="prod-meta">Moved to the board ${formatDate(item.movedAt)}</span>
          </div>
        </div>
        <div class="prod-actions">
          <button class="edit-item-btn" data-id="${item.id}">Edit</button>
          <button class="complete-item-btn" data-id="${item.id}">Mark Complete</button>
          <button class="sendback-item-btn" data-id="${item.id}">Send Back to Mood Boards</button>
        </div>
      </div>
      ${item.ideaSummary ? `<p class="prod-body-text">${escapeHtml(item.ideaSummary)}</p>` : ''}
      ${item.visualDirection ? `<p class="prod-body-text"><strong>Visual direction:</strong> ${escapeHtml(item.visualDirection)}</p>` : ''}
      ${item.keyElements ? `<p class="prod-body-text"><strong>Key elements:</strong> ${escapeHtml(item.keyElements)}</p>` : ''}
      ${item.internalNotes ? `<p class="prod-body-text"><strong>Internal notes:</strong> ${escapeHtml(item.internalNotes)}</p>` : ''}
      <div class="prod-notes-wrap">
        <label for="prodNotes-${item.id}">Production notes</label>
        <textarea id="prodNotes-${item.id}" rows="4" data-id="${item.id}" placeholder="Status, blockers, who's on it...">${escapeHtml(item.productionNotes || '')}</textarea>
      </div>
    </div>
  `;
}

function editCardTemplate(item) {
  return `
    <div class="prod-card prod-card-editing">
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
        <button class="save-edit-btn" data-id="${item.id}">Save Changes</button>
        <button class="cancel-edit-btn" data-id="${item.id}">Cancel</button>
      </div>
    </div>
  `;
}

function startEditItem(id) {
  editingItemId = id;
  renderItemsList();
}

function cancelEditItem() {
  editingItemId = null;
  renderItemsList();
}

function saveEditItem(id) {
  const client = currentClient();
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
  item.ideaSummary = el(`edit-summary-${id}`).value;
  item.visualDirection = el(`edit-visual-${id}`).value;
  item.keyElements = el(`edit-elements-${id}`).value;
  item.internalNotes = el(`edit-internal-${id}`).value;

  persist();
  editingItemId = null;
  renderItemsList();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `"${item.title}" updated.`);
  }
}

function markComplete(id) {
  const client = currentClient();
  if (!client || !Array.isArray(client.productionBoard)) return;
  const item = client.productionBoard.find(i => i.id === id);
  if (!item) return;
  if (!confirm(`Mark "${item.title}" complete? It'll come off the Production Board.`)) return;
  client.productionBoard = client.productionBoard.filter(i => i.id !== id);
  persist();
  renderItemsList();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `"${item.title}" marked complete.`);
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
function sendBackToMoodBoard(id) {
  const client = currentClient();
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

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  loadTeamMembers();
  el('clientSelect').addEventListener('change', renderState);

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
