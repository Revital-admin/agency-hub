/* ============================================================
   CONTENT STRATEGY BUILDER — APP LOGIC
   Handles interactive state, parent hub synchronization, 
   scorecard calculations, dynamic platforms, and PDF generation.
   ============================================================ */

/* ── Check if embedded in parent Revital Hub ── */
const isEmbedded = (window.parent && typeof window.parent.getActiveClient === 'function');
let parentClient = null;

if (isEmbedded) {
  parentClient = window.parent.getActiveClient();
}

/* ── State Definition ────────────────────────────────────────── */
const state = {
  targetUrl: '',
  data: {}, // Stores all form values (text / checkbox arrays)
  activeStep: 1,
  filter: 'all' // 'all' | 'incomplete' | 'complete'
};

// List of all static fields to monitor and save
const FIELD_IDS = [
  'businessName', 'industry', 'primaryServices', 'brandMission', 'brandVision', 'coreValues', 'usp',
  'goalsShortTerm', 'goalsLongTerm', 'marketingChallenges',
  'audienceAge', 'audienceLocation', 'audienceIndustry', 'audienceIncome', 'audiencePainPoints', 'audienceDesires', 'audienceBuyingBehavior',
  'brandVoice', 'brandColors', 'brandVisuals',
  'mainCompetitors', 'competitorStrengths', 'competitorDifferentiate', 'brandsAdmire',
  'pillar1Name', 'pillar1Topics', 'pillar2Name', 'pillar2Topics', 'pillar3Name', 'pillar3Topics', 'pillar4Name', 'pillar4Topics',
  'ideasEducational', 'ideasPromotional', 'ideasSocialProof', 'ideasViral', 'ideasBehindScenes',
  'kpisBenchmarks', 'commContact', 'commRevisions', 'commTimeline',
  'finalFocus', 'action1', 'action2', 'action3', 'action4', 'notesSection'
];

const CHECKBOX_GROUPS = [
  'primaryGoals', 'brandPersonality', 'existingAssets', 'primaryContentGoals',
  'workflowPre', 'workflowProd', 'workflowPost', 'workflowPub',
  'kpisMetrics', 'kpisFrequency', 'commMethods', 'nextSteps'
];

// Content Types Configuration per Platform
const PLATFORM_CONTENT_TYPES = {
  instagram: [
    { value: 'reels', label: 'Reels' },
    { value: 'stories', label: 'Stories' },
    { value: 'carousels', label: 'Carousels' },
    { value: 'photos', label: 'Photos' }
  ],
  tiktok: [
    { value: 'short_video', label: 'Short-form Video' },
    { value: 'trends', label: 'Trends' },
    { value: 'edu_clips', label: 'Educational Clips' }
  ],
  youtube: [
    { value: 'long_video', label: 'Long-form Videos' },
    { value: 'podcasts', label: 'Podcasts' },
    { value: 'tutorials', label: 'Tutorials' }
  ],
  linkedin: [
    { value: 'case_studies', label: 'Case Studies' },
    { value: 'thought_leadership', label: 'Thought Leadership' },
    { value: 'company_updates', label: 'Company Updates' }
  ],
  default: [
    { value: 'short_video', label: 'Short Video' },
    { value: 'long_video', label: 'Long Video' },
    { value: 'photos', label: 'Photos / Graphics' },
    { value: 'carousels', label: 'Carousels / Slides' },
    { value: 'text_posts', label: 'Text Posts / Threads' },
    { value: 'newsletter', label: 'Articles / Newsletter' },
    { value: 'audio', label: 'Audio / Podcasts' }
  ]
};

