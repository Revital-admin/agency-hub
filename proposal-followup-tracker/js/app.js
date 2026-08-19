/* ============================================================
   PROPOSAL FOLLOW-UP SEQUENCE TRACKER — APP LOGIC
   (standalone: prospects tracked here are NOT clientsDb entries -
   most people you send a proposal to haven't signed yet, so this
   keeps its own list at agency/proposalFollowUps rather than forcing
   you to create a full Client Workspace just to track a follow-up.
   Existing client names still show up as autocomplete suggestions,
   for the occasional upsell/expansion proposal to someone you
   already work with.)
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

// Safety net for the fallback-sender case (no matched client's Account
// Manager on file, so this sends as whoever's currently logged in) - a
// reply lands in that teammate's real inbox either way since "from" is
// always a real mailbox, but Reply-To also pointing at the shared inbox
// means a departed teammate's old sends, or one nobody's actively
// monitoring, still surface somewhere a reply won't be missed.
const FALLBACK_REPLY_TO = 'clients@revitalproductions.com';

let proposals = [];
let docVersion = 0; // optimistic-concurrency guard, see persist() below

const STAGE_SEQUENCE = ['Sent', 'Day 3 Sent', 'Day 7 Sent', 'Day 12 Sent'];
const ALL_STAGES = ['Sent', 'Day 3 Sent', 'Day 7 Sent', 'Day 12 Sent', 'Closed Won', 'Closed Lost', 'Expired'];
const EXPIRY_DAYS = 14;

function el(id) { return document.getElementById(id); }

function getProposalsDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "proposalFollowUps");
}

async function loadProposals() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getProposalsDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      proposals = (data && data.list) || [];
      docVersion = (data && data.version) || 0;
      return;
    } catch (e) {
      console.error("Couldn't load proposals from the cloud:", e);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', "Couldn't load proposals from the cloud: " + e.message);
      }
      proposals = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('proposal-followup-tracker-list');
    proposals = saved ? JSON.parse(saved) : [];
  } catch (e) { proposals = []; }
}

// Optimistic-concurrency guard: this saves by overwriting the whole doc
// on every edit, so re-check the version right before writing and
// refuse to clobber a newer save made elsewhere in the meantime.
async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getProposalsDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: proposals, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save proposals to the cloud:", result.error);
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
    localStorage.setItem('proposal-followup-tracker-list', JSON.stringify(proposals));
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
  return 'prop-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

// Sweep every open proposal and flip stale rows to Expired once the
// window has passed, so the stage reflects reality without anyone
// having to notice and update it manually.
function reconcileExpiredRows() {
  let changed = false;
  proposals.forEach(p => {
    if (p.status !== 'open') return;
    const expiryDate = addDays(p.proposalSentDate, EXPIRY_DAYS);
    if (daysBetween(expiryDate, todayStr()) > 0 && STAGE_SEQUENCE.includes(p.followUpStage)) {
      p.followUpStage = 'Expired';
      changed = true;
    }
  });
  return changed;
}

function getUrgency(p) {
  if (p.status !== 'open') return 'closed';
  const expiryDate = addDays(p.proposalSentDate, EXPIRY_DAYS);
  const daysToExpiry = daysBetween(todayStr(), expiryDate);
  const daysOverdueFollowUp = p.nextFollowUpDate ? daysBetween(p.nextFollowUpDate, todayStr()) : 0;

  if (daysOverdueFollowUp >= 3 || daysToExpiry <= 2) return 'red';
  if (daysOverdueFollowUp >= 1) return 'yellow';
  return 'green';
}

function populateProspectDatalist() {
  const list = el('prospectOptions');
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
  const openRows = proposals.filter(p => p.status === 'open');
  const expiringThisWeek = openRows.filter(p => {
    const expiryDate = addDays(p.proposalSentDate, EXPIRY_DAYS);
    const d = daysBetween(todayStr(), expiryDate);
    return d >= 0 && d <= 7;
  });
  const overdue = openRows.filter(p => {
    if (!p.nextFollowUpDate) return false;
    return daysBetween(p.nextFollowUpDate, todayStr()) >= 1;
  });

  el('summaryOpen').textContent = openRows.length;
  el('summaryExpiring').textContent = expiringThisWeek.length;
  el('summaryOverdue').textContent = overdue.length;
}

function stageOptionsHtml(selected) {
  return ALL_STAGES.map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('');
}

function findProposal(id) {
  return proposals.find(p => p.id === id);
}

function renderTable() {
  const changed = reconcileExpiredRows();
  if (changed) persist();

  renderSummary();

  const showClosed = el('showClosedToggle').checked;

  const rows = [...proposals]
    .filter(p => showClosed || p.status === 'open')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return (a.nextFollowUpDate || '9999').localeCompare(b.nextFollowUpDate || '9999');
    });

  const tbody = el('trackerTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(p => {
    const expiryDate = addDays(p.proposalSentDate, EXPIRY_DAYS);
    const urgency = getUrgency(p);
    const tr = document.createElement('tr');
    tr.className = 'urgency-' + urgency;

    tr.innerHTML = `
      <td class="client-cell">${p.prospectName}</td>
      <td><input type="email" class="email-input" data-id="${p.id}" value="${(p.prospectEmail || '').replace(/"/g, '&quot;')}" placeholder="prospect@..."></td>
      <td class="date-cell">${p.proposalSentDate || '--'}</td>
      <td class="date-cell">${expiryDate}</td>
      <td><select class="stage-select" data-id="${p.id}">${stageOptionsHtml(p.followUpStage)}</select></td>
      <td class="date-cell">${p.lastContactDate || '--'}</td>
      <td class="date-cell">${p.nextFollowUpDate || '--'}</td>
      <td><input type="text" class="notes-input" data-id="${p.id}" value="${(p.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="send-followup-btn" data-id="${p.id}" ${p.status !== 'open' ? 'disabled' : ''}>Send Follow-Up</button>
          <button class="log-followup-btn" data-id="${p.id}" ${p.status !== 'open' ? 'disabled' : ''}>Log Follow-Up</button>
          <button class="win-btn" data-id="${p.id}" ${p.status !== 'open' ? 'disabled' : ''}>Mark as Won</button>
          <button class="lose-btn" data-id="${p.id}" ${p.status !== 'open' ? 'disabled' : ''}>Mark as Lost</button>
          <button class="delete-btn" data-id="${p.id}">Delete</button>
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
      const p = findProposal(sel.getAttribute('data-id'));
      if (!p) return;
      p.followUpStage = sel.value;
      if (sel.value === 'Closed Won') p.status = 'won';
      else if (sel.value === 'Closed Lost') p.status = 'lost';
      else if (STAGE_SEQUENCE.includes(sel.value)) p.status = 'open';
      await persist();
      renderTable();
    });
  });

  document.querySelectorAll('.notes-input').forEach(inp => {
    inp.addEventListener('input', async () => {
      const p = findProposal(inp.getAttribute('data-id'));
      if (!p) return;
      p.notes = inp.value;
      await persist();
    });
  });

  document.querySelectorAll('.email-input').forEach(inp => {
    inp.addEventListener('input', async () => {
      const p = findProposal(inp.getAttribute('data-id'));
      if (!p) return;
      p.prospectEmail = inp.value.trim();
      await persist();
    });
  });

  document.querySelectorAll('.send-followup-btn').forEach(btn => {
    btn.addEventListener('click', () => openSendFollowupPanel(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.log-followup-btn').forEach(btn => {
    btn.addEventListener('click', () => logFollowUp(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.win-btn').forEach(btn => {
    btn.addEventListener('click', () => closeProposal(btn.getAttribute('data-id'), 'won'));
  });
  document.querySelectorAll('.lose-btn').forEach(btn => {
    btn.addEventListener('click', () => closeProposal(btn.getAttribute('data-id'), 'lost'));
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteProposal(btn.getAttribute('data-id')));
  });
}

/* ── Send Follow-Up (real auto-send via Resend, plain text) ──
   Most prospects tracked here aren't a Client Workspace yet (see header
   comment), so there's no Account Manager on file to send as - unlike
   Renewal Tracker/QBR Generator/etc, which always send as the client's
   assigned Account Manager. This resolves "from" two ways: if the
   prospect name matches an existing client (the occasional
   upsell/expansion case), send as that client's real Account Manager;
   otherwise fall back to the shared hello@ inbox below, so replies
   always land somewhere the whole team can see rather than in whichever
   individual happened to be logged in when the send went out. Copy/mailto
   always work regardless of which (or neither) resolves. */

