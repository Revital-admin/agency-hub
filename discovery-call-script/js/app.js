/* ============================================================
   DISCOVERY CALL SCRIPT — APP LOGIC
   ============================================================ */

let isEmbedded = false;
let parentClient = null;
try {
  if (window.parent && typeof window.parent.getActiveClient === 'function') {
    isEmbedded = true;
    parentClient = window.parent.getActiveClient();
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const BLOCKS = [
  {
    id: 'opening',
    title: '1. Opening',
    type: 'script',
    script: "Thanks so much for making time today. Before we dive in, I want to make sure I understand your business and what's going on so we can figure out if — and how — we can help. Sound good?",
    stageDirection: "Keep tone relaxed. This is a conversation, not an interrogation."
  },
  {
    id: 'business',
    title: '2. Their Business',
    type: 'questions',
    questions: [
      { id: 'business_1', q: "Tell me about your business — what do you do, and who do you serve?", why: "Establishes context and shows genuine interest before pitching.", probe: "If vague: \"What's a typical customer look like for you?\"" },
      { id: 'business_2', q: "How long have you been in business, and how has growth been so far?", why: "Business age and growth trajectory signal stability and readiness to invest.", probe: "If vague: \"Would you say you're growing, flat, or declining right now?\"", redflag: "If declining or brand new with no traction, note as a budget/timeline risk." },
      { id: 'business_3', q: "What does your team look like — is marketing handled in-house, outsourced, or by you directly?", why: "Reveals who else may be involved and how much hand-holding they'll need.", probe: "If vague: \"So it's mostly you juggling it alongside everything else?\"" }
    ]
  },
  {
    id: 'pain',
    title: '3. Their Pain',
    type: 'questions',
    questions: [
      { id: 'pain_1', q: "What's the biggest challenge you're facing with marketing right now?", why: "This is usually the real reason they took the call.", probe: "If vague: \"Is it more that nothing's working, or that you don't have time to do it?\"" },
      { id: 'pain_2', q: "Have you worked with an agency or freelancer before? How did that go?", why: "Past bad experiences shape trust and objections later in the call.", probe: "If vague: \"What specifically didn't work about it?\"", redflag: "If multiple bad experiences, expect heavier trust-building and be ready to differentiate clearly." },
      { id: 'pain_3', q: "If nothing changes in the next 6 months, what does that cost you?", why: "Gets them to articulate the cost of inaction and builds honest urgency.", probe: "If vague: \"Would that mean lost revenue, lost time, or something else?\"" }
    ]
  },
  {
    id: 'goals',
    title: '4. Their Goals',
    type: 'questions',
    questions: [
      { id: 'goals_1', q: "What does success look like for you in the next 6-12 months?", why: "Defines what you're actually being measured against.", probe: "If vague: \"If we're doing our job well, what will be different a year from now?\"" },
      { id: 'goals_2', q: "Are you focused more on leads, sales, brand visibility, or something else?", why: "Helps prioritize which services and KPIs matter most to them.", probe: "If vague: \"Which one would you pick if you could only improve one?\"" }
    ]
  },
  {
    id: 'situation',
    title: '5. Their Situation',
    type: 'questions',
    questions: [
      { id: 'situation_1', q: "What platforms or channels are you currently active on?", why: "Maps directly to recommended services later.", probe: "If vague: \"Do you have social profiles set up even if you're not posting much?\"" },
      { id: 'situation_2', q: "Do you have existing brand assets — logo, brand guide, photography, past content?", why: "Determines if brand/creative work needs to be scoped in.", probe: "If vague: \"Would you say your branding feels current, or does it need a refresh?\"", redflag: "If no brand assets exist, factor in extra setup time and cost." },
      { id: 'situation_3', q: "What's your website like — are you happy with it, or does it need work?", why: "Website quality affects whether ads/SEO will actually convert.", probe: "If vague: \"On a scale of 1-10, how proud are you of it right now?\"", redflag: "If the website is poor, ads/SEO spend may be wasted until it's fixed." }
    ]
  },
  {
    id: 'budget',
    title: '6. Budget & Decision',
    type: 'questions',
    questions: [
      { id: 'budget_1', q: "What monthly budget range have you set aside for marketing?", why: "The single most important qualifying question on the call.", probe: "If vague: \"Even a rough range like under $2K, $2-5K, or $5K+ helps me tailor the recommendation.\"", redflag: "If they refuse or budget is under $1,000/mo, flag as a likely Not a Fit." },
      { id: 'budget_2', q: "Besides yourself, is anyone else involved in making this decision?", why: "Identifies if you're talking to the actual decision maker.", probe: "If vague: \"Would a proposal need to go through anyone else before it's approved?\"", redflag: "If a decision maker isn't on the call, the deal will move slower and needs a plan to reach them." },
      { id: 'budget_3', q: "If we put together the right plan, what's your timeline to get started?", why: "Confirms urgency and helps set proposal expiry expectations.", probe: "If vague: \"Is this something you want solved this month, or are you still exploring?\"", redflag: "If \"just exploring\" with no timeline, deprioritize follow-up cadence." }
    ]
  }
];

let state = { header: { clientName: '', company: '', callDate: '' }, answers: {}, postCall: {} };

function el(id) { return document.getElementById(id); }

function initState() {
  if (isEmbedded && parentClient) {
    if (!parentClient.discoveryCall) parentClient.discoveryCall = { data: {} };
    if (!parentClient.discoveryCall.data) parentClient.discoveryCall.data = {};
    const saved = parentClient.discoveryCall.data;
    if (saved.header) state.header = Object.assign(state.header, saved.header);
    if (saved.answers) state.answers = saved.answers;
    if (saved.postCall) state.postCall = saved.postCall;
  } else {
    try {
      const saved = localStorage.getItem('discovery-call-script-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.header) state.header = Object.assign(state.header, parsed.header);
        if (parsed.answers) state.answers = parsed.answers;
        if (parsed.postCall) state.postCall = parsed.postCall;
      }
    } catch (e) {}
  }
}

function saveState() {
  if (isEmbedded && parentClient) {
    parentClient.discoveryCall.data = state;
    window.parent.saveDatabase();
  } else {
    try { localStorage.setItem('discovery-call-script-state', JSON.stringify(state)); } catch (e) {}
  }
}

function renderBlocks() {
  const container = el('blocksContainer');
  container.innerHTML = '';

  BLOCKS.forEach(block => {
    const card = document.createElement('div');
    card.className = 'call-block-card';

    const title = document.createElement('div');
    title.className = 'call-block-title';
    title.textContent = block.title;
    card.appendChild(title);

    if (block.type === 'script') {
      const box = document.createElement('div');
      box.className = 'script-box';
      box.innerHTML = `<p>"${block.script}"</p><div class="stage-direction">${block.stageDirection}</div>`;
      card.appendChild(box);
    } else {
      block.questions.forEach(q => {
        const qBlock = document.createElement('div');
        qBlock.className = 'question-block';

        let html = `<div class="question-text">${q.q}</div>`;
        html += `<div class="question-why">${q.why}</div>`;
        html += `<div class="question-probe">${q.probe}</div>`;
        if (q.redflag) html += `<div class="question-redflag">🚩 ${q.redflag}</div>`;
        qBlock.innerHTML = html;

        const textarea = document.createElement('textarea');
        textarea.className = 'question-answer';
        textarea.rows = 2;
        textarea.placeholder = "Type their answer...";
        textarea.id = 'q_' + q.id;
        textarea.value = state.answers[q.id] || '';
        textarea.addEventListener('input', () => {
          state.answers[q.id] = textarea.value;
          saveState();
        });
        qBlock.appendChild(textarea);

        card.appendChild(qBlock);
      });
    }

    container.appendChild(card);
  });
}

function applyHeaderAndPostCallToForm() {
  el('clientNameField').value = state.header.clientName || '';
  el('companyField').value = state.header.company || '';
  el('callDateField').value = state.header.callDate || '';

  const pc = state.postCall;
  document.querySelectorAll('#overallFitGroup .fit-pill').forEach(btn => {
    btn.classList.toggle('selected', btn.getAttribute('data-value') === pc.overallFit);
  });
  el('budgetConfirmed').value = pc.budgetConfirmed || '';
  el('budgetAmount').value = pc.budgetAmount || '';
  el('decisionMakerSummary').value = pc.decisionMaker || '';
  el('timelineSummary').value = pc.timeline || '';
  el('redFlagsSummary').value = pc.redFlags || '';
  el('recommendedPackage').value = pc.recommendedPackage || '';
  setFormattedValue(el('estimatedRetainer'), pc.estimatedRetainer || '');
  el('nextAction').value = pc.nextAction || '';
  el('nextActionDate').value = pc.nextActionDate || '';
  el('postCallNotes').value = pc.notes || '';

  const recServices = Array.isArray(pc.recommendedServices) ? pc.recommendedServices : [];
  document.querySelectorAll('#recommendedServicesGroup input[type="checkbox"]').forEach(cb => {
    cb.checked = recServices.includes(cb.value);
  });
}

function readHeaderAndPostCallFromForm() {
  state.header.clientName = el('clientNameField').value;
  state.header.company = el('companyField').value;
  state.header.callDate = el('callDateField').value;

  const pc = state.postCall;
  pc.budgetConfirmed = el('budgetConfirmed').value;
  pc.budgetAmount = el('budgetAmount').value;
  pc.decisionMaker = el('decisionMakerSummary').value;
  pc.timeline = el('timelineSummary').value;
  pc.redFlags = el('redFlagsSummary').value;
  pc.recommendedPackage = el('recommendedPackage').value;
  pc.estimatedRetainer = el('estimatedRetainer').value;
  pc.nextAction = el('nextAction').value;
  pc.nextActionDate = el('nextActionDate').value;
  pc.notes = el('postCallNotes').value;
  pc.recommendedServices = Array.from(document.querySelectorAll('#recommendedServicesGroup input[type="checkbox"]:checked')).map(cb => cb.value);
}

function onFormChange() {
  readHeaderAndPostCallFromForm();
  saveState();
}

function initListeners() {
  ['clientNameField', 'companyField', 'callDateField'].forEach(id => {
    el(id).addEventListener('input', onFormChange);
  });
  if (typeof attachCommaFormatting === 'function') attachCommaFormatting(el('estimatedRetainer'));
  ['budgetConfirmed', 'budgetAmount', 'decisionMakerSummary', 'timelineSummary', 'redFlagsSummary', 'recommendedPackage', 'estimatedRetainer', 'nextAction', 'nextActionDate', 'postCallNotes'].forEach(id => {
    el(id).addEventListener('input', onFormChange);
    el(id).addEventListener('change', onFormChange);
  });
  document.querySelectorAll('#recommendedServicesGroup input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', onFormChange);
  });
  document.querySelectorAll('#overallFitGroup .fit-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.postCall.overallFit = btn.getAttribute('data-value');
      applyHeaderAndPostCallToForm();
      saveState();
    });
  });

  const openBtn = el('openProposalBtn');
  if (openBtn) openBtn.addEventListener('click', openProposalCalculator);
}