// 12-section field groupings for scorecard / progress calculation
const SECTIONS_CONFIG = {
  1: { title: 'Company Overview', text: ['businessName', 'industry', 'primaryServices', 'brandMission', 'brandVision', 'coreValues', 'usp'], checkboxes: [] },
  2: { title: 'Business Goals', text: ['goalsShortTerm', 'goalsLongTerm', 'marketingChallenges'], checkboxes: ['primaryGoals'] },
  3: { title: 'Target Audience', text: ['audienceAge', 'audienceLocation', 'audienceIndustry', 'audienceIncome', 'audiencePainPoints', 'audienceDesires', 'audienceBuyingBehavior'], checkboxes: [] },
  4: { title: 'Brand Identity', text: ['brandVoice', 'brandColors', 'brandVisuals'], checkboxes: ['brandPersonality', 'existingAssets'] },
  5: { title: 'Competitor Analysis', text: ['mainCompetitors', 'competitorStrengths', 'competitorDifferentiate', 'brandsAdmire'], checkboxes: [] },
  6: { title: 'Content Strategy', text: ['pillar1Name', 'pillar1Topics', 'pillar2Name', 'pillar2Topics', 'pillar3Name', 'pillar3Topics', 'pillar4Name', 'pillar4Topics'], checkboxes: ['primaryContentGoals'] },
  7: { title: 'Platform Strategy', dynamicPlatforms: true },
  8: { title: 'Content Production Workflow', text: [], checkboxes: ['workflowPre', 'workflowProd', 'workflowPost', 'workflowPub'] },
  9: { title: 'Content Ideas', text: ['ideasEducational', 'ideasPromotional', 'ideasSocialProof', 'ideasViral', 'ideasBehindScenes'], checkboxes: [] },
  10: { title: 'KPI & Performance Tracking', text: ['kpisBenchmarks'], checkboxes: ['kpisMetrics', 'kpisFrequency'] },
  11: { title: 'Client Communication & Approval Process', text: ['commContact', 'commRevisions', 'commTimeline'], checkboxes: ['commMethods'] },
  12: { title: 'Final Strategy Summary', text: ['finalFocus', 'notesSection'], checkboxes: ['nextSteps'], custom: ['actionItems'] }
};

