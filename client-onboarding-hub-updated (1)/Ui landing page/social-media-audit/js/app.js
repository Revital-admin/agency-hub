/* ============================================================
   SOCIAL MEDIA AUDIT CHECKLIST — APP
   State management, rendering, filtering, and metric animations.
   Connected Mode: Interfaces directly with the parent workspace database
   ============================================================ */

/* ── Check if embedded in parent Revital Hub ── */
const isEmbedded = (window.parent && typeof window.parent.getActiveClient === 'function');
let parentClient = null;

if (isEmbedded) {
  parentClient = window.parent.getActiveClient();
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
    if (!parentClient.socialAudit) {
      parentClient.socialAudit = { checked: {}, notes: {}, targetUrl: "" };
    }
    if (!parentClient.socialAudit.checked) {
      parentClient.socialAudit.checked = {};
    }
    if (!parentClient.socialAudit.notes) {
      parentClient.socialAudit.notes = {};
    }
    // Bind child state object reference directly to the parent object
    Object.keys(parentClient.socialAudit.checked).forEach(k => {
      if (k in state.checked) {
        state.checked[k] = parentClient.socialAudit.checked[k];
      }
    });
    // Ensure all checklist keys are populated on parent client
    Object.keys(state.checked).forEach(k => {
      if (parentClient.socialAudit.checked[k] === undefined) {
        parentClient.socialAudit.checked[k] = state.checked[k];
      } else {
        state.checked[k] = parentClient.socialAudit.checked[k];
      }
    });
    // Sync notes
    Object.keys(state.notes).forEach(k => {
      if (parentClient.socialAudit.notes[k] === undefined) {
        parentClient.socialAudit.notes[k] = "";
      }
      state.notes[k] = parentClient.socialAudit.notes[k];
    });
    state.targetUrl = parentClient.socialAudit.targetUrl || "";
  } else {
    try {
      const saved = localStorage.getItem('social-audit-checklist-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.keys(parsed).forEach(k => {
          if (k in state.checked) state.checked[k] = parsed[k];
        });
      }
      const savedNotes = localStorage.getItem('social-audit-checklist-notes');
      if (savedNotes) {
        const parsedNotes = JSON.parse(savedNotes);
        Object.keys(parsedNotes).forEach(k => {
          if (k in state.notes) state.notes[k] = parsedNotes[k];
        });
      }
      const savedUrl = localStorage.getItem('social-audit-checklist-target-url');
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
    parentClient.socialAudit.checked = state.checked;
    parentClient.socialAudit.notes = state.notes;
    parentClient.socialAudit.targetUrl = state.targetUrl;
    window.parent.saveDatabase();
    window.parent.renderDashboard();
  } else {
    try {
      localStorage.setItem('social-audit-checklist-state', JSON.stringify(state.checked));
      localStorage.setItem('social-audit-checklist-notes', JSON.stringify(state.notes));
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
    Object.keys(state.checked).forEach(k => (state.checked[k] = false));
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
        parentClient.socialAudit.targetUrl = state.targetUrl;
        window.parent.saveDatabase();
        window.parent.renderDashboard();
      } else {
        try {
          localStorage.setItem('social-audit-checklist-target-url', state.targetUrl);
        } catch (err) {}
      }
    });
  }

  // Download PDF report button
  const downloadBtn = document.getElementById('downloadPdfBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      downloadPdfReport();
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
  doc.setDrawColor(16, 185, 129); // Success green
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

function downloadPdfReport() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const { totalTasks, doneTasks, pct } = getStats();
  const targetHost = state.targetUrl || 'Not specified';
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Keep track of current y position
  let y = 50;

  function checkPageOverflow(heightNeeded) {
    if (y + heightNeeded > 780) {
      doc.addPage();
      y = 60;
    }
  }

  // Draw header block
  checkPageOverflow(50);
  if (typeof LOGO_BASE64 !== 'undefined' && LOGO_BASE64) {
    try {
      doc.addImage(LOGO_BASE64, 'PNG', 40, 42, 110, 33);
    } catch (e) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(236, 72, 153); // Pink
      doc.text('REVITAL PRODUCTIONS', 40, 60);
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(236, 72, 153); // Pink
    doc.text('REVITAL PRODUCTIONS', 40, 60);
  }

  // Metadata block (align right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(26, 26, 23); // #1a1a17
  doc.text('SOCIAL MEDIA AUDIT REPORT', 555, 50, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(85, 84, 80); // #555450
  doc.text(`Target: ${targetHost}`, 555, 63, { align: 'right' });
  doc.text(`Date: ${currentDate}`, 555, 75, { align: 'right' });

  y = 95;

  // Draw progress scorecard
  checkPageOverflow(65);
  doc.setFillColor(248, 248, 246); // #f8f8f6
  doc.rect(40, y, 515, 65, 'F');
  doc.setDrawColor(229, 229, 224); // #e5e5e0
  doc.setLineWidth(1);
  doc.rect(40, y, 515, 65, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(85, 84, 80);
  doc.text('SOCIAL CHANNEL HEALTH SCORE', 55, y + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(236, 72, 153); // Brand pink
  doc.text(`${pct}%`, 55, y + 50);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(26, 26, 23);
  doc.text(`Audits Passed: ${doneTasks} / ${totalTasks}`, 180, y + 28);
  doc.text(`Gaps Remaining: ${totalTasks - doneTasks}`, 180, y + 44);

  y += 90;

  // Split tasks into passed and failed
  const failedItems = [];
  const passedItems = [];

  STEPS.forEach(step => {
    const failedSubs = step.subs.filter(sub => !state.checked[sub.id]);
    const passedSubs = step.subs.filter(sub => state.checked[sub.id]);

    if (failedSubs.length > 0) {
      failedItems.push({
        stepNum: step.num,
        stepTitle: step.title,
        tools: step.tools,
        subs: failedSubs
      });
    }
    if (passedSubs.length > 0) {
      passedItems.push({
        stepNum: step.num,
        stepTitle: step.title,
        tools: step.tools,
        subs: passedSubs
      });
    }
  });

  // Section 1: Incomplete Items (Things that failed the audit)
  if (failedItems.length > 0) {
    checkPageOverflow(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(245, 115, 90); // Coral
    doc.text('ACTION REQUIRED — PROFILE AUDIT GAPS', 40, y);
    doc.setDrawColor(245, 115, 90);
    doc.setLineWidth(1);
    doc.line(40, y + 6, 555, y + 6);
    y += 24;

    failedItems.forEach(item => {
      checkPageOverflow(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(26, 26, 23);
      doc.text(`Step ${item.stepNum}: ${item.stepTitle}`, 40, y);
      y += 14;

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(85, 84, 80);
      doc.text(`Tools: ${item.tools.join(', ')}`, 40, y);
      y += 12;

      item.subs.forEach(sub => {
        const labelLines = doc.splitTextToSize(sub.label, 480);
        const descLines = doc.splitTextToSize(sub.desc, 480);
        
        const notesText = state.notes[sub.id] ? state.notes[sub.id].trim() : '';
        let notesLines = [];
        let noteBlockHeight = 0;
        if (notesText) {
          notesLines = doc.splitTextToSize(notesText, 465);
          noteBlockHeight = (notesLines.length * 10) + 12;
        }

        const textHeight = (labelLines.length * 12) + (descLines.length * 10) + noteBlockHeight + 6;

        checkPageOverflow(textHeight + 10);
        drawCrossmark(doc, 40, y);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(26, 26, 23);
        let currY = y + 8;
        labelLines.forEach(lineText => {
          doc.text(lineText, 56, currY);
          currY += 12;
        });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(85, 84, 80);
        descLines.forEach(lineText => {
          doc.text(lineText, 56, currY);
          currY += 10;
        });

        if (notesText) {
          doc.setDrawColor(245, 115, 90);
          doc.setLineWidth(1.5);
          doc.line(56, currY + 2, 56, currY + 2 + noteBlockHeight - 8);
          
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(110, 110, 105);
          
          let notesY = currY + 9;
          notesLines.forEach(lineText => {
            doc.text(lineText, 64, notesY);
            notesY += 10;
          });
          currY = notesY + 4;
        }

        y = currY + 6;
      });
      y += 6;
    });
    y += 10;
  }

  // Section 2: Completed Items (Things that passed the audit)
  if (passedItems.length > 0) {
    checkPageOverflow(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(16, 185, 129); // Emerald Green
    doc.text('COMPLETED AUDIT ITEMS', 40, y);
    doc.setDrawColor(16, 185, 129);
    doc.setLineWidth(1);
    doc.line(40, y + 6, 555, y + 6);
    y += 24;

    passedItems.forEach(item => {
      checkPageOverflow(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(26, 26, 23);
      doc.text(`Step ${item.stepNum}: ${item.stepTitle}`, 40, y);
      y += 14;

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(85, 84, 80);
      doc.text(`Tools: ${item.tools.join(', ')}`, 40, y);
      y += 12;

      item.subs.forEach(sub => {
        const labelLines = doc.splitTextToSize(sub.label, 480);
        const descLines = doc.splitTextToSize(sub.desc, 480);
        
        const notesText = state.notes[sub.id] ? state.notes[sub.id].trim() : '';
        let notesLines = [];
        let noteBlockHeight = 0;
        if (notesText) {
          notesLines = doc.splitTextToSize(notesText, 465);
          noteBlockHeight = (notesLines.length * 10) + 12;
        }

        const textHeight = (labelLines.length * 12) + (descLines.length * 10) + noteBlockHeight + 6;

        checkPageOverflow(textHeight + 10);
        drawCheckmark(doc, 40, y);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(26, 26, 23);
        let currY = y + 8;
        labelLines.forEach(lineText => {
          doc.text(lineText, 56, currY);
          currY += 12;
        });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(85, 84, 80);
        descLines.forEach(lineText => {
          doc.text(lineText, 56, currY);
          currY += 10;
        });

        if (notesText) {
          doc.setDrawColor(16, 185, 129);
          doc.setLineWidth(1.5);
          doc.line(56, currY + 2, 56, currY + 2 + noteBlockHeight - 8);
          
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(110, 110, 105);
          
          let notesY = currY + 9;
          notesLines.forEach(lineText => {
            doc.text(lineText, 64, notesY);
            notesY += 10;
          });
          currY = notesY + 4;
        }

        y = currY + 6;
      });
      y += 6;
    });
  }

  // Draw Page numbers & Footer on all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Accent line at the very top of each page
    doc.setFillColor(236, 72, 153); // Brand pink
    doc.rect(40, 20, 515, 3, 'F');

    // Bottom divider
    doc.setDrawColor(229, 229, 224);
    doc.setLineWidth(0.5);
    doc.line(40, 800, 555, 800);

    // Footer text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 135);
    doc.text('Prepared by Revital Productions Social Media Audit Checklist', 40, 814);
    doc.text(`Page ${i} of ${totalPages}`, 555, 814, { align: 'right' });
  }

  const safeFilename = `social-media-audit-report-${targetHost.replace(/[^a-z0-9.-]/gi, '_')}.pdf`;
  doc.save(safeFilename);
}

/* ── Utilities ──────────────────────────────────────────────── */

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(new RegExp('"', 'g'), '&quot;');
}

function hexToRgba(hex, alpha) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ── Boot ───────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  initState();
  updateScoreCards();
  renderSteps();
  attachEvents();
  startLabelRotation();
});
