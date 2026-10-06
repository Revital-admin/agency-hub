/* ============================================================
   app.js (Social Competitor) — builds the UI and handles all interactions
   Connected Mode: Interfaces directly with the parent workspace database
   ============================================================ */

// ── Check if embedded in parent Revital Hub ──
const isEmbedded = (window.parent && typeof window.parent.getActiveClient === 'function');
let parentClient = null;
let socialComp = null;

if (isEmbedded) {
  parentClient = window.parent.getActiveClient();
  if (parentClient) {
    if (!parentClient.socialComp) { parentClient.socialComp = { stars: [0,0,0], names: ["","",""], rows: {}, swot: {}, insight: "", objective: "", priorities: "", conclusion: "" }; }
    socialComp = parentClient.socialComp;
    if (!socialComp.stars) {
      socialComp.stars = [0, 0, 0];
    }
  }
}

/* ── Set today's date and sync meta fields ── */
(function initMetaFields() {
  const companyEl = document.getElementById('company');
  const dateEl = document.getElementById('date');
  const nicheEl = document.getElementById('niche');
  const preparedbyEl = document.getElementById('preparedby');

  if (isEmbedded && parentClient && socialComp) {
    if (companyEl) companyEl.value = parentClient.name || '';
    if (dateEl) dateEl.value = socialComp.date || '';
    if (nicheEl) nicheEl.value = socialComp.niche || '';
    if (preparedbyEl) preparedbyEl.value = socialComp.preparedby || '';

    // Listeners to sync back to parent
    if (dateEl) {
      dateEl.addEventListener('input', function() {
        socialComp.date = dateEl.value;
        window.parent.saveDatabase();
      });
    }
    if (nicheEl) {
      nicheEl.addEventListener('input', function() {
        socialComp.niche = nicheEl.value;
        window.parent.saveDatabase();
      });
    }
    if (preparedbyEl) {
      preparedbyEl.addEventListener('input', function() {
        socialComp.preparedby = preparedbyEl.value;
        window.parent.saveDatabase();
      });
    }
  } else {
    // Standalone mode: initialize default date
    if (dateEl && !dateEl.value) {
      dateEl.value = new Date().toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });
    }
  }
})();

