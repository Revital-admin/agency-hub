
let isEmbedded = false;
let parentClient = null;
try {
  if (window.parent && typeof window.parent.getActiveClient === 'function') {
    isEmbedded = true;
    parentClient = window.parent.getActiveClient();
  }
} catch (e) {
  console.log("Embedded check bypassed due to CORS");
}

// Guidance placeholders pulled from the DTC Mode Creative Strategy Playbook,
// used only as input placeholders (not stored values) so a fresh client
// starts from real guidance instead of a blank table.
const FUNNEL_STAGES = [
  { key: "awareness", label: "Awareness", need: "Relevance and recognition", job: "Frame the problem, earn attention. Don't lead with the product.", formats: "Short-form video, creator story, problem-led static" },
  { key: "consideration", label: "Consideration", need: "Understanding and trust", job: "Explain the mechanism, provide proof. They know what you do — now show why it works.", formats: "Demo, review-led content, educational email" },
  { key: "conversion", label: "Conversion", need: "Confidence and clarity", job: "Remove friction, make the action feel obvious. More education won't close this.", formats: "Direct response ad, offer email, PDP proof module" },
  { key: "retention", label: "Retention", need: "Value and connection", job: "Build habit, deepen relationship, invite advocacy. Don't sell at them like a new prospect.", formats: "Onboarding email, tips content, UGC prompt" },
];

const CHANNELS = [
  { key: "organic", label: "Organic Social", hook: "Native, low-production, personal", format: "Short-form video, series-led", job: "Build attention and trust over time; collect proof for other channels" },
  { key: "paid", label: "Paid Social", hook: "Works in first 2 seconds", format: "Video, static, fast and direct", job: "Targeted persuasion — one job per asset" },
  { key: "google", label: "Google", hook: "Matches the exact search language", format: "Specific, relevant headline", job: "Capture intent already in motion" },
  { key: "email", label: "Email", hook: "Specific promise, question, or tension", format: "Narrative, educational, sequenced", job: "Build understanding and trust over the relationship" },
  { key: "website", label: "Website", hook: "Matches the message that brought them here", format: "Clear hierarchy, proof near the CTA", job: "Convert the attention and trust built everywhere else" },
];

function defaultState() {
  return {
    stack: {
      businessGoal: "", funnelStage: "", audience: "", problem: "",
      mechanism: "", proof: "", message: "", concept: "", format: "", reusePlan: ""
    },
    funnelPlan: {},
    goldenThread: {
      coreMessage: "", creativeExpression: "", channels: {}
    },
    taxonomyTags: []
  };
}

let state = defaultState();

function loadState() {
  if (isEmbedded && parentClient && parentClient.creativeStrategy) {
    const saved = parentClient.creativeStrategy;
    state = {
      stack: Object.assign(defaultState().stack, saved.stack || {}),
      funnelPlan: saved.funnelPlan || {},
      goldenThread: {
        coreMessage: (saved.goldenThread && saved.goldenThread.coreMessage) || "",
        creativeExpression: (saved.goldenThread && saved.goldenThread.creativeExpression) || "",
        channels: (saved.goldenThread && saved.goldenThread.channels) || {}
      },
      taxonomyTags: saved.taxonomyTags || []
    };
  }
}

function persist() {
  if (isEmbedded && parentClient) {
    parentClient.creativeStrategy = state;
    window.parent.saveDatabase();
  }
}

function el(id) { return document.getElementById(id); }

function renderStackForm() {
  el('stackGoal').value = state.stack.businessGoal;
  el('stackFunnelStage').value = state.stack.funnelStage;
  el('stackAudience').value = state.stack.audience;
  el('stackProblem').value = state.stack.problem;
  el('stackMechanism').value = state.stack.mechanism;
  el('stackProof').value = state.stack.proof;
  el('stackMessage').value = state.stack.message;
  el('stackConcept').value = state.stack.concept;
  el('stackFormat').value = state.stack.format;
  el('stackReuse').value = state.stack.reusePlan;

  const map = {
    stackGoal: 'businessGoal', stackFunnelStage: 'funnelStage', stackAudience: 'audience',
    stackProblem: 'problem', stackMechanism: 'mechanism', stackProof: 'proof',
    stackMessage: 'message', stackConcept: 'concept', stackFormat: 'format', stackReuse: 'reusePlan'
  };
  Object.keys(map).forEach(id => {
    el(id).addEventListener('input', () => {
      state.stack[map[id]] = el(id).value;
      persist();
    });
  });
}

