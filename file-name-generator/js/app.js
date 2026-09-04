
// Every convention below is transcribed directly from the file naming
// guidance that already exists across the SOP Wiki (Service Delivery
// Standards, Content Production SOP, SOPs & Internal Processes, Content
// Creation Process, Monthly Reporting SOP) - see the "Client Folder Setup
// & Naming" SOP's Rule 3 for a summary of where each one comes from. If
// any of those source SOPs change their convention, this list needs to
// change with it (there's no live link between the two - the SOP wiki is
// free-text HTML, not structured data this tool can read at runtime).
// Same pattern as task-name-generator/js/app.js for Section 23.
//
// Segment types:
//   text     - free-text input
//   month    - <input type="month">, formatted to "Month YYYY" (e.g. "July 2026")
//   monthday - <input type="date">, formatted to "Month D" (dateStyle:'long',
//              e.g. "July 5") or "MonD" with no space (dateStyle:'short',
//              e.g. "Jul5") - year is intentionally dropped either way,
//              matching every source SOP's own examples.
//   fulldate - <input type="date">, formatted to full "YYYY-MM-DD" - used
//              only by the versioned video/ad-creative convention, which
//              is the one place a source SOP's example includes a year.
//   version  - <input type="number">, formatted to "v{n}"
//   fixed    - not a field at all, a literal word/phrase spliced in as-is
const FILE_NAME_CONVENTIONS = [
  {
    key: 'standard',
    label: 'Standard Deliverable (most files)',
    source: 'Service Delivery Standards / Content Production SOP / SOPs & Internal Processes',
    note: 'Use this for the vast majority of client deliverables - anything going into Assets & Brand Files or Final Deliverables that isn’t video/paid-ad creative or a report PDF.',
    joiner: '_',
    segments: [
      { type: 'text', label: 'Client Name', placeholder: 'e.g. AcmeWellness (no spaces)' },
      { type: 'text', label: 'Content Type', placeholder: 'e.g. IGPost' },
      { type: 'monthday', dateStyle: 'short', label: 'Date' },
    ],
    example: 'AcmeWellness_IGPost_Jun15',
  },
  {
    key: 'versioned',
    label: 'Video / Paid Ad Creative (versioned)',
    source: 'Content Creation Process',
    note: 'Use this specifically for video and paid ad creative, where a version number and the exact date both matter.',
    joiner: '_',
    segments: [
      { type: 'text', label: 'Client Name', placeholder: 'e.g. AcmeWellness (no spaces)' },
      { type: 'text', label: 'Platform', placeholder: 'e.g. IG' },
      { type: 'text', label: 'Content Type', placeholder: 'e.g. Reel' },
      { type: 'fulldate', label: 'Date' },
      { type: 'version', label: 'Version', placeholder: '1' },
    ],
    example: 'AcmeWellness_IG_Reel_2026-07-15_v2',
  },
  {
    key: 'report',
    label: 'Client Report PDF',
    source: 'Monthly Reporting SOP',
    note: 'Use this for client-facing report PDFs sent via email.',
    joiner: ' — ',
    suffix: '.pdf',
    segments: [
      { type: 'text', label: 'Client Name', placeholder: 'e.g. Acme Wellness' },
      { type: 'text', label: 'Report Type', placeholder: 'e.g. Monthly Report' },
      { type: 'month', label: 'Month Year' },
    ],
    example: 'Acme Wellness — Monthly Report — July 2026.pdf',
  },
];

