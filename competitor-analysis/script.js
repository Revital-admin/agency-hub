/* ============================================================
   script.js — builds the dynamic UI and handles interactions
   for the Monthly Report page.
   ============================================================ */

const METRICS = [
  { label: 'Followers (Total)', placeholder: 'e.g. 150K' },
  { label: 'Followers (New)',   placeholder: 'e.g. +2.4K' },
  { label: 'Impressions',       placeholder: 'e.g. 1.2M' },
  { label: 'Engagement Rate',   placeholder: 'e.g. 4.8%' },
  { label: 'Content Posted',    placeholder: 'e.g. 12 videos, 8 posts' },
  { label: 'Top Performing Post', placeholder: 'e.g. BTS Video (250k views)' }
];

const COLORS = [
  '#534AB7', // Purple
  '#1D9E75', // Teal
  '#D85A30', // Coral
  '#185FA5', // Blue
  '#993556', // Pink
  '#BA7517'  // Amber
];

let platforms = [
  { name: 'Instagram', color: '#534AB7' },
  { name: 'TikTok', color: '#1D9E75' },
  { name: 'YouTube', color: '#D85A30' }
];

// Stores input cell data: cellData[metricIdx][platformIdx]
let cellData = {};

const placeholderText = 'Describe key achievements, highlights, and wins from this month. Click here to edit...';

/* ── Check if embedded in parent Revital Hub ── */
const isEmbedded = (window.parent && typeof window.parent.getActiveClient === 'function');
let parentClient = null;
let reportState = null;

if (isEmbedded) {
  parentClient = window.parent.getActiveClient();
  if (parentClient) {
    if (!parentClient.report) {
      parentClient.report = {
        date: "",
        preparedBy: "",
        focus: "",
        wins: "",
        platforms: [],
        cellData: {}
      };
    }
    reportState = parentClient.report;
  }
}

function loadFromParent() {
  if (isEmbedded && parentClient && reportState) {
    // Sync metadata inputs
    const clientInput = document.getElementById('client');
    const dateInput = document.getElementById('rdate');
    const preparedInput = document.getElementById('preparedby');
    const focusInput = document.getElementById('focus');
    const winsInput = document.getElementById('overviewText');

    if (clientInput) {
      clientInput.value = parentClient.name || '';
      clientInput.readOnly = true; // Client Name managed by Hub dropdown
    }
    if (dateInput) dateInput.value = reportState.date || '';
    if (preparedInput) preparedInput.value = reportState.preparedBy || '';
    if (focusInput) focusInput.value = reportState.focus || '';
    if (winsInput) {
      winsInput.textContent = reportState.wins || placeholderText;
    }

    // Bind platforms color and name
    if (reportState.platforms && reportState.platforms.length > 0) {
      platforms = reportState.platforms;
    }

    // Map parent cellData to child cellData
    const metricKeys = ['followers_total', 'followers_new', 'impressions', 'engagement', 'posted', 'top_post'];
    cellData = {};
    metricKeys.forEach((key, metricIdx) => {
      cellData[metricIdx] = [];
      platforms.forEach((_, platformIdx) => {
        if (reportState.cellData[key] && reportState.cellData[key][platformIdx] !== undefined) {
          cellData[metricIdx][platformIdx] = reportState.cellData[key][platformIdx];
        } else {
          cellData[metricIdx][platformIdx] = '';
        }
      });
    });
  }
}

function saveToParent() {
  if (isEmbedded) {
    // Sync metadata fields
    reportState.date = document.getElementById('rdate')?.value || '';
    reportState.preparedBy = document.getElementById('preparedby')?.value || '';
    reportState.focus = document.getElementById('focus')?.value || '';
    
    const winsInput = document.getElementById('overviewText');
    if (winsInput) {
      const winsVal = winsInput.textContent.trim();
      reportState.wins = (winsVal === placeholderText) ? '' : winsVal;
    }

    reportState.platforms = platforms;

    // Map child cellData back to parent cellData
    const metricKeys = ['followers_total', 'followers_new', 'impressions', 'engagement', 'posted', 'top_post'];
    metricKeys.forEach((key, metricIdx) => {
      reportState.cellData[key] = [];
      platforms.forEach((_, platformIdx) => {
        reportState.cellData[key][platformIdx] = (cellData[metricIdx] && cellData[metricIdx][platformIdx]) ? cellData[metricIdx][platformIdx] : '';
      });
    });

    window.parent.saveDatabase();
  }
}

