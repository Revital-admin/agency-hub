/* ============================================================
   SEO AUDIT CHECKLIST — APP
   State management, rendering, filtering, and metric animations.
   Connected Mode: Interfaces directly with the parent workspace database
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

/* ── State ──────────────────────────────────────────────────── */

const state = {
  checked: {}, // { taskId: boolean }
  notes: {},   // { taskId: string }
  filter: 'all', // 'all' | 'incomplete' | 'complete'
  labelIndices: { steps: 0, tasks: 0, remaining: 0, score: 0 },
  targetUrl: '', // Website or client being audited
};

// Initialise all tasks as unchecked, restore from localStorage or parent if available
function initState() {
  STEPS.forEach(step => {
    step.subs.forEach(sub => {
      state.checked[sub.id] = false;
      state.notes[sub.id] = "";
    });
  });

  if (isEmbedded && parentClient) {
    if (!parentClient.seoAudit) {
      parentClient.seoAudit = { checked: {}, notes: {}, targetUrl: "" };
    }
    if (!parentClient.seoAudit.checked) {
      parentClient.seoAudit.checked = {};
    }
    if (!parentClient.seoAudit.notes) {
      parentClient.seoAudit.notes = {};
    }
    // Bind child state object reference directly to the parent object
    Object.keys(parentClient.seoAudit.checked).forEach(k => {
      if (k in state.checked) {
        state.checked[k] = parentClient.seoAudit.checked[k];
      }
    });
    // Ensure all checklist keys are populated on parent client
    Object.keys(state.checked).forEach(k => {
      if (parentClient.seoAudit.checked[k] === undefined) {
        parentClient.seoAudit.checked[k] = state.checked[k];
      } else {
        state.checked[k] = parentClient.seoAudit.checked[k];
      }
    });
    // Sync notes
    Object.keys(state.notes).forEach(k => {
      if (parentClient.seoAudit.notes[k] === undefined) {
        parentClient.seoAudit.notes[k] = "";
      }
      state.notes[k] = parentClient.seoAudit.notes[k];
    });
    state.targetUrl = parentClient.seoAudit.targetUrl || "";
  } else {
    try {
      const saved = localStorage.getItem('seo-checklist-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.keys(parsed).forEach(k => {
          if (k in state.checked) state.checked[k] = parsed[k];
        });
      }
      const savedNotes = localStorage.getItem('seo-checklist-notes');
      if (savedNotes) {
        const parsedNotes = JSON.parse(savedNotes);
        Object.keys(parsedNotes).forEach(k => {
          if (k in state.notes) state.notes[k] = parsedNotes[k];
        });
      }
      const savedUrl = localStorage.getItem('seo-checklist-target-url');
      if (savedUrl) {
        state.targetUrl = savedUrl;
      }
    } catch (e) {
      // localStorage not available — silent fail
    }
  }
}

function saveState() {
  if (isEmbedded && parentClient) {
    parentClient.seoAudit.checked = state.checked;
    parentClient.seoAudit.notes = state.notes;
    parentClient.seoAudit.targetUrl = state.targetUrl;
    window.parent.saveDatabase();
    window.parent.renderDashboard();
  } else {
    try {
      localStorage.setItem('seo-checklist-state', JSON.stringify(state.checked));
      localStorage.setItem('seo-checklist-notes', JSON.stringify(state.notes));
    } catch (e) {}
  }
}

/* ── Stats ──────────────────────────────────────────────────── */

function getStats() {
  const allSubs = STEPS.flatMap(s => s.subs);
  const totalTasks = allSubs.length;
  const doneTasks = allSubs.filter(s => state.checked[s.id]).length;
  const doneSteps = STEPS.filter(s => s.subs.every(sub => state.checked[sub.id])).length;
  const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return { totalTasks, doneTasks, doneSteps, pct };
}

function getStepProgress(step) {
  const done = step.subs.filter(s => state.checked[s.id]).length;
  return { done, total: step.subs.length };
}

function isStepComplete(step) {
  return step.subs.every(s => state.checked[s.id]);
}

/* ── Score Cards ────────────────────────────────────────────── */

