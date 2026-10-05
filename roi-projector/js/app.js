
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

      // Recompute from the raw inputs so the report can break the lift down
      // by source (traffic vs. conversion) instead of only echoing totals.
      const T = parseFloat(currentTrafficIn.value) || 0;
      const cr = parseFloat(currentConvRateIn.value) || 0;
      const aov = parseFormattedNumber(currentAOVIn.value);
      const ti = parseFloat(projTrafficIncIn.value) || 0;
      const ci = parseFloat(projConvIncIn.value) || 0;
      const feeVal = parseFormattedNumber(monthlyFeeIn.value);
      const money = n => '$' + Math.round(n).toLocaleString('en-US');
      const baseRev = T * (cr / 100) * aov;
      const projRev = T * (1 + ti / 100) * ((cr + ci) / 100) * aov;
      const trafficOnly = T * (1 + ti / 100) * (cr / 100) * aov - baseRev;
      const convOnly = T * ((cr + ci) / 100) * aov - baseRev;
      const gross = projRev - baseRev;
      const interaction = gross - trafficOnly - convOnly;
      const net = gross - feeVal;
      const roiPct = feeVal > 0 ? (net / feeVal) * 100 : 0;
      const breakEvenPct = baseRev > 0 ? (feeVal / baseRev) * 100 : 0;

      // ---- EXECUTIVE OVERVIEW ----
      r.newPage();
      r.sectionHeader('Executive Overview');
      r.paragraph('What this engagement could be worth to ' + cName, { size: 10.5, italic: true, color: C.GRAY, spaceAfter: 12 });
      r.calloutBox('Projected Net Return',
        `A +${ti}% traffic lift and +${ci.toFixed(1)}pt conversion improvement adds about ${money(gross)} in monthly revenue. After the ${money(feeVal)} monthly fee, that is ${net >= 0 ? 'a net gain of ' : 'a net shortfall of '}${money(Math.abs(net))} per month (${Math.round(roiPct).toLocaleString('en-US')}% ROI).`,
        net >= 0 ? C.GREEN : C.RED);
      r.paragraph('Headline numbers', { bold: true, size: 10.5, spaceAfter: 6 });
      r.tableBlock(['Measure', 'Per month', 'Per year'], [
        ['Gross revenue lift', money(gross), money(gross * 12)],
        ['Service fee', money(feeVal), money(feeVal * 12)],
        ['Net return', money(net), money(net * 12)],
      ], [r.CONTENT_W * 0.4, r.CONTENT_W * 0.3, r.CONTENT_W * 0.3]);

      // ---- INPUTS & ASSUMPTIONS ----
      r.sectionHeader('Inputs & Assumptions');
      r.paragraph('Everything below was entered for ' + cName + '. Change an input and the whole projection moves with it.', { size: 10.5, italic: true, color: C.GRAY, spaceAfter: 10 });
      r.tableBlock(['Baseline today', 'Value'], [
        ['Monthly website traffic', Math.round(T).toLocaleString('en-US')],
        ['Conversion rate', cr.toFixed(1) + '%'],
        ['Average order value', money(aov)],
        ['Current monthly revenue', money(baseRev)],
      ], [r.CONTENT_W * 0.6, r.CONTENT_W * 0.4]);
      r.tableBlock(['Projected improvement', 'Value'], [
        ['Traffic lift', '+' + ti + '%'],
        ['Conversion rate improvement', '+' + ci.toFixed(1) + ' percentage points'],
        ['Average order value', 'Held flat at ' + money(aov)],
      ], [r.CONTENT_W * 0.6, r.CONTENT_W * 0.4]);

      // ---- CURRENT VS PROJECTED ----
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

      r.paragraph('Where the lift comes from', { bold: true, size: 12, spaceAfter: 8 });
      r.tableBlock(['Source', 'Monthly revenue added', 'Share of lift'], [
        ['More traffic (same conversion)', money(trafficOnly), gross > 0 ? Math.round(trafficOnly / gross * 100) + '%' : '-'],
        ['Better conversion (same traffic)', money(convOnly), gross > 0 ? Math.round(convOnly / gross * 100) + '%' : '-'],
        ['Compounding of both', money(interaction), gross > 0 ? Math.round(interaction / gross * 100) + '%' : '-'],
        ['Total', money(gross), '100%'],
      ], [r.CONTENT_W * 0.5, r.CONTENT_W * 0.3, r.CONTENT_W * 0.2]);
      r.paragraph('Traffic and conversion gains multiply, so improving both together is worth more than the sum of each alone.', { italic: true, size: 9, color: C.GRAY });

      // ---- RETURN ON INVESTMENT ----
      r.paragraph('Return on Investment', { bold: true, size: 12, spaceAfter: 8 });
      r.tableBlock(['Line item', 'Value'], [
        ['Gross monthly revenue lift', money(gross)],
        ['Monthly service fee', money(feeVal)],
        ['Net monthly return', money(net)],
        ['ROI', Math.round(roiPct).toLocaleString('en-US') + '%'],
        ['Revenue lift needed just to cover the fee', money(feeVal) + ' (' + breakEvenPct.toFixed(1) + '% of current revenue)'],
      ], [r.CONTENT_W * 0.55, r.CONTENT_W * 0.45]);

      // ---- BOTTOM LINE ----
      r.sectionHeader('Bottom Line');
      r.calloutBox('What this means',
        net >= 0
          ? `The engagement pays for itself if revenue grows by just ${breakEvenPct.toFixed(1)}%. The projection assumes ${(gross / (baseRev || 1) * 100).toFixed(0)}% growth, so there is room for results to come in well under plan and still clear the fee.`
          : `At these inputs the fee is higher than the projected lift. Either the improvement targets need to be more ambitious or the engagement needs to be scoped differently before it makes financial sense.`);
      r.paragraph('This is a planning projection from the inputs above, not a guaranteed outcome. Results depend on execution, seasonality and market conditions.', { italic: true, size: 8.5, color: C.GRAY, spaceAfter: 0 });

      r.save(`ROI_Projection_${cName.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF generation failed: ' + (err && err.message ? err.message : err));
    }
  });
});