/* ── Initialize Date ── */
function initDate() {
  const dateEl = document.getElementById('rdate');
  if (dateEl && !dateEl.value) {
    const options = { month: 'long', year: 'numeric' };
    dateEl.value = new Date().toLocaleDateString('en-US', options);
  }
}

/* ── Build Metrics Table ── */
function renderTable() {
  const headerRow = document.getElementById('platformHeaderRow');
  const tbody = document.getElementById('metricsTbody');

  if (!headerRow || !tbody) return;

  // 1. Clear dynamically added headers (keep the first "Metric" column)
  while (headerRow.children.length > 1) {
    headerRow.removeChild(headerRow.lastChild);
  }

  // 2. Clear table body
  tbody.innerHTML = '';

  // 3. Render header columns
  platforms.forEach((platform, idx) => {
    const th = document.createElement('th');
    th.style.position = 'relative';

    const tierHead = document.createElement('div');
    tierHead.className = 'tier-head';

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.backgroundColor = platform.color;

    tierHead.appendChild(dot);
    
    // Add spacer text
    const tierLabel = document.createElement('span');
    tierLabel.textContent = ' Platform';
    tierLabel.style.fontWeight = '600';
    tierLabel.style.fontSize = '10px';
    tierHead.appendChild(tierLabel);

    // Platform name input field
    const input = document.createElement('input');
    input.className = 'comp-name';
    input.type = 'text';
    input.placeholder = 'Platform Name';
    input.value = platform.name;
    input.addEventListener('input', function() {
      platforms[idx].name = input.value;
      saveToParent();
    });

    th.appendChild(tierHead);
    th.appendChild(input);

    // Delete column button (visible on hover)
    if (platforms.length > 1) {
      const delBtn = document.createElement('button');
      delBtn.className = 'delete-col-btn';
      delBtn.innerHTML = '×';
      delBtn.title = 'Remove platform';
      delBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        removePlatform(idx);
      });
      th.appendChild(delBtn);
    }

    headerRow.appendChild(th);
  });

  // 4. Render rows
  METRICS.forEach((metric, metricIdx) => {
    const tr = document.createElement('tr');

    // Label cell
    const labelTd = document.createElement('td');
    labelTd.className = 'row-label';
    labelTd.textContent = metric.label;
    tr.appendChild(labelTd);

    // Dynamic platform inputs
    platforms.forEach((platform, platformIdx) => {
      const td = document.createElement('td');
      const ta = document.createElement('textarea');
      ta.className = 'cell-input';
      ta.rows = 2;
      ta.placeholder = metric.placeholder;

      // Populate saved data if available
      if (cellData[metricIdx] && cellData[metricIdx][platformIdx] !== undefined) {
        ta.value = cellData[metricIdx][platformIdx];
      } else {
        ta.value = '';
      }

      // Save input value on type
      ta.addEventListener('input', function() {
        if (!cellData[metricIdx]) {
          cellData[metricIdx] = [];
        }
        cellData[metricIdx][platformIdx] = ta.value;
        saveToParent();
      });

      td.appendChild(ta);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

/* ── Add Social Platform Column ── */
function addPlatform() {
  const nextColor = COLORS[platforms.length % COLORS.length];
  platforms.push({ name: 'New Platform', color: nextColor });

  // Add empty values to cellData for the new platform
  METRICS.forEach((_, metricIdx) => {
    if (!cellData[metricIdx]) {
      cellData[metricIdx] = [];
    }
    cellData[metricIdx].push('');
  });

  renderTable();
  saveToParent();
  showBanner('success', 'Social platform added successfully!');
}

/* ── Remove Social Platform Column ── */
function removePlatform(idx) {
  if (platforms.length <= 1) {
    showBanner('error', 'Cannot remove the last platform.');
    return;
  }

  const pName = platforms[idx].name || 'Platform';
  if (!confirm(`Are you sure you want to remove "${pName}"?`)) return;

  platforms.splice(idx, 1);

  // Remove matching data from cellData
  METRICS.forEach((_, metricIdx) => {
    if (cellData[metricIdx]) {
      cellData[metricIdx].splice(idx, 1);
    }
  });

  renderTable();
  saveToParent();
  showBanner('success', `Platform "${pName}" was removed.`);
}

/* ── Publish current report as a new dated entry in the client's report
   archive, shown natively on their portal. This is a deliberate, separate
   action from autosave - saveToParent()/autosave just persists your
   in-progress draft to the hub, it does NOT touch the archive or the
   client-visible portal. Only clicking this button does. ── */
function publishToClientPortal() {
  if (!isEmbedded || !parentClient) {
    showBanner('error', 'This can only be published from inside the Hub.');
    return;
  }

  // Make sure reportState reflects whatever's currently in the form.
  saveToParent();

  if (!Array.isArray(parentClient.reportArchive)) {
    parentClient.reportArchive = [];
  }

  const snapshot = {
    id: 'report_' + Date.now(),
    date: reportState.date || '',
    preparedBy: reportState.preparedBy || '',
    focus: reportState.focus || '',
    wins: reportState.wins || '',
    platforms: JSON.parse(JSON.stringify(reportState.platforms || [])),
    cellData: JSON.parse(JSON.stringify(reportState.cellData || {})),
    publishedAt: new Date().toISOString()
  };

  // Newest first.
  parentClient.reportArchive.unshift(snapshot);
  window.parent.saveDatabase();

  showBanner('success', 'Report published! It now shows on the client\'s portal.');
}

/* ── Show Status Notification Banners ── */
function showBanner(type, message) {
  const successBanner = document.getElementById('banner-success');
  const errorBanner = document.getElementById('banner-error');

  if (!successBanner || !errorBanner) return;

  successBanner.style.display = 'none';
  errorBanner.style.display = 'none';

  const activeBanner = type === 'success' ? successBanner : errorBanner;
  activeBanner.querySelector('.banner-msg').textContent = message;
  activeBanner.style.display = 'flex';

  setTimeout(function() {
    activeBanner.style.display = 'none';
  }, 3500);
}

/* ── Reset/Clear Form Data ── */
function clearForm() {
  if (!confirm('Reset all fields and clear table metrics? This cannot be undone.')) return;

  // Reset text inputs
  document.getElementById('client').value = '';
  document.getElementById('preparedby').value = '';
  document.getElementById('focus').value = '';
  document.getElementById('rdate').value = '';

  // Initialize date to current
  initDate();

  // Reset overview text
  const overview = document.getElementById('overviewText');
  if (overview) {
    overview.textContent = placeholderText;
  }

  // Reset state to initial platforms & empty cells
  platforms = [
    { name: 'Instagram', color: '#534AB7' },
    { name: 'TikTok', color: '#1D9E75' },
    { name: 'YouTube', color: '#D85A30' }
  ];
  cellData = {};

  renderTable();
  saveToParent();
  showBanner('success', 'Form data cleared successfully.');
}

/* ── Print / Save as PDF ── */
function downloadPDF() {
  const container = document.querySelector('main.container') || document.querySelector('.page');
  if (!container) {
    window.print();
    return;
  }

  const pdfBtn = document.querySelector('.download-pdf-btn');
  const origText = pdfBtn ? pdfBtn.innerHTML : '';
  if (pdfBtn) {
    pdfBtn.disabled = true;
    pdfBtn.innerHTML = "⏳ Generating...";
  }

  // Hide UI elements
  const hides = container.querySelectorAll('.action-row, .controls-row, .prompt-toggle, .prompt-panel, button');
  hides.forEach(el => el.style.display = 'none');

  // The on-screen nav branding is a generic "REVITAL HUB" icon+wordmark
  // (see logo.js), not the actual client-facing logo used on every other
  // exported PDF in the Hub. Swap in the real logo just for the capture,
  // then restore the nav version afterward so the live tool is unaffected.
  const logoContainer = container.querySelector('.brand-logo-container');
  const origLogoHTML = logoContainer ? logoContainer.innerHTML : null;
  if (logoContainer) {
    logoContainer.innerHTML = '<img src="../logo.png" alt="Revital Hub" style="height: 40px; width: 115px; object-fit: contain;">';
  }

  // Replace inputs/textareas with their text values temporarily
  const inputs = container.querySelectorAll('input, textarea');
  const replacements = [];
  inputs.forEach(el => {
    const span = document.createElement('span');
    span.style.whiteSpace = 'pre-wrap';
    span.style.fontFamily = 'inherit';
    span.style.fontSize = 'inherit';
    span.style.display = 'inline-block';
    span.style.width = '100%';
    let val = (el.value || '').trim();
    if (!val) {
      span.innerHTML = '<span style="color: #94a3b8; font-style: italic;">N/A</span>';
    } else {
      span.innerHTML = val.replace(/\\n/g, '<br>');
    }
    
    // For date or company inputs at top
    if (el.type === 'date' || el.id === 'company') {
      span.style.fontWeight = 'bold';
    }

    el.parentNode.insertBefore(span, el);
    el.style.display = 'none';
    replacements.push({ el, span });
  });

  const opt = {
    margin:       0.5,
    filename:     'Competitor_Analysis.pdf',
    image:        { type: 'jpeg', quality: 0.92 },
    html2canvas:  { scale: 2, letterRendering: true, useCORS: true },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'landscape' }
  };
  
  // Wait a tick for DOM to update
  setTimeout(() => {
    if (typeof html2pdf === 'undefined') {
      alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
      if (pdfBtn) { pdfBtn.disabled = false; pdfBtn.innerHTML = origText || 'Download PDF'; }
      if (generateBtn) { generateBtn.disabled = false; generateBtn.innerHTML = 'Download PDF'; }
      return;
    }
    html2pdf().set(opt).from(container).save().then(() => {
      // Restore UI
      hides.forEach(el => el.style.display = '');
      replacements.forEach(r => {
        r.span.remove();
        r.el.style.display = '';
      });
      if (logoContainer) logoContainer.innerHTML = origLogoHTML;
      if (pdfBtn) {
        pdfBtn.disabled = false;
        pdfBtn.innerHTML = origText;
      }
    });
  }, 200);
}


/* ── Event Listeners ── */
document.addEventListener('DOMContentLoaded', function() {
  if (isEmbedded) {
    loadFromParent();
  } else {
    initDate();
  }
  renderTable();

  // Overview placeholder logic
  const overviewText = document.getElementById('overviewText');
  if (overviewText) {
    overviewText.addEventListener('focus', function() {
      if (overviewText.textContent.trim() === placeholderText) {
        overviewText.textContent = '';
      }
    });

    overviewText.addEventListener('blur', function() {
      if (overviewText.textContent.trim() === '') {
        overviewText.textContent = placeholderText;
      }
    });

    overviewText.addEventListener('input', saveToParent);
  }

  // Hook metadata input listeners
  const dateInput = document.getElementById('rdate');
  if (dateInput) {
    dateInput.addEventListener('input', saveToParent);
  }
  const preparedInput = document.getElementById('preparedby');
  if (preparedInput) {
    preparedInput.addEventListener('input', saveToParent);
  }
  const focusInput = document.getElementById('focus');
  if (focusInput) {
    focusInput.addEventListener('input', saveToParent);
  }
});