const FALLBACK_SENDER = { name: 'Revital Productions', email: 'hello@revitalproductions.com' };

function findClientRecordByName(name) {
  if (!isEmbedded || typeof window.parent.getAllClients !== 'function') return null;
  let clients = {};
  try { clients = window.parent.getAllClients() || {}; } catch (e) { return null; }
  const target = (name || '').trim().toLowerCase();
  const key = Object.keys(clients).find(k => k.trim().toLowerCase() === target);
  return key ? clients[key] : null;
}

function resolveFollowupSender() {
  return { name: FALLBACK_SENDER.name, email: FALLBACK_SENDER.email };
}

const STAGE_FOLLOWUP_COPY = {
  'Sent': (firstName, sender) => `Hi ${firstName},\n\nJust wanted to make sure the proposal I sent over landed okay and see if you had any questions so far.\n\nHappy to hop on a quick call if that's easier.\n\nThanks,\n${sender}`,
  'Day 3 Sent': (firstName, sender) => `Hi ${firstName},\n\nFollowing up on the proposal I sent over - wanted to check in and see where things stand on your end, and if there's anything I can clarify.\n\nThanks,\n${sender}`,
  'Day 7 Sent': (firstName, sender) => `Hi ${firstName},\n\nCircling back one more time on the proposal - totally understand if priorities have shifted, but wanted to see if it's still something you're considering, and if there's anything holding it up I can help with.\n\nThanks,\n${sender}`,
  'Day 12 Sent': (firstName, sender) => `Hi ${firstName},\n\nThis is my last check-in on the proposal before it expires - let me know if you'd like to move forward or if you have any last questions.\n\nThanks,\n${sender}`
};

