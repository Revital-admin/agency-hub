/* ============================================================
   PERSONAL BRANDING STRATEGY BUILDER — APP LOGIC
   ============================================================ */

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

const state = {
  targetUrl: '',
  data: {}, 
  activeStep: 1,
  filter: 'all'
};

const FIELD_IDS = [
  'originStory', 'vision', 'coreValues', 'superpower',
  'primaryAudience', 'audiencePainPoints', 'audienceOutcomes',
  'personalGoals', 'businessGoals',
  'visualAesthetic',
  'pillar1Name', 'pillar1Topics', 'pillar2Name', 'pillar2Topics', 'pillar3Name', 'pillar3Topics',
  'ideation', 'production',
  'engagement', 'communities',
  'offers',
  'nextSteps', 'kpis'
];

const CHECKBOX_GROUPS = ['archetype', 'toneOfVoice', 'ctas'];

const PLATFORM_CONTENT_TYPES = {
  linkedin: [
    { value: 'thought_leadership', label: 'Thought Leadership' },
    { value: 'personal_stories', label: 'Personal Stories' },
    { value: 'frameworks', label: 'Frameworks/Teardowns' }
  ],
  twitter: [
    { value: 'threads', label: 'Threads' },
    { value: 'hot_takes', label: 'Hot Takes' },
    { value: 'build_in_public', label: 'Build in Public' }
  ],
  newsletter: [
    { value: 'deep_dives', label: 'Deep Dives' },
    { value: 'curation', label: 'Curation / Links' },
    { value: 'interviews', label: 'Interviews' }
  ],
  default: [
    { value: 'short_video', label: 'Short Video' },
    { value: 'photos', label: 'Photos / Graphics' },
    { value: 'text_posts', label: 'Text Posts' }
  ]
};

const SECTIONS_CONFIG = {
  1: { title: 'The Core Identity', text: ['originStory', 'vision', 'coreValues', 'superpower'], checkboxes: [] },
  2: { title: 'Target Audience', text: ['primaryAudience', 'audiencePainPoints', 'audienceOutcomes'], checkboxes: [] },
  3: { title: 'The "Why"', text: ['personalGoals', 'businessGoals'], checkboxes: [] },
  4: { title: 'Brand Voice & Archetype', text: ['visualAesthetic'], checkboxes: ['archetype', 'toneOfVoice'] },
  5: { title: 'Content Pillars', text: ['pillar1Name', 'pillar1Topics', 'pillar2Name', 'pillar2Topics', 'pillar3Name', 'pillar3Topics'], checkboxes: [] },
  6: { title: 'Platform Strategy', dynamicPlatforms: true },
  7: { title: 'Content Production Workflow', text: ['ideation', 'production'], checkboxes: [] },
  8: { title: 'Networking & Engagement', text: ['engagement', 'communities'], checkboxes: [] },
  9: { title: 'Monetization / Conversion', text: ['offers'], checkboxes: ['ctas'] },
  10: { title: 'Action Plan', text: ['nextSteps', 'kpis'], checkboxes: [] }
};

function initState() {
  state.data = {
    platforms: [
      { id: 'linkedin', name: 'LinkedIn', purpose: '', contentTypes: [], frequency: '' }
    ]
  };

  FIELD_IDS.forEach(id => { state.data[id] = ''; });
  CHECKBOX_GROUPS.forEach(group => { state.data[group] = []; });
  state.targetUrl = '';

  if (isEmbedded && parentClient) {
    if (!parentClient.personalBranding) {
      parentClient.personalBranding = { targetUrl: '', data: {} };
    }
    if (!parentClient.personalBranding.data) {
      parentClient.personalBranding.data = {};
    }

    state.targetUrl = parentClient.personalBranding.targetUrl || '';

    FIELD_IDS.forEach(id => {
      if (parentClient.personalBranding.data[id] !== undefined) {
        state.data[id] = parentClient.personalBranding.data[id];
      } else {
        parentClient.personalBranding.data[id] = '';
      }
    });

    if (parentClient.personalBranding.data.platforms && Array.isArray(parentClient.personalBranding.data.platforms)) {
      state.data.platforms = parentClient.personalBranding.data.platforms;
    } else {
      parentClient.personalBranding.data.platforms = state.data.platforms;
    }
  } else {
    try {
      const saved = localStorage.getItem('revital-personal-branding-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        state.targetUrl = parsed.targetUrl || '';
        Object.assign(state.data, parsed.data);
        if (!state.data.platforms || !Array.isArray(state.data.platforms)) {
          state.data.platforms = [{ id: 'linkedin', name: 'LinkedIn', purpose: '', contentTypes: [], frequency: '' }];
        }
      }
    } catch(e) {}
  }
}

