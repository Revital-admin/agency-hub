
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
  { space: 'CRM', list: 'Deals', segments: [
    { type: 'text', label: 'Company Name', placeholder: 'e.g. Acme Wellness' },
    { type: 'text', label: 'Services', placeholder: 'e.g. Paid Social + SEO' },
  ], example: 'Acme Wellness — Paid Social + SEO' },
  { space: 'CRM', list: 'Contacts', segments: [
    { type: 'text', label: 'Full Name', placeholder: 'e.g. Jane Smith' },
    { type: 'text', label: 'Company', placeholder: 'e.g. Acme Wellness' },
  ], example: 'Jane Smith — Acme Wellness' },
  { space: 'CRM', list: 'Companies', segments: [
    { type: 'text', label: 'Company Name', placeholder: 'e.g. Acme Wellness' },
    { type: 'text', label: 'Industry', placeholder: 'e.g. Health & Fitness' },
  ], example: 'Acme Wellness — Health & Fitness' },

  // ── Growth Space - Pipeline Management ──
  { space: 'Growth', list: 'Leads List', segments: [
    { type: 'text', label: 'Company Name', placeholder: 'e.g. Black Bird' },
    { type: 'text', label: 'Industry', placeholder: 'e.g. Restaurant' },
  ], example: 'Black Bird — Restaurant' },
  { space: 'Growth', list: 'Sales Pipeline', segments: [
    { type: 'text', label: 'Company Name', placeholder: 'e.g. Acme Wellness' },
    { type: 'text', label: 'Services Interested In', placeholder: 'e.g. Paid Social + SEO' },
  ], example: 'Acme Wellness — Paid Social + SEO' },
  { space: 'Growth', list: 'Proposals & Quotes', segments: [
    { type: 'text', label: 'Company Name', placeholder: 'e.g. Acme Wellness' },
    { type: 'fixed', value: 'Proposal' },
    { type: 'month', label: 'Month Year' },
  ], example: 'Acme Wellness — Proposal — July 2026' },
  { space: 'Growth', list: 'Follow-Up Tasks', segments: [
    { type: 'text', label: 'Company Name', placeholder: 'e.g. Acme Wellness' },
    { type: 'text', label: 'Follow-Up Type', placeholder: 'e.g. Follow-Up #1' },
    { type: 'date', label: 'Date' },
  ], example: 'Acme Wellness — Follow-Up #1 — July 8' },

  // ── Growth Space - Closing & Onboarding Handoff ──
  { space: 'Growth', list: 'Contracts Pending Signature', segments: [
    { type: 'text', label: 'Company Name', placeholder: 'e.g. Acme Wellness' },
    { type: 'fixed', value: 'Contract' },
    { type: 'month', label: 'Month Year' },
  ], example: 'Acme Wellness — Contract — July 2026' },
  { space: 'Growth', list: 'Onboarding Handoff', segments: [
    { type: 'text', label: 'Company Name', placeholder: 'e.g. Acme Wellness' },
    { type: 'fixed', value: 'Onboarding Handoff' },
    { type: 'month', label: 'Month Year' },
  ], example: 'Acme Wellness — Onboarding Handoff — July 2026' },

  // ── Growth Space - Content & Social ──
  { space: 'Growth', list: 'Revital Social Media Calendar', segments: [
    { type: 'text', label: 'Platform + Format', placeholder: 'e.g. IG Reel' },
    { type: 'text', label: 'Topic', placeholder: 'e.g. 3 Content Mistakes to Avoid' },
    { type: 'date', label: 'Date' },
  ], example: 'IG Reel — 3 Content Mistakes to Avoid — July 5' },
  { space: 'Growth', list: 'Content Ideas', segments: [
    { type: 'text', label: 'Content Type', placeholder: 'e.g. Reel' },
    { type: 'text', label: 'Topic or Hook', placeholder: 'e.g. 5 Signs You Need a Rebrand' },
  ], example: 'Reel — 5 Signs You Need a Rebrand' },
  { space: 'Growth', list: 'Blog & Thought Leadership', segments: [
    { type: 'text', label: 'Content Type', placeholder: 'e.g. Blog Post' },
    { type: 'text', label: 'Title', placeholder: 'e.g. Why SEO Still Matters' },
    { type: 'month', label: 'Month Year' },
  ], example: 'Blog Post — Why SEO Still Matters — July 2026' },
  { space: 'Growth', list: 'Video & Reels Production', segments: [
    { type: 'text', label: 'Video Type', placeholder: 'e.g. Reel' },
    { type: 'text', label: 'Title', placeholder: 'e.g. 3 Content Mistakes to Avoid' },
    { type: 'date', label: 'Date' },
  ], example: 'Reel — 3 Content Mistakes to Avoid — July 5' },

  // ── Growth Space - Lead Generation ──
  { space: 'Growth', list: 'Lead Magnets & Freebies', segments: [
    { type: 'text', label: 'Type', placeholder: 'e.g. Free Audit' },
    { type: 'text', label: 'Name', placeholder: 'e.g. Social Media Audit' },
    { type: 'month', label: 'Launch Month Year' },
  ], example: 'Free Audit — Social Media Audit — July 2026' },
  { space: 'Growth', list: 'Email Marketing Campaigns', segments: [
    { type: 'text', label: 'Email Type', placeholder: 'e.g. Newsletter' },
    { type: 'text', label: 'Subject or Theme', placeholder: 'e.g. Marketing Tips' },
    { type: 'month', label: 'Send Month Year' },
  ], example: 'Newsletter — Marketing Tips — July 2026' },
  { space: 'Growth', list: 'Paid Ads — Company Campaigns', segments: [
    { type: 'text', label: 'Platform', placeholder: 'e.g. Meta Ads' },
    { type: 'text', label: 'Objective', placeholder: 'e.g. Lead Gen' },
    { type: 'text', label: 'Campaign Theme', placeholder: 'e.g. Free Audit Offer' },
    { type: 'month', label: 'Month Year' },
  ], example: 'Meta Ads — Lead Gen — Free Audit Offer — July 2026' },

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
  { space: 'Growth', list: 'Agency Partners', segments: [
    { type: 'text', label: 'Name', placeholder: 'e.g. Jane Smith' },
    { type: 'text', label: 'Company', placeholder: 'e.g. Creative Co' },
    { type: 'text', label: 'Relationship Type', placeholder: 'e.g. Agency Partner' },
  ], example: 'Jane Smith — Creative Co — Agency Partner' },
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
        const inputType = seg.type === 'month' ? 'month' : seg.type === 'date' ? 'date' : seg.type === 'roundnum' ? 'number' : 'text';
        const placeholder = seg.placeholder ? ` placeholder="${seg.placeholder}"` : '';
        return `<div class="form-group">
          <label for="seg-${i}">${seg.label}</label>
          <input type="${inputType}" id="seg-${i}" data-seg-index="${i}"${placeholder}>
        </div>`;
      }).join('');

    dynamicFields.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', generateName);
    });

    generateName();
  }

  function generateName() {
    if (!currentTemplate) return;
    const parts = currentTemplate.segments.map((seg, i) => {
      if (seg.type === 'fixed') return { text: seg.value, filled: true };
      const input = dynamicFields.querySelector(`[data-seg-index="${i}"]`);
      const raw = input ? input.value : '';
      if (seg.type === 'month') {
        const formatted = formatMonthValue(raw);
        return formatted ? { text: formatted, filled: true } : { text: `[${seg.label}]`, filled: false };
      }
      if (seg.type === 'date') {
        const formatted = formatDateValue(raw);
        return formatted ? { text: formatted, filled: true } : { text: `[${seg.label}]`, filled: false };
      }
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
