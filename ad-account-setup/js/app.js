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
    },
    google: {
      label: 'Google Ads',
      sections: [
        {
          title: 'Section 1 — Google Ads Account',
          items: [
            { type: 'check', key: 'hasGoogleAdsAccount', label: 'Client has a Google Ads account',
              guide: 'If no: Go to ads.google.com → Start Now → Create an account without a campaign (Switch to Expert Mode first)' },
            { type: 'text', key: 'googleAdsAccountId', label: 'Google Ads Customer ID (XXX-XXX-XXXX)' },
            { type: 'check', key: 'mccLinked', label: 'Revital Productions MCC linked to account',
              guide: 'From your MCC: Account Access → Managers → Link → enter client Customer ID, or ask client to accept your link request' },
            { type: 'check', key: 'mccConfirmed', label: 'MCC access confirmed — can see the account' },
            { type: 'check', key: 'paymentConfirmed', label: 'Billing / payment method set up on account' },
            { type: 'number', key: 'monthlyBudget', label: 'Monthly Budget ($)' }
          ]
        },
        {
          title: 'Section 2 — Conversion Tracking',
          items: [
            { type: 'check', key: 'gtagInstalled', label: 'Google tag (gtag.js) installed on website',
              guide: 'In Google Ads → Tools → Conversions → Google tag → install via Google Tag Manager or site code' },
            { type: 'check', key: 'gtmUsed', label: 'Installed via Google Tag Manager' },
            { type: 'text', key: 'gtmContainerId', label: 'GTM Container ID (if used)' },
            { type: 'check', key: 'conversionActionsCreated', label: 'Key conversion actions created (leads, purchases, calls, etc.)' },
            { type: 'textarea', key: 'conversionActionsList', label: 'Conversion Actions Configured', hint: 'List each conversion action and its category' },
            { type: 'check', key: 'conversionsVerified', label: 'Conversions verified firing correctly (Tag Assistant / Ads diagnostics)' },
            { type: 'check', key: 'enhancedConversions', label: 'Enhanced Conversions enabled (if applicable)' }
          ]
        },
        {
          title: 'Section 3 — Analytics & Merchant Center',
          items: [
            { type: 'check', key: 'ga4Linked', label: 'Google Analytics 4 property linked to Ads account' },
            { type: 'text', key: 'ga4PropertyId', label: 'GA4 Property ID' },
            { type: 'check', key: 'merchantCenterNeeded', label: 'Google Merchant Center required (ecommerce client)' },
            { type: 'check', key: 'merchantCenterLinked', label: 'Merchant Center linked to Ads account (if applicable)' }
          ]
        },
        {
          title: 'Section 4 — Audience Setup',
          items: [
            { type: 'check', key: 'remarketingTagInstalled', label: 'Remarketing tag installed / audience source created' },
            { type: 'check', key: 'websiteAudienceCreated', label: 'Website visitor remarketing audience created (180 days)' },
            { type: 'check', key: 'customerMatchUploaded', label: 'Customer Match list uploaded (if client has one)' }
          ]
        },
        {
          title: 'Section 5 — Campaign Foundations',
          items: [
            { type: 'select', key: 'campaignType', label: 'Primary campaign type', options: [
              { value: '', label: 'Select…' },
              { value: 'search', label: 'Search' },
              { value: 'pmax', label: 'Performance Max' },
              { value: 'display', label: 'Display' },
              { value: 'shopping', label: 'Shopping' },
              { value: 'video', label: 'Video' }
            ] },
            { type: 'check', key: 'keywordResearchDone', label: 'Keyword research / asset groups completed' },
            { type: 'check', key: 'negativeKeywordsAdded', label: 'Negative keyword list applied' }
          ]
        },
        {
          title: 'Section 6 — Account Notes',
          items: [
            { type: 'textarea', key: 'notes', label: 'Ad Account Notes', hint: 'Any account-specific details, restrictions, or context' }
          ]
        }
      ]
    },
    tiktok: {
      label: 'TikTok Ads',
      sections: [
        {
          title: 'Section 1 — TikTok Business Center Setup',
          items: [
            { type: 'check', key: 'hasBusinessCenter', label: 'Client has a TikTok Business Center account',
              guide: 'If no: Go to business.tiktok.com → Create Business Center account' },
            { type: 'text', key: 'businessCenterId', label: 'Business Center ID' },
            { type: 'check', key: 'partnerAdded', label: 'Revital Productions added as a Partner / Admin',
              guide: 'Business Center → Users → Partners → Add → enter Revital Productions Business Center ID' },
            { type: 'check', key: 'partnerConfirmed', label: 'Partner access confirmed — can see the account' }
          ]
        },
        {
          title: 'Section 2 — Ad Account',
          items: [
            { type: 'check', key: 'hasAdAccount', label: 'Ad account created inside Business Center',
              guide: 'If no: Business Center → Ad Accounts → Create → follow setup wizard' },
            { type: 'text', key: 'adAccountId', label: 'Ad Account ID' },
            { type: 'check', key: 'paymentConfirmed', label: 'Payment method confirmed on Ad Account' },
            { type: 'number', key: 'monthlySpendLimit', label: 'Monthly Spend Limit ($)' }
          ]
        },
        {
          title: 'Section 3 — TikTok Pixel',
          items: [
            { type: 'check', key: 'pixelCreated', label: 'TikTok Pixel created in Events Manager',
              guide: "If no: Assets → Events → Web Events → Set Up Web Events → name it [Client Name] Website Pixel" },
            { type: 'text', key: 'pixelId', label: 'Pixel ID' },
            { type: 'select', key: 'pixelInstallMethod', label: "Pixel installed on client's website", options: [
              { value: '', label: 'Select…' },
              { value: 'code', label: 'Installed via code' },
              { value: 'partner', label: 'Installed via partner integration (Shopify, WordPress, etc.)' },
              { value: 'none', label: 'Not yet installed' }
            ] },
            { type: 'check', key: 'pixelVerified', label: 'Pixel verified firing correctly in Events Manager' },
            { type: 'check', key: 'eventsApiSetup', label: 'Events API (server-side) set up (if applicable)' }
          ]
        },
        {
          title: 'Section 4 — Conversion Events',
          items: [
            { type: 'textarea', key: 'conversionEvents', label: 'Conversion Events Set Up', hint: 'List the key conversion events configured in Events Manager' },
            { type: 'check', key: 'testEventsConfirmed', label: 'Test Events confirmed firing correctly' }
          ]
        },
        {
          title: 'Section 5 — Audience Setup',
          items: [
            { type: 'check', key: 'websiteAudienceCreated', label: 'Website Custom Audience created (all website visitors)' },
            { type: 'check', key: 'customerListUploaded', label: 'Customer list uploaded (if client has one)' },
            { type: 'check', key: 'lookalikeCreated', label: 'Lookalike Audiences created from website visitors or customer list' }
          ]
        },
        {
          title: 'Section 6 — Account Notes',
          items: [
            { type: 'textarea', key: 'notes', label: 'Ad Account Notes', hint: 'Any account-specific details, restrictions, or context' }
          ]
        }
      ]
    },
    linkedin: {
      label: 'LinkedIn Ads',
      sections: [
        {
          title: 'Section 1 — Campaign Manager Setup',
          items: [
            { type: 'check', key: 'hasCampaignManager', label: 'Client has a LinkedIn Campaign Manager account',
              guide: 'If no: Go to linkedin.com/campaignmanager → Create Account' },
            { type: 'text', key: 'accountId', label: 'Campaign Manager Account ID' },
            { type: 'check', key: 'partnerAdded', label: 'Revital Productions added as Account Manager',
              guide: 'Campaign Manager → Account Settings → Manage Access → Add Partner → enter Revital Productions account ID' },
            { type: 'check', key: 'partnerConfirmed', label: 'Partner access confirmed — can see the account' }
          ]
        },
        {
          title: 'Section 2 — Ad Account',
          items: [
            { type: 'check', key: 'paymentConfirmed', label: 'Payment method confirmed on account' },
            { type: 'number', key: 'monthlyBudget', label: 'Monthly Budget ($)' },
            { type: 'check', key: 'companyPageLinked', label: "Client's LinkedIn Company Page linked to account" }
          ]
        },
        {
          title: 'Section 3 — LinkedIn Insight Tag',
          items: [
            { type: 'check', key: 'insightTagInstalled', label: 'LinkedIn Insight Tag installed on website',
              guide: 'Account Assets → Insight Tag → Install → via Google Tag Manager or site code' },
            { type: 'check', key: 'gtmUsed', label: 'Installed via Google Tag Manager' },
            { type: 'check', key: 'insightTagVerified', label: 'Insight Tag verified firing correctly' }
          ]
        },
        {
          title: 'Section 4 — Conversion Tracking',
          items: [
            { type: 'textarea', key: 'conversionsList', label: 'Conversion Actions Configured', hint: 'List each conversion action set up in Campaign Manager' },
            { type: 'check', key: 'conversionsVerified', label: 'Conversions verified firing correctly' }
          ]
        },
        {
          title: 'Section 5 — Audience Setup (Matched Audiences)',
          items: [
            { type: 'check', key: 'websiteRetargetingCreated', label: 'Website retargeting audience created' },
            { type: 'check', key: 'companyListUploaded', label: 'Company / contact list uploaded (if client has one, ABM)' },
            { type: 'check', key: 'lookalikeCreated', label: 'Lookalike audience created' }
          ]
        },
        {
          title: 'Section 6 — Account Notes',
          items: [
            { type: 'textarea', key: 'notes', label: 'Ad Account Notes', hint: 'Any account-specific details, restrictions, or context' }
          ]
        }
      ]
    },
    adsense: {
      label: 'AdSense',
      // Unlike the platforms above (which run paid ads FOR a client),
      // AdSense is publisher monetization — ads placed ON a client's own
      // content to earn revenue from pageviews. It's a fundamentally
      // different fit, so this schema leads with a notice card instead
      // of jumping straight into setup steps.
      notice: {
        title: 'Which sites this is for',
        text: 'AdSense fits content-first sites the visitor comes to read — blogs, news, niche content/review sites, and forums with substantial original written content. It does NOT fit lead-gen sites, agency/portfolio sites, or landing pages built to convert a visitor into a call or purchase — ads compete with (and usually hurt) that conversion goal. Confirm the client’s site is a content property, not a conversion page, before starting this checklist.'
      },
      sections: [
        {
          title: 'Section 1 — Eligibility',
          items: [
            { type: 'select', key: 'siteType', label: 'Site type', options: [
              { value: '', label: 'Select…' },
              { value: 'blog', label: 'Blog / editorial content' },
              { value: 'news', label: 'News' },
              { value: 'niche', label: 'Niche content / review site' },
              { value: 'forum', label: 'Forum / community' },
              { value: 'other', label: 'Other content site' }
            ] },
            { type: 'check', key: 'contentDepth', label: 'Site has substantial original content (aim for 20-30+ posts, 15,000+ total words)' },
            { type: 'check', key: 'contentOriginal', label: 'Content is original and human-written, not thin, duplicated, or scraped' },
            { type: 'check', key: 'hasPrivacyPolicy', label: 'Site has a live, linked Privacy Policy page',
              guide: 'Required for AdSense approval, not just good practice — make sure it’s an actual page in the sitemap, not a PDF or off-site link' },
            { type: 'check', key: 'hasAboutContact', label: 'Site has About and Contact pages' },
            { type: 'check', key: 'noGatedContent', label: 'Content isn’t gated behind forced sign-up/share before viewing' },
            { type: 'check', key: 'policyCompliant', label: 'Site reviewed against AdSense program policies (no prohibited content)' }
          ]
        },
        {
          title: 'Section 2 — AdSense Account & Site Setup',
          items: [
            { type: 'check', key: 'hasAdSenseAccount', label: 'Client has (or created) a Google AdSense account',
              guide: 'If no: Go to adsense.google.com → Get Started → enter site URL and payment country' },
            { type: 'text', key: 'publisherId', label: 'AdSense Publisher ID (pub-XXXXXXXXXXXXXXXX)' },
            { type: 'check', key: 'siteAdded', label: 'Site added to the AdSense account' },
            { type: 'check', key: 'siteVerified', label: 'Site ownership verified (HTML tag, DNS, or Google Analytics/Tag Manager)' },
            { type: 'check', key: 'adsTxtAdded', label: 'ads.txt file published at site root',
              guide: 'Required — without a correct ads.txt file, ad revenue can be blocked even after approval' }
          ]
        },
        {
          title: 'Section 3 — Application & Review',
          items: [
            { type: 'select', key: 'applicationStatus', label: 'Application status', options: [
              { value: '', label: 'Select…' },
              { value: 'not_submitted', label: 'Not submitted yet' },
              { value: 'under_review', label: 'Under review' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected — needs work' }
            ] },
            { type: 'textarea', key: 'rejectionNotes', label: 'Rejection reason(s) / follow-up notes', hint: 'e.g. "Low value content" — note what was fixed and when resubmitted' },
            { type: 'check', key: 'autoAdsEnabled', label: 'Auto ads enabled (or manual ad units placed if client prefers manual control)' }
          ]
        },
        {
          title: 'Section 4 — Payment Setup (post-approval)',
          items: [
            { type: 'check', key: 'paymentAddressVerified', label: 'Payment address verified in AdSense' },
            { type: 'check', key: 'taxInfoSubmitted', label: 'Tax information submitted' },
            { type: 'check', key: 'paymentMethodAdded', label: 'Payment method added' }
          ]
        },
        {
          title: 'Section 5 — Account Notes',
          items: [
            { type: 'textarea', key: 'notes', label: 'AdSense Notes', hint: 'Any account-specific details, restrictions, or context' }
          ]
        }
      ]
    }
  };

  const PLATFORM_ORDER = ['meta', 'google', 'tiktok', 'linkedin', 'adsense'];

  // ── Agency reference IDs ─────────────────────────────────────────────
  // Revital Productions' own account IDs, shown at the top of each
  // platform tab so whoever runs the setup doesn't have to go look them
  // up in another tab or ask around.
  const AGENCY_REFERENCE = {
    meta: {
      label: 'Revital Productions BM ID',
      id: '2045808186164908',
      note: 'Clients enter this ID when granting partner access. Guide them to: their BM → Settings → Partners → Add Partner → enter this ID.'
    },
    google: {
      label: 'Revital Productions MCC ID',
      id: '105-994-0837',
      note: 'Clients enter this ID when linking their account. Guide them to: their Google Ads → Admin → Access and Security → Managers → Link to Manager Account → enter this ID.'
    },
    tiktok: {
      label: 'Revital Productions TikTok Business Center ID',
      id: '7663129717964324880',
      note: 'Clients enter this ID when granting access. Guide them to: TikTok Business Center → Members → Invite Partner → enter this ID.'
    },
    linkedin: {
      label: 'Revital Productions LinkedIn Campaign Manager ID',
      id: '547184478',
      note: 'Share this ID with clients when setting up partner access in LinkedIn Campaign Manager.'
    }
  };

  // ── Summary tab config ──────────────────────────────────────────────
  // Which fields from each platform's schema surface on the Summary tab
  // (account IDs, pixel/tag IDs, budgets — the stuff worth a quick glance
  // or copying into ClickUp without digging through each platform tab).
  const SUMMARY_FIELDS = {
    meta: [
      { key: 'adAccountId', label: 'Ad Account ID' },
      { key: 'pixelId', label: 'Pixel ID' },
      { key: 'monthlySpendLimit', label: 'Monthly Spend Limit', prefix: '$' }
    ],
    google: [
      { key: 'googleAdsAccountId', label: 'Customer ID' },
      { key: 'gtmContainerId', label: 'GTM Container ID' },
      { key: 'monthlyBudget', label: 'Monthly Budget', prefix: '$' }
    ],
    tiktok: [
      { key: 'adAccountId', label: 'Ad Account ID' },
      { key: 'pixelId', label: 'Pixel ID' },
      { key: 'monthlySpendLimit', label: 'Monthly Spend Limit', prefix: '$' }
    ],
    linkedin: [
      { key: 'accountId', label: 'Account ID' },
      { key: 'monthlyBudget', label: 'Monthly Budget', prefix: '$' }
    ],
    adsense: [
      { key: 'publisherId', label: 'Publisher ID' },
      { key: 'applicationStatus', label: 'Application Status' }
    ]
  };

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

    const noticeCard = renderNoticeCard(schema);
    if (noticeCard) panel.appendChild(noticeCard);

    const idCard = renderAgencyIdCard(platform);
    if (idCard) panel.appendChild(idCard);

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

  // Platform-level notice — used by AdSense to flag which site types it
  // fits before anyone starts checking boxes. Other platforms don't set
  // schema.notice, so this renders nothing for them.
  function renderNoticeCard(schema) {
    if (!schema.notice) return null;

    const card = document.createElement('div');
    card.className = 'aas-notice-card';

    const title = document.createElement('div');
    title.className = 'aas-notice-title';
    title.textContent = schema.notice.title;
    card.appendChild(title);

    const text = document.createElement('div');
    text.className = 'aas-notice-text';
    text.textContent = schema.notice.text;
    card.appendChild(text);

    return card;
  }

  function renderAgencyIdCard(platform) {
    const ref = AGENCY_REFERENCE[platform];
    if (!ref) return null;

    const card = document.createElement('div');
    card.className = 'aas-agency-id-card';

    const label = document.createElement('div');
    label.className = 'aas-agency-id-label';
    label.textContent = ref.label;
    card.appendChild(label);

    const row = document.createElement('div');
    row.className = 'aas-agency-id-row';

    const value = document.createElement('span');
    value.className = 'aas-agency-id-value';
    value.textContent = ref.id;
    row.appendChild(value);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'aas-agency-id-copy-btn';
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      const text = ref.id;
      const done = () => {
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('copied');
        }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
      } else {
        fallbackCopy(text, done);
      }
    });
    row.appendChild(copyBtn);

    card.appendChild(row);

    const note = document.createElement('div');
    note.className = 'aas-agency-id-note';
    note.textContent = ref.note;
    card.appendChild(note);

    return card;
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
  // Returns {done, total} check-item counts for a single platform.
  function getPlatformProgress(platform) {
    const schema = PLATFORM_SCHEMAS[platform];
    let total = 0;
    let done = 0;
    if (!schema) return { done, total };
    schema.sections.forEach(section => {
      section.items.forEach(item => {
        if (item.type === 'check') {
          total++;
          if (getValue(platform, item.key)) done++;
        }
      });
    });
    return { done, total };
  }

  function getOverallProgress() {
    let total = 0;
    let done = 0;
    PLATFORM_ORDER.forEach(p => {
      const prog = getPlatformProgress(p);
      total += prog.total;
      done += prog.done;
    });
    return { done, total };
  }

  function updateProgress() {
    const fill = document.getElementById('progressFill');
    const label = document.getElementById('progressLabel');

    if (currentPlatform === 'summary') {
      const { done, total } = getOverallProgress();
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      if (fill) fill.style.width = pct + '%';
      if (label) label.textContent = done + ' / ' + total + ' steps complete — all platforms';
      return;
    }

    const schema = PLATFORM_SCHEMAS[currentPlatform];
    if (!schema) {
      if (fill) fill.style.width = '0%';
      if (label) label.textContent = 'Not built yet';
      return;
    }

    const { done, total } = getPlatformProgress(currentPlatform);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = done + ' / ' + total + ' steps complete';
  }

  // ── Summary tab ──────────────────────────────────────────────────────
  function buildSummaryText() {
    const lines = [];
    const clientName = (client && client.name) || 'Untitled Client';
    lines.push('AD ACCOUNT SETUP SUMMARY — ' + clientName);
    lines.push('Generated ' + new Date().toLocaleDateString());
    lines.push('');

    PLATFORM_ORDER.forEach(p => {
      const schema = PLATFORM_SCHEMAS[p];
      const { done, total } = getPlatformProgress(p);
      lines.push(schema.label.toUpperCase());
      lines.push((done === total && total > 0 ? '✅ ' : '⚠️ ') + done + '/' + total + ' steps complete');
      (SUMMARY_FIELDS[p] || []).forEach(f => {
        const val = getValue(p, f.key);
        const display = val ? (f.prefix || '') + val : '—';
        lines.push(f.label + ': ' + display);
      });
      lines.push('');
    });

    return lines.join('\n').trim();
  }

  function renderSummary() {
    const panel = document.getElementById('panel-summary');
    if (!panel) return;

    const overall = getOverallProgress();
    const completePlatforms = PLATFORM_ORDER.filter(p => {
      const prog = getPlatformProgress(p);
      return prog.total > 0 && prog.done === prog.total;
    }).length;
    const allComplete = completePlatforms === PLATFORM_ORDER.length;

    panel.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'aas-summary-header';

    const badge = document.createElement('span');
    badge.className = 'aas-summary-badge' + (allComplete ? ' complete' : '');
    badge.textContent = allComplete
      ? '✓ All Platforms Complete'
      : completePlatforms + ' of ' + PLATFORM_ORDER.length + ' platforms complete';
    header.appendChild(badge);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-secondary';
    copyBtn.textContent = 'Copy Account Summary';
    copyBtn.addEventListener('click', () => {
      const text = buildSummaryText();
      const done = () => {
        const original = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = original; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
      } else {
        fallbackCopy(text, done);
      }
    });
    header.appendChild(copyBtn);

    panel.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'aas-summary-grid';

    PLATFORM_ORDER.forEach(p => {
      const schema = PLATFORM_SCHEMAS[p];
      const { done, total } = getPlatformProgress(p);
      const isComplete = total > 0 && done === total;

      const card = document.createElement('div');
      card.className = 'aas-summary-card';

      const cardHeader = document.createElement('div');
      cardHeader.className = 'aas-summary-card-header';

      const title = document.createElement('span');
      title.className = 'aas-summary-card-title';
      title.textContent = schema.label;
      cardHeader.appendChild(title);

      const progressPill = document.createElement('span');
      progressPill.className = 'aas-summary-card-progress' + (isComplete ? ' complete' : '');
      progressPill.textContent = done + '/' + total;
      cardHeader.appendChild(progressPill);

      card.appendChild(cardHeader);

      (SUMMARY_FIELDS[p] || []).forEach(f => {
        const val = getValue(p, f.key);
        const row = document.createElement('div');
        row.className = 'aas-summary-field';

        const label = document.createElement('span');
        label.className = 'aas-summary-field-label';
        label.textContent = f.label;
        row.appendChild(label);

        const value = document.createElement('span');
        value.className = 'aas-summary-field-value' + (val ? '' : ' empty');
        value.textContent = val ? (f.prefix || '') + val : 'Not set';
        row.appendChild(value);

        card.appendChild(row);
      });

      grid.appendChild(card);
    });

    panel.appendChild(grid);
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* no-op */ }
    document.body.removeChild(ta);
    if (done) done();
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
    if (platform === 'summary') {
      renderSummary();
    }
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
