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

// Minimum gap between two auto-sent testimonial asks to the same client
// - see the Green-flip handler in saveCheckin below. A relationship's
// "happy enough to ask" moment doesn't repeat weekly just because health
// flips back and forth; roughly two quarters is long enough that asking
// again reads as a genuine new moment, not a repeat of the same email.
const TESTIMONIAL_ASK_COOLDOWN_DAYS = 180;

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
  //
  // Auto-sends for real (Aug 2026 - previously this only created a
  // notification with a one-click Send button, which still depended on
  // someone noticing the bell). Two guards keep this from ever spamming
  // a client: skip entirely if they've already left a testimonial
  // (client.testimonialSubmission), and skip if one was already sent to
  // them in the last TESTIMONIAL_ASK_COOLDOWN_DAYS - health can flip
  // Green/Yellow/Green repeatedly without that meaning "ask again."
  // client.lastTestimonialAskSentAt is the only record of that cooldown
  // (there's no other durable log of an auto-sent email), so it's
  // persisted here on the client itself, admin-side only - not a
  // client-writable field, so no firestore.rules change needed.
  const isLatestEntry = client.weeklyCheckins[0] && client.weeklyCheckins[0].date === entry.date;
  if (isLatestEntry && entry.healthRating === 'Green' && priorRating !== 'Green') {
    const alreadyTestimonial = !!(client.testimonialSubmission && client.testimonialSubmission.quote);
    const daysSinceLastAsk = client.lastTestimonialAskSentAt
      ? Math.floor((Date.now() - new Date(client.lastTestimonialAskSentAt).getTime()) / 86400000)
      : Infinity;
    const onCooldown = daysSinceLastAsk < TESTIMONIAL_ASK_COOLDOWN_DAYS;

    if (!alreadyTestimonial && !onCooldown && window.parent.buildTestimonialAskDraftEmail) {
      const draftEmail = window.parent.buildTestimonialAskDraftEmail(client, client.name);
      if (draftEmail && draftEmail.sendEnabled && draftEmail.to) {
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: draftEmail.to, subject: draftEmail.subject, body: draftEmail.body, from: draftEmail.from })
        }).then(res => res.ok ? res.json() : Promise.reject(new Error('Send failed'))).then(data => {
          if (!data.success) throw new Error(data.error || 'Send failed');
          client.lastTestimonialAskSentAt = new Date().toISOString();
          persist();
          if (window.parent.pushAdminNotification) {
            window.parent.pushAdminNotification('testimonial_prompt', `${client.name}'s health just turned Green — testimonial ask sent automatically.`, client.name, null);
          }
        }).catch(err => {
          console.warn('Auto-send testimonial ask failed, falling back to a reviewable draft:', err);
          if (window.parent.pushAdminNotification) {
            window.parent.pushAdminNotification('testimonial_prompt', `${client.name}'s health just turned Green — auto-send failed, review and send manually.`, client.name, draftEmail);
          }
        });
      } else if (window.parent.pushAdminNotification) {
        // No account manager configured (no sendEnabled) or no client
        // contact email on file - same as before, falls back to a
        // draft someone has to send themselves.
        window.parent.pushAdminNotification('testimonial_prompt', `${client.name}'s health just turned Green — good time to ask for a testimonial.`, client.name, draftEmail);
      }
    }
  }

  // Same flip-detection idea as the Green case above, opposite direction:
  // health just turned Red - the single most urgent churn-risk signal this
  // tool produces, but previously it only surfaced if someone happened to
  // open this client's check-in history or Agency Health Dashboard's
  // table. No draft email here (unlike the testimonial ask) - this is an
  // internal heads-up for the account manager to act on, not something
  // meant to go out to the client.
  if (isLatestEntry && entry.healthRating === 'Red' && priorRating !== 'Red' && window.parent.pushAdminNotification) {
    window.parent.pushAdminNotification('health_red_flip', `${client.name}'s health just turned Red - worth a look.`, client.name, null);
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