function updateScoreCards() {
  const { totalTasks, doneTasks, doneSteps, pct } = getStats();
  const remaining = totalTasks - doneTasks;

  setScoreValue('steps', `${doneSteps}/8`);
  setScoreValue('tasks', doneTasks);
  setScoreValue('remaining', remaining);
  setScoreValue('score', `${pct}%`);

  // Colour logic
  const remEl = document.getElementById('val-remaining');
  remEl.className = 'score-value' + (remaining === 0 ? ' success' : ' warning');

  const scoreEl = document.getElementById('val-score');
  scoreEl.style.color = pct === 100 ? 'var(--color-success)' : pct >= 50 ? '' : '';

  // Progress bar
  document.getElementById('progFill').style.width = pct + '%';
  document.getElementById('progText').textContent = `${doneTasks} of ${totalTasks} tasks complete`;
  document.getElementById('progPct').textContent = `${pct}%`;
}

function setScoreValue(key, value) {
  const el = document.getElementById(`val-${key}`);
  if (el) el.textContent = value;
}

/* ── Metric Label Rotation ──────────────────────────────────── */
// Each score card label cycles through METRIC_LABELS variants.
// Labels flip out (CSS class) then a new label fades in.

const LABEL_INTERVAL_BASE = 4200; // ms between rotations
const LABEL_STAGGER       = 1100; // ms offset per card

function rotateLabelFor(key, delay) {
  const labels = METRIC_LABELS[key];
  if (!labels || labels.length < 2) return;

  setTimeout(function scheduleNext() {
    const el = document.getElementById(`label-${key}`);
    if (!el) return;

    // Animate out
    el.classList.add('flipping');

    setTimeout(() => {
      // Advance index
      state.labelIndices[key] = (state.labelIndices[key] + 1) % labels.length;
      el.textContent = labels[state.labelIndices[key]];
      el.classList.remove('flipping');

      // Schedule next rotation
      setTimeout(scheduleNext, LABEL_INTERVAL_BASE);
    }, 160); // matches CSS transition duration

  }, delay);
}

function startLabelRotation() {
  const keys = Object.keys(METRIC_LABELS);
  keys.forEach((key, i) => {
    rotateLabelFor(key, LABEL_INTERVAL_BASE + i * LABEL_STAGGER);
  });
}

/* ── Rendering ──────────────────────────────────────────────── */

function renderSteps() {
  const container = document.getElementById('stepsList');
  const existingOpen = getOpenStepIds();
  container.innerHTML = '';

  STEPS.forEach((step, idx) => {
    const isComplete = isStepComplete(step);
    const prog = getStepProgress(step);
    const color = STEP_COLORS[idx];
    const bgAlpha = hexToRgba(color, 0.15);
    const isOpen = existingOpen.has(step.id);

    // Filter logic
    if (state.filter === 'complete' && !isComplete) return;
    if (state.filter === 'incomplete' && isComplete) return;

    const card = document.createElement('div');
    card.className = 'step-card' + (isComplete ? ' done-card' : '');
    card.dataset.stepId = step.id;
    card.style.animationDelay = `${idx * 40}ms`;

    // Tool tags HTML
    const toolTags = step.tools
      .map(t => `<span class="tool-tag">${escHtml(t)}</span>`)
      .join('');

    // Sub-tasks HTML
    const subsHtml = step.subs.map(sub => {
      const checked = state.checked[sub.id];
      return `
        <div class="sub-item${checked ? ' checked' : ''}" data-sub-id="${sub.id}">
          <input
            type="checkbox"
            class="sub-checkbox"
            id="cb_${sub.id}"
            ${checked ? 'checked' : ''}
            aria-label="${escHtml(sub.label)}"
          />
          <div class="sub-content">
            <div class="sub-label">${escHtml(sub.label)}</div>
            <div class="sub-desc">${escHtml(sub.desc)}</div>
            <div class="sub-notes-wrapper">
              <textarea class="sub-notes-input" placeholder="Add notes..." rows="1">${escHtml(state.notes[sub.id] || "")}</textarea>
            </div>
          </div>
        </div>`;
    }).join('');

    card.innerHTML = `
      <div class="step-header" data-step-id="${step.id}" role="button" tabindex="0" aria-expanded="${isOpen}">
        <div class="step-num" style="background:${bgAlpha};color:${color}">${step.num}</div>
        <div class="step-meta">
          <div class="step-title${isComplete ? ' is-done' : ''}">${escHtml(step.title)}</div>
          <div class="step-tools">${toolTags}</div>
        </div>
        <div class="step-right">
          <span class="step-progress-text">${prog.done}/${prog.total}</span>
          <svg class="step-done-icon${isComplete ? ' visible' : ''}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Step complete"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
          <svg class="chevron${isOpen ? ' open' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="step-body${isOpen ? ' open' : ''}" id="body_${step.id}">
        <div class="tip-box">
          <svg class="tip-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>${escHtml(step.tip)}</span>
        </div>
        ${subsHtml}
      </div>`;

    container.appendChild(card);
  });
}

