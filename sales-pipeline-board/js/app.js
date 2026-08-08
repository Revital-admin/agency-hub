/* ============================================================
   SALES PIPELINE BOARD — APP LOGIC
   (standalone: leads tracked here are NOT clientsDb entries, same
   reasoning as Proposal Follow-Up Tracker - most leads haven't signed
   yet, so this keeps its own list at agency/salesPipeline rather than
   forcing a full Client Workspace just to track a lead. Every
   create/stage-change also fires a one-way sync to ClickUp's own
   "Growth > Pipeline Management > Sales Pipeline" list - see
   syncToClickUp() below and handlePipelineSyncClickUp in _worker.js.)
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

// Exact ClickUp "Growth > Pipeline Management > Sales Pipeline" list
// status strings/colors/order (list 901327581862) - a lead's Hub stage
// IS its ClickUp status string, kept identical on purpose so there's no
// separate mapping table that could drift out of sync if someone edits
// statuses on either side.
const STAGES = [
  { key: '🆕 new lead', color: '#87909e' },
  { key: '📧 outreach sent', color: '#87909e' },
  { key: '📋 assessment in progress', color: '#5f55ee' },
  { key: 'discovery call scheduled', color: '#e16b16' },
  { key: '🔍 discovery complete', color: '#f8ae00' },
  { key: '📄 proposal sent', color: '#aa8d80' },
  { key: '🤝 negotiation', color: '#0091ff' },
  { key: '✅ closed won', color: '#15d500' },
  { key: '❌closed lost', color: '#008844' },
];
const DEFAULT_STAGE = STAGES[0].key;

let leads = [];
let docVersion = 0; // optimistic-concurrency guard, see persist() below
let editingLeadId = null;

function el(id) { return document.getElementById(id); }

function todayStr() { return new Date().toISOString().slice(0, 10); }

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function getPipelineDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "salesPipeline");
}

async function loadLeads() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getPipelineDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      leads = (data && data.list) || [];
      docVersion = (data && data.version) || 0;
      return;
    } catch (e) {
      console.error("Couldn't load pipeline from the cloud:", e);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', "Couldn't load pipeline from the cloud: " + e.message);
      }
      leads = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('sales-pipeline-board-list');
    leads = saved ? JSON.parse(saved) : [];
  } catch (e) { leads = []; }
}

// Optimistic-concurrency guard: overwrites the whole doc on every edit,
// so re-check the version right before writing and refuse to clobber a
// newer save made elsewhere in the meantime (same pattern as Proposal
// Follow-Up Tracker's persist()).
async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getPipelineDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: leads, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save pipeline to the cloud:", result.error);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', result.reason === 'conflict'
          ? "Someone else updated the pipeline while you had it open. Reload to see their changes, then redo your edit."
          : "Couldn't save — your change may be lost on reload: " + result.error.message);
      }
      return false;
    }
    docVersion = result.version;
    return true;
  }
  try {
    localStorage.setItem('sales-pipeline-board-list', JSON.stringify(leads));
  } catch (e) {}
  return true;
}

function renderBoard() {
  const board = el('pipelineBoard');
  board.innerHTML = '';
  el('emptyState').style.display = leads.length === 0 ? 'flex' : 'none';

  STAGES.forEach(stage => {
    const col = document.createElement('div');
    col.className = 'pipeline-column';
    col.style.setProperty('--stage-color', stage.color);

    const stageLeads = leads.filter(l => l.stage === stage.key);
    col.innerHTML = `
      <div class="column-header">
        <span class="column-title">${escapeHtml(stage.key)}</span>
        <span class="column-count">${stageLeads.length}</span>
      </div>
      <div class="column-body"></div>
    `;
    const body = col.querySelector('.column-body');
    stageLeads.forEach(lead => body.appendChild(buildLeadCard(lead)));
    board.appendChild(col);
  });
}

function buildLeadCard(lead) {
  const card = document.createElement('div');
  card.className = 'lead-card';
  card.dataset.id = lead.id;
  card.innerHTML = `
    <div class="lead-name">${escapeHtml(lead.name)}</div>
    ${lead.contactEmail ? `<div class="lead-email">${escapeHtml(lead.contactEmail)}</div>` : ''}
    ${lead.source ? `<div class="lead-source">${escapeHtml(lead.source)}</div>` : ''}
    ${lead.clickupTaskId ? `<div class="lead-synced">&#10003; Synced to ClickUp</div>` : `<div class="lead-syncing">Syncing to ClickUp&hellip;</div>`}
  `;
  card.addEventListener('click', () => openLeadModal(lead.id));
  return card;
}

function stageOptionsHtml(selected) {
  return STAGES.map(s =>
    `<option value="${escapeHtml(s.key)}"${s.key === selected ? ' selected' : ''}>${escapeHtml(s.key)}</option>`
  ).join('');
}

function openLeadModal(id) {
  editingLeadId = id || null;
  const lead = id ? leads.find(l => l.id === id) : null;
  el('modalTitle').textContent = lead ? 'Edit Lead' : 'Add Lead';
  el('leadName').value = lead ? lead.name : '';
  el('leadEmail').value = lead ? (lead.contactEmail || '') : '';
  el('leadSource').value = lead ? (lead.source || '') : '';
  el('leadNotes').value = lead ? (lead.notes || '') : '';
  el('leadStage').innerHTML = stageOptionsHtml(lead ? lead.stage : DEFAULT_STAGE);
  el('deleteLeadBtn').style.display = lead ? 'inline-flex' : 'none';
  el('modalMsg').classList.add('hidden');
  el('leadModal').classList.remove('hidden');
}

function closeLeadModal() {
  el('leadModal').classList.add('hidden');
  editingLeadId = null;
}

// ── ClickUp sync ──
// Fire-and-forget: a failed sync never blocks saving the lead in the
// Hub (that's always the source of truth) - ClickUp is a mirror. No
// automatic retry - if this fails, the card shows "Syncing..." until
// the next edit/stage-change triggers another attempt.
async function syncToClickUp(lead) {
  try {
    const res = await fetch('/api/pipeline/sync-clickup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: lead.clickupTaskId || null,
        name: lead.name,
        stage: lead.stage,
        contactEmail: lead.contactEmail,
        source: lead.source,
        notes: lead.notes
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.taskId && data.taskId !== lead.clickupTaskId) {
      lead.clickupTaskId = data.taskId;
      await persist();
      renderBoard();
    } else if (!res.ok) {
      console.error('ClickUp sync failed:', data.error);
    }
  } catch (e) {
    console.error('ClickUp sync request failed:', e);
  }
}

el('addLeadBtn').addEventListener('click', () => openLeadModal(null));
el('cancelLeadBtn').addEventListener('click', closeLeadModal);
el('leadModal').addEventListener('click', (e) => {
  if (e.target.id === 'leadModal') closeLeadModal();
});

el('saveLeadBtn').addEventListener('click', async () => {
  const name = el('leadName').value.trim();
  const msgEl = el('modalMsg');
  msgEl.classList.add('hidden');

  if (!name) {
    msgEl.textContent = 'Enter a name or company.';
    msgEl.classList.remove('hidden');
    return;
  }

  const stage = el('leadStage').value;
  const contactEmail = el('leadEmail').value.trim();
  const source = el('leadSource').value.trim();
  const notes = el('leadNotes').value.trim();

  let lead;
  let needsSync;
  if (editingLeadId) {
    lead = leads.find(l => l.id === editingLeadId);
    needsSync = lead.stage !== stage || lead.name !== name; // resync on stage or name change
    Object.assign(lead, { name, contactEmail, source, notes, stage, updatedDate: todayStr() });
  } else {
    lead = {
      id: 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name, contactEmail, source, notes, stage,
      clickupTaskId: null,
      createdDate: todayStr(),
      updatedDate: todayStr()
    };
    leads.push(lead);
    needsSync = true; // brand new - needs its first ClickUp task created
  }

  const ok = await persist();
  closeLeadModal();
  renderBoard();
  if (ok && needsSync) syncToClickUp(lead);
});

el('deleteLeadBtn').addEventListener('click', async () => {
  if (!editingLeadId) return;
  if (!confirm('Delete this lead from the Hub? This does not delete its ClickUp task.')) return;
  leads = leads.filter(l => l.id !== editingLeadId);
  await persist();
  closeLeadModal();
  renderBoard();
});

document.addEventListener('DOMContentLoaded', async () => {
  await loadLeads();
  renderBoard();
});
