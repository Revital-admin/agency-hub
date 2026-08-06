
let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.getActiveClient === 'function') {
    isEmbedded = true;
  }
} catch (e) {
  console.log("Embedded check bypassed due to CORS");
}

// Cap the month-by-month projection at 5 years - if payback hasn't
// happened by then the inputs need to change, not the model.
const MAX_MONTHS = 60;

document.addEventListener('DOMContentLoaded', () => {
  const el = id => document.getElementById(id);

  const clientNameIn = el('clientName');
  const setupCostIn = el('setupCost');
  const monthlyFeeIn = el('monthlyFee');
  const monthlyValueIn = el('monthlyValue');
  const rampMonthsIn = el('rampMonths');
  const rampMonthsVal = el('rampMonthsVal');

  const formatCurrency = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);

  function calculate() {
    const cName = clientNameIn.value || 'Acme Corp';
    const setupCost = Math.max(0, parseFormattedNumber(setupCostIn.value));
    const fee = Math.max(0, parseFormattedNumber(monthlyFeeIn.value));
    const fullValue = Math.max(0, parseFormattedNumber(monthlyValueIn.value));
    const ramp = Math.max(0, parseInt(rampMonthsIn.value) || 0);

    rampMonthsVal.innerText = ramp === 0 ? 'Flat' : `${ramp} mo`;

    el('outClientName').innerText = cName;
    el('outMonthlyFee').innerText = formatCurrency(fee);
    el('outSetupCost').innerText = formatCurrency(setupCost);
    el('outMonthlyValue').innerText = formatCurrency(fullValue);
    el('outRampLabel').innerText = ramp === 0 ? 'Immediate (no ramp)' : `${ramp}-month ramp`;

    // Straight-line ramp from $0 to fullValue over `ramp` months, then
    // held flat. Setup cost is treated as sunk before month 1 (cumulative
    // starts negative), fee is charged every month including during ramp -
    // that's the realistic case (you're paying full price while results
    // are still building, which is exactly what "payback period" is
    // meant to communicate honestly to a prospect).
    let cumulative = -setupCost;
    const rows = [];
    let paybackMonths = null;

    for (let m = 1; m <= MAX_MONTHS; m++) {
      const rampFraction = ramp <= 0 ? 1 : Math.min(1, m / ramp);
      const value = fullValue * rampFraction;
      const net = value - fee;
      const prevCumulative = cumulative;
      cumulative += net;

      if (m <= 12) {
        rows.push({ m, value, fee, net, cumulative, hit: paybackMonths === null && prevCumulative < 0 && cumulative >= 0 });
      }

      if (paybackMonths === null && prevCumulative < 0 && cumulative >= 0) {
        // Linear-interpolate within the month net changed sign, so the
        // headline number reads like "4.3 months" instead of a blunt
        // whole-month rounding that hides how close month 4 vs 5 was.
        const fraction = net > 0 ? (0 - prevCumulative) / net : 0;
        paybackMonths = (m - 1) + fraction;
      }
      if (paybackMonths !== null && m >= 12) break;
    }

    const outPayback = el('outPayback');
    const outTotalInvested = el('outTotalInvested');

    if (fullValue <= fee) {
      outPayback.innerText = 'No payback';
      outPayback.style.color = '#f68d5f';
      outTotalInvested.innerText = '—';
      el('cashFlowTableBody').innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--color-text-muted); padding: 16px 6px;">Full-ramp monthly value doesn't exceed the monthly fee, so this never breaks even at these inputs. Raise the projected value or lower the fee.</td></tr>`;
      return;
    }

    if (paybackMonths === null) {
      outPayback.innerText = `> ${MAX_MONTHS} months`;
      outPayback.style.color = '#f68d5f';
    } else {
      outPayback.innerText = `${paybackMonths.toFixed(1)} months`;
      outPayback.style.color = '#f68d5f';
    }

    const totalInvested = setupCost + fee * (paybackMonths !== null ? Math.ceil(paybackMonths) : MAX_MONTHS);
    outTotalInvested.innerText = formatCurrency(totalInvested);

    el('cashFlowTableBody').innerHTML = rows.map(r => `
      <tr${r.hit ? ' class="row-payback-hit"' : ''}>
        <td>${r.m}</td>
        <td>${formatCurrency(r.value)}</td>
        <td>${formatCurrency(r.fee)}</td>
        <td>${r.net >= 0 ? '+' : ''}${formatCurrency(r.net)}</td>
        <td>${formatCurrency(r.cumulative)}</td>
      </tr>`).join('');
  }

  const allInputs = [clientNameIn, setupCostIn, monthlyFeeIn, monthlyValueIn, rampMonthsIn];
  allInputs.forEach(input => input.addEventListener('input', calculate));
  if (typeof attachCommaFormatting === 'function') {
    attachCommaFormatting(setupCostIn);
    attachCommaFormatting(monthlyFeeIn);
    attachCommaFormatting(monthlyValueIn);
  }

  calculate();

  document.getElementById('downloadPdfBtn').addEventListener('click', () => {
    const element = document.getElementById('paybackReport');
    const cName = clientNameIn.value || 'Client';
    const opt = {
      margin:       0.5,
      filename:     `Payback_Period_${cName.replace(/\s+/g, '_')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    if (typeof html2pdf === 'undefined') {
      alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
      return;
    }
    html2pdf().set(opt).from(element).save();
  });
});
