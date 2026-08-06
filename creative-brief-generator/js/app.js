
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
document.addEventListener('DOMContentLoaded', () => {
  const inputs = document.querySelectorAll('input, select, textarea');

  // Load state from parent
  if (isEmbedded && parentClient && parentClient.creativeBrief) {
    const state = parentClient.creativeBrief;
    if (state.campaignName) document.getElementById('campaignName').value = state.campaignName;
    if (state.objective) document.getElementById('objective').value = state.objective;
    if (state.targetAudience) document.getElementById('targetAudience').value = state.targetAudience;
    if (state.keyMessage) document.getElementById('keyMessage').value = state.keyMessage;
    if (state.toneOfVoice) document.getElementById('toneOfVoice').value = state.toneOfVoice;
    if (state.deliverables) document.getElementById('deliverables').value = state.deliverables;
    if (state.references) document.getElementById('references').value = state.references;
  }
  // Force sync client name from parent if embedded
  if (isEmbedded && parentClient) {
    document.getElementById('clientName').value = parentClient.name || '';
  }

  const previewContainer = document.getElementById('previewContainer');
  const copyBtn = document.getElementById('copyBtn');
  let currentMarkdown = '';

  function generateMarkdown() {
    const campaignName = document.getElementById('campaignName').value || '[Campaign Name]';
    const clientName = document.getElementById('clientName').value || '[Client Name]';
    const objective = document.getElementById('objective').value;
    const targetAudience = document.getElementById('targetAudience').value || '[Target Audience]';
    const keyMessage = document.getElementById('keyMessage').value || '[Key Message]';
    const toneOfVoice = document.getElementById('toneOfVoice').value;
    const deliverables = document.getElementById('deliverables').value || '[Deliverables list]';
    const references = document.getElementById('references').value || '[No references provided]';

    const md = `# 🎬 Creative Brief: ${campaignName}

**Client:** ${clientName}
**Primary Objective:** ${objective}

## 🎯 Target Audience
> ${targetAudience}

## 💡 Key Message / Value Proposition
${keyMessage}

## 🗣️ Tone of Voice
**${toneOfVoice}**

## 📦 Required Deliverables
${deliverables}

## 🔗 Inspiration & References
${references}

---
*Generated via Revital Hub - Creative Brief Generator*
`;

    // Save raw markdown for copying
    currentMarkdown = md;
    
    // Render HTML preview using marked.js
    previewContainer.innerHTML = marked.parse(md);

    // Save to parent
    if (isEmbedded && parentClient) {
      parentClient.creativeBrief = {
        campaignName: document.getElementById('campaignName').value,
        objective: document.getElementById('objective').value,
        targetAudience: document.getElementById('targetAudience').value,
        keyMessage: document.getElementById('keyMessage').value,
        toneOfVoice: document.getElementById('toneOfVoice').value,
        deliverables: document.getElementById('deliverables').value,
        references: document.getElementById('references').value
      };
      window.parent.saveDatabase();
    }
  }

  // Update preview on any input change
  inputs.forEach(input => {
    input.addEventListener('input', generateMarkdown);
  });

  // Initial generation
  generateMarkdown();

  // Copy functionality
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentMarkdown).then(() => {
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
      copyBtn.style.background = '#10b981'; // green

      setTimeout(() => {
        copyBtn.innerHTML = originalText;
        copyBtn.style.background = '';
      }, 2000);
    });
  });

  // Download PDF - a real leave-behind document, unlike Copy for ClickUp
  // above (which only helps once it's pasted somewhere else). Re-parses
  // currentMarkdown with its own leading "# ... Creative Brief: ..." title
  // line stripped out (the container below builds its own styled h1 for
  // that - reusing previewContainer.innerHTML as-is would print the title
  // twice, since marked.js already turned that line into an h1 there),
  // then restyles the result dark-on-white since the live preview relies
  // on the Hub's dark-theme CSS variables, which won't be present in the
  // exported document. Same html2pdf pattern (white page, Revital Hub
  // logo header) as the audit tools' Download PDF buttons.
  const downloadPdfBtn = document.getElementById('downloadPdfBtn');
  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', async () => {
      downloadPdfBtn.disabled = true;
      const origHtml = downloadPdfBtn.innerHTML;
      downloadPdfBtn.innerHTML = '<span>Generating...</span>';

      const campaignName = document.getElementById('campaignName').value || 'Creative Brief';
      const clientName = document.getElementById('clientName').value || 'Client';
      const mdBody = currentMarkdown.replace(/^#.*Creative Brief:.*\n+/, '');
      const bodyHtml = (typeof marked !== 'undefined') ? marked.parse(mdBody) : `<pre>${mdBody}</pre>`;

      const container = document.createElement('div');
      container.style.cssText = 'font-family: "Inter", sans-serif, Arial; color:#1e293b; font-size:14px; line-height:1.6; width:100%; padding:40px; box-sizing:border-box; background:white;';
      container.innerHTML = `
        <img src="assets/logo.png" onerror="this.src='../logo.png'" alt="Revital Hub" style="height:50px; width:144px; object-fit:contain; margin-bottom:30px;">
        <h1 style="font-size:26px; font-weight:700; color:#0f172a; border-bottom:4px solid #f59e0b; padding-bottom:16px; margin-bottom:20px;">Creative Brief: ${campaignName}</h1>
        <p style="color:#64748b; font-size:13px; margin-bottom:24px;"><strong>Client:</strong> ${clientName} &nbsp;&middot;&nbsp; <strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        <div>${bodyHtml}</div>
      `;
      container.querySelectorAll('h2').forEach(h => h.style.cssText = 'font-size:16px; color:#0f172a; border-bottom:2px solid #e2e8f0; padding-bottom:6px; margin:20px 0 10px;');
      container.querySelectorAll('p, li, strong').forEach(elx => { elx.style.color = '#334155'; });
      container.querySelectorAll('blockquote').forEach(elx => elx.style.cssText = 'border-left:3px solid #3b82f6; padding-left:12px; color:#475569; margin:10px 0;');
      container.querySelectorAll('hr').forEach(elx => elx.style.cssText = 'border:none; border-top:1px solid #e2e8f0; margin:24px 0;');
      container.querySelectorAll('em').forEach(elx => { elx.style.color = '#94a3b8'; });

      try {
        const opt = {
          margin: 0,
          filename: `Creative_Brief_${campaignName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
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

      downloadPdfBtn.disabled = false;
      downloadPdfBtn.innerHTML = origHtml;
    });
  }
});