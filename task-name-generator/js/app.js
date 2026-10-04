
// Every format below is transcribed directly from SOP Wiki Section 23
// (Task Naming Conventions) - see sop-wiki's "Custom Field Options
// Reference" doc for the source of truth. If that doc changes, this list
// needs to change with it (there's no live link between the two - the
// SOP wiki is free-text markdown, not structured data this tool can read
// at runtime).
//
// Segment types:
//   text     - free-text input
//   month    - <input type="month">, formatted to "Month YYYY" (e.g. "July 2026")
//   date     - <input type="date">, formatted to "Month D" (e.g. "July 5")
//   roundnum - <input type="number">, formatted to "Round N"
//   fixed    - not a field at all, a literal word/phrase spliced in as-is
// Oct/Nov 2026: templates for lists archived in ClickUp's Hub/HubSpot
// consolidation (old CRM space, Growth content/lead-gen/partner folders, empty
// sales-pipeline lists) were removed - only lists still in use remain.
const TASK_NAME_TEMPLATES = [
  // ── Delivery Space ──
  { space: 'Delivery', list: 'Campaign Briefs', segments: [
    { type: 'text', label: 'Service', placeholder: 'e.g. Paid Social' },
    { type: 'text', label: 'Campaign', placeholder: 'e.g. Summer Sale' },
    { type: 'month', label: 'Month Year' },
  ], example: 'Paid Social — Summer Sale — July 2026' },
  { space: 'Delivery', list: 'Content Calendar', segments: [
    { type: 'text', label: 'Platform + Format', placeholder: 'e.g. IG Reel' },
    { type: 'text', label: 'Topic', placeholder: 'e.g. 3 Content Mistakes to Avoid' },
    { type: 'date', label: 'Date' },
  ], example: 'IG Reel — 3 Content Mistakes to Avoid — July 5' },
  { space: 'Delivery', list: 'Active Projects & Tasks', segments: [
    { type: 'text', label: 'Service', placeholder: 'e.g. Website Redesign' },
    { type: 'text', label: 'Project / Client', placeholder: 'e.g. Acme Wellness' },
    { type: 'month', label: 'Month Year' },
  ], example: 'Website Redesign — Acme Wellness — July 2026' },
  { space: 'Delivery', list: 'Recurring Deliverables', segments: [
    { type: 'text', label: 'Recurring Type', placeholder: 'e.g. Monthly Performance Report' },
    { type: 'text', label: 'Client Name', placeholder: 'e.g. Acme Wellness' },
  ], example: 'Monthly Performance Report — Acme Wellness' },
  { space: 'Delivery', list: 'Client Feedback & Revisions', segments: [
    { type: 'fixed', value: 'Revision' },
    { type: 'text', label: 'Deliverable Name', placeholder: 'e.g. IG Reel July 5' },
    { type: 'roundnum', label: 'Round #', placeholder: '1' },
  ], example: 'Revision — IG Reel July 5 — Round 1' },
  { space: 'Delivery', list: 'Assets & Brand Files', segments: [
    { type: 'text', label: 'File Type', placeholder: 'e.g. Logo' },
    { type: 'text', label: 'Description', placeholder: 'e.g. Primary - Full Color' },
    { type: 'text', label: 'Date or Version', placeholder: 'e.g. PNG - June 2026' },
  ], example: 'Logo — Primary - Full Color — PNG - June 2026' },
  { space: 'Delivery', list: 'Reports & Analytics', segments: [
    { type: 'text', label: 'Report Type', placeholder: 'e.g. Monthly Report' },
    { type: 'month', label: 'Month Year' },
  ], example: 'Monthly Report — June 2026' },
  { space: 'Delivery', list: 'Completed Work', segments: [
    { type: 'text', label: 'Platform + Format', placeholder: 'e.g. IG Reel' },
    { type: 'text', label: 'Description', placeholder: 'e.g. Summer Sale' },
    { type: 'date', label: 'Date' },
  ], example: 'IG Reel — Summer Sale — July 5' },
  // Note: no separate "Video & Reels Production" list exists under Delivery in
  // the live ClickUp workspace - only Growth > Content & Social has one (see
  // below). An earlier version of this file duplicated it here by mistake.

  // ── CRM Space ──

  // ── Growth Space - Pipeline Management ──
  { space: 'Growth', list: 'Leads List', segments: [
    { type: 'text', label: 'Company Name', placeholder: 'e.g. Black Bird' },
    { type: 'text', label: 'Industry', placeholder: 'e.g. Restaurant' },
  ], example: 'Black Bird — Restaurant' },
  { space: 'Growth', list: 'Follow-Up Tasks', segments: [
    { type: 'text', label: 'Company Name', placeholder: 'e.g. Acme Wellness' },
    { type: 'text', label: 'Follow-Up Type', placeholder: 'e.g. Follow-Up #1' },
    { type: 'date', label: 'Date' },
  ], example: 'Acme Wellness — Follow-Up #1 — July 8' },

  // ── Growth Space - Closing & Onboarding Handoff ──

  // ── Growth Space - Content & Social ──

  // ── Growth Space - Lead Generation ──

  // ── Growth Space - Other Folders ──
  // Note: the SOP doc's old "Lead Magnets" and "Monthly Business Metrics"
  // entries here have been dropped - "Lead Magnets" was a duplicate
  // reference to the real "Lead Magnets & Freebies" list above (same list,
  // two names in the doc), and no ClickUp list called "Monthly Business
  // Metrics" actually exists (that reporting is tracked via the Monthly
  // Reporting SOP, not a dedicated task list).
  { space: 'Operations', list: 'Testimonials & Reviews', segments: [
    { type: 'text', label: 'Client Name', placeholder: 'e.g. Acme Wellness' },
    { type: 'text', label: 'Platform', placeholder: 'e.g. Google' },
    { type: 'month', label: 'Month Year' },
  ], example: 'Acme Wellness — Google — July 2026' },
];

