/* ============================================================
   REFERRAL TRACKER — APP LOGIC
   (agency-wide: not tied to a single client, so this stores its own
   list at agency/referrals rather than living inside clientsDb)
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

let referrals = [];
let docVersion = 0; // optimistic-concurrency guard, see persist() below

function el(id) { return document.getElementById(id); }

function getReferralsDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "referrals");
}

async function loadReferrals() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getReferralsDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      referrals = (data && data.list) || [];
      docVersion = (data && data.version) || 0;
      return;
    } catch (e) {
      console.error("Couldn't load referrals from the cloud:", e);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', "Couldn't load referrals from the cloud: " + e.message);
      }
      referrals = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('referral-tracker-list');
    referrals = saved ? JSON.parse(saved) : [];
  } catch (e) { referrals = []; }
}

async function persist() {
  if (isEmbedded && window.parent.saveVersionedAgencyDoc) {
    const result = await window.parent.saveVersionedAgencyDoc({
      docRef: getReferralsDocRef(),
      currentVersion: docVersion,
      buildPayload: (v) => ({ list: referrals, version: v }),
    });
    if (!result.ok) {
      if (result.reason === 'error') console.error("Couldn't save referrals to the cloud:", result.error);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', result.reason === 'conflict'
          ? "Someone else updated the referral list while you had it open. Reload the page to see their changes, then redo your edit."
          : "Couldn't save — your change may be lost on reload: " + result.error.message);
      }
      return false;
    }
    docVersion = result.version;
    // agency/referrals lives outside clientsDb (see header comment), so
    // saving here never goes through the parent's own saveDatabase() -
    // which is what actually pushes fresh referralSummary data out to
    // each client's public portal doc (see syncPublicPortalDocs and
    // fetchReferralSummaries in the parent Hub's app.js). Without this
    // call, a client's "My Referrals" tab would only pick up a referral
    // logged here the next time the admin happened to save something
    // unrelated elsewhere in the Hub - could be hours or days later.
    if (window.parent.saveDatabase) window.parent.saveDatabase();
    return true;
  }
  try {
    localStorage.setItem('referral-tracker-list', JSON.stringify(referrals));
  } catch (e) {}
  return true;
}

function todayStr() {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

function uid() {
  return 'ref-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

const STATUS_OPTIONS = ['Pending', 'Became Client', 'Declined'];
const REWARD_OPTIONS = ['Not Owed', 'Owed', 'Paid'];

function populateReferrerDatalist() {
  const list = el('referrerOptions');
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

// ── Referrer name near-match warning ──
// findClientRecordByName() below (used to auto-fill the referrer's
// email) and QBR Generator's referral counts both match this field
// against a real Client Workspace name by exact, case-insensitive
// string - no shared ID. A typo here means the email won't auto-fill
// AND the referral silently won't count toward that client's QBR. Not a
// hard block - a referrer who legitimately isn't an existing client yet
// is the normal case, so this only fires when the typed name is close
// enough to a real one to look like a typo.
function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const row = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[n];
}

function findNearMatchClientName(typedName, realNames) {
  const typed = (typedName || '').trim().toLowerCase();
  if (!typed) return null;
  if (realNames.some(n => n.toLowerCase() === typed)) return null; // exact match - already correct
  let best = null, bestDist = Infinity;
  realNames.forEach(n => {
    const dist = levenshteinDistance(typed, n.toLowerCase());
    if (dist < bestDist) { bestDist = dist; best = n; }
  });
  if (!best) return null;
  const threshold = Math.max(1, Math.floor(best.length * 0.25));
  return (bestDist > 0 && bestDist <= threshold) ? best : null;
}

function updateReferrerNameHint() {
  const hintEl = el('referrerNameMatchHint');
  const referrerInput = el('newReferrerName');
  if (!hintEl || !referrerInput) return;
  if (!isEmbedded || typeof window.parent.getAllClients !== 'function') { hintEl.style.display = 'none'; return; }
  let clients = {};
  try { clients = window.parent.getAllClients() || {}; } catch (e) { clients = {}; }
  const realNames = Object.keys(clients).filter(n => n !== SANDBOX_NAME);
  const match = findNearMatchClientName(referrerInput.value, realNames);
  if (match) {
    hintEl.textContent = `Did you mean "${match}"? Matching their Client Workspace name exactly auto-fills their email and keeps QBR Generator's referral count linked to this client.`;
    hintEl.style.display = 'block';
  } else {
    hintEl.style.display = 'none';
  }
}

function renderSummary() {
  const pending = referrals.filter(r => r.status === 'Pending');
  const won = referrals.filter(r => r.status === 'Became Client');
  const owed = referrals.filter(r => r.rewardStatus === 'Owed');

  el('summaryPending').textContent = pending.length;
  el('summaryWon').textContent = won.length;
  el('summaryOwed').textContent = owed.length;
}

function optionsHtml(list, selected) {
  return list.map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('');
}

function renderTable() {
  renderSummary();

  const rows = [...referrals].sort((a, b) => (b.dateReferred || '').localeCompare(a.dateReferred || ''));

  const tbody = el('trackerTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(r => {
    const tr = document.createElement('tr');
    const closed = r.status !== 'Pending';
    tr.className = closed ? 'urgency-closed' : (r.rewardStatus === 'Owed' ? 'urgency-yellow' : 'urgency-green');

    tr.innerHTML = `
      <td class="name-cell">${r.referrerName}</td>
      <td><input type="email" class="referrer-email-input" data-id="${r.id}" value="${(r.referrerEmail || '').replace(/"/g, '&quot;')}" placeholder="referrer@..."></td>
      <td class="name-cell">${r.referredName}</td>
      <td class="date-cell">${r.dateReferred || '--'}</td>
      <td><select class="status-select" data-id="${r.id}">${optionsHtml(STATUS_OPTIONS, r.status)}</select></td>
      <td><select class="reward-select" data-id="${r.id}">${optionsHtml(REWARD_OPTIONS, r.rewardStatus)}</select></td>
      <td><input type="text" inputmode="decimal" class="reward-amount-input" data-id="${r.id}" value="${r.rewardAmount ? formatNumberWithCommas(r.rewardAmount) : ''}" placeholder="$"></td>
      <td><input type="text" class="notes-input" data-id="${r.id}" value="${(r.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="send-thankyou-btn" data-id="${r.id}">Send Thank You</button>
          <button class="delete-btn" data-id="${r.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  wireRowListeners();
}

function findReferral(id) {
  return referrals.find(r => r.id === id);
}

function wireRowListeners() {
  document.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const r = findReferral(sel.getAttribute('data-id'));
      if (!r) return;
      r.status = sel.value;
      // Becoming a client is the natural trigger for a reward to be owed,
      // but this is just a helpful default — reward status stays fully
      // editable afterward for cases with no reward, already-paid, etc.
      if (sel.value === 'Became Client' && r.rewardStatus === 'Not Owed') {
        r.rewardStatus = 'Owed';
      }
      await persist();
      renderTable();
    });
  });

  document.querySelectorAll('.reward-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const r = findReferral(sel.getAttribute('data-id'));
      if (!r) return;
      r.rewardStatus = sel.value;
      await persist();
      renderTable();
    });
  });

  document.querySelectorAll('.reward-amount-input').forEach(inp => {
    if (typeof attachCommaFormatting === 'function') attachCommaFormatting(inp);
    if (typeof attachSpinnerButtons === 'function') attachSpinnerButtons(inp, { step: 1 });
    inp.addEventListener('change', async () => {
      const r = findReferral(inp.getAttribute('data-id'));
      if (!r) return;
      r.rewardAmount = inp.value ? parseFormattedNumber(inp.value) : '';
      await persist();
    });
  });

  document.querySelectorAll('.notes-input').forEach(inp => {
    inp.addEventListener('input', async () => {
      const r = findReferral(inp.getAttribute('data-id'));
      if (!r) return;
      r.notes = inp.value;
      await persist();
    });
  });

  document.querySelectorAll('.referrer-email-input').forEach(inp => {
    inp.addEventListener('input', async () => {
      const r = findReferral(inp.getAttribute('data-id'));
      if (!r) return;
      r.referrerEmail = inp.value.trim();
      await persist();
    });
  });

  document.querySelectorAll('.send-thankyou-btn').forEach(btn => {
    btn.addEventListener('click', () => openThankYouPanel(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteReferral(btn.getAttribute('data-id')));
  });
}

async function deleteReferral(id) {
  if (!confirm('Delete this referral record? This can\'t be undone.')) return;
  const previous = referrals;
  referrals = referrals.filter(r => r.id !== id);
  const ok = await persist();
  if (!ok) {
    referrals = previous; // roll back on a failed write
  }
  renderTable();
}

async function addReferral() {
  const referrerInput = el('newReferrerName');
  const referredInput = el('newReferredName');
  const dateInput = el('newReferralDate');

  const referrerName = referrerInput.value.trim();
  const referredName = referredInput.value.trim();
  if (!referrerName || !referredName) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Enter both who referred and who they referred.');
    return;
  }

  // Auto-fill the referrer's email from a matching client if one exists
  // (the referrer datalist is sourced from clientsDb, so this usually
  // hits) - still fully editable afterward for referrers who aren't an
  // existing client, or whose contact email isn't set yet.
  const matchedReferrer = findClientRecordByName(referrerName);
  const referrerEmail = (matchedReferrer && matchedReferrer.portalConfig && matchedReferrer.portalConfig.clientContactEmail) || '';

  referrals.push({
    id: uid(),
    referrerName,
    referrerEmail,
    referredName,
    dateReferred: dateInput.value || todayStr(),
    status: 'Pending',
    rewardStatus: 'Not Owed',
    rewardAmount: '',
    notes: ''
  });

  const ok = await persist();
  if (!ok) {
    referrals.pop(); // roll back on a failed write
    renderTable();
    return;
  }

  referrerInput.value = '';
  referredInput.value = '';
  dateInput.value = '';
  updateReferrerNameHint();
  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Logged referral: ${referrerName} → ${referredName}.`);
  }
}

/* ── Ask for a Referral / Send Thank You (real auto-send via Resend) ──
   Two different sends sharing one panel (see currentReferralSendContext
   below), since only one is ever open at a time:
     - "Ask": proactive, not tied to any logged referral - pick an
       existing client and ask if they know anyone who could use us.
     - "Thank You": tied to a specific row - thanks whoever's in that
       row's Referred By, with copy that adapts to the referral's status
       and reward. Same as Proposal Follow-Up/Testimonial Tracker, "from"
       prefers the referrer's own Account Manager (when they're an
       existing client) and falls back to the shared hello@ inbox
       otherwise. Copy/mailto always available either way. */

