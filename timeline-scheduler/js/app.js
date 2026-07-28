/* ============================================================
   TIMELINE SCHEDULER — APP LOGIC
   Client-scoped project timeline: phases, target/actual dates,
   status, notes, sub-items. Backed by the hub's clientsDb (per
   client) plus an agency-level shared Template Library (Firestore
   doc "agency/timelineTemplates", same optimistic-concurrency
   pattern as Contract & Invoice Tracker's "agency/contractTemplates").
   ============================================================ */

const isEmbedded = window.parent && window.parent !== window;

let templateLibrary = [];       // agency-level custom templates (in addition to DEFAULT_TEMPLATES)
let templateLibraryDocVersion = 0;
let editingTemplateId = null;   // set when the template editor is open for an existing template

/* ---------- helpers ---------- */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function addDaysISO(baseISO, days) {
  const d = new Date(baseISO + 'T00:00:00');
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function allTemplates() {
  return [...DEFAULT_TEMPLATES, ...templateLibrary];
}

function findTemplate(templateId) {
  return allTemplates().find(t => t.id === templateId) || null;
}

function getClient() {
  if (isEmbedded && window.parent.getActiveClient) {
    return window.parent.getActiveClient();
  }
  return null;
}

function persistClient() {
  if (isEmbedded && window.parent.saveDatabase) {
    window.parent.saveDatabase();
  }
}

function showBanner(type, message) {
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner(type, message);
  }
}

/* ---------- agency-level Template Library (Firestore) ---------- */

function getTemplateLibraryDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "timelineTemplates");
}

async function loadTemplateLibrary() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getTemplateLibraryDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      templateLibrary = (data && data.list) || [];
      templateLibraryDocVersion = (data && data.version) || 0;
    } catch (e) {
      console.error("Couldn't load the timeline template library:", e);
      templateLibrary = [];
    }
  }
  renderTemplateLibrary();
  renderTemplatePicker();
}

async function persistTemplateLibrary() {
  if (!isEmbedded || !window.parent.firebaseSetDocFromJSON || !window.parent.firebaseGetDoc) {
    showBanner('error', "Can't save the template library outside the Hub.");
    return false;
  }
  try {
    const ref = getTemplateLibraryDocRef();
    const freshSnap = await window.parent.firebaseGetDoc(ref);
    const freshData = freshSnap && freshSnap.exists ? freshSnap.data() : null;
    const freshVersion = (freshData && freshData.version) || 0;
    if (freshVersion !== templateLibraryDocVersion) {
      showBanner('error', "Someone else updated the timeline template library while you had it open. Reload to see their changes.");
      return false;
    }
    templateLibraryDocVersion = freshVersion + 1;
    await window.parent.firebaseSetDocFromJSON(ref, JSON.stringify({ list: templateLibrary, version: templateLibraryDocVersion }));
    return true;
  } catch (e) {
    console.error("Couldn't save the timeline template library:", e);
    showBanner('error', "Couldn't save: " + e.message);
    return false;
  }
}

/* ---------- template parsing (bulk textarea -> phases) ---------- */

function parseTemplatePhasesText(text) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
  return lines.map((line, i) => {
    const parts = line.split('|');
    const name = (parts[0] || '').trim();
    const offsetRaw = parts.length > 1 ? parseInt(parts[1].replace(/[^\d-]/g, ''), 10) : NaN;
    return {
      order: i + 1,
      name: name || `Phase ${i + 1}`,
      offsetDays: isNaN(offsetRaw) ? 0 : offsetRaw,
    };
  });
}

function templatePhasesToText(phases) {
  return (phases || []).map(p => `${p.name} | ${p.offsetDays}`).join('\n');
}

/* ---------- Template Library UI ---------- */

