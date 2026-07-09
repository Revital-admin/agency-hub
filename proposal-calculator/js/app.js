document.addEventListener('DOMContentLoaded', () => {
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
  const propAov = document.getElementById('propAov');
  const propConvRate = document.getElementById('propConvRate');

  // NEW: Admin Controls
  const toggleMargin = document.getElementById('toggleMargin');
  const adminControlsPanel = document.getElementById('adminControlsPanel');
  const marginBox = document.getElementById('marginBox');
  const totalHardCosts = document.getElementById('totalHardCosts');
  const profitMarginPercent = document.getElementById('profitMarginPercent');

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
  async function checkAdminIdentity() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('dev') === 'admin' || (window.parent && window.parent.location.search.includes('dev=admin'))) {
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

  // Load from localStorage
  loadState();

  // ── Package Presets ──
  const presets = {
    presetBasic: [
      "Feed Posts (static images, carousels)",
      "Reels & Short-Form Video",
      "Stories",
      "Community Management (responding to comments, DMs, engaging followers)",
      "Content Calendar Management"
    ],
    presetGrowth: [
      "Meta Ads (Facebook + Instagram)",
      "Google Ads — Search",
      "Audience Research & Targeting",
      "Ad Creative Production",
      "Campaign Setup & Management",
      "Budget Management & Reporting"
    ],
    presetFull: [
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
  };

  ['presetBasic', 'presetGrowth', 'presetFull'].forEach(presetId => {
    const btn = document.getElementById(presetId);
    if (btn) {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.service-cb').forEach(cb => cb.checked = false);
        const services = presets[presetId];
        document.querySelectorAll('.service-cb').forEach(cb => {
          if (services.includes(cb.value)) cb.checked = true;
        });
        calculate();
      });
    }
  });

  // Bind events
  baseFee.addEventListener('input', calculate);
  if (spendTier) spendTier.addEventListener('change', calculate);
  if (blogCount) blogCount.addEventListener('input', calculate);
  if (socialCount) socialCount.addEventListener('input', calculate);
  if (contractTerm) contractTerm.addEventListener('change', calculate);
  if (rushFee) rushFee.addEventListener('change', calculate);
  if (miscSoftware) miscSoftware.addEventListener('input', calculate);
  if (toggleMargin) toggleMargin.addEventListener('change', calculate);

  // New text inputs also trigger saveState
  const textInputs = [propClientName, propContactName, propNote, propWorking, propOpps, propStripeUrl, propAov, propConvRate];
  textInputs.forEach(inp => {
    if (inp) {
      inp.addEventListener('input', saveState);
    }
  });

  if (addCustomBtn) {
    addCustomBtn.addEventListener('click', () => {
      const name = customName.value.trim();
      const price = parseInt(customPrice.value) || 0;
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

  // Init
  calculate();

  // ── Core Calculation ──
  function calculate() {
    let monthly = parseInt(baseFee.value) || 0;
    let setup = 0;
    let hardCosts = 0; // Cost of goods sold (freelancers, software)
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

        if (feeType === 'setup') {
          setup += price;
          sowItems.push(`[ONE-TIME] ${cb.value}`);
          hardCosts += price * 0.40; // Assume 40% hard cost for setup projects
        } else {
          monthly += price;
          sowItems.push(cb.value);
          // Special hard costs for software vs labor
          if (val.includes('hubspot') || val.includes('sprout') || val.includes('klaviyo')) {
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

    saveState();
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
    
    const state = {
      baseFee: baseFee.value,
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
      convRate: propConvRate ? propConvRate.value : ""
    };
    localStorage.setItem('proposal-calc-state-v2', JSON.stringify(state));
  }

  function loadState() {
    const saved = localStorage.getItem('proposal-calc-state-v2');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        baseFee.value = state.baseFee !== undefined ? state.baseFee : 2500;
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
        if (propAov && state.aov) propAov.value = state.aov;
        if (propConvRate && state.convRate) propConvRate.value = state.convRate;

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
    const monthlyNum = parseInt(monthlyStr.replace(/[^0-9]/g, '')) || 0;

    // ROI projection math
    let roiHtml = "";
    if (propAov && propAov.value && propConvRate && propConvRate.value && monthlyNum > 0) {
      const aov = parseFloat(propAov.value);
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
        <h1 class="cover-title">MARKETING PROPOSAL</h1>
        <div class="meta-text"><strong>Prepared For:</strong> ${clientName}</div>
        <div class="meta-text"><strong>Contact:</strong> ${contactName}</div>
        <div class="meta-text"><strong>Date:</strong> ${currentDateEl.textContent}</div>
        <div class="meta-text"><strong>Prepared By:</strong> Revital Productions</div>
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

      <!-- PAGE 3: SITUATION -->
      <div class="page">
        <h2>YOUR CURRENT SITUATION</h2>
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

      <!-- PAGE 6: NEXT STEPS -->
      <div class="page">
        <h2>HOW WE GET STARTED</h2>
        <table class="table">
          <tr><th>Step</th><th>What Happens</th><th>Timeline</th></tr>
          <tr><td>1</td><td>Sign this proposal and submit initial payment</td><td>Day 1</td></tr>
          <tr><td>2</td><td>We send your welcome email and setup portal</td><td>Day 1-2</td></tr>
          <tr><td>3</td><td>Kick-off call to align on strategy</td><td>Within 5 days</td></tr>
          <tr><td>4</td><td>We build your campaigns and content</td><td>Week 1-2</td></tr>
          <tr><td>5</td><td>We go live</td><td>Week 2-3</td></tr>
        </table>

        <h2>NEXT STEPS</h2>
        <p>Ready to move forward with the Recommended Package?</p>
        <p>1. Review the Terms & Conditions below.<br>2. Click the button below to submit your first invoice payment and lock in your kickoff date.</p>
        
        ${stripeUrl !== '#' ? `
        <div style="text-align:center; margin-top:40px;">
          <a href="${stripeUrl}" class="btn-link" target="_blank">Proceed to Secure Payment</a>
        </div>
        ` : ''}
      </div>
    `;

    try {
      const opt = {
        margin:       0,
        filename:     `${clientName.replace(/\s+/g, '_')}_Proposal_${new Date().toISOString().split('T')[0]}.pdf`,
        image:        { type: 'png' },
        html2canvas:  { scale: 4, letterRendering: true, useCORS: true },
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