document.addEventListener('DOMContentLoaded', () => {
  const el = id => document.getElementById(id);
  const spaceSelect = el('spaceSelect');
  const listSelect = el('listSelect');
  const formatHint = el('formatHint');
  const exampleHint = el('exampleHint');
  const dynamicFields = el('dynamicFields');
  const taskNameOutput = el('taskNameOutput');
  const copyBtn = el('copyBtn');

  let currentTemplate = null;
  let currentPlainText = '';

  // Month/Year and Month/Day fields render two different ways depending on
  // whether the browser actually supports native <input type="month"> /
  // <input type="date"> pickers. Chrome/Edge support type="month" fine, so
  // they keep the original native picker. Safari (desktop) and Firefox do
  // not support type="month" at all - it silently falls back to a plain
  // text box with no picker and no format enforcement, so typing a month
  // there produced a value the old parser couldn't read and the segment
  // silently stayed as "[Month Year]" - that's what got copied into
  // ClickUp, and what Juan hit. For browsers that fail the feature check,
  // we swap in plain <select> dropdowns instead, which behave identically
  // everywhere and can't hold a malformed value.
  function supportsInputType(type) {
    const test = document.createElement('input');
    test.setAttribute('type', type);
    return test.type === type;
  }
  const MONTH_INPUT_SUPPORTED = supportsInputType('month');
  const DATE_INPUT_SUPPORTED = supportsInputType('date');

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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
  // Native-input parsers (Chrome/Edge) - value comes as "YYYY-MM" / "YYYY-MM-DD".
  function formatMonthValue(v) {
    if (!v) return null;
    const [y, m] = v.split('-').map(Number);
    if (!y || !m) return null;
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  function formatDateValue(v) {
    if (!v) return null;
    const [y, m, d] = v.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  }
  // Dropdown-fallback parsers (Safari/Firefox) - value comes as two separate selects.
  function formatMonthYear(m, y) {
    if (!m || !y) return null;
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  function formatMonthDay(m, d) {
    if (!m || !d) return null;
    return new Date(2000, Number(m) - 1, Number(d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  }

  function populateListSelect() {
    const space = spaceSelect.value;
    const opts = TASK_NAME_TEMPLATES
      .map((tpl, idx) => ({ idx, tpl }))
      .filter(({ tpl }) => tpl.space === space);
    listSelect.innerHTML = opts.map(({ idx, tpl }) => `<option value="${idx}">${tpl.list}</option>`).join('');
    loadTemplate(parseInt(listSelect.value, 10));
  }

  function loadTemplate(idx) {
    currentTemplate = TASK_NAME_TEMPLATES[idx];
    const formatStr = currentTemplate.segments
      .map(seg => seg.type === 'fixed' ? seg.value : `[${seg.label}]`)
      .join(' — ');
    formatHint.textContent = `Format: ${formatStr}`;
    exampleHint.textContent = `Example: ${currentTemplate.example}`;

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
        if (seg.type === 'date') {
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
        const inputType = seg.type === 'roundnum' ? 'number' : 'text';
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
        const formatted = formatMonthYear(monthSel ? monthSel.value : '', yearSel ? yearSel.value : '');
        return formatted ? { text: formatted, filled: true } : { text: `[${seg.label}]`, filled: false };
      }
      if (seg.type === 'date') {
        if (DATE_INPUT_SUPPORTED) {
          const input = dynamicFields.querySelector(`[data-seg-index="${i}"][data-native="date"]`);
          const formatted = formatDateValue(input ? input.value : '');
          return formatted ? { text: formatted, filled: true } : { text: `[${seg.label}]`, filled: false };
        }
        const monthSel = dynamicFields.querySelector(`[data-seg-index="${i}"][data-part="month"]`);
        const daySel = dynamicFields.querySelector(`[data-seg-index="${i}"][data-part="day"]`);
        const formatted = formatMonthDay(monthSel ? monthSel.value : '', daySel ? daySel.value : '');
        return formatted ? { text: formatted, filled: true } : { text: `[${seg.label}]`, filled: false };
      }
      const input = dynamicFields.querySelector(`[data-seg-index="${i}"]`);
      const raw = input ? input.value : '';
      if (seg.type === 'roundnum') {
        return raw ? { text: `Round ${raw}`, filled: true } : { text: `[${seg.label}]`, filled: false };
      }
      return raw.trim() ? { text: raw.trim(), filled: true } : { text: `[${seg.label}]`, filled: false };
    });

    currentPlainText = parts.map(p => p.text).join(' — ');
    taskNameOutput.innerHTML = parts
      .map(p => p.filled ? escapeHtml(p.text) : `<span class="placeholder-segment">${escapeHtml(p.text)}</span>`)
      .join(' <span style="color: var(--color-text-muted);">—</span> ');
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  spaceSelect.addEventListener('change', populateListSelect);
  listSelect.addEventListener('change', () => loadTemplate(parseInt(listSelect.value, 10)));
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

  populateListSelect();
});
