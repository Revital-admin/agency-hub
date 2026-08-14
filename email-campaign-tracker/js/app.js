/* ============================================================
   EMAIL CAMPAIGN TRACKER — APP LOGIC
   (cross-client: reads/writes every client's own `emailCampaigns`
   array). Same clientsDb + saveDatabase() persistence pattern as
   Content Calendar, with the same "plan vs. actual" distinction:
   this schedules and logs sends, it doesn't send anything - pair
   with the client's real ESP (Mailchimp, Klaviyo, ActiveCampaign,
   etc.) for delivery. Fill in open/click rate after it goes out so
   Monthly Report / QBR have real numbers to pull from instead of
   digging back through the ESP's own dashboard per client.
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
  try {
    const saved = localStorage.getItem('email-campaign-tracker-clients');
    return saved ? JSON.parse(saved) : {};
  } catch (e) { return {}; }
}

function persist() {
  if (isEmbedded) {
    window.parent.saveDatabase();
  } else {
    try { localStorage.setItem('email-campaign-tracker-clients', JSON.stringify(getClients())); } catch (e) {}
  }
}

function uid() { return 'ec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

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
  const select = el('ecClient');
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

function collectAllItems() {
  const clients = getClients();
  const rows = [];
  Object.keys(clients).forEach(name => {
    if (name === SANDBOX_NAME) return;
    const items = Array.isArray(clients[name].emailCampaigns) ? clients[name].emailCampaigns : [];
    items.forEach(item => rows.push({ clientName: name, item }));
  });
  return rows;
}

function findItem(clientName, itemId) {
  const clients = getClients();
  const client = clients[clientName];
  if (!client || !Array.isArray(client.emailCampaigns)) return null;
  return client.emailCampaigns.find(i => i.id === itemId) || null;
}

function getUrgency(item) {
  if (item.status === 'Sent') return 'closed';
  const daysUntil = daysBetween(todayStr(), item.sendDate);
  if (daysUntil < 0) return 'red';
  if (daysUntil <= 7) return 'yellow';
  return 'green';
}

function statusBadge(item) {
  if (item.status === 'Sent') return '<span class="posted-badge">Sent</span>';
  const daysUntil = daysBetween(todayStr(), item.sendDate);
  if (daysUntil < 0) return `<span class="overdue-badge">${Math.abs(daysUntil)}d overdue</span>`;
  if (daysUntil === 0) return '<span class="scheduled-badge">Today</span>';
  return `<span class="scheduled-badge">${daysUntil}d</span>`;
}

function renderSummary(allRows) {
  const unsent = allRows.filter(r => r.item.status !== 'Sent');
  const overdue = unsent.filter(r => daysBetween(todayStr(), r.item.sendDate) < 0);
  const thisWeek = unsent.filter(r => {
    const d = daysBetween(todayStr(), r.item.sendDate);
    return d >= 0 && d <= 7;
  });
  const now = new Date();
  const sentThisMonth = allRows.filter(r => {
    if (r.item.status !== 'Sent' || !r.item.sendDate) return false;
    const d = new Date(r.item.sendDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const withOpenRate = allRows.filter(r => r.item.status === 'Sent' && r.item.openRate != null && r.item.openRate !== '' && !isNaN(Number(r.item.openRate)));
  const avgOpen = withOpenRate.length > 0
    ? (withOpenRate.reduce((sum, r) => sum + Number(r.item.openRate), 0) / withOpenRate.length).toFixed(1) + '%'
    : '--';

  el('summaryOverdue').textContent = overdue.length;
  el('summaryThisWeek').textContent = thisWeek.length;
  el('summarySentMonth').textContent = sentThisMonth.length;
  el('summaryAvgOpen').textContent = avgOpen;
}

function renderTable() {
  const allRows = collectAllItems();
  renderSummary(allRows);

  const showSent = el('showSentToggle').checked;
  const filterText = el('filterClientInput').value.trim().toLowerCase();

  const rows = allRows
    .filter(r => showSent || r.item.status !== 'Sent')
    .filter(r => !filterText || r.clientName.toLowerCase().includes(filterText))
    .sort((a, b) => (a.item.sendDate || '9999').localeCompare(b.item.sendDate || '9999'));

  const tbody = el('campaignTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(row => {
    const { clientName, item } = row;
    const urgency = getUrgency(item);
    const isOpen = item.status !== 'Sent';
    const tr = document.createElement('tr');
    tr.className = 'urgency-' + urgency;
    tr.innerHTML = `
      <td class="client-cell">${escapeHtml(clientName)}</td>
      <td>${escapeHtml(item.subject || '')}</td>
      <td class="date-cell">${item.sendDate || '--'}</td>
      <td>${statusBadge(item)}</td>
      <td>${item.listSize ? Number(item.listSize).toLocaleString() : '--'}</td>
      <td><input type="number" class="openrate-input" data-client="${escapeHtml(clientName)}" data-id="${item.id}" value="${item.openRate != null ? item.openRate : ''}" min="0" max="100" step="0.1" placeholder="%"></td>
      <td><input type="number" class="clickrate-input" data-client="${escapeHtml(clientName)}" data-id="${item.id}" value="${item.clickRate != null ? item.clickRate : ''}" min="0" max="100" step="0.1" placeholder="%"></td>
      <td class="link-cell">${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">Open ↗</a>` : '—'}</td>
      <td><input type="text" class="notes-input" data-client="${escapeHtml(clientName)}" data-id="${item.id}" value="${escapeHtml(item.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="posted-btn" data-client="${escapeHtml(clientName)}" data-id="${item.id}" ${!isOpen ? 'disabled' : ''}>Mark Sent</button>
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

  document.querySelectorAll('.openrate-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const item = findItem(inp.getAttribute('data-client'), inp.getAttribute('data-id'));
      if (!item) return;
      item.openRate = inp.value === '' ? null : Number(inp.value);
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.clickrate-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const item = findItem(inp.getAttribute('data-client'), inp.getAttribute('data-id'));
      if (!item) return;
      item.clickRate = inp.value === '' ? null : Number(inp.value);
      persist();
    });
  });

  document.querySelectorAll('.posted-btn').forEach(btn => {
    btn.addEventListener('click', () => markSent(btn.getAttribute('data-client'), btn.getAttribute('data-id')));
  });

  document.querySelectorAll('.delete-item-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.getAttribute('data-client'), btn.getAttribute('data-id')));
  });
}

function markSent(clientName, itemId) {
  const item = findItem(clientName, itemId);
  if (!item) return;
  item.status = 'Sent';
  item.sentDate = todayStr();
  persist();
  renderTable();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Marked "${item.subject}" as sent for ${clientName}.`);
  }
}

function deleteItem(clientName, itemId) {
  const item = findItem(clientName, itemId);
  if (!item) return;
  if (!confirm(`Delete "${item.subject}" from ${clientName}'s email tracker? This can't be undone.`)) return;
  const clients = getClients();
  const client = clients[clientName];
  client.emailCampaigns = client.emailCampaigns.filter(i => i.id !== itemId);
  persist();
  renderTable();
}

function addScheduledSend() {
  const clientSelect = el('ecClient');
  const subjectInput = el('ecSubject');
  const dateInput = el('ecSendDate');
  const clientName = clientSelect.value;

  if (!clientName) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Choose a client first.');
    return;
  }
  if (!subjectInput.value.trim()) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Give this send a subject line first.');
    return;
  }
  if (!dateInput.value) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Set a send date first.');
    return;
  }

  const clients = getClients();
  const client = clients[clientName];
  if (!client) return;
  if (!Array.isArray(client.emailCampaigns)) client.emailCampaigns = [];

  const subject = subjectInput.value.trim();

  client.emailCampaigns.push({
    id: uid(),
    subject,
    sendDate: dateInput.value,
    listSize: Number(el('ecListSize').value) || 0,
    openRate: null,
    clickRate: null,
    link: el('ecLink').value.trim(),
    notes: el('ecNotes').value.trim(),
    status: 'Scheduled',
    createdDate: todayStr()
  });

  persist();

  subjectInput.value = '';
  dateInput.value = '';
  el('ecListSize').value = '';
  el('ecLink').value = '';
  el('ecNotes').value = '';

  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Scheduled "${subject}" for ${clientName}.`);
  }
}

function initListeners() {
  el('addSendBtn').addEventListener('click', addScheduledSend);
  el('showSentToggle').addEventListener('change', renderTable);
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
