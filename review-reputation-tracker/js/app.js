let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.getAllClients === 'function') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const SANDBOX_NAME = "Quick Sandbox (One-Offs)";
const STALE_CHECKIN_DAYS = 30; // flag a business as needing attention once its last logged rating is this many days old

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

function populateClientSelect() {
  const clients = getClients();
  const select = el('newClientSelect');
  const current = select.value;
  select.innerHTML = '<option value="">Select a client...</option>';
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    if (clients[name].reputationTracking) return; // already tracked
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  if (current) select.value = current;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const then = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  return Math.floor((now - then) / 86400000);
}

// Compares the two most recent check-ins. Returns null if there's not
// enough history yet (0 or 1 entries) - nothing to compare against, so
// no trend badge should render rather than a misleading "flat".
function getTrend(history) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const latest = history[history.length - 1];
  const prev = history[history.length - 2];
  const delta = Math.round((latest.rating - prev.rating) * 10) / 10;
  if (delta > 0) return { direction: 'up', delta };
  if (delta < 0) return { direction: 'down', delta };
  return { direction: 'flat', delta: 0 };
}

function needsAttention(tracked) {
  const history = tracked.history || [];
  if (history.length === 0) return true; // tracked but never checked in
  const latest = history[history.length - 1];
  if (daysSince(latest.date) > STALE_CHECKIN_DAYS) return true;
  const trend = getTrend(history);
  if (trend && trend.direction === 'down') return true;
  return false;
}

function renderSummary(trackedEntries) {
  el('summaryTracked').textContent = trackedEntries.length;

  let improved = 0;
  let attention = 0;
  trackedEntries.forEach(({ tracked }) => {
    const trend = getTrend(tracked.history || []);
    if (trend && trend.direction === 'up') improved++;
    if (needsAttention(tracked)) attention++;
  });
  el('summaryImproved').textContent = improved;
  el('summaryAttention').textContent = attention;
}

function historyRowHtml(entry) {
  const note = entry.note ? `<span class="history-note">${escapeHtml(entry.note)}</span>` : '';
  return `<div class="history-row">
    <span class="history-date">${entry.date}</span>
    <span>${entry.rating.toFixed(1)} ★ &middot; ${entry.reviewCount} reviews</span>
    ${note}
  </div>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderTable() {
  const clients = getClients();
  const listEl = el('trackerList');
  listEl.innerHTML = '';

  const trackedEntries = Object.keys(clients)
    .filter(name => clients[name].reputationTracking)
    .map(name => ({ name, tracked: clients[name].reputationTracking }));

  el('emptyState').style.display = trackedEntries.length === 0 ? 'flex' : 'none';
  renderSummary(trackedEntries);

  trackedEntries.forEach(({ name, tracked }) => {
    const history = tracked.history || [];
    const latest = history.length ? history[history.length - 1] : null;
    const trend = getTrend(history);
    const attention = needsAttention(tracked);

    const card = document.createElement('div');
    card.className = 'reputation-card' + (attention ? ' needs-attention' : '');

    const trendHtml = trend
      ? `<span class="rating-trend trend-${trend.direction}">${trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '–'} ${trend.delta > 0 ? '+' : ''}${trend.delta.toFixed(1)}</span>`
      : '';

    const ratingHtml = latest
      ? `<span class="rating-number">${latest.rating.toFixed(1)}</span><span class="rating-star">★</span><span class="rating-count">${latest.reviewCount} reviews</span>${trendHtml}`
      : `<span class="rating-count">No check-in logged yet</span>`;

    const lastCheckedText = latest
      ? (daysSince(latest.date) > STALE_CHECKIN_DAYS
          ? `Last checked ${daysSince(latest.date)}d ago - overdue for a new check-in`
          : `Last checked ${daysSince(latest.date)}d ago (${latest.date})`)
      : 'Never checked';

    const historyHtml = history.length
      ? `<div class="history-list">${history.slice().reverse().map(historyRowHtml).join('')}</div>`
      : '';

    card.innerHTML = `
      <div class="card-header">
        <div>
          <h3 class="card-title">${escapeHtml(name)}</h3>
          <span class="card-type">${escapeHtml(tracked.platform || 'Google')}</span>
        </div>
        <button class="btn-remove-action delete-btn" data-client="${escapeHtml(name)}" title="Stop tracking">✕</button>
      </div>

      <div class="rating-display">${ratingHtml}</div>
      <div class="last-checked ${latest && daysSince(latest.date) > STALE_CHECKIN_DAYS ? 'overdue' : ''}">${lastCheckedText}</div>

      ${historyHtml}

      <div class="checkin-form">
        <div class="form-group">
          <label>New Rating (0-5)</label>
          <input type="text" inputmode="decimal" class="form-control checkin-rating-input" data-client="${escapeHtml(name)}" placeholder="4.6">
        </div>
        <div class="form-group">
          <label>Review Count</label>
          <input type="text" inputmode="decimal" class="form-control checkin-count-input" data-client="${escapeHtml(name)}" placeholder="94">
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" class="form-control checkin-date-input" data-client="${escapeHtml(name)}" value="${todayStr()}">
        </div>
        <div class="form-group">
          <label>Platform</label>
          <select class="form-control checkin-platform-input" data-client="${escapeHtml(name)}">
            <option value="Google"${tracked.platform === 'Google' ? ' selected' : ''}>Google</option>
            <option value="Yelp"${tracked.platform === 'Yelp' ? ' selected' : ''}>Yelp</option>
            <option value="Facebook"${tracked.platform === 'Facebook' ? ' selected' : ''}>Facebook</option>
            <option value="Other"${tracked.platform === 'Other' ? ' selected' : ''}>Other</option>
          </select>
        </div>
        <div class="form-group full">
          <label>Note (optional)</label>
          <input type="text" class="form-control checkin-note-input" data-client="${escapeHtml(name)}" placeholder="e.g. NFC cards deployed this week">
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-primary log-checkin-btn" data-client="${escapeHtml(name)}">Log Check-In</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  wireListeners();
}

