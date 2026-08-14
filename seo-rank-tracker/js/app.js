/* ============================================================
   SEO RANK TRACKER — APP LOGIC
   (cross-client: reads/writes every client's own `seoRankTracker`
   array, same clientsDb + saveDatabase() persistence pattern as
   Content Calendar / Referral Tracker). Manual position logging -
   doesn't pull from Search Console or any rank-tracking API, just
   keeps one running log per keyword so movement is visible between
   full SEO Audits instead of only showing up when someone remembers
   to check.

   Deliberately not wired to SEMrush's API (see the on-page note in
   index.html for the full reasoning): it requires their Business/
   Advanced plan (~$549/mo, on top of API unit purchases), and even
   with that plan you still have to set up a Position Tracking
   project per client in SEMrush's own dashboard first - the API only
   reads from an existing project, it doesn't check arbitrary
   keywords on demand. Worth revisiting if the agency ends up on that
   tier.
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
const STALE_DAYS = 30;

function el(id) { return document.getElementById(id); }

function getClients() {
  if (isEmbedded) {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  try {
    const saved = localStorage.getItem('seo-rank-tracker-clients');
    return saved ? JSON.parse(saved) : {};
  } catch (e) { return {}; }
}

function persist() {
  if (isEmbedded) {
    window.parent.saveDatabase();
  } else {
    try { localStorage.setItem('seo-rank-tracker-clients', JSON.stringify(getClients())); } catch (e) {}
  }
}

function uid() { return 'rt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function toDateOnly(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function todayStr() { return toDateOnly(new Date()).toISOString().slice(0, 10); }
function daysBetween(fromStr, toStrVal) {
  const from = toDateOnly(fromStr);
  const to = toDateOnly(toStrVal);
  return Math.round((to - from) / 86400000);
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function populateClientSelect() {
  const clients = getClients();
  const select = el('rtClient');
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

function collectAllKeywords() {
  const clients = getClients();
  const rows = [];
  Object.keys(clients).forEach(name => {
    if (name === SANDBOX_NAME) return;
    const items = Array.isArray(clients[name].seoRankTracker) ? clients[name].seoRankTracker : [];
    items.forEach(item => rows.push({ clientName: name, item }));
  });
  return rows;
}

function findItem(clientName, itemId) {
  const clients = getClients();
  const client = clients[clientName];
  if (!client || !Array.isArray(client.seoRankTracker)) return null;
  return client.seoRankTracker.find(i => i.id === itemId) || null;
}

function isStale(item) {
  if (!item.lastChecked) return true;
  return daysBetween(item.lastChecked, todayStr()) >= STALE_DAYS;
}

function renderChange(item) {
  if (item.previousPosition == null || item.previousPosition === '') {
    return '<span class="rank-change flat">—</span>';
  }
  const diff = Number(item.previousPosition) - Number(item.currentPosition);
  if (diff > 0) return `<span class="rank-change up">▲ ${diff}</span>`;
  if (diff < 0) return `<span class="rank-change down">▼ ${Math.abs(diff)}</span>`;
  return '<span class="rank-change flat">No change</span>';
}

function renderSummary(rows) {
  const improved = rows.filter(r => r.item.previousPosition != null && r.item.previousPosition !== '' && Number(r.item.currentPosition) < Number(r.item.previousPosition));
  const declined = rows.filter(r => r.item.previousPosition != null && r.item.previousPosition !== '' && Number(r.item.currentPosition) > Number(r.item.previousPosition));
  const stale = rows.filter(r => isStale(r.item));

  el('summaryKeywords').textContent = rows.length;
  el('summaryImproved').textContent = improved.length;
  el('summaryDeclined').textContent = declined.length;
  el('summaryStale').textContent = stale.length;
}

function renderTable() {
  const allRows = collectAllKeywords();
  renderSummary(allRows);

  const filterText = el('filterClientInput').value.trim().toLowerCase();

  const rows = allRows
    .filter(r => !filterText || r.clientName.toLowerCase().includes(filterText) || (r.item.keyword || '').toLowerCase().includes(filterText))
    .sort((a, b) => a.clientName.localeCompare(b.clientName) || (a.item.keyword || '').localeCompare(b.item.keyword || ''));

  const tbody = el('rankTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(row => {
    const { clientName, item } = row;
    const stale = isStale(item);
    const tr = document.createElement('tr');
    tr.className = stale ? 'rank-stale' : '';
    tr.innerHTML = `
      <td class="client-cell">${escapeHtml(clientName)}</td>
      <td>${escapeHtml(item.keyword || '')}</td>
      <td>${escapeHtml(item.searchEngine || 'Google')}</td>
      <td class="url-cell" title="${escapeHtml(item.targetUrl || '')}">${escapeHtml(item.targetUrl || '--')}</td>
      <td><input type="number" class="position-input" data-client="${escapeHtml(clientName)}" data-id="${item.id}" value="${item.currentPosition != null ? item.currentPosition : ''}" min="1" step="1" style="width:60px;"></td>
      <td>${renderChange(item)}</td>
      <td class="date-cell">${item.lastChecked || '--'}${stale ? '<span class="stale-badge">Stale</span>' : ''}</td>
      <td><input type="text" class="notes-input" data-client="${escapeHtml(clientName)}" data-id="${item.id}" value="${escapeHtml(item.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="log-update-btn" data-client="${escapeHtml(clientName)}" data-id="${item.id}">Log Today's Check</button>
          <button class="delete-item-btn" data-client="${escapeHtml(clientName)}" data-id="${item.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  wireRowListeners();
}

function wireRowListeners() {
  document.querySelectorAll('.notes-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const item = findItem(inp.getAttribute('data-client'), inp.getAttribute('data-id'));
      if (!item) return;
      item.notes = inp.value;
      persist();
    });
  });

  document.querySelectorAll('.position-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const item = findItem(inp.getAttribute('data-client'), inp.getAttribute('data-id'));
      if (!item) return;
      item.currentPosition = Number(inp.value) || null;
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.log-update-btn').forEach(btn => {
    btn.addEventListener('click', () => logTodaysCheck(btn.getAttribute('data-client'), btn.getAttribute('data-id')));
  });

  document.querySelectorAll('.delete-item-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.getAttribute('data-client'), btn.getAttribute('data-id')));
  });
}

// Shifts the current position into previousPosition (so the Change column
// reflects this cycle's movement) and stamps today as lastChecked. The
// position field itself isn't touched here - update it inline first if it
// moved, then log the check to snapshot that movement.
function logTodaysCheck(clientName, itemId) {
  const item = findItem(clientName, itemId);
  if (!item) return;
  item.previousPosition = item.currentPosition != null ? item.currentPosition : item.previousPosition;
  item.lastChecked = todayStr();
  persist();
  renderTable();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Logged today's check for "${item.keyword}".`);
  }
}

function deleteItem(clientName, itemId) {
  const item = findItem(clientName, itemId);
  if (!item) return;
  if (!confirm(`Stop tracking "${item.keyword}" for ${clientName}? This can't be undone.`)) return;
  const clients = getClients();
  const client = clients[clientName];
  client.seoRankTracker = client.seoRankTracker.filter(i => i.id !== itemId);
  persist();
  renderTable();
}

function addKeyword() {
  const clientSelect = el('rtClient');
  const keywordInput = el('rtKeyword');
  const clientName = clientSelect.value;

  if (!clientName) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Choose a client first.');
    return;
  }
  if (!keywordInput.value.trim()) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Give this keyword a value first.');
    return;
  }

  const clients = getClients();
  const client = clients[clientName];
  if (!client) return;
  if (!Array.isArray(client.seoRankTracker)) client.seoRankTracker = [];

  const positionVal = el('rtPosition').value;
  const keyword = keywordInput.value.trim();

  client.seoRankTracker.push({
    id: uid(),
    keyword,
    targetUrl: el('rtTargetUrl').value.trim(),
    searchEngine: el('rtEngine').value,
    currentPosition: positionVal ? Number(positionVal) : null,
    previousPosition: null,
    lastChecked: positionVal ? todayStr() : null,
    notes: el('rtNotes').value.trim(),
    createdDate: todayStr()
  });

  persist();

  keywordInput.value = '';
  el('rtTargetUrl').value = '';
  el('rtPosition').value = '';
  el('rtNotes').value = '';
  el('rtEngine').value = 'Google';

  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Tracking "${keyword}" for ${clientName}.`);
  }
}

function initListeners() {
  el('addKeywordBtn').addEventListener('click', addKeyword);
  el('filterClientInput').addEventListener('input', renderTable);
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  renderTable();
  initListeners();

  // Same iframe-race fix used across the other client-aware modules: the
  // parent Hub's client database loads asynchronously, so poll briefly
  // and re-populate/re-render once real data shows up.
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    if (Object.keys(getClients()).length > 0) {
      populateClientSelect();
      renderTable();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