/* ── Init State ────────────────────────────────────────────── */
function initState() {
  // Setup defaults
  state.data = {
    platforms: [
      { id: 'instagram', name: 'Instagram', purpose: '', contentTypes: [], frequency: '' },
      { id: 'tiktok', name: 'TikTok', purpose: '', contentTypes: [], frequency: '' },
      { id: 'youtube', name: 'YouTube', purpose: '', contentTypes: [], frequency: '' },
      { id: 'linkedin', name: 'LinkedIn', purpose: '', contentTypes: [], frequency: '' }
    ]
  };

  FIELD_IDS.forEach(id => { state.data[id] = ''; });
  CHECKBOX_GROUPS.forEach(group => { state.data[group] = []; });
  state.targetUrl = '';

  if (isEmbedded && parentClient) {
    if (!parentClient.strategyBuilder) {
      parentClient.strategyBuilder = { targetUrl: '', data: {} };
    }
    if (!parentClient.strategyBuilder.data) {
      parentClient.strategyBuilder.data = {};
    }

    // Restore targetUrl
    state.targetUrl = parentClient.strategyBuilder.targetUrl || '';

    // Bind data keys
    FIELD_IDS.forEach(id => {
      if (parentClient.strategyBuilder.data[id] !== undefined) {
        state.data[id] = parentClient.strategyBuilder.data[id];
      } else {
        parentClient.strategyBuilder.data[id] = '';
      }
    });

    CHECKBOX_GROUPS.forEach(group => {
      if (parentClient.strategyBuilder.data[group] !== undefined) {
        state.data[group] = parentClient.strategyBuilder.data[group];
      } else {
        parentClient.strategyBuilder.data[group] = [];
      }
    });

    // Handle platforms migration / binding
    if (parentClient.strategyBuilder.data.platforms && Array.isArray(parentClient.strategyBuilder.data.platforms)) {
      state.data.platforms = parentClient.strategyBuilder.data.platforms;
    } else {
      // Migrate legacy flat platform keys if they exist
      const d = parentClient.strategyBuilder.data;
      const legacyPlatforms = [];
      
      if (d.igPurpose !== undefined || d.igFrequency !== undefined || d.igContentTypes !== undefined) {
        legacyPlatforms.push({
          id: 'instagram',
          name: 'Instagram',
          purpose: d.igPurpose || '',
          contentTypes: Array.isArray(d.igContentTypes) ? d.igContentTypes : [],
          frequency: d.igFrequency || ''
        });
      } else {
        legacyPlatforms.push({ id: 'instagram', name: 'Instagram', purpose: '', contentTypes: [], frequency: '' });
      }

      if (d.ttPurpose !== undefined || d.ttFrequency !== undefined || d.ttContentTypes !== undefined) {
        legacyPlatforms.push({
          id: 'tiktok',
          name: 'TikTok',
          purpose: d.ttPurpose || '',
          contentTypes: Array.isArray(d.ttContentTypes) ? d.ttContentTypes : [],
          frequency: d.ttFrequency || ''
        });
      } else {
        legacyPlatforms.push({ id: 'tiktok', name: 'TikTok', purpose: '', contentTypes: [], frequency: '' });
      }

      if (d.ytPurpose !== undefined || d.ytFrequency !== undefined || d.ytContentTypes !== undefined) {
        legacyPlatforms.push({
          id: 'youtube',
          name: 'YouTube',
          purpose: d.ytPurpose || '',
          contentTypes: Array.isArray(d.ytContentTypes) ? d.ytContentTypes : [],
          frequency: d.ytFrequency || ''
        });
      } else {
        legacyPlatforms.push({ id: 'youtube', name: 'YouTube', purpose: '', contentTypes: [], frequency: '' });
      }

      if (d.liPurpose !== undefined || d.liFrequency !== undefined || d.liContentTypes !== undefined) {
        legacyPlatforms.push({
          id: 'linkedin',
          name: 'LinkedIn',
          purpose: d.liPurpose || '',
          contentTypes: Array.isArray(d.liContentTypes) ? d.liContentTypes : [],
          frequency: d.liFrequency || ''
        });
      } else {
        legacyPlatforms.push({ id: 'linkedin', name: 'LinkedIn', purpose: '', contentTypes: [], frequency: '' });
      }

      state.data.platforms = legacyPlatforms;
      parentClient.strategyBuilder.data.platforms = state.data.platforms;

      // Clean up legacy flat keys
      const oldKeys = [
        'igPurpose', 'igFrequency', 'igContentTypes',
        'ttPurpose', 'ttFrequency', 'ttContentTypes',
        'ytPurpose', 'ytFrequency', 'ytContentTypes',
        'liPurpose', 'liFrequency', 'liContentTypes'
      ];
      oldKeys.forEach(k => { delete d[k]; });
    }
  } else {
    // Standalone localstorage fallback
    try {
      const saved = localStorage.getItem('revital-strategy-builder-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        state.targetUrl = parsed.targetUrl || '';
        state.data = parsed.data || {};
      }
    } catch (e) {
      console.warn("localStorage not available");
    }
  }

  // Bind values to UI elements
  document.getElementById('targetUrlInput').value = state.targetUrl;

  FIELD_IDS.forEach(id => {
    const el = document.getElementById('field_' + id);
    if (el) {
      el.value = state.data[id] || '';
    }
  });

  CHECKBOX_GROUPS.forEach(group => {
    const checkboxes = document.querySelectorAll(`input[name="field_${group}"]`);
    const checkedValues = state.data[group] || [];
    checkboxes.forEach(cb => {
      cb.checked = checkedValues.includes(cb.value);
    });
  });

  // Render the dynamic platform list form groups
  renderDynamicPlatforms();
  updateProgress();
}

function saveState() {
  if (isEmbedded && parentClient) {
    parentClient.strategyBuilder.targetUrl = state.targetUrl;
    parentClient.strategyBuilder.data = state.data;
    window.parent.saveDatabase();
    window.parent.renderDashboard();
  } else {
    try {
      localStorage.setItem('revital-strategy-builder-state', JSON.stringify({
        targetUrl: state.targetUrl,
        data: state.data
      }));
    } catch (e) {}
  }
}

