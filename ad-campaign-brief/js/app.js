
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
    if (state.totalBudget) document.getElementById('totalBudget').value = state.totalBudget;
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
    const n = parseFloat(num);
    if (!n && n !== 0) return '';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  };

  function generateMarkdown() {
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
      window.parent.saveDatabase();
    }
  }

  inputs.forEach(input => input.addEventListener('input', generateMarkdown));
  platformChecks.forEach(cb => cb.addEventListener('change', generateMarkdown));

  generateMarkdown();

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
});