function wireListeners() {
  const clients = getClients();

  document.querySelectorAll('.checkin-rating-input').forEach(inp => {
    if (typeof attachSpinnerButtons === 'function') attachSpinnerButtons(inp, { step: 0.1, min: 0, max: 5 });
  });
  document.querySelectorAll('.checkin-count-input').forEach(inp => {
    if (typeof attachCommaFormatting === 'function') attachCommaFormatting(inp);
    if (typeof attachSpinnerButtons === 'function') attachSpinnerButtons(inp, { step: 1, min: 0 });
  });

  document.querySelectorAll('.log-checkin-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.getAttribute('data-client');
      const card = e.target.closest('.reputation-card');
      const ratingInput = card.querySelector('.checkin-rating-input');
      const countInput = card.querySelector('.checkin-count-input');
      const dateInput = card.querySelector('.checkin-date-input');
      const platformInput = card.querySelector('.checkin-platform-input');
      const noteInput = card.querySelector('.checkin-note-input');

      const rating = parseFormattedNumber(ratingInput.value);
      if (!ratingInput.value || rating <= 0 || rating > 5) {
        alert("Enter a rating between 0.1 and 5.");
        return;
      }
      const reviewCount = parseFormattedNumber(countInput.value) || 0;
      const date = dateInput.value || todayStr();

      const tracked = clients[name].reputationTracking;
      tracked.platform = platformInput.value;
      tracked.history = tracked.history || [];
      tracked.history.push({ date, rating, reviewCount, note: noteInput.value.trim() });
      // Keep history sorted by date in case someone backfills an older
      // check-in out of order - trend/latest logic above assumes the
      // last array entry is the most recent.
      tracked.history.sort((a, b) => a.date.localeCompare(b.date));

      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.getAttribute('data-client');
      if (!confirm(`Stop tracking reputation for ${name}? This deletes its logged history.`)) return;
      delete clients[name].reputationTracking;
      persist();
      populateClientSelect();
      renderTable();
    });
  });
}

el('addTrackerBtn').addEventListener('click', () => {
  const clientName = el('newClientSelect').value;
  if (!clientName) {
    alert("Select a client first.");
    return;
  }
  const platform = el('newPlatformSelect').value;

  const clients = getClients();
  clients[clientName].reputationTracking = {
    platform,
    history: []
  };

  persist();
  el('newClientSelect').value = '';
  populateClientSelect();
  renderTable();
});

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  renderTable();

  // Same iframe-race guard used across the Hub's other cross-client
  // tools: the parent's client database loads asynchronously, so poll
  // briefly and re-render once real data shows up if this iframe
  // finished loading first.
  let clientPollAttempts = 0;
  const clientPoll = setInterval(() => {
    clientPollAttempts++;
    const hasClients = Object.keys(getClients()).length > 0;
    if (hasClients || clientPollAttempts > 30) {
      clearInterval(clientPoll);
      if (hasClients) {
        populateClientSelect();
        renderTable();
      }
    }
  }, 250);
});
