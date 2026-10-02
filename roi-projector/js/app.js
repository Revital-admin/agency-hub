
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
  // Oct 2026 rebuild: this tool's PDF export was completely non-functional
  // (see the removed comments below for why - wrong element id, a regex
  // that never matched, and a crash-on-missing-library fallback that
  // referenced variables that don't exist in this file). Replaced with the
  // shared RevitalPDF module (../shared/pdf-report.js) used by every other
  // rebuilt tool in the Hub: native jsPDF vector text instead of
  // html2canvas/html2pdf, built straight from the already-calculated
  // numbers rather than screenshotting the on-screen report panel.
  document.getElementById('downloadPdfBtn').addEventListener('click', () => {
    if (typeof window.RevitalPDF === 'undefined') {
      alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
      return;
    }
    const cName = clientNameIn.value || 'Client';

    try {
      const r = RevitalPDF.create({ reportTitle: 'MARKETING ROI PROJECTOR', companyName: cName });
      const C = r.colors;

      r.coverPage({
        title: 'Growth Projection Report',
        subLine: new Date().toLocaleDateString(),
        objective: `Projected revenue impact of a +${projTrafficIncIn.value}% traffic lift and a +${parseFloat(projConvIncIn.value).toFixed(1)}pt conversion-rate improvement for ${cName}.`,
        preparedFrom: `Baseline traffic, conversion rate, and average order value entered for ${cName}.`,
        note: 'Note: this is a planning projection based on the inputs provided, not a guaranteed outcome.',
      });

      r.newPage();
      r.sectionHeader('Current vs. Projected Performance');
      r.tableBlock(
        ['Metric', 'Current', 'Projected'],
        [
          ['Monthly Traffic', outCurrentTraffic.innerText, outProjTraffic.innerText],
          ['Conversion Rate', outCurrentConv.innerText + '%', outProjConv.innerText + '%'],
          ['Avg Order Value', '$' + outCurrentAOV.innerText, '$' + outProjAOV.innerText],
          ['Monthly Revenue', outCurrentRev.innerText, outProjRev.innerText],
        ],
        [r.CONTENT_W * 0.4, r.CONTENT_W * 0.3, r.CONTENT_W * 0.3]
      );

      r.paragraph('Return on Investment', { bold: true, size: 10.5, spaceAfter: 6 });
      r.tableBlock(
        ['Line Item', 'Value'],
        [
          ['Gross Monthly Revenue Lift', outGrossLift.innerText],
          ['Monthly Service Fee', outFee.innerText],
          ['Net ROI', outNetROI.innerText],
        ],
        [r.CONTENT_W * 0.6, r.CONTENT_W * 0.4]
      );
      r.calloutBox('Bottom Line', `At these inputs, ${cName} is projected to see a net ROI of ${outNetROI.innerText} on the monthly fee of ${outFee.innerText.replace('-', '')}.`);

      r.save(`ROI_Projection_${cName.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF generation failed: ' + (err && err.message ? err.message : err));
    }
  });
});