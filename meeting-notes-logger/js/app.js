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

function addActionItemRow(prefillText) {
  const container = el('newActionItemsList');
  const row = document.createElement('div');
  row.className = 'action-item-row';
  row.innerHTML = `
    <input type="text" class="form-control ai-input" placeholder="E.g. Send updated logo files">
    <button class="btn-remove-action">✕</button>
  `;
  const input = row.querySelector('input');
  if (prefillText) input.value = prefillText;
  row.querySelector('.btn-remove-action').addEventListener('click', () => row.remove());
  container.appendChild(row);
  if (!prefillText) input.focus();
}

/* ============================================================
   IMPORT MEETING NOTES FROM FILE — drag-and-drop
   Handles the common real-world case at Revital: Gemini auto-generates
   notes in a Google Doc during a Google Meet call, and someone downloads
   that doc (as .txt or .docx) to log here instead of retyping it by hand.
   .txt is read directly; .docx is unpacked client-side via mammoth.js
   (loaded in index.html) - both end up as one plain-text string.
   ============================================================ */

// Gemini's notes docs consistently use one of these headings right before
// the follow-up list - matching any of them (case-insensitively, allowing
// a trailing colon) lets everything after it be auto-split into
// individual action item rows instead of landing in the summary textarea
// as one big undifferentiated block.
const ACTION_ITEMS_HEADING_RE = /^(suggested next steps|next steps|action items)\s*:?\s*$/i;

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.readAsArrayBuffer(file);
  });
}

async function extractTextFromNotesFile(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.docx')) {
    if (typeof mammoth === 'undefined') {
      throw new Error("The .docx reader didn't load - check your internet connection and try again, or drop a .txt file instead.");
    }
    const buffer = await readFileAsArrayBuffer(file);
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value || '';
  }
  if (name.endsWith('.txt')) {
    return await readFileAsText(file);
  }
  throw new Error('Only .txt and .docx files are supported.');
}

// Splits the raw extracted text into { summaryText, actionItems } by
// finding the first line that matches ACTION_ITEMS_HEADING_RE. Everything
// before that heading (trimmed) becomes the summary; everything after it
// is split into non-empty lines, each stripped of a leading bullet/dash/
// number so "- Send proof by Friday" and "1. Send proof by Friday" both
// become the clean action item text "Send proof by Friday".
function splitNotesIntoSummaryAndActionItems(rawText) {
  const lines = (rawText || '').replace(/\r\n/g, '\n').split('\n');
  const headingIndex = lines.findIndex(line => ACTION_ITEMS_HEADING_RE.test(line.trim()));

  if (headingIndex === -1) {
    return { summaryText: rawText.trim(), actionItems: [] };
  }

  const summaryText = lines.slice(0, headingIndex).join('\n').trim();
  const actionItems = lines.slice(headingIndex + 1)
    .map(line => line.trim().replace(/^[-*•]\s*/, '').replace(/^\d+[\.\)]\s*/, ''))
    .filter(line => line.length > 0);

  return { summaryText, actionItems };
}

async function handleNotesFileDrop(file) {
  const dropzone = el('notesDropzone');
  const dropzoneText = dropzone ? dropzone.querySelector('span') : null;
  const originalText = dropzoneText ? dropzoneText.textContent : '';
  if (dropzoneText) dropzoneText.textContent = 'Reading file…';

  try {
    const rawText = await extractTextFromNotesFile(file);
    const { summaryText, actionItems } = splitNotesIntoSummaryAndActionItems(rawText);

    if (!summaryText && actionItems.length === 0) {
      throw new Error("That file didn't have any readable text in it.");
    }

    el('newSummary').value = summaryText;
    // Auto-fill the title from the filename (minus extension) only if the
    // title field is still empty, so this never clobbers something the
    // user already typed in.
    const titleInput = el('newTitle');
    if (titleInput && !titleInput.value.trim()) {
      titleInput.value = file.name.replace(/\.(docx|txt)$/i, '').replace(/[-_]+/g, ' ').trim();
    }

    el('newActionItemsList').innerHTML = '';
    actionItems.forEach(text => addActionItemRow(text));

    const message = actionItems.length > 0
      ? `Imported notes from "${file.name}" — ${actionItems.length} action item${actionItems.length === 1 ? '' : 's'} detected.`
      : `Imported notes from "${file.name}".`;
    if (isEmbedded && window.parent.showBanner) {
      window.parent.showBanner('success', message);
    }
  } catch (e) {
    console.error('Failed to import notes file:', e);
    if (isEmbedded && window.parent.showBanner) {
      window.parent.showBanner('error', "Couldn't import that file: " + e.message);
    } else {
      alert("Couldn't import that file: " + e.message);
    }
  } finally {
    if (dropzoneText) dropzoneText.textContent = originalText;
  }
}

function wireNotesDropzone() {
  const zone = el('notesDropzone');
  const input = el('notesFileInput');
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', (e) => { e.preventDefault(); zone.classList.remove('dragover'); });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleNotesFileDrop(file);
  });
  input.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleNotesFileDrop(file);
    input.value = '';
  });
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
  if (window.initDismissibleCards) initDismissibleCards();

  populateClientSelect();
  el('clientSelect').addEventListener('change', renderState);
  el('addActionItemBtn').addEventListener('click', () => addActionItemRow());
  el('saveMeetingBtn').addEventListener('click', saveMeeting);
  wireNotesDropzone();
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