/* ── Dynamic Platforms Renderer ──────────────────────────────── */
function renderDynamicPlatforms() {
  const container = document.getElementById('dynamicPlatformsContainer');
  if (!container) return;
  container.innerHTML = '';

  const platforms = state.data.platforms || [];
  if (platforms.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--color-text-secondary); font-size: 13.5px; border: 1px dashed var(--color-border); border-radius: var(--radius-md); background: rgba(255,255,255,0.01);">
        No platforms added. Select a platform from the dropdown above to add one.
      </div>
    `;
    return;
  }

  platforms.forEach((p) => {
    const platformEl = document.createElement('div');
    platformEl.className = 'dynamic-platform-card';
    platformEl.style.marginBottom = '1.75rem';
    platformEl.style.padding = '1.25rem';
    platformEl.style.border = '1px solid var(--color-border-md)';
    platformEl.style.borderRadius = 'var(--radius-lg)';
    platformEl.style.background = 'rgba(25, 25, 30, 0.4)';

    const contentTypesList = PLATFORM_CONTENT_TYPES[p.id] || PLATFORM_CONTENT_TYPES['default'];
    let checkboxesHtml = '';
    contentTypesList.forEach(ct => {
      const isChecked = p.contentTypes && p.contentTypes.includes(ct.value);
      checkboxesHtml += `
        <label class="checkbox-item">
          <input type="checkbox" class="platform-ct-checkbox" data-platform-id="${p.id}" value="${ct.value}" ${isChecked ? 'checked' : ''} />
          <span>${ct.label}</span>
        </label>
      `;
    });

    platformEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); padding-bottom: 8px; margin-bottom: 14px;">
        <span style="font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--color-accent); font-weight: 500; letter-spacing: 0.05em;">${p.name} Strategy</span>
        <button type="button" class="remove-platform-btn" data-platform-id="${p.id}" style="background: transparent; border: none; color: #f87171; font-family: var(--font-mono); font-size: 11px; cursor: pointer; letter-spacing: 0.03em; display: inline-flex; align-items: center; gap: 4px; outline: none;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          <span>Remove</span>
        </button>
      </div>
      <div class="form-group" style="margin-bottom: 1rem;">
        <label>Purpose</label>
        <input type="text" class="custom-input platform-purpose-input" data-platform-id="${p.id}" value="${p.purpose || ''}" placeholder="e.g. Brand awareness / Community engagement" />
      </div>
      <div class="form-group" style="margin-bottom: 1rem;">
        <label>Content Types</label>
        <div class="checkbox-grid">
          ${checkboxesHtml}
        </div>
      </div>
      <div class="form-group">
        <label>Posting Frequency</label>
        <input type="text" class="custom-input platform-frequency-input" data-platform-id="${p.id}" value="${p.frequency || ''}" placeholder="e.g. 3-4x week / Daily" />
      </div>
    `;

    container.appendChild(platformEl);
  });

  setupDynamicPlatformEvents();
}

function setupDynamicPlatformEvents() {
  // Purpose Inputs
  document.querySelectorAll('.platform-purpose-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const pid = e.target.getAttribute('data-platform-id');
      const p = state.data.platforms.find(item => item.id === pid);
      if (p) {
        p.purpose = e.target.value;
        saveState();
        updateProgress();
      }
    });
  });

  // Frequency Inputs
  document.querySelectorAll('.platform-frequency-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const pid = e.target.getAttribute('data-platform-id');
      const p = state.data.platforms.find(item => item.id === pid);
      if (p) {
        p.frequency = e.target.value;
        saveState();
        updateProgress();
      }
    });
  });

  // Checkboxes
  document.querySelectorAll('.platform-ct-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const pid = e.target.getAttribute('data-platform-id');
      const p = state.data.platforms.find(item => item.id === pid);
      if (p) {
        const checked = [];
        const checkedCbs = document.querySelectorAll(`.platform-ct-checkbox[data-platform-id="${pid}"]:checked`);
        checkedCbs.forEach(checkedCb => {
          checked.push(checkedCb.value);
        });
        p.contentTypes = checked;
        saveState();
        updateProgress();
      }
    });
  });

  // Remove platform action
  document.querySelectorAll('.remove-platform-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const button = e.target.closest('.remove-platform-btn');
      const pid = button.getAttribute('data-platform-id');
      const p = state.data.platforms.find(item => item.id === pid);
      if (p) {
        const confirmRemove = confirm(`Are you sure you want to permanently delete the ${p.name} channel strategy?`);
        if (!confirmRemove) return;

        state.data.platforms = state.data.platforms.filter(item => item.id !== pid);
        saveState();
        renderDynamicPlatforms();
        updateProgress();
      }
    });
  });
}