const sendFollowupPanel = el('sendFollowupPanel');
const sendFollowupTo = el('sendFollowupTo');
const sendFollowupSubject = el('sendFollowupSubject');
const sendFollowupBody = el('sendFollowupBody');
const sendFollowupOpenBtn = el('sendFollowupOpenBtn');
const sendFollowupCopyBtn = el('sendFollowupCopyBtn');
const sendFollowupSendBtn = el('sendFollowupSendBtn');
const sendFollowupStatus = el('sendFollowupStatus');
const sendFollowupCloseBtn = el('sendFollowupCloseBtn');

let currentFollowupContext = null; // { id, from }

function refreshSendFollowupMailto() {
  if (!sendFollowupOpenBtn || !sendFollowupTo) return;
  sendFollowupOpenBtn.href = `mailto:${encodeURIComponent(sendFollowupTo.value)}?subject=${encodeURIComponent(sendFollowupSubject.value)}&body=${encodeURIComponent(sendFollowupBody.value)}`;
}

if (sendFollowupCloseBtn) {
  sendFollowupCloseBtn.addEventListener('click', () => {
    if (sendFollowupPanel) sendFollowupPanel.style.display = 'none';
  });
}

[sendFollowupTo, sendFollowupSubject, sendFollowupBody].forEach(elx => {
  if (elx) elx.addEventListener('input', refreshSendFollowupMailto);
});

