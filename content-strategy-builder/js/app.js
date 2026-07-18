/* ============================================================
   CONTENT STRATEGY BUILDER — APP LOGIC
   Handles interactive state, parent hub synchronization, 
   scorecard calculations, dynamic platforms, and PDF generation.
   ============================================================ */

/* ── Check if embedded in parent Revital Hub ── */
let isEmbedded = false;
let parentClient = null;
try {
  if (window.parent && typeof window.parent.getActiveClient === 'function') {
    isEmbedded = true;
    parentClient = window.parent.getActiveClient();
  }
} catch(e) {
  console.warn("CORS prevented parent access:", e);
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
        <label class="checkbox-item" style="margin-right: 12px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer;">
          <div class="custom-checkbox" style="position: relative; width: 18px; height: 18px; border-radius: 4px; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2);">
            <input type="checkbox" class="platform-ct-checkbox" style="position: absolute; opacity: 0; cursor: pointer; height: 100%; width: 100%; z-index: 2;" data-platform-id="${p.id}" value="${ct.value}" ${isChecked ? 'checked' : ''} />
            <svg class="check-icon" style="width: 12px; height: 12px; color: white; opacity: ${isChecked ? '1' : '0'}; transition: opacity 0.2s;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <span style="font-size: 13px; color: var(--color-text);">${ct.label}</span>
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
  
  const downloadBtn = document.getElementById('downloadPdfBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      downloadBtn.disabled = true;
      const origText = downloadBtn.innerHTML;
      downloadBtn.innerHTML = "⏳ Generating...";

      const d = state.data;
      
      const formatText = (txt) => {
        if (!txt) return '<span style="color: #94a3b8; font-style: italic;">Not provided</span>';
        return txt.replace(/\\n/g, '<br>');
      };
      
      const formatArray = (arr) => {
        if (!arr || arr.length === 0) return '<span style="color: #94a3b8; font-style: italic;">None selected</span>';
        return '<ul style="margin-top:0;">' + arr.map(i => `<li>${i}</li>`).join('') + '</ul>';
      };

      let platformsHtml = '';
      if (d.platforms && d.platforms.length > 0) {
        platformsHtml = d.platforms.map(p => `
          <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
            <h4 style="margin: 0 0 10px 0; color: #3b82f6;">${p.name}</h4>
            <p style="margin: 0 0 5px 0;"><strong>Purpose:</strong> ${formatText(p.purpose)}</p>
            <p style="margin: 0 0 5px 0;"><strong>Frequency:</strong> ${formatText(p.frequency)}</p>
            <div><strong>Content Types:</strong> ${formatArray(p.contentTypes)}</div>
          </div>
        `).join('');
      } else {
        platformsHtml = '<p style="color: #94a3b8; font-style: italic;">No platform strategy defined.</p>';
      }

      const container = document.createElement('div');
      container.style.fontFamily = "'Inter', sans-serif, Arial";
      container.style.color = "#1e293b";
      container.style.fontSize = "14px";
      container.style.lineHeight = "1.6";
      container.style.width = "100%";

      const style = `
        <style>
          .box, .col, .score-box, tr, td, h2, h3 { page-break-inside: avoid; }

          .page { padding: 40px; box-sizing: border-box; page-break-after: always; position: relative; background: white; }
          .page:last-child { page-break-after: auto; }
          h1 { font-size: 32px; font-weight: 700; margin-bottom: 10px; color: #0f172a; border-bottom: 4px solid #f59e0b; padding-bottom: 20px;}
          h2 { font-size: 20px; font-weight: 600; margin-bottom: 15px; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; margin-top: 30px; }
          h3 { font-size: 16px; font-weight: 600; margin-bottom: 10px; color: #334155; margin-top: 20px;}
          p { margin-bottom: 15px; }
          .logo { height: 50px; width: 144px; object-fit: contain; margin-bottom: 40px;  }
          .grid { display: flex; flex-wrap: wrap; gap: 20px; }
          .col { flex: 1; min-width: 300px; }
          .box { background:#f8fafc; padding:15px; border-radius:8px; margin-bottom:15px; }
        </style>
      `;

      container.innerHTML = `
        ${style}
        <div class="page">
          <img src="assets/logo.png" onerror="this.src='../logo.png'" alt="Revital Hub" class="logo">
          <h1>Content Strategy Builder</h1>
          <p><strong>Target URL / Project:</strong> ${formatText(state.targetUrl)}</p>
          
          <div class="grid">
            <div class="col">
              <h2>1. Company Overview</h2>
              <h3>Business Name</h3><p>${formatText(d.businessName)}</p>
              <h3>Industry</h3><p>${formatText(d.industry)}</p>
              <h3>Primary Services/Products</h3><p>${formatText(d.primaryServices)}</p>
              <h3>Brand Mission</h3><p>${formatText(d.brandMission)}</p>
              <h3>Core Values</h3><p>${formatText(d.coreValues)}</p>
              <h3>Unique Selling Proposition (USP)</h3><p>${formatText(d.usp)}</p>
            </div>
            <div class="col">
              <h2>2. Business Goals</h2>
              <h3>Short-Term Goals</h3><p>${formatText(d.goalsShortTerm)}</p>
              <h3>Long-Term Goals</h3><p>${formatText(d.goalsLongTerm)}</p>
              <h3>Primary Objectives</h3>${formatArray(d.primaryGoals)}
              
              <h2>3. Target Audience</h2>
              <h3>Demographics</h3><p>${formatText(d.audienceAge)} | ${formatText(d.audienceLocation)} | ${formatText(d.audienceIndustry)}</p>
              <h3>Pain Points</h3><p>${formatText(d.audiencePainPoints)}</p>
              <h3>Desired Outcomes</h3><p>${formatText(d.audienceDesires)}</p>
            </div>
          </div>
        </div>

        <div class="page">
          <div class="grid">
            <div class="col">
              <h2>4. Brand Identity</h2>
              <h3>Brand Personality</h3>${formatArray(d.brandPersonality)}
              <h3>Brand Voice</h3><p>${formatText(d.brandVoice)}</p>
              <h3>Visual Assets</h3>${formatArray(d.existingAssets)}
              
              <h2>5. Competitor Analysis</h2>
              <h3>Main Competitors</h3><p>${formatText(d.mainCompetitors)}</p>
              <h3>What They Do Well</h3><p>${formatText(d.competitorStrengths)}</p>
              <h3>Our Differentiator</h3><p>${formatText(d.competitorDifferentiate)}</p>
            </div>
            
            <div class="col">
              <h2>6. Content Strategy</h2>
              <div class="box">
                <h3 style="margin-top:0;">Pillar 1: ${formatText(d.pillar1Name)}</h3>
                <p>${formatText(d.pillar1Topics)}</p>
              </div>
              <div class="box">
                <h3 style="margin-top:0;">Pillar 2: ${formatText(d.pillar2Name)}</h3>
                <p>${formatText(d.pillar2Topics)}</p>
              </div>
              <div class="box">
                <h3 style="margin-top:0;">Pillar 3: ${formatText(d.pillar3Name)}</h3>
                <p>${formatText(d.pillar3Topics)}</p>
              </div>
              <div class="box">
                <h3 style="margin-top:0;">Pillar 4: ${formatText(d.pillar4Name)}</h3>
                <p>${formatText(d.pillar4Topics)}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="page">
          <h2>7. Platform Strategy</h2>
          ${platformsHtml}

          <div class="grid">
            <div class="col">
              <h2>8. Workflow & Production</h2>
              <h3>Pre-Production</h3>${formatArray(d.workflowPre)}
              <h3>Production</h3>${formatArray(d.workflowProd)}
              <h3>Post-Production</h3>${formatArray(d.workflowPost)}
              <h3>Publishing</h3>${formatArray(d.workflowPub)}
            </div>
            <div class="col">
              <h2>9. Content Ideas</h2>
              <h3>Educational</h3><p>${formatText(d.ideasEducational)}</p>
              <h3>Promotional</h3><p>${formatText(d.ideasPromotional)}</p>
              <h3>Social Proof</h3><p>${formatText(d.ideasSocialProof)}</p>
            </div>
          </div>
        </div>

        <div class="page">
          <div class="grid">
            <div class="col">
              <h2>10. KPI & Tracking</h2>
              <h3>Metrics to Track</h3>${formatArray(d.kpisMetrics)}
              <h3>Reporting Frequency</h3>${formatArray(d.kpisFrequency)}
              <h3>Benchmarks</h3><p>${formatText(d.kpisBenchmarks)}</p>

              <h2>11. Client Communication</h2>
              <h3>Methods</h3>${formatArray(d.commMethods)}
              <h3>Timeline Expectations</h3><p>${formatText(d.commTimeline)}</p>
            </div>
            <div class="col">
              <h2>12. Action Plan</h2>
              <h3>Action Items</h3>
              <ul style="margin-top:0;">
                <li>${formatText(d.action1)}</li>
                <li>${formatText(d.action2)}</li>
                <li>${formatText(d.action3)}</li>
                <li>${formatText(d.action4)}</li>
              </ul>
              <h3>Next Steps</h3>${formatArray(d.nextSteps)}
              <h3>Notes</h3><p>${formatText(d.notesSection)}</p>
            </div>
          </div>
        </div>
      `;

      try {
        const opt = {
          margin:       0,
          filename:     'Content_Strategy_Builder.pdf',
          image:        { type: 'jpeg', quality: 0.92 },
          html2canvas:  { scale: 2, letterRendering: true, useCORS: true },
          jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        
        if (typeof html2pdf !== 'undefined') {
          await html2pdf().set(opt).from(container).save();
        } else {
          alert("PDF library failed to load.");
        }
      } catch(e) {
        console.error("PDF Error:", e);
        alert("An error occurred generating the PDF.");
      }

      downloadBtn.disabled = false;
      downloadBtn.innerHTML = origText;
    });
  }

}

