
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
  if (typeof attachSpinnerButtons === 'function') {
    attachSpinnerButtons(setupCostIn, { step: 100 });
    attachSpinnerButtons(monthlyFeeIn, { step: 100 });
    attachSpinnerButtons(monthlyValueIn, { step: 100 });
  }

  calculate();

  // Oct 2026 rebuild: switched from html2canvas/html2pdf to the shared
  // RevitalPDF module (../shared/pdf-report.js) - see that file for the
  // full rationale. Built straight from the already-calculated numbers
  // (headline payback figure plus the 12-month cash flow table) rather
  // than screenshotting the on-screen report panel.
  document.getElementById('downloadPdfBtn').addEventListener('click', () => {
    if (typeof window.RevitalPDF === 'undefined') {
      alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
      return;
    }
    const cName = clientNameIn.value || 'Client';

    try {
      const r = RevitalPDF.create({ reportTitle: 'PAYBACK PERIOD CALCULATOR', companyName: cName });
      const C = r.colors;

      r.coverPage({
        title: 'Payback Period Analysis',
        subLine: new Date().toLocaleDateString(),
        objective: `How long it takes ${cName} to recoup the setup cost and ongoing fee against the projected monthly value.`,
        preparedFrom: `Setup cost of ${el('outSetupCost').innerText}, monthly fee of ${el('outMonthlyFee').innerText}, and projected monthly value of ${el('outMonthlyValue').innerText} (${el('outRampLabel').innerText}).`,
        note: 'Note: this is a planning projection based on the inputs provided, not a guaranteed outcome.',
      });

      // Rebuild the same model the on-screen calculator uses so the report
      // can show year-one totals and ROI, not just the payback figure.
      const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
      const setupC = Math.max(0, parseFormattedNumber(setupCostIn.value));
      const feeC = Math.max(0, parseFormattedNumber(monthlyFeeIn.value));
      const fullV = Math.max(0, parseFormattedNumber(monthlyValueIn.value));
      const rampM = Math.max(0, parseInt(rampMonthsIn.value) || 0);
      let valueY1 = 0, cumY1 = -setupC, breakEvenRow = null;
      for (let m = 1; m <= 12; m++) {
        const v = fullV * (rampM <= 0 ? 1 : Math.min(1, m / rampM));
        valueY1 += v;
        const prev = cumY1; cumY1 += v - feeC;
        if (breakEvenRow === null && prev < 0 && cumY1 >= 0) breakEvenRow = m;
      }
      const spendY1 = setupC + feeC * 12;
      const roiY1 = spendY1 > 0 ? ((valueY1 - spendY1) / spendY1) * 100 : 0;
      const paybackText = el('outPayback').innerText;
      const noPayback = paybackText === 'No payback';

      // ---- EXECUTIVE OVERVIEW ----
      r.newPage();
      r.sectionHeader('Executive Overview');
      r.paragraph('How quickly ' + cName + ' gets its money back', { size: 10.5, italic: true, color: C.GRAY, spaceAfter: 12 });
      r.calloutBox('Payback Period', noPayback
        ? 'At these inputs the monthly value never exceeds the monthly fee, so the investment is not recovered.'
        : `${paybackText} - total invested by that point: ${el('outTotalInvested').innerText}.`,
        noPayback ? C.RED : C.GREEN);
      r.paragraph('Year-one at a glance', { bold: true, size: 10.5, spaceAfter: 6 });
      r.tableBlock(['Measure', 'Value'], [
        ['Total invested in year one (setup + 12 months of fees)', money(spendY1)],
        ['Value delivered in year one', money(valueY1)],
        ['Net position after 12 months', money(cumY1)],
        ['Year-one return on investment', Math.round(roiY1).toLocaleString('en-US') + '%'],
      ], [r.CONTENT_W * 0.65, r.CONTENT_W * 0.35]);

      // ---- INPUTS & ASSUMPTIONS ----
      r.sectionHeader('Inputs & Assumptions');
      r.tableBlock(['Input', 'Value'], [
        ['One-time setup cost', money(setupC)],
        ['Monthly fee', money(feeC)],
        ['Monthly value at full run-rate', money(fullV)],
        ['Time to reach full value', el('outRampLabel').innerText],
      ], [r.CONTENT_W * 0.6, r.CONTENT_W * 0.4]);
      r.paragraph('Setup cost is treated as spent before month one. The fee is charged every month, including while results are still ramping up, which is the honest picture of payback.', { italic: true, size: 9, color: C.GRAY });

      // ---- CASH FLOW ----
      r.newPage();
      r.sectionHeader('Month-by-Month Cash Flow');
      const rows = Array.from(document.querySelectorAll('#cashFlowTableBody tr')).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
      );
      if (rows.length && rows[0].length === 5) {
        r.paragraph('First 12 months', { bold: true, size: 10.5, spaceAfter: 6 });
        r.tableBlock(
          ['Month', 'Value', 'Fee', 'Net', 'Cumulative'],
          rows,
          [r.CONTENT_W * 0.12, r.CONTENT_W * 0.22, r.CONTENT_W * 0.22, r.CONTENT_W * 0.22, r.CONTENT_W * 0.22]
        );
      } else {
        r.paragraph(rows.length ? rows[0].join(' ') : 'No cash-flow data available at these inputs.', { italic: true });
      }

      // ---- BOTTOM LINE ----
      r.sectionHeader('Bottom Line');
      r.calloutBox('What this means', noPayback
        ? 'Raise the expected monthly value, lower the fee, or shorten the ramp before presenting this - as modelled, the engagement does not pay back.'
        : `By month ${breakEvenRow || 12} the engagement has recovered its costs, and after 12 months ${cName} is ${cumY1 >= 0 ? 'ahead by ' + money(cumY1) : 'still ' + money(Math.abs(cumY1)) + ' short of break-even'}. ${rampM > 0 ? 'A slower ramp pushes payback later - the ramp assumption is the number to pressure-test first.' : ''}`);
      r.paragraph('This is a planning projection based on the inputs provided, not a guaranteed outcome.', { italic: true, size: 8.5, color: C.GRAY, spaceAfter: 0 });

      r.save(`Payback_Period_${cName.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF generation failed: ' + (err && err.message ? err.message : err));
    }
  });
});