function findClientRecordByName(name) {
  if (!isEmbedded || typeof window.parent.getAllClients !== 'function') return null;
  let clients = {};
  try { clients = window.parent.getAllClients() || {}; } catch (e) { return null; }
  const target = (name || '').trim().toLowerCase();
  const key = Object.keys(clients).find(k => k.trim().toLowerCase() === target);
  return key ? clients[key] : null;
}

// Shared fallback inbox for sends with no per-client Account Manager on
// file (e.g. asking a client with no AM assigned yet, or thanking a
// referrer who isn't a client at all) - replies land somewhere the whole
// team can see, rather than in whichever individual happened to be
// logged in when the send went out.
const FALLBACK_SENDER = { name: 'Revital Productions', email: 'hello@revitalproductions.com' };

function resolveReferralSender() {
  return { name: FALLBACK_SENDER.name, email: FALLBACK_SENDER.email };
}

function populateAskReferralClientSelect() {
  const select = el('askReferralClientSelect');
  if (!select) return;
  const previousValue = select.value;
  select.innerHTML = '<option value="">Select a client...</option>';
  if (!isEmbedded || typeof window.parent.getAllClients !== 'function') return;
  let clients = {};
  try { clients = window.parent.getAllClients() || {}; } catch (e) { clients = {}; }
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  if (previousValue) select.value = previousValue;
}

