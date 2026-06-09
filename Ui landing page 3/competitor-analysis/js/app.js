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
  socialComp = parentClient.socialComp;
  // Initialize stars key in schema if it doesn't exist
  if (!socialComp.stars) {
    socialComp.stars = [0, 0, 0];
  }
}

/* ── Set today's date and sync meta fields ── */
(function initMetaFields() {
  const companyEl = document.getElementById('company');
  const dateEl = document.getElementById('date');
  const nicheEl = document.getElementById('niche');
  const preparedbyEl = document.getElementById('preparedby');

  if (isEmbedded) {
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
  if (isEmbedded && headerInputs.length === 3) {
    headerInputs.forEach(function(input, idx) {
      input.value = socialComp.names[idx] || '';
      input.addEventListener('input', function() {
        socialComp.names[idx] = input.value;
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
      if (isEmbedded && socialComp.rows[row.key]) {
        ta.value = socialComp.rows[row.key][compIdx] || '';
      }

      // Sync back on edit
      ta.addEventListener('input', function() {
        if (isEmbedded) {
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
    if (isEmbedded && socialComp.stars) {
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

        if (isEmbedded) {
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

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.id = 'chk-' + sw.key + '-' + idx;

      const lbl = document.createElement('label');
      lbl.setAttribute('for', 'chk-' + sw.key + '-' + idx);
      lbl.textContent = promptText;

      item.appendChild(chk);
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
    if (isEmbedded) {
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
      if (isEmbedded) {
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

  if (isEmbedded) {
    if (socialComp.insight) {
      insight.textContent = socialComp.insight;
    }

    insight.addEventListener('input', function() {
      socialComp.insight = insight.textContent;
      window.parent.saveDatabase();
    });
  }
})();

/* ── Download as PDF ── */
function downloadPDF() {
  // Hide action buttons so they don't appear in the PDF
  var actionRow = document.querySelector('.action-row');
  var controlsRow = document.querySelector('.controls-row');
  var promptToggles = document.querySelectorAll('.prompt-toggle');
  var promptPanels = document.querySelectorAll('.prompt-panel');

  if (actionRow) actionRow.style.display = 'none';
  if (controlsRow) controlsRow.style.display = 'none';
  promptToggles.forEach(function(el) { el.style.display = 'none'; });
  promptPanels.forEach(function(el) { el.style.display = 'none'; });

  window.print();

  // Restore after print dialog closes
  setTimeout(function() {
    if (actionRow) actionRow.style.display = '';
    if (controlsRow) controlsRow.style.display = '';
    promptToggles.forEach(function(el) { el.style.display = ''; });
  }, 1000);
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
  if (isEmbedded) {
    const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    socialComp.niche = "";
    socialComp.date = today;
    socialComp.names = ["Competitor A", "Competitor B", "Competitor C"];
    socialComp.insight = "";
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