function getOpenStepIds() {
  const open = new Set();
  document.querySelectorAll('.step-body.open').forEach(el => {
    const id = el.id.replace('body_', '');
    open.add(id);
  });
  return open;
}

/* ── Event Delegation ───────────────────────────────────────── */

function attachEvents() {
  const list = document.getElementById('stepsList');

  // Toggle step open/close
  list.addEventListener('click', e => {
    if (e.target.closest('.sub-notes-input')) {
      return; // Ignore clicks inside the notes textarea
    }

    const header = e.target.closest('.step-header');
    const subItem = e.target.closest('.sub-item');
    const checkbox = e.target.closest('.sub-checkbox');

    if (checkbox) {
      // Let checkbox handle itself, then sync state
      const subId = checkbox.id.replace('cb_', '');
      state.checked[subId] = checkbox.checked;
      saveState();
      updateScoreCards();
      refreshStepHeader(checkbox.closest('.step-card'));
      return;
    }

    if (subItem) {
      const subId = subItem.dataset.subId;
      state.checked[subId] = !state.checked[subId];
      saveState();
      updateScoreCards();
      subItem.classList.toggle('checked', state.checked[subId]);
      const cb = subItem.querySelector('.sub-checkbox');
      if (cb) cb.checked = state.checked[subId];
      refreshStepHeader(subItem.closest('.step-card'));
      return;
    }

    if (header) {
      const stepId = header.dataset.stepId;
      toggleStepBody(stepId);
    }
  });

  // Handle note typing auto-saves
  list.addEventListener('input', e => {
    const notesInput = e.target.closest('.sub-notes-input');
    if (notesInput) {
      const subItem = notesInput.closest('.sub-item');
      if (subItem) {
        const subId = subItem.dataset.subId;
        state.notes[subId] = notesInput.value;
        saveState();
      }
    }
  });

  // Keyboard accessibility for step headers
  list.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const header = e.target.closest('.step-header');
      if (header) {
        e.preventDefault();
        toggleStepBody(header.dataset.stepId);
      }
    }
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      renderSteps();
    });
  });

  // Reset button
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!confirm('Reset all checklist progress? This cannot be undone.')) return;
    state.checked = {};
    state.notes = {};
    if (state.textInputs) state.textInputs = {};
    document.querySelectorAll('.step-notes').forEach(el => el.value = '');
    document.querySelectorAll('.metric-input, .text-input').forEach(el => el.value = '');
    saveState();
    updateScoreCards();
    renderSteps();
  });

  // Website URL target input
  const targetInput = document.getElementById('targetUrlInput');
  if (targetInput) {
    targetInput.value = state.targetUrl || '';
    targetInput.addEventListener('input', e => {
      state.targetUrl = e.target.value.trim();
      if (isEmbedded && parentClient) {
        parentClient.seoAudit.targetUrl = state.targetUrl;
        window.parent.saveDatabase();
        window.parent.renderDashboard();
      } else {
        try {
          localStorage.setItem('seo-checklist-target-url', state.targetUrl);
        } catch (err) {}
      }
    });
  }

  // Download PDF report button
  
  const downloadBtn = document.getElementById('downloadPdfBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      downloadBtn.disabled = true;
      const origText = downloadBtn.innerHTML;
      downloadBtn.innerHTML = "⏳ Generating...";

      const stats = getStats();
      const targetTitle = state.targetUrl ? state.targetUrl : "Client Website / Project";

      let stepsHtml = '';
      STEPS.forEach((step, idx) => {
        let tasksHtml = '';
        step.subs.forEach(sub => {
          const isChecked = state.checked[sub.id];
          const note = state.notes[sub.id];
          
          let statusHtml = isChecked 
            ? '<span style="color:#10b981; font-weight:bold;">[PASS]</span>' 
            : '<span style="color:#f68d5f; font-weight:bold;">[ACTION REQUIRED]</span>';
            
          let noteHtml = note ? `<div style="background:#f1f5f9; padding:10px; margin-top:5px; border-left:3px solid #3b82f6; font-size:12px; color:#475569;"><strong>Notes:</strong> ${note}</div>` : '';

          tasksHtml += `
            <div style="border-bottom:1px solid #e2e8f0; padding:12px 0;">
              <div style="display:flex; justify-content:space-between;">
                <div style="font-size:14px; font-weight:500; color:#1e293b;">${sub.text}</div>
                <div style="font-size:12px;">${statusHtml}</div>
              </div>
              ${noteHtml}
            </div>
          `;
        });

        stepsHtml += `
          <div style="margin-bottom:30px;">
            <h2 style="font-size:18px; color:#0f172a; border-bottom:2px solid #e2e8f0; padding-bottom:8px; margin-bottom:10px;">Step ${idx+1}: ${step.title}</h2>
            ${tasksHtml}
          </div>
        `;
      });

      const container = document.createElement('div');
      container.style.fontFamily = "'Inter', sans-serif, Arial";
      container.style.color = "#1e293b";
      container.style.fontSize = "14px";
      container.style.lineHeight = "1.6";
      container.style.width = "100%";

      const style = `
        <style>
          .box, .col, .score-box, tr, td, h2, h3 { page-break-inside: avoid; }

          .page { padding: 40px; box-sizing: border-box; background: white; page-break-after: always; position: relative; }
          .page:last-child { page-break-after: auto; }
          h1 { font-size: 28px; font-weight: 700; margin-bottom: 5px; color: #0f172a; border-bottom: 4px solid #f59e0b; padding-bottom: 20px;}
          p { margin-bottom: 15px; color:#475569; }
          .logo { height: 50px; margin-bottom: 40px;  }
          .score-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:20px; margin-bottom:30px; text-align:center;}
          .score-val { font-size:36px; font-weight:bold; color:#3b82f6; }
        </style>
      `;

      container.innerHTML = `
        ${style}
        <div class="page">
          <img src="assets/logo.png" onerror="this.src='../logo.png'" alt="Revital Hub" class="logo">
          <h1>Audit Report: ${document.title.split('—')[0].trim() || 'Checklist'}</h1>
          <p><strong>Target:</strong> ${targetTitle}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          
          <div class="score-box">
            <div style="font-size:14px; text-transform:uppercase; font-weight:600; color:#64748b; margin-bottom:5px;">Overall Score</div>
            <div class="score-val">${stats.pct}%</div>
            <div style="font-size:13px; color:#475569; margin-top:5px;">${stats.doneTasks} of ${stats.totalTasks} items completed</div>
          </div>

          ${stepsHtml}
        </div>
      `;

      try {
        const opt = {
          margin:       0,
          filename:     `Audit_Report_${new Date().toISOString().split('T')[0]}.pdf`,
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

      downloadBtn.disabled = false;
      downloadBtn.innerHTML = origText;
    });
  }

}

