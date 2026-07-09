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

  let customItemsArray = [];

  // Outputs
  const totalMonthlyEl = document.getElementById('totalMonthly');
  const totalSetupEl = document.getElementById('totalSetup');
  const sowListEl = document.getElementById('sowList');
  const currentDateEl = document.getElementById('currentDate');
  const copyBtn = document.getElementById('copyBtn');

  // Set Date
  const today = new Date();
  currentDateEl.textContent = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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
        // Clear existing
        document.querySelectorAll('.service-cb').forEach(cb => cb.checked = false);
        
        // Select new
        const services = presets[presetId];
        document.querySelectorAll('.service-cb').forEach(cb => {
          if (services.includes(cb.value)) {
            cb.checked = true;
          }
        });
        calculate();
      });
    }
  });

  // Bind events
  baseFee.addEventListener('change', calculate);
  baseFee.addEventListener('input', calculate);

  if (spendTier) spendTier.addEventListener('change', calculate);
  if (blogCount) {
    blogCount.addEventListener('change', calculate);
    blogCount.addEventListener('input', calculate);
  }
  if (socialCount) {
    socialCount.addEventListener('change', calculate);
    socialCount.addEventListener('input', calculate);
  }

  if (contractTerm) contractTerm.addEventListener('change', calculate);
  if (rushFee) rushFee.addEventListener('change', calculate);
  if (miscSoftware) {
    miscSoftware.addEventListener('change', calculate);
    miscSoftware.addEventListener('input', calculate);
  }

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

  // Init
  calculate();

  function calculate() {
    let monthly = parseInt(baseFee.value) || 0;
    let setup = 0;
    let sowItems = [];

    // Base Retainer
    if (monthly > 0) {
      sowItems.push(`Account Management & Strategic Direction`);
    }

    // Dynamic Services
    serviceCheckboxes.forEach(cb => {
      if (cb.checked) {
        const feeType = cb.getAttribute('data-fee');
        const price = parseInt(cb.getAttribute('data-price')) || 0;
        
        if (feeType === 'setup') {
          setup += price;
          // Clean up the text to remove price tags from SOW list
          let label = cb.value;
          sowItems.push(`[ONE-TIME] ${label}`);
        } else {
          monthly += price;
          sowItems.push(cb.value);
        }
      }
    });

    // Legacy inputs
    if (spendTier) {
      const tier = parseInt(spendTier.value) || 0;
      if (tier > 0) {
        monthly += tier;
        sowItems.push(`Premium Media Buying Tier (High Spend Management)`);
      }
    }

    if (blogCount) {
      const blogs = parseInt(blogCount.value) || 0;
      if (blogs > 0) {
        monthly += (blogs * 300);
        sowItems.push(`SEO-Optimized Blog Content (${blogs}x posts/month)`);
      }
    }

    if (socialCount) {
      const social = parseInt(socialCount.value) || 0;
      if (social > 0) {
        monthly += (social * 100);
        sowItems.push(`Organic Social Media Creation (${social}x posts/month)`);
      }
    }

    // Custom Items
    customItemsArray.forEach(item => {
      if (item.type === 'setup') {
        setup += item.price;
        sowItems.push(`[ONE-TIME] ${item.name}`);
      } else {
        monthly += item.price;
        sowItems.push(item.name);
      }
    });

    if (miscSoftware) {
      const misc = parseInt(miscSoftware.value) || 0;
      if (misc > 0) {
        monthly += misc;
        sowItems.push(`Misc. Software Pass-through Expenses`);
      }
    }

    // Discounts & Multipliers
    if (contractTerm) {
      const discountPct = parseInt(contractTerm.value) || 0;
      if (discountPct > 0) {
        const discountAmount = Math.round(monthly * (discountPct / 100));
        monthly -= discountAmount;
        sowItems.push(`- ${discountPct}% Commitment Term Discount applied to Retainer`);
      }
    }

    if (rushFee && rushFee.checked) {
      if (setup > 0) {
        const rushAmount = Math.round(setup * 0.25);
        setup += rushAmount;
        sowItems.push(`[ONE-TIME] Priority Rush Delivery Turnaround (+25% Setup Fee)`);
      }
    }

    // Render Math
    totalMonthlyEl.textContent = "$" + monthly.toLocaleString();
    totalSetupEl.textContent = "$" + setup.toLocaleString();

    // Render List
    sowListEl.innerHTML = '';
    sowItems.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      sowListEl.appendChild(li);
    });

    // Save
    saveState();
  }

  function generateTextOutput() {
    let text = `PROPOSAL: SCOPE OF WORK\nDate: ${currentDateEl.textContent}\n\n`;
    text += `MONTHLY RETAINER: ${totalMonthlyEl.textContent}\n`;
    text += `ONE-TIME SETUP: ${totalSetupEl.textContent}\n\n`;
    text += `INCLUDED SERVICES:\n`;
    
    const items = sowListEl.querySelectorAll('li');
    items.forEach(item => {
      text += `- ${item.textContent}\n`;
    });

    return text;
  }

  function saveState() {
    const checkedValues = [];
    serviceCheckboxes.forEach(cb => {
      if (cb.checked) checkedValues.push(cb.value);
    });

    const state = {
      baseFee: baseFee.value,
      services: checkedValues,
      spendTier: spendTier ? spendTier.value : "0",
      blogCount: blogCount ? blogCount.value : "0",
      socialCount: socialCount ? socialCount.value : "0",
      contractTerm: contractTerm ? contractTerm.value : "0",
      rushFee: rushFee ? rushFee.checked : false,
      miscSoftware: miscSoftware ? miscSoftware.value : "0",
      customItems: customItemsArray
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
        
        if (state.customItems) {
          customItemsArray = state.customItems;
          renderCustomItems();
        }

        const checkedValues = state.services || [];
        serviceCheckboxes.forEach(cb => {
          if (checkedValues.includes(cb.value)) {
            cb.checked = true;
          }
        });
      } catch(e) {}
    }
  }

});
