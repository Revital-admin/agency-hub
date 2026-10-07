
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

  // persist (default true): whether to also write the rebuilt state back
  // to the parent Hub's clientsDb via window.parent.saveDatabase() at the
  // end of this function. Every user-driven call site (the input-change
  // listeners below) wants that; the one-time init call right after this
  // function's definition does not - see the identical fix + full
  // explanation in proposal-calculator/js/app.js's calculate(). Short
  // version: this iframe gets a full reload every time ANY client data
  // changes anywhere in the Hub, and an unconditional save on that
  // reload's init call re-triggers another reload (here or in any other
  // open tab) even though nothing actually changed, looping fast enough
  // to exhaust Firestore's write stream with two tabs open.
  function generateMarkdown(persist = true) {
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
      if (persist) window.parent.saveDatabase();
    }
  }

  // Update preview on any input change
  inputs.forEach(input => {
    input.addEventListener('input', generateMarkdown);
  });

  // Initial generation - persist:false, this is just rendering from
  // whatever was just loaded above, not a real edit (see comment on the
  // function above)
  generateMarkdown(false);

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
  // above (which only helps once it's pasted somewhere else).
  // Oct 2026 rebuild: switched from re-parsing currentMarkdown into a
  // restyled HTML document for html2canvas/html2pdf to screenshot, to the
  // shared RevitalPDF module - see ../shared/pdf-report.js for the full
  // rationale. Reads the same field values directly instead of round-
  // tripping through markdown/marked.js.
  const downloadPdfBtn = document.getElementById('downloadPdfBtn');
  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', () => {
      if (typeof window.RevitalPDF === 'undefined') {
        alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
        return;
      }
      downloadPdfBtn.disabled = true;
      const origHtml = downloadPdfBtn.innerHTML;
      downloadPdfBtn.innerHTML = '<span>Generating...</span>';

      const campaignName = document.getElementById('campaignName').value || 'Creative Brief';
      const clientName = document.getElementById('clientName').value || 'Client';
      const objective = document.getElementById('objective').value;
      const targetAudience = document.getElementById('targetAudience').value;
      const keyMessage = document.getElementById('keyMessage').value;
      const toneOfVoice = document.getElementById('toneOfVoice').value;
      const deliverables = document.getElementById('deliverables').value;
      const references = document.getElementById('references').value;

      try {
        const r = RevitalPDF.create({ numbered: true,  reportTitle: 'CREATIVE BRIEF', companyName: clientName });
        const C = r.colors;

        r.coverPage({
          title: `Creative Brief: ${campaignName}`,
          subLine: new Date().toLocaleDateString(),
          objective: objective || undefined,
        });

        r.newPage();
        r.sectionHeader('Target Audience');
        r.paragraph(targetAudience || 'Not provided', { spaceAfter: 16 });

        r.sectionHeader('Key Message / Value Proposition');
        r.paragraph(keyMessage || 'Not provided', { spaceAfter: 16 });

        r.sectionHeader('Tone of Voice');
        r.paragraph(toneOfVoice || 'Not provided', { bold: true, spaceAfter: 16 });

        r.sectionHeader('Required Deliverables');
        r.paragraph(deliverables || 'Not provided', { spaceAfter: 16 });

        r.sectionHeader('Inspiration & References');
        r.paragraph(references || 'None provided', { spaceAfter: 16 });

        r.paragraph('Generated via Revital Hub - Creative Brief Generator', { italic: true, size: 8.5, color: C.GRAY });

        r.save(`Creative_Brief_${campaignName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      } catch (e) {
        console.error("PDF error:", e);
        alert("Something went wrong generating the PDF: " + (e && e.message ? e.message : e));
      }

      downloadPdfBtn.disabled = false;
      downloadPdfBtn.innerHTML = origHtml;
    });
  }
});