function toggleStepBody(stepId) {
  const body = document.getElementById('body_' + stepId);
  const card = document.querySelector(`[data-step-id="${stepId}"].step-header`);
  if (!body || !card) return;

  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);

  const chevron = card.querySelector('.chevron');
  if (chevron) chevron.classList.toggle('open', !isOpen);

  card.setAttribute('aria-expanded', String(!isOpen));
}

function refreshStepHeader(card) {
  if (!card) return;
  const stepId = card.dataset.stepId;
  const step = STEPS.find(s => s.id === stepId);
  if (!step) return;

  const isComplete = isStepComplete(step);
  const prog = getStepProgress(step);

  card.classList.toggle('done-card', isComplete);

  const titleEl = card.querySelector('.step-title');
  if (titleEl) titleEl.classList.toggle('is-done', isComplete);

  const progText = card.querySelector('.step-progress-text');
  if (progText) progText.textContent = `${prog.done}/${prog.total}`;

  const doneIcon = card.querySelector('.step-done-icon');
  if (doneIcon) doneIcon.classList.toggle('visible', isComplete);
}

/* ── PDF Generation ─────────────────────────────────────────── */

function drawCheckmark(doc, x, y) {
  doc.setDrawColor(43, 138, 93); // Success green
  doc.setLineWidth(1.5);
  doc.line(x + 2, y + 6, x + 5, y + 9);
  doc.line(x + 5, y + 9, x + 10, y + 3);
}

function drawCrossmark(doc, x, y) {
  doc.setDrawColor(245, 115, 90); // Failed orange/red
  doc.setLineWidth(1.5);
  doc.line(x + 2, y + 3, x + 8, y + 9);
  doc.line(x + 8, y + 3, x + 2, y + 9);
}

// Auto-injected Module Bootloader
document.addEventListener('DOMContentLoaded', () => {
  if (typeof initState === 'function') initState();
  if (typeof renderSteps === 'function') renderSteps();
  if (typeof updateScoreCards === 'function') updateScoreCards();
  if (typeof renderPreview === 'function') renderPreview();
});
