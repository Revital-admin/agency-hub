
let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.getActiveClient === 'function') {
    isEmbedded = true;
  }
} catch (e) {
  console.log("Embedded check bypassed due to CORS");
}

// Baseline "% of annual revenue" midpoints by industry. Sourced from the
// 2025 Gartner CMO Spend Survey (overall average 7.7% of revenue) and the
// Deloitte/Duke CMO Survey's industry breakouts (B2B product ~6.4%, B2B
// services ~9%, B2C product ~2.5x B2B product, CPG ~18%, energy ~3%).
// Categories without a direct survey line item (professional services,
// hospitality, healthcare) use the closest comparable published range
// plus the general small-business rule-of-thumb band (6-12%) rather than
// a fabricated precise figure - these are directional planning numbers,
// not a guarantee, and the report footer says so.
const INDUSTRY_BENCHMARKS = {
  b2bSaas:              { label: 'B2B Product / SaaS',                          pct: 6.4 },
  b2bServices:           { label: 'B2B Services',                                pct: 9.0 },
  professionalServices:  { label: 'Professional Services',                       pct: 8.0 },
  b2cRetail:              { label: 'B2C Product / Retail / eCommerce',            pct: 16.0 },
  cpg:                    { label: 'Consumer Packaged Goods',                     pct: 18.0 },
  hospitality:            { label: 'Hospitality / Restaurant / Events',           pct: 10.0 },
  healthcare:             { label: 'Healthcare',                                  pct: 7.5 },
  energyIndustrial:       { label: 'Energy / Industrial',                         pct: 3.0 },
  other:                  { label: 'Other / Not Sure',                            pct: 8.0 },
};

// Growth stage shifts spend up (launching/pushing hard needs more to
// build awareness fast) or down (a mature account defending share can
// run leaner) relative to the industry baseline.
const STAGE_MULTIPLIERS = {
  aggressive: { label: 'Aggressive Growth / Launch', mult: 1.4 },
  steady:     { label: 'Steady Growth',              mult: 1.0 },
  mature:     { label: 'Maintain / Mature',           mult: 0.75 },
};

const CHANNEL_FIELDS = [
  { id: 'chPaidMedia', label: 'Paid Media (Social + Search)' },
  { id: 'chCreative', label: 'Creative & Content Production' },
  { id: 'chSeo', label: 'SEO / Organic & Content Marketing' },
  { id: 'chEmail', label: 'Email / CRM & Retention' },
  { id: 'chTools', label: 'Tools & Martech' },
  { id: 'chContingency', label: 'Contingency / Testing' },
];

document.addEventListener('DOMContentLoaded', () => {
  const el = id => document.getElementById(id);

  const clientNameIn = el('clientName');
  const annualRevenueIn = el('annualRevenue');
  const industryIn = el('industry');
  const growthStageIn = el('growthStage');

  const formatCurrency = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);

  function calculate() {
    const cName = clientNameIn.value || 'Acme Corp';
    const revenue = Math.max(0, parseFormattedNumber(annualRevenueIn.value));
    const industryKey = industryIn.value;
    const stageKey = growthStageIn.value;

    const industry = INDUSTRY_BENCHMARKS[industryKey] || INDUSTRY_BENCHMARKS.other;
    const stage = STAGE_MULTIPLIERS[stageKey] || STAGE_MULTIPLIERS.steady;

    // Clamp the adjusted % to a sane planning range - an aggressive-growth
    // multiplier on an already-high CPG baseline shouldn't spit out
    // something absurd like 25%+ of revenue.
    let recPct = industry.pct * stage.mult;
    recPct = Math.min(30, Math.max(2, recPct));

    const annualBudget = revenue * (recPct / 100);
    const monthlyBudget = annualBudget / 12;
    const rangeLow = annualBudget * 0.85;
    const rangeHigh = annualBudget * 1.15;

    el('outClientName').innerText = cName;
    el('outBenchmarkPct').innerText = `${industry.pct.toFixed(1)}%`;
    el('outIndustryLabel').innerText = industry.label;
    el('outRecPct').innerText = `${recPct.toFixed(1)}%`;
    el('outStageLabel').innerText = stage.label;
    el('outAnnualBudget').innerText = formatCurrency(annualBudget);
    el('outMonthlyBudget').innerText = formatCurrency(monthlyBudget);
    el('outRange').innerText = `${formatCurrency(rangeLow)} – ${formatCurrency(rangeHigh)}`;
    el('industryBenchmarkNote').innerText = `2025 CMO survey benchmark for this category: ~${industry.pct.toFixed(1)}% of revenue.`;

    // Channel split - percentages are whatever the user has dialed in,
    // applied against the recommended annual budget above. Deliberately
    // not force-normalized to 100% (see channelTotalNote below) - a
    // prospect's real mix rarely lands on a clean total, and rounding
    // six numbers to force it would misstate any one of them.
    let total = 0;
    const rows = CHANNEL_FIELDS.map(ch => {
      const pct = Math.max(0, parseFloat(el(ch.id).value) || 0);
      total += pct;
      const annual = annualBudget * (pct / 100);
      const monthly = annual / 12;
      return `<tr><td>${ch.label}</td><td>${pct}%</td><td>${formatCurrency(monthly)}</td><td>${formatCurrency(annual)}</td></tr>`;
    });
    el('channelTableBody').innerHTML = rows.join('');

    const totalNote = el('channelTotalNote');
    totalNote.innerText = `Total: ${total}%${total !== 100 ? ' (doesn’t need to be exactly 100 - adjust to fit the pitch)' : ''}`;
    totalNote.style.color = total === 100 ? '#94a3b8' : '#f68d5f';
  }

  const allInputs = [clientNameIn, annualRevenueIn, industryIn, growthStageIn, ...CHANNEL_FIELDS.map(ch => el(ch.id))];
  allInputs.forEach(input => input.addEventListener('input', calculate));
  if (typeof attachCommaFormatting === 'function') attachCommaFormatting(annualRevenueIn);
  if (typeof attachSpinnerButtons === 'function') attachSpinnerButtons(annualRevenueIn, { step: 10000 });

  calculate();

  document.getElementById('downloadPdfBtn').addEventListener('click', () => {
    const element = document.getElementById('budgetReport');
    const cName = clientNameIn.value || 'Client';
    const opt = {
      margin:       0.5,
      filename:     `Marketing_Budget_${cName.replace(/\s+/g, '_')}.pdf`,
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
