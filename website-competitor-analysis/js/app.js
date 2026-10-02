/* ============================================================
   website-app.js — builds the UI and handles all interactions
   Connected Mode: Interfaces directly with the parent workspace database
   ============================================================ */

// ── Check if embedded in parent Revital Hub ──
const isEmbedded = (window.parent && typeof window.parent.getActiveClient === 'function');
let parentClient = null;
let webComp = null;

if (isEmbedded) {
  parentClient = window.parent.getActiveClient();
  if (parentClient) {
    if (!parentClient.webComp) { parentClient.webComp = { stars: [0,0,0], names: ["","",""], rows: {}, swot: {}, insight: "" }; }
    webComp = parentClient.webComp;
    if (!webComp.stars) {
      webComp.stars = [0, 0, 0];
    }
  }
}

/* ── Set today's date and sync meta fields ── */
(function initMetaFields() {
  const companyEl = document.getElementById('company');
  const dateEl = document.getElementById('date');
  const nicheEl = document.getElementById('niche');
  const preparedbyEl = document.getElementById('preparedby');

  if (isEmbedded && parentClient && webComp) {
    if (companyEl) companyEl.value = parentClient.name || '';
    if (dateEl) dateEl.value = webComp.date || '';
    if (nicheEl) nicheEl.value = webComp.market || '';
    if (preparedbyEl) preparedbyEl.value = webComp.preparedby || '';

    // Listeners to sync back to parent
    if (dateEl) {
      dateEl.addEventListener('input', function() {
        webComp.date = dateEl.value;
        window.parent.saveDatabase();
      });
    }
    if (nicheEl) {
      nicheEl.addEventListener('input', function() {
        webComp.market = nicheEl.value;
        window.parent.saveDatabase();
      });
    }
    if (preparedbyEl) {
      preparedbyEl.addEventListener('input', function() {
        webComp.preparedby = preparedbyEl.value;
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
  if (isEmbedded && webComp && headerInputs.length === 3) {
    headerInputs.forEach(function(input, idx) {
      input.value = webComp.names[idx] || '';
      input.addEventListener('input', function() {
        webComp.names[idx] = input.value;
        window.parent.saveDatabase();
        window.parent.renderDashboard();
      });
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
      if (isEmbedded && webComp && webComp.rows[row.key]) {
        ta.value = webComp.rows[row.key][compIdx] || '';
      }

      // Sync back on edit
      ta.addEventListener('input', function() {
        if (isEmbedded && webComp) {
          if (!webComp.rows[row.key]) {
            webComp.rows[row.key] = ['', '', ''];
          }
          webComp.rows[row.key][compIdx] = ta.value;
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
    if (isEmbedded && webComp && webComp.stars) {
      savedStars = webComp.stars[compIdx] || 0;
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

        if (isEmbedded && webComp) {
          if (!webComp.stars) webComp.stars = [0, 0, 0];
          webComp.stars[compIdx] = i;
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
    if (isEmbedded && webComp) {
      ta.value = webComp.swot[sw.key] || '';
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
      if (isEmbedded && webComp) {
        webComp.swot[sw.key] = ta.value;
        window.parent.saveDatabase();
      }
    });
  });
})();

/* ── Key Takeaway Sync ── */
(function initTakeaway() {
  const insight = document.querySelector('.insight-text');
  if (!insight) return;

  if (isEmbedded && webComp) {
    if (webComp.insight) {
      insight.textContent = webComp.insight;
    }

    insight.addEventListener('input', function() {
      webComp.insight = insight.textContent;
      window.parent.saveDatabase();
    });
  }
})();

/* ── Objective / Immediate Priorities / Conclusion Sync (Oct 2026) ──
   Three new report-only fields feeding the client-presentable PDF's cover
   page, executive overview, and closing page. Deliberately plain <textarea>
   elements bound the same way as every other field in this file (.value,
   'input' listener) rather than contenteditable - a contenteditable span's
   placeholder text got literally concatenated into saved data earlier this
   session, which a real textarea's .value can't do. */
(function initReportFields() {
  const fields = [
    { id: 'objectiveField', key: 'objective' },
    { id: 'prioritiesField', key: 'priorities' },
    { id: 'conclusionField', key: 'conclusion' },
  ];
  fields.forEach(function(f) {
    const el = document.getElementById(f.id);
    if (!el) return;
    if (isEmbedded && webComp) {
      el.value = webComp[f.key] || '';
      el.addEventListener('input', function() {
        webComp[f.key] = el.value;
        window.parent.saveDatabase();
      });
    }
  });
})();

/* ── Download as PDF ──
   Oct 2026 rebuild: replaced the html2canvas/html2pdf screenshot pipeline
   entirely with native jsPDF vector text. Two confirmed, unfixable-at-the-
   config-level bugs in the old approach are structurally impossible here:
   (1) html2canvas's backgroundColor option was silently ignored by the
   bundled version, so anything without its own opaque CSS background came
   out white-on-white; (2) html2canvas sliced one long screenshot across PDF
   pages with zero awareness of content boundaries, so paragraphs and table
   cells got cut mid-sentence at page breaks. Real text drawn with real
   pagination logic can't do either. This also restructures the export from
   "a screenshot of the editing UI" into an actual client-presentable report:
   cover page, executive overview, per-competitor findings, SWOT/positioning,
   and a conclusion - modeled directly on the client-facing report format
   Ronald asked this to match. */
function downloadPDF() {
  if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
    alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
    return;
  }

  const pdfBtn = document.querySelector('.download-pdf-btn');
  const origText = pdfBtn ? pdfBtn.innerHTML : '';
  if (pdfBtn) { pdfBtn.disabled = true; pdfBtn.innerHTML = '⏳ Generating...'; }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    const PAGE_W = 612, PAGE_H = 792;
    const MARGIN = 54;
    const CONTENT_W = PAGE_W - MARGIN * 2;
    let y = MARGIN;
    let pageNum = 1;

    // Revital brand palette (matches the live Hub's own dark theme: --bg-sidebar
    // #1a1a17, --primary #f68d5f - see root style.css :root). GOLD is kept as
    // the variable name since every call site below (calloutBox, sectionHeader,
    // etc. - all written for a dark/accent pairing) refers to it that way, but
    // it now holds Revital's orange, not a client-brand gold.
    const DARK = [26, 26, 23];
    const GOLD = [246, 141, 95];
    const CREAM = [250, 243, 237];
    const GRAY = [110, 108, 100];
    const LIGHT = [240, 219, 204];
    const WHITE = [255, 255, 255];
    const GREEN = [62, 122, 76], RED = [176, 69, 59], BLUE = [59, 111, 160], PINK = [163, 76, 116];

    const companyName = (document.getElementById('company') && document.getElementById('company').value.trim()) || 'Client';
    const dateVal = (document.getElementById('date') && document.getElementById('date').value.trim()) || '';
    const marketVal = (document.getElementById('niche') && document.getElementById('niche').value.trim()) || '';
    const names = (webComp && webComp.names) ? webComp.names.map(function(n, i) { return n || ('Competitor ' + String.fromCharCode(65 + i)); }) : ['Competitor A', 'Competitor B', 'Competitor C'];
    const tiers = ['Top Competitor', 'Mid Competitor', 'Low Competitor'];
    const objective = (webComp && webComp.objective) ? webComp.objective.trim() : '';
    const prioritiesRaw = (webComp && webComp.priorities) ? webComp.priorities.trim() : '';
    const priorities = prioritiesRaw ? prioritiesRaw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean) : [];
    const conclusion = (webComp && webComp.conclusion) ? webComp.conclusion.trim() : '';
    const insightText = (webComp && webComp.insight) ? webComp.insight.trim() : '';
    const swot = (webComp && webComp.swot) || {};
    const rowsData = (webComp && webComp.rows) || {};

    function rowText(key, idx) {
      return (rowsData[key] && rowsData[key][idx]) ? rowsData[key][idx].trim() : '';
    }

    // ---------- low-level helpers ----------
    function footer() {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, GRAY);
      doc.text(companyName.toUpperCase() + '   |   ' + pageNum, PAGE_W - MARGIN, PAGE_H - 30, { align: 'right' });
      doc.text('WEBSITE COMPETITOR ANALYSIS', MARGIN, PAGE_H - 30);
    }
    function newPage() {
      footer();
      doc.addPage();
      pageNum++;
      y = MARGIN;
    }
    function ensureSpace(h) {
      if (y + h > PAGE_H - MARGIN - 16) newPage();
    }
    function sectionHeader(title) {
      ensureSpace(70);
      doc.setFillColor.apply(doc, DARK);
      doc.rect(MARGIN, y, CONTENT_W * 0.62, 24, 'F');
      doc.setFillColor.apply(doc, GOLD);
      doc.rect(MARGIN + CONTENT_W * 0.62, y, CONTENT_W * 0.38, 24, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.setTextColor.apply(doc, WHITE);
      doc.text('WEBSITE COMPETITOR ANALYSIS', MARGIN + 10, y + 15.5);
      doc.setTextColor.apply(doc, DARK);
      doc.text(('PREPARED FOR ' + companyName).toUpperCase().slice(0, 48), MARGIN + CONTENT_W * 0.62 + 10, y + 15.5);
      y += 24 + 20;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(21); doc.setTextColor.apply(doc, DARK);
      doc.text(title, MARGIN, y);
      y += 6;
      doc.setDrawColor.apply(doc, GOLD); doc.setLineWidth(1.5);
      doc.line(MARGIN, y + 6, MARGIN + CONTENT_W, y + 6);
      y += 26;
    }
    function paragraph(text, opts) {
      opts = opts || {};
      const size = opts.size || 10;
      doc.setFont('helvetica', opts.bold ? 'bold' : (opts.italic ? 'italic' : 'normal'));
      doc.setFontSize(size);
      doc.setTextColor.apply(doc, opts.color || DARK);
      const width = opts.width || CONTENT_W;
      const x = opts.x || MARGIN;
      const lines = doc.splitTextToSize(text, width);
      const lh = size * 1.42;
      ensureSpace(lines.length * lh + 6);
      doc.text(lines, x, y);
      y += lines.length * lh + (opts.spaceAfter !== undefined ? opts.spaceAfter : 10);
    }
    function calloutBox(label, text, accent) {
      accent = accent || GOLD;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      const bodyLines = doc.splitTextToSize(text, CONTENT_W - 30);
      const boxH = 30 + bodyLines.length * 13.5 + 8;
      ensureSpace(boxH + 14);
      doc.setFillColor.apply(doc, CREAM);
      doc.rect(MARGIN, y, CONTENT_W, boxH, 'F');
      doc.setFillColor.apply(doc, accent);
      doc.rect(MARGIN, y, 3.5, boxH, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.setTextColor.apply(doc, accent);
      doc.text(label.toUpperCase(), MARGIN + 14, y + 17);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.setTextColor.apply(doc, DARK);
      doc.text(bodyLines, MARGIN + 14, y + 33);
      y += boxH + 16;
    }
    function bulletList(items) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      items.forEach(function(item) {
        const lines = doc.splitTextToSize(item, CONTENT_W - 16);
        const lh = 14;
        ensureSpace(lines.length * lh + 4);
        doc.setTextColor.apply(doc, GOLD);
        doc.text('•', MARGIN, y);
        doc.setTextColor.apply(doc, DARK);
        doc.text(lines, MARGIN + 14, y);
        y += lines.length * lh + 5;
      });
      y += 6;
    }
    function tableBlock(headers, rowsArr, colWidths) {
      ensureSpace(26);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.setFillColor.apply(doc, DARK);
      doc.rect(MARGIN, y, CONTENT_W, 22, 'F');
      doc.setTextColor.apply(doc, WHITE);
      let cx = MARGIN + 8;
      headers.forEach(function(h, i) { doc.text(h.toUpperCase(), cx, y + 14); cx += colWidths[i]; });
      y += 22;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      rowsArr.forEach(function(r, ri) {
        const wrapped = r.map(function(cell, ci) { return doc.splitTextToSize(cell || '—', colWidths[ci] - 14); });
        const maxLines = Math.max.apply(null, wrapped.map(function(w) { return w.length; }));
        const rowH = Math.max(24, maxLines * 12.5 + 12);
        ensureSpace(rowH);
        if (ri % 2 === 1) { doc.setFillColor.apply(doc, CREAM); doc.rect(MARGIN, y, CONTENT_W, rowH, 'F'); }
        doc.setTextColor.apply(doc, DARK);
        cx = MARGIN + 8;
        wrapped.forEach(function(w, ci) { doc.text(w, cx, y + 14); cx += colWidths[ci]; });
        doc.setDrawColor.apply(doc, LIGHT); doc.setLineWidth(0.5);
        doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);
        y += rowH;
      });
      y += 16;
    }
    function swotQuadrant(x, w, title, text, accent) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      const bodyLines = doc.splitTextToSize(text || 'Not yet filled in.', w - 24);
      const boxH = 34 + bodyLines.length * 13;
      doc.setDrawColor.apply(doc, accent); doc.setLineWidth(1.2);
      doc.rect(x, y, w, boxH);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      doc.setTextColor.apply(doc, accent);
      doc.text(doc.splitTextToSize(title.toUpperCase(), w - 24), x + 12, y + 18);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.setTextColor.apply(doc, DARK);
      doc.text(bodyLines, x + 12, y + 34);
      return boxH;
    }

    // ================= PAGE 1: COVER =================
    doc.setFillColor.apply(doc, DARK);
    doc.rect(MARGIN, 100, CONTENT_W, 92, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(25); doc.setTextColor.apply(doc, WHITE);
    doc.text(doc.splitTextToSize(companyName.toUpperCase(), CONTENT_W - 40), MARGIN + 20, 100 + 38);
    doc.setFontSize(14); doc.setTextColor.apply(doc, GOLD);
    doc.text('WEBSITE COMPETITOR ANALYSIS', MARGIN + 20, 100 + 62);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor.apply(doc, LIGHT);
    const subLine = [marketVal, dateVal].filter(Boolean).join('   |   ');
    if (subLine) doc.text(subLine, MARGIN + 20, 100 + 80);

    y = 100 + 92 + 50;
    calloutBox('Objective', objective || ('Identify the strongest website practices in the local competitive set and translate them into a focused, ownable strategy for ' + companyName + '.'), GOLD);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor.apply(doc, DARK);
    doc.text('PREPARED FROM:', MARGIN, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const preparedText = 'Website competitor research for ' + companyName + ' against ' + names.filter(Boolean).join(', ') + '.';
    const preparedLines = doc.splitTextToSize(preparedText, CONTENT_W - 100);
    doc.text(preparedLines, MARGIN + 92, y);
    y += preparedLines.length * 13 + 10;
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, GRAY);
    doc.text(doc.splitTextToSize('Note: this is a qualitative website audit synthesized from manual review, not an automated analytics report.', CONTENT_W), MARGIN, y);

    // ================= PAGE 2: EXECUTIVE OVERVIEW =================
    newPage();
    sectionHeader('Executive Overview');
    paragraph('What the competitive set reveals about ' + companyName + "'s website opportunity", { size: 10.5, italic: true, color: GRAY, spaceAfter: 12 });
    if (insightText) calloutBox('Core Finding', insightText, GOLD);

    paragraph('Competitive lessons', { size: 13, bold: true, spaceAfter: 8 });
    const lessonsRows = names.map(function(name, i) {
      return [name, rowText('value-prop', i) || rowText('tech-stack', i), rowText('takeaway', i)];
    });
    tableBlock(['Brand', 'What it does especially well', 'Lesson for ' + companyName], lessonsRows, [CONTENT_W * 0.2, CONTENT_W * 0.42, CONTENT_W * 0.38]);

    if (priorities.length) {
      paragraph('Immediate priorities', { size: 13, bold: true, spaceAfter: 8 });
      bulletList(priorities);
    }

    // ================= COMPETITOR FINDINGS (one section per competitor) =================
    newPage();
    sectionHeader('Competitor Findings');
    paragraph(names.length + ' competitors, ' + names.length + ' different lessons', { size: 10.5, italic: true, color: GRAY, spaceAfter: 10 });

    names.forEach(function(name, i) {
      ensureSpace(60);
      const barH = 22;
      doc.setFillColor.apply(doc, DARK);
      doc.rect(MARGIN, y, CONTENT_W, barH, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor.apply(doc, WHITE);
      doc.text(name, MARGIN + 10, y + 15);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, GOLD);
      doc.text((tiers[i] || '').toUpperCase(), MARGIN + CONTENT_W - 10, y + 15, { align: 'right' });
      y += barH + 10;

      const highlightRows = ['value-prop', 'tech-stack', 'social-proof', 'load-speed'];
      const bullets = highlightRows.map(function(key) {
        const label = (TABLE_ROWS.find(function(r) { return r.key === key; }) || {}).label || key;
        const text = rowText(key, i);
        return text ? (label + ': ' + text) : null;
      }).filter(Boolean);
      bulletList(bullets);

      const takeaway = rowText('takeaway', i);
      if (takeaway) calloutBox(name.toUpperCase() + ' TAKEAWAY', takeaway, GOLD);
      y += 6;
    });

    // ================= SWOT / POSITIONING =================
    newPage();
    sectionHeader('SWOT — Gaps & Opportunities');
    const colW = (CONTENT_W - 14) / 2;
    ensureSpace(140);
    let rowTop = y;
    const hS = swotQuadrant(MARGIN, colW, 'Strengths (You vs. Them)', swot.s, GREEN);
    const hW = swotQuadrant(MARGIN + colW + 14, colW, 'Weaknesses (To Address)', swot.w, RED);
    y = rowTop + Math.max(hS, hW) + 14;
    ensureSpace(140);
    rowTop = y;
    const hO = swotQuadrant(MARGIN, colW, 'Opportunities (Market Gaps)', swot.o, BLUE);
    const hT = swotQuadrant(MARGIN + colW + 14, colW, 'Threats (To Watch)', swot.t, PINK);
    y = rowTop + Math.max(hO, hT) + 24;

    // ================= APPENDIX: FULL CATEGORY COMPARISON =================
    newPage();
    sectionHeader('Appendix: Full Category Comparison');
    paragraph('Supporting detail behind the findings above', { size: 10.5, italic: true, color: GRAY, spaceAfter: 10 });
    const appendixRows = TABLE_ROWS.filter(function(r) { return r.key !== 'takeaway'; }).map(function(r) {
      return [r.label, rowText(r.key, 0), rowText(r.key, 1), rowText(r.key, 2)];
    });
    tableBlock(['Category', names[0], names[1], names[2]], appendixRows, [CONTENT_W * 0.16, CONTENT_W * 0.28, CONTENT_W * 0.28, CONTENT_W * 0.28]);

    // ================= CONCLUSION =================
    newPage();
    sectionHeader('Conclusion');
    paragraph('The strategic opportunity is synthesis, not imitation', { size: 10.5, italic: true, color: GRAY, spaceAfter: 10 });
    const borrowRows = names.map(function(name, i) { return [rowText('takeaway', i) || '—', name]; });
    tableBlock(['Borrow', 'From'], borrowRows, [CONTENT_W * 0.68, CONTENT_W * 0.32]);
    if (conclusion) calloutBox('Bottom Line', conclusion, GOLD);
    paragraph('Prepared for internal strategy discussion.', { size: 8.5, italic: true, color: GRAY, spaceAfter: 0 });

    footer();
    doc.save((companyName.replace(/[^a-z0-9]+/gi, '_') || 'Website') + '_Competitor_Analysis.pdf');
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
    insight.textContent = 'Write your main conclusion — where to position your website, how to improve conversion, and key features to implement.';
  }

  // Clear parent state if connected
  if (isEmbedded && webComp) {
    const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    webComp.market = "";
    webComp.date = today;
    webComp.names = ["Competitor A", "Competitor B", "Competitor C"];
    webComp.insight = "";
    webComp.swot = { s: "", w: "", o: "", t: "" };
    webComp.stars = [0, 0, 0];
    
    TABLE_ROWS.forEach(row => {
      webComp.rows[row.key] = ["", "", ""];
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
