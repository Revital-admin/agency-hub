
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

document.addEventListener('DOMContentLoaded', async () => {
  // Inputs
  const baseFee = document.getElementById('baseFee');
  const serviceCheckboxes = document.querySelectorAll('.service-cb');
  const resetBtn = document.getElementById('resetBtn');

  // Legacy dynamic inputs
  const spendTier = document.getElementById('spendTier');
  const blogCount = document.getElementById('blogCount');
  const socialCount = document.getElementById('socialCount');

  // Upgrades
  const contractTerm = document.getElementById('contractTerm');
  const rushFee = document.getElementById('rushFee');
  const miscSoftware = document.getElementById('miscSoftware');
  
  const customName = document.getElementById('customName');
  const customPrice = document.getElementById('customPrice');
  const customType = document.getElementById('customType');
  const addCustomBtn = document.getElementById('addCustomBtn');
  const customItemsList = document.getElementById('customItemsList');

  // NEW: Proposal Details Inputs
  const propClientName = document.getElementById('propClientName');
  const propContactName = document.getElementById('propContactName');
  const propNote = document.getElementById('propNote');
  const propWorking = document.getElementById('propWorking');
  const propOpps = document.getElementById('propOpps');
  const propStripeUrl = document.getElementById('propStripeUrl');
  const genPaymentLinkBtn = document.getElementById('genPaymentLinkBtn');
  const genPaymentLinkStatus = document.getElementById('genPaymentLinkStatus');
  const propAov = document.getElementById('propAov');
  const propConvRate = document.getElementById('propConvRate');
  const propStartDate = document.getElementById('propStartDate');
  const propMeetingRecap = document.getElementById('propMeetingRecap');
  const propTestimonial = document.getElementById('propTestimonial');

  // NEW: Admin Controls
  const toggleMargin = document.getElementById('toggleMargin');
  const adminControlsPanel = document.getElementById('adminControlsPanel');
  const marginBox = document.getElementById('marginBox');
  const totalHardCosts = document.getElementById('totalHardCosts');
  const profitMarginPercent = document.getElementById('profitMarginPercent');
  const marginDataQuality = document.getElementById('marginDataQuality');

  let customItemsArray = [];

  // Outputs
  const totalMonthlyEl = document.getElementById('totalMonthly');
  const totalSetupEl = document.getElementById('totalSetup');
  const sowListEl = document.getElementById('sowList');
  const currentDateEl = document.getElementById('currentDate');
  const copyBtn = document.getElementById('copyBtn');
  const pdfBtn = document.getElementById('pdfBtn');

  // Set Date
  const today = new Date();
  currentDateEl.textContent = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // ── Admin Identity Check ──
  // The ?dev=admin shortcut below exists so the Admin Controls panel
  // (profit margin, Edit Default Prices) can be tested without a real
  // Cloudflare Access session while developing locally. It must never
  // work on a deployed hostname - anyone with the internal Hub link
  // could otherwise unlock margin/cost data just by adding a query
  // param, with no server-side identity check at all. Gate it to
  // localhost/127.0.0.1/file: only; every real deployment (including
  // staging) falls through to the real /cdn-cgi/access/get-identity
  // check below.
  function isLocalDevHost(win) {
    try {
      const host = win.location.hostname;
      return win.location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1' || host === '';
    } catch (e) {
      return false;
    }
  }
  async function checkAdminIdentity() {
    const urlParams = new URLSearchParams(window.location.search);
    const devFlagRequested = urlParams.get('dev') === 'admin' || (window.parent && window.parent.location.search.includes('dev=admin'));
    if (devFlagRequested && (isLocalDevHost(window) || (window.parent && isLocalDevHost(window.parent)))) {
      if(adminControlsPanel) adminControlsPanel.style.display = 'block';
      return;
    }
    try {
      const response = await fetch('/cdn-cgi/access/get-identity');
      if (response.ok) {
        const data = await response.json();
        if (data && data.email && adminControlsPanel) {
          adminControlsPanel.style.display = 'block';
        }
      }
    } catch (e) {
      console.log("Not running in Cloudflare Access environment.");
    }
  }
  checkAdminIdentity();

  // ── Admin Price Overrides ──
  // Pulls any admin-set default prices from agency/servicePricing (set via
  // the Service Pricing Admin tool) and layers them on top of this page's
  // built-in data-price/data-fee attributes before anything else reads
  // them, so calculate() and the visible labels both reflect the current
  // defaults without needing the ~85 checkboxes themselves rewritten.
  async function applyPricingOverrides() {
    if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseGetDoc) return;
    try {
      const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "servicePricing");
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      const overrides = (data && data.prices) || {};
      document.querySelectorAll('.service-cb').forEach(cb => {
        const override = overrides[cb.value];
        if (!override) return;
        cb.dataset.price = String(override.price);
        cb.dataset.fee = override.feeType;
        // Real per-service cost from Service Pricing Admin, when an admin
        // has actually set one - calculate() below prefers this over its
        // built-in flat-percentage cost assumption whenever it's > 0.
        if (override.cost) cb.dataset.cost = String(override.cost);
        const label = cb.parentElement;
        if (label && label.classList.contains('cb-label')) {
          const suffix = override.price > 0
            ? ` (+$${override.price.toLocaleString()}${override.feeType === 'monthly' ? '/mo' : ''})`
            : '';
          // appendChild on a node already in the DOM moves it rather than
          // cloning it, so the checkbox keeps its checked state and event
          // listeners (bound later below) intact even though we're
          // rebuilding the label's text around it.
          label.innerHTML = '';
          label.appendChild(cb);
          label.appendChild(document.createTextNode(cb.value + suffix));
        }
      });
    } catch (e) {
      console.warn("Couldn't load service pricing overrides, using calculator defaults:", e);
    }
  }
  await applyPricingOverrides();

  // Load from localStorage
  loadState();

  // ── Package Presets ──
  // Historically these were hardcoded here (3 service-bundle presets + 3
  // flat website/branding presets). Now they're admin-editable from Service
  // Pricing Admin and live at agency/packagePresets - this list is only the
  // fallback used if that doc doesn't exist yet (e.g. nobody's opened the
  // new admin panel), so behavior for existing users doesn't change until
  // someone actually customizes the presets.
  const DEFAULT_PRESETS = [
    {
      id: 'presetBasic', name: 'Basic Social', type: 'services',
      services: [
        "Feed Posts (static images, carousels)",
        "Reels & Short-Form Video",
        "Stories",
        "Community Management (responding to comments, DMs, engaging followers)",
        "Content Calendar Management"
      ]
    },
    {
      id: 'presetGrowth', name: 'Growth Ads', type: 'services',
      services: [
        "Meta Ads (Facebook + Instagram)",
        "Google Ads — Search",
        "Audience Research & Targeting",
        "Ad Creative Production",
        "Campaign Setup & Management",
        "Budget Management & Reporting"
      ]
    },
    {
      id: 'presetFull', name: 'Full-Stack', type: 'services',
      services: [
        "Feed Posts (static images, carousels)",
        "Reels & Short-Form Video",
        "Community Management (responding to comments, DMs, engaging followers)",
        "Content Calendar Management",
        "Meta Ads (Facebook + Instagram)",
        "Google Ads — Search",
        "Audience Research & Targeting",
        "Campaign Setup & Management",
        "On-Page SEO (meta titles, descriptions, headers, content optimization)",
        "Technical SEO (site speed, crawlability, schema markup)",
        "Keyword Research & Strategy",
        "Newsletter Campaigns",
        "Analytics Setup (GA4, Meta Pixel, GTM)"
      ]
    },
    {
      id: 'presetSEO', name: 'SEO Foundations', type: 'services',
      services: [
        "On-Page SEO (meta titles, descriptions, headers, content optimization)",
        "Technical SEO (site speed, crawlability, schema markup)",
        "Keyword Research & Strategy",
        "SEO Audits",
        "Google Search Console Management",
        "Rank Tracking & Reporting"
      ]
    },
    {
      id: 'presetEmail', name: 'Email Growth', type: 'services',
      services: [
        "Newsletter Campaigns",
        "Promotional Emails",
        "Drip / Nurture Sequences",
        "Welcome Sequences",
        "List Segmentation & Hygiene",
        "Performance Reporting"
      ]
    },
    {
      id: 'presetInbound', name: 'Content & Inbound', type: 'services',
      services: [
        "Content Strategy Development",
        "Blog Writing & Management",
        "Lead Magnet Creation (guides, checklists, templates, free audits)",
        "Landing Page Copywriting",
        "CTA Strategy",
        "Content Distribution"
      ]
    },
    {
      id: 'presetStrategyRetainer', name: 'Strategy Retainer', type: 'services',
      services: [
        "Competitor Analysis",
        "Brand Positioning",
        "Quarterly Marketing Planning",
        "Analytics & Data Interpretation",
        "Consulting & Advisory"
      ]
    },
    {
      id: 'presetDtcEssentials', name: 'DTC Essentials', type: 'services',
      services: [
        "Meta Ads (Facebook + Instagram)",
        "TikTok Ads",
        "Retargeting Campaigns",
        "Drip / Nurture Sequences",
        "Conversion Rate Optimization (CRO)",
        "Analytics Setup (GA4, Meta Pixel, GTM)"
      ]
    },
    {
      id: 'presetWebBasic', name: 'Basic Website ($700)', type: 'flat',
      itemName: 'Basic Website Package (up to 5 pages, responsive design, contact form, basic SEO, 2 revision rounds)',
      price: 700, feeType: 'setup'
    },
    {
      id: 'presetWebBranding', name: 'Branding + Website ($1,400)', type: 'flat',
      itemName: 'Branding + Website Package (logo, brand style guide, up to 5-page website, 2 revision rounds)',
      price: 1400, feeType: 'setup'
    },
    {
      id: 'presetWebComplete', name: 'Complete Brand ($2,100+)', type: 'flat',
      itemName: 'Complete Brand Package (full brand guidelines, up to 7-page custom website, social templates, 3 revision rounds)',
      price: 2100, feeType: 'setup'
    }
  ];

  let PRESETS = DEFAULT_PRESETS;

  async function loadPresets() {
    if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseGetDoc) return;
    try {
      const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "packagePresets");
      const snap = await window.parent.firebaseGetDoc(ref);
      const data = snap && snap.exists ? snap.data() : null;
      if (data && Array.isArray(data.presets) && data.presets.length > 0) {
        PRESETS = data.presets;
      }
    } catch (e) {
      console.warn("Couldn't load package presets, using built-in defaults:", e);
    }
  }
  await loadPresets();

  // "services" presets clear every checkbox then check just the listed
  // services - same behavior as the original hardcoded Basic/Growth/Full
  // buttons. "flat" presets add a single tagged custom line item and swap
  // out (rather than stack alongside) any other flat preset previously
  // added, so re-clicking a tier or picking a different one never
  // duplicates line items.
  function renderPresetButtons() {
    const serviceContainer = document.getElementById('servicePresetButtons');
    const flatContainer = document.getElementById('flatPresetButtons');
    if (!serviceContainer || !flatContainer) return;
    serviceContainer.innerHTML = '';
    flatContainer.innerHTML = '';

    PRESETS.forEach(preset => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-copy';
      btn.style.cssText = 'flex: 1; padding: 8px; font-size: 0.8rem;';
      btn.textContent = preset.name;

      if (preset.type === 'services') {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.service-cb').forEach(cb => cb.checked = false);
          document.querySelectorAll('.service-cb').forEach(cb => {
            if ((preset.services || []).includes(cb.value)) cb.checked = true;
          });
          calculate();
        });
        serviceContainer.appendChild(btn);
      } else if (preset.type === 'flat') {
        btn.addEventListener('click', () => {
          const allFlatIds = PRESETS.filter(p => p.type === 'flat').map(p => p.id);
          customItemsArray = customItemsArray.filter(item => !allFlatIds.includes(item.presetTag));
          customItemsArray.push({
            id: Date.now(),
            name: preset.itemName || preset.name,
            price: preset.price,
            type: preset.feeType || 'setup',
            presetTag: preset.id
          });
          renderCustomItems();
          calculate();
        });
        flatContainer.appendChild(btn);
      }
    });

    if (!PRESETS.some(p => p.type === 'services')) {
      serviceContainer.innerHTML = '<p class="section-desc" style="margin:0;">No service-bundle presets configured yet.</p>';
    }
    if (!PRESETS.some(p => p.type === 'flat')) {
      flatContainer.innerHTML = '<p class="section-desc" style="margin:0;">No flat-package presets configured yet.</p>';
    }
  }
  renderPresetButtons();

  // Bind events
  if (typeof attachCommaFormatting === 'function') {
    attachCommaFormatting(baseFee);
    if (customPrice) attachCommaFormatting(customPrice);
    if (propAov) attachCommaFormatting(propAov);
  }
  if (typeof attachSpinnerButtons === 'function') {
    attachSpinnerButtons(baseFee, { step: 500 });
    if (customPrice) attachSpinnerButtons(customPrice, { step: 1 });
    if (propAov) attachSpinnerButtons(propAov, { step: 1 });
    // Not a money field (no attachCommaFormatting above - commas don't
    // make sense under 100%) but was switched from type="number" to
    // type="text" too so it can carry the same styled buttons as its
    // row-mate "Current AOV" instead of the browser's native arrows.
    if (propConvRate) attachSpinnerButtons(propConvRate, { step: 0.1, max: 100 });
  }
  baseFee.addEventListener('input', calculate);
  if (spendTier) spendTier.addEventListener('change', calculate);
  if (blogCount) blogCount.addEventListener('input', calculate);
  if (socialCount) socialCount.addEventListener('input', calculate);
  if (contractTerm) contractTerm.addEventListener('change', calculate);
  if (rushFee) rushFee.addEventListener('change', calculate);
  if (miscSoftware) miscSoftware.addEventListener('input', calculate);
  if (toggleMargin) toggleMargin.addEventListener('change', calculate);
  const editDefaultPricesBtn = document.getElementById('editDefaultPricesBtn');
  if (editDefaultPricesBtn) {
    editDefaultPricesBtn.addEventListener('click', () => {
      if (window.parent && window.parent.navigateToTab) {
        window.parent.navigateToTab('tab-servicepricing');
      }
    });
  }

  // New text inputs also trigger saveState
  const textInputs = [propClientName, propContactName, propNote, propWorking, propOpps, propStripeUrl, propAov, propConvRate, propStartDate, propMeetingRecap, propTestimonial];
  textInputs.forEach(inp => {
    if (inp) {
      inp.addEventListener('input', saveState);
    }
  });

  if (addCustomBtn) {
    addCustomBtn.addEventListener('click', () => {
      const name = customName.value.trim();
      const price = parseFormattedNumber(customPrice.value);
      const type = customType.value;
      if (name && price > 0) {
        customItemsArray.push({ id: Date.now(), name, price, type });
        customName.value = '';
        customPrice.value = '';
        renderCustomItems();
        calculate();
      }
    });
  }

  function renderCustomItems() {
    if (!customItemsList) return;
    customItemsList.innerHTML = '';
    customItemsArray.forEach(item => {
      const li = document.createElement('li');
      li.style.cssText = 'display: flex; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; color: var(--color-text-secondary);';
      const textSpan = document.createElement('span');
      textSpan.textContent = `${item.name} (+$${item.price.toLocaleString()} ${item.type === 'monthly' ? '/mo' : 'one-time'})`;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '✕';
      removeBtn.style.cssText = 'background: none; border: none; color: #f68d5f; cursor: pointer;';
      removeBtn.onclick = () => {
        customItemsArray = customItemsArray.filter(i => i.id !== item.id);
        renderCustomItems();
        calculate();
      };
      li.appendChild(textSpan);
      li.appendChild(removeBtn);
      customItemsList.appendChild(li);
    });
  }

  serviceCheckboxes.forEach(cb => {
    cb.addEventListener('change', calculate);
  });

  resetBtn.addEventListener('click', () => {
    localStorage.removeItem('proposal-calc-state-v2');
    location.reload();
  });

  copyBtn.addEventListener('click', async () => {
    const text = generateTextOutput();
    try {
      await navigator.clipboard.writeText(text);
      const orig = copyBtn.innerHTML;
      copyBtn.innerHTML = "Copied to Clipboard!";
      setTimeout(() => copyBtn.innerHTML = orig, 2000);
    } catch(err) {
      console.error('Failed to copy', err);
    }
  });

  pdfBtn.addEventListener('click', generatePDFProposal);

  // Auto-generates a real Stripe subscription Checkout link from this
  // proposal's own computed monthly total (Aug 2026), replacing the old
  // manual copy-paste-from-Stripe-Dashboard step. Reuses the same
  // /api/billing/create-subscription-checkout route Contract & Invoice
  // Tracker's "Send Billing Link" button calls (see
  // generateProposalPaymentLink in the root app.js) - that shared helper
  // also finds-or-creates a matching Contract & Invoice Tracker record so
  // the resulting subscription is tracked and reconciled by the Stripe
  // webhook the normal way, not just embedded in this one PDF. Defaults to
  // LIVE mode since a proposal's Stripe link is meant to actually charge
  // the client once they sign - there's no reason to send someone a test
  // link when closing a deal.
  if (genPaymentLinkBtn) {
    genPaymentLinkBtn.addEventListener('click', async () => {
      const setStatus = (msg, isError) => {
        if (!genPaymentLinkStatus) return;
        genPaymentLinkStatus.textContent = msg;
        genPaymentLinkStatus.style.color = isError ? '#c0392b' : '#2e7d32';
      };
      setStatus('', false);

      const clientName = (propClientName && propClientName.value.trim()) || '';
      const monthlyNum = parseInt((totalMonthlyEl.textContent || '').replace(/[^0-9]/g, '')) || 0;

      if (!clientName) { setStatus('Enter a client name first.', true); return; }
      if (!monthlyNum) { setStatus('No monthly total yet - select services above first.', true); return; }
      if (!isEmbedded || !window.parent.generateProposalPaymentLink) {
        setStatus("Can't generate a link outside the Hub.", true);
        return;
      }

      const confirmed = confirm(`This creates a LIVE Stripe payment link for ${clientName} at $${monthlyNum.toLocaleString()}/mo - once they check out, their card is actually charged every month. Continue?`);
      if (!confirmed) return;

      genPaymentLinkBtn.disabled = true;
      const origLabel = genPaymentLinkBtn.textContent;
      genPaymentLinkBtn.textContent = 'Generating...';

      try {
        const result = await window.parent.generateProposalPaymentLink({ clientName, monthlyAmount: monthlyNum, mode: 'live' });
        if (propStripeUrl) propStripeUrl.value = result.checkoutUrl;
        saveState();
        setStatus(result.isNewRecord
          ? `Live link created and added to Contract & Invoice Tracker as a new client.`
          : `Live link created and saved to ${clientName}'s existing Tracker record.`, false);
        if (window.parent.showBanner) window.parent.showBanner('success', `Live payment link created for ${clientName}.`);
      } catch (e) {
        setStatus(e.message || "Couldn't generate a payment link.", true);
      } finally {
        genPaymentLinkBtn.disabled = false;
        genPaymentLinkBtn.textContent = origLabel;
      }
    });
  }

  // Init - persist:false, see calculate()'s own param comment below: this
  // first call is just rendering the totals from whatever loadState()
  // just hydrated, not a real edit, so it must not immediately write
  // back to the parent's clientsDb.
  calculate(false);

  // ── Core Calculation ──
  // persist (default true): whether to also write the recomputed state
  // back to the parent Hub's clientsDb via saveState() at the end of this
  // function. Every *user-driven* call site (checkbox/input change
  // handlers below) wants that - a real edit should sync. The one-time
  // init call above does not: this iframe gets a full reload every time
  // ANY client data changes anywhere in the Hub (see refreshIframeTab in
  // the root app.js), and until this flag existed, that reload's init
  // call to calculate() unconditionally re-saved via window.parent.
  // saveDatabase() even though nothing had actually changed - which
  // produced a fresh Firestore write, which triggered another reload
  // (here or in any other open tab), which saved again, forever. With
  // two tabs open cross-triggering each other's reloads this looped fast
  // enough to hit Firestore's "Write stream exhausted maximum allowed
  // queued writes" error - the "sync bugging out" symptom. A single tab
  // has the same loop, just slower/quieter, so this was silently
  // burning writes even outside that report.
  function calculate(persist = true) {
    let monthly = parseFormattedNumber(baseFee.value);
    let setup = 0;
    let hardCosts = 0; // Cost of goods sold (freelancers, software)
    let pricedServiceCount = 0; // how many selected services have a real per-service cost set
    let sowItems = [];

    // We assume 10% hard cost on base retainer
    hardCosts += monthly * 0.10;

    if (monthly > 0) {
      sowItems.push(`Account Management & Strategic Direction`);
    }

    let hasWebDesign = false;
    let hasSEO = false;

    // Dynamic Services
    serviceCheckboxes.forEach(cb => {
      if (cb.checked) {
        const feeType = cb.getAttribute('data-fee');
        const price = parseInt(cb.getAttribute('data-price')) || 0;
        const val = cb.value.toLowerCase();
        
        if (val.includes('website') || val.includes('landing page')) hasWebDesign = true;
        if (val.includes('seo')) hasSEO = true;

        // A real per-service cost set in Service Pricing Admin always wins
        // over the flat-percentage guesses below - those guesses only
        // exist as a fallback for services nobody's entered a real cost
        // for yet.
        const realCost = parseInt(cb.dataset.cost) || 0;
        const hasRealCost = realCost > 0;
        if (hasRealCost) pricedServiceCount++;

        if (feeType === 'setup') {
          setup += price;
          sowItems.push(`[ONE-TIME] ${cb.value}`);
          hardCosts += hasRealCost ? realCost : price * 0.40; // Assume 40% hard cost for setup projects if no real cost set
        } else {
          monthly += price;
          sowItems.push(cb.value);
          if (hasRealCost) {
            hardCosts += realCost;
          } else if (val.includes('hubspot') || val.includes('sprout') || val.includes('klaviyo')) {
            hardCosts += price; // 100% hard cost for software pass-through
          } else {
            hardCosts += price * 0.30; // 30% hard cost for labor
          }
        }
      }
    });

    // Dynamic Upsell Logic: Recommend SEO if Web Design is checked but SEO is not
    if (hasWebDesign && !hasSEO) {
      document.querySelectorAll('.service-cb').forEach(cb => {
        if (cb.value.toLowerCase().includes('seo')) {
          cb.parentElement.style.border = '1px solid var(--warning)';
          cb.parentElement.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
          cb.parentElement.title = "Upsell Opportunity: Clients building a website usually need SEO.";
        }
      });
    } else {
      document.querySelectorAll('.service-cb').forEach(cb => {
        cb.parentElement.style.border = '';
        cb.parentElement.style.backgroundColor = '';
        cb.parentElement.title = "";
      });
    }

    // Legacy inputs
    if (spendTier && parseInt(spendTier.value) > 0) {
      monthly += parseInt(spendTier.value);
      hardCosts += parseInt(spendTier.value) * 0.20;
      sowItems.push(`Premium Media Buying Tier`);
    }
    if (blogCount && parseInt(blogCount.value) > 0) {
      monthly += (parseInt(blogCount.value) * 300);
      hardCosts += (parseInt(blogCount.value) * 150);
      sowItems.push(`SEO-Optimized Blog Content`);
    }
    if (socialCount && parseInt(socialCount.value) > 0) {
      monthly += (parseInt(socialCount.value) * 100);
      hardCosts += (parseInt(socialCount.value) * 40);
      sowItems.push(`Organic Social Media Creation`);
    }

    customItemsArray.forEach(item => {
      if (item.type === 'setup') {
        setup += item.price;
        hardCosts += item.price * 0.40;
        sowItems.push(`[ONE-TIME] ${item.name}`);
      } else {
        monthly += item.price;
        hardCosts += item.price * 0.30;
        sowItems.push(item.name);
      }
    });

    if (miscSoftware && parseInt(miscSoftware.value) > 0) {
      monthly += parseInt(miscSoftware.value);
      hardCosts += parseInt(miscSoftware.value); // 100% cost
      sowItems.push(`Misc. Software Pass-through`);
    }

    let discountAmount = 0;
    if (contractTerm && parseInt(contractTerm.value) > 0) {
      const discountPct = parseInt(contractTerm.value);
      discountAmount = Math.round(monthly * (discountPct / 100));
      monthly -= discountAmount;
      sowItems.push(`- ${discountPct}% Commitment Term Discount`);
    }

    if (rushFee && rushFee.checked && setup > 0) {
      const rushAmount = Math.round(setup * 0.25);
      setup += rushAmount;
      hardCosts += rushAmount * 0.50; // Rush costs us more labor
      sowItems.push(`[ONE-TIME] Priority Rush Delivery Turnaround`);
    }

    // Margin Calculation
    const totalRevenue = monthly + setup;
    const profit = totalRevenue - hardCosts;
    const marginPct = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0;

    if (toggleMargin && toggleMargin.checked) {
      if(marginBox) {
        marginBox.style.display = 'flex';
        marginBox.style.flexDirection = 'column';
        if(totalHardCosts) totalHardCosts.textContent = "$" + Math.round(hardCosts).toLocaleString();
        if(profitMarginPercent) {
          profitMarginPercent.textContent = marginPct + "%";
          if (marginPct < 40) {
            profitMarginPercent.style.color = '#f68d5f'; // Red if low margin
          } else {
            profitMarginPercent.style.color = 'var(--success)';
          }
        }
        if (marginDataQuality) {
          const checkedCount = Array.from(serviceCheckboxes).filter(cb => cb.checked).length;
          marginDataQuality.textContent = checkedCount > 0
            ? `Based on real cost data for ${pricedServiceCount} of ${checkedCount} selected service${checkedCount === 1 ? '' : 's'} — the rest use estimated cost percentages. Set real costs in Service Pricing Admin.`
            : '';
        }
      }
    } else {
      if(marginBox) marginBox.style.display = 'none';
    }

    // Render Math
    totalMonthlyEl.textContent = "$" + monthly.toLocaleString();
    totalSetupEl.textContent = "$" + setup.toLocaleString();

    sowListEl.innerHTML = '';
    sowItems.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      sowListEl.appendChild(li);
    });

    if (persist) saveState();
  }

  function generateTextOutput() {
    let text = `PROPOSAL: SCOPE OF WORK\nDate: ${currentDateEl.textContent}\n\n`;
    text += `MONTHLY RETAINER: ${totalMonthlyEl.textContent}\n`;
    text += `ONE-TIME SETUP: ${totalSetupEl.textContent}\n\n`;
    text += `INCLUDED SERVICES:\n`;
    const items = sowListEl.querySelectorAll('li');
    items.forEach(item => { text += `- ${item.textContent}\n`; });
    return text;
  }

  function saveState() {
    const checkedValues = [];
    serviceCheckboxes.forEach(cb => { if (cb.checked) checkedValues.push(cb.value); });

    // computedMonthly/computedSetup: the actual dollar totals calculate()
    // just wrote into the DOM, read back the same way generatePDFProposal
    // already does (parse the $ text back to a number) rather than
    // re-deriving them here - saveState() doesn't have access to
    // calculate()'s local monthly/setup variables, and re-running the
    // whole pricing formula (base fee + tier + per-item add-ons + custom
    // items + rush fee + term discount) a second time here would be a
    // second copy of that logic to keep in sync. Nothing previously
    // persisted these - every other field in `state` is a raw input, not
    // a derived total - so there was no way to see proposal $ value
    // without opening this tool and reading the on-screen total. Used by
    // the root Hub's Sales Pipeline Value rollup on Overview Dashboard.
    const monthlyNum = parseInt((totalMonthlyEl.textContent || '').replace(/[^0-9]/g, '')) || 0;
    const setupNum = parseInt((totalSetupEl.textContent || '').replace(/[^0-9]/g, '')) || 0;

    const state = {
      baseFee: baseFee.value,
      computedMonthly: monthlyNum,
      computedSetup: setupNum,
      services: checkedValues,
      spendTier: spendTier ? spendTier.value : "0",
      blogCount: blogCount ? blogCount.value : "0",
      socialCount: socialCount ? socialCount.value : "0",
      contractTerm: contractTerm ? contractTerm.value : "0",
      rushFee: rushFee ? rushFee.checked : false,
      miscSoftware: miscSoftware ? miscSoftware.value : "0",
      customItems: customItemsArray,
      // Text inputs
      clientName: propClientName ? propClientName.value : "",
      contactName: propContactName ? propContactName.value : "",
      note: propNote ? propNote.value : "",
      working: propWorking ? propWorking.value : "",
      opps: propOpps ? propOpps.value : "",
      stripe: propStripeUrl ? propStripeUrl.value : "",
      aov: propAov ? propAov.value : "",
      convRate: propConvRate ? propConvRate.value : "",
      startDate: propStartDate ? propStartDate.value : "",
      meetingRecap: propMeetingRecap ? propMeetingRecap.value : "",
      testimonial: propTestimonial ? propTestimonial.value : ""
    };
    if (isEmbedded && parentClient) { parentClient.proposal = state; window.parent.saveDatabase(); window.parent.renderDashboard(); } else { localStorage.setItem('proposal-calc-state-v2', JSON.stringify(state)); }
  }

  function loadState() {
    let saved = null; if (isEmbedded && parentClient && parentClient.proposal && Object.keys(parentClient.proposal).length > 0) { saved = JSON.stringify(parentClient.proposal); } else { saved = localStorage.getItem('proposal-calc-state-v2'); }
    if (saved) {
      try {
        const state = JSON.parse(saved);
        setFormattedValue(baseFee, state.baseFee !== undefined ? state.baseFee : 2500);
        if (spendTier && state.spendTier) spendTier.value = state.spendTier;
        if (blogCount && state.blogCount) blogCount.value = state.blogCount;
        if (socialCount && state.socialCount) socialCount.value = state.socialCount;
        if (contractTerm && state.contractTerm) contractTerm.value = state.contractTerm;
        if (rushFee && state.rushFee !== undefined) rushFee.checked = state.rushFee;
        if (miscSoftware && state.miscSoftware) miscSoftware.value = state.miscSoftware;
        
        if (propClientName && state.clientName) propClientName.value = state.clientName;
        if (propContactName && state.contactName) propContactName.value = state.contactName;
        if (propNote && state.note) propNote.value = state.note;
        if (propWorking && state.working) propWorking.value = state.working;
        if (propOpps && state.opps) propOpps.value = state.opps;
        if (propStripeUrl && state.stripe) propStripeUrl.value = state.stripe;
        if (propAov && state.aov) setFormattedValue(propAov, state.aov);
        if (propConvRate && state.convRate) propConvRate.value = state.convRate;
        if (propStartDate && state.startDate) propStartDate.value = state.startDate;
        if (propMeetingRecap && state.meetingRecap) propMeetingRecap.value = state.meetingRecap;
        if (propTestimonial && state.testimonial) propTestimonial.value = state.testimonial;

        if (state.customItems) {
          customItemsArray = state.customItems;
          renderCustomItems();
        }

        const checkedValues = state.services || [];
        serviceCheckboxes.forEach(cb => {
          if (checkedValues.includes(cb.value)) cb.checked = true;
        });
      } catch(e) {}
    }
  }

  // ── 10-PAGE PDF GENERATOR ENGINE ──
  async function generatePDFProposal() {
    pdfBtn.disabled = true;
    const origText = pdfBtn.innerHTML;
    pdfBtn.innerHTML = "⏳ Generating...";

    // Grab values
    const clientName = (propClientName && propClientName.value) ? propClientName.value : "Client";
    const contactName = (propContactName && propContactName.value) ? propContactName.value : "Valued Partner";
    const note = (propNote && propNote.value) ? propNote.value : "Thank you for taking the time to connect with us. We are genuinely excited about what we can build together.";
    const working = (propWorking && propWorking.value) ? propWorking.value : "- Strong foundational brand presence.";
    const opps = (propOpps && propOpps.value) ? propOpps.value : "- Inconsistent posting schedule\n- Lack of conversion-focused funnels";
    const monthlyStr = totalMonthlyEl.textContent;
    const setupStr = totalSetupEl.textContent;
    const stripeUrl = (propStripeUrl && propStripeUrl.value) ? propStripeUrl.value : "#";
    const startDate = (propStartDate && propStartDate.value.trim()) ? propStartDate.value.trim() : "";
    const meetingRecap = (propMeetingRecap && propMeetingRecap.value.trim()) ? propMeetingRecap.value.trim() : "";
    const testimonial = (propTestimonial && propTestimonial.value.trim()) ? propTestimonial.value.trim() : "";
    const monthlyNum = parseInt(monthlyStr.replace(/[^0-9]/g, '')) || 0;

    // Human-readable contract term (e.g. "6-Month Contract"), stripping the
    // "(X% off)" detail that's only meaningful in the config UI dropdown.
    let contractTermLabel = "Month-to-Month";
    if (contractTerm && contractTerm.selectedIndex >= 0) {
      const rawLabel = contractTerm.options[contractTerm.selectedIndex].text;
      contractTermLabel = rawLabel.replace(/\s*\(\d+%\s*off\)\s*$/i, '').trim();
    }

    // ROI projection math
    let roiHtml = "";
    if (propAov && propAov.value && propConvRate && propConvRate.value && monthlyNum > 0) {
      const aov = parseFormattedNumber(propAov.value);
      const cr = parseFloat(propConvRate.value) / 100;
      const salesNeeded = Math.ceil(monthlyNum / aov);
      const trafficNeeded = Math.ceil(salesNeeded / cr);
      roiHtml = `
        <div style="background: #f8fafc; padding: 20px; border-left: 4px solid #3b82f6; margin-top: 20px;">
          <h4 style="margin-top:0; color:#0f172a;">Value Projection & ROI</h4>
          <p style="margin-bottom: 5px;">Based on your current Average Order Value ($${aov}) and Conversion Rate (${(cr*100).toFixed(1)}%):</p>
          <ul style="margin-bottom: 0;">
            <li>We only need to generate <strong>${salesNeeded} new sales per month</strong> for this entire marketing campaign to break even.</li>
            <li>That requires driving just <strong>${trafficNeeded} qualified visitors</strong> to your site.</li>
            <li>Everything beyond that is pure profit growth for ${clientName}.</li>
          </ul>
        </div>
      `;
    }

    // Proposal expiry date - 14 days from the proposal date, used on both
    // the cover page and the urgency line on the Next Steps page.
    const expiryDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const expiryDateStr = expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // Build the massive HTML document
    const container = document.createElement('div');
    container.style.fontFamily = "'Inter', sans-serif, Arial";
    container.style.color = "#1e293b";
    container.style.fontSize = "14px";
    container.style.lineHeight = "1.6";
    container.style.width = "100%";

    // CSS for PDF
    const style = `
      <style>
          .box, .col, .score-box, tr, td, h2, h3 { page-break-inside: avoid; }

        .page { padding: 40px; box-sizing: border-box; page-break-after: always; position: relative; min-height: 1050px; background: white; }
        .page:last-child { page-break-after: auto; }
        h1 { font-size: 32px; font-weight: 700; margin-bottom: 10px; color: #0f172a; }
        h2 { font-size: 24px; font-weight: 600; margin-bottom: 20px; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-top: 40px; text-transform: uppercase; letter-spacing: 1px; }
        h3 { font-size: 18px; font-weight: 600; margin-bottom: 15px; color: #334155; }
        p { margin-bottom: 15px; }
        ul { margin-bottom: 20px; padding-left: 20px; }
        li { margin-bottom: 8px; }
        .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        .table th, .table td { border: 1px solid #cbd5e1; padding: 12px; text-align: left; }
        .table th { background: #f1f5f9; font-weight: 600; color: #0f172a; }
        .cover-title { margin-top: 150px; font-size: 48px; border-bottom: 4px solid #3b82f6; padding-bottom: 20px; margin-bottom: 40px;}
        .meta-text { font-size: 16px; margin-bottom: 10px; color: #475569; }
        .btn-link { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 20px;}
        .tier-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 20px; background: #fff; }
        .tier-box.recommended { border-color: #3b82f6; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border-width: 2px; }
        .logo { height: 50px; width: 144px; object-fit: contain; margin-bottom: 40px; }
      </style>
    `;

    // Format textareas preserving newlines
    const formatText = (txt) => txt.replace(/\\n/g, '<br>').replace(/\\- /g, '<li>').replace(/<li>/g, '<ul><li>') + '</ul>';

    // Tier calculations
    const starterPrice = Math.round(monthlyNum * 0.7);
    const elitePrice = Math.round(monthlyNum * 1.4);

    container.innerHTML = `
      ${style}
      
      <!-- PAGE 1: COVER -->
      <div class="page">
        <img src="../logo.png" alt="Revital Hub" class="logo">
        <h1 class="cover-title">MARKETING PROPOSAL</h1>
        <div class="meta-text"><strong>Prepared For:</strong> ${clientName}</div>
        <div class="meta-text"><strong>Contact:</strong> ${contactName}</div>
        <div class="meta-text"><strong>Date:</strong> ${currentDateEl.textContent}</div>
        <div class="meta-text"><strong>Prepared By:</strong> Revital Productions</div>
        <div class="meta-text" style="margin-top: 20px; font-size: 13px; color: #94a3b8;">This proposal is valid for 14 days from the date above.</div>
        <div class="meta-text" style="font-size: 13px; color: #94a3b8;">Proposal expires: ${expiryDateStr}</div>
      </div>

      <!-- PAGE 2: NOTE & WHO WE ARE -->
      <div class="page">
        <h2>A NOTE FROM US</h2>
        <p>Hi ${contactName},</p>
        <p>${note}</p>
        
        <h2>WHO WE ARE</h2>
        <p>Revital Productions is a full-service marketing and digital production company. We specialize in helping businesses build a powerful digital presence — from content creation and social media management to paid advertising, SEO, and web design.</p>
        <p>We don't just run campaigns. We become an extension of your team — learning your brand, understanding your goals, and building a strategy that actually moves the needle.</p>
        <h3>What makes us different:</h3>
        <ul>
          <li><strong>Strategy-first approach</strong> — every campaign starts with a clear plan tied to your goals</li>
          <li><strong>Full in-house production</strong> — content, creative, copy, and ads all under one roof</li>
          <li><strong>Transparent reporting</strong> — you always know exactly what we're doing and why</li>
          <li><strong>Dedicated account management</strong> — one point of contact, always available</li>
        </ul>
      </div>

      ${testimonial ? `
      <!-- PAGE: WHAT OUR CLIENTS SAY (only when a testimonial is provided) -->
      <div class="page">
        <h2>WHAT OUR CLIENTS SAY</h2>
        <div style="border-left: 4px solid #3b82f6; padding: 10px 30px; margin-top: 60px;">
          <p style="font-size: 26px; font-style: italic; line-height: 1.5; color: #0f172a;">&ldquo;${testimonial.replace(/\\n/g, '<br>')}&rdquo;</p>
        </div>
      </div>
      ` : ''}

      <!-- PAGE 3: SITUATION -->
      <div class="page">
        <h2>YOUR CURRENT SITUATION</h2>
        ${meetingRecap ? `
        <h3>Based on Our Conversation</h3>
        <p>${meetingRecap.replace(/\\n/g, '<br>')}</p>
        ` : ''}
        <h3>What's Working:</h3>
        <p>${working.replace(/\\n/g, '<br>')}</p>
        
        <h3>Opportunities We've Identified:</h3>
        <p>${opps.replace(/\\n/g, '<br>')}</p>

        <h2>OUR RECOMMENDED SOLUTION</h2>
        <p>Based on our assessment, the fastest path to growth for ${clientName} is to implement a comprehensive strategy focusing on the exact services outlined below.</p>
        ${roiHtml}
      </div>

      <!-- PAGE 4: SCOPE OF SERVICES -->
      <div class="page">
        <h2>SCOPE OF SERVICES</h2>
        <p>The following scope of work outlines exactly what is included in our proposed engagement.</p>
        <ul style="list-style-type: square;">
          ${Array.from(sowListEl.querySelectorAll('li')).map(li => `<li>${li.textContent}</li>`).join('')}
        </ul>

        <h2 style="margin-top: 30px;">WHAT IS NOT INCLUDED</h2>
        <ul style="list-style-type: square;">
          <li>Ad spend and advertising platform fees (billed directly to client by the platform)</li>
          <li>Software and platform subscription fees (e.g. email marketing tools, scheduling software)</li>
          <li>Photography, videography, or on-location production shoots unless listed above</li>
          <li>Any services not explicitly listed in the scope above</li>
        </ul>
      </div>

      <!-- PAGE 5: INVESTMENT TIERS -->
      <div class="page">
        <h2>INVESTMENT TIERS</h2>
        <p>We offer three flexible tiers of partnership. We highly recommend the <strong>Professional Package</strong> based on our discovery call.</p>
        
        <div class="tier-box">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0;">Starter Package</h3>
            <span style="font-size:20px; font-weight:bold;">$${starterPrice.toLocaleString()} / mo</span>
          </div>
          <p style="color:#64748b; font-size:13px; margin-top:5px;">A stripped-down approach focusing only on the absolute essentials to keep momentum going.</p>
        </div>

        <div class="tier-box recommended">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:10px;">
              <h3 style="margin:0; color:#3b82f6;">Professional Package (Recommended)</h3>
              <span style="background:#dbeafe; color:#1e40af; font-size:11px; padding:3px 8px; border-radius:12px; font-weight:600;">BEST VALUE</span>
            </div>
            <span style="font-size:24px; font-weight:bold; color:#3b82f6;">${monthlyStr} / mo</span>
          </div>
          <div style="font-size:13px; color:#3b82f6; font-weight:600; margin-top:6px;">Contract Term: ${contractTermLabel}</div>
          <p style="color:#64748b; font-size:13px; margin-top:5px;">The exact Scope of Services outlined on the previous page. Designed to hit your growth targets aggressively.</p>
        </div>

        <div class="tier-box">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0;">Elite Package</h3>
            <span style="font-size:20px; font-weight:bold;">$${elitePrice.toLocaleString()} / mo</span>
          </div>
          <p style="color:#64748b; font-size:13px; margin-top:5px;">Includes everything in Professional, plus doubled ad spend management and aggressive SEO/Content scaling.</p>
        </div>

        <h3>One-Time Fees</h3>
        <table class="table">
          <tr><th>Item</th><th>Investment</th></tr>
          <tr><td>Setup & Onboarding Strategy</td><td>${setupStr}</td></tr>
        </table>
      </div>

      <!-- PAGE 6: TERMS & CONDITIONS -->
      <div class="page">
        <h2>TERMS &amp; CONDITIONS</h2>
        <ul>
          <li>Payment is processed via Stripe on the 1st of each month, in advance for that month's services</li>
          <li>The first payment is due upon signing and confirms intent to begin services. Work does not begin until the first payment is received.</li>
          <li>Written cancellation notice must be received by Revital Productions no later than the 20th of the month to avoid being charged for the following month's retainer</li>
          <li>Ad spend and advertising platform fees are billed directly to the client by the platform and are entirely separate from Revital Productions management fees</li>
          <li>Any services not explicitly listed in the Scope of Services above require a written Change Order before work begins</li>
          <li>Revision requests must be submitted through the Submit a Revision Quick Action in the client's Hub portal &mdash; not via email or text</li>
          <li>Content approvals must be submitted through the Hub portal Approvals tab</li>
          <li>Full legal terms are covered in the Statement of Work and Master Service Agreement included with this proposal</li>
        </ul>
      </div>

      <!-- PAGE 7: NEXT STEPS -->
      <div class="page">
        <h2>NEXT STEPS</h2>
        <p>Ready to move forward with the Recommended Package? Here's exactly what happens next:</p>

        <div style="margin-top: 20px;">
          <p style="margin-bottom: 10px;"><strong>Step 1</strong> &mdash; Review this proposal and the included Statement of Work and Master Service Agreement</p>
          <p style="margin-bottom: 10px;"><strong>Step 2</strong> &mdash; Sign the Statement of Work and Master Service Agreement</p>
          <p style="margin-bottom: 10px;"><strong>Step 3</strong> &mdash; Submit your first payment via the button below to lock in your start date</p>
          <p style="margin-bottom: 10px;"><strong>Step 4</strong> &mdash; We send your welcome email and set up your Hub portal (Day 1-2)</p>
          <p style="margin-bottom: 10px;"><strong>Step 5</strong> &mdash; Kick-off call to align on strategy (Within 5 days)</p>
          <p style="margin-bottom: 10px;"><strong>Step 6</strong> &mdash; We build your campaigns and content (Week 1-2)</p>
          <p style="margin-bottom: 10px;"><strong>Step 7</strong> &mdash; We go live (Week 2-3)</p>
        </div>

        ${startDate ? `<p style="margin-top: 20px;"><strong>Proposed Start Date:</strong> ${startDate}</p>` : ''}

        ${stripeUrl !== '#' ? `
        <div style="text-align:center; margin-top:40px;">
          <a href="${stripeUrl}" class="btn-link" target="_blank">Submit Payment &amp; Lock In Your Start Date</a>
        </div>
        ` : ''}

        <p style="margin-top: 30px; font-size: 13px; color: #94a3b8;">This proposal expires on ${expiryDateStr}. Prices and availability are not guaranteed after this date.</p>
      </div>
    `;

    try {
      const opt = {
        margin:       0,
        filename:     `${clientName.replace(/\s+/g, '_')}_Proposal_${new Date().toISOString().split('T')[0]}.pdf`,
        image:        { type: 'jpeg', quality: 0.92 },
        html2canvas:  { scale: 2, letterRendering: true, useCORS: true },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
      };
      
      if (typeof html2pdf !== 'undefined') {
        await html2pdf().set(opt).from(container).save();
      } else {
        alert("PDF library failed to load.");
      }
    } catch(e) {
      console.error("PDF Error:", e);
      alert("An error occurred generating the PDF.");
    }

    pdfBtn.disabled = false;
    pdfBtn.innerHTML = origText;
  }
});