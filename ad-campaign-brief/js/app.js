
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
  const platformChecks = document.querySelectorAll('.platform-check');

  // Load state from parent
  if (isEmbedded && parentClient && parentClient.adCampaignBrief) {
    const state = parentClient.adCampaignBrief;
    if (state.campaignName) document.getElementById('campaignName').value = state.campaignName;
    if (state.objective) document.getElementById('objective').value = state.objective;
    if (state.totalBudget) setFormattedValue(document.getElementById('totalBudget'), state.totalBudget);
    if (state.budgetSplit) document.getElementById('budgetSplit').value = state.budgetSplit;
    if (state.startDate) document.getElementById('startDate').value = state.startDate;
    if (state.endDate) document.getElementById('endDate').value = state.endDate;
    if (state.targeting) document.getElementById('targeting').value = state.targeting;
    if (state.kpis) document.getElementById('kpis').value = state.kpis;
    if (state.adFormats) document.getElementById('adFormats').value = state.adFormats;
    if (state.destinationUrl) document.getElementById('destinationUrl').value = state.destinationUrl;
    if (state.trackingNotes) document.getElementById('trackingNotes').value = state.trackingNotes;
    if (state.specialNotes) document.getElementById('specialNotes').value = state.specialNotes;
    if (Array.isArray(state.platforms)) {
      platformChecks.forEach(cb => { cb.checked = state.platforms.includes(cb.value); });
    }
  }
  // Force sync client name from parent if embedded
  if (isEmbedded && parentClient) {
    document.getElementById('clientName').value = parentClient.name || '';
  }

  const previewContainer = document.getElementById('previewContainer');
  const copyBtn = document.getElementById('copyBtn');
  let currentMarkdown = '';

  const formatCurrency = (num) => {
    const n = parseFormattedNumber(num);
    if (!n && n !== 0) return '';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  };

  // persist (default true): whether to also write the rebuilt state back
  // to the parent Hub's clientsDb via window.parent.saveDatabase() at the
  // end of this function. Every user-driven call site below (input/change
  // listeners, attachSpinnerButtons) wants that. The one-time init call
  // right after this function's definition does not - see the identical
  // fix + full explanation in proposal-calculator/js/app.js's calculate().
  // Short version: this iframe gets a full reload every time ANY client
  // data changes anywhere in the Hub, and an unconditional save on that
  // reload's init call re-triggers another reload (here or in any other
  // open tab) even though nothing actually changed, looping fast enough
  // to exhaust Firestore's write stream with two tabs open.
  function generateMarkdown(persist = true) {
    const campaignName = document.getElementById('campaignName').value || '[Campaign Name]';
    const clientName = document.getElementById('clientName').value || '[Client Name]';
    const objective = document.getElementById('objective').value;
    const platforms = Array.from(platformChecks).filter(cb => cb.checked).map(cb => cb.value);
    const platformsText = platforms.length ? platforms.join(', ') : '[No platforms selected]';
    const totalBudget = document.getElementById('totalBudget').value;
    const totalBudgetText = totalBudget !== '' ? formatCurrency(totalBudget) : '[Total budget]';
    const budgetSplit = document.getElementById('budgetSplit').value || '[Budget split not specified]';
    const startDate = document.getElementById('startDate').value || '[TBD]';
    const endDate = document.getElementById('endDate').value || '[TBD]';
    const targeting = document.getElementById('targeting').value || '[Targeting parameters]';
    const kpis = document.getElementById('kpis').value || '[KPIs / success metrics]';
    const adFormats = document.getElementById('adFormats').value || '[Ad formats / placements]';
    const destinationUrl = document.getElementById('destinationUrl').value || '[Destination URL]';
    const trackingNotes = document.getElementById('trackingNotes').value || '[No tracking notes provided]';
    const specialNotes = document.getElementById('specialNotes').value || '_None_';

    const md = `# 📣 Ad Campaign Brief: ${campaignName}

**Client:** ${clientName}
**Objective:** ${objective}
**Platforms:** ${platformsText}

## 💰 Budget
**Total:** ${totalBudgetText}
**Split:** ${budgetSplit}

## 📅 Flight Dates
**Start:** ${startDate}  **End:** ${endDate}

## 🎯 Targeting Parameters
> ${targeting}

## 📊 KPIs / Success Metrics
${kpis}

## 🖼️ Ad Formats / Placements
${adFormats}

## 🔗 Destination
${destinationUrl}

## 🏷️ Tracking &amp; UTM Notes
${trackingNotes}

## 📝 Special Instructions
${specialNotes}

---
*Generated via Revital Hub - Ad Campaign Brief Generator*
`;

    currentMarkdown = md;
    previewContainer.innerHTML = marked.parse(md);

    if (isEmbedded && parentClient) {
      parentClient.adCampaignBrief = {
        campaignName: document.getElementById('campaignName').value,
        objective: document.getElementById('objective').value,
        platforms,
        totalBudget: document.getElementById('totalBudget').value,
        budgetSplit: document.getElementById('budgetSplit').value,
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value,
        targeting: document.getElementById('targeting').value,
        kpis: document.getElementById('kpis').value,
        adFormats: document.getElementById('adFormats').value,
        destinationUrl: document.getElementById('destinationUrl').value,
        trackingNotes: document.getElementById('trackingNotes').value,
        specialNotes: document.getElementById('specialNotes').value
      };
      if (persist) window.parent.saveDatabase();
    }
  }

  inputs.forEach(input => input.addEventListener('input', generateMarkdown));
  platformChecks.forEach(cb => cb.addEventListener('change', generateMarkdown));
  if (typeof attachCommaFormatting === 'function') attachCommaFormatting(document.getElementById('totalBudget'));
  if (typeof attachSpinnerButtons === 'function') attachSpinnerButtons(document.getElementById('totalBudget'), { step: 100 });

  generateMarkdown(false); // init render only - see comment on the function above

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentMarkdown).then(() => {
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
      copyBtn.style.background = '#10b981';

      setTimeout(() => {
        copyBtn.innerHTML = originalText;
        copyBtn.style.background = '';
      }, 2000);
    });
  });

  // Download PDF - a real leave-behind document.
  // Oct 2026 rebuild: switched from re-parsing currentMarkdown into a
  // restyled HTML document for html2canvas/html2pdf to screenshot, to the
  // shared RevitalPDF module - see ../shared/pdf-report.js for the full
  // rationale. Reads the field values directly instead of round-tripping
  // through markdown/marked.js (this tool's markdown uses blockquotes and
  // multi-label lines that don't fit the generic shared/markdown-pdf.js
  // renderer used by the other brief tools, so it's simpler and more
  // reliable to read the fields straight).
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

      const campaignName = document.getElementById('campaignName').value || 'Ad Campaign Brief';
      const clientName = document.getElementById('clientName').value || 'Client';
      const objective = document.getElementById('objective').value;
      const platforms = Array.from(platformChecks).filter(cb => cb.checked).map(cb => cb.value);
      const totalBudget = document.getElementById('totalBudget').value;
      const totalBudgetText = totalBudget !== '' ? formatCurrency(totalBudget) : 'Not provided';
      const budgetSplit = document.getElementById('budgetSplit').value;
      const startDate = document.getElementById('startDate').value;
      const endDate = document.getElementById('endDate').value;
      const targeting = document.getElementById('targeting').value;
      const kpis = document.getElementById('kpis').value;
      const adFormats = document.getElementById('adFormats').value;
      const destinationUrl = document.getElementById('destinationUrl').value;
      const trackingNotes = document.getElementById('trackingNotes').value;
      const specialNotes = document.getElementById('specialNotes').value;

      try {
        const r = RevitalPDF.create({ reportTitle: 'AD CAMPAIGN BRIEF', companyName: clientName });
        const C = r.colors;

        r.coverPage({
          title: `Ad Campaign Brief: ${campaignName}`,
          subLine: new Date().toLocaleDateString(),
          objective: objective || undefined,
        });

        r.newPage();
        r.sectionHeader('Budget');
        r.tableBlock(['Item', 'Detail'], [
          ['Total Budget', totalBudgetText],
          ['Split', budgetSplit || 'Not specified'],
          ['Platforms', platforms.length ? platforms.join(', ') : 'None selected'],
        ], [r.CONTENT_W * 0.3, r.CONTENT_W * 0.7]);

        r.sectionHeader('Flight Dates');
        r.paragraph(`Start: ${startDate || 'TBD'}     End: ${endDate || 'TBD'}`, { spaceAfter: 16 });

        r.sectionHeader('Targeting Parameters');
        r.calloutBox('Targeting', targeting || 'Not provided');

        r.newPage();
        r.sectionHeader('KPIs / Success Metrics');
        r.paragraph(kpis || 'Not provided', { spaceAfter: 16 });

        r.sectionHeader('Ad Formats / Placements');
        r.paragraph(adFormats || 'Not provided', { spaceAfter: 16 });

        r.sectionHeader('Destination');
        r.paragraph(destinationUrl || 'Not provided', { spaceAfter: 16 });

        r.sectionHeader('Tracking & UTM Notes');
        r.paragraph(trackingNotes || 'None provided', { spaceAfter: 16 });

        r.sectionHeader('Special Instructions');
        r.paragraph(specialNotes || 'None', { spaceAfter: 16 });

        r.paragraph('Generated via Revital Hub - Ad Campaign Brief Generator', { italic: true, size: 8.5, color: C.GRAY });

        r.save(`Ad_Campaign_Brief_${campaignName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      } catch (e) {
        console.error("PDF error:", e);
        alert("Something went wrong generating the PDF: " + (e && e.message ? e.message : e));
      }

      downloadPdfBtn.disabled = false;
      downloadPdfBtn.innerHTML = origHtml;
    });
  }
});