const sendReferralPanel = el('sendReferralPanel');
const sendReferralPanelLabel = el('sendReferralPanelLabel');
const sendReferralTo = el('sendReferralTo');
const sendReferralSubject = el('sendReferralSubject');
const sendReferralBody = el('sendReferralBody');
const sendReferralOpenBtn = el('sendReferralOpenBtn');
const sendReferralCopyBtn = el('sendReferralCopyBtn');
const sendReferralSendBtn = el('sendReferralSendBtn');
const sendReferralStatus = el('sendReferralStatus');
const sendReferralCloseBtn = el('sendReferralCloseBtn');

let currentReferralSendContext = null; // { kind: 'ask'|'thankyou', referralId?, from }

function refreshSendReferralMailto() {
  if (!sendReferralOpenBtn || !sendReferralTo) return;
  sendReferralOpenBtn.href = `mailto:${encodeURIComponent(sendReferralTo.value)}?subject=${encodeURIComponent(sendReferralSubject.value)}&body=${encodeURIComponent(sendReferralBody.value)}`;
}

if (sendReferralCloseBtn) {
  sendReferralCloseBtn.addEventListener('click', () => {
    if (sendReferralPanel) sendReferralPanel.style.display = 'none';
  });
}

[sendReferralTo, sendReferralSubject, sendReferralBody].forEach(elx => {
  if (elx) elx.addEventListener('input', refreshSendReferralMailto);
});