/* ── Calculations & Metrics ─────────────────────────────────── */
function isFieldFilled(key, type) {
  if (type === 'text') {
    const val = state.data[key];
    return val && typeof val === 'string' && val.trim() !== '';
  } else if (type === 'checkbox') {
    const arr = state.data[key];
    return arr && Array.isArray(arr) && arr.length > 0;
  } else if (type === 'custom' && key === 'actionItems') {
    const a1 = state.data['action1'] || '';
    const a2 = state.data['action2'] || '';
    const a3 = state.data['action3'] || '';
    const a4 = state.data['action4'] || '';
    return a1.trim() !== '' || a2.trim() !== '' || a3.trim() !== '' || a4.trim() !== '';
  }
  return false;
}

function getSectionStats(stepNum) {
  const config = SECTIONS_CONFIG[stepNum];
  if (!config) return { filled: 0, total: 0 };

  let total = 0;
  let filled = 0;

  if (config.dynamicPlatforms) {
    const platforms = state.data.platforms || [];
    platforms.forEach(p => {
      total += 3; // purpose, contentTypes, frequency
      if (p.purpose && p.purpose.trim() !== '') filled++;
      if (p.frequency && p.frequency.trim() !== '') filled++;
      if (p.contentTypes && Array.isArray(p.contentTypes) && p.contentTypes.length > 0) filled++;
    });
    return { filled, total };
  }

  // Add text fields
  config.text.forEach(key => {
    total++;
    if (isFieldFilled(key, 'text')) filled++;
  });

  // Add checkbox group fields
  config.checkboxes.forEach(key => {
    total++;
    if (isFieldFilled(key, 'checkbox')) filled++;
  });

  // Add custom fields
  if (config.custom) {
    config.custom.forEach(key => {
      total++;
      if (isFieldFilled(key, 'custom')) filled++;
    });
  }

  return { filled, total };
}

function updateProgress() {
  let totalFields = 0;
  let filledFields = 0;
  let completedSections = 0;

  for (let s = 1; s <= 12; s++) {
    const { filled, total } = getSectionStats(s);
    totalFields += total;
    filledFields += filled;

    // Update section UI indicator
    const progressTextEl = document.getElementById(`step-${s}-progress`);
    if (progressTextEl) {
      if (s === 7) {
        progressTextEl.textContent = `${filled}/${total} fields filled`;
      } else {
        progressTextEl.textContent = `${filled}/${total} filled`;
      }
      if (filled === total && total > 0) {
        progressTextEl.style.color = 'var(--color-success)';
      } else {
        progressTextEl.style.color = '';
      }
    }

    // Toggle card completed styling
    const cardEl = document.getElementById(`step-${s}`);
    if (cardEl) {
      if (filled === total && total > 0) {
        cardEl.classList.add('done-card');
        completedSections++;
      } else {
        cardEl.classList.remove('done-card');
      }
    }
  }

  // Update Scorecards
  const remainingFields = totalFields - filledFields;
  const scorePct = totalFields ? Math.round((filledFields / totalFields) * 100) : 0;

  const valFieldsEl = document.getElementById('val-fields');
  const valRemainingEl = document.getElementById('val-remaining');
  const valScoreEl = document.getElementById('val-score');

  if (valFieldsEl) valFieldsEl.textContent = `${filledFields} / ${totalFields}`;
  if (valRemainingEl) {
    valRemainingEl.textContent = remainingFields;
    if (remainingFields === 0) {
      valRemainingEl.className = 'score-value success';
    } else {
      valRemainingEl.className = 'score-value warning';
    }
  }
  if (valScoreEl) {
    valScoreEl.textContent = `${scorePct}%`;
    if (scorePct === 100) {
      valScoreEl.style.color = 'var(--color-success)';
    } else {
      valScoreEl.style.color = '';
    }
  }

  // Progress Bar
  const progFill = document.getElementById('progFill');
  const progText = document.getElementById('progText');
  const progPct = document.getElementById('progPct');

  if (progFill) progFill.style.width = `${scorePct}%`;
  if (progText) progText.textContent = `${filledFields} of ${totalFields} fields filled`;
  if (progPct) progPct.textContent = `${scorePct}%`;

  // Filter evaluation
  applyFilters();
}