function renderTemplateLibrary() {
  const list = document.getElementById('templateLibraryList');
  if (!list) return;
  const templates = allTemplates();
  if (!templates.length) {
    list.innerHTML = `<p style="font-size:13px; color: var(--color-text-muted);">No templates yet.</p>`;
    return;
  }
  list.innerHTML = templates.map(t => `
    <div class="contract-library-row">
      <div>
        <div class="contract-library-name">${escapeHtml(t.name)}${t.builtIn ? ' <span style="font-weight:400; color: var(--color-text-muted); font-size:11px;">(built-in)</span>' : ''}</div>
        <div class="contract-library-meta">${escapeHtml(t.description || '')} · ${t.phases.length} phase${t.phases.length === 1 ? '' : 's'}</div>
      </div>
      <div class="contract-library-actions">
        <button type="button" class="edit-template-btn" data-id="${t.id}">${t.builtIn ? 'View' : 'Edit'}</button>
        ${t.builtIn ? '' : `<button type="button" class="delete-template-btn" data-id="${t.id}">Delete</button>`}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.edit-template-btn').forEach(btn => {
    btn.addEventListener('click', () => openTemplateEditor(btn.dataset.id));
  });
  list.querySelectorAll('.delete-template-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteTemplate(btn.dataset.id));
  });
}

function openTemplateEditor(templateId) {
  const editor = document.getElementById('templateEditor');
  const nameInput = document.getElementById('templateNameInput');
  const descInput = document.getElementById('templateDescInput');
  const phasesInput = document.getElementById('templatePhasesInput');
  const saveBtn = document.getElementById('saveTemplateBtn');

  if (templateId) {
    const t = findTemplate(templateId);
    if (!t) return;
    editingTemplateId = t.builtIn ? null : templateId; // built-ins are view-only, "Save" creates a copy instead
    nameInput.value = t.builtIn ? `${t.name} (copy)` : t.name;
    descInput.value = t.description || '';
    phasesInput.value = templatePhasesToText(t.phases);
    saveBtn.textContent = t.builtIn ? 'Save as New Template' : 'Save Template';
  } else {
    editingTemplateId = null;
    nameInput.value = '';
    descInput.value = '';
    phasesInput.value = '';
    saveBtn.textContent = 'Save Template';
  }
  editor.style.display = 'block';
}

function closeTemplateEditor() {
  document.getElementById('templateEditor').style.display = 'none';
  editingTemplateId = null;
}

async function saveTemplateFromEditor() {
  const name = document.getElementById('templateNameInput').value.trim();
  const description = document.getElementById('templateDescInput').value.trim();
  const phasesText = document.getElementById('templatePhasesInput').value;
  const phases = parseTemplatePhasesText(phasesText);

  if (!name) {
    showBanner('error', 'Give the template a name first.');
    return;
  }
  if (!phases.length) {
    showBanner('error', 'Add at least one phase.');
    return;
  }

  if (editingTemplateId) {
    const idx = templateLibrary.findIndex(t => t.id === editingTemplateId);
    if (idx > -1) {
      templateLibrary[idx] = { ...templateLibrary[idx], name, description, phases };
    }
  } else {
    templateLibrary.push({
      id: 'custom-' + Date.now(),
      name,
      description,
      builtIn: false,
      phases,
    });
  }

  const ok = await persistTemplateLibrary();
  if (ok) {
    showBanner('success', 'Template saved.');
    closeTemplateEditor();
    renderTemplateLibrary();
    renderTemplatePicker();
  }
}

async function deleteTemplate(templateId) {
  const t = templateLibrary.find(t => t.id === templateId);
  if (!t) return;
  if (!confirm(`Delete the "${t.name}" template? This won't affect clients already using it.`)) return;
  templateLibrary = templateLibrary.filter(t => t.id !== templateId);
  const ok = await persistTemplateLibrary();
  if (ok) {
    showBanner('success', 'Template deleted.');
    renderTemplateLibrary();
    renderTemplatePicker();
  }
}

/* ---------- client timeline shape + migration ---------- */

function ensureTimelineShape(client) {
  if (!client.timeline) {
    client.timeline = { templateId: null, projectStartDate: null, phases: [] };
    maybeSeedMigratedClient(client);
  }
  return client.timeline;
}

function maybeSeedMigratedClient(client) {
  const clientName = (isEmbedded && window.parent.getAllClients)
    ? Object.keys(window.parent.getAllClients() || {}).find(name => window.parent.getAllClients()[name] === client)
    : null;

  const activeClientName = window.__timelineActiveClientName || clientName;
  const seed = activeClientName ? MIGRATION_SEEDS[activeClientName] : null;
  if (!seed) return;

  const template = findTemplate(seed.templateId);
  if (!template) return;

  client.timeline.templateId = template.id;
  client.timeline.phases = template.phases.map(p => ({
    order: p.order,
    name: p.name,
    offsetDays: p.offsetDays,
    status: p.order <= seed.doneThroughOrder ? 'done' : 'not-started',
    targetDate: null,
    actualDate: null,
    overridden: false,
    notes: '',
    subItems: (p.subItems || []).map(label => ({ label, checked: p.order <= seed.doneThroughOrder })),
  }));
}

function applyTemplateToClient(client, templateId) {
  const template = findTemplate(templateId);
  if (!template) return;
  client.timeline.templateId = template.id;
  client.timeline.phases = template.phases.map(p => ({
    order: p.order,
    name: p.name,
    offsetDays: p.offsetDays,
    status: 'not-started',
    targetDate: null,
    actualDate: null,
    overridden: false,
    notes: '',
    subItems: (p.subItems || []).map(label => ({ label, checked: false })),
  }));
  if (client.timeline.projectStartDate) {
    recalculateDates(client.timeline, client.timeline.projectStartDate);
  }
}

function recalculateDates(timeline, startDateISO) {
  if (!startDateISO) return;
  timeline.phases.forEach(phase => {
    if (!phase.overridden) {
      phase.targetDate = addDaysISO(startDateISO, phase.offsetDays);
    }
  });
}

/* ---------- rendering ---------- */

function computeStatus(phase) {
  if (phase.status === 'done') return 'done';
  if (phase.status === 'in-progress') return 'in-progress';
  if (phase.targetDate && phase.targetDate < todayISO()) return 'overdue';
  return 'not-started';
}

function renderSummary(timeline) {
  const phases = timeline.phases || [];
  const total = phases.length;
  const done = phases.filter(p => p.status === 'done').length;
  const nextUp = phases
    .filter(p => p.status !== 'done')
    .sort((a, b) => a.order - b.order)[0];
  const overdueCount = phases.filter(p => p.status !== 'done' && p.targetDate && p.targetDate < todayISO()).length;
  const launchPhase = [...phases].reverse().find(p => /launch/i.test(p.name)) || phases[phases.length - 1];

  document.getElementById('statPhasesDone').textContent = `${done}/${total}`;
  document.getElementById('statNextUp').textContent = nextUp ? nextUp.name : '—';
  document.getElementById('statOverdue').textContent = String(overdueCount);
  document.getElementById('statLaunchDate').textContent = launchPhase ? formatDateShort(launchPhase.targetDate) : '—';

  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('timelineProgressFill').style.width = pct + '%';
}

function renderPhases(timeline) {
  const container = document.getElementById('phasesList');
  const phases = [...(timeline.phases || [])].sort((a, b) => a.order - b.order);

  if (!phases.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = phases.map((phase, idx) => {
    const status = computeStatus(phase);
    const subItemsHtml = (phase.subItems && phase.subItems.length) ? `
      <div class="phase-subitems">
        ${phase.subItems.map((si, siIdx) => `
          <label class="phase-subitem ${si.checked ? 'checked' : ''}">
            <input type="checkbox" data-order="${phase.order}" data-subidx="${siIdx}" class="subitem-checkbox" ${si.checked ? 'checked' : ''}>
            <span>${escapeHtml(si.label)}</span>
          </label>
        `).join('')}
      </div>
    ` : '';

    return `
    <div class="phase-card status-${status}" data-order="${phase.order}">
      <div class="phase-badge">${idx + 1}</div>
      <div class="phase-body">
        <div class="phase-top-row">
          <div class="phase-name">${escapeHtml(phase.name)}</div>
          ${status === 'overdue' ? '<span class="phase-overdue-tag">Overdue</span>' : ''}
        </div>
        <div class="phase-controls-row">
          <select class="phase-status-select" data-order="${phase.order}">
            <option value="not-started" ${phase.status === 'not-started' ? 'selected' : ''}>Not Started</option>
            <option value="in-progress" ${phase.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="done" ${phase.status === 'done' ? 'selected' : ''}>Done</option>
          </select>
          <span class="phase-date-label">Target</span>
          <input type="date" class="phase-date-input" data-order="${phase.order}" value="${phase.targetDate || ''}">
          ${phase.overridden ? '<span class="phase-overridden-tag">manually set</span>' : ''}
          ${phase.status === 'done' && phase.actualDate ? `<span class="phase-date-label" style="margin-left:8px;">Completed ${formatDateShort(phase.actualDate)}</span>` : ''}
          <button type="button" class="phase-remove-btn" data-order="${phase.order}">Remove</button>
        </div>
        <textarea class="phase-notes-input" data-order="${phase.order}" placeholder="Notes…" rows="1">${escapeHtml(phase.notes || '')}</textarea>
        ${subItemsHtml}
      </div>
    </div>
  `;
  }).join('') + `
    <div class="add-phase-row">
      <button type="button" id="addPhaseBtn" class="btn-secondary">+ Add Phase</button>
    </div>
  `;

  wirePhaseEvents(timeline);
}

function wirePhaseEvents(timeline) {
  const container = document.getElementById('phasesList');

  container.querySelectorAll('.phase-status-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const phase = timeline.phases.find(p => p.order == sel.dataset.order);
      if (!phase) return;
      phase.status = sel.value;
      if (sel.value === 'done' && !phase.actualDate) {
        phase.actualDate = todayISO();
      } else if (sel.value !== 'done') {
        phase.actualDate = null;
      }
      persistClient();
      renderAll();
    });
  });

  container.querySelectorAll('.phase-date-input').forEach(input => {
    input.addEventListener('change', () => {
      const phase = timeline.phases.find(p => p.order == input.dataset.order);
      if (!phase) return;
      phase.targetDate = input.value || null;
      phase.overridden = true;
      persistClient();
      renderAll();
    });
  });

  container.querySelectorAll('.phase-notes-input').forEach(input => {
    input.addEventListener('change', () => {
      const phase = timeline.phases.find(p => p.order == input.dataset.order);
      if (!phase) return;
      phase.notes = input.value;
      persistClient();
    });
  });

  container.querySelectorAll('.subitem-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const phase = timeline.phases.find(p => p.order == cb.dataset.order);
      if (!phase || !phase.subItems) return;
      const si = phase.subItems[Number(cb.dataset.subidx)];
      if (!si) return;
      si.checked = cb.checked;
      persistClient();
      renderPhases(timeline);
      renderSummary(timeline);
    });
  });

  container.querySelectorAll('.phase-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Remove this phase from the timeline?')) return;
      timeline.phases = timeline.phases.filter(p => p.order != btn.dataset.order);
      persistClient();
      renderAll();
    });
  });

  const addBtn = document.getElementById('addPhaseBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const name = prompt('New phase name:');
      if (!name) return;
      const maxOrder = timeline.phases.reduce((max, p) => Math.max(max, p.order), 0);
      timeline.phases.push({
        order: maxOrder + 1,
        name,
        offsetDays: 0,
        status: 'not-started',
        targetDate: null,
        actualDate: null,
        overridden: false,
        notes: '',
        subItems: [],
      });
      persistClient();
      renderAll();
    });
  }
}