// Global helper missing from original codebase
if (typeof window.hexToRgba === 'undefined') {
  window.hexToRgba = function(hex, alpha) {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = parseInt(c.slice(0, 2), 16) || 0;
    const g = parseInt(c.slice(2, 4), 16) || 0;
    const b = parseInt(c.slice(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
}

// Global helpers missing from original codebase
if (typeof window.hexToRgba === 'undefined') {
  window.hexToRgba = function(hex, alpha) {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = parseInt(c.slice(0, 2), 16) || 0;
    const g = parseInt(c.slice(2, 4), 16) || 0;
    const b = parseInt(c.slice(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
}

if (typeof window.escHtml === 'undefined') {
  window.escHtml = function(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return unsafe || '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  };
}

// Auto-injected Module Bootloader
document.addEventListener('DOMContentLoaded', () => {
  if (typeof initState === 'function') initState();
  if (typeof renderSteps === 'function') renderSteps();
  if (typeof updateScoreCards === 'function') updateScoreCards();
  if (typeof attachEvents === 'function') attachEvents();
  if (typeof startLabelRotation === 'function') startLabelRotation();
  if (typeof setupEventHandlers === 'function') setupEventHandlers();
  if (typeof renderDynamicPlatforms === 'function') renderDynamicPlatforms();
  if (typeof updateProgress === 'function') updateProgress();
  if (typeof renderPreview === 'function') renderPreview();
});