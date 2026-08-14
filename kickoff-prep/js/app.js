/* ============================================================
   KICKOFF PREP & DECK — APP LOGIC
   Bridges the gap between Discovery Call Script and everything that
   happens after a deal closes:
     1. Discovery Recap - read-only view of client.discoveryCall.data
        (the same object Discovery Call Script writes to), so whoever
        preps for or runs the kickoff call sees what was actually said
        on the discovery call instead of starting from scratch.
     2. Kickoff Call Notes - an internal record of the kickoff call
        itself (client.kickoffPrep.notes), the same "log what happened"
        pattern Weekly Check-In and Meeting Notes Logger already use.
     3. Client-Facing Slideshow (client.kickoffPrep.deck.slides) -
        auto-built from the discovery call's pain-point and goals
        answers, in the client's own words, then freely editable and
        presentable full-screen right from the browser (or exportable
        as a PDF) - meant to be shown TO the client on the kickoff call
        itself, to demonstrate the agency actually listened.

   Own client dropdown rather than the global active client (same
   reasoning as Mood Board Builder/Brand Asset Kit) - prepping for a
   different client's upcoming kickoff shouldn't require switching what
   the rest of the Hub is pointed at.

   Coupling note: the discovery-recap section reads specific answer ids
   (pain_1/pain_2/pain_3/goals_1/goals_2/etc.) hardcoded to match
   discovery-call-script/js/app.js's BLOCKS array - the two files can't
   share that array directly (separate iframes), so if a question id
   ever changes there, PAIN_QUESTIONS/GOAL_QUESTIONS/CONTEXT_QUESTIONS
   below need updating to match.
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
  return {};
}

function persist() {
  if (isEmbedded) window.parent.saveDatabase();
}

function getGlobalActiveClientName() {
  if (!isEmbedded) return null;
  try {
    const active = window.parent.getActiveClient && window.parent.getActiveClient();
    if (!active) return null;
    const clients = getClients();
    return Object.keys(clients).find(name => clients[name] === active) || null;
  } catch (e) {
    return null;
  }
}

function populateClientSelect() {
  const clients = getClients();
  const select = el('clientSelect');
  const prevValue = select.value;
  select.innerHTML = '<option value="">Select a client...</option>';
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  if (prevValue && clients[prevValue]) {
    select.value = prevValue;
  } else if (!prevValue) {
    const activeName = getGlobalActiveClientName();
    if (activeName && clients[activeName]) select.value = activeName;
  }
}

function currentClientName() { return el('clientSelect').value; }

function currentClient() {
  const name = currentClientName();
  if (!name) return null;
  const clients = getClients();
  return clients[name] || null;
}

function uid(prefix) { return (prefix || 'kp') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ── Discovery Call question map (see coupling note above) ──
const PAIN_QUESTIONS = [
  { id: 'pain_1', heading: 'The Challenge' },
  { id: 'pain_2', heading: 'What Hasn’t Worked Before' },
  { id: 'pain_3', heading: 'The Cost of Waiting' }
];
const GOAL_QUESTIONS = [
  { id: 'goals_1', label: 'What success looks like' },
  { id: 'goals_2', label: 'What matters most' }
];
const CONTEXT_QUESTIONS = [
  { id: 'business_1', label: 'The Business' },
  { id: 'business_2', label: 'History & Growth' },
  { id: 'business_3', label: 'Who Handles Marketing' },
  { id: 'situation_1', label: 'Current Channels' },
  { id: 'situation_2', label: 'Existing Brand Assets' },
  { id: 'situation_3', label: 'Website' }
];

function ensureKickoffPrep(client) {
  if (!client.kickoffPrep) client.kickoffPrep = {};
  if (!client.kickoffPrep.notes) client.kickoffPrep.notes = {};
  if (!client.kickoffPrep.deck || !Array.isArray(client.kickoffPrep.deck.slides)) {
    client.kickoffPrep.deck = { slides: [] };
  }
  return client.kickoffPrep;
}

// ── Discovery Recap (read-only) ──
function renderDiscoveryRecap() {
  const client = currentClient();
  const body = el('discoveryRecapBody');
  const noDataNote = el('noDiscoveryDataNote');
  if (!client) { body.innerHTML = ''; noDataNote.style.display = 'none'; return; }

  const dc = client.discoveryCall && client.discoveryCall.data;
  const answers = (dc && dc.answers) || {};
  const postCall = (dc && dc.postCall) || {};
  const hasAnyAnswer = Object.values(answers).some(v => (v || '').trim());

  if (!dc || !hasAnyAnswer) {
    body.innerHTML = '';
    noDataNote.style.display = 'block';
    return;
  }
  noDataNote.style.display = 'none';

  const blocks = [];

  const metaBits = [];
  if (dc.header && dc.header.callDate) metaBits.push(`<strong>Call date:</strong> ${escapeHtml(dc.header.callDate)}`);
  if (postCall.overallFit) {
    const fitLabels = { not_a_fit: '🔴 Not a Fit', possible: '🟡 Possible', strong_fit: '🟢 Strong Fit' };
    metaBits.push(`<strong>Fit:</strong> ${fitLabels[postCall.overallFit] || escapeHtml(postCall.overallFit)}`);
  }
  if (postCall.recommendedPackage) metaBits.push(`<strong>Recommended package:</strong> ${escapeHtml(postCall.recommendedPackage.replace(/_/g, ' '))}`);
  if (postCall.estimatedRetainer) metaBits.push(`<strong>Estimated retainer:</strong> $${escapeHtml(postCall.estimatedRetainer)}/mo`);
  if (metaBits.length) blocks.push(`<div class="kp-recap-meta">${metaBits.map(b => `<span>${b}</span>`).join('')}</div>`);

  PAIN_QUESTIONS.forEach(q => {
    const val = (answers[q.id] || '').trim();
    if (!val) return;
    blocks.push(`<div class="kp-recap-block"><div class="kp-recap-block-label">${escapeHtml(q.heading)}</div><div class="kp-recap-block-value">${escapeHtml(val)}</div></div>`);
  });

  GOAL_QUESTIONS.forEach(q => {
    const val = (answers[q.id] || '').trim();
    if (!val) return;
    blocks.push(`<div class="kp-recap-block"><div class="kp-recap-block-label">${escapeHtml(q.label)}</div><div class="kp-recap-block-value">${escapeHtml(val)}</div></div>`);
  });

  CONTEXT_QUESTIONS.forEach(q => {
    const val = (answers[q.id] || '').trim();
    if (!val) return;
    blocks.push(`<div class="kp-recap-block"><div class="kp-recap-block-label">${escapeHtml(q.label)}</div><div class="kp-recap-block-value">${escapeHtml(val)}</div></div>`);
  });

  if (postCall.notes) {
    blocks.push(`<div class="kp-recap-block"><div class="kp-recap-block-label">Post-Call Notes</div><div class="kp-recap-block-value">${escapeHtml(postCall.notes)}</div></div>`);
  }

  body.innerHTML = blocks.join('');
}

// ── Sales → Delivery Handoff ──
// Assigns client.portalConfig.accountManager{Name,Email,Phone} from a Team
// Roster pick (instead of the free-text field Client Portal Manager exposes
// - this still writes the same fields, so the two stay in sync), logs a
// client.deliveryHandoff record, and fires the account manager notification
// email - the Hub-side equivalent of the documented process's Zap 1
// (Intake Form Submitted → email notification to account manager) and the
// Day 2 "Sales → Delivery Handoff Form" step in ClickUp.
let teamRosterMembers = [];

async function loadTeamRoster() {
  if (!isEmbedded || typeof window.parent.getTeamRosterMembers !== 'function') {
    teamRosterMembers = [];
    populateAmSelect();
    return;
  }
  try {
    teamRosterMembers = await window.parent.getTeamRosterMembers() || [];
  } catch (e) {
    teamRosterMembers = [];
  }
  populateAmSelect();
}

function populateAmSelect() {
  const select = el('handoffAmSelect');
  const prev = select.value;
  select.innerHTML = '<option value="">Select account manager...</option>';
  teamRosterMembers.slice()
    .sort((a, b) => (a.memberName || '').localeCompare(b.memberName || ''))
    .forEach(m => {
      if (!m.memberName) return;
      const opt = document.createElement('option');
      opt.value = m.memberName;
      opt.textContent = m.memberName + (m.role ? ` — ${m.role}` : '');
      select.appendChild(opt);
    });
  if (prev) select.value = prev;
}

function findRosterMember(name) {
  return teamRosterMembers.find(m => m.memberName === name) || null;
}

function renderHandoffStatus() {
  const client = currentClient();
  const statusEl = el('handoffStatus');
  const h = client && client.deliveryHandoff;
  if (!client || !h) { statusEl.style.display = 'none'; statusEl.innerHTML = ''; return; }
  const dateStr = h.handoffDate ? new Date(h.handoffDate).toLocaleDateString() : '';
  statusEl.style.display = 'block';
  statusEl.innerHTML = `<strong>Handed off ${escapeHtml(dateStr)}</strong> by ${escapeHtml(h.handoffBy || 'unknown')} — assigned to ${escapeHtml(h.accountManager || '')}.${h.notes ? ' Notes: ' + escapeHtml(h.notes) : ''}`;
}

function loadHandoffForm() {
  const client = currentClient();
  const select = el('handoffAmSelect');
  const phoneInput = el('handoffAmPhone');
  const notesInput = el('handoffNotes');
  if (!client) {
    select.value = '';
    phoneInput.value = '';
    notesInput.value = '';
    renderHandoffStatus();
    return;
  }
  const h = client.deliveryHandoff;
  const config = client.portalConfig || {};
  select.value = (h && h.accountManager) || config.accountManagerName || '';
  phoneInput.value = config.accountManagerPhone || '';
  notesInput.value = (h && h.notes) || '';
  renderHandoffStatus();
}

function completeHandoff() {
  const client = currentClient();
  if (!client) { if (window.parent.showBanner) window.parent.showBanner('error', 'Select a client first.'); return; }

  const amName = el('handoffAmSelect').value;
  if (!amName) { if (window.parent.showBanner) window.parent.showBanner('error', 'Select an account manager.'); return; }

  const member = findRosterMember(amName);
  const phone = el('handoffAmPhone').value.trim();
  const notes = el('handoffNotes').value.trim();

  if (!client.portalConfig) client.portalConfig = {};
  client.portalConfig.accountManagerName = amName;
  if (member && member.email) client.portalConfig.accountManagerEmail = member.email;
  if (phone) client.portalConfig.accountManagerPhone = phone;

  client.deliveryHandoff = {
    accountManager: amName,
    accountManagerEmail: (member && member.email) || client.portalConfig.accountManagerEmail || '',
    notes: notes,
    handoffDate: new Date().toISOString(),
    handoffBy: window.parent.currentAdminEmail || 'unknown'
  };

  persist();
  renderHandoffStatus();

  const clientName = currentClientName();
  if (window.parent.logAdminActivity) window.parent.logAdminActivity('Sales-to-delivery handoff completed', `${clientName} — assigned to ${amName}`);
  if (window.parent.pushAdminNotification) window.parent.pushAdminNotification('handoff_completed', `Handoff completed for ${clientName} — assigned to ${amName}.`, clientName);

  const hasEmail = member && member.email;
  if (hasEmail && window.parent.emailAccountManagerHandoffNotification) {
    window.parent.emailAccountManagerHandoffNotification(client, notes, clientName);
  }
  if (window.parent.showBanner) {
    window.parent.showBanner('success', hasEmail
      ? `Handoff complete - ${amName} notified.`
      : `Handoff logged, but ${amName} has no email on file in Team Roster, so no notification was sent. Add one there to enable auto-notify.`);
  }
}

// ── Kickoff Call Notes ──
const KICKOFF_NOTE_FIELDS = [
  ['kickoffDate', 'date'],
  ['kickoffAttendees', 'attendees'],
  ['kickoffKeyStakeholders', 'keyStakeholders'],
  ['kickoffGoalsConfirmed', 'goalsConfirmed'],
  ['kickoffPriorities', 'priorities'],
  ['kickoffNotes', 'notes']
];

function loadKickoffNotesForm() {
  const client = currentClient();
  const notes = client ? ensureKickoffPrep(client).notes : {};
  KICKOFF_NOTE_FIELDS.forEach(([elId, field]) => {
    const input = el(elId);
    if (input) input.value = notes[field] || '';
  });
  el('kickoffNotesSavedNote').textContent = '';
}

function saveKickoffNotes() {
  const client = currentClient();
  if (!client) { if (window.parent.showBanner) window.parent.showBanner('error', 'Select a client first.'); return; }
  const kp = ensureKickoffPrep(client);
  KICKOFF_NOTE_FIELDS.forEach(([elId, field]) => {
    const input = el(elId);
    if (input) kp.notes[field] = input.value;
  });
  persist();
  el('kickoffNotesSavedNote').textContent = 'Saved.';
  setTimeout(() => { el('kickoffNotesSavedNote').textContent = ''; }, 3000);
  if (window.parent.showBanner) window.parent.showBanner('success', `Kickoff notes saved for ${currentClientName()}.`);
}

// ── Slide deck ──
function generateSlidesFromDiscovery() {
  const client = currentClient();
  if (!client) { if (window.parent.showBanner) window.parent.showBanner('error', 'Select a client first.'); return; }
  const kp = ensureKickoffPrep(client);

  if (kp.deck.slides.length > 0) {
    if (!confirm('This replaces the current slides with a fresh deck built from the discovery call. Continue?')) return;
  }

  const dc = client.discoveryCall && client.discoveryCall.data;
  const answers = (dc && dc.answers) || {};
  const postCall = (dc && dc.postCall) || {};
  const company = (dc && dc.header && dc.header.company) || currentClientName();

  const slides = [];

  slides.push({ id: uid(), type: 'title', heading: `Welcome, ${company}`, body: 'Kickoff Call' });

  PAIN_QUESTIONS.forEach(q => {
    const val = (answers[q.id] || '').trim();
    if (!val) return;
    slides.push({ id: uid(), type: 'pain', heading: q.heading, body: `"${val}"` });
  });

  const goalParts = GOAL_QUESTIONS.map(q => (answers[q.id] || '').trim()).filter(Boolean);
  if (goalParts.length) {
    slides.push({ id: uid(), type: 'goal', heading: 'What Success Looks Like', body: goalParts.join('\n\n') });
  }

  // "How we'll help" - one editable slide per pain point identified, so
  // it's obvious which answer to write the response to. Pre-seeded with
  // the recommended package if one was set, otherwise left blank for
  // the account manager to fill in before presenting.
  const packageLine = postCall.recommendedPackage
    ? `We recommended: ${postCall.recommendedPackage.replace(/_/g, ' ')}`
    : '';
  PAIN_QUESTIONS.forEach(q => {
    const val = (answers[q.id] || '').trim();
    if (!val) return;
    slides.push({ id: uid(), type: 'solution', heading: `How We'll Help — ${q.heading}`, body: packageLine });
  });

  slides.push({ id: uid(), type: 'closing', heading: "Let's Get Started", body: "We're excited to get to work. Here's what happens next." });

  kp.deck.slides = slides;
  persist();
  renderSlideList();
  if (window.parent.showBanner) window.parent.showBanner('success', `Built a ${slides.length}-slide deck from the discovery call.`);
}

function addBlankSlide() {
  const client = currentClient();
  if (!client) { if (window.parent.showBanner) window.parent.showBanner('error', 'Select a client first.'); return; }
  const kp = ensureKickoffPrep(client);
  kp.deck.slides.push({ id: uid(), type: 'custom', heading: 'New Slide', body: '' });
  persist();
  renderSlideList();
}

function removeSlide(id) {
  const client = currentClient();
  if (!client) return;
  const kp = ensureKickoffPrep(client);
  if (!confirm('Remove this slide?')) return;
  kp.deck.slides = kp.deck.slides.filter(s => s.id !== id);
  persist();
  renderSlideList();
}

function moveSlide(id, dir) {
  const client = currentClient();
  if (!client) return;
  const kp = ensureKickoffPrep(client);
  const idx = kp.deck.slides.findIndex(s => s.id === id);
  const targetIdx = idx + dir;
  if (idx === -1 || targetIdx < 0 || targetIdx >= kp.deck.slides.length) return;
  const [slide] = kp.deck.slides.splice(idx, 1);
  kp.deck.slides.splice(targetIdx, 0, slide);
  persist();
  renderSlideList();
}

function updateSlideField(id, field, value) {
  const client = currentClient();
  if (!client) return;
  const kp = ensureKickoffPrep(client);
  const slide = kp.deck.slides.find(s => s.id === id);
  if (!slide) return;
  slide[field] = value;
  persist();
}

const SLIDE_TYPE_LABELS = { title: 'Title', pain: 'Pain Point', goal: 'Goal', solution: "How We'll Help", closing: 'Closing', custom: 'Custom' };

function renderSlideList() {
  const client = currentClient();
  const list = el('slideList');
  const empty = el('slideListEmptyState');
  if (!client) { list.innerHTML = ''; empty.style.display = 'block'; return; }

  const slides = ensureKickoffPrep(client).deck.slides;
  empty.style.display = slides.length === 0 ? 'block' : 'none';

  list.innerHTML = slides.map((s, i) => `
    <div class="kp-slide-card" data-id="${s.id}">
      <div class="kp-slide-card-top">
        <span class="kp-slide-num">${i + 1}</span>
        <span class="kp-slide-type-tag">${escapeHtml(SLIDE_TYPE_LABELS[s.type] || 'Slide')}</span>
        <div class="kp-slide-card-actions">
          <button type="button" class="kp-slide-icon-btn" data-action="up" data-id="${s.id}" title="Move up" ${i === 0 ? 'disabled' : ''}>&uarr;</button>
          <button type="button" class="kp-slide-icon-btn" data-action="down" data-id="${s.id}" title="Move down" ${i === slides.length - 1 ? 'disabled' : ''}>&darr;</button>
          <button type="button" class="kp-slide-icon-btn" data-action="remove" data-id="${s.id}" title="Remove">Remove</button>
        </div>
      </div>
      <input type="text" class="kp-slide-heading-input" data-field="heading" data-id="${s.id}" value="${escapeHtml(s.heading)}" placeholder="Slide heading">
      <textarea class="kp-slide-body-input" data-field="body" data-id="${s.id}" placeholder="Slide body text">${escapeHtml(s.body)}</textarea>
    </div>
  `).join('');

  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if (action === 'up') moveSlide(id, -1);
      else if (action === 'down') moveSlide(id, 1);
      else if (action === 'remove') removeSlide(id);
    });
  });
  list.querySelectorAll('.kp-slide-heading-input, .kp-slide-body-input').forEach(input => {
    input.addEventListener('blur', () => {
      updateSlideField(input.getAttribute('data-id'), input.getAttribute('data-field'), input.value);
    });
  });
}

// ── Full-screen presentation mode ──
let presentSlides = [];
let presentIndex = 0;

function renderPresentSlide() {
  const slide = presentSlides[presentIndex];
  if (!slide) return;
  el('presentHeading').textContent = slide.heading || '';
  el('presentBody').textContent = slide.body || '';
  el('presentCounter').textContent = `${presentIndex + 1} / ${presentSlides.length}`;
  el('presentPrevBtn').disabled = presentIndex === 0;
  el('presentNextBtn').disabled = presentIndex === presentSlides.length - 1;
}

function openPresentation() {
  const client = currentClient();
  if (!client) { if (window.parent.showBanner) window.parent.showBanner('error', 'Select a client first.'); return; }
  presentSlides = ensureKickoffPrep(client).deck.slides;
  if (!presentSlides.length) {
    if (window.parent.showBanner) window.parent.showBanner('error', 'No slides yet - generate or add some first.');
    return;
  }
  presentIndex = 0;
  el('presentOverlay').style.display = 'flex';
  renderPresentSlide();
}

function closePresentation() {
  el('presentOverlay').style.display = 'none';
}

function presentNext() {
  if (presentIndex < presentSlides.length - 1) { presentIndex++; renderPresentSlide(); }
}
function presentPrev() {
  if (presentIndex > 0) { presentIndex--; renderPresentSlide(); }
}

// ── PDF export ──
// Same html2pdf pattern as QBR Generator's buildQbrPdfPayload - landscape
// or portrait doesn't matter much since each slide is centered text, but
// landscape reads more like an actual deck when opened/printed.
async function exportSlidesToPdf() {
  const client = currentClient();
  if (!client) { if (window.parent.showBanner) window.parent.showBanner('error', 'Select a client first.'); return; }
  const slides = ensureKickoffPrep(client).deck.slides;
  if (!slides.length) { if (window.parent.showBanner) window.parent.showBanner('error', 'No slides yet.'); return; }

  const container = document.createElement('div');
  container.style.cssText = 'width: 11in;';
  container.innerHTML = slides.map((s, i) => `
    <div style="width:11in; height:8.5in; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:1in; box-sizing:border-box; font-family: Helvetica, Arial, sans-serif; background:#fff; color:#1a1a1a; ${i < slides.length - 1 ? 'page-break-after: always;' : ''}">
      <h1 style="font-size:34px; margin:0 0 24px;">${escapeHtml(s.heading)}</h1>
      <p style="font-size:18px; white-space:pre-wrap; color:#444; max-width:8in;">${escapeHtml(s.body)}</p>
    </div>
  `).join('');

  const btn = el('exportPdfBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generating...';

  try {
    if (typeof html2pdf === 'undefined') throw new Error('PDF library failed to load');
    await html2pdf().set({
      margin: 0,
      filename: `${currentClientName().replace(/\s+/g, '_')}_Kickoff_Deck.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, letterRendering: true, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' }
    }).from(container).save();
    if (window.parent.logAdminActivity) window.parent.logAdminActivity('Kickoff deck PDF generated', currentClientName());
  } catch (e) {
    console.error('Kickoff deck PDF export failed:', e);
    if (window.parent.showBanner) window.parent.showBanner('error', 'Could not generate PDF: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ── Wiring ──
function renderAll() {
  renderDiscoveryRecap();
  loadHandoffForm();
  loadKickoffNotesForm();
  renderSlideList();
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  renderAll();
  loadTeamRoster();

  el('clientSelect').addEventListener('change', renderAll);
  el('completeHandoffBtn').addEventListener('click', completeHandoff);
  el('saveKickoffNotesBtn').addEventListener('click', saveKickoffNotes);
  el('generateSlidesBtn').addEventListener('click', generateSlidesFromDiscovery);
  el('addSlideBtn').addEventListener('click', addBlankSlide);
  el('presentBtn').addEventListener('click', openPresentation);
  el('exportPdfBtn').addEventListener('click', exportSlidesToPdf);

  el('presentCloseBtn').addEventListener('click', closePresentation);
  el('presentPrevBtn').addEventListener('click', presentPrev);
  el('presentNextBtn').addEventListener('click', presentNext);

  document.addEventListener('keydown', (e) => {
    if (el('presentOverlay').style.display === 'none') return;
    if (e.key === 'ArrowRight') presentNext();
    else if (e.key === 'ArrowLeft') presentPrev();
    else if (e.key === 'Escape') closePresentation();
  });

  // Same iframe-race fix used across the other cross-client tools:
  // clientsDb can be empty if this loads before the parent Hub's data
  // has synced. Poll briefly and re-populate once real data shows up.
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    if (Object.keys(getClients()).length > 0) {
      populateClientSelect();
      renderAll();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