function renderTemplatePicker() {
  const client = getClient();
  const noTimelineCard = document.getElementById('noTimelineCard');
  const switchTrigger = document.getElementById('switchTemplateTrigger');
  if (!client) return;
  const timeline = ensureTimelineShape(client);
  const hasPhases = timeline.phases && timeline.phases.length > 0;

  noTimelineCard.style.display = hasPhases ? 'none' : 'block';
  switchTrigger.style.display = hasPhases ? 'block' : 'none';

  if (hasPhases) {
    const current = findTemplate(timeline.templateId);
    document.getElementById('currentTemplateName').textContent = current ? current.name : 'Custom / Manually Built';
    return;
  }

  const list = document.getElementById('templatePickerList');
  const templates = allTemplates();
  list.innerHTML = templates.map(t => `
    <div class="template-picker-row">
      <div>
        <div class="template-picker-name">${escapeHtml(t.name)}</div>
        <div class="template-picker-desc">${escapeHtml(t.description || '')}</div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="template-picker-count">${t.phases.length} phases</span>
        <button type="button" class="btn-primary apply-template-btn" data-id="${t.id}">Use This Template</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.apply-template-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = getClient();
      if (!c) return;
      applyTemplateToClient(c, btn.dataset.id);
      persistClient();
      renderAll();
    });
  });
}

function renderSwitchTemplateList() {
  const client = getClient();
  if (!client) return;
  const timeline = ensureTimelineShape(client);
  const list = document.getElementById('switchTemplateList');
  const templates = allTemplates();

  list.innerHTML = templates.map(t => `
    <div class="template-picker-row">
      <div>
        <div class="template-picker-name">${escapeHtml(t.name)}${t.id === timeline.templateId ? ' <span style="font-weight:400; color: var(--color-text-muted); font-size:11px;">(current)</span>' : ''}</div>
        <div class="template-picker-desc">${escapeHtml(t.description || '')}</div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="template-picker-count">${t.phases.length} phases</span>
        <button type="button" class="btn-primary switch-template-btn" data-id="${t.id}" ${t.id === timeline.templateId ? 'disabled' : ''}>Switch to This</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.switch-template-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = findTemplate(btn.dataset.id);
      if (!t) return;
      if (!confirm(`Switch to "${t.name}"? This replaces every phase currently on this client's timeline - existing statuses, dates, and notes will be lost.`)) return;
      const c = getClient();
      if (!c) return;
      applyTemplateToClient(c, t.id);
      persistClient();
      document.getElementById('switchTemplateCard').style.display = 'none';
      renderAll();
      showBanner('success', `Switched to "${t.name}".`);
    });
  });
}

