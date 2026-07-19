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
  return {};
}

function persist() {
  if (isEmbedded) {
    window.parent.saveDatabase();
  }
}

function uid() {
  return 'mn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function populateClientSelect() {
  const clients = getClients();
  const select = el('clientSelect');
  select.innerHTML = '<option value="">Select a client...</option>';
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

function renderState() {
  const clientName = el('clientSelect').value;

  // Before a client is picked, .left-panel only holds the selector but
  // still reserves its full column width, which visually shoves the
  // empty-state placeholder off-center. This class (see css/style.css)
  // stacks the panels full-width instead while a client is unselected.
  const splitLayout = document.querySelector('.split-layout');
  if (splitLayout) splitLayout.classList.toggle('no-client', !clientName);

  if (!clientName) {
    el('emptyState').style.display = 'flex';
    el('notesInterface').style.display = 'none';
    el('summaryCard').style.display = 'none';
    return;
  }

  el('emptyState').style.display = 'none';
  el('notesInterface').style.display = 'block';
  el('summaryCard').style.display = 'block';
  el('newDate').value = todayStr();

  const clients = getClients();
  const notes = clients[clientName].meetingNotes || [];

  // Calculate stats
  let open = 0;
  let completed = 0;
  notes.forEach(m => {
    (m.actionItems || []).forEach(ai => {
      if (ai.completed) completed++;
      else open++;
    });
  });

  el('statOpen').textContent = open;
  el('statCompleted').textContent = completed;

  // Render past meetings
  const listEl = el('meetingsList');
  listEl.innerHTML = '';

  if (notes.length === 0) {
    listEl.innerHTML = '<p style="color: var(--color-text-secondary)">No meetings logged yet.</p>';
    return;
  }

  // Sort newest first
  [...notes].sort((a, b) => b.date.localeCompare(a.date)).forEach(m => {
    const card = document.createElement('div');
    card.className = 'meeting-card';

    let aiHtml = '';
    if (m.actionItems && m.actionItems.length > 0) {
      aiHtml = '<div class="action-items-list mt-3"><h4 style="margin:0 0 8px 0; font-size:12px; color:var(--color-text-secondary)">ACTION ITEMS</h4>';
      m.actionItems.forEach(ai => {
        aiHtml += `
          <label class="action-item-check ${ai.completed ? 'completed' : ''}">
            <input type="checkbox" class="ai-checkbox" data-meeting="${m.id}" data-id="${ai.id}" ${ai.completed ? 'checked' : ''}>
            <span>${ai.text.replace(/</g, '&lt;')}</span>
          </label>
        `;
      });
      aiHtml += '</div>';
    }

    card.innerHTML = `
      <div class="meeting-card-header">
        <h4 style="margin:0">${(m.title || 'Meeting').replace(/</g, '&lt;')}</h4>
        <span class="meeting-date">${m.date}</span>
      </div>
      <div class="meeting-summary">${(m.summary || '').replace(/</g, '&lt;')}</div>
      ${aiHtml}
      <div class="mt-3 text-right">
        <button class="btn-secondary sm delete-mtg-btn" data-id="${m.id}" style="color:#f87171; border-color: rgba(248,113,113,0.3)">Delete Record</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  wireDynamicListeners();
}

function wireDynamicListeners() {
  const clientName = el('clientSelect').value;
  const clients = getClients();

  document.querySelectorAll('.ai-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const mId = e.target.getAttribute('data-meeting');
      const aiId = e.target.getAttribute('data-id');
      const isChecked = e.target.checked;

      const meeting = (clients[clientName].meetingNotes || []).find(m => m.id === mId);
      if (meeting) {
        const item = meeting.actionItems.find(a => a.id === aiId);
        if (item) {
          item.completed = isChecked;
          persist();
          renderState(); // re-render to update strikethrough and stats
        }
      }
    });
  });

  document.querySelectorAll('.delete-mtg-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!confirm("Delete this meeting record?")) return;
      const mId = e.target.getAttribute('data-id');
      clients[clientName].meetingNotes = (clients[clientName].meetingNotes || []).filter(m => m.id !== mId);
      persist();
      renderState();
    });
  });
}

function addActionItemRow() {
  const container = el('newActionItemsList');
  const row = document.createElement('div');
  row.className = 'action-item-row';
  row.innerHTML = `
    <input type="text" class="form-control ai-input" placeholder="E.g. Send updated logo files">
    <button class="btn-remove-action">✕</button>
  `;
  row.querySelector('.btn-remove-action').addEventListener('click', () => row.remove());
  container.appendChild(row);
  row.querySelector('input').focus();
}

function saveMeeting() {
  const clientName = el('clientSelect').value;
  if (!clientName) return;

  const date = el('newDate').value;
  const title = el('newTitle').value.trim();
  const summary = el('newSummary').value.trim();

  if (!date || !summary) {
    if (isEmbedded && window.parent.showBanner) {
      window.parent.showBanner('error', 'Please provide a date and meeting notes.');
    } else {
      alert("Please provide a date and meeting notes.");
    }
    return;
  }

  const actionItems = [];
  document.querySelectorAll('.ai-input').forEach(inp => {
    const val = inp.value.trim();
    if (val) {
      actionItems.push({ id: uid(), text: val, completed: false });
    }
  });

  const clients = getClients();
  if (!clients[clientName].meetingNotes) {
    clients[clientName].meetingNotes = [];
  }

  clients[clientName].meetingNotes.push({
    id: uid(),
    date,
    title,
    summary,
    actionItems
  });

  persist();

  // Reset form
  el('newTitle').value = '';
  el('newSummary').value = '';
  el('newActionItemsList').innerHTML = '';

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', 'Meeting logged successfully.');
  }

  renderState();
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  el('clientSelect').addEventListener('change', renderState);
  el('addActionItemBtn').addEventListener('click', addActionItemRow);
  el('saveMeetingBtn').addEventListener('click', saveMeeting);
  renderState();

  // The parent Hub loads its client database asynchronously (instant
  // localStorage boot, then a Firestore sync on top of that). If this
  // module's iframe finishes loading before that data is ready,
  // populateClientSelect() above runs against an empty client list and -
  // since nothing else ever re-triggers it - the dropdown stays empty
  // forever, even after the real data arrives moments later. Poll
  // briefly and re-populate once real client data shows up.
  let clientPollAttempts = 0;
  const clientPoll = setInterval(() => {
    clientPollAttempts++;
    const hasClients = Object.keys(getClients()).length > 0;
    if (hasClients || clientPollAttempts > 30) {
      clearInterval(clientPoll);
      if (hasClients) populateClientSelect();
    }
  }, 250);
});