function applyFilters() {
  const cards = document.querySelectorAll('.step-card');
  cards.forEach(card => {
    const stepNum = parseInt(card.getAttribute('data-step'), 10);
    const { filled, total } = getSectionStats(stepNum);
    const isDone = (filled === total && total > 0);

    if (state.filter === 'all') {
      card.removeAttribute('hidden');
    } else if (state.filter === 'complete') {
      if (isDone) card.removeAttribute('hidden');
      else card.setAttribute('hidden', 'true');
    } else if (state.filter === 'incomplete') {
      if (!isDone) card.removeAttribute('hidden');
      else card.setAttribute('hidden', 'true');
    }
  });
}

/* ── Interactive Event Handlers ──────────────────────────────── */
function setupEventHandlers() {
  // Input URL change
  const targetUrlEl = document.getElementById('targetUrlInput');
  targetUrlEl.addEventListener('input', (e) => {
    state.targetUrl = e.target.value;
    saveState();
  });

  // Add Platform Controls
  const addSelect = document.getElementById('addPlatformSelect');
  const customGroup = document.getElementById('customPlatformGroup');
  const customInput = document.getElementById('customPlatformInput');
  const addBtn = document.getElementById('addPlatformBtn');

  if (addSelect && customGroup && addBtn) {
    addSelect.addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        customGroup.style.display = 'block';
      } else {
        customGroup.style.display = 'none';
      }
    });

    addBtn.addEventListener('click', () => {
      const val = addSelect.value;
      let pId = val;
      let pName = addSelect.options[addSelect.selectedIndex].text;

      if (val === 'custom') {
        const customName = customInput.value.trim();
        if (customName === '') {
          alert('Please enter a custom platform name.');
          return;
        }
        pName = customName;
        pId = 'custom_' + Date.now();
      }

      // Check duplicates
      const exists = state.data.platforms.some(p => p.id === pId || p.name.toLowerCase() === pName.toLowerCase());
      if (exists) {
        alert(`Platform strategy for "${pName}" already exists!`);
        return;
      }

      state.data.platforms.push({
        id: pId,
        name: pName,
        purpose: '',
        contentTypes: [],
        frequency: ''
      });

      // Reset Controls
      customInput.value = '';
      addSelect.value = 'instagram';
      customGroup.style.display = 'none';

      saveState();
      renderDynamicPlatforms();
      updateProgress();
    });
  }

  // Static Text inputs & textareas
  FIELD_IDS.forEach(id => {
    const el = document.getElementById('field_' + id);
    if (el) {
      el.addEventListener('input', (e) => {
        state.data[id] = e.target.value;
        saveState();
        updateProgress();
      });
    }
  });

  // Static Checkbox groups
  CHECKBOX_GROUPS.forEach(group => {
    const checkboxes = document.querySelectorAll(`input[name="field_${group}"]`);
    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = [];
        const cbs = document.querySelectorAll(`input[name="field_${group}"]:checked`);
        cbs.forEach(checkedCb => {
          checked.push(checkedCb.value);
        });
        state.data[group] = checked;
        saveState();
        updateProgress();
      });
    });
  });

  // Accordion Toggle Headers
  const headers = document.querySelectorAll('.step-header');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const card = header.closest('.step-card');
      const body = card.querySelector('.step-body');
      const chevron = card.querySelector('.chevron');
      const stepNum = parseInt(card.getAttribute('data-step'), 10);

      const isOpen = body.classList.contains('open');

      // Close all first for accordion behavior
      document.querySelectorAll('.step-body').forEach(b => b.classList.remove('open'));
      document.querySelectorAll('.chevron').forEach(ch => ch.classList.remove('open'));

      if (!isOpen) {
        body.classList.add('open');
        chevron.classList.add('open');
        state.activeStep = stepNum;
        const activeStepValEl = document.getElementById('val-active');
        if (activeStepValEl) {
          activeStepValEl.textContent = `${stepNum}/12`;
        }
      }
    });
  });

  // Open first step by default
  const firstCard = document.querySelector('#step-1');
  if (firstCard) {
    firstCard.querySelector('.step-body').classList.add('open');
    firstCard.querySelector('.chevron').classList.add('open');
  }

  // Filter Buttons
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.getAttribute('data-filter');
      applyFilters();
    });
  });

  // Reset Button
  const resetBtn = document.getElementById('resetBtn');
  resetBtn.addEventListener('click', () => {
    const confirmReset = confirm("Are you sure you want to clear all Content Strategy questionnaire answers?");
    if (!confirmReset) return;

    FIELD_IDS.forEach(id => { state.data[id] = ''; });
    CHECKBOX_GROUPS.forEach(group => { state.data[group] = []; });
    state.targetUrl = '';
    state.data.platforms = [
      { id: 'instagram', name: 'Instagram', purpose: '', contentTypes: [], frequency: '' },
      { id: 'tiktok', name: 'TikTok', purpose: '', contentTypes: [], frequency: '' },
      { id: 'youtube', name: 'YouTube', purpose: '', contentTypes: [], frequency: '' },
      { id: 'linkedin', name: 'LinkedIn', purpose: '', contentTypes: [], frequency: '' }
    ];

    saveState();
    initState();
  });

  // Download PDF Button
  const pdfBtn = document.getElementById('downloadPdfBtn');
  pdfBtn.addEventListener('click', downloadPdfReport);
}

