/* ============================================================
   BRAND ROADMAP — APP LOGIC
   Per-client, own client-select dropdown (same pattern as Mood Board
   Builder / Brand Asset Kit) rather than the global "active client" -
   lets you jump between clients' roadmaps without switching what's
   active elsewhere in the Hub. Data lives at clients[name].brandRoadmap,
   saved through the parent Hub's own clientsDb + saveDatabase() (same
   mechanism as Mood Board Builder).

   Deliberately NOT scoped to one deliverable's build schedule the way
   Timeline Scheduler is - this is meant to span the whole relationship
   with a client (phases never auto-close, initiatives just accumulate
   across quarters), which is why it's its own tool instead of a
   Timeline Scheduler template. Revisit alongside QBR Generator.

   Admin-only to create/edit - the client never writes to this field
   (see visibleToClient below), so no fold-in-existing-progress step is
   needed the way there is for client-writable fields like
   moodBoardAnnotations. Synced out to the public clients/{token} doc by
   syncPublicPortalDocs in the parent app.js, same as moodBoards/brandKit.
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

const CHANNELS = [
  'Strategy', 'Branding & Design', 'Website Design', 'Content & Social',
  'Paid Media', 'Video & Production', 'SEO', 'Reputation & Reviews', 'Other'
];

const PHASE_STATUSES = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'current', label: 'Current' },
  { value: 'complete', label: 'Complete' }
];

const INITIATIVE_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done', label: 'Done' }
];

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

function uid(prefix) { return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

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
  if (prevValue && clients[prevValue]) select.value = prevValue;
}

function currentClientName() { return el('clientSelect').value; }

function currentClient() {
  const name = currentClientName();
  if (!name) return null;
  const clients = getClients();
  return clients[name] || null;
}

// Ensures client.brandRoadmap exists with the right shape before any read/
// write touches it - callers never have to null-check the whole structure.
function ensureRoadmap(client) {
  if (!client.brandRoadmap || typeof client.brandRoadmap !== 'object') {
    client.brandRoadmap = { visibleToClient: false, lastReviewedAt: null, phases: [] };
  }
  if (!Array.isArray(client.brandRoadmap.phases)) client.brandRoadmap.phases = [];
  return client.brandRoadmap;
}

let editingPhaseId = null;

function resetPhaseForm() {
  editingPhaseId = null;
  el('rmPhaseName').value = '';
  el('rmPhaseTimeframe').value = '';
  el('rmPhaseStatus').value = 'upcoming';
  el('phaseFormTitle').textContent = 'Add a Phase';
  el('rmSavePhaseBtn').textContent = 'Add Phase';
  el('rmCancelPhaseEditBtn').style.display = 'none';
}

function timeAgo(isoString) {
  if (!isoString) return 'Never reviewed';
  const then = new Date(isoString);
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'Reviewed today';
  if (days === 1) return 'Reviewed 1 day ago';
  if (days < 30) return `Reviewed ${days} days ago`;
  const months = Math.floor(days / 30);
  return `Reviewed ${months} month${months > 1 ? 's' : ''} ago`;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderInterface() {
  const client = currentClient();
  const emptyState = el('emptyState');
  const iface = el('roadmapInterface');
  if (!client) {
    emptyState.style.display = '';
    iface.style.display = 'none';
    return;
  }
  emptyState.style.display = 'none';
  iface.style.display = '';

  const roadmap = ensureRoadmap(client);
  el('rmVisibleToClient').checked = !!roadmap.visibleToClient;
  el('rmLastReviewed').textContent = timeAgo(roadmap.lastReviewedAt);

  renderPhasesList();
}

function channelOptionsHtml(selected) {
  return CHANNELS.map(c => `<option value="${escapeHtml(c)}" ${c === selected ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
}

function phaseStatusOptionsHtml(selected) {
  return PHASE_STATUSES.map(s => `<option value="${s.value}" ${s.value === selected ? 'selected' : ''}>${s.label}</option>`).join('');
}

function initiativeStatusOptionsHtml(selected) {
  return INITIATIVE_STATUSES.map(s => `<option value="${s.value}" ${s.value === selected ? 'selected' : ''}>${s.label}</option>`).join('');
}

function renderPhasesList() {
  const client = currentClient();
  if (!client) return;
  const roadmap = ensureRoadmap(client);
  const list = el('rmPhasesList');
  const emptyState = el('rmPhasesEmptyState');
  list.innerHTML = '';

  if (roadmap.phases.length === 0) {
    emptyState.style.display = '';
    return;
  }
  emptyState.style.display = 'none';

  roadmap.phases.forEach((phase, idx) => {
    const card = document.createElement('div');
    card.className = `rm-phase-card status-${phase.status}`;

    const initiatives = Array.isArray(phase.initiatives) ? phase.initiatives : [];
    const initiativesHtml = initiatives.length
      ? initiatives.map(init => `
        <div class="rm-initiative-row" data-init-id="${init.id}">
          <span class="rm-channel-chip">${escapeHtml(init.channel)}</span>
          <span class="rm-initiative-name">${escapeHtml(init.name)}</span>
          <select class="rm-initiative-status-select" data-phase-id="${phase.id}" data-init-id="${init.id}">
            ${initiativeStatusOptionsHtml(init.status)}
          </select>
          <button type="button" class="rm-initiative-delete-btn" data-phase-id="${phase.id}" data-init-id="${init.id}" title="Delete initiative">Delete</button>
        </div>
      `).join('')
      : '<p class="rm-initiatives-empty">No initiatives in this phase yet.</p>';

    card.innerHTML = `
      <div class="rm-phase-header">
        <div class="rm-phase-title-row">
          <span class="rm-phase-name">${escapeHtml(phase.name)}</span>
          ${phase.timeframe ? `<span class="rm-phase-timeframe">${escapeHtml(phase.timeframe)}</span>` : ''}
          <span class="rm-status-badge status-${phase.status}">${escapeHtml(PHASE_STATUSES.find(s => s.value === phase.status)?.label || phase.status)}</span>
        </div>
        <div class="rm-phase-actions">
          <button type="button" class="rm-move-up-btn" data-id="${phase.id}" ${idx === 0 ? 'disabled' : ''} title="Move earlier">&uarr;</button>
          <button type="button" class="rm-move-down-btn" data-id="${phase.id}" ${idx === roadmap.phases.length - 1 ? 'disabled' : ''} title="Move later">&darr;</button>
          <button type="button" class="rm-edit-phase-btn" data-id="${phase.id}">Edit</button>
          <button type="button" class="rm-delete-phase-btn" data-id="${phase.id}">Delete</button>
        </div>
      </div>

      <div class="rm-initiatives-list">${initiativesHtml}</div>

      <div class="rm-add-initiative-row">
        <input type="text" class="rm-new-init-name" data-phase-id="${phase.id}" placeholder="Initiative name (e.g. Website Relaunch)...">
        <select class="rm-new-init-channel" data-phase-id="${phase.id}">${channelOptionsHtml('Strategy')}</select>
        <button type="button" class="btn-secondary rm-add-init-btn" data-phase-id="${phase.id}">+ Add Initiative</button>
      </div>
    `;
    list.appendChild(card);
  });

  wirePhaseCardListeners();
}

function wirePhaseCardListeners() {
  document.querySelectorAll('.rm-edit-phase-btn').forEach(btn => {
    btn.addEventListener('click', () => startEditPhase(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.rm-delete-phase-btn').forEach(btn => {
    btn.addEventListener('click', () => deletePhase(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.rm-move-up-btn').forEach(btn => {
    btn.addEventListener('click', () => movePhase(btn.getAttribute('data-id'), -1));
  });
  document.querySelectorAll('.rm-move-down-btn').forEach(btn => {
    btn.addEventListener('click', () => movePhase(btn.getAttribute('data-id'), 1));
  });
  document.querySelectorAll('.rm-add-init-btn').forEach(btn => {
    btn.addEventListener('click', () => addInitiative(btn.getAttribute('data-phase-id')));
  });
  document.querySelectorAll('.rm-initiative-status-select').forEach(sel => {
    sel.addEventListener('change', () => {
      setInitiativeStatus(sel.getAttribute('data-phase-id'), sel.getAttribute('data-init-id'), sel.value);
    });
  });
  document.querySelectorAll('.rm-initiative-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteInitiative(btn.getAttribute('data-phase-id'), btn.getAttribute('data-init-id')));
  });
  // Enter key in the new-initiative name field submits it, same UX as
  // pressing the Add Initiative button next to it.
  document.querySelectorAll('.rm-new-init-name').forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addInitiative(inp.getAttribute('data-phase-id'));
    });
  });
}

function findPhase(roadmap, phaseId) {
  return roadmap.phases.find(p => p.id === phaseId) || null;
}

function startEditPhase(phaseId) {
  const client = currentClient();
  if (!client) return;
  const roadmap = ensureRoadmap(client);
  const phase = findPhase(roadmap, phaseId);
  if (!phase) return;

  editingPhaseId = phaseId;
  el('rmPhaseName').value = phase.name;
  el('rmPhaseTimeframe').value = phase.timeframe || '';
  el('rmPhaseStatus').value = phase.status;
  el('phaseFormTitle').textContent = `Editing "${phase.name}"`;
  el('rmSavePhaseBtn').textContent = 'Save Changes';
  el('rmCancelPhaseEditBtn').style.display = '';
  el('rmPhaseName').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function savePhase() {
  const client = currentClient();
  if (!client) return;
  const name = el('rmPhaseName').value.trim();
  if (!name) { alert('Give this phase a name first.'); return; }
  const timeframe = el('rmPhaseTimeframe').value.trim();
  const status = el('rmPhaseStatus').value;
  const roadmap = ensureRoadmap(client);

  if (editingPhaseId) {
    const phase = findPhase(roadmap, editingPhaseId);
    if (phase) {
      phase.name = name;
      phase.timeframe = timeframe;
      phase.status = status;
    }
  } else {
    roadmap.phases.push({ id: uid('phase'), name, timeframe, status, initiatives: [] });
  }

  persist();
  resetPhaseForm();
  renderPhasesList();
}

function deletePhase(phaseId) {
  const client = currentClient();
  if (!client) return;
  const roadmap = ensureRoadmap(client);
  const phase = findPhase(roadmap, phaseId);
  if (!phase) return;
  if (!confirm(`Delete the "${phase.name}" phase and everything in it? This can't be undone.`)) return;
  roadmap.phases = roadmap.phases.filter(p => p.id !== phaseId);
  if (editingPhaseId === phaseId) resetPhaseForm();
  persist();
  renderPhasesList();
}

function movePhase(phaseId, direction) {
  const client = currentClient();
  if (!client) return;
  const roadmap = ensureRoadmap(client);
  const idx = roadmap.phases.findIndex(p => p.id === phaseId);
  const targetIdx = idx + direction;
  if (idx === -1 || targetIdx < 0 || targetIdx >= roadmap.phases.length) return;
  const [moved] = roadmap.phases.splice(idx, 1);
  roadmap.phases.splice(targetIdx, 0, moved);
  persist();
  renderPhasesList();
}

function addInitiative(phaseId) {
  const client = currentClient();
  if (!client) return;
  const nameInput = document.querySelector(`.rm-new-init-name[data-phase-id="${phaseId}"]`);
  const channelSelect = document.querySelector(`.rm-new-init-channel[data-phase-id="${phaseId}"]`);
  if (!nameInput) return;
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  const channel = channelSelect ? channelSelect.value : 'Other';

  const roadmap = ensureRoadmap(client);
  const phase = findPhase(roadmap, phaseId);
  if (!phase) return;
  if (!Array.isArray(phase.initiatives)) phase.initiatives = [];
  phase.initiatives.push({ id: uid('init'), name, channel, status: 'planned' });

  persist();
  renderPhasesList();
}

function setInitiativeStatus(phaseId, initId, status) {
  const client = currentClient();
  if (!client) return;
  const roadmap = ensureRoadmap(client);
  const phase = findPhase(roadmap, phaseId);
  if (!phase) return;
  const init = (phase.initiatives || []).find(i => i.id === initId);
  if (!init) return;
  init.status = status;
  persist();
  // No full re-render needed here (avoids losing scroll/focus on a select
  // change) - just refresh this one row's badge styling isn't wired
  // separately, so a light re-render is simplest and still cheap at this
  // scale (a handful of phases/initiatives per client).
  renderPhasesList();
}

function deleteInitiative(phaseId, initId) {
  const client = currentClient();
  if (!client) return;
  const roadmap = ensureRoadmap(client);
  const phase = findPhase(roadmap, phaseId);
  if (!phase) return;
  phase.initiatives = (phase.initiatives || []).filter(i => i.id !== initId);
  persist();
  renderPhasesList();
}

function initListeners() {
  el('clientSelect').addEventListener('change', () => {
    resetPhaseForm();
    renderInterface();
  });

  el('rmSavePhaseBtn').addEventListener('click', savePhase);
  el('rmCancelPhaseEditBtn').addEventListener('click', resetPhaseForm);

  el('rmVisibleToClient').addEventListener('change', () => {
    const client = currentClient();
    if (!client) return;
    const roadmap = ensureRoadmap(client);
    roadmap.visibleToClient = el('rmVisibleToClient').checked;
    persist();
    if (isEmbedded && window.parent.showBanner) {
      window.parent.showBanner('success', roadmap.visibleToClient
        ? 'Brand roadmap is now visible in the client’s Portal.'
        : 'Brand roadmap hidden from the client’s Portal.');
    }
  });

  el('rmMarkReviewedBtn').addEventListener('click', () => {
    const client = currentClient();
    if (!client) return;
    const roadmap = ensureRoadmap(client);
    roadmap.lastReviewedAt = new Date().toISOString();
    persist();
    el('rmLastReviewed').textContent = timeAgo(roadmap.lastReviewedAt);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  populateClientSelect();
  renderInterface();
  initListeners();

  // Same as Mood Board Builder / Referral Tracker: the client list is a
  // nice-to-have to backfill, not a blocker - in case this iframe loaded
  // before the parent's client data finished syncing in.
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    let clientCount = 0;
    try { clientCount = isEmbedded ? Object.keys(window.parent.getAllClients() || {}).length : 0; } catch (e) {}
    if (clientCount > 0) {
      populateClientSelect();
      clearInterval(pollTimer);
    }
    if (pollAttempts > 20) clearInterval(pollTimer);
  }, 500);
});