function renderFunnelTable() {
  const tbody = el('funnelTableBody');
  tbody.innerHTML = FUNNEL_STAGES.map(stage => {
    const row = state.funnelPlan[stage.key] || {};
    return `<tr>
      <td class="stage-cell">${stage.label}</td>
      <td><textarea rows="2" data-stage="${stage.key}" data-field="need" placeholder="${escapeHtml(stage.need)}">${escapeHtml(row.need || '')}</textarea></td>
      <td><textarea rows="2" data-stage="${stage.key}" data-field="job" placeholder="${escapeHtml(stage.job)}">${escapeHtml(row.job || '')}</textarea></td>
      <td><textarea rows="2" data-stage="${stage.key}" data-field="formats" placeholder="${escapeHtml(stage.formats)}">${escapeHtml(row.formats || '')}</textarea></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('textarea').forEach(ta => {
    ta.addEventListener('input', () => {
      const stageKey = ta.getAttribute('data-stage');
      const field = ta.getAttribute('data-field');
      if (!state.funnelPlan[stageKey]) state.funnelPlan[stageKey] = {};
      state.funnelPlan[stageKey][field] = ta.value;
      persist();
    });
  });
}

function renderThreadForm() {
  el('threadCoreMessage').value = state.goldenThread.coreMessage;
  el('threadExpression').value = state.goldenThread.creativeExpression;
  el('threadCoreMessage').addEventListener('input', () => {
    state.goldenThread.coreMessage = el('threadCoreMessage').value;
    persist();
  });
  el('threadExpression').addEventListener('input', () => {
    state.goldenThread.creativeExpression = el('threadExpression').value;
    persist();
  });

  const tbody = el('threadTableBody');
  tbody.innerHTML = CHANNELS.map(ch => {
    const row = state.goldenThread.channels[ch.key] || {};
    return `<tr>
      <td class="stage-cell">${ch.label}</td>
      <td><textarea rows="2" data-channel="${ch.key}" data-field="hook" placeholder="${escapeHtml(ch.hook)}">${escapeHtml(row.hook || '')}</textarea></td>
      <td><textarea rows="2" data-channel="${ch.key}" data-field="format" placeholder="${escapeHtml(ch.format)}">${escapeHtml(row.format || '')}</textarea></td>
      <td><textarea rows="2" data-channel="${ch.key}" data-field="job" placeholder="${escapeHtml(ch.job)}">${escapeHtml(row.job || '')}</textarea></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('textarea').forEach(ta => {
    ta.addEventListener('input', () => {
      const chKey = ta.getAttribute('data-channel');
      const field = ta.getAttribute('data-field');
      if (!state.goldenThread.channels[chKey]) state.goldenThread.channels[chKey] = {};
      state.goldenThread.channels[chKey][field] = ta.value;
      persist();
    });
  });
}

function renderTaxonomyTable() {
  const tbody = el('taxonomyTableBody');
  const empty = el('taxonomyEmptyState');
  if (!state.taxonomyTags.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = state.taxonomyTags.map((tag, idx) => `
    <tr>
      <td class="asset-cell">${escapeHtml(tag.asset || '')}</td>
      <td>${escapeHtml(tag.audience || '')}</td>
      <td>${escapeHtml(tag.angle || '')}</td>
      <td>${escapeHtml(tag.mechanism || '')}</td>
      <td>${escapeHtml(tag.format || '')}</td>
      <td>${escapeHtml(tag.hook || '')}</td>
      <td>${escapeHtml(tag.proof || '')}</td>
      <td>${escapeHtml(tag.offer || '')}</td>
      <td>${escapeHtml(tag.funnelStage || '')}</td>
      <td>${escapeHtml(tag.channel || '')}</td>
      <td class="row-actions"><button type="button" data-remove="${idx}">Remove</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-remove'), 10);
      state.taxonomyTags.splice(idx, 1);
      persist();
      renderTaxonomyTable();
    });
  });
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function wireAddTag() {
  el('addTagBtn').addEventListener('click', () => {
    const asset = el('tagAsset').value.trim();
    if (!asset) { el('tagAsset').focus(); return; }
    state.taxonomyTags.push({
      asset,
      audience: el('tagAudience').value.trim(),
      angle: el('tagAngle').value.trim(),
      mechanism: el('tagMechanism').value.trim(),
      format: el('tagFormat').value.trim(),
      hook: el('tagHook').value.trim(),
      proof: el('tagProof').value.trim(),
      offer: el('tagOffer').value.trim(),
      funnelStage: el('tagFunnelStage').value,
      channel: el('tagChannel').value.trim(),
      dateAdded: new Date().toISOString()
    });
    ['tagAsset','tagAudience','tagAngle','tagMechanism','tagFormat','tagHook','tagProof','tagOffer','tagChannel'].forEach(id => el(id).value = '');
    el('tagFunnelStage').value = '';
    persist();
    renderTaxonomyTable();
  });
}

function wireTabs() {
  const buttons = document.querySelectorAll('.csb-tabs button[data-panel]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      document.querySelectorAll('.csb-panel').forEach(p => p.style.display = 'none');
      el(btn.getAttribute('data-panel')).style.display = 'block';
    });
  });
}

function buildStrategyMarkdown() {
  const clientName = (isEmbedded && parentClient && parentClient.name) ? parentClient.name : '[Client Name]';
  const s = state.stack;
  const t = state.goldenThread;

  let md = `# Creative Strategy: ${clientName}\n\n`;

  md += `## The Creative Strategy Stack\n`;
  md += `**Business goal:** ${s.businessGoal || '—'}\n\n`;
  md += `**Funnel stage:** ${s.funnelStage || '—'}\n\n`;
  md += `**Audience:** ${s.audience || '—'}\n\n`;
  md += `**Problem/desire:** ${s.problem || '—'}\n\n`;
  md += `**Product mechanism:** ${s.mechanism || '—'}\n\n`;
  md += `**Proof:** ${s.proof || '—'}\n\n`;
  md += `**Message:** ${s.message || '—'}\n\n`;
  md += `**Concept:** ${s.concept || '—'}\n\n`;
  md += `**Format:** ${s.format || '—'}\n\n`;
  md += `**Reuse plan:** ${s.reusePlan || '—'}\n\n`;

  md += `## Funnel Stage Plan\n`;
  FUNNEL_STAGES.forEach(stage => {
    const row = state.funnelPlan[stage.key] || {};
    md += `**${stage.label}** — Needs: ${row.need || '—'}. Creative should: ${row.job || '—'}. Formats: ${row.formats || '—'}.\n\n`;
  });

  md += `## The Golden Thread\n`;
  md += `**Core message:** ${t.coreMessage || '—'}\n\n`;
  md += `**Creative expression:** ${t.creativeExpression || '—'}\n\n`;
  CHANNELS.forEach(ch => {
    const row = t.channels[ch.key] || {};
    md += `**${ch.label}** — Hook: ${row.hook || '—'}. Format: ${row.format || '—'}. Job: ${row.job || '—'}.\n\n`;
  });

  if (state.taxonomyTags.length) {
    md += `## Tagged Assets\n`;
    state.taxonomyTags.forEach(tag => {
      md += `- **${tag.asset}** — audience: ${tag.audience || '—'}, angle: ${tag.angle || '—'}, mechanism: ${tag.mechanism || '—'}, format: ${tag.format || '—'}, hook: ${tag.hook || '—'}, proof: ${tag.proof || '—'}, offer: ${tag.offer || '—'}, stage: ${tag.funnelStage || '—'}, channel: ${tag.channel || '—'}\n`;
    });
  }

  md += `\n---\n*Generated via Revital Hub - Creative Strategy Builder*\n`;
  return md;
}

function wireCopyBtn() {
  el('copyBriefBtn').addEventListener('click', () => {
    const md = buildStrategyMarkdown();
    navigator.clipboard.writeText(md).then(() => {
      const original = el('copyBriefBtn').innerHTML;
      el('copyBriefBtn').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
      setTimeout(() => { el('copyBriefBtn').innerHTML = original; }, 2000);
    });
  });
}

// Download PDF - a real leave-behind document, unlike Copy Full Strategy
// above (only useful once pasted somewhere else). No live-rendered
// preview panel to reuse here (unlike creative-brief-generator/
// ad-campaign-brief), so this runs buildStrategyMarkdown() through
// marked.parse() itself (already loaded for consistency, even though
// this tool doesn't otherwise use it for an on-screen preview), then
// restyles the result dark-on-white for the exported document. Same
// html2pdf pattern as every other Download PDF button in the Hub.
function wireDownloadPdfBtn() {
  const btn = el('downloadPdfBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span>Generating...</span>';

    const clientName = (isEmbedded && parentClient && parentClient.name) ? parentClient.name : 'Client';
    // Strip the markdown's own leading "# Creative Strategy: ..." title
    // line - the container below builds its own styled h1 for that, so
    // parsing it as-is would print the same title twice.
    const mdBody = buildStrategyMarkdown().replace(/^#\s+Creative Strategy:.*\n+/, '');
    const bodyHtml = (typeof marked !== 'undefined') ? marked.parse(mdBody) : `<pre>${mdBody}</pre>`;

    const container = document.createElement('div');
    container.style.cssText = 'font-family: "Inter", sans-serif, Arial; color:#1e293b; font-size:14px; line-height:1.6; width:100%; padding:40px; box-sizing:border-box; background:white;';
    container.innerHTML = `
      <img src="assets/logo.png" onerror="this.src='../logo.png'" alt="Revital Hub" style="height:50px; width:144px; object-fit:contain; margin-bottom:30px;">
      <h1 style="font-size:26px; font-weight:700; color:#0f172a; border-bottom:4px solid #f59e0b; padding-bottom:16px; margin-bottom:20px;">Creative Strategy: ${clientName}</h1>
      <p style="color:#64748b; font-size:13px; margin-bottom:24px;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      <div>${bodyHtml}</div>
    `;
    container.querySelectorAll('h2').forEach(h => h.style.cssText = 'font-size:16px; color:#0f172a; border-bottom:2px solid #e2e8f0; padding-bottom:6px; margin:20px 0 10px;');
    container.querySelectorAll('p, li, strong').forEach(elx => { elx.style.color = '#334155'; });
    container.querySelectorAll('hr').forEach(elx => elx.style.cssText = 'border:none; border-top:1px solid #e2e8f0; margin:24px 0;');
    container.querySelectorAll('em').forEach(elx => { elx.style.color = '#94a3b8'; });

    try {
      const opt = {
        margin: 0,
        filename: `Creative_Strategy_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: { scale: 2, letterRendering: true, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      };
      if (typeof html2pdf !== 'undefined') {
        await html2pdf().set(opt).from(container).save();
      } else {
        alert("PDF library failed to load.");
      }
    } catch (e) {
      console.error("PDF error:", e);
      alert("Something went wrong generating the PDF.");
    }

    btn.disabled = false;
    btn.innerHTML = origHtml;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  if (isEmbedded && parentClient) {
    el('clientNameLabel').textContent = parentClient.name ? `Creative planning — ${parentClient.name}` : 'Creative planning';
  }
  renderStackForm();
  renderFunnelTable();
  renderThreadForm();
  renderTaxonomyTable();
  wireAddTag();
  wireTabs();
  wireCopyBtn();
});
