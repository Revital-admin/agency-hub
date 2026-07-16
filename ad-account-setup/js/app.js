// Ad Account Setup — client-scoped interactive checklist tool
// Data lives at client.adAccountSetup.<platform>.<key>, mirroring the
// namespaced-key pattern used by every other per-client tool in the Hub
// (client.paidAdsAudit, client.onboardingChecklist, etc).
//
// Platforms are defined as data (PLATFORM_SCHEMAS) and rendered by one
// generic engine, so adding Google/TikTok/LinkedIn later is just adding
// a schema object — no new rendering code needed.

(function () {
  'use strict';

  // ── Schema definitions ──────────────────────────────────────────────
  // item types: 'check' (boolean, counts toward progress), 'text',
  // 'number', 'textarea', 'select' (options: [{value,label}])
  const PLATFORM_SCHEMAS = {
    meta: {
      label: 'Meta',
      sections: [
        {
          title: 'Section 1 — Business Manager Setup',
          items: [
            { type: 'check', key: 'hasBM', label: 'Client has a Meta Business Manager account',
              guide: 'If no: Go to business.facebook.com → Create Account → enter business name, email, and website' },
            { type: 'text', key: 'bmId', label: 'Business Manager ID' },
            { type: 'check', key: 'partnerAdded', label: 'Revital Productions added as a Partner',
              guide: 'In Business Manager → Settings → Partners → Add → enter Revital Productions Business Manager ID: [YOUR BM ID]' },
            { type: 'check', key: 'partnerConfirmed', label: 'Partner access confirmed — can see the account' }
          ]
        },
        {
          title: 'Section 2 — Ad Account',
          items: [
            { type: 'check', key: 'hasAdAccount', label: 'Ad account exists inside Business Manager',
              guide: 'If no: In Business Manager → Accounts → Ad Accounts → Add → Create a New Ad Account' },
            { type: 'text', key: 'adAccountId', label: 'Ad Account ID' },
            { type: 'check', key: 'partnerAssigned', label: 'Revital Productions assigned to Ad Account with Advertiser access' },
            { type: 'check', key: 'paymentConfirmed', label: 'Payment method confirmed on Ad Account' },
            { type: 'check', key: 'spendLimitSet', label: 'Ad account spending limit set (if applicable)' },
            { type: 'number', key: 'monthlySpendLimit', label: 'Monthly Spend Limit ($)' }
          ]
        },
        {
          title: 'Section 3 — Facebook Pixel',
          items: [
            { type: 'check', key: 'pixelCreated', label: 'Meta Pixel created in Events Manager',
              guide: "If no: In Business Manager → Events Manager → Connect Data Sources → Web → Meta Pixel → name it [Client Name] Website Pixel" },
            { type: 'text', key: 'pixelId', label: 'Pixel ID' },
            { type: 'select', key: 'pixelInstallMethod', label: 'Pixel installed on client’s website', options: [
              { value: '', label: 'Select…' },
              { value: 'code', label: 'Installed via code' },
              { value: 'partner', label: 'Installed via partner integration (Shopify, WordPress, etc.)' },
              { value: 'none', label: 'Not yet installed' }
            ] },
            { type: 'check', key: 'pixelVerified', label: 'Pixel verified firing correctly in Events Manager' },
            { type: 'check', key: 'capiSetup', label: 'Conversions API set up (if applicable)' }
          ]
        },
        {
          title: 'Section 4 — Conversion Events',
          items: [
            { type: 'textarea', key: 'conversionEvents', label: 'Conversion Events Set Up', hint: 'List the key conversion events configured in Events Manager' },
            { type: 'check', key: 'testEventsConfirmed', label: 'Test Events confirmed firing correctly' },
            { type: 'check', key: 'aemConfigured', label: 'Aggregated Event Measurement configured (if website uses iOS traffic)' }
          ]
        },
        {
          title: 'Section 5 — Instagram Connection',
          items: [
            { type: 'check', key: 'igConnected', label: "Client's Instagram account connected to Business Manager" },
            { type: 'check', key: 'igAvailable', label: 'Instagram account confirmed available for ad placement' }
          ]
        },
        {
          title: 'Section 6 — Audience Setup',
          items: [
            { type: 'check', key: 'wcaCreated', label: 'Website Custom Audience created (all website visitors — 180 days)' },
            { type: 'check', key: 'customerListUploaded', label: 'Customer list uploaded (if client has one)' },
            { type: 'check', key: 'lookalikeCreated', label: 'Lookalike Audiences created from website visitors or customer list' }
          ]
        },
        {
          title: 'Section 7 — Account Notes',
          items: [
            { type: 'textarea', key: 'notes', label: 'Ad Account Notes', hint: 'Any account-specific details, restrictions, or context' }
          ]
        }
      ]
    }
    // google, tiktok, linkedin schemas are added here in later passes.
  };

  const PLATFORM_ORDER = ['meta', 'google', 'tiktok', 'linkedin'];

  // ── Cross-frame Hub access ──────────────────────────────────────────
  let getActiveClient = null;
  let saveDatabase = null;
  try {
    getActiveClient = window.parent.getActiveClient;
    saveDatabase = window.parent.saveDatabase;
  } catch (e) {
    console.log('CORS blocked parent access');
  }

  let client = null;
  let currentPlatform = 'meta';
  let saveTimer = null;

  function ensureDataShape(c) {
    if (!c.adAccountSetup) c.adAccountSetup = {};
    PLATFORM_ORDER.forEach(p => {
      if (!c.adAccountSetup[p]) c.adAccountSetup[p] = {};
    });
  }

  function getValue(platform, key) {
    return client.adAccountSetup[platform][key];
  }

  function setValue(platform, key, value) {
    client.adAccountSetup[platform][key] = value;
    queueSave();
    updateProgress();
  }

  function queueSave() {
    if (!saveDatabase) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveDatabase();
      flashSaveIndicator();
    }, 400);
  }

  function flashSaveIndicator() {
    const el = document.getElementById('saveIndicator');
    if (!el) return;
    el.textContent = 'Saved';
    el.classList.add('show');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove('show'), 1500);
  }

  // ── Rendering ────────────────────────────────────────────────────────
  function renderPlatform(platform) {
    const panel = document.getElementById('panel-' + platform);
    if (!panel) return;
    const schema = PLATFORM_SCHEMAS[platform];

    if (!schema) {
      panel.innerHTML = '<div class="aas-coming-soon">' +
        (PLATFORM_ORDER.includes(platform) ? 'This platform is coming soon.' : '') +
        '</div>';
      return;
    }

    panel.innerHTML = '';
    schema.sections.forEach(section => {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'aas-section';

      const titleEl = document.createElement('h2');
      titleEl.className = 'aas-section-title';
      titleEl.textContent = section.title;
      sectionEl.appendChild(titleEl);

      section.items.forEach(item => {
        sectionEl.appendChild(renderItem(platform, item));
      });

      panel.appendChild(sectionEl);
    });
  }

  function renderItem(platform, item) {
    const value = getValue(platform, item.key);

    if (item.type === 'check') {
      const row = document.createElement('div');
      row.className = 'aas-check-item' + (value ? ' checked' : '');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'aas-' + platform + '-' + item.key;
      checkbox.checked = !!value;
      checkbox.addEventListener('change', () => {
        row.classList.toggle('checked', checkbox.checked);
        setValue(platform, item.key, checkbox.checked);
      });

      const body = document.createElement('div');
      body.className = 'aas-check-item-body';

      const label = document.createElement('label');
      label.className = 'aas-check-item-label';
      label.setAttribute('for', checkbox.id);
      label.textContent = item.label;
      body.appendChild(label);

      if (item.guide) {
        const guide = document.createElement('div');
        guide.className = 'aas-guide-text';
        guide.textContent = item.guide;
        body.appendChild(guide);
      }

      row.appendChild(checkbox);
      row.appendChild(body);
      return row;
    }

    // text / number / textarea / select share a common row layout
    const row = document.createElement('div');
    row.className = 'aas-field-row';

    const label = document.createElement('label');
    label.textContent = item.label;
    row.appendChild(label);

    let input;
    if (item.type === 'textarea') {
      input = document.createElement('textarea');
      input.value = value || '';
    } else if (item.type === 'select') {
      input = document.createElement('select');
      (item.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (value === opt.value) o.selected = true;
        input.appendChild(o);
      });
    } else {
      input = document.createElement('input');
      input.type = item.type === 'number' ? 'number' : 'text';
      input.value = value || '';
    }

    const eventName = (item.type === 'select') ? 'change' : 'input';
    input.addEventListener(eventName, () => setValue(platform, item.key, input.value));
    if (item.type !== 'select') {
      input.addEventListener('blur', () => setValue(platform, item.key, input.value));
    }

    row.appendChild(input);

    if (item.hint) {
      const hint = document.createElement('div');
      hint.className = 'aas-field-hint';
      hint.textContent = item.hint;
      row.appendChild(hint);
    }

    return row;
  }

  // ── Progress ─────────────────────────────────────────────────────────
  function updateProgress() {
    const schema = PLATFORM_SCHEMAS[currentPlatform];
    const fill = document.getElementById('progressFill');
    const label = document.getElementById('progressLabel');
    if (!schema) {
      if (fill) fill.style.width = '0%';
      if (label) label.textContent = 'Not built yet';
      return;
    }

    let total = 0;
    let done = 0;
    schema.sections.forEach(section => {
      section.items.forEach(item => {
        if (item.type === 'check') {
          total++;
          if (getValue(currentPlatform, item.key)) done++;
        }
      });
    });

    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = done + ' / ' + total + ' steps complete';
  }

  // ── Tab switching ────────────────────────────────────────────────────
  function switchPlatform(platform) {
    currentPlatform = platform;
    document.querySelectorAll('.aas-platform-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.platform === platform);
    });
    document.querySelectorAll('.aas-platform-panel').forEach(panel => {
      panel.style.display = (panel.id === 'panel-' + platform) ? '' : 'none';
    });
    updateProgress();
  }

  // ── Init ─────────────────────────────────────────────────────────────
  function init() {
    if (!getActiveClient) {
      document.getElementById('clientNameDisplay').textContent = 'Hub database not accessible.';
      return;
    }
    client = getActiveClient();
    if (!client) {
      document.getElementById('clientNameDisplay').textContent = 'No active client selected.';
      return;
    }
    ensureDataShape(client);

    document.getElementById('clientNameDisplay').textContent = client.name || 'Untitled Client';

    PLATFORM_ORDER.forEach(renderPlatform);
    switchPlatform('meta');

    document.querySelectorAll('.aas-platform-tab').forEach(tab => {
      tab.addEventListener('click', () => switchPlatform(tab.dataset.platform));
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
      if (saveDatabase) {
        saveDatabase();
        flashSaveIndicator();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
