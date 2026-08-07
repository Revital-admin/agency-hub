
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
  // Inputs
  const clientNameIn = document.getElementById('clientName');
  const currentTrafficIn = document.getElementById('currentTraffic');
  const currentConvRateIn = document.getElementById('currentConvRate');
  const currentAOVIn = document.getElementById('currentAOV');
  
  const projTrafficIncIn = document.getElementById('projTrafficInc');
  const projConvIncIn = document.getElementById('projConvInc');
  const monthlyFeeIn = document.getElementById('monthlyFee');

  // Slider Values
  const projTrafficIncVal = document.getElementById('projTrafficIncVal');
  const projConvIncVal = document.getElementById('projConvIncVal');

  // Outputs
  const outClientName = document.getElementById('outClientName');
  
  const outCurrentRev = document.getElementById('outCurrentRev');
  const outCurrentTraffic = document.getElementById('outCurrentTraffic');
  const outCurrentConv = document.getElementById('outCurrentConv');
  const outCurrentAOV = document.getElementById('outCurrentAOV');

  const outProjRev = document.getElementById('outProjRev');
  const outProjTraffic = document.getElementById('outProjTraffic');
  const outProjConv = document.getElementById('outProjConv');
  const outProjAOV = document.getElementById('outProjAOV');

  const outGrossLift = document.getElementById('outGrossLift');
  const outFee = document.getElementById('outFee');
  const outNetROI = document.getElementById('outNetROI');

  const formatCurrency = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  const formatNumber = (num) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);

  function calculate() {
    // 1. Get raw values
    const cName = clientNameIn.value || 'Acme Corp';
    const cTraffic = parseFloat(currentTrafficIn.value) || 0;
    const cConvRate = parseFloat(currentConvRateIn.value) || 0;
    const cAOV = parseFormattedNumber(currentAOVIn.value);

    const pTrafficInc = parseFloat(projTrafficIncIn.value) || 0;
    const pConvInc = parseFloat(projConvIncIn.value) || 0;
    const fee = parseFormattedNumber(monthlyFeeIn.value);

    // 2. Update Slider text
    projTrafficIncVal.innerText = `+${pTrafficInc}%`;
    projConvIncVal.innerText = `+${pConvInc.toFixed(1)}%`;

    // 3. Calculate Baseline
    const cSales = cTraffic * (cConvRate / 100);
    const cRevenue = cSales * cAOV;

    // 4. Calculate Projections
    const pTraffic = cTraffic * (1 + (pTrafficInc / 100));
    const pConvRate = cConvRate + pConvInc;
    const pSales = pTraffic * (pConvRate / 100);
    const pRevenue = pSales * cAOV;

    // 5. Calculate ROI
    const grossLift = pRevenue - cRevenue;
    const netLift = grossLift - fee;
    const roi = fee > 0 ? (netLift / fee) * 100 : 0;

    // 6. Update UI
    outClientName.innerText = cName;
    
    outCurrentTraffic.innerText = formatNumber(cTraffic);
    outCurrentConv.innerText = cConvRate.toFixed(1);
    outCurrentAOV.innerText = formatNumber(cAOV);
    outCurrentRev.innerText = formatCurrency(cRevenue);

    outProjTraffic.innerText = formatNumber(pTraffic);
    outProjConv.innerText = pConvRate.toFixed(1);
    outProjAOV.innerText = formatNumber(cAOV);
    outProjRev.innerText = formatCurrency(pRevenue);

    outGrossLift.innerText = `+${formatCurrency(grossLift)}`;
    outFee.innerText = `-${formatCurrency(fee)}`;
    
    outNetROI.innerText = roi > 0 ? `+${formatNumber(roi)}%` : `${formatNumber(roi)}%`;
    outNetROI.style.color = roi >= 0 ? '#10b981' : '#f68d5f'; // Green if positive, Red if negative
  }

  // Add event listeners
  [clientNameIn, currentTrafficIn, currentConvRateIn, currentAOVIn, projTrafficIncIn, projConvIncIn, monthlyFeeIn].forEach(input => {
    input.addEventListener('input', calculate);
  });
  if (typeof attachCommaFormatting === 'function') {
    attachCommaFormatting(currentAOVIn);
    attachCommaFormatting(monthlyFeeIn);
  }
  if (typeof attachSpinnerButtons === 'function') {
    attachSpinnerButtons(currentAOVIn, { step: 10 });
    attachSpinnerButtons(monthlyFeeIn, { step: 100 });
  }

  // Initial calculation
  calculate();

  // Export PDF
  document.getElementById('downloadPdfBtn').addEventListener('click', () => {
    // Was 'reportDocument' - no element in this tool has ever had that id
    // (the live preview panel is #proposalReport, see index.html). That
    // meant this always resolved to null, so html2pdf().from(null) either
    // silently failed or threw depending on library version - Export PDF
    // has been non-functional the whole time with no visible error.
    const element = document.getElementById('proposalReport');
    const cName = clientNameIn.value || 'Client';
    const opt = {
      margin:       0.5,
      // Was /\\s+/g (an escaped-backslash-then-"s+" pattern, which only
      // matches a literal backslash character - client names never
      // contain one, so this never actually matched anything). Fixed to
      // /\s+/g so spaces really do collapse to underscores, matching
      // every other PDF-export tool's filename convention.
      filename:     `ROI_Projection_${cName.replace(/\s+/g, '_')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    if (typeof html2pdf === 'undefined') {
      // pdfBtn/generateBtn/origText below were never declared anywhere in
      // this file (leftover from copy-pasting this fallback block from a
      // different tool) - referencing them would throw a ReferenceError
      // right after the alert. The only real button here is
      // downloadPdfBtn, which was never disabled in the first place, so
      // there's nothing to re-enable.
      alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
      return;
    }
    html2pdf().set(opt).from(element).save();
  });
});