function renderAll() {
  const client = getClient();
  if (!client) return;
  const timeline = ensureTimelineShape(client);

  const nameEl = document.getElementById('timelineClientName');
  if (nameEl) {
    nameEl.textContent = window.__timelineActiveClientName ? `Client: ${window.__timelineActiveClientName}` : '';
  }

  const startInput = document.getElementById('projectStartDate');
  if (startInput) startInput.value = timeline.projectStartDate || '';

  renderTemplatePicker();
  renderSummary(timeline);
  renderPhases(timeline);
}

/* ---------- top-level event wiring ---------- */

function wireStaticEvents() {
  document.getElementById('recalculateBtn').addEventListener('click', () => {
    const client = getClient();
    if (!client) return;
    const timeline = ensureTimelineShape(client);
    const startDate = document.getElementById('projectStartDate').value;
    if (!startDate) {
      showBanner('error', 'Pick a Project Start Date first.');
      return;
    }
    timeline.projectStartDate = startDate;
    recalculateDates(timeline, startDate);
    persistClient();
    renderAll();
    const status = document.getElementById('startDateStatus');
    status.textContent = 'Dates recalculated from ' + formatDateShort(startDate) + '.';
    status.classList.add('success');
  });

  document.getElementById('projectStartDate').addEventListener('change', () => {
    const client = getClient();
    if (!client) return;
    const timeline = ensureTimelineShape(client);
    timeline.projectStartDate = document.getElementById('projectStartDate').value || null;
    persistClient();
  });

  document.getElementById('openTemplateLibraryBtn').addEventListener('click', () => {
    document.getElementById('templateLibraryCard').style.display = 'block';
    closeTemplateEditor();
  });
  document.getElementById('templateLibraryCloseBtn').addEventListener('click', () => {
    document.getElementById('templateLibraryCard').style.display = 'none';
    closeTemplateEditor();
  });
  document.getElementById('newTemplateBtn').addEventListener('click', () => openTemplateEditor(null));
  document.getElementById('saveTemplateBtn').addEventListener('click', saveTemplateFromEditor);
  document.getElementById('cancelTemplateBtn').addEventListener('click', closeTemplateEditor);

  document.getElementById('openSwitchTemplateBtn').addEventListener('click', () => {
    renderSwitchTemplateList();
    document.getElementById('switchTemplateCard').style.display = 'block';
  });
  document.getElementById('switchTemplateCloseBtn').addEventListener('click', () => {
    document.getElementById('switchTemplateCard').style.display = 'none';
  });
}

/* ---------- init ---------- */

async function init() {
  if (isEmbedded && window.parent.getAllClients) {
    const all = window.parent.getAllClients() || {};
    const active = getClient();
    window.__timelineActiveClientName = Object.keys(all).find(name => all[name] === active) || null;
  }

  wireStaticEvents();
  await loadTemplateLibrary();
  renderAll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
