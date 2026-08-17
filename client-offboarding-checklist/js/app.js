/* ============================================================
   CLIENT CHECKLISTS — APP LOGIC
   2 tabs sharing one tool: Client Checklist (Paid Client + Free Client
   Wrap-Up merged together - see CLIENT_CHECKLIST_CATEGORIES in
   js/data.js) and Offboarding (what this tool started as, unchanged).
   Per-client (active workspace), mirrors the audit-tool pattern:
   window.parent.getActiveClient() / window.parent.saveDatabase().

   Only the Offboarding tab carries the extra "started date" field and
   the auto-deactivate-portal side effect on 100% completion - Client
   Checklist is a plain checked+notes checklist, deliberately simpler
   since finishing it isn't a terminal event the way finishing
   offboarding is.
   ============================================================ */

const TABS = [
  { key: "client", label: "Client Checklist", categories: CLIENT_CHECKLIST_CATEGORIES, stateField: "clientChecklistTool", isOffboarding: false },
  { key: "offboarding", label: "Offboarding", categories: OFFBOARDING_CATEGORIES, stateField: "offboarding", isOffboarding: true }
];

let activeTabKey = "client";

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.getActiveClient === 'function') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

function el(id) { return document.getElementById(id); }

function getActiveTab() {
  return TABS.find(t => t.key === activeTabKey) || TABS[0];
}

function getClient() {
  if (isEmbedded) {
    try { return window.parent.getActiveClient(); } catch (e) { return null; }
  }
  return null;
}

function ensureState(client, tab) {
  if (!client[tab.stateField]) {
    client[tab.stateField] = tab.isOffboarding
      ? { checked: {}, notes: "", startedDate: "" }
      : { checked: {}, notes: "" };
  }
  const state = client[tab.stateField];
  if (!state.checked) state.checked = {};
  if (state.notes === undefined) state.notes = "";
  if (tab.isOffboarding) {
    if (state.startedDate === undefined) state.startedDate = "";
    if (state.completedAt === undefined) state.completedAt = null;
  }
  return state;
}

// Runs exactly once, the moment the Offboarding checklist first hits
// 100% (guarded by completedAt so re-rendering or toggling an item back
// off-and-on doesn't re-fire it - only the Reset button, which wipes
// state.offboarding entirely, clears this back to null). Deactivates the
// client's portal (see the disabled check added to portal/js/app.js's
// init()) and logs the access removal, matching the documented
// Offboarding Flow's "Platform access transferred back to client | All
// Revital team access removed" and "Hub portal deactivated" steps.
// Deliberately only wired to the Offboarding tab - Paid Client and Free
// Client Wrap-Up reaching 100% doesn't mean the relationship is ending.
function completeOffboarding(client, state) {
  state.completedAt = new Date().toISOString();
  if (!client.portalConfig) client.portalConfig = {};
  client.portalConfig.disabled = true;
  client.portalConfig.disabledAt = state.completedAt;
  client.portalConfig.disabledReason = "Offboarding checklist completed";
  persist();
  if (window.parent.logAdminActivity) window.parent.logAdminActivity('Client offboarding completed', `${client.name} — portal deactivated`);
  if (window.parent.pushAdminNotification) {
    window.parent.pushAdminNotification('offboarding_complete', `${client.name}'s offboarding checklist is complete. Their Hub portal has been deactivated.`, client.name);
  }
  if (window.parent.showBanner) window.parent.showBanner('success', `Offboarding complete - ${client.name}'s portal is now deactivated.`);
}

function reactivatePortal(client) {
  if (!confirm(`Reactivate ${client.name}'s client portal? They'll be able to log back in immediately.`)) return;
  if (client.portalConfig) {
    client.portalConfig.disabled = false;
  }
  persist();
  if (window.parent.logAdminActivity) window.parent.logAdminActivity('Client portal reactivated', client.name);
  render();
}

function persist() {
  if (isEmbedded) {
    window.parent.saveDatabase();
    if (window.parent.renderDashboard) window.parent.renderDashboard();
  }
}

