/* ============================================================
   WEEKLY ACCOUNT MANAGEMENT CHECK-IN — APP LOGIC
   Per-client (active workspace). Stores a dated array of weekly
   submissions on client.weeklyCheckins - matches the Weekly
   Account Management Questionnaire in the CRM Guidelines SOP.
   The healthRating field feeds the Overview Dashboard.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.getActiveClient === 'function') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const FIELD_IDS = [
  'q1_communication', 'q1_responsive', 'q1_unresolved', 'q1_feedback', 'q1_actOn',
  'q2_onTime', 'q2_behind', 'q2_technical', 'q2_reviewedData', 'q2_trending', 'q2_budgetPacing', 'q2_optimizations',
  'healthRating', 'healthChanged', 'warningSigns', 'seeingValue', 'proactiveIdeas',
  'deliveryLeadOk', 'billingUpToDate', 'billingStatus', 'scopeCreep', 'upsellOpportunity',
  'priority1', 'priority2', 'priority3'
];

function el(id) { return document.getElementById(id); }

function getClient() {
  if (isEmbedded) {
    try { return window.parent.getActiveClient(); } catch (e) { return null; }
  }
  return null;
}

function persist() {
  if (isEmbedded) {
    window.parent.saveDatabase();
    if (window.parent.renderDashboard) window.parent.renderDashboard();
  }
}

function todayStr() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function showFormStatus(message, type) {
  const status = el('formStatus');
  status.textContent = message;
  status.className = 'form-status' + (type ? ' ' + type : '');
  if (message) setTimeout(() => { status.textContent = ''; status.className = 'form-status'; }, 4000);
}

function gatherForm() {
  const entry = { date: el('checkinDate').value || todayStr() };
  FIELD_IDS.forEach(id => { entry[id] = el(id).value; });
  return entry;
}

function loadFormBlank() {
  el('checkinDate').value = todayStr();
  FIELD_IDS.forEach(id => {
    const field = el(id);
    field.value = field.tagName === 'SELECT' ? field.options[0].value : '';
  });
}

function saveCheckin() {
  const client = getClient();
  if (!client) return;
  const entry = gatherForm();

  if (!client.weeklyCheckins) client.weeklyCheckins = [];

  // Snapshot the current latest rating before this save so a flip to Green
  // can be detected afterward (used for the testimonial-ask nudge below).
  const priorRating = client.weeklyCheckins.length ? client.weeklyCheckins[0].healthRating : null;

  // If a check-in already exists for this exact date, overwrite it instead
  // of creating a duplicate row (re-saving the same week updates it).
  const existingIdx = client.weeklyCheckins.findIndex(c => c.date === entry.date);
  if (existingIdx >= 0) {
    client.weeklyCheckins[existingIdx] = entry;
  } else {
    client.weeklyCheckins.unshift(entry);
  }
  client.weeklyCheckins.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  persist();
  renderHistory();
  showFormStatus('Saved.', 'success');

  if (window.parent.showBanner) {
    window.parent.showBanner('success', `Check-in saved for ${client.name} — Health: ${entry.healthRating}.`);
  }

  // Health just flipped to Green (only fires on the flip, not on every
  // Green check-in in a row, and only when this save is the client's
  // current/latest entry) - a good, low-effort moment to ask for a
  // testimonial while the client is happy, rather than relying on memory.
  const isLatestEntry = client.weeklyCheckins[0] && client.weeklyCheckins[0].date === entry.date;
  if (isLatestEntry && entry.healthRating === 'Green' && priorRating !== 'Green' && window.parent.pushAdminNotification) {
    window.parent.pushAdminNotification('testimonial_prompt', `${client.name}'s health just turned Green — good time to ask for a testimonial.`, client.name);
  }
}

function deleteCheckin(date) {
  const client = getClient();
  if (!client || !client.weeklyCheckins) return;
  if (!confirm(`Delete the check-in for the week of ${date}?`)) return;
  client.weeklyCheckins = client.weeklyCheckins.filter(c => c.date !== date);
  persist();
  renderHistory();
}

function healthTagClass(rating) {
  if (rating === 'Green') return 'health-green';
  if (rating === 'Yellow') return 'health-yellow';
  if (rating === 'Red') return 'health-red';
  return '';
}

function renderHistory() {
  const client = getClient();
  const history = (client && client.weeklyCheckins) ? client.weeklyCheckins : [];
  const tbody = el('historyBody');
  tbody.innerHTML = '';
  el('historyEmpty').style.display = history.length === 0 ? 'block' : 'none';

  history.forEach(entry => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="date-cell">${entry.date}</td>
      <td><span class="section-tag ${healthTagClass(entry.healthRating)}">${entry.healthRating || '--'}</span></td>
      <td>${entry.q1_responsive || '--'}</td>
      <td>${entry.q2_onTime || '--'}</td>
      <td>${entry.priority1 || '--'}</td>
      <td>
        <div class="row-actions">
          <button class="load-btn" data-date="${entry.date}">Load</button>
          <button class="delete-btn" data-date="${entry.date}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.load-btn').forEach(btn => {
    btn.addEventListener('click', () => loadCheckin(btn.getAttribute('data-date')));
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteCheckin(btn.getAttribute('data-date')));
  });
}

function loadCheckin(date) {
  const client = getClient();
  const entry = (client.weeklyCheckins || []).find(c => c.date === date);
  if (!entry) return;
  el('checkinDate').value = entry.date;
  FIELD_IDS.forEach(id => { if (entry[id] !== undefined) el(id).value = entry[id]; });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
  const client = getClient();
  if (!client) {
    el('notEmbeddedState').style.display = 'block';
    el('checkinContent').style.display = 'none';
    return;
  }
  el('notEmbeddedState').style.display = 'none';
  el('checkinContent').style.display = '';
  el('clientNameLabel').textContent = client.name || '';

  loadFormBlank();
  renderHistory();
  el('saveCheckinBtn').addEventListener('click', saveCheckin);
});