if (sendFollowupCopyBtn) {
  sendFollowupCopyBtn.addEventListener('click', async () => {
    const text = `To: ${sendFollowupTo.value}\nSubject: ${sendFollowupSubject.value}\n\n${sendFollowupBody.value}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        sendFollowupBody.select();
        document.execCommand('copy');
      }
      const original = sendFollowupCopyBtn.textContent;
      sendFollowupCopyBtn.textContent = 'Copied!';
      setTimeout(() => { sendFollowupCopyBtn.textContent = original; }, 2000);
    } catch (err) {
      console.error('Failed to copy follow-up email', err);
      alert('Failed to copy. Please manually select and copy the text.');
    }
  });
}

function openSendFollowupPanel(id) {
  const p = findProposal(id);
  if (!p || p.status !== 'open') return;

  if (!p.prospectEmail) {
    alert(`Add a contact email for ${p.prospectName} first (the Contact Email column) before sending a follow-up.`);
    return;
  }

  const firstName = p.prospectName.split(' ')[0];
  const matchedClient = findClientRecordByName(p.prospectName);
  const clientConfig = matchedClient && matchedClient.portalConfig;

  let from = null;
  let isFallbackSender = false;
  let senderDisplayName = 'the Revital Productions team';
  if (clientConfig && clientConfig.accountManagerEmail && clientConfig.accountManagerName) {
    from = `${clientConfig.accountManagerName} <${clientConfig.accountManagerEmail}>`;
    senderDisplayName = clientConfig.accountManagerName.split(' ')[0];
  } else {
    const sender = resolveFollowupSender();
    if (sender) {
      from = `${sender.name} <${sender.email}>`;
      senderDisplayName = sender.name.split(' ')[0];
      isFallbackSender = true;
    }
  }

  const copyFn = STAGE_FOLLOWUP_COPY[p.followUpStage] || STAGE_FOLLOWUP_COPY['Sent'];
  const subject = `Following up on our proposal`;
  const body = copyFn(firstName, senderDisplayName);

  sendFollowupTo.value = p.prospectEmail;
  sendFollowupSubject.value = subject;
  sendFollowupBody.value = body;
  refreshSendFollowupMailto();

  currentFollowupContext = { id: p.id, from, isFallbackSender };

  if (sendFollowupSendBtn) {
    sendFollowupSendBtn.style.display = from ? 'inline-block' : 'none';
    sendFollowupSendBtn.disabled = false;
    sendFollowupSendBtn.textContent = 'Send';
  }
  if (sendFollowupStatus) {
    sendFollowupStatus.textContent = from ? '' : "Couldn't determine a sender address - use Copy or \"Open in Email App\" instead.";
    sendFollowupStatus.style.color = 'var(--text-muted)';
  }

  if (sendFollowupPanel) {
    sendFollowupPanel.style.display = 'block';
    sendFollowupPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

if (sendFollowupSendBtn) {
  sendFollowupSendBtn.addEventListener('click', async () => {
    if (!currentFollowupContext || !currentFollowupContext.from) return;

    sendFollowupSendBtn.disabled = true;
    sendFollowupSendBtn.textContent = 'Sending...';
    if (sendFollowupStatus) sendFollowupStatus.textContent = '';

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: sendFollowupTo.value,
          subject: sendFollowupSubject.value,
          body: sendFollowupBody.value,
          from: currentFollowupContext.from,
          replyTo: currentFollowupContext.isFallbackSender ? FALLBACK_REPLY_TO : undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }

      sendFollowupSendBtn.textContent = 'Sent ✓';
      if (sendFollowupStatus) {
        sendFollowupStatus.textContent = 'Sent successfully.';
        sendFollowupStatus.style.color = 'var(--color-success, #10b981)';
      }

      // Sending IS the follow-up contact, so advance the stage/dates the
      // same way "Log Follow-Up" does rather than leaving the row stale
      // until someone remembers to click that separately.
      const p = findProposal(currentFollowupContext.id);
      if (p) await logFollowUp(p.id);

      if (isEmbedded && window.parent.showBanner) {
        window.parent.showBanner('success', `Follow-up emailed to ${p ? p.prospectName : 'prospect'}.`);
      }
    } catch (e) {
      console.error('Send follow-up email failed:', e);
      sendFollowupSendBtn.disabled = false;
      sendFollowupSendBtn.textContent = 'Send';
      if (sendFollowupStatus) {
        sendFollowupStatus.textContent = "Couldn't send automatically (" + e.message + ") - use Copy or \"Open in Email App\" instead.";
        sendFollowupStatus.style.color = 'var(--color-error, #f68d5f)';
      }
    }
  });
}

async function logFollowUp(id) {
  const p = findProposal(id);
  if (!p || p.status !== 'open') return;

  const previous = { lastContactDate: p.lastContactDate, followUpStage: p.followUpStage, nextFollowUpDate: p.nextFollowUpDate };

  const today = todayStr();
  p.lastContactDate = today;

  const idx = STAGE_SEQUENCE.indexOf(p.followUpStage);
  const nextStageMap = { 'Sent': 7, 'Day 3 Sent': 12, 'Day 7 Sent': 14 };

  if (idx >= 0 && idx < STAGE_SEQUENCE.length - 1) {
    p.followUpStage = STAGE_SEQUENCE[idx + 1];
    p.nextFollowUpDate = addDays(p.proposalSentDate, nextStageMap[STAGE_SEQUENCE[idx]] || (idx + 1) * 3 + 3);
  } else {
    p.nextFollowUpDate = addDays(p.proposalSentDate, EXPIRY_DAYS);
  }

  const ok = await persist();
  if (!ok) {
    Object.assign(p, previous); // roll back — the stage never actually advanced
  }
  renderTable();

  if (ok && isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Logged follow-up for ${p.prospectName} — now at "${p.followUpStage}".`);
  }
}

