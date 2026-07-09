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
    const cAOV = parseFloat(currentAOVIn.value) || 0;
    
    const pTrafficInc = parseFloat(projTrafficIncIn.value) || 0;
    const pConvInc = parseFloat(projConvIncIn.value) || 0;
    const fee = parseFloat(monthlyFeeIn.value) || 0;

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

  // Initial calculation
  calculate();

  // Export PDF
  document.getElementById('downloadPdfBtn').addEventListener('click', () => {
    const element = document.getElementById('reportDocument');
    const cName = clientNameIn.value || 'Client';
    const opt = {
      margin:       0.5,
      filename:     `ROI_Projection_${cName.replace(/\\s+/g, '_')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  });
});