/* ── PDF Generator ────────────────────────────────────────── */
function downloadPdfReport() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const targetHost = state.targetUrl || 'Not specified';
  const clientName = (isEmbedded && parentClient) ? (window.parent.activeClientName || 'Nexus Productions') : 'Nexus Productions';
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let y = 50;
  const bottomMargin = 780;

  function checkPageOverflow(heightNeeded) {
    if (y + heightNeeded > bottomMargin) {
      doc.addPage();
      y = 60;
    }
  }

  function addWrappedText(text, x, maxW, lineH) {
    const lines = doc.splitTextToSize(text, maxW);
    lines.forEach(line => {
      checkPageOverflow(lineH);
      doc.text(line, x, y);
      y += lineH;
    });
  }

  // Draw Header Logo
  checkPageOverflow(50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(245, 158, 11); // Amber
  doc.text('REVITAL PRODUCTIONS', 40, 60);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(26, 26, 23);
  doc.text('CONTENT STRATEGY PROFILE', 555, 50, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(85, 84, 80);
  doc.text(`Client Workspace: ${clientName}`, 555, 63, { align: 'right' });
  doc.text(`Target URL: ${targetHost}`, 555, 75, { align: 'right' });
  doc.text(`Date Exported: ${currentDate}`, 555, 87, { align: 'right' });

  y = 110;

  // Draw Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(26, 26, 23);
  doc.text('12-Section Content Strategy Report', 40, y);
  y += 25;

  // Let's count filled fields
  let totalFields = 0;
  let filledFields = 0;
  for (let s = 1; s <= 12; s++) {
    const { filled, total } = getSectionStats(s);
    totalFields += total;
    filledFields += filled;
  }
  const scorePct = totalFields ? Math.round((filledFields / totalFields) * 100) : 0;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(85, 84, 80);
  doc.text(`Progress: ${filledFields} of ${totalFields} fields filled (${scorePct}% Complete)`, 40, y);
  y += 30;

  // Loop through all 12 sections and output filled inputs
  for (let s = 1; s <= 12; s++) {
    const config = SECTIONS_CONFIG[s];
    const { filled, total } = getSectionStats(s);

    if (filled === 0) continue; // Skip empty sections in export to keep it clean

    checkPageOverflow(40);
    // Draw Section Header
    doc.setFillColor(245, 158, 11); // Amber background
    doc.rect(40, y, 515, 20, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`Section ${s}: ${config.title.toUpperCase()}`, 48, y + 13);
    y += 32;

    if (config.dynamicPlatforms) {
      // Print dynamic platforms
      const platforms = state.data.platforms || [];
      platforms.forEach(p => {
        const isPRefilled = (p.purpose && p.purpose.trim() !== '') || (p.frequency && p.frequency.trim() !== '') || (p.contentTypes && p.contentTypes.length > 0);
        if (isPRefilled) {
          checkPageOverflow(20);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(245, 158, 11);
          doc.text(`${p.name} Channel Strategy`, 45, y);
          y += 14;

          if (p.purpose && p.purpose.trim() !== '') {
            checkPageOverflow(25);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(26, 26, 23);
            doc.text('Purpose', 45, y);
            y += 11;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(60, 60, 55);
            addWrappedText(p.purpose, 45, 500, 12);
            y += 8;
          }

          if (p.contentTypes && Array.isArray(p.contentTypes) && p.contentTypes.length > 0) {
            checkPageOverflow(25);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(26, 26, 23);
            doc.text('Content Types Focus', 45, y);
            y += 11;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(60, 60, 55);
            const displayVal = p.contentTypes.map(v => v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(', ');
            addWrappedText(displayVal, 45, 500, 12);
            y += 8;
          }

          if (p.frequency && p.frequency.trim() !== '') {
            checkPageOverflow(25);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(26, 26, 23);
            doc.text('Posting Frequency', 45, y);
            y += 11;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(60, 60, 55);
            addWrappedText(p.frequency, 45, 500, 12);
            y += 8;
          }

          y += 10;
        }
      });
    } else {
      // Output Section Text/Textarea fields
      config.text.forEach(key => {
        if (isFieldFilled(key, 'text')) {
          const val = state.data[key];
          const label = document.querySelector(`label[for="field_${key}"]`)?.textContent || key;

          checkPageOverflow(28);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(26, 26, 23);
          doc.text(label, 45, y);
          y += 13;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(60, 60, 55);
          addWrappedText(val, 45, 500, 12);
          y += 10;
        }
      });

      // Output Section Checkbox fields
      config.checkboxes.forEach(key => {
        if (isFieldFilled(key, 'checkbox')) {
          const val = state.data[key];
          const label = document.querySelector(`input[name="field_${key}"]`)?.closest('.form-group')?.querySelector('label')?.textContent || key;

          checkPageOverflow(28);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(26, 26, 23);
          doc.text(label, 45, y);
          y += 13;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(60, 60, 55);
          const displayVal = val.map(v => v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(', ');
          addWrappedText(displayVal, 45, 500, 12);
          y += 10;
        }
      });

      // Output Section Custom fields (Action Items)
      if (config.custom && config.custom.includes('actionItems') && isFieldFilled('actionItems', 'custom')) {
        checkPageOverflow(28);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(26, 26, 23);
        doc.text('Immediate Action Items', 45, y);
        y += 13;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 55);
        for (let i = 1; i <= 4; i++) {
          const itemVal = state.data[`action${i}`] || '';
          if (itemVal.trim() !== '') {
            checkPageOverflow(15);
            doc.text(`• ${itemVal}`, 50, y);
            y += 12;
          }
        }
        y += 10;
      }
    }

    y += 15; // Gap between sections
  }

  // Save the PDF
  doc.save(`content_strategy_builder_${clientName.toLowerCase().replace(/\s+/g, '_')}.pdf`);
}

/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initState();
  setupEventHandlers();
});