async function closeProposal(id, outcome) {
  const p = findProposal(id);
  if (!p) return;
  const previous = { status: p.status, followUpStage: p.followUpStage };
  p.status = outcome;
  p.followUpStage = outcome === 'won' ? 'Closed Won' : 'Closed Lost';
  const ok = await persist();
  if (!ok) {
    Object.assign(p, previous); // roll back — the proposal was never actually closed
  }
  renderTable();

  if (ok && isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Marked ${p.prospectName} as ${outcome === 'won' ? 'Won 🎉' : 'Lost'}.`);
  }

  // Also move the matching Sales Pipeline Board lead to Closed Won/Lost,
  // if one exists - these used to be two fully independent "is this deal
  // closed" flags with no link between them (see syncPipelineLeadStage in
  // the main app.js for the full explanation). Best-effort: a missing
  // match or a sync failure shouldn't undo the close above, which already
  // succeeded and is the source of truth for this tool.
  if (ok && isEmbedded && window.parent.syncPipelineLeadStage) {
    window.parent.syncPipelineLeadStage(p.prospectName, outcome).catch(err =>
      console.error("Couldn't sync closed status to Sales Pipeline Board:", err));
  }
}

async function deleteProposal(id) {
  if (!confirm("Delete this proposal record? This can't be undone.")) return;
  const previous = proposals;
  proposals = proposals.filter(p => p.id !== id);
  const ok = await persist();
  if (!ok) {
    proposals = previous;
  }
  renderTable();
}

async function addTrackedProposal() {
  const nameInput = el('newProspectName');
  const dateInput = el('newSentDate');
  const prospectName = nameInput.value.trim();
  if (!prospectName) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Enter a prospect or company name first.');
    return;
  }
  const sentDate = dateInput.value || todayStr();

  proposals.push({
    id: uid(),
    prospectName,
    prospectEmail: '',
    status: 'open',
    proposalSentDate: sentDate,
    followUpStage: 'Sent',
    lastContactDate: sentDate,
    nextFollowUpDate: addDays(sentDate, 3),
    notes: ''
  });

  const ok = await persist();
  if (!ok) {
    proposals.pop();
    renderTable();
    return;
  }

  nameInput.value = '';
  dateInput.value = '';
  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Now tracking a proposal for ${prospectName}.`);
  }
}

function initListeners() {
  el('addTrackedProposalBtn').addEventListener('click', addTrackedProposal);
  el('showClosedToggle').addEventListener('change', renderTable);
}

document.addEventListener('DOMContentLoaded', async () => {
  populateProspectDatalist();
  await loadProposals();
  renderTable();
  initListeners();

  // Same as Referral Tracker: the prospect-name autocomplete list is a
  // nice-to-have, not a blocker (you can always just type a name) - but
  // still worth backfilling once the parent's client data actually syncs
  // in, in case this iframe loaded first.
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    let clientCount = 0;
    try { clientCount = isEmbedded ? Object.keys(window.parent.getAllClients() || {}).length : 0; } catch (e) {}
    if (clientCount > 0) {
      populateProspectDatalist();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
