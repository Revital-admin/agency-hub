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

  // Competitor website + social handle (shown in the PDF report)
  const siteInputs = document.querySelectorAll('.comp-site');
  const handleInputs = document.querySelectorAll('.comp-handle');
  if (isEmbedded && webComp) {
    if (!Array.isArray(webComp.sites)) webComp.sites = ['', '', ''];
    if (!Array.isArray(webComp.handles)) webComp.handles = ['', '', ''];
    siteInputs.forEach(function(input, idx) {
      input.value = webComp.sites[idx] || '';
      input.addEventListener('input', function() { webComp.sites[idx] = input.value; window.parent.saveDatabase(); });
    });
    handleInputs.forEach(function(input, idx) {
      input.value = webComp.handles[idx] || '';
      input.addEventListener('input', function() { webComp.handles[idx] = input.value; window.parent.saveDatabase(); });
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

    // Competitor website + handle (entered under each competitor name)
    function listVal(arr, sel, i) {
      const v = (arr && arr[i]) ? String(arr[i]).trim() : '';
      if (v) return v;
      const els = document.querySelectorAll(sel);
      return els[i] ? els[i].value.trim() : '';
    }
    const sites = [0, 1, 2].map(function(i) { return listVal(webComp && webComp.sites, '.comp-site', i); });
    const handles = [0, 1, 2].map(function(i) {
      const v = listVal(webComp && webComp.handles, '.comp-handle', i);
      return v && !/^@/.test(v) && !/[\/.]/.test(v) ? '@' + v : v;
    });
    const siteLabel = function(s) { return s.replace(/^https?:\/\//i, '').replace(/\/$/, ''); };
    const siteHref = function(s) { return /^https?:\/\//i.test(s) ? s : 'https://' + s; };

    const r = RevitalPDF.create({ reportTitle: 'WEBSITE COMPETITOR ANALYSIS', companyName: companyName });
    const doc = r.doc;
    const C = r.colors;

    // ================= COVER =================
    function drawContactLine(i, extra) {
      const parts = [];
      if (handles[i]) parts.push({ t: handles[i] });
      if (extra) parts.push({ t: extra });
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
      title: 'Website Competitor Analysis',
      subLine: [marketVal, dateVal].filter(Boolean).join('   |   '),
      objective: objective || ('Identify the strongest website practices in the local competitive set and translate them into a focused, ownable strategy for ' + companyName + '.'),
      preparedFrom: 'Website competitor research for ' + companyName + ' against ' + names.filter(Boolean).join(', ') + '.',
      note: 'Note: this is a qualitative website audit synthesized from manual review, not an automated analytics report.',
    });

    // ================= EXECUTIVE OVERVIEW =================
    r.newPage();
    r.sectionHeader('Executive Overview');
    r.paragraph('What the competitive set reveals about ' + companyName + "'s website opportunity", { size: 10.5, italic: true, color: C.GRAY, spaceAfter: 12 });
    if (insightText) r.calloutBox('Core Finding', insightText);

    r.paragraph('Competitive lessons', { size: 13, bold: true, spaceAfter: 8 });
    const lessonsRows = names.map(function(name, i) {
      return [name, rowText('value-prop', i) || rowText('tech-stack', i), rowText('takeaway', i)];
    });
    r.tableBlock(['Brand', 'What it does especially well', 'Lesson for ' + companyName], lessonsRows, [r.CONTENT_W * 0.2, r.CONTENT_W * 0.42, r.CONTENT_W * 0.38]);

    if (sites.some(Boolean) || handles.some(Boolean)) {
      r.paragraph('Who we reviewed', { size: 13, bold: true, spaceAfter: 8 });
      r.tableBlock(['Tier', 'Brand', 'Handle', 'Website'],
        names.map(function(n, i) { return [tiers[i], n, handles[i] || '-', sites[i] ? siteLabel(sites[i]) : '-']; }),
        [r.CONTENT_W * 0.18, r.CONTENT_W * 0.28, r.CONTENT_W * 0.24, r.CONTENT_W * 0.30]);
    }

    if (priorities.length) {
      r.paragraph('Immediate priorities', { size: 13, bold: true, spaceAfter: 8 });
      r.bulletList(priorities);
    }

    // ================= COMPETITOR FINDINGS (one section per competitor) =================
    r.newPage();
    r.sectionHeader('Competitor Findings');
    r.paragraph(names.length + ' competitors, ' + names.length + ' different lessons', { size: 10.5, italic: true, color: C.GRAY, spaceAfter: 10 });

    names.forEach(function(name, i) {
      r.ensureSpace(60);
      const barH = 22;
      doc.setFillColor.apply(doc, C.DARK);
      doc.rect(r.MARGIN, r.y, r.CONTENT_W, barH, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor.apply(doc, C.WHITE);
      doc.text(name, r.MARGIN + 10, r.y + 15);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, C.ACCENT);
      doc.text((tiers[i] || '').toUpperCase(), r.MARGIN + r.CONTENT_W - 10, r.y + 15, { align: 'right' });
      r.y = r.y + barH + 10;
      drawContactLine(i, '');

      const highlightRows = ['value-prop', 'tech-stack', 'social-proof', 'load-speed'];
      const bullets = highlightRows.map(function(key) {
        const label = (TABLE_ROWS.find(function(rr) { return rr.key === key; }) || {}).label || key;
        const text = rowText(key, i);
        return text ? (label + ': ' + text) : null;
      }).filter(Boolean);
      r.bulletList(bullets);

      const takeaway = rowText('takeaway', i);
      if (takeaway) r.calloutBox(name.toUpperCase() + ' TAKEAWAY', takeaway);
      r.y = r.y + 6;
    });

    // ================= SWOT / POSITIONING =================
    r.newPage();
    r.sectionHeader('SWOT — Gaps & Opportunities');
    r.ensureSpace(140);
    r.quadrantRow([
      { title: 'Strengths (You vs. Them)', text: swot.s, accent: C.GREEN },
      { title: 'Weaknesses (To Address)', text: swot.w, accent: C.RED },
    ]);
    r.y = r.y + 14;
    r.ensureSpace(140);
    r.quadrantRow([
      { title: 'Opportunities (Market Gaps)', text: swot.o, accent: C.BLUE },
      { title: 'Threats (To Watch)', text: swot.t, accent: C.PINK },
    ]);
    r.y = r.y + 24;

    // ================= APPENDIX: FULL CATEGORY COMPARISON =================
    r.newPage();
    r.sectionHeader('Appendix: Full Category Comparison');
    r.paragraph('Supporting detail behind the findings above', { size: 10.5, italic: true, color: C.GRAY, spaceAfter: 10 });
    const appendixRows = TABLE_ROWS.filter(function(rr) { return rr.key !== 'takeaway'; }).map(function(rr) {
      return [rr.label, rowText(rr.key, 0), rowText(rr.key, 1), rowText(rr.key, 2)];
    });
    r.tableBlock(['Category', names[0], names[1], names[2]], appendixRows, [r.CONTENT_W * 0.16, r.CONTENT_W * 0.28, r.CONTENT_W * 0.28, r.CONTENT_W * 0.28]);

    // ================= CONCLUSION =================
    r.newPage();
    r.sectionHeader('Conclusion');
    r.paragraph('The strategic opportunity is synthesis, not imitation', { size: 10.5, italic: true, color: C.GRAY, spaceAfter: 10 });
    const borrowRows = names.map(function(name, i) { return [rowText('takeaway', i) || '—', name]; });
    r.tableBlock(['Borrow', 'From'], borrowRows, [r.CONTENT_W * 0.68, r.CONTENT_W * 0.32]);
    if (conclusion) r.calloutBox('Bottom Line', conclusion);
    r.paragraph('Prepared for internal strategy discussion.', { size: 8.5, italic: true, color: C.GRAY, spaceAfter: 0 });

    r.save((companyName.replace(/[^a-z0-9]+/gi, '_') || 'Website') + '_Competitor_Analysis.pdf');
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
    webComp.sites = ["", "", ""];
    webComp.handles = ["", "", ""];
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
