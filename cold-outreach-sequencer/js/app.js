/* ============================================================
   COLD OUTREACH SEQUENCER — APP LOGIC
   (standalone: leads tracked here are NOT clientsDb entries - most
   people you're cold-outreaching to haven't signed anything yet, so
   this keeps its own list at agency/coldOutreachSequences rather than
   forcing you to create a full Client Workspace just to track a touch.
   Mirrors the Day 1 / 4 / 8 / 30 cadence in the Growth SOPs' Cold
   Outreach SOP so a touch never quietly gets forgotten between
   Leads List and Cold Outreach Tracker updates in ClickUp.
   Existing client names still show up as autocomplete suggestions,
   for the occasional re-engagement outreach to a past client.)
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const SANDBOX_NAME = "Quick Sandbox (One-Offs)";

let leads = [];
let docVersion = 0; // optimistic-concurrency guard, see persist() below

// Stage sequence mirrors the Cold Outreach SOP's touch schedule:
// Touch 1 = Day 1 (first contact), Touch 2 = Day 4, Touch 3 = Day 8, Touch 4 = Day 30.
const TOUCH_STAGES = ['Touch 1 Sent', 'Touch 2 Sent', 'Touch 3 Sent', 'Touch 4 Sent'];
const ALL_STAGES = ['Touch 1 Sent', 'Touch 2 Sent', 'Touch 3 Sent', 'Touch 4 Sent', 'Sequence Complete', 'Assessment Booked', 'Declined'];

// Day-number (since first contact = Day 1) that the NEXT touch is due,
// keyed by the stage you're currently at.
const NEXT_TOUCH_DAY = { 'Touch 1 Sent': 4, 'Touch 2 Sent': 8, 'Touch 3 Sent': 30 };

const TOUCH_GOALS = {
  'Touch 1 Sent': 'Waiting on Touch 2 — follow up, share a relevant case study or result',
  'Touch 2 Sent': 'Waiting on Touch 3 — final follow-up, direct ask for a discovery call',
  'Touch 3 Sent': 'Waiting on Touch 4 — long-term nurture, check in or share a tip',
  'Touch 4 Sent': 'Sequence complete — log the outcome',
  'Sequence Complete': 'No response after 4 touches — close out or leave for long-term nurture',
  'Assessment Booked': 'Converted — move to Sales Pipeline / Discovery Call Script',
  'Declined': 'Closed — not interested'
};

function el(id) { return document.getElementById(id); }

function getLeadsDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "coldOutreachSequences");
}

async function loadLeads() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getLeadsDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      leads = (data && data.list) || [];
      docVersion = (data && data.version) || 0;
      return;
    } catch (e) {
      console.error("Couldn't load outreach sequences from the cloud:", e);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', "Couldn't load from the cloud: " + e.message);
      }
      leads = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('cold-outreach-sequencer-list');
    leads = saved ? JSON.parse(saved) : [];
  } catch (e) { leads = []; }
}

// Optimistic-concurrency guard: this saves by overwriting the whole doc
// on every edit, so re-check the version right before writing and
// refuse to clobber a newer save made elsewhere in the meantime.
async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getLeadsDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: leads, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save outreach sequences to the cloud:", result.error);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', result.reason === 'conflict'
          ? "Someone else updated this list while you had it open. Reload the page to see their changes, then redo your edit."
          : "Couldn't save — your change may be lost on reload: " + result.error.message);
      }
      return false;
    }
    docVersion = result.version;
    return true;
  }
  try {
    localStorage.setItem('cold-outreach-sequencer-list', JSON.stringify(leads));
  } catch (e) {}
  return true;
}

function toDateOnly(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addDays(dateStr, days) {
  const dt = toDateOnly(dateStr);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function todayStr() {
  return toDateOnly(new Date()).toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStrVal) {
  const from = toDateOnly(fromStr);
  const to = toDateOnly(toStrVal);
  return Math.round((to - from) / 86400000);
}

function uid() {
  return 'lead-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function getUrgency(lead) {
  if (lead.status !== 'active') return 'closed';
  if (!TOUCH_STAGES.includes(lead.stage)) return 'green'; // Sequence Complete, no more due dates
  const daysOverdue = daysBetween(lead.nextTouchDue, todayStr());
  if (daysOverdue >= 2) return 'red';
  if (daysOverdue >= 0) return 'yellow';
  return 'green';
}

function populateLeadDatalist() {
  const list = el('leadOptions');
  if (!list) return;
  list.innerHTML = '';
  if (!isEmbedded || typeof window.parent.getAllClients !== 'function') return;
  let clients = {};
  try { clients = window.parent.getAllClients() || {}; } catch (e) { clients = {}; }
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    const opt = document.createElement('option');
    opt.value = name;
    list.appendChild(opt);
  });
}

function renderSummary() {
  const activeRows = leads.filter(l => l.status === 'active');
  const dueToday = activeRows.filter(l => TOUCH_STAGES.includes(l.stage) && l.nextTouchDue === todayStr());
  const overdue = activeRows.filter(l => TOUCH_STAGES.includes(l.stage) && daysBetween(l.nextTouchDue, todayStr()) >= 1);

  el('summaryActive').textContent = activeRows.length;
  el('summaryDueToday').textContent = dueToday.length;
  el('summaryOverdue').textContent = overdue.length;
}

function stageOptionsHtml(selected) {
  return ALL_STAGES.map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('');
}

function findLead(id) {
  return leads.find(l => l.id === id);
}

function renderTable() {
  renderSummary();

  const showClosed = el('showClosedToggle').checked;
  const search = el('filterSearchInput').value.trim().toLowerCase();

  const rows = [...leads]
    .filter(l => showClosed || l.status === 'active')
    .filter(l => !search || (l.leadName || '').toLowerCase().includes(search))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return (a.nextTouchDue || '9999').localeCompare(b.nextTouchDue || '9999');
    });

  const tbody = el('trackerTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(lead => {
    const urgency = getUrgency(lead);
    const tr = document.createElement('tr');
    tr.className = 'urgency-' + urgency;
    const canLogTouch = lead.status === 'active' && TOUCH_STAGES.includes(lead.stage);

    tr.innerHTML = `
      <td class="client-cell">${lead.leadName}</td>
      <td class="date-cell">${lead.firstContactDate || '--'} <span style="color:var(--color-text-muted); font-size:11px;">(${lead.channel || 'Email'})</span></td>
      <td><select class="stage-select" data-id="${lead.id}">${stageOptionsHtml(lead.stage)}</select></td>
      <td class="date-cell">${TOUCH_STAGES.includes(lead.stage) ? (lead.nextTouchDue || '--') : '--'}</td>
      <td class="goal-cell">${TOUCH_GOALS[lead.stage] || ''}</td>
      <td class="date-cell">${lead.lastContactDate || '--'}</td>
      <td><input type="text" class="notes-input" data-id="${lead.id}" value="${(lead.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="log-followup-btn" data-id="${lead.id}" ${!canLogTouch ? 'disabled' : ''}>Log Next Touch Sent</button>
          <button class="win-btn" data-id="${lead.id}" ${lead.status !== 'active' ? 'disabled' : ''}>Assessment Booked</button>
          <button class="lose-btn" data-id="${lead.id}" ${lead.status !== 'active' ? 'disabled' : ''}>Declined / No Response</button>
          <button class="delete-btn" data-id="${lead.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  wireRowListeners();
}

function wireRowListeners() {
  document.querySelectorAll('.stage-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const lead = findLead(sel.getAttribute('data-id'));
      if (!lead) return;
      lead.stage = sel.value;
      if (sel.value === 'Assessment Booked') lead.status = 'booked';
      else if (sel.value === 'Declined') lead.status = 'declined';
      else if (TOUCH_STAGES.includes(sel.value) || sel.value === 'Sequence Complete') lead.status = 'active';
      await persist();
      renderTable();
    });
  });

  document.querySelectorAll('.notes-input').forEach(inp => {
    inp.addEventListener('input', async () => {
      const lead = findLead(inp.getAttribute('data-id'));
      if (!lead) return;
      lead.notes = inp.value;
      await persist();
    });
  });

  document.querySelectorAll('.log-followup-btn').forEach(btn => {
    btn.addEventListener('click', () => logNextTouch(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.win-btn').forEach(btn => {
    btn.addEventListener('click', () => closeLead(btn.getAttribute('data-id'), 'booked'));
  });
  document.querySelectorAll('.lose-btn').forEach(btn => {
    btn.addEventListener('click', () => closeLead(btn.getAttribute('data-id'), 'declined'));
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteLead(btn.getAttribute('data-id')));
  });
}

async function logNextTouch(id) {
  const lead = findLead(id);
  if (!lead || lead.status !== 'active' || !TOUCH_STAGES.includes(lead.stage)) return;

  const today = todayStr();
  lead.lastContactDate = today;

  const idx = TOUCH_STAGES.indexOf(lead.stage);
  if (idx >= 0 && idx < TOUCH_STAGES.length - 1) {
    const nextDay = NEXT_TOUCH_DAY[lead.stage];
    lead.stage = TOUCH_STAGES[idx + 1];
    lead.nextTouchDue = addDays(lead.firstContactDate, nextDay - 1);
  } else {
    // Just logged Touch 4 — sequence is complete, nothing more scheduled.
    lead.stage = 'Sequence Complete';
    lead.nextTouchDue = null;
  }

  const ok = await persist();
  renderTable();

  if (ok && isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Logged touch for ${lead.leadName} — now at "${lead.stage}".`);
  }
}

async function closeLead(id, outcome) {
  const lead = findLead(id);
  if (!lead) return;
  lead.status = outcome;
  lead.stage = outcome === 'booked' ? 'Assessment Booked' : 'Declined';
  const ok = await persist();
  renderTable();

  if (!ok) return;

  // Used to just tell the human to go retype this into Sales Pipeline
  // Board themselves - now creates the pipeline lead directly (source
  // pre-filled as "Cold Outreach", stage set to "discovery call
  // scheduled" since that's literally what just happened) via the
  // shared cross-tool bridge in the parent app.js. Fire-and-forget: a
  // failure here shouldn't block or roll back the outcome just recorded
  // on this side, so it's reported via a banner rather than surfaced as
  // an error on closeLead itself.
  if (outcome === 'booked' && isEmbedded && window.parent.addLeadToSalesPipeline) {
    window.parent.addLeadToSalesPipeline({
      name: lead.leadName,
      source: 'Cold Outreach',
      notes: `Auto-added after booking via Cold Outreach Sequencer (first contact ${lead.firstContactDate || ''}).`,
      stage: 'discovery call scheduled'
    }).then(result => {
      if (result.ok && !result.alreadyExisted && window.parent.showBanner) {
        window.parent.showBanner('success', `${lead.leadName} booked a call 🎉 — added to Sales Pipeline automatically.`);
      } else if (result.ok && result.alreadyExisted && window.parent.showBanner) {
        window.parent.showBanner('success', `${lead.leadName} booked a call 🎉 — already in Sales Pipeline.`);
      } else if (window.parent.showBanner) {
        window.parent.showBanner('success', `${lead.leadName} booked a call 🎉 — couldn't auto-add to Sales Pipeline, add them manually.`);
      }
    }).catch(() => {
      if (window.parent.showBanner) {
        window.parent.showBanner('success', `${lead.leadName} booked a call 🎉 — couldn't auto-add to Sales Pipeline, add them manually.`);
      }
    });
  } else if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Marked ${lead.leadName} as declined / no response.`);
  }
}

async function deleteLead(id) {
  if (!confirm("Delete this outreach sequence? This can't be undone.")) return;
  const previous = leads;
  leads = leads.filter(l => l.id !== id);
  const ok = await persist();
  if (!ok) {
    leads = previous;
  }
  renderTable();
}

async function addLead() {
  const nameInput = el('newLeadName');
  const dateInput = el('newFirstContactDate');
  const channelInput = el('newChannel');
  const leadName = nameInput.value.trim();
  if (!leadName) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Enter a lead or company name first.');
    return;
  }
  const firstContactDate = dateInput.value || todayStr();

  leads.push({
    id: uid(),
    leadName,
    channel: channelInput.value || 'Email',
    status: 'active',
    firstContactDate,
    stage: 'Touch 1 Sent',
    lastContactDate: firstContactDate,
    nextTouchDue: addDays(firstContactDate, NEXT_TOUCH_DAY['Touch 1 Sent'] - 1),
    notes: ''
  });

  const ok = await persist();
  if (!ok) {
    leads.pop();
    renderTable();
    return;
  }

  nameInput.value = '';
  dateInput.value = '';
  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Started a cold outreach sequence for ${leadName} — Touch 2 due ${leads[leads.length - 1].nextTouchDue}.`);
  }
}

// Touch 1 (Day 1) message template - see the HTML comment above
// #sendOutreachPanel for why this is Copy/Open only, no real Send button.
// [Company Name] gets swapped for whatever's currently typed in the
// lead-name field, if anything; every other bracket stays as-is for the
// account manager to fill in by hand.
function buildTouch1Email(leadName) {
  const name = leadName || '[Company Name]';
  const subject = `Quick idea for ${name}`;
  const body = `Hi [First Name],\n\nI came across ${name} and [something specific — a recent launch, a post, a product, an event] caught my eye. We're Revital Productions — an AV production company based in Louisiana that specializes in marketing for brands on the rise, so we end up doing both the strategy/creative and the actual production (video, live events, brand campaigns) instead of handing that off to a third party.\n\nWe just wrapped work with [Evry Intention / Reginald White — swap in whichever case study fits the prospect] and the results were strong enough that I wanted to reach out directly rather than wait for a referral.\n\nWould you be open to a quick 15-minute call to see if there's a fit? No pressure either way — happy to just send over a short portfolio piece if that's easier.\n\n[Your Name]\nRevital Productions\n[phone] | [email]`;
  return { subject, body };
}

const sendOutreachPanel = el('sendOutreachPanel');
const sendOutreachTo = el('sendOutreachTo');
const sendOutreachSubject = el('sendOutreachSubject');
const sendOutreachBody = el('sendOutreachBody');
const sendOutreachOpenBtn = el('sendOutreachOpenBtn');
const sendOutreachCopyBtn = el('sendOutreachCopyBtn');
const sendOutreachCloseBtn = el('sendOutreachCloseBtn');
const sendOutreachStatus = el('sendOutreachStatus');

function refreshOutreachMailto() {
  if (!sendOutreachOpenBtn || !sendOutreachTo) return;
  sendOutreachOpenBtn.href = `mailto:${encodeURIComponent(sendOutreachTo.value)}?subject=${encodeURIComponent(sendOutreachSubject.value)}&body=${encodeURIComponent(sendOutreachBody.value)}`;
}

function openTouch1Panel() {
  const leadNameInput = el('newLeadName');
  const { subject, body } = buildTouch1Email(leadNameInput ? leadNameInput.value.trim() : '');
  if (sendOutreachTo) sendOutreachTo.value = '';
  if (sendOutreachSubject) sendOutreachSubject.value = subject;
  if (sendOutreachBody) sendOutreachBody.value = body;
  refreshOutreachMailto();
  if (sendOutreachStatus) sendOutreachStatus.textContent = '';
  if (sendOutreachPanel) {
    sendOutreachPanel.style.display = 'block';
    sendOutreachPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

if (sendOutreachCloseBtn) {
  sendOutreachCloseBtn.addEventListener('click', () => {
    if (sendOutreachPanel) sendOutreachPanel.style.display = 'none';
  });
}

[sendOutreachTo, sendOutreachSubject, sendOutreachBody].forEach(elx => {
  if (elx) elx.addEventListener('input', refreshOutreachMailto);
});

if (sendOutreachCopyBtn) {
  sendOutreachCopyBtn.addEventListener('click', async () => {
    const toLine = sendOutreachTo.value ? `To: ${sendOutreachTo.value}\n` : '';
    const text = `${toLine}Subject: ${sendOutreachSubject.value}\n\n${sendOutreachBody.value}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        sendOutreachBody.select();
        document.execCommand('copy');
      }
      const original = sendOutreachCopyBtn.textContent;
      sendOutreachCopyBtn.textContent = 'Copied!';
      setTimeout(() => { sendOutreachCopyBtn.textContent = original; }, 2000);
    } catch (err) {
      console.error('Failed to copy outreach email', err);
      alert('Failed to copy. Please manually select and copy the text.');
    }
  });
}

function initListeners() {
  el('addLeadBtn').addEventListener('click', addLead);
  el('showClosedToggle').addEventListener('change', renderTable);
  el('filterSearchInput').addEventListener('input', renderTable);
  const composeBtn = el('composeTouch1Btn');
  if (composeBtn) composeBtn.addEventListener('click', openTouch1Panel);
}

document.addEventListener('DOMContentLoaded', async () => {
  populateLeadDatalist();
  await loadLeads();
  renderTable();
  initListeners();

  // Same as Referral Tracker / Proposal Follow-Up Tracker: the lead-name
  // autocomplete list is a nice-to-have, not a blocker (you can always
  // just type a name) - but still worth backfilling once the parent's
  // client data actually syncs in, in case this iframe loaded first.
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    let clientCount = 0;
    try { clientCount = isEmbedded ? Object.keys(window.parent.getAllClients() || {}).length : 0; } catch (e) {}
    if (clientCount > 0) {
      populateLeadDatalist();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