const QUESTION_LABELS = {};
BLOCKS.forEach(b => { if (b.questions) b.questions.forEach(q => { QUESTION_LABELS[q.id] = q.q; }); });

function buildRecapText() {
  const parts = [];
  BLOCKS.forEach(block => {
    if (block.type !== 'questions') return;
    const blockAnswers = block.questions
      .map(q => {
        const val = (state.answers[q.id] || '').trim();
        return val ? val : null;
      })
      .filter(Boolean);
    if (blockAnswers.length) {
      parts.push(block.title.replace(/^\d+\.\s*/, '') + ':\n' + blockAnswers.join(' '));
    }
  });
  return parts.join('\n\n');
}

function openProposalCalculator() {
  if (!isEmbedded || !parentClient) {
    if (window.alert) alert('Open this from within a client workspace to hand off to the Proposal Calculator.');
    return;
  }

  readHeaderAndPostCallFromForm();
  saveState();

  if (!parentClient.proposal) parentClient.proposal = {};
  if (state.header.company) parentClient.proposal.clientName = state.header.company;
  if (state.header.clientName) parentClient.proposal.contactName = state.header.clientName;

  const recap = buildRecapText();
  if (recap) parentClient.proposal.meetingRecap = recap;

  const pc = state.postCall;
  if (pc.estimatedRetainer) parentClient.proposal.baseFee = pc.estimatedRetainer;

  window.parent.saveDatabase();

  const fitLabels = { not_a_fit: '🔴 Not a Fit', possible: '🟡 Possible', strong_fit: '🟢 Strong Fit' };
  const summaryBits = [];
  if (pc.overallFit) summaryBits.push(fitLabels[pc.overallFit] || pc.overallFit);
  if (pc.recommendedPackage) summaryBits.push('Package: ' + pc.recommendedPackage.replace(/_/g, ' '));
  if (pc.estimatedRetainer) summaryBits.push('~$' + pc.estimatedRetainer + '/mo');

  if (window.parent.showBanner) {
    window.parent.showBanner('success', 'Call recap sent to Proposal Calculator.' + (summaryBits.length ? ' (' + summaryBits.join(' · ') + ')' : ''));
  }
  if (window.parent.navigateToTab) {
    window.parent.navigateToTab('tab-proposal');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initState();
  renderBlocks();
  applyHeaderAndPostCallToForm();
  initListeners();
});