/* ── Build competitor table body ── */
(function buildTable() {
  const tbody = document.getElementById('compTableBody');
  if (!tbody) return;

  // Render headers
  const headerInputs = document.querySelectorAll('.comp-name');
  if (isEmbedded && socialComp && headerInputs.length === 3) {
    headerInputs.forEach(function(input, idx) {
      input.value = socialComp.names[idx] || '';
      input.addEventListener('input', function() {
        socialComp.names[idx] = input.value;
        window.parent.saveDatabase();
        window.parent.renderDashboard();
      });
    });
  }

  // Competitor website + social handle (shown in the PDF report)
  const siteInputs = document.querySelectorAll('.comp-site');
  const handleInputs = document.querySelectorAll('.comp-handle');
  if (isEmbedded && socialComp) {
    if (!Array.isArray(socialComp.sites)) socialComp.sites = ['', '', ''];
    if (!Array.isArray(socialComp.handles)) socialComp.handles = ['', '', ''];
    if (!Array.isArray(socialComp.posts)) socialComp.posts = ['', '', ''];
    siteInputs.forEach(function(input, idx) {
      input.value = socialComp.sites[idx] || '';
      input.addEventListener('input', function() { socialComp.sites[idx] = input.value; window.parent.saveDatabase(); });
    });
    document.querySelectorAll('.comp-posts').forEach(function(input, idx) {
      input.value = socialComp.posts[idx] || '';
      input.addEventListener('input', function() { socialComp.posts[idx] = input.value; window.parent.saveDatabase(); });
    });
    handleInputs.forEach(function(input, idx) {
      input.value = socialComp.handles[idx] || '';
      input.addEventListener('input', function() { socialComp.handles[idx] = input.value; window.parent.saveDatabase(); });
    });
  }

  TABLE_ROWS.forEach(function(row) {
    const tr = document.createElement('tr');

    const labelTd = document.createElement('td');
    labelTd.className = 'row-label';
    labelTd.textContent = row.label;
    tr.appendChild(labelTd);

    ['a', 'b', 'c'].forEach(function(comp, compIdx) {
      const td = document.createElement('td');
      const ta = document.createElement('textarea');
      ta.className = 'cell-input';
      ta.rows = 2;
      ta.placeholder = row.placeholder;

      // Sync saved value
      if (isEmbedded && socialComp && socialComp.rows[row.key]) {
        ta.value = socialComp.rows[row.key][compIdx] || '';
      }

      // Sync back on edit
      ta.addEventListener('input', function() {
        if (isEmbedded && socialComp) {
          if (!socialComp.rows[row.key]) {
            socialComp.rows[row.key] = ['', '', ''];
          }
          socialComp.rows[row.key][compIdx] = ta.value;
          window.parent.saveDatabase();
          window.parent.renderDashboard();
        }
      });

      td.appendChild(ta);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  /* Overall score row */
  const scoreRow = document.createElement('tr');

  const scoreLabelTd = document.createElement('td');
  scoreLabelTd.className = 'row-label';
  scoreLabelTd.textContent = 'Overall Score';
  scoreRow.appendChild(scoreLabelTd);

  ['a', 'b', 'c'].forEach(function(comp, compIdx) {
    const td = document.createElement('td');

    const starsDiv = document.createElement('div');
    starsDiv.className = 'stars';
    starsDiv.dataset.comp = comp;

    let savedStars = 0;
    if (isEmbedded && socialComp && socialComp.stars) {
      savedStars = socialComp.stars[compIdx] || 0;
    }

    const barDiv = document.createElement('div');
    barDiv.className = 'score-bar';
    const fill = document.createElement('div');
    fill.className = 'score-fill';
    fill.id = 'fill-' + comp;
    fill.style.width = (savedStars / 5 * 100) + '%';
    fill.style.background = COMPETITOR_COLORS[comp];
    barDiv.appendChild(fill);

    for (let i = 1; i <= 5; i++) {
      const star = document.createElement('span');
      star.className = 'star';
      star.textContent = '★';
      star.dataset.val = i;
      if (i <= savedStars) {
        star.classList.add('on');
      }

      star.addEventListener('click', function() {
        const allStars = starsDiv.querySelectorAll('.star');
        allStars.forEach(function(s) {
          s.classList.toggle('on', parseInt(s.dataset.val) <= i);
        });
        fill.style.width = (i / 5 * 100) + '%';

        if (isEmbedded && socialComp) {
          if (!socialComp.stars) socialComp.stars = [0, 0, 0];
          socialComp.stars[compIdx] = i;
          window.parent.saveDatabase();
          window.parent.renderDashboard();
        }
      });
      starsDiv.appendChild(star);
    }

    td.appendChild(starsDiv);
    td.appendChild(barDiv);
    scoreRow.appendChild(td);
  });

  tbody.appendChild(scoreRow);
})();

/* ── Build SWOT grid ── */
(function buildSwot() {
  const grid = document.getElementById('swotGrid');
  if (!grid) return;

  SWOT_DATA.forEach(function(sw) {
    const card = document.createElement('div');
    card.className = 'swot-card';
    card.style.borderColor = sw.borderColor;

    /* Heading */
    const h3 = document.createElement('h3');
    h3.className = sw.headClass;
    h3.innerHTML = sw.label + ' <span style="font-weight:400;opacity:.65;">(' + sw.sub + ')</span>';
    card.appendChild(h3);

    /* Toggle button */
    const toggle = document.createElement('button');
    toggle.className = 'prompt-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
      'Quick-add prompts' +
      '<svg class="chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
    card.appendChild(toggle);

    /* Prompts panel */
    const panel = document.createElement('div');
    panel.className = 'prompt-panel';
    panel.id = 'panel-' + sw.key;

    sw.prompts.forEach(function(promptText, idx) {
      const item = document.createElement('div');
      item.className = 'prompt-item';
      item.id = 'item-' + sw.key + '-' + idx;

      const chkWrap = document.createElement('label');
      chkWrap.className = 'custom-checkbox';
      chkWrap.style.marginRight = '8px';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.id = 'chk-' + sw.key + '-' + idx;
      
      const checkmark = document.createElement('span');
      checkmark.className = 'checkmark';
      
      chkWrap.appendChild(chk);
      chkWrap.appendChild(checkmark);

      const lbl = document.createElement('label');
      lbl.setAttribute('for', 'chk-' + sw.key + '-' + idx);
      lbl.textContent = promptText;

      item.appendChild(chkWrap);
      item.appendChild(lbl);
      panel.appendChild(item);
    });

    card.appendChild(panel);

    /* Textarea */
    const ta = document.createElement('textarea');
    ta.className = 'swot-ta';
    ta.id = 'ta-' + sw.key;
    ta.rows = 3;
    ta.placeholder = sw.placeholder;
    
    // Sync saved value
    if (isEmbedded && socialComp) {
      ta.value = socialComp.swot[sw.key] || '';
    }
    
    card.appendChild(ta);
    grid.appendChild(card);

    /* Toggle interaction */
    toggle.addEventListener('click', function() {
      const isOpen = panel.classList.toggle('open');
      toggle.classList.toggle('open', isOpen);
      toggle.setAttribute('aria-expanded', isOpen);
    });

    /* Checkbox interactions */
    panel.querySelectorAll('input[type="checkbox"]').forEach(function(chk, idx) {
      chk.addEventListener('change', function() {
        const item = chk.closest('.prompt-item');
        const promptText = item.querySelector('label').textContent;

        if (chk.checked) {
          item.classList.add('checked');
          const current = ta.value.trim();
          ta.value = current ? current + '\n• ' + promptText : '• ' + promptText;
        } else {
          item.classList.remove('checked');
          const lines = ta.value.split('\n').filter(function(line) {
            return !line.includes(promptText.substring(0, 25));
          });
          ta.value = lines.join('\n');
        }

        // Trigger text input save
        ta.dispatchEvent(new Event('input'));
      });
    });

    // Save SWOT inputs
    ta.addEventListener('input', function() {
      if (isEmbedded && socialComp) {
        socialComp.swot[sw.key] = ta.value;
        window.parent.saveDatabase();
      }
    });
  });
})();

/* ── Key Takeaway Sync ── */
(function initTakeaway() {
  const insight = document.querySelector('.insight-text');
  if (!insight) return;

  if (isEmbedded && socialComp) {
    if (socialComp.insight) {
      insight.textContent = socialComp.insight;
    }

    insight.addEventListener('input', function() {
      socialComp.insight = insight.textContent;
      window.parent.saveDatabase();
    });
  }
})();

/* ── Objective / Priorities / Bottom Line sync (client-presentable PDF
   report, Oct 2026) — plain textareas bound via .value, not contenteditable.
   See website-competitor-analysis/js/app.js for why contenteditable spans
   are unsafe for this: a placeholder sentence got literally concatenated
   into real saved data earlier this session. ── */
(function initReportFields() {
  const fields = [
    { id: 'objectiveField', key: 'objective' },
    { id: 'positioningField', key: 'positioning' },
    { id: 'qaField', key: 'qa' },
    { id: 'targetsField', key: 'targets' },
    { id: 'directionField', key: 'direction' },
    { id: 'messageField', key: 'message' },
    { id: 'contentSystemField', key: 'contentSystem' },
    { id: 'planField', key: 'plan' },
    { id: 'evidenceField', key: 'evidence' },
    { id: 'swotImplicationField', key: 'swotImplication' },
    { id: 'prioritiesField', key: 'priorities' },
    { id: 'conclusionField', key: 'conclusion' },
  ];
  fields.forEach(function(f) {
    const el = document.getElementById(f.id);
    if (!el) return;
    if (isEmbedded && socialComp) {
      el.value = socialComp[f.key] || '';
      el.addEventListener('input', function() {
        socialComp[f.key] = el.value;
        window.parent.saveDatabase();
      });
    }
  });
})();

/* ── Download as PDF ──
   Oct 2026 rebuild: switched from html2canvas/html2pdf (a screenshot of the
   on-screen tool) to the shared native-jsPDF report builder
   (../shared/pdf-report.js), same rationale as website-competitor-analysis:
   html2canvas's backgroundColor option was silently ignored (white-on-white
   text) and its page-slicing cut content mid-sentence at page breaks. jsPDF
   draws real text with real pagination, and restructures the export into an
   actual client-presentable report instead of a screenshot of the editing UI. */
function downloadPDF() {
  if (typeof window.RevitalPDF === 'undefined') {
    alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
    return;
  }

  const pdfBtn = document.querySelector('.download-pdf-btn');
  const origText = pdfBtn ? pdfBtn.innerHTML : '';
  if (pdfBtn) { pdfBtn.disabled = true; pdfBtn.innerHTML = '⏳ Generating...'; }

  try {
    const companyName = (document.getElementById('company') && document.getElementById('company').value.trim()) || 'Client';
    const dateVal = (document.getElementById('date') && document.getElementById('date').value.trim()) || '';
    const nicheVal = (document.getElementById('niche') && document.getElementById('niche').value.trim()) || '';

    const names = (socialComp && socialComp.names) ? socialComp.names.map(function(n, i) { return (n || '').trim() || ('Competitor ' + String.fromCharCode(65 + i)); }) : ['Competitor A', 'Competitor B', 'Competitor C'];
    const tiers = ['Top Competitor', 'Mid Competitor', 'Low Competitor'];
    const stars = (socialComp && socialComp.stars) ? socialComp.stars : [0, 0, 0];

    const objective = (socialComp && socialComp.objective) ? socialComp.objective.trim() : '';
    const prioritiesRaw = (socialComp && socialComp.priorities) ? socialComp.priorities.trim() : '';
    const priorities = prioritiesRaw ? prioritiesRaw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean) : [];
    const conclusion = (socialComp && socialComp.conclusion) ? socialComp.conclusion.trim() : '';
    const insightText = (socialComp && socialComp.insight) ? socialComp.insight.trim() : '';
    const swot = (socialComp && socialComp.swot) || {};
    const rowsData = (socialComp && socialComp.rows) || {};
    function rowText(key, idx) { return (rowsData[key] && rowsData[key][idx]) ? rowsData[key][idx].trim() : ''; }

    // Competitor website + handle (entered under each competitor name)
    function listVal(arr, sel, i) {
      const v = (arr && arr[i]) ? String(arr[i]).trim() : '';
      if (v) return v;
      const els = document.querySelectorAll(sel);
      return els[i] ? els[i].value.trim() : '';
    }
    const sites = [0, 1, 2].map(function(i) { return listVal(socialComp && socialComp.sites, '.comp-site', i); });
    const handles = [0, 1, 2].map(function(i) {
      const v = listVal(socialComp && socialComp.handles, '.comp-handle', i);
      return v && !/^@/.test(v) && !/[\/.]/.test(v) ? '@' + v : v;
    });
    const posts = [0, 1, 2].map(function(i) { return listVal(socialComp && socialComp.posts, '.comp-posts', i); });
    const siteLabel = function(s) { return s.replace(/^https?:\/\//i, '').replace(/\/$/, ''); };
    const siteHref = function(s) { return /^https?:\/\//i.test(s) ? s : 'https://' + s; };

    let secNo = 0;
    const r = RevitalPDF.create({ reportTitle: 'SOCIAL MEDIA COMPETITOR ANALYSIS', companyName: companyName, light: true });
    const doc = r.doc; const C = r.colors;
    const _sh = r.sectionHeader; r.sectionHeader = function(t) { secNo++; _sh.call(r, (secNo < 10 ? '0' : '') + secNo + ' ' + t); };

    // COVER
    function drawContactLine(i, extra) {
      const parts = [];
      if (handles[i]) parts.push({ t: handles[i] });
      [].concat(extra || []).forEach(function(e) { if (e) parts.push({ t: e }); });
      if (sites[i]) parts.push({ t: siteLabel(sites[i]), url: siteHref(sites[i]) });
      if (!parts.length) return;
      r.ensureSpace(22);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      let x = r.MARGIN;
      const sep = '  |  ';
      parts.forEach(function(p, k) {
        if (k) { doc.setTextColor.apply(doc, C.GRAY); doc.text(sep, x, r.y + 9); x += doc.getTextWidth(sep); }
        const txt = r.sanitizeText(p.t);
        if (p.url) { doc.setTextColor.apply(doc, C.ACCENT); doc.textWithLink(txt, x, r.y + 9, { url: p.url }); }
        else { doc.setTextColor.apply(doc, C.DARK); doc.text(txt, x, r.y + 9); }
        x += doc.getTextWidth(txt);
      });
      r.y += 20;
    }

    r.coverPage({
      title: 'Social Media Competitor Analysis',
      subLine: [nicheVal, dateVal].filter(Boolean).join('   |   '),
      objective: objective || ('Identify the strongest social-media practices in the competitive set and translate them into a focused, ownable strategy for ' + companyName + '.'),
      direction: insightText,
      preparedFrom: 'Social media competitor research for ' + companyName + ' against ' + names.filter(Boolean).join(', ') + '.',
      note: 'Note: this is a qualitative social-presence audit synthesized from manual review, not an automated analytics report.',
    });

    // EXECUTIVE OVERVIEW
    r.newPage();
    r.sectionHeader('Executive Overview');
    r.paragraph('What the competitive set reveals about ' + companyName + "'s social media opportunity", { bold: true, size: 11, spaceAfter: 8 });
    if (insightText) r.calloutBox('Core Finding', insightText);
    r.paragraph('Competitive lessons', { bold: true, size: 10.5, spaceAfter: 6 });
    const lessonsRows = names.map(function(name, i) {
      return [name, rowText('style', i) || rowText('top-content', i), rowText('takeaway', i)];
    });
    r.tableBlock(['Brand', 'What it does especially well', 'Lesson for ' + companyName], lessonsRows, [r.CONTENT_W * 0.22, r.CONTENT_W * 0.4, r.CONTENT_W * 0.38]);

    if (sites.some(Boolean) || handles.some(Boolean)) {
      r.y += 10;
      r.paragraph('Who we reviewed', { size: 12, bold: true, spaceAfter: 8 });
      r.tableBlock(['Tier', 'Brand', 'Handle', 'Website'],
        names.map(function(n, i) { return [tiers[i], n, handles[i] || '-', sites[i] ? siteLabel(sites[i]) : '-']; }),
        [r.CONTENT_W * 0.18, r.CONTENT_W * 0.28, r.CONTENT_W * 0.24, r.CONTENT_W * 0.30]);
    }
    if (priorities.length) {
      r.y += 8;
      r.paragraph('Immediate priorities', { bold: true, size: 10.5, spaceAfter: 6 });
      r.bulletList(priorities);
    }

    // COMPETITOR FINDINGS (one section per competitor)
    r.newPage();
    r.sectionHeader('Competitor Findings');
    names.forEach(function(name, i) {
      r.ensureSpace(190);
      doc.setFillColor.apply(doc, C.DARK);
      doc.rect(r.MARGIN, r.y, r.CONTENT_W, 22, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor.apply(doc, C.WHITE);
      doc.text(name, r.MARGIN + 10, r.y + 15);
      const starLabel = stars[i] ? (stars[i] + ' / 5') : '';
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text([tiers[i], starLabel].filter(Boolean).join('   |   '), r.MARGIN + r.CONTENT_W - 10, r.y + 15, { align: 'right' });
      r.y = r.y + 22 + 12;
      drawContactLine(i, [rowText('followers', i) ? (rowText('followers', i) + ' followers') : '', posts[i] ? (posts[i] + ' posts') : ''].filter(Boolean));
      if (rowText('positioning-tag', i)) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, C.ACCENT);
        r.ensureSpace(16);
        doc.text(r.sanitizeText(rowText('positioning-tag', i)).toUpperCase(), r.MARGIN, r.y + 8);
        r.y += 24;
      }

      const dimRows = ['frequency', 'engagement', 'top-content', 'identity'].map(function(key) {
        const row = TABLE_ROWS.find(function(rr) { return rr.key === key; });
        const text = rowText(key, i);
        return text ? [row ? row.label : key, text] : null;
      }).filter(Boolean);
      if (dimRows.length) { r.y += 2; r.tableBlock(['Dimension', 'Observed evidence'], dimRows, [r.CONTENT_W * 0.26, r.CONTENT_W * 0.74]); r.y += 8; }

      const lines = function(key) { return rowText(key, i).split('\n').map(function(x) { return x.trim().replace(/^[-•*]\s*/, ''); }).filter(Boolean); };
      if (lines('strengths').length) { r.ensureSpace(70); r.y += 4; r.paragraph('Strengths', { bold: true, size: 10.5, spaceAfter: 4 }); r.bulletList(lines('strengths')); }
      if (lines('gaps').length) { r.ensureSpace(70); r.y += 4; r.paragraph('Gaps / opportunities', { bold: true, size: 10.5, spaceAfter: 4 }); r.bulletList(lines('gaps')); }
      if (rowText('visible-evidence', i)) {
        r.ensureSpace(60); r.y += 4;
        r.paragraph('Visible engagement', { bold: true, size: 10.5, spaceAfter: 4 });
        r.paragraph(rowText('visible-evidence', i), { size: 9, color: C.GRAY, spaceAfter: 8 });
      }

      const takeaway = rowText('takeaway', i);
      if (takeaway) r.calloutBox((companyName + ' takeaway').toUpperCase(), takeaway);
      if (rowText('source', i)) r.paragraph('Source: ' + rowText('source', i), { size: 8.5, italic: true, color: C.GRAY, spaceAfter: 6 });
      r.y = r.y + 16;
    });

    // SWOT / POSITIONING
    const rf = function(key) { return (socialComp && socialComp[key]) ? String(socialComp[key]).trim() : ((document.getElementById(key + 'Field') || {}).value || '').trim(); };
    const posText = rf('positioning'), qaLines = rf('qa').split('\n').map(function(x) { return x.trim(); }).filter(Boolean),
      targetLines = rf('targets').split('\n').map(function(x) { return x.trim().replace(/^[-•*]\s*/, ''); }).filter(Boolean),
      directionText = rf('direction'), messageText = rf('message');
    if (posText || qaLines.length || targetLines.length || directionText || messageText) {
      r.newPage();
      r.sectionHeader('Positioning & Target Audience');
      if (posText) r.paragraph(posText, { size: 10.5, italic: true, color: C.GRAY, spaceAfter: 12 });
      if (qaLines.length) {
        r.paragraph('What the customer should understand', { bold: true, size: 12, spaceAfter: 8 });
        r.tableBlock(['Question', 'Recommended answer'], qaLines.map(function(l) { const bits = l.split('|'); return [(bits[0] || '').trim(), bits.slice(1).join('|').trim()]; }), [r.CONTENT_W * 0.38, r.CONTENT_W * 0.62]);
      }
      if (targetLines.length) { r.paragraph('Target first', { bold: true, size: 12, spaceAfter: 6 }); r.bulletList(targetLines); }
      if (directionText) { r.paragraph('Making it practical', { bold: true, size: 12, spaceAfter: 6 }); r.paragraph(directionText, { spaceAfter: 10 }); }
      if (messageText) r.calloutBox('Working message to test', messageText);
    }

    const pipeRows = function(t) { return rf(t).split('\n').map(function(l) { return l.split('|').map(function(x) { return x.trim(); }); }).filter(function(b) { return b.length > 1 && b[0]; }).map(function(b) { return [b[0], b[1] || '', b.slice(2).join(' | ')]; }); };
    const csRows = pipeRows('contentSystem'), planRows = pipeRows('plan'), evidenceText = rf('evidence');
    if (csRows.length) {
      r.newPage();
      r.sectionHeader('Content & Conversion System');
      r.tableBlock(['Series', 'Purpose', 'Example'], csRows, [r.CONTENT_W * 0.24, r.CONTENT_W * 0.26, r.CONTENT_W * 0.5]);
    }
    r.newPage();
    r.sectionHeader('SWOT — Gaps & Opportunities');
    r.paragraph('A strategic synthesis of the competitor findings. Internal observations are a baseline, not a fresh performance assessment.', { spaceAfter: 12 });
    const swotBullets = function(t) { return String(t || '').split('\n').map(function(x) { return x.trim().replace(/^[-•*]\s*/, ''); }).filter(Boolean); };
    [['Strengths (you vs. them)', swot.s], ['Weaknesses (to address)', swot.w], ['Opportunities (market gaps)', swot.o], ['Threats (to watch)', swot.t]].forEach(function(g) {
      const items = swotBullets(g[1]);
      r.ensureSpace(70); r.y += 4;
      r.paragraph(g[0], { bold: true, size: 11.5, spaceAfter: 4 });
      r.bulletList(items.length ? items : ['Not yet filled in.']);
    });
    const implication = rf('swotImplication');
    if (implication) { r.ensureSpace(70); r.y += 6; r.paragraph('Strategic implication', { bold: true, size: 11.5, spaceAfter: 4 }); r.paragraph(implication, { spaceAfter: 8 }); }

    // APPENDIX: FULL CATEGORY COMPARISON
    r.newPage();
    r.sectionHeader('Appendix: Full Category Comparison');
    const appendixRows = TABLE_ROWS.filter(function(rr) { return ['takeaway', 'positioning-tag', 'strengths', 'gaps', 'visible-evidence', 'source'].indexOf(rr.key) === -1; })
      .map(function(rr) { return [rr.label, rowText(rr.key, 0), rowText(rr.key, 1), rowText(rr.key, 2)]; });
    r.tableBlock(['Category', names[0], names[1], names[2]], appendixRows, [r.CONTENT_W * 0.22, r.CONTENT_W * 0.26, r.CONTENT_W * 0.26, r.CONTENT_W * 0.26]);

    // CONCLUSION
    r.newPage();
    r.sectionHeader('Conclusion');
    const borrowRows = names.map(function(name, i) { return [rowText('takeaway', i) || '—', name]; });
    r.tableBlock(['Borrow', 'From'], borrowRows, [r.CONTENT_W * 0.68, r.CONTENT_W * 0.32]);
    if (conclusion) r.calloutBox('Bottom Line', conclusion);
    r.paragraph('Prepared for internal strategy discussion.', { italic: true, size: 9, color: C.GRAY });
    if (planRows.length || evidenceText) {
      r.newPage();
      r.sectionHeader('30-Day Action Plan & Evidence Notes');
      if (planRows.length) r.tableBlock(['Week', 'Focus', 'Concrete output'], planRows, [r.CONTENT_W * 0.12, r.CONTENT_W * 0.28, r.CONTENT_W * 0.6]);
      if (evidenceText) { r.paragraph('Evidence and limitations', { bold: true, size: 12, spaceAfter: 6 }); r.paragraph(evidenceText, { size: 9.5, spaceAfter: 8 }); }
    }

    r.save((companyName.replace(/[^a-z0-9]+/gi, '_') || 'Social') + '_Competitor_Analysis.pdf');
  } catch (err) {
    console.error('PDF generation failed:', err);
    alert('PDF generation failed: ' + (err && err.message ? err.message : err));
  } finally {
    if (pdfBtn) { pdfBtn.disabled = false; pdfBtn.innerHTML = origText; }
  }
}


/* ── Reset all fields ── */
function clearAll() {
  if (!confirm('Reset all fields? This cannot be undone.')) return;

  document.querySelectorAll('input[type="text"]').forEach(function(el) {
    if (el.id !== 'date') el.value = '';
  });

  document.querySelectorAll('textarea').forEach(function(el) {
    el.value = '';
  });

  document.querySelectorAll('.star').forEach(function(el) {
    el.classList.remove('on');
  });

  document.querySelectorAll('.score-fill').forEach(function(el) {
    el.style.width = '0%';
  });

  document.querySelectorAll('input[type="checkbox"]').forEach(function(el) {
    el.checked = false;
    const item = el.closest('.prompt-item');
    if (item) item.classList.remove('checked');
  });

  const insight = document.querySelector('.insight-text');
  if (insight) {
    insight.textContent = 'Write your main conclusion — where to position your company, who to target, and what to do next.';
  }

  // Clear parent state if connected
  if (isEmbedded && socialComp) {
    const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    socialComp.niche = "";
    socialComp.date = today;
    socialComp.names = ["Competitor A", "Competitor B", "Competitor C"];
    socialComp.sites = ["", "", ""];
    socialComp.handles = ["", "", ""];
    socialComp.posts = ["", "", ""];
    socialComp.insight = "";
    socialComp.objective = ""; socialComp.priorities = ""; socialComp.conclusion = "";
    socialComp.positioning = ""; socialComp.qa = ""; socialComp.targets = ""; socialComp.direction = ""; socialComp.message = ""; socialComp.contentSystem = ""; socialComp.plan = ""; socialComp.evidence = ""; socialComp.swotImplication = "";
    socialComp.objective = "";
    socialComp.priorities = "";
    socialComp.conclusion = "";
    socialComp.swot = { s: "", w: "", o: "", t: "" };
    socialComp.stars = [0, 0, 0];
    
    TABLE_ROWS.forEach(row => {
      socialComp.rows[row.key] = ["", "", ""];
    });

    window.parent.saveDatabase();
    window.parent.renderDashboard();
    
    // Refresh date input to today
    const dateEl = document.getElementById('date');
    if (dateEl) dateEl.value = today;
    const companyEl = document.getElementById('company');
    if (companyEl) companyEl.value = parentClient.name;
  }
}