if (sendReferralCopyBtn) {
  sendReferralCopyBtn.addEventListener('click', async () => {
    const text = `To: ${sendReferralTo.value}\nSubject: ${sendReferralSubject.value}\n\n${sendReferralBody.value}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        sendReferralBody.select();
        document.execCommand('copy');
      }
      const original = sendReferralCopyBtn.textContent;
      sendReferralCopyBtn.textContent = 'Copied!';
      setTimeout(() => { sendReferralCopyBtn.textContent = original; }, 2000);
    } catch (err) {
      console.error('Failed to copy referral email', err);
      alert('Failed to copy. Please manually select and copy the text.');
    }
  });
}

function resolveSenderFor(clientRecord) {
  const config = clientRecord && clientRecord.portalConfig;
  if (config && config.accountManagerEmail && config.accountManagerName) {
    return { from: `${config.accountManagerName} <${config.accountManagerEmail}>`, firstName: config.accountManagerName.split(' ')[0], isFallback: false };
  }
  const sender = resolveReferralSender();
  if (sender) return { from: `${sender.name} <${sender.email}>`, firstName: sender.name.split(' ')[0], isFallback: true };
  return { from: null, firstName: 'the Revital Productions team', isFallback: false };
}

function openAskReferralPanel() {
  const select = el('askReferralClientSelect');
  const clientName = select ? select.value : '';
  if (!clientName) {
    alert('Select a client first.');
    return;
  }
  const client = findClientRecordByName(clientName);
  const config = client && client.portalConfig;
  if (!config || !config.clientContactEmail) {
    alert(`${clientName} has no Contact Email set in Client Portal Manager yet - add one before sending an ask.`);
    return;
  }

  const contactFirstName = (config.clientContactName || clientName).split(' ')[0];
  const { from, firstName, isFallback } = resolveSenderFor(client);

  const subject = `Know anyone who could use us?`;
  const body = `Hi ${contactFirstName},\n\nThings have been going great, and it's always a huge compliment when a happy client sends someone our way. If you know anyone who could use help with what we do for you, we'd love an introduction - and we'll make sure it's worth your while.\n\nNo pressure at all, just wanted to plant the seed!\n\nThanks,\n${firstName}`;

  sendReferralTo.value = config.clientContactEmail;
  sendReferralSubject.value = subject;
  sendReferralBody.value = body;
  refreshSendReferralMailto();

  currentReferralSendContext = { kind: 'ask', from, isFallback };
  if (sendReferralPanelLabel) sendReferralPanelLabel.textContent = `Referral ask ready to send to ${clientName}:`;
  showSendReferralPanel(from, clientName);
}

function openThankYouPanel(id) {
  const r = findReferral(id);
  if (!r) return;

  if (!r.referrerEmail) {
    alert(`Add ${r.referrerName}'s email first (the Referrer Email column) before sending a thank you.`);
    return;
  }

  const referrerFirstName = r.referrerName.split(' ')[0];
  const matchedClient = findClientRecordByName(r.referrerName);
  const { from, firstName, isFallback } = resolveSenderFor(matchedClient);

  let body;
  if (r.status === 'Became Client') {
    const rewardLine = r.rewardStatus === 'Paid'
      ? "Your referral reward has already gone out - thank you again!"
      : "We'll be sending your referral reward your way shortly - thank you again!";
    body = `Hi ${referrerFirstName},\n\nJust wanted to say a huge thank you for referring ${r.referredName} our way - they're now a client! We really appreciate you thinking of us.\n\n${rewardLine}\n\nThanks,\n${firstName}`;
  } else {
    body = `Hi ${referrerFirstName},\n\nJust wanted to say thank you for referring ${r.referredName} our way - we really appreciate you thinking of us, and it means a lot either way it turns out.\n\nThanks,\n${firstName}`;
  }

  sendReferralTo.value = r.referrerEmail;
  sendReferralSubject.value = `Thank you for the referral!`;
  sendReferralBody.value = body;
  refreshSendReferralMailto();

  currentReferralSendContext = { kind: 'thankyou', referralId: r.id, from, isFallback };
  if (sendReferralPanelLabel) sendReferralPanelLabel.textContent = `Thank-you email ready to send to ${r.referrerName}:`;
  showSendReferralPanel(from, r.referrerName);
}

function showSendReferralPanel(from, recipientLabel) {
  if (sendReferralSendBtn) {
    sendReferralSendBtn.style.display = from ? 'inline-block' : 'none';
    sendReferralSendBtn.disabled = false;
    sendReferralSendBtn.textContent = 'Send';
  }
  if (sendReferralStatus) {
    sendReferralStatus.textContent = from ? '' : "Couldn't determine a sender address - use Copy or \"Open in Email App\" instead.";
    sendReferralStatus.style.color = 'var(--text-muted)';
  }
  if (sendReferralPanel) {
    sendReferralPanel.style.display = 'block';
    sendReferralPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

if (sendReferralSendBtn) {
  sendReferralSendBtn.addEventListener('click', async () => {
    if (!currentReferralSendContext || !currentReferralSendContext.from) return;

    sendReferralSendBtn.disabled = true;
    sendReferralSendBtn.textContent = 'Sending...';
    if (sendReferralStatus) sendReferralStatus.textContent = '';

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: sendReferralTo.value,
          subject: sendReferralSubject.value,
          body: sendReferralBody.value,
          from: currentReferralSendContext.from
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }

      sendReferralSendBtn.textContent = 'Sent ✓';
      if (sendReferralStatus) {
        sendReferralStatus.textContent = 'Sent successfully.';
        sendReferralStatus.style.color = 'var(--color-success, #10b981)';
      }
      if (isEmbedded && window.parent.showBanner) {
        window.parent.showBanner('success', currentReferralSendContext.kind === 'ask'
          ? 'Referral ask sent.'
          : 'Thank-you email sent.');
      }
    } catch (e) {
      console.error('Send referral email failed:', e);
      sendReferralSendBtn.disabled = false;
      sendReferralSendBtn.textContent = 'Send';
      if (sendReferralStatus) {
        sendReferralStatus.textContent = "Couldn't send automatically (" + e.message + ") - use Copy or \"Open in Email App\" instead.";
        sendReferralStatus.style.color = 'var(--color-error, #f68d5f)';
      }
    }
  });
}

function initListeners() {
  el('addReferralBtn').addEventListener('click', addReferral);
  const composeAskBtn = el('composeAskReferralBtn');
  if (composeAskBtn) composeAskBtn.addEventListener('click', openAskReferralPanel);
  const referrerInput = el('newReferrerName');
  if (referrerInput) referrerInput.addEventListener('input', updateReferrerNameHint);
}

document.addEventListener('DOMContentLoaded', async () => {
  populateReferrerDatalist();
  populateAskReferralClientSelect();
  await loadReferrals();
  renderTable();
  initListeners();

  // Same class of fix as the other trackers: if this iframe finishes
  // loading before the parent Hub's clientsDb has synced, the referrer
  // autocomplete list comes up empty and never refills since it only
  // ever populates once. Poll briefly and re-populate once real data
  // shows up (harmless no-op once it's already populated).
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    let clientCount = 0;
    try { clientCount = isEmbedded ? Object.keys(window.parent.getAllClients() || {}).length : 0; } catch (e) {}
    if (clientCount > 0) {
      populateReferrerDatalist();
      populateAskReferralClientSelect();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
