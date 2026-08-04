/* ============================================================
   CONTENT CALENDAR — APP LOGIC
   (cross-client: reads/writes every client's own `contentCalendar`
   array). For clients where Revital delivers finished content but
   the client does their own posting - one flat, date-sorted list
   across every account so nothing sits unposted by accident.
   Same clientsDb + saveDatabase() persistence pattern as Mood Board
   Builder / Client Renewal Tracker.
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
    const saved = localStorage.getItem('content-calendar-clients');
    return saved ? JSON.parse(saved) : {};
  } catch (e) { return {}; }
}

function persist() {
  if (isEmbedded) {
    window.parent.saveDatabase();
  } else {
    try { localStorage.setItem('content-calendar-clients', JSON.stringify(getClients())); } catch (e) {}
  }
}

function uid() { return 'cc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function toDateOnly(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function todayStr() {
  return toDateOnly(new Date()).toISOString().slice(0, 10);
}

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
  const select = el('ccClient');
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

// Flattens every client's own contentCalendar array into one list of
// { clientName, item } pairs - the whole point of this tool is seeing
// everything due across every account in one place, not per-client.
function collectAllItems() {
  const clients = getClients();
  const rows = [];
  Object.keys(clients).forEach(name => {
    if (name === SANDBOX_NAME) return;
    const items = Array.isArray(clients[name].contentCalendar) ? clients[name].contentCalendar : [];
    items.forEach(item => rows.push({ clientName: name, item }));
  });
  return rows;
}

function getUrgency(item) {
  if (item.status === 'Posted') return 'closed';
  const daysUntil = daysBetween(todayStr(), item.postDate);
  if (daysUntil < 0) return 'red';
  if (daysUntil <= 7) return 'yellow';
  return 'green';
}

function statusBadge(item) {
  if (item.status === 'Posted') return '<span class="posted-badge">Posted</span>';
  const daysUntil = daysBetween(todayStr(), item.postDate);
  if (daysUntil < 0) return `<span class="overdue-badge">${Math.abs(daysUntil)}d overdue</span>`;
  if (daysUntil === 0) return '<span class="scheduled-badge">Today</span>';
  return `<span class="scheduled-badge">${daysUntil}d</span>`;
}

function renderSummary(rows) {
  const unposted = rows.filter(r => r.item.status !== 'Posted');
  const overdue = unposted.filter(r => daysBetween(todayStr(), r.item.postDate) < 0);
  const thisWeek = unposted.filter(r => {
    const d = daysBetween(todayStr(), r.item.postDate);
    return d >= 0 && d <= 7;
  });
  const candidates = rows.filter(r => r.item.caseStudyCandidate);

  el('summaryOverdue').textContent = overdue.length;
  el('summaryThisWeek').textContent = thisWeek.length;
  el('summaryScheduled').textContent = unposted.length;
  el('summaryCandidates').textContent = candidates.length;
}

function renderTable() {
  const allRows = collectAllItems();
  renderSummary(allRows);

  const showPosted = el('showPostedToggle').checked;
  const candidatesOnly = el('showCandidatesOnlyToggle').checked;
  const filterText = el('filterClientInput').value.trim().toLowerCase();

  const rows = allRows
    .filter(r => showPosted || r.item.status !== 'Posted')
    .filter(r => !candidatesOnly || r.item.caseStudyCandidate)
    .filter(r => !filterText || r.clientName.toLowerCase().includes(filterText))
    .sort((a, b) => (a.item.postDate || '9999').localeCompare(b.item.postDate || '9999'));

  const tbody = el('calendarTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(row => {
    const { clientName, item } = row;
    const urgency = getUrgency(item);
    const isOpen = item.status !== 'Posted';
    const tr = document.createElement('tr');
    tr.className = 'urgency-' + urgency;

    tr.innerHTML = `
      <td class="client-cell">${escapeHtml(clientName)}</td>
      <td>${escapeHtml(item.title || '')}${item.caseStudyCandidate ? ' <span class="candidate-badge" title="Flagged as a case study candidate">★ Candidate</span>' : ''}</td>
      <td>${escapeHtml(item.platform || 'Other')}</td>
      <td class="date-cell">${item.postDate || '--'}</td>
      <td>${statusBadge(item)}</td>
      <td class="link-cell">${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">Open ↗</a>` : '—'}</td>
      <td><input type="text" class="notes-input" data-client="${escapeHtml(clientName)}" data-id="${item.id}" value="${escapeHtml(item.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="posted-btn" data-client="${escapeHtml(clientName)}" data-id="${item.id}" ${!isOpen ? 'disabled' : ''}>Mark Posted</button>
          <button class="candidate-btn${item.caseStudyCandidate ? ' active' : ''}" data-client="${escapeHtml(clientName)}" data-id="${item.id}" title="Flag this as worth writing up as a case study later">${item.caseStudyCandidate ? '★ Unflag' : '☆ Flag for Case Study'}</button>
          <button class="delete-item-btn" data-client="${escapeHtml(clientName)}" data-id="${item.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  wireRowListeners();
}

function findItem(clientName, itemId) {
  const clients = getClients();
  const client = clients[clientName];
  if (!client || !Array.isArray(client.contentCalendar)) return null;
  return client.contentCalendar.find(i => i.id === itemId) || null;
}

function wireRowListeners() {
  document.querySelectorAll('.notes-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const item = findItem(inp.getAttribute('data-client'), inp.getAttribute('data-id'));
      if (!item) return;
      item.notes = inp.value;
      persist();
    });
  });

  document.querySelectorAll('.posted-btn').forEach(btn => {
    btn.addEventListener('click', () => markPosted(btn.getAttribute('data-client'), btn.getAttribute('data-id')));
  });

  document.querySelectorAll('.candidate-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleCaseStudyCandidate(btn.getAttribute('data-client'), btn.getAttribute('data-id')));
  });

  document.querySelectorAll('.delete-item-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.getAttribute('data-client'), btn.getAttribute('data-id')));
  });
}

// Content that performs well is exactly the kind of proof Phase 1 of the
// Business Phase Roadmap needs for Case Study Builder - the problem is
// noticing it at the time and remembering by the time you actually sit
// down to write one up. This just marks the item; nothing auto-creates a
// case study from it (Case Study Builder's own fields - challenge/
// solution/results/testimonial - need a real narrative, not something to
// template out of a content item's title and platform).
function toggleCaseStudyCandidate(clientName, itemId) {
  const item = findItem(clientName, itemId);
  if (!item) return;
  item.caseStudyCandidate = !item.caseStudyCandidate;
  persist();
  renderTable();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', item.caseStudyCandidate
      ? `Flagged "${item.title}" as a case study candidate.`
      : `Unflagged "${item.title}".`);
  }
}

function markPosted(clientName, itemId) {
  const item = findItem(clientName, itemId);
  if (!item) return;
  item.status = 'Posted';
  item.postedDate = todayStr();
  persist();
  renderTable();
  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Marked "${item.title}" as posted for ${clientName}.`);
  }
}

function deleteItem(clientName, itemId) {
  const item = findItem(clientName, itemId);
  if (!item) return;
  if (!confirm(`Delete "${item.title}" from ${clientName}'s content calendar? This can't be undone.`)) return;
  const clients = getClients();
  const client = clients[clientName];
  client.contentCalendar = client.contentCalendar.filter(i => i.id !== itemId);
  persist();
  renderTable();
}

function addScheduledItem() {
  const clientSelect = el('ccClient');
  const titleInput = el('ccTitle');
  const dateInput = el('ccPostDate');
  const clientName = clientSelect.value;

  if (!clientName) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Choose a client first.');
    return;
  }
  if (!titleInput.value.trim()) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Give this content item a title first.');
    return;
  }
  if (!dateInput.value) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Set a post date first.');
    return;
  }

  const clients = getClients();
  const client = clients[clientName];
  if (!client) return;
  if (!Array.isArray(client.contentCalendar)) client.contentCalendar = [];

  client.contentCalendar.push({
    id: uid(),
    title: titleInput.value.trim(),
    platform: el('ccPlatform').value,
    postDate: dateInput.value,
    link: el('ccLink').value.trim(),
    notes: el('ccNotes').value.trim(),
    status: 'Scheduled',
    createdDate: todayStr()
  });

  persist();

  titleInput.value = '';
  dateInput.value = '';
  el('ccLink').value = '';
  el('ccNotes').value = '';
  el('ccPlatform').value = 'Instagram';

  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Scheduled "${client.contentCalendar[client.contentCalendar.length - 1].title}" for ${clientName}.`);
  }
}

function initListeners() {
  el('addScheduledItemBtn').addEventListener('click', addScheduledItem);
  el('showPostedToggle').addEventListener('change', renderTable);
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