function getStats(categories, state) {
  let total = 0;
  let done = 0;
  categories.forEach(cat => {
    cat.items.forEach(item => {
      total++;
      if (state.checked[item.id]) done++;
    });
  });
  return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

function renderTabBar() {
  const bar = el('checklistTabs');
  bar.innerHTML = TABS.map(t =>
    `<button type="button" class="checklist-tab-btn${t.key === activeTabKey ? ' active' : ''}" data-tab-key="${t.key}">${t.label}</button>`
  ).join('');
  bar.querySelectorAll('.checklist-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTabKey = btn.getAttribute('data-tab-key');
      render();
    });
  });
}

function render() {
  const client = getClient();
  if (!client) {
    el('notEmbeddedState').style.display = 'block';
    el('checklistContent').style.display = 'none';
    return;
  }
  el('notEmbeddedState').style.display = 'none';
  el('checklistContent').style.display = '';

  renderTabBar();

  const tab = getActiveTab();
  const state = ensureState(client, tab);
  el('clientNameLabel').textContent = client.name || '';
  el('checklistNotes').value = state.notes || '';

  el('startedDateRow').style.display = tab.isOffboarding ? '' : 'none';
  if (tab.isOffboarding) {
    el('startedDateInput').value = state.startedDate || '';
  }

  const { total, done, pct } = getStats(tab.categories, state);
  el('progressFill').style.width = pct + '%';
  el('progressText').textContent = `${done} of ${total} items complete`;
  el('progressPct').textContent = pct + '%';

  const container = el('categoriesList');
  container.innerHTML = tab.categories.map(cat => {
    const catDone = cat.items.filter(i => state.checked[i.id]).length;
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
                <input type="checkbox" class="checklist-check" data-id="${item.id}" ${state.checked[item.id] ? 'checked' : ''}>
                <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <span>${item.label}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.checklist-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const c = getClient();
      const t = getActiveTab();
      const s = ensureState(c, t);
      s.checked[cb.getAttribute('data-id')] = cb.checked;
      persist();
      render();
    });
  });

  const statusNote = el('portalStatusNote');
  if (tab.isOffboarding && pct === 100 && !state.completedAt) {
    completeOffboarding(client, state);
    // completeOffboarding persists and shows a banner; fall through so the
    // status note below reflects the completedAt it just set.
  }
  if (tab.isOffboarding && state.completedAt) {
    const completedDate = new Date(state.completedAt).toLocaleDateString();
    const isDisabled = client.portalConfig && client.portalConfig.disabled;
    statusNote.style.display = 'block';
    statusNote.innerHTML = `
      <div class="kp-note" style="background: var(--color-surface-2); border: 1px solid var(--color-border-md); border-radius: var(--radius-lg); padding: 12px 16px; font-size: 13px; color: var(--color-text-muted);">
        Offboarding completed ${completedDate}.${isDisabled ? ' Client portal is deactivated.' : ' Client portal is currently active.'}
        ${isDisabled ? `<button id="reactivatePortalBtn" class="btn btn-secondary-outline" style="margin-left:10px; padding:4px 10px; font-size:12px;">Reactivate Portal</button>` : ''}
      </div>
    `;
    if (isDisabled) {
      el('reactivatePortalBtn').addEventListener('click', () => reactivatePortal(client));
    }
  } else {
    statusNote.style.display = 'none';
    statusNote.innerHTML = '';
  }
}

function initListeners() {
  el('startedDateInput').addEventListener('change', () => {
    const client = getClient();
    const tab = getActiveTab();
    if (!tab.isOffboarding) return;
    const state = ensureState(client, tab);
    state.startedDate = el('startedDateInput').value;
    persist();
  });

  el('checklistNotes').addEventListener('input', () => {
    const client = getClient();
    const tab = getActiveTab();
    const state = ensureState(client, tab);
    state.notes = el('checklistNotes').value;
    persist();
  });

  el('resetBtn').addEventListener('click', () => {
    const tab = getActiveTab();
    if (!confirm(`Reset the ${tab.label} checklist for this client back to blank?`)) return;
    const client = getClient();
    client[tab.stateField] = tab.isOffboarding
      ? { checked: {}, notes: "", startedDate: "" }
      : { checked: {}, notes: "" };
    persist();
    render();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  render();
  initListeners();
});
