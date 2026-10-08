/* ============================================================
   shared/research-assist.js - "Copy research prompt" + "Paste research"
   for the competitor-analysis tools (social + website).

   How it works (no network, no API - copy/paste only):
     1. Builds a prompt from what is already on the page (company, niche,
        competitor names / handles / sites) plus a fixed answer template.
     2. The user pastes that prompt into Claude with their screenshots.
     3. The user pastes Claude's reply into the box here; this file parses the
        labelled blocks and fills the same inputs the user would type into.
        Every fill dispatches a real 'input' event, so each tool's own
        listeners save it exactly as if it had been typed.

   Usage (from the tool's own app.js, after its UI is built):
     RevitalResearchAssist.init({
       kind: 'social' | 'website',
       mount: element to render the box into,
       reportFields: { 'LABEL': 'elementId', ... }   // optional extras
     });
   Depends on the tool's global TABLE_ROWS (key / label) and its DOM
   (.comp-name/.comp-handle/.comp-site/.comp-posts, tbody#compTableBody,
   #ta-s/#ta-w/#ta-o/#ta-t, .insight-text, and the *Field textareas).
   ============================================================ */
(function (global) {
  'use strict';

  function norm(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  // list-style fields keep one item per line; everything else is joined into one paragraph
  var LIST_ROWS = { strengths: 1, gaps: 1 };
  var LIST_REPORT = { PRIORITIES: 1, QA: 1, TARGETS: 1, 'CONTENT SYSTEM': 1, PLAN: 1, 'SWOT STRENGTHS': 1, 'SWOT WEAKNESSES': 1, 'SWOT OPPORTUNITIES': 1, 'SWOT THREATS': 1 };

  // Report-level labels -> how to find the element
  function reportTargets(kind) {
    var t = {
      'CORE FINDING':     { sel: '.insight-text', editable: true },
      'OBJECTIVE':        { id: 'objectiveField' },
      'PRIORITIES':       { id: 'prioritiesField' },
      'POSITIONING':      { id: 'positioningField' },
      'QA':               { id: 'qaField' },
      'TARGETS':          { id: 'targetsField' },
      'DIRECTION':        { id: 'directionField' },
      'MESSAGE':          { id: 'messageField' },
      'PLAN':             { id: 'planField' },
      'EVIDENCE':         { id: 'evidenceField' },
      'SWOT STRENGTHS':   { id: 'ta-s' },
      'SWOT WEAKNESSES':  { id: 'ta-w' },
      'SWOT OPPORTUNITIES': { id: 'ta-o' },
      'SWOT THREATS':     { id: 'ta-t' },
      'SWOT IMPLICATION': { id: 'swotImplicationField' },
      'BOTTOM LINE':      { id: 'conclusionField' }
    };
    if (kind === 'social') t['CONTENT SYSTEM'] = { id: 'contentSystemField' };
    return t;
  }

  // Label shown in the prompt/template for each table row (parser accepts the same text, normalised)
  function rowLabel(row) {
    if (row.key === 'takeaway') return 'TAKEAWAY';
    if (row.key === 'gaps') return 'GAPS';
    return row.label.toUpperCase();
  }
  // extra aliases the parser accepts
  var ROW_ALIASES = { 'GAPS OPPORTUNITIES': 'gaps', 'KEY TAKEAWAY FOR US': 'takeaway', 'KEY TAKEAWAY': 'takeaway', 'VISIBLE EVIDENCE': 'visible-evidence', 'VISIBLE ENGAGEMENT': 'visible-evidence', 'SOURCE CAPTURE NOTES': 'source' };

  function val(sel) { var el = document.querySelector(sel); return el ? (el.value || '').trim() : ''; }
  function nth(sel, i) { var els = document.querySelectorAll(sel); return els[i] ? (els[i].value || '').trim() : ''; }

  /* ---------------- prompt ---------------- */
  function buildPrompt(kind) {
    var rows = global.TABLE_ROWS || [];
    var company = val('#company') || 'the client';
    var niche = val('#niche'), date = val('#date');
    var social = kind === 'social';
    var out = [];
    out.push('You are a ' + (social ? 'social media' : 'website') + ' competitive analyst writing a client-ready competitor analysis for ' + company + (niche ? ' (' + niche + ')' : '') + (date ? ', dated ' + date : '') + '.');
    out.push('');
    out.push('Competitors to review:');
    for (var i = 0; i < 3; i++) {
      var name = nth('.comp-name', i), handle = nth('.comp-handle', i), site = nth('.comp-site', i);
      var line = (i + 1) + '. ' + (name || '(name me from the screenshots)') + (handle ? ' | ' + handle : '') + (site ? ' | ' + site : '');
      out.push(line);
    }
    var obj = val('#objectiveField');
    if (obj) { out.push(''); out.push('Objective of the report: ' + obj); }
    out.push('');
    out.push('Rules:');
    out.push('- Base everything ONLY on what is visible in the attached ' + (social ? 'profile screenshots, feed captures and Reel recordings' : 'screenshots and pages') + '. Do not invent numbers, dates, followers, prices or results.');
    out.push('- If something is not visible, write "Not visible" for that field. Do not guess.');
    out.push('- Treat recommendations as strategic interpretation to validate, not proven fact. Do not rank competitors by revenue, engagement rate or market share.');
    out.push('- Keep each table field to one or two short sentences. STRENGTHS and GAPS: 2-4 short bullets each, one per line starting with "- ".');
    out.push('- Write the TAKEAWAY as what ' + company + ' should borrow or avoid from that competitor.');
    out.push('- Reply with ONE code block containing exactly the template below, with every label kept as written and the blanks filled in. No extra commentary inside the block.');
    out.push('');
    out.push('TEMPLATE:');
    out.push('```');
    for (var c = 1; c <= 3; c++) {
      out.push('COMPETITOR ' + c);
      out.push('NAME: ');
      out.push('HANDLE: ');
      out.push('WEBSITE: ');
      if (social) out.push('POSTS: ');
      rows.forEach(function (row) {
        if (LIST_ROWS[row.key]) { out.push(rowLabel(row) + ':'); out.push('- '); out.push('- '); }
        else out.push(rowLabel(row) + ': ');
      });
      out.push('');
    }
    out.push('REPORT');
    out.push('CORE FINDING: (one sentence - what the competitive set reveals about the opportunity)');
    out.push('PRIORITIES:');
    out.push('- (five immediate priorities, one per line)');
    out.push('POSITIONING: (recommended territory, framed as a recommendation to validate)');
    out.push('QA:');
    out.push('What do you specialize in? | answer');
    out.push('Why choose you? | answer');
    out.push('Who is behind it? | answer');
    out.push('How do I buy? | answer');
    out.push('TARGETS:');
    out.push('- (who to target first, one audience per line)');
    out.push('DIRECTION: (one short paragraph making the direction practical)');
    out.push('MESSAGE: (a draft line to test, not a final tagline)');
    if (social) {
      out.push('CONTENT SYSTEM:');
      out.push('Series | Purpose | Example (about six series, one per line)');
    }
    out.push('PLAN:');
    out.push('1 | Focus | Concrete output');
    out.push('2 | Focus | Concrete output');
    out.push('3 | Focus | Concrete output');
    out.push('4 | Focus | Concrete output');
    out.push('EVIDENCE: (what this review is based on and what it cannot show)');
    out.push('SWOT STRENGTHS:');
    out.push('- ');
    out.push('SWOT WEAKNESSES:');
    out.push('- ');
    out.push('SWOT OPPORTUNITIES:');
    out.push('- ');
    out.push('SWOT THREATS:');
    out.push('- ');
    out.push('SWOT IMPLICATION: (one or two sentences)');
    out.push('BOTTOM LINE: (one or two sentences closing the report)');
    out.push('```');
    out.push('');
    out.push('Screenshots / recordings are attached. Begin.');
    return out.join('\n');
  }

  /* ---------------- parser ---------------- */
  function cleanLine(l) {
    return l.replace(/\r/g, '').replace(/^```.*$/, '').replace(/\*\*/g, '').replace(/^#{1,6}\s*/, '').replace(/^\s+|\s+$/g, '');
  }
  function isEmptyish(v) { return !v || /^(not visible|n\/a|none|unknown|-|—)\.?$/i.test(v.trim()); }
  function stripBullet(l) { return l.replace(/^\s*(?:[-•*–]|\d+[.)])\s+/, '').trim(); }

  function parse(text, kind) {
    var rows = global.TABLE_ROWS || [];
    var rowMap = {};
    rows.forEach(function (r) { rowMap[norm(rowLabel(r))] = r.key; rowMap[norm(r.label)] = r.key; });
    Object.keys(ROW_ALIASES).forEach(function (a) { rowMap[norm(a)] = ROW_ALIASES[a]; });
    var compMeta = { 'NAME': 'name', 'HANDLE': 'handle', 'WEBSITE': 'site', 'POSTS': 'posts' };
    var repMap = reportTargets(kind);

    var result = { comps: [{ rows: {}, meta: {} }, { rows: {}, meta: {} }, { rows: {}, meta: {} }], report: {}, unknown: [] };
    var section = null, compIdx = -1, cur = null; // cur = { target: fn, list: bool, lines: [] }

    function flush() {
      if (!cur) return;
      var lines = cur.lines.filter(function (x) { return x !== ''; });
      var v;
      if (cur.list) v = lines.map(stripBullet).filter(Boolean).join('\n');
      else v = lines.join(' ').replace(/\s+/g, ' ').trim();
      if (!isEmptyish(v)) cur.set(v);
      cur = null;
    }

    text.split('\n').forEach(function (raw) {
      var line = cleanLine(raw);
      if (!line) { return; }
      var up = norm(line);
      var mc = /^COMPETITOR\s*([123])\b[^:]*$/i.exec(line);
      if (mc) { flush(); section = 'comp'; compIdx = parseInt(mc[1], 10) - 1; return; }
      if (/^REPORT\s*$/.test(up)) { flush(); section = 'report'; return; }
      var m = /^([A-Za-z][A-Za-z0-9 &\/()'’+\-]{1,40}?)\s*:\s*(.*)$/.exec(line);
      if (m && section) {
        var label = norm(m[1]);
        var rest = m[2].trim();
        if (section === 'comp') {
          if (compMeta[label]) {
            flush();
            var mk = compMeta[label];
            cur = { list: false, lines: rest ? [rest] : [], set: (function (i, k) { return function (v) { result.comps[i].meta[k] = v; }; })(compIdx, mk) };
            return;
          }
          if (rowMap[label]) {
            flush();
            var key = rowMap[label];
            cur = { list: !!LIST_ROWS[key], lines: rest ? [rest] : [], set: (function (i, k) { return function (v) { result.comps[i].rows[k] = v; }; })(compIdx, key) };
            return;
          }
        } else if (section === 'report') {
          if (repMap[label]) {
            flush();
            cur = { list: !!LIST_REPORT[label], lines: rest ? [rest] : [], set: (function (l) { return function (v) { result.report[l] = v; }; })(label) };
            return;
          }
        }
        // looks like "Label: text" but unknown -> if we're mid-field treat as continuation, else note it
        if (!cur) { result.unknown.push(m[1].trim()); return; }
      }
      if (cur) cur.lines.push(line);
    });
    flush();
    return result;
  }

  /* ---------------- apply ---------------- */
  function fire(el) { el.dispatchEvent(new Event('input', { bubbles: true })); }

  function apply(parsed, kind, overwrite) {
    var rows = global.TABLE_ROWS || [];
    var stats = { filled: 0, skipped: 0 };
    function setField(el, value, editable) {
      if (!el) return;
      var curVal = editable ? el.textContent.trim() : (el.value || '').trim();
      var placeholderText = editable && /^Write your main conclusion/i.test(curVal);
      if (curVal && !placeholderText && !overwrite) { stats.skipped++; return; }
      if (editable) el.textContent = value; else el.value = value;
      fire(el); stats.filled++;
    }
    // competitor header inputs
    var metaSel = { name: '.comp-name', handle: '.comp-handle', site: '.comp-site', posts: '.comp-posts' };
    parsed.comps.forEach(function (c, i) {
      Object.keys(c.meta).forEach(function (k) {
        if (k === 'posts' && kind !== 'social') return;
        var els = document.querySelectorAll(metaSel[k]);
        var el = els[i];
        if (!el) return;
        var v = c.meta[k];
        if (k === 'name' && /^\(.*\)$/.test(v)) return;
        setField(el, v, false);
      });
    });
    // table cells
    var trs = document.querySelectorAll('#compTableBody tr');
    rows.forEach(function (row, ri) {
      var tr = trs[ri]; if (!tr) return;
      var cells = tr.querySelectorAll('textarea.cell-input');
      parsed.comps.forEach(function (c, i) {
        if (c.rows[row.key] !== undefined && cells[i]) setField(cells[i], c.rows[row.key], false);
      });
    });
    // report level
    var targets = reportTargets(kind);
    Object.keys(parsed.report).forEach(function (label) {
      var t = targets[label]; if (!t) return;
      var el = t.id ? document.getElementById(t.id) : document.querySelector(t.sel);
      setField(el, parsed.report[label], !!t.editable);
    });
    return stats;
  }

  /* ---------------- UI ---------------- */
  function init(opts) {
    opts = opts || {};
    var kind = opts.kind || 'social';
    var mount = opts.mount;
    if (!mount) return;
    mount.innerHTML =
      '<div class="ra-box">' +
        '<div class="ra-title">Research assistant <span class="ra-sub">optional - speeds up the whole form</span></div>' +
        '<ol class="ra-steps">' +
          '<li>Fill the basics on the Analysis tab (company, competitor names, handles, websites).</li>' +
          '<li>Click <b>Copy research prompt</b>, paste it into Claude and attach your screenshots or recordings.</li>' +
          '<li>Copy Claude’s reply, paste it below and click <b>Fill fields</b>. Review and edit anything before downloading the PDF.</li>' +
        '</ol>' +
        '<div class="ra-row"><button type="button" class="ra-btn" id="raCopy">Copy research prompt</button><span class="ra-msg" id="raCopyMsg"></span></div>' +
        '<textarea id="raManual" class="swot-ta ra-manual" rows="6" readonly hidden aria-label="Research prompt"></textarea>' +
        '<label class="ra-label" for="raPaste">Paste Claude’s reply</label>' +
        '<textarea id="raPaste" class="swot-ta" rows="7" placeholder="COMPETITOR 1&#10;NAME: ...&#10;..."></textarea>' +
        '<div class="ra-row"><button type="button" class="ra-btn" id="raFill">Fill fields</button>' +
        '<label class="ra-chk"><input type="checkbox" id="raOverwrite"> Overwrite fields that already have text</label></div>' +
        '<div class="ra-result" id="raResult" aria-live="polite"></div>' +
      '</div>';

    var copyBtn = mount.querySelector('#raCopy'), copyMsg = mount.querySelector('#raCopyMsg'), manual = mount.querySelector('#raManual');
    copyBtn.addEventListener('click', function () {
      var text = buildPrompt(kind);
      function fallback() {
        manual.hidden = false; manual.value = text; manual.focus(); manual.select();
        var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
        copyMsg.textContent = ok ? 'Copied.' : 'Select all in the box below and copy it.';
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { manual.hidden = true; copyMsg.textContent = 'Copied - paste it into Claude.'; }, fallback);
      } else fallback();
    });
    mount.querySelector('#raFill').addEventListener('click', function () {
      var text = mount.querySelector('#raPaste').value;
      var res = mount.querySelector('#raResult');
      if (!text.trim()) { res.textContent = 'Paste Claude’s reply first.'; return; }
      var parsed = parse(text, kind);
      var found = 0;
      parsed.comps.forEach(function (c) { found += Object.keys(c.meta).length + Object.keys(c.rows).length; });
      found += Object.keys(parsed.report).length;
      if (!found) { res.textContent = 'Nothing recognised. Make sure the reply keeps the labels from the template (COMPETITOR 1, NAME:, STRENGTHS:, REPORT, ...).'; return; }
      var stats = apply(parsed, kind, mount.querySelector('#raOverwrite').checked);
      var msg = 'Filled ' + stats.filled + ' field' + (stats.filled === 1 ? '' : 's') + '.';
      if (stats.skipped) msg += ' ' + stats.skipped + ' left as-is because they already had text (tick "Overwrite" to replace them).';
      if (parsed.unknown.length) msg += ' Not recognised: ' + parsed.unknown.slice(0, 6).join(', ') + '.';
      res.textContent = msg;
      if (typeof global.updateFillTags === 'function') global.updateFillTags();
    });
  }

  global.RevitalResearchAssist = { init: init, buildPrompt: buildPrompt, parse: parse, apply: apply };
})(window);