document.addEventListener('DOMContentLoaded', () => {
  const el = id => document.getElementById(id);
  const conventionSelect = el('conventionSelect');
  const formatHint = el('formatHint');
  const exampleHint = el('exampleHint');
  const conventionNote = el('conventionNote');
  const dynamicFields = el('dynamicFields');
  const fileNameOutput = el('fileNameOutput');
  const copyBtn = el('copyBtn');

  let currentTemplate = null;
  let currentPlainText = '';

  // Same native-input feature-detection as Task Name Generator - Safari
  // (desktop) and Firefox don't support type="month" at all, silently
  // falling back to a plain text box with no picker and no format
  // enforcement. Swap in plain <select> dropdowns for browsers that fail
  // the check instead, so a malformed value can never get copied out.
  function supportsInputType(type) {
    const test = document.createElement('input');
    test.setAttribute('type', type);
    return test.type === type;
  }
  const MONTH_INPUT_SUPPORTED = supportsInputType('month');
  const DATE_INPUT_SUPPORTED = supportsInputType('date');

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function monthOptionsHtml() {
    return '<option value="">Month</option>' + MONTH_NAMES.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');
  }
  function yearOptionsHtml() {
    const current = new Date().getFullYear();
    const years = [current - 1, current, current + 1, current + 2];
    return '<option value="">Year</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
  }
  function dayOptionsHtml() {
    let opts = '<option value="">Day</option>';
    for (let d = 1; d <= 31; d++) opts += `<option value="${d}">${d}</option>`;
    return opts;
  }

  // ── monthday: Month Day, year intentionally dropped ──
  function formatMonthDayValue(v, style) {
    if (!v) return null;
    const [y, m, d] = v.split('-').map(Number);
    if (!y || !m || !d) return null;
    if (style === 'short') return `${MONTH_ABBR[m - 1]}${d}`;
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  }
  function formatMonthDayParts(m, d, style) {
    if (!m || !d) return null;
    m = Number(m); d = Number(d);
    if (style === 'short') return `${MONTH_ABBR[m - 1]}${d}`;
    return new Date(2000, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  }

  // ── fulldate: full YYYY-MM-DD, year required ──
  function formatFullDateValue(v) {
    if (!v) return null;
    const [y, m, d] = v.split('-').map(Number);
    if (!y || !m || !d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function formatFullDateParts(m, d, y) {
    if (!m || !d || !y) return null;
    return `${y}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
  }

  // ── month: Month YYYY ──
  function formatMonthValue(v) {
    if (!v) return null;
    const [y, m] = v.split('-').map(Number);
    if (!y || !m) return null;
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  function formatMonthYearParts(m, y) {
    if (!m || !y) return null;
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function populateConventionSelect() {
    conventionSelect.innerHTML = FILE_NAME_CONVENTIONS.map((tpl, idx) => `<option value="${idx}">${tpl.label}</option>`).join('');
    loadTemplate(0);
  }

  function segmentFormatLabel(seg) {
    if (seg.type === 'fixed') return seg.value;
    return `[${seg.label}]`;
  }

  function loadTemplate(idx) {
    currentTemplate = FILE_NAME_CONVENTIONS[idx];
    const formatStr = currentTemplate.segments.map(segmentFormatLabel).join(currentTemplate.joiner) + (currentTemplate.suffix || '');
    formatHint.textContent = `Format: ${formatStr}`;
    exampleHint.textContent = `Example: ${currentTemplate.example}`;
    conventionNote.textContent = `${currentTemplate.note} (Source: ${currentTemplate.source})`;

    dynamicFields.innerHTML = currentTemplate.segments
      .map((seg, i) => {
        if (seg.type === 'fixed') return '';

        if (seg.type === 'month') {
          if (MONTH_INPUT_SUPPORTED) {
            return `<div class="form-group">
              <label for="seg-${i}">${seg.label}</label>
              <input type="month" id="seg-${i}" data-seg-index="${i}" data-native="month">
            </div>`;
          }
          return `<div class="form-group">
            <label for="seg-${i}-month">${seg.label}</label>
            <div class="month-year-row">
              <select id="seg-${i}-month" data-seg-index="${i}" data-part="month">${monthOptionsHtml()}</select>
              <select id="seg-${i}-year" data-seg-index="${i}" data-part="year">${yearOptionsHtml()}</select>
            </div>
          </div>`;
        }

        if (seg.type === 'monthday') {
          if (DATE_INPUT_SUPPORTED) {
            return `<div class="form-group">
              <label for="seg-${i}">${seg.label}</label>
              <input type="date" id="seg-${i}" data-seg-index="${i}" data-native="date">
            </div>`;
          }
          return `<div class="form-group">
            <label for="seg-${i}-month">${seg.label}</label>
            <div class="month-year-row">
              <select id="seg-${i}-month" data-seg-index="${i}" data-part="month">${monthOptionsHtml()}</select>
              <select id="seg-${i}-day" data-seg-index="${i}" data-part="day">${dayOptionsHtml()}</select>
            </div>
          </div>`;
        }

        if (seg.type === 'fulldate') {
          if (DATE_INPUT_SUPPORTED) {
            return `<div class="form-group">
              <label for="seg-${i}">${seg.label}</label>
              <input type="date" id="seg-${i}" data-seg-index="${i}" data-native="fulldate">
            </div>`;
          }
          return `<div class="form-group">
            <label for="seg-${i}-month">${seg.label}</label>
            <div class="month-year-row">
              <select id="seg-${i}-month" data-seg-index="${i}" data-part="month">${monthOptionsHtml()}</select>
              <select id="seg-${i}-day" data-seg-index="${i}" data-part="day">${dayOptionsHtml()}</select>
              <select id="seg-${i}-year" data-seg-index="${i}" data-part="year">${yearOptionsHtml()}</select>
            </div>
          </div>`;
        }

        const inputType = seg.type === 'version' ? 'number' : 'text';
        const placeholder = seg.placeholder ? ` placeholder="${seg.placeholder}"` : '';
        return `<div class="form-group">
          <label for="seg-${i}">${seg.label}</label>
          <input type="${inputType}" id="seg-${i}" data-seg-index="${i}"${placeholder}>
        </div>`;
      }).join('');

    dynamicFields.querySelectorAll('input, select').forEach(field => {
      field.addEventListener('input', generateName);
      field.addEventListener('change', generateName);
    });

    generateName();
  }

  function generateName() {
    if (!currentTemplate) return;
    const parts = currentTemplate.segments.map((seg, i) => {
      if (seg.type === 'fixed') return { text: seg.value, filled: true };

      if (seg.type === 'month') {
        if (MONTH_INPUT_SUPPORTED) {
          const input = dynamicFields.querySelector(`[data-seg-index="${i}"][data-native="month"]`);
          const formatted = formatMonthValue(input ? input.value : '');
          return formatted ? { text: formatted, filled: true } : { text: `[${seg.label}]`, filled: false };
        }
        const monthSel = dynamicFields.querySelector(`[data-seg-index="${i}"][data-part="month"]`);
        const yearSel = dynamicFields.querySelector(`[data-seg-index="${i}"][data-part="year"]`);
        const formatted = formatMonthYearParts(monthSel ? monthSel.value : '', yearSel ? yearSel.value : '');
        return formatted ? { text: formatted, filled: true } : { text: `[${seg.label}]`, filled: false };
      }

      if (seg.type === 'monthday') {
        if (DATE_INPUT_SUPPORTED) {
          const input = dynamicFields.querySelector(`[data-seg-index="${i}"][data-native="date"]`);
          const formatted = formatMonthDayValue(input ? input.value : '', seg.dateStyle);
          return formatted ? { text: formatted, filled: true } : { text: `[${seg.label}]`, filled: false };
        }
        const monthSel = dynamicFields.querySelector(`[data-seg-index="${i}"][data-part="month"]`);
        const daySel = dynamicFields.querySelector(`[data-seg-index="${i}"][data-part="day"]`);
        const formatted = formatMonthDayParts(monthSel ? monthSel.value : '', daySel ? daySel.value : '', seg.dateStyle);
        return formatted ? { text: formatted, filled: true } : { text: `[${seg.label}]`, filled: false };
      }

      if (seg.type === 'fulldate') {
        if (DATE_INPUT_SUPPORTED) {
          const input = dynamicFields.querySelector(`[data-seg-index="${i}"][data-native="fulldate"]`);
          const formatted = formatFullDateValue(input ? input.value : '');
          return formatted ? { text: formatted, filled: true } : { text: `[${seg.label}]`, filled: false };
        }
        const monthSel = dynamicFields.querySelector(`[data-seg-index="${i}"][data-part="month"]`);
        const daySel = dynamicFields.querySelector(`[data-seg-index="${i}"][data-part="day"]`);
        const yearSel = dynamicFields.querySelector(`[data-seg-index="${i}"][data-part="year"]`);
        const formatted = formatFullDateParts(monthSel ? monthSel.value : '', daySel ? daySel.value : '', yearSel ? yearSel.value : '');
        return formatted ? { text: formatted, filled: true } : { text: `[${seg.label}]`, filled: false };
      }

      const input = dynamicFields.querySelector(`[data-seg-index="${i}"]`);
      const raw = input ? input.value : '';
      if (seg.type === 'version') {
        return raw ? { text: `v${raw}`, filled: true } : { text: `[${seg.label}]`, filled: false };
      }
      return raw.trim() ? { text: raw.trim(), filled: true } : { text: `[${seg.label}]`, filled: false };
    });

    const joiner = currentTemplate.joiner;
    currentPlainText = parts.map(p => p.text).join(joiner) + (currentTemplate.suffix || '');

    const joinerHtml = `<span style="color: var(--color-text-muted);">${escapeHtml(joiner)}</span>`;
    fileNameOutput.innerHTML = parts
      .map(p => p.filled ? escapeHtml(p.text) : `<span class="placeholder-segment">${escapeHtml(p.text)}</span>`)
      .join(joinerHtml) + (currentTemplate.suffix ? escapeHtml(currentTemplate.suffix) : '');
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  conventionSelect.addEventListener('change', () => loadTemplate(parseInt(conventionSelect.value, 10)));
  el('clearFieldsBtn').addEventListener('click', () => {
    dynamicFields.querySelectorAll('input').forEach(input => { input.value = ''; });
    dynamicFields.querySelectorAll('select').forEach(select => { select.value = ''; });
    generateName();
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentPlainText).then(() => {
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
      copyBtn.style.background = '#10b981';
      setTimeout(() => {
        copyBtn.innerHTML = originalText;
        copyBtn.style.background = '';
      }, 2000);
    });
  });

  populateConventionSelect();
});