function saveState() {
  if (isEmbedded && parentClient) {
    parentClient.personalBranding.targetUrl = state.targetUrl;
    parentClient.personalBranding.data = state.data;
    window.parent.saveDatabase();
    window.parent.renderDashboard();
  } else {
    try {
      localStorage.setItem('revital-personal-branding-state', JSON.stringify({
        targetUrl: state.targetUrl,
        data: state.data
      }));
    } catch (e) {}
  }
}

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
        <label class="custom-checkbox">
          <input type="checkbox" class="platform-ct-checkbox" data-platform-id="${p.id}" value="${ct.value}" ${isChecked ? 'checked' : ''} />
          <span class="checkmark"></span>
          ${ct.label}
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
        <input type="text" class="custom-input platform-purpose-input" data-platform-id="${p.id}" value="${p.purpose || ''}" placeholder="e.g. Lead generation / Thought leadership" />
      </div>
      <div class="form-group" style="margin-bottom: 1rem;">
        <label>Content Types</label>
        <div class="checkbox-grid">
          ${checkboxesHtml}
        </div>
      </div>
      <div class="form-group">
        <label>Posting Frequency</label>
        <input type="text" class="custom-input platform-frequency-input" data-platform-id="${p.id}" value="${p.frequency || ''}" placeholder="e.g. 3x a week" />
      </div>
    `;

    container.appendChild(platformEl);
  });

  setupDynamicPlatformEvents();
}

function setupDynamicPlatformEvents() {
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

  document.querySelectorAll('.platform-ct-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const pid = e.target.getAttribute('data-platform-id');
      const p = state.data.platforms.find(item => item.id === pid);
      if (p) {
        const checked = [];
        document.querySelectorAll(`.platform-ct-checkbox[data-platform-id="${pid}"]:checked`).forEach(checkedCb => {
          checked.push(checkedCb.value);
        });
        p.contentTypes = checked;
        saveState();
        updateProgress();
      }
    });
  });

  document.querySelectorAll('.remove-platform-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const button = e.target.closest('.remove-platform-btn');
      const pid = button.getAttribute('data-platform-id');
      const p = state.data.platforms.find(item => item.id === pid);
      if (p) {
        if (!confirm(`Are you sure you want to permanently delete the ${p.name} channel strategy?`)) return;
        state.data.platforms = state.data.platforms.filter(item => item.id !== pid);
        saveState();
        renderDynamicPlatforms();
        updateProgress();
      }
    });
  });
}

function isFieldFilled(key, type) {
  if (type === 'text') {
    const val = state.data[key];
    return val && typeof val === 'string' && val.trim() !== '';
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
      total += 3; 
      if (p.purpose && p.purpose.trim() !== '') filled++;
      if (p.frequency && p.frequency.trim() !== '') filled++;
      if (p.contentTypes && Array.isArray(p.contentTypes) && p.contentTypes.length > 0) filled++;
    });
    return { filled, total };
  }

  if (config.text) {
    config.text.forEach(key => {
      total++;
      if (isFieldFilled(key, 'text')) filled++;
    });
  }

  if (config.checkboxes) {
    config.checkboxes.forEach(key => {
      total++;
      if (state.data[key] && state.data[key].length > 0) filled++;
    });
  }

  return { filled, total };
}

function updateProgress() {
  let totalFields = 0;
  let filledFields = 0;
  let completedSections = 0;

  for (let s = 1; s <= 10; s++) {
    const { filled, total } = getSectionStats(s);
    totalFields += total;
    filledFields += filled;

    const progressTextEl = document.getElementById(`step-${s}-progress`);
    if (progressTextEl) {
      if (s === 6) {
        progressTextEl.textContent = `${filled}/${total} fields filled`;
      } else {
        progressTextEl.textContent = `${filled}/${total} filled`;
      }
      if (filled === total && total > 0) {
        progressTextEl.style.color = 'var(--color-green)';
        progressTextEl.innerHTML += ' &nbsp;<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
      } else {
        progressTextEl.style.color = '';
      }
    }

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

  const pct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
  const bar = document.getElementById('overallProgressBar');
  if (bar) bar.style.width = pct + '%';

  const scoreText = document.getElementById('val-score');
  if (scoreText) scoreText.textContent = pct + '%';
  
  const compText = document.getElementById('overallCompletedText');
  if (compText) compText.textContent = `${completedSections}/10`;
  
  const fieldsText = document.getElementById('val-fields');
  if (fieldsText) fieldsText.textContent = `${filledFields} / ${totalFields}`;
}

function setupEventHandlers() {
  const targetUrlEl = document.getElementById('targetUrlInput');
  if (targetUrlEl) {
    targetUrlEl.addEventListener('input', (e) => {
      state.targetUrl = e.target.value;
      saveState();
    });
  }

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

      customInput.value = '';
      addSelect.value = 'linkedin';
      customGroup.style.display = 'none';

      saveState();
      renderDynamicPlatforms();
      updateProgress();
    });
  }

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

  CHECKBOX_GROUPS.forEach(group => {
    document.querySelectorAll(`input[name="${group}"]`).forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = Array.from(document.querySelectorAll(`input[name="${group}"]:checked`)).map(c => c.value);
        state.data[group] = checked;
        saveState();
        updateProgress();
      });
    });
  });

  document.querySelectorAll('.step-header').forEach(header => {
    header.addEventListener('click', (e) => {
      const card = header.closest('.step-card');
      const body = card.querySelector('.step-body');
      const chevron = header.querySelector('.chevron');
      const isOpen = body.classList.contains('open');

      document.querySelectorAll('.step-body').forEach(b => b.classList.remove('open'));
      document.querySelectorAll('.chevron').forEach(ch => ch.classList.remove('open'));

      if (!isOpen) {
        body.classList.add('open');
        chevron.classList.add('open');
      }
    });
  });

  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.getAttribute('data-filter');

      document.querySelectorAll('.step-card').forEach((card, idx) => {
        const s = idx + 1;
        const isDone = card.classList.contains('done-card');
        if (state.filter === 'all') card.removeAttribute('hidden');
        else if (state.filter === 'complete') isDone ? card.removeAttribute('hidden') : card.setAttribute('hidden', 'true');
        else if (state.filter === 'incomplete') !isDone ? card.removeAttribute('hidden') : card.setAttribute('hidden', 'true');
      });
    });
  });

  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm('Reset all progress and data? This cannot be undone.')) return;
      state.targetUrl = '';
      FIELD_IDS.forEach(id => { state.data[id] = ''; });
      state.data.platforms = [{ id: 'linkedin', name: 'LinkedIn', purpose: '', contentTypes: [], frequency: '' }];

      saveState();
      initState();
      
      document.querySelectorAll('.custom-input, .custom-textarea').forEach(el => el.value = '');
      document.querySelectorAll('input[type="checkbox"]').forEach(el => el.checked = false);
      
      renderDynamicPlatforms();
      updateProgress();
    });
  }

  
  const pdfBtn = document.getElementById('downloadPdfBtn');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', async () => {
      pdfBtn.disabled = true;
      const origText = pdfBtn.innerHTML;
      pdfBtn.innerHTML = "⏳ Generating...";

      const d = state.data;
      
      const formatText = (txt) => {
        if (!txt) return '<span style="color: #94a3b8; font-style: italic;">Not provided</span>';
        return txt.replace(/\n/g, '<br>');
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
          .logo { height: 50px; margin-bottom: 40px;  }
          .grid { display: flex; flex-wrap: wrap; gap: 20px; }
          .col { flex: 1; min-width: 300px; }
        </style>
      `;

      container.innerHTML = `
        ${style}
        <div class="page">
          <img src="assets/logo.png" onerror="this.src='../logo.png'" alt="Revital Hub" class="logo">
          <h1>Personal Branding Strategy</h1>
          <p><strong>Target URL / Handle:</strong> ${formatText(state.targetUrl)}</p>
          
          <div class="grid">
            <div class="col">
              <h2>1. Core Identity</h2>
              <h3>Origin Story</h3><p>${formatText(d.originStory)}</p>
              <h3>Vision & Mission</h3><p>${formatText(d.vision)}</p>
              <h3>Core Values</h3><p>${formatText(d.coreValues)}</p>
              <h3>Superpower</h3><p>${formatText(d.superpower)}</p>
            </div>
            <div class="col">
              <h2>2. Target Audience</h2>
              <h3>Primary Audience</h3><p>${formatText(d.primaryAudience)}</p>
              <h3>Pain Points</h3><p>${formatText(d.audiencePainPoints)}</p>
              <h3>Desired Outcomes</h3><p>${formatText(d.audienceOutcomes)}</p>
            </div>
          </div>
        </div>

        <div class="page">
          <div class="grid">
            <div class="col">
              <h2>3. Goals & "Why"</h2>
              <h3>Personal Goals</h3><p>${formatText(d.personalGoals)}</p>
              <h3>Business Goals</h3><p>${formatText(d.businessGoals)}</p>

              <h2>4. Brand Voice</h2>
              <h3>Archetype</h3>${formatArray(d.archetype)}
              <h3>Tone of Voice</h3>${formatArray(d.toneOfVoice)}
              <h3>Visual Aesthetic</h3><p>${formatText(d.visualAesthetic)}</p>
            </div>
            
            <div class="col">
              <h2>5. Content Pillars</h2>
              <div style="background:#f8fafc; padding:15px; border-radius:8px; margin-bottom:15px;">
                <h3 style="margin-top:0;">Pillar 1: ${formatText(d.pillar1Name)}</h3>
                <p>${formatText(d.pillar1Topics)}</p>
              </div>
              <div style="background:#f8fafc; padding:15px; border-radius:8px; margin-bottom:15px;">
                <h3 style="margin-top:0;">Pillar 2: ${formatText(d.pillar2Name)}</h3>
                <p>${formatText(d.pillar2Topics)}</p>
              </div>
              <div style="background:#f8fafc; padding:15px; border-radius:8px;">
                <h3 style="margin-top:0;">Pillar 3: ${formatText(d.pillar3Name)}</h3>
                <p>${formatText(d.pillar3Topics)}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="page">
          <h2>6. Platform Strategy</h2>
          ${platformsHtml}

          <div class="grid">
            <div class="col">
              <h2>7. Production Workflow</h2>
              <h3>Ideation</h3><p>${formatText(d.ideation)}</p>
              <h3>Production</h3><p>${formatText(d.production)}</p>
            </div>
            <div class="col">
              <h2>8. Engagement</h2>
              <h3>Networking Strategy</h3><p>${formatText(d.engagement)}</p>
              <h3>Target Communities</h3><p>${formatText(d.communities)}</p>
            </div>
          </div>
        </div>

        <div class="page">
          <div class="grid">
            <div class="col">
              <h2>9. Monetization</h2>
              <h3>Core Offers</h3><p>${formatText(d.offers)}</p>
              <h3>Primary Calls-to-Action</h3>${formatArray(d.ctas)}
            </div>
            <div class="col">
              <h2>10. Action Plan</h2>
              <h3>Immediate Next Steps</h3><p>${formatText(d.nextSteps)}</p>
              <h3>KPIs / Success Metrics</h3><p>${formatText(d.kpis)}</p>
            </div>
          </div>
        </div>
      `;

      try {
        const opt = {
          margin:       0,
          filename:     'Personal_Branding_Strategy.pdf',
          image:        { type: 'png' },
          html2canvas:  { scale: 4, letterRendering: true, useCORS: true },
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

      pdfBtn.disabled = false;
      pdfBtn.innerHTML = origText;
    });
  }, 500);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initState();
  
  FIELD_IDS.forEach(id => {
    const el = document.getElementById('field_' + id);
    if (el) {
      el.value = state.data[id] || '';
    }
  });

  CHECKBOX_GROUPS.forEach(group => {
    const values = state.data[group] || [];
    document.querySelectorAll(`input[name="${group}"]`).forEach(cb => {
      cb.checked = values.includes(cb.value);
    });
  });

  const targetUrlEl = document.getElementById('targetUrlInput');
  if (targetUrlEl && state.targetUrl) {
    targetUrlEl.value = state.targetUrl;
  }
  
  renderDynamicPlatforms();
  updateProgress();
  setupEventHandlers();
});