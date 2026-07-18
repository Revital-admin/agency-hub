/* ============================================================
   app.js
   Application state controller, Event Handlers & View Renderer
   ============================================================ */


// ── Cryptographically secure token generator ──
// (replaces the old Math.random-based generator; used for magic link tokens)
function generateSecureToken(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// ── Firebase Auth gate (admin) ──
// Cloudflare Access already verifies who reaches this page, but Firestore
// has no knowledge of that identity on its own. Rather than making you log
// in twice, this silently exchanges the Access-verified identity for a
// Firebase session: _worker.js's /api/mint-firebase-token route reads the
// already-verified Cf-Access-Authenticated-User-Email header and mints a
// Firebase custom token, which we redeem here with no popup. A manual
// Google sign-in is kept as a fallback (e.g. local dev without Access
// in front, or if the token-minting function isn't configured yet).
// Any Google account on this company domain is authorized - previously
// this was a single hardcoded email, which silently locked out everyone
// except that one account.
const ADMIN_EMAIL_DOMAIN = "revitalproductions.com";
let firebaseAuthReady = false;

function initAdminAuthGate() {
  if (!window.firebase || !firebase.auth) {
    console.warn("Firebase Auth SDK not loaded; skipping auth gate.");
    firebaseAuthReady = true;
    boot();
    return;
  }

  const gate = document.getElementById("authGate");
  const signInBtn = document.getElementById("authGateSignInBtn");
  const statusEl = document.getElementById("authGateStatus");
  const errorEl = document.getElementById("authGateError");

  function showManualSignIn(message) {
    if (statusEl) statusEl.style.display = "none";
    if (signInBtn) signInBtn.style.display = "inline-block";
    if (errorEl) {
      if (message) {
        errorEl.textContent = message;
        errorEl.style.display = "block";
      } else {
        errorEl.style.display = "none";
      }
    }
    if (gate) gate.style.display = "flex";
  }

  if (signInBtn) {
    signInBtn.addEventListener("click", () => {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ hd: ADMIN_EMAIL_DOMAIN });
      firebase.auth().signInWithPopup(provider).catch(err => {
        console.error("Manual sign-in failed:", err);
        showManualSignIn("Sign-in failed: " + err.message);
      });
    });
  }

  let attemptedSilentSignIn = false;
  async function attemptSilentSignIn() {
    if (attemptedSilentSignIn) return;
    attemptedSilentSignIn = true;
    try {
      const res = await fetch("/api/mint-firebase-token");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        await firebase.auth().signInWithCustomToken(data.token);
        // onAuthStateChanged below fires again and completes the boot.
      } else {
        console.log("Silent sign-in unavailable:", data.error || res.status);
        showManualSignIn();
      }
    } catch (e) {
      console.log("Silent sign-in failed (likely running locally without Access):", e);
      showManualSignIn();
    }
  }

  // Show a lightweight "checking access" state immediately while the
  // silent exchange runs, so the page isn't just blank.
  if (gate) gate.style.display = "flex";

  firebase.auth().onAuthStateChanged((user) => {
    const isAuthorizedAdmin = !!(user && user.email && user.email.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN));

    if (isAuthorizedAdmin) {
      if (gate) gate.style.display = "none";
      firebaseAuthReady = true;
      boot();
    } else if (user) {
      // Signed into Firebase with the wrong account - sign back out.
      firebase.auth().signOut();
      showManualSignIn("That account isn't authorized for this hub.");
    } else {
      attemptSilentSignIn();
    }
  });
}

// boot() runs the rest of app init, but only once, and only after the
// admin auth gate above has confirmed identity.
let hasBooted = false;
function boot() {
  if (hasBooted) return;
  hasBooted = true;
  fetchCloudflareProfile();
  try { initTabNavigation(); } catch(e) { console.error("TabNav Error:", e); }
  try { initNavSectionToggles(); } catch(e) { console.error("NavSectionToggles Error:", e); }
  try { initMobileNavigation(); } catch(e) { console.error("MobileNav Error:", e); }
  try { initParentEventListeners(); } catch(e) { console.error("ParentListeners Error:", e); }
  try { refreshAllViews(); } catch(e) { console.error("Refresh Error:", e); }

  const resetSandboxBtn = document.getElementById("resetSandboxBtn");
  if (resetSandboxBtn) {
    resetSandboxBtn.addEventListener("click", () => {
      const sandboxName = "Quick Sandbox (One-Offs)";
      if (!confirm("Are you sure you want to clear all data in the Quick Sandbox? This will reset all checklist audits and competitor sheets back to blank templates.")) return;
      clientsDb[sandboxName] = createClientBlankState(sandboxName);
      saveDatabase();
      refreshAllViews();
      showBanner("success", "Quick Sandbox data cleared and reset successfully!");
    });
  }

  loadDatabase();
}

// ── PDF Generation ──
async function generateClientPDF() {
  const btn = document.getElementById('exportPdfBtn');
  if (!activeClientName || !clientsDb[activeClientName]) {
    alert("Please select a client first!");
    return;
  }
  
  const client = clientsDb[activeClientName];
  const oldText = btn.innerHTML;
  btn.innerHTML = '<span class="icon">⏳</span> Generating...';
  btn.disabled = true;

  try {
    const el = document.createElement('div');
    el.style.padding = '40px';
    el.style.fontFamily = 'sans-serif';
    el.style.color = '#000';
    el.style.background = '#fff';
    
    // Build HTML content
    let html = `<h1 style="font-size:24px; border-bottom: 2px solid #000; padding-bottom:10px; margin-bottom:20px;">Monthly Report: ${activeClientName}</h1>`;
    
    // SWOT
    if (client.swot) {
      html += `<h2>SWOT Analysis</h2><ul>`;
      ['strengths', 'weaknesses', 'opportunities', 'threats'].forEach(k => {
        if (client.swot[k] && client.swot[k].length > 0) {
          html += `<li><strong>${k.toUpperCase()}:</strong> ${client.swot[k].join(', ')}</li>`;
        }
      });
      html += `</ul><br>`;
    }

    // Brand Vault
    if (client.brandVault && client.brandVault.brandName) {
      html += `<h2>Brand Identity</h2>`;
      html += `<p><strong>Name:</strong> ${client.brandVault.brandName}</p>`;
      html += `<p><strong>Tagline:</strong> ${client.brandVault.tagline || 'N/A'}</p>`;
      html += `<br>`;
    }

    // Append to hidden element
    el.innerHTML = html;
    
    const opt = {
      margin:       0.5,
      filename:     `${activeClientName.replace(/\s+/g, '_')}_Report.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    if (typeof html2pdf !== 'undefined') {
      await html2pdf().set(opt).from(el).save();
    } else {
      alert("PDF library failed to load.");
    }
  } catch(e) {
    console.error("PDF Error:", e);
    alert("An error occurred generating the PDF.");
  }
  
  btn.innerHTML = oldText;
  btn.disabled = false;
}

// ── Global Variables ──
let clientsDb = {};
let activeClientName = "";
let iframeNeedsReload = {
  "tab-adaccountsetup": true,
  "tab-uxui": true,
  "tab-seo": true,
  "tab-strategy": true,
  "tab-strategybuilder": true,
  "tab-personalbrand": true,
  "tab-socialaudit": true,
  "tab-webcomp": true,
  "tab-socialcomp": true,
  "tab-report": true,
  "tab-copywriting": true,
  // These tool tabs previously had a hardcoded iframe src in index.html and
  // were never wired into the reload system at all, so switching client
  // workspaces never refreshed them - they kept showing whichever client
  // was active when the page first loaded until a full page refresh.
  "tab-portal": true,
  "tab-intakerequest": true,
  "tab-welcomeguide": true,
  "tab-emailsig": true,
  "tab-creativebrief": true,
  "tab-contentaudit": true,
  "tab-paidads": true,
  "tab-emailstrategy": true,
  "tab-campaignlaunch": true,
  "tab-roiprojector": true,
  "tab-sopwiki": true,
  "tab-proposal": true,
  "tab-intakequalifier": true,
  "tab-discoverycall": true,
  "tab-packagerecommend": true,
  "tab-followuptracker": true
};

// ── Initial State Blueprint ──
function createClientBlankState(name) {
  const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
  const today = new Date().toLocaleDateString('en-CA', dateOptions); // yyyy-mm-dd format

  // Clone onboarding checklist
  const onboarding = DEFAULT_ONBOARDING_CHECKLIST.map(cat => ({
    category: cat.category,
    items: cat.items.map(item => ({
      id: item.id,
      label: item.label,
      checked: false,
      notes: "", // local note for this task
      // Explicit opt-in flag for whether this task shows on the client
      // portal's onboarding checklist. Defaults to false (internal-only)
      // unless the template item was already marked visible - nothing is
      // shown to the client unless someone deliberately flags it.
      clientVisible: item.clientVisible || false
    }))
  }));

  // Separate, client-facing checklist - fully independent of the internal
  // onboarding tracker above. Managed per-client in the Client Portal
  // Manager tool and shown as-is on the client's own portal.
  const clientChecklist = DEFAULT_CLIENT_CHECKLIST.map(item => ({
    id: item.id,
    label: item.label,
    checked: false
  }));

  // Clone SEO audit steps
  const seoAudit = {
    checked: {},
    notes: {},
    targetUrl: ""
  };

  // Clone UXUI audit
  const uxuiAudit = {
    checked: {},
    notes: {},
    targetUrl: ""
  };

  // Clone Content Strategy steps
  const contentStrategy = {
    checked: {},
    notes: {},
    targetUrl: ""
  };

  // Initialize Content Strategy Builder
  const strategyBuilder = {
    targetUrl: "",
    data: {
      platforms: [
        { id: 'instagram', name: 'Instagram', purpose: '', contentTypes: [], frequency: '' },
        { id: 'tiktok', name: 'TikTok', purpose: '', contentTypes: [], frequency: '' },
        { id: 'youtube', name: 'YouTube', purpose: '', contentTypes: [], frequency: '' },
        { id: 'linkedin', name: 'LinkedIn', purpose: '', contentTypes: [], frequency: '' }
      ]
    }
  };

  // Clone Social Media Audit steps
  const socialAudit = {
    checked: {},
    notes: {},
    targetUrl: ""
  };

  // Initialize Website Competitors
  const webCompRows = {};
  WEBSITE_COMPETITOR_ROWS.forEach(row => {
    webCompRows[row.key] = ["", "", ""]; // Top, Mid, Low values
  });

  // Initialize Social Competitors
  const socialCompRows = {};
  SOCIAL_COMPETITOR_ROWS.forEach(row => {
    socialCompRows[row.key] = ["", "", ""]; // Top, Mid, Low values
  });
  
  // Clone Paid Ads Audit
  const paidAdsAudit = {
    checked: {},
    notes: {},
    targetUrl: "",
    textInputs: { adSpend: "", roas: "", vulnerabilities: "", actions: "" }
  };
  
  // Clone Email Marketing Audit
  const emailAudit = {
    checked: {},
    notes: {},
    targetUrl: "",
    textInputs: { listSize: "", openRate: "", opportunities: "", actions: "" }
  };

  return {
    name: name,
    createdDate: today,
    targetUrl: "",
    clickupUrl: "",
    onboardingDate: today,
    onboardingChecklist: onboarding,
    clientChecklist: clientChecklist,
    reportArchive: [], // published monthly reports shown on the client portal
    uxuiAudit: uxuiAudit,
    seoAudit: seoAudit,
    paidAdsAudit: paidAdsAudit,
    emailAudit: emailAudit,
    competitorAnalysis: [],
    contentStrategy: contentStrategy,
    strategyBuilder: strategyBuilder,
    socialAudit: socialAudit,
    brandVault: {
      assets: {
        logoUrl: "",
        driveLink: "",
        canvaLink: ""
      },
      colors: [
        { hex: "#000000", name: "Primary" },
        { hex: "#000000", name: "Secondary" },
        { hex: "#000000", name: "Accent 1" },
        { hex: "#000000", name: "Accent 2" },
        { hex: "#000000", name: "Background" }
      ],
      typography: {
        primaryFont: "",
        secondaryFont: ""
      },
      brandVoice: {
        adjectives: "",
        missionStatement: ""
      },
      targetAudience: {
        demographic: "",
        painPoints: ""
      }
    },
    paidAdsTracker: {},
    emailStrategy: {},
    contentAudit: {},
    webComp: {
      market: "",
      date: today,
      names: ["Competitor A", "Competitor B", "Competitor C"],
      rows: webCompRows,
      swot: { s: "", w: "", o: "", t: "" },
      insight: "",
      stars: [0, 0, 0]
    },
    socialComp: {
      niche: "",
      date: today,
      names: ["Competitor A", "Competitor B", "Competitor C"],
      rows: socialCompRows,
      swot: { s: "", w: "", o: "", t: "" },
      insight: "",
      stars: [0, 0, 0]
    },
    report: {
      preparedBy: "",
      date: today,
      focus: "",
      wins: "",
      platforms: DEFAULT_REPORT_PLATFORMS.map(p => ({ ...p })),
      cellData: {} // metricKey -> array of platform values
    },
    campaignLaunch: { checked: {}, notes: {}, data: {} },
copywriting: {
      activeFramework: "aida",
      notes: "",
      inputs: { product: "", audience: "", benefit: "", cta: "", tone: "persuasive" },
      targetUrl: ""
    },
    proposal: {},
    roi: {},
    signature: {},
    creativeBrief: {},
    portalConfig: {
      accountManagerName: "",
      accountManagerEmail: "",
      accountManagerPhone: "",
      calendlyLink: "",
      projectsEmbedUrl: "",
      calendarEmbedUrl: "",
      campaignBriefUrl: "",
      completedWorkUrl: "",
      feedbackFormUrl: "",
      revisionFormUrl: "",
      contentRequestFormUrl: "",
      brandAssetsUrl: "",
      liveAnalyticsUrl: "",
      clientLogoUrl: "",
      clientContactName: "",
      clientContactEmail: "",
      primaryColor: "#10b981",
      secondaryColor: "#6366f1",
      magicToken: generateSecureToken()
    },
    // Content Approvals - deliverables awaiting a client decision
    // (pendingApprovals) and ones they've already decided on
    // (approvalHistory). Client-side decisions write straight to the
    // public clients/{token} doc, same as clientChecklist - synced back
    // into this real object by ensureClientPortalListeners below.
    pendingApprovals: [],
    approvalHistory: []
  };
}

// ── Local Storage Management ──
// ── Database Management (Firebase + Local Storage) ──
let isFirestoreLoaded = false;

function migrateSchemaAndDefaults() {
  // If database is empty, seed a default client workspace
  if (Object.keys(clientsDb).length === 0) {
    const defaultName = "Nexus Productions";
    clientsDb[defaultName] = createClientBlankState(defaultName);
  }

  // Ensure Quick Sandbox workspace is seeded
  const sandboxName = "Quick Sandbox (One-Offs)";
  if (!clientsDb[sandboxName]) {
    clientsDb[sandboxName] = createClientBlankState(sandboxName);
  }

  // Schema migration and verification loop to protect against legacy data
  Object.keys(clientsDb).forEach(name => {
    const client = clientsDb[name];
    const blank = createClientBlankState(name);

    // Verify top-level keys
    Object.keys(blank).forEach(key => {
      if (client[key] === undefined) {
        client[key] = blank[key];
      }
    });

    if (client.clickupUrl === undefined) client.clickupUrl = "";

    // Migrate onboarding list format (backward compat)
    if (client.onboarding && client.onboarding.length > 0 && !client.onboarding[0].category) {
      client.onboarding = blank.onboarding;
    }

    // Migrate or verify copywriting object structure
    if (!client.copywriting || Array.isArray(client.copywriting) || typeof client.copywriting !== 'object') {
      client.copywriting = {
        activeFramework: "aida",
        notes: "",
        inputs: { product: "", audience: "", benefit: "", cta: "", tone: "persuasive" },
        targetUrl: ""
      };
    } else {
      if (!client.copywriting.inputs) {
        client.copywriting.inputs = { product: "", audience: "", benefit: "", cta: "", tone: "persuasive" };
      }
      if (client.copywriting.activeFramework === undefined) client.copywriting.activeFramework = "aida";
      if (client.copywriting.notes === undefined) client.copywriting.notes = "";
      if (client.copywriting.targetUrl === undefined) client.copywriting.targetUrl = "";
    }
  });
}

function getActiveClient() {
  return clientsDb[activeClientName];
}

// Cross-client accessor for tools that need to see every client at once
// (e.g. the Proposal Follow-Up Tracker), rather than just the active one.
function getAllClients() {
  return clientsDb;
}

// Shared helper so embedded iframe tools can jump the user to another tab
// (e.g. "Open Proposal Calculator" buttons) by clicking the real sidebar
// button, which keeps all the existing tab-switch/reload logic intact.
function navigateToTab(tabId) {
  const btn = document.querySelector(`.nav-item-btn[data-tab="${tabId}"]`);
  if (btn) btn.click();
}

// ── Workspace Switching & View Management ──
function switchClient(clientName) {
  if (clientsDb[clientName]) {
    activeClientName = clientName;
    localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);
    showBanner("success", `Switched to workspace "${clientName}"`);
    refreshAllViews();
  }
}

function createNewClient() {
  const clientNameInput = prompt("Enter a unique name for the new client:");
  if (!clientNameInput) return;
  const name = clientNameInput.trim();
  if (name === "") return;

  if (clientsDb[name]) {
    showBanner("error", `A client workspace named "${name}" already exists.`);
    return;
  }

  clientsDb[name] = createClientBlankState(name);
  saveDatabase();
  activeClientName = name;
  localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);
  buildClientDropdown();
  refreshAllViews();
  showBanner("success", `Client workspace "${name}" initialized successfully!`);
}

function deleteActiveClient() {
  const sandboxName = "Quick Sandbox (One-Offs)";
  if (activeClientName === sandboxName) {
    showBanner("error", "Cannot delete the Quick Sandbox workspace.");
    return;
  }

  const clientNames = Object.keys(clientsDb);
  if (clientNames.length <= 1) {
    showBanner("error", "Cannot delete the only remaining client workspace.");
    return;
  }

  const confirmDelete = confirm(`Are you sure you want to permanently delete client profile "${activeClientName}"? All audits, checklists, and reports will be lost.`);
  if (!confirmDelete) return;

  delete clientsDb[activeClientName];
  saveDatabase();

  // Switch to first remaining client
  activeClientName = Object.keys(clientsDb)[0];
  localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);
  
  buildClientDropdown();
  refreshAllViews();
  showBanner("success", "Client profile removed.");
}

function buildClientDropdown() {
  const select = document.getElementById("clientSelect");
  if (!select) return;
  select.innerHTML = "";

  const sandboxName = "Quick Sandbox (One-Offs)";
  const sortedNames = Object.keys(clientsDb).filter(n => n !== sandboxName).sort();
  if (clientsDb[sandboxName]) {
    sortedNames.unshift(sandboxName);
  }

  sortedNames.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    if (name === activeClientName) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

// ── Helper to reload iframe if needed ──
function refreshIframeTab(tabId) {
  switch (tabId) {
    case "tab-uxui":
      renderUxuiAudit();
      break;
    case "tab-seo":
      renderSeoAudit();
      break;
    case "tab-portal":
      renderClientPortalManagerTab();
      break;
    case "tab-intakerequest":
      renderIntakeRequest();
      break;
    case "tab-welcomeguide":
      renderWelcomeGuide();
      break;
      case "tab-adaccountsetup":
      renderAdAccountSetup();
      break;
    case "tab-emailsig":
      renderEmailSigGenerator();
      break;
    case "tab-creativebrief":
      renderCreativeBrief();
      break;
    case "tab-contentaudit":
      renderContentAudit();
      break;
    case "tab-paidads":
      renderPaidAdsAudit();
      break;
    case "tab-emailstrategy":
      renderEmailStrategyAudit();
      break;
    case "tab-campaignlaunch":
      renderCampaignLaunchChecklist();
      break;
    case "tab-intakequalifier":
      renderIntakeQualifier();
      break;
    case "tab-discoverycall":
      renderDiscoveryCallScript();
      break;
    case "tab-packagerecommend":
      renderPackageRecommendationEngine();
      break;
    case "tab-followuptracker":
      renderFollowUpTracker();
      break;
    case "tab-roiprojector":
      renderRoiProjector();
      break;
    case "tab-sopwiki":
      renderSopWiki();
      break;
    case "tab-proposal":
      renderProposalCalculator();
      break;
    case "tab-strategy":
      renderContentStrategy();
      break;
    case "tab-strategybuilder":
      renderStrategyBuilder();
      break;
    case "tab-personalbrand":
      renderPersonalBranding();
      break;
    case "tab-socialaudit":
      renderSocialAudit();
      break;
    case "tab-webcomp":
      renderWebCompetitors();
      break;
    case "tab-socialcomp":
      renderSocialCompetitors();
      break;
    case "tab-report":
      renderReportForm();
      break;
    case "tab-copywriting":
      renderCopywriting();
      break;
  }
  iframeNeedsReload[tabId] = false;
}

// ── Tab Navigation routing ──
function initTabNavigation() {
  const navButtons = document.querySelectorAll(".nav-item-btn");
  const sections = document.querySelectorAll(".tab-section");

  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      
      navButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // If this button lives inside a collapsed section (e.g. activated
      // programmatically via a dashboard quick link), expand it so the
      // user can see where they landed.
      const parentSection = btn.closest(".nav-section");
      if (parentSection && parentSection.classList.contains("collapsed")) {
        parentSection.classList.remove("collapsed");
        const toggleBtn = parentSection.querySelector(".nav-section-toggle");
        if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
        const slug = parentSection.getAttribute("data-section");
        if (slug) {
          const current = new Set(getCollapsedNavSections());
          current.delete(slug);
          saveCollapsedNavSections(Array.from(current));
        }
      }

      sections.forEach(sec => {
        sec.classList.remove("active");
        if (sec.id === targetTab) {
          sec.classList.add("active");
        }
      });

      // Lazy-load iframe if needed
      if (iframeNeedsReload[targetTab] === true) {
        refreshIframeTab(targetTab);
      }

      // Quick visual updates when entering tabs
      if (targetTab === "tab-report") {
        updateReportPreview();
      }
    });
  });

  // Enable dashboard quick links (data-go)
  document.querySelectorAll("[data-go]").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-go");
      const sidebarNavBtn = document.querySelector(`.nav-item-btn[data-tab="${targetTab}"]`);
      if (sidebarNavBtn) {
        sidebarNavBtn.click();
      }
    });
  });
}

// ── Collapsible Nav Sections ──
const NAV_COLLAPSED_SECTIONS_KEY = "REVITAL_HUB_NAV_COLLAPSED_SECTIONS";

function getCollapsedNavSections() {
  try {
    const stored = localStorage.getItem(NAV_COLLAPSED_SECTIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
}

function saveCollapsedNavSections(collapsedSlugs) {
  try {
    localStorage.setItem(NAV_COLLAPSED_SECTIONS_KEY, JSON.stringify(collapsedSlugs));
  } catch (e) {}
}

function initNavSectionToggles() {
  const sections = document.querySelectorAll(".nav-section");
  if (!sections.length) return;

  const collapsedSlugs = new Set(getCollapsedNavSections());

  // Don't collapse the section that contains the currently active tab,
  // so the user always lands on a page that shows where they are.
  const activeBtn = document.querySelector(".nav-item-btn.active");
  const activeSection = activeBtn ? activeBtn.closest(".nav-section") : null;
  const activeSlug = activeSection ? activeSection.getAttribute("data-section") : null;

  sections.forEach(section => {
    const slug = section.getAttribute("data-section");
    const toggleBtn = section.querySelector(".nav-section-toggle");
    if (!toggleBtn || !slug) return;

    if (collapsedSlugs.has(slug) && slug !== activeSlug) {
      section.classList.add("collapsed");
      toggleBtn.setAttribute("aria-expanded", "false");
    }

    toggleBtn.addEventListener("click", () => {
      const isCollapsed = section.classList.toggle("collapsed");
      toggleBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");

      const current = new Set(getCollapsedNavSections());
      if (isCollapsed) {
        current.add(slug);
      } else {
        current.delete(slug);
      }
      saveCollapsedNavSections(Array.from(current));
    });
  });
}

// ── View Refresh Controllers ──
function refreshAllViews() {
  // Keep one live listener per client with a magic link so client-driven
  // checklist changes reach the agency side immediately, not just as a
  // side effect of the admin happening to save something.
  try { ensureClientPortalListeners(); } catch (e) {}

  // Toggle Sandbox Banner
  const sandboxName = "Quick Sandbox (One-Offs)";
  const banner = document.getElementById("sandboxBanner");
  if (banner) {
    if (activeClientName === sandboxName) {
      banner.style.display = "flex";
    } else {
      banner.style.display = "none";
    }
  }

  try {
    buildClientDropdown();
  } catch(e) { const hero = document.getElementById("dashHeroClientName"); if (hero) hero.textContent = "Error in buildClientDropdown: " + e.message; }
  
  try {
    renderDashboard();
  } catch(e) { const hero = document.getElementById("dashHeroClientName"); if (hero) hero.textContent = "Error in renderDashboard: " + e.message; }
  
  try {
    renderOnboardingChecklist();
  } catch(e) { const hero = document.getElementById("dashHeroClientName"); if (hero) hero.textContent = "Error in renderOnboardingChecklist: " + e.message; }
  
  try {
    renderBrandVault();
  } catch(e) { const hero = document.getElementById("dashHeroClientName"); if (hero) hero.textContent = "Error in renderBrandVault: " + e.message; }

  // Mark all iframes as needing reload
  Object.keys(iframeNeedsReload).forEach(key => {
    iframeNeedsReload[key] = true;
  });

  // Get currently active tab
  const activeTabBtn = document.querySelector(".nav-item-btn.active");
  const activeTab = activeTabBtn ? activeTabBtn.getAttribute("data-tab") : "tab-dashboard";

  // Reload only if the active tab is an iframe-based tab
  if (iframeNeedsReload[activeTab] !== undefined) {
    refreshIframeTab(activeTab);
  }
}

// ── Dashboard Overview Renderer ──
function renderDashboard() {
  const client = getActiveClient();
  if (!client) return;

  // Active client summary details
  const hero = document.getElementById("dashHeroClientName"); if (hero) hero.textContent = client.name;
  const heroUrl = document.getElementById("dashHeroTargetUrl"); if (heroUrl) heroUrl.textContent = client.targetUrl || "No website logged yet";
  const heroDate = document.getElementById("dashHeroCreatedDate"); if (heroDate) heroDate.textContent = client.createdDate || "N/A";

  const dashClickupUrl = document.getElementById("dashClickupUrl");
  const dashClickupBtn = document.getElementById("dashClickupBtn");
  if (dashClickupUrl && dashClickupBtn) {
    dashClickupUrl.value = client.clickupUrl || "";
    if (client.clickupUrl) {
      dashClickupBtn.href = client.clickupUrl;
      dashClickupBtn.style.display = "flex";
    } else {
      dashClickupBtn.style.display = "none";
    }
  }

  // Calculate Onboarding completion %
  let totalOb = 0;
  let checkedOb = 0;
  if (client.onboardingChecklist && Array.isArray(client.onboardingChecklist)) {
    client.onboardingChecklist.forEach(cat => {
      if (cat.items && Array.isArray(cat.items)) {
        cat.items.forEach(item => {
          totalOb++;
          if (item.checked) checkedOb++;
        });
      }
    });
  }
  const obPct = totalOb > 0 ? Math.round((checkedOb / totalOb) * 100) : 0;
  document.getElementById("dashOnboardingVal").textContent = `${obPct}%`;
  document.getElementById("dashOnboardingProgress").style.width = `${obPct}%`;

  // Calculate UX/UI Checklist progress (40 items total)
  let totalUx = 40;
  let checkedUx = 0;
  if (client.uxuiAudit && client.uxuiAudit.checked) {
    Object.keys(client.uxuiAudit.checked).forEach(k => {
      if (client.uxuiAudit.checked[k]) {
        checkedUx++;
      }
    });
  }
  const uxPct = Math.round((checkedUx / totalUx) * 100);
  const uxGrade = calculateUxuiLetterGrade(uxPct);
  document.getElementById("dashUxuiVal").textContent = `${uxPct}% (${uxGrade})`;
  document.getElementById("dashUxuiProgress").style.width = `${uxPct}%`;

  // Calculate SEO checklist checked % (23 items total)
  const seoTotal = 23;
  let seoFilled = 0;
  if (client.seoAudit && client.seoAudit.checked) {
    Object.keys(client.seoAudit.checked).forEach(k => {
      if (client.seoAudit.checked[k]) {
        seoFilled++;
      }
    });
  }
  const seoPct = seoTotal > 0 ? Math.round((seoFilled / seoTotal) * 100) : 0;
  document.getElementById("dashSeoVal").textContent = `${seoPct}%`;
  document.getElementById("dashSeoProgress").style.width = `${seoPct}%`;
  

  // Calculate Campaign Launch Checklist
  let totalCampaignLaunch = 23; // 23 items total
  let checkedCampaignLaunch = 0;
  if (client.campaignLaunch && client.campaignLaunch.checked) {
    Object.keys(client.campaignLaunch.checked).forEach(k => {
      if (client.campaignLaunch.checked[k]) {
        checkedCampaignLaunch++;
      }
    });
  }
  const campaignLaunchPct = Math.round((checkedCampaignLaunch / totalCampaignLaunch) * 100);
  document.getElementById("dashCampaignLaunchVal").textContent = `${campaignLaunchPct}%`;
  document.getElementById("dashCampaignLaunchProgress").style.width = `${campaignLaunchPct}%`;

  // Calculate Paid Ads Audit (16 items total)
  const paTotal = 16;
  let paFilled = 0;
  if (client.paidAdsAudit && client.paidAdsAudit.checked) {
    Object.keys(client.paidAdsAudit.checked).forEach(k => {
      if (client.paidAdsAudit.checked[k]) {
        paFilled++;
      }
    });
  }
  const dashPaAuditFill = document.getElementById('dashPaidAdsProgress');
  const dashPaidAdsVal = document.getElementById('dashPaidAdsVal');
  if (dashPaAuditFill && dashPaidAdsVal) {
    const paPct = paTotal > 0 ? Math.round((paFilled / paTotal) * 100) : 0;
    dashPaAuditFill.style.width = paPct + '%';
    dashPaidAdsVal.textContent = paPct + '%';
  }

  // Calculate Email Audit (16 items total)
  const emTotal = 16;
  let emFilled = 0;
  if (client.emailAudit && client.emailAudit.checked) {
    Object.keys(client.emailAudit.checked).forEach(k => {
      if (client.emailAudit.checked[k]) {
        emFilled++;
      }
    });
  }
  const dashEmailAuditFill = document.getElementById('dashEmailStrategyProgress');
  const dashEmailAuditVal = document.getElementById('dashEmailStrategyVal');
  if (dashEmailAuditFill && dashEmailAuditVal) {
    const emPct = emTotal > 0 ? Math.round((emFilled / emTotal) * 100) : 0;
    dashEmailAuditFill.style.width = emPct + '%';
    dashEmailAuditVal.textContent = emPct + '%';
  }
  // Calculate Content Audit (42 items total)
  const caTotal = 42;
  let caFilled = 0;
  if (client.contentAudit && client.contentAudit.checked) {
    Object.keys(client.contentAudit.checked).forEach(k => {
      if (client.contentAudit.checked[k]) {
        caFilled++;
      }
    });
  }
  const dashContentAuditFill = document.getElementById('dashContentAuditProgress');
  const dashContentAuditVal = document.getElementById('dashContentAuditVal');
  if (dashContentAuditFill && dashContentAuditVal) {
    const caPct = caTotal > 0 ? Math.round((caFilled / caTotal) * 100) : 0;
    dashContentAuditFill.style.width = caPct + '%';
    dashContentAuditVal.textContent = caPct + '%';
  }


  // Calculate Content Strategy checklist progress (40 items total)
  let totalStrategy = 40;
  let checkedStrategy = 0;
  if (client.contentStrategy && client.contentStrategy.checked) {
    Object.keys(client.contentStrategy.checked).forEach(k => {
      if (client.contentStrategy.checked[k]) {
        checkedStrategy++;
      }
    });
  }
  const strategyPct = Math.round((checkedStrategy / totalStrategy) * 100);
  document.getElementById("dashStrategyVal").textContent = `${strategyPct}%`;
  document.getElementById("dashStrategyProgress").style.width = `${strategyPct}%`;

  // Calculate Strategy Builder progress (56 + 3 * N fields total)
  let strategyBuilderPct = 0;
  if (client.strategyBuilder && client.strategyBuilder.data) {
    const data = client.strategyBuilder.data;
    const platforms = Array.isArray(data.platforms) ? data.platforms : [];
    let totalFields = 56 + (platforms.length * 3);
    let filledFields = 0;

    const textKeys = [
      'businessName', 'industry', 'primaryServices', 'brandMission', 'brandVision', 'coreValues', 'usp',
      'goalsShortTerm', 'goalsLongTerm', 'marketingChallenges',
      'audienceAge', 'audienceLocation', 'audienceIndustry', 'audienceIncome', 'audiencePainPoints', 'audienceDesires', 'audienceBuyingBehavior',
      'brandVoice', 'brandColors', 'brandVisuals',
      'mainCompetitors', 'competitorStrengths', 'competitorDifferentiate', 'brandsAdmire',
      'pillar1Name', 'pillar1Topics', 'pillar2Name', 'pillar2Topics', 'pillar3Name', 'pillar3Topics', 'pillar4Name', 'pillar4Topics',
      'ideasEducational', 'ideasPromotional', 'ideasSocialProof', 'ideasViral', 'ideasBehindScenes',
      'kpisBenchmarks', 'commContact', 'commRevisions', 'commTimeline',
      'finalFocus', 'notesSection'
    ];
    const checkboxKeys = [
      'primaryGoals', 'brandPersonality', 'existingAssets', 'primaryContentGoals',
      'workflowPre', 'workflowProd', 'workflowPost', 'workflowPub',
      'kpisMetrics', 'kpisFrequency', 'commMethods', 'nextSteps'
    ];

    textKeys.forEach(key => {
      const val = data[key];
      if (val && typeof val === 'string' && val.trim() !== '') filledFields++;
    });

    checkboxKeys.forEach(key => {
      const arr = data[key];
      if (arr && Array.isArray(arr) && arr.length > 0) filledFields++;
    });

    const a1 = data['action1'] || '';
    const a2 = data['action2'] || '';
    const a3 = data['action3'] || '';
    const a4 = data['action4'] || '';
    if (a1.trim() !== '' || a2.trim() !== '' || a3.trim() !== '' || a4.trim() !== '') {
      filledFields++;
    }

    // Dynamic platforms check (3 fields per platform)
    platforms.forEach(p => {
      if (p.purpose && p.purpose.trim() !== '') filledFields++;
      if (p.frequency && p.frequency.trim() !== '') filledFields++;
      if (p.contentTypes && Array.isArray(p.contentTypes) && p.contentTypes.length > 0) filledFields++;
    });

    strategyBuilderPct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
  }
  document.getElementById("dashStrategyBuilderVal").textContent = `${strategyBuilderPct}%`;
  document.getElementById("dashStrategyBuilderProgress").style.width = `${strategyBuilderPct}%`;


  // Calculate Personal Branding Builder progress (approx 29 fields total)
  let personalBrandPct = 0;
  if (client.personalBranding && client.personalBranding.data) {
    let filledPbFields = 0;
    let totalPbFields = 0;
    
    // Simplistic check: count all string properties that are not empty.
    // "platforms" is deliberately skipped here and counted separately below,
    // because the builder auto-seeds a default (empty) LinkedIn platform row
    // the moment the tab is opened -- counting the array itself as "filled"
    // just because it's non-empty produced a false-positive percentage even
    // when the user hadn't entered anything.
    const countFields = (obj) => {
      if (typeof obj === 'string') {
        totalPbFields++;
        if (obj.trim() !== '') filledPbFields++;
      } else if (Array.isArray(obj)) {
        totalPbFields++;
        if (obj.length > 0) filledPbFields++;
      } else if (typeof obj === 'object' && obj !== null) {
        Object.entries(obj).forEach(([key, val]) => {
          if (key === 'platforms') return;
          countFields(val);
        });
      }
    };
    countFields(client.personalBranding.data);
    
    // Also add platforms manually like strategy builder
    const pbPlatforms = client.personalBranding.data.platforms || [];
    pbPlatforms.forEach(p => {
      if (p.purpose && p.purpose.trim() !== '') filledPbFields++;
      if (p.contentTypes && Array.isArray(p.contentTypes) && p.contentTypes.length > 0) filledPbFields++;
    });
    totalPbFields += pbPlatforms.length * 2;
    
    // In the actual builder it's out of ~29
    personalBrandPct = totalPbFields > 0 ? Math.min(100, Math.round((filledPbFields / 29) * 100)) : 0;
  }
  document.getElementById("dashPersonalBrandVal").textContent = `${personalBrandPct}%`;
  document.getElementById("dashPersonalBrandProgress").style.width = `${personalBrandPct}%`;

  // Calculate Social Media Audit checklist progress (40 items total)
  let totalSocialAudit = 40;
  let checkedSocialAudit = 0;
  if (client.socialAudit && client.socialAudit.checked) {
    Object.keys(client.socialAudit.checked).forEach(k => {
      if (client.socialAudit.checked[k]) {
        checkedSocialAudit++;
      }
    });
  }
  const socialAuditPct = Math.round((checkedSocialAudit / totalSocialAudit) * 100);
  document.getElementById("dashSocialAuditVal").textContent = `${socialAuditPct}%`;
  document.getElementById("dashSocialAuditProgress").style.width = `${socialAuditPct}%`;

  // Logged Website Competitors count
  let loggedWebComps = 0;
  client.webComp.names.forEach(name => {
    if (name && name !== "Competitor A" && name !== "Competitor B" && name !== "Competitor C" && name.trim() !== "") {
      loggedWebComps++;
    }
  });
  document.getElementById("dashWebCompetitorVal").textContent = `${loggedWebComps} / 3`;
  document.getElementById("dashWebCompetitorProgress").style.width = `${(loggedWebComps / 3) * 100}%`;

  let loggedSocialComps = 0;
  client.socialComp.names.forEach(name => {
    if (name && name !== "Competitor A" && name !== "Competitor B" && name !== "Competitor C" && name.trim() !== "") {
      loggedSocialComps++;
    }
  });
  document.getElementById("dashSocialCompetitorVal").textContent = `${loggedSocialComps} / 3`;
  document.getElementById("dashSocialCompetitorProgress").style.width = `${(loggedSocialComps / 3) * 100}%`;

  // Calculate Copywriting Assistant stats
  let copyWords = 0;
  if (client.copywriting && client.copywriting.notes) {
    const text = client.copywriting.notes.trim();
    copyWords = text === "" ? 0 : text.split(/\s+/).length;
  }
  document.getElementById("dashCopywritingVal").textContent = `${copyWords} words`;
  
  // Calculate Brand Vault completion
  let bvTotal = 14; // 3 assets, 2 typo, 2 voice, 2 audience, 5 colors
  let bvFilled = 0;
  if (client.brandVault) {
    const bv = client.brandVault;
    if (bv.assets) {
      if (bv.assets.logoUrl?.trim()) bvFilled++;
      if (bv.assets.driveLink?.trim()) bvFilled++;
      if (bv.assets.canvaLink?.trim()) bvFilled++;
    }
    if (bv.typography) {
      if (bv.typography.primaryFont?.trim()) bvFilled++;
      if (bv.typography.secondaryFont?.trim()) bvFilled++;
    }
    if (bv.brandVoice) {
      if (bv.brandVoice.adjectives?.trim()) bvFilled++;
      if (bv.brandVoice.missionStatement?.trim()) bvFilled++;
    }
    if (bv.targetAudience) {
      if (bv.targetAudience.demographic?.trim()) bvFilled++;
      if (bv.targetAudience.painPoints?.trim()) bvFilled++;
    }
    if (bv.colors && Array.isArray(bv.colors)) {
      bv.colors.forEach(c => {
        // Count a color as filled if it's not default black and has a name
        if (c.hex && c.hex !== "#000000") bvFilled++;
      });
    }
  }
  const bvPct = Math.round((bvFilled / bvTotal) * 100);
  document.getElementById("dashBrandVaultVal").textContent = `${bvPct}%`;
  document.getElementById("dashBrandVaultProgress").style.width = `${bvPct > 100 ? 100 : bvPct}%`;
  }

// Helper to determine letter grade
function calculateLetterGrade(score) {
  const val = parseFloat(score);
  if (val >= 9.0) return "A";
  if (val >= 8.0) return "B";
  if (val >= 7.0) return "C";
  if (val >= 6.0) return "D";
  if (val >= 5.0) return "E";
  return "F";
}

// Helper to determine letter grade for UX/UI checklist percentage
function calculateUxuiLetterGrade(pct) {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  if (pct >= 50) return "E";
  return "F";
}

// ── Onboarding Checklist Controller ──
let onboardingFilter = "all";

function renderOnboardingChecklist() {
  const client = getActiveClient();
  const container = document.getElementById("onboardingChecklistList");
  if (!client || !container) return;

  container.innerHTML = "";

  // Bind values to details inputs
  const obTargetUrl = document.getElementById("obTargetUrl");
  const obTargetDate = document.getElementById("obTargetDate");
  
  // Detach listeners first to avoid loop alerts
  obTargetUrl.value = client.targetUrl || "";
  obTargetDate.value = client.onboardingDate || "";

  // Compute scorecard values
  let totalTasks = 0;
  let checkedTasks = 0;
  let totalCats = client.onboardingChecklist.length;
  let completedCats = 0;

  client.onboardingChecklist.forEach(cat => {
    let catTotal = 0;
    let catChecked = 0;

    // Filter items according to buttons
    const filteredItems = cat.items.filter(item => {
      if (onboardingFilter === "complete") return item.checked;
      if (onboardingFilter === "incomplete") return !item.checked;
      return true;
    });

    totalTasks += cat.items.length;
    cat.items.forEach(i => {
      catTotal++;
      if (i.checked) {
        checkedTasks++;
        catChecked++;
      }
    });

    if (catTotal > 0 && catChecked === catTotal) {
      completedCats++;
    }

    if (filteredItems.length === 0 && onboardingFilter !== "all") {
      return; // Skip rendering empty filtered groups
    }

    // Render Category Title
    const catHeader = document.createElement("div");
    catHeader.className = "checklist-category-title";
    catHeader.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>${cat.category}</span>
      <span style="font-size:0.75rem; font-weight:400; color:var(--text-muted); margin-left:auto;">(${catChecked}/${catTotal})</span>
    `;
    container.appendChild(catHeader);

    // Render stack of cards
    const stack = document.createElement("div");
    stack.className = "checklist-items-stack";

    filteredItems.forEach(item => {
      const card = document.createElement("div");
      card.className = `checklist-item-card ${item.checked ? "completed" : ""}`;

      card.innerHTML = `
        <label class="checkbox-container">
          <input type="checkbox" ${item.checked ? "checked" : ""}>
          <span class="checkbox-custom"></span>
        </label>
        <div class="checklist-item-content">
          <div class="checklist-item-label">${item.label}</div>
        </div>
      `;

      // Event listener for checkbox
      const chk = card.querySelector("input");
      chk.addEventListener("change", () => {
        item.checked = chk.checked;
        // Update local class visually without tearing the whole DOM down
        if (item.checked) {
          card.classList.add("completed");
        } else {
          card.classList.remove("completed");
        }
        saveDatabase();
        
        // Defer the full re-render so the native checkbox click finishes cleanly
        setTimeout(() => {
          renderOnboardingChecklist();
          renderDashboard();
        }, 50);
      });

      stack.appendChild(card);
    });

    container.appendChild(stack);
  });

  // Score Calculations
  const obPct = totalTasks > 0 ? Math.round((checkedTasks / totalTasks) * 100) : 0;
  
  // Update scorecard DOM
  document.getElementById("onboardingCardCats").textContent = `${completedCats}/${totalCats}`;
  document.getElementById("onboardingCardTasks").textContent = checkedTasks;
  document.getElementById("onboardingCardRemaining").textContent = totalTasks - checkedTasks;
  
  const remainingEl = document.getElementById("onboardingCardRemaining");
  if (totalTasks - checkedTasks === 0) {
    remainingEl.classList.remove("warning");
    remainingEl.classList.add("success");
  } else {
    remainingEl.classList.remove("success");
    remainingEl.classList.add("warning");
  }

  document.getElementById("onboardingCardPct").textContent = `${obPct}%`;
  
  // Progress Bar
  const fill = document.getElementById("onboardingProgressFill");
  fill.style.width = `${obPct}%`;
  document.getElementById("onboardingProgressText").textContent = `${checkedTasks} of ${totalTasks} tasks complete`;
  document.getElementById("onboardingProgressPct").textContent = `${obPct}%`;
}

// Onboarding listeners moved to initParentEventListeners

function setIframeAbsoluteSrc(iframeSelector, relativeFallbackPath) {
  const iframe = document.querySelector(iframeSelector);
  if (iframe) {
    const newSrc = new URL(relativeFallbackPath, window.location.href).href;
    // Force an actual reload every time this is called (called only when a
    // tab is freshly navigated to, or right after switching the active
    // client) so the tool inside always re-reads getActiveClient() fresh.
    // Re-assigning the exact same src string is a no-op in browsers, so
    // clear it first.
    iframe.src = "about:blank";
    iframe.src = newSrc;
  }
}

// ── UX/UI Audit Suite Controller ──
function renderUxuiAudit() {
  setIframeAbsoluteSrc('#tab-uxui iframe', "ux-ui-audit-checklist/index.html");
}

// ── SEO Audit Suite Controller ──
function renderSeoAudit() {
  setIframeAbsoluteSrc('#tab-seo iframe', "seo-audit-checklist/index.html");
}

// ── Client Portal Manager Controller ──
function renderClientPortalManagerTab() {
  setIframeAbsoluteSrc('#tab-portal iframe', "client-portal-manager/index.html");
}

// ── Intake Request Controller ──
function renderIntakeRequest() {
  setIframeAbsoluteSrc('#tab-intakerequest iframe', "intake-request/index.html");
}

// ── Client Welcome Guide Controller ──
function renderWelcomeGuide() {
  setIframeAbsoluteSrc('#tab-welcomeguide iframe', "client-welcome-guide/index.html");
}

// ── Email Signature Generator Controller ──
function renderEmailSigGenerator() {
  setIframeAbsoluteSrc('#tab-emailsig iframe', "email-signature-generator/index.html");
}

// ── Creative Brief Generator Controller ──
function renderCreativeBrief() {
  setIframeAbsoluteSrc('#tab-creativebrief iframe', "creative-brief-generator/index.html");
}

// ── Content Audit Controller ──
function renderContentAudit() {
  setIframeAbsoluteSrc('#tab-contentaudit iframe', "content-audit/index.html");
}

// ── Paid Ads Audit Controller ──
function renderPaidAdsAudit() {
  setIframeAbsoluteSrc('#tab-paidads iframe', "paid-ads-audit/index.html");
}

// ── Email Marketing Audit Controller ──
function renderEmailStrategyAudit() {
  setIframeAbsoluteSrc('#tab-emailstrategy iframe', "email-marketing-audit/index.html?v=1.0");
}

// ── Campaign Launch Checklist Controller ──
function renderCampaignLaunchChecklist() {
  setIframeAbsoluteSrc('#tab-campaignlaunch iframe', "campaign-launch-checklist/index.html");
}

// ── Client Intake Pre-Qualifier Controller ──
function renderIntakeQualifier() {
  setIframeAbsoluteSrc('#tab-intakequalifier iframe', "intake-prequalifier/index.html");
}

// ── Discovery Call Script Controller ──
function renderDiscoveryCallScript() {
  setIframeAbsoluteSrc('#tab-discoverycall iframe', "discovery-call-script/index.html");
}

// ── Ad Account Setup Controller ──
function renderAdAccountSetup() {
  setIframeAbsoluteSrc('#tab-adaccountsetup iframe', "ad-account-setup/index.html");
}

// ── Package Recommendation Engine Controller ──
function renderPackageRecommendationEngine() {
  setIframeAbsoluteSrc('#tab-packagerecommend iframe', "package-recommendation-engine/index.html");
}

// ── Proposal Follow-Up Sequence Tracker Controller ──
function renderFollowUpTracker() {
  setIframeAbsoluteSrc('#tab-followuptracker iframe', "proposal-followup-tracker/index.html");
}

// ── ROI Projector Controller ──
function renderRoiProjector() {
  setIframeAbsoluteSrc('#tab-roiprojector iframe', "roi-projector/index.html");
}

// ── SOP Wiki Controller ──
function renderSopWiki() {
  setIframeAbsoluteSrc('#tab-sopwiki iframe', "sop-wiki/index.html?v=1.7");
}

// ── Proposal Calculator Controller ──
function renderProposalCalculator() {
  setIframeAbsoluteSrc('#tab-proposal iframe', "proposal-calculator/index.html?v=10");
}

// ── Content Strategy Guide Controller ──
function renderContentStrategy() {
  setIframeAbsoluteSrc('#tab-strategy iframe', "content-strategy-guide/index.html");
}

// ── Content Strategy Builder Controller ──
function renderStrategyBuilder() {
  setIframeAbsoluteSrc('#tab-strategybuilder iframe', "content-strategy-builder/index.html");
}

// ── Personal Branding Strategy Builder Controller ──
function renderPersonalBranding() {
  setIframeAbsoluteSrc('#tab-personalbrand iframe', "personal-branding-builder/index.html");
}

// ── Social Media Audit Controller ──
function renderSocialAudit() {
  setIframeAbsoluteSrc('#tab-socialaudit iframe', "social-media-audit/index.html");
}

// ── Competitor Analysis Matricies (Website & Social) ──
function renderWebCompetitors() {
  setIframeAbsoluteSrc('#tab-webcomp iframe', "competitor-analysis/Website Competitor Analysis Form.html");
}

function renderSocialCompetitors() {
  setIframeAbsoluteSrc('#tab-socialcomp iframe', "competitor-analysis/Competiteor Analysis Form.html");
}

// SWOT grid rendering helper with interactive prompt buttons
function renderSwotGrid(prefix, swotState, promptsDefs) {
  const container = document.getElementById(`${prefix}SwotGrid`);
  if (!container) return;

  container.innerHTML = "";

  promptsDefs.forEach(quad => {
    const card = document.createElement("div");
    card.className = "swot-card";
    card.style.borderTopColor = quad.borderColor;

    // Build prompt pills
    let pillsMarkup = "";
    quad.prompts.forEach(p => {
      pillsMarkup += `<span class="swot-prompt-chip" title="Click to insert prompt text">${p}</span>`;
    });

    card.innerHTML = `
      <div class="swot-card-header">
        <span class="swot-card-title">${quad.label}</span>
        <span class="swot-card-subtitle"> (${quad.sub})</span>
      </div>
      <div class="swot-prompts-scroller">
        ${pillsMarkup}
      </div>
      <textarea class="swot-textarea" placeholder="${quad.placeholder}">${swotState[quad.key] || ""}</textarea>
    `;

    // Listeners for prompt insert clicks
    card.querySelectorAll(".swot-prompt-chip").forEach(pill => {
      pill.addEventListener("click", () => {
        const ta = card.querySelector("textarea");
        const currentText = ta.value.trim();
        const promptText = pill.textContent.replace("___", "");
        
        if (currentText === "") {
          ta.value = promptText;
        } else {
          ta.value = currentText + "\n" + promptText;
        }
        
        // Trigger manual change events
        ta.dispatchEvent(new Event("input"));
        showBanner("success", "Inserted template prompt text!");
      });
    });

    // Listeners for SWOT text edits
    const ta = card.querySelector("textarea");
    ta.addEventListener("input", () => {
      swotState[quad.key] = ta.value;
      saveDatabase();
    });

    container.appendChild(card);
  });
}

// Website Competitor inputs are now handled inside its embedded iframe

// Social Competitor inputs are now handled inside its embedded iframe

  // Website competitor clear actions are handled inside the iframe document

  // Social competitor clear actions are handled inside the iframe document

// ── Monthly Report Form & Live Preview Controller ──
function renderReportForm() {
  setIframeAbsoluteSrc('#tab-report iframe', "competitor-analysis/revital-monthly-report-styled.html");
}

function renderCopywriting() {
  setIframeAbsoluteSrc('#tab-copywriting iframe', "copywriting-assistant/index.html");
}

function updateReportPreview() {
  // Preview is now handled inside the iframe
}

// Print, export/import, and client dropdown/button listeners moved to initParentEventListeners

// ── Notification Banner Alerts ──
function showBanner(type, message) {
  const activeBanner = type === "success" ? document.getElementById("successBanner") : document.getElementById("errorBanner");
  const msgSpan = type === "success" ? document.getElementById("successBannerMsg") : document.getElementById("errorBannerMsg");

  if (!activeBanner || !msgSpan) return;

  // Close other banners
  document.getElementById("successBanner").style.display = "none";
  document.getElementById("errorBanner").style.display = "none";

  msgSpan.textContent = message;
  activeBanner.style.display = "flex";

  setTimeout(() => {
    activeBanner.style.display = "none";
  }, 4000);
}

// ── Mobile Drawer Navigation ──
function initMobileNavigation() {
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const mobileCloseBtn = document.getElementById("mobileCloseBtn");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  const sidebar = document.getElementById("sidebar");

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove("open");
    if (sidebarOverlay) sidebarOverlay.classList.remove("active");
  }

  function openSidebar() {
    if (sidebar) sidebar.classList.add("open");
    if (sidebarOverlay) sidebarOverlay.classList.add("active");
  }

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener("click", openSidebar);
  }
  if (mobileCloseBtn) {
    mobileCloseBtn.addEventListener("click", closeSidebar);
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
  }

  // Close sidebar on navigation selection (mobile only)
  const navButtons = document.querySelectorAll(".nav-item-btn");
  navButtons.forEach(btn => {
    btn.addEventListener("click", closeSidebar);
  });
}

// ── Parent Event Listeners Initialization ──
function initParentEventListeners() {
  // Onboarding inputs sync
  const obTargetUrl = document.getElementById("obTargetUrl");
  if (obTargetUrl) {
    obTargetUrl.addEventListener("input", (e) => {
      const client = getActiveClient();
      client.targetUrl = e.target.value;
      saveDatabase();
      // Keep dashboard hero in sync
      const heroUrl = document.getElementById("dashHeroTargetUrl");
      if (heroUrl) heroUrl.textContent = e.target.value || "No website logged yet";
    });
  }

  const dashClickupUrl = document.getElementById("dashClickupUrl");
  if (dashClickupUrl) {
    dashClickupUrl.addEventListener("input", (e) => {
      const client = getActiveClient();
      client.clickupUrl = e.target.value;
      saveDatabase();
      const btn = document.getElementById("dashClickupBtn");
      if (btn) {
        if (client.clickupUrl) {
          btn.href = client.clickupUrl;
          btn.style.display = "flex";
        } else {
          btn.style.display = "none";
        }
      }
    });
  }

  const obTargetDate = document.getElementById("obTargetDate");
  if (obTargetDate) {
    obTargetDate.addEventListener("input", (e) => {
      const client = getActiveClient();
      client.onboardingDate = e.target.value;
      saveDatabase();
    });
  }

  // Add custom onboarding item
  const addCustomObBtn = document.getElementById("addCustomObBtn");
  if (addCustomObBtn) {
    addCustomObBtn.addEventListener("click", () => {
      const client = getActiveClient();
      const labelInput = document.getElementById("customObLabel");
      const categorySelect = document.getElementById("customObCategory");

      if (!labelInput || !categorySelect) return;
      const label = labelInput.value.trim();
      if (label === "") return;

      const targetCategory = categorySelect.value;
      const categoryObj = client.onboardingChecklist.find(cat => cat.category === targetCategory);

      if (categoryObj) {
        const newId = `ob_custom_${Date.now()}`;
        categoryObj.items.push({
          id: newId,
          label: label,
          checked: false,
          notes: "",
          clientVisible: false
        });
        saveDatabase();
        labelInput.value = "";
        renderOnboardingChecklist();
        renderDashboard();
        showBanner("success", "Added custom onboarding checklist item!");
      }
    });
  }

  // Reset Onboarding Checklist
  const resetOnboardingBtn = document.getElementById("resetOnboardingBtn");
  if (resetOnboardingBtn) {
    resetOnboardingBtn.addEventListener("click", () => {
      const confirmReset = confirm("Reset all onboarding items back to blank templates? Custom added tasks will be deleted.");
      if (!confirmReset) return;

      const client = getActiveClient();
      const blueprints = DEFAULT_ONBOARDING_CHECKLIST.map(cat => ({
        category: cat.category,
        items: cat.items.map(item => ({
          id: item.id,
          label: item.label,
          checked: false,
          notes: "",
          clientVisible: item.clientVisible || false
        }))
      }));

      client.onboardingChecklist = blueprints;
      saveDatabase();
      renderOnboardingChecklist();
      renderDashboard();
      showBanner("success", "Onboarding checklist reset to template.");
    });
  }

  // Print Buttons
  const printOnboardingBtn = document.getElementById("printOnboardingBtn");
  if (printOnboardingBtn) {
    printOnboardingBtn.addEventListener("click", () => window.print());
  }

  // Sidebar Utilities: Export / Import JSON
  const exportDataBtn = document.getElementById("exportDataBtn");
  if (exportDataBtn) {
    exportDataBtn.addEventListener("click", () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(clientsDb, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `Revital_Productions_Hub_${activeClientName.replace(/\s+/g, "_")}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showBanner("success", "Client workspaces exported successfully!");
    });
  }

  const importDataBtn = document.getElementById("importDataBtn");
  if (importDataBtn) {
    importDataBtn.addEventListener("click", () => {
      const fileInput = document.getElementById("importFileInput");
      if (fileInput) fileInput.click();
    });
  }

  
  const exportDossierBtn = document.getElementById("exportDossierBtn");
  if (exportDossierBtn) {
    exportDossierBtn.addEventListener("click", async () => {
      if (typeof JSZip === 'undefined') {
        alert("JSZip library failed to load. Please check your connection.");
        return;
      }
      
      const client = clientsDb[activeClientName];
      if (!client) {
        alert("No active client found.");
        return;
      }

      const origText = exportDossierBtn.innerHTML;
      exportDossierBtn.innerHTML = "⏳ Zipping Dossier...";
      exportDossierBtn.disabled = true;

      try {
        const zip = new JSZip();
        
        // 1. Raw JSON Backup
        zip.file(`Raw_Data_${activeClientName.replace(/\s+/g, '_')}.json`, JSON.stringify(client, null, 2));

        // 2. Comprehensive Text Dossier (Markdown)
        let md = `# Client Dossier: ${client.name}\n\n`;
        md += `**Created Date:** ${client.createdDate || 'N/A'}\n`;
        md += `**Target URL:** ${client.targetUrl || 'N/A'}\n\n`;
        
        // Onboarding
        if (client.onboardingChecklist) {
          md += `## Onboarding Checklist\n`;
          client.onboardingChecklist.forEach(cat => {
            md += `### ${cat.category}\n`;
            cat.items.forEach(item => {
              md += `- [${item.checked ? 'X' : ' '}] ${item.label}\n`;
              if (item.notes) md += `  - *Notes: ${item.notes}*\n`;
            });
          });
          md += `\n`;
        }

        // Add to ZIP
        zip.file(`Dossier_${activeClientName.replace(/\s+/g, '_')}.md`, md);

        // Generate Zip
        const content = await zip.generateAsync({type: "blob"});
        
        // Trigger Download
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Revital_Dossier_${activeClientName.replace(/\s+/g, '_')}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showBanner("success", "Client Dossier (ZIP) exported successfully!");
      } catch (err) {
        console.error(err);
        alert("Failed to generate ZIP dossier.");
      } finally {
        exportDossierBtn.innerHTML = origText;
        exportDossierBtn.disabled = false;
      }
    });
  }


  const importFileInput = document.getElementById("importFileInput");
  if (importFileInput) {
    importFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const imported = JSON.parse(evt.target.result);
          
          if (typeof imported !== 'object' || Array.isArray(imported)) {
            throw new Error("Invalid file structure. Must be a JSON object.");
          }

          clientsDb = { ...clientsDb, ...imported };
          saveDatabase();
          
          activeClientName = Object.keys(imported)[0];
          localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);
          
          buildClientDropdown();
          refreshAllViews();
          showBanner("success", "Backups merged and imported successfully!");
        } catch (err) {
          showBanner("error", "Failed to parse backup JSON. Verify file format.");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
  }

  // Delete Client Button
  const deleteClientBtn = document.getElementById("deleteClientBtn");
  if (deleteClientBtn) {
    deleteClientBtn.addEventListener("click", deleteActiveClient);
  }

  // Add Client button dropdown
  const addClientBtn = document.getElementById("addClientBtn");
  if (addClientBtn) {
    addClientBtn.addEventListener("click", createNewClient);
  }

  // Dropdown change listener
  const clientSelect = document.getElementById("clientSelect");
  if (clientSelect) {
    clientSelect.addEventListener("change", (e) => {
      switchClient(e.target.value);
    });
  }
}

// ── Application Bootstrapper ──
window.onerror = function(msg, url, line) {
  if (msg === "Script error.") return false;
  const el = document.getElementById("dashHeroClientName");
  if (el) el.textContent = "Global Error: " + msg + " at line " + line;
};

function fetchCloudflareProfile() {
  fetch('/api/user')
    .then(res => res.json())
    .then(data => {
      if (data && data.email && data.email !== 'Guest') {
        const userEmailEl = document.getElementById('userEmail');
        const userAvatarEl = document.getElementById('userAvatar');
        
        // Extract username from email
        let displayName = data.email;
        if (data.email.includes('@')) {
          const username = data.email.split('@')[0];
          // Capitalize first letter
          displayName = username.charAt(0).toUpperCase() + username.slice(1);
          
          // Force 'Ronald' to show as 'Admin'
          if (displayName.toLowerCase() === 'ronald') {
            displayName = 'Admin';
          }
        }
        
        if (userEmailEl) userEmailEl.textContent = displayName;
        if (userAvatarEl) {
          userAvatarEl.textContent = displayName.charAt(0).toUpperCase();
        }
      }
    })
    .catch(err => console.log('Running locally or no Cloudflare Access headers present.', err));
}

document.addEventListener("DOMContentLoaded", () => {
  // Require Firebase sign-in as the admin account before booting the hub
  // (checkIdentity/boot logic lives in initAdminAuthGate() -> boot()).
  initAdminAuthGate();
});

// ── Brand Vault Controllers ──
function renderBrandVault() {
  const client = getActiveClient();
  if (!client || !client.brandVault) return;

  const bv = client.brandVault;
  
  // Backwards compatibility for old clients without full structure
  if (!bv.assets) bv.assets = { logoUrl: "", driveLink: "", canvaLink: "" };
  if (!bv.colors) bv.colors = [
    { hex: "#000000", name: "Primary" }, { hex: "#000000", name: "Secondary" },
    { hex: "#000000", name: "Accent 1" }, { hex: "#000000", name: "Accent 2" }, { hex: "#000000", name: "Background" }
  ];
  if (!bv.typography) bv.typography = { primaryFont: "", secondaryFont: "" };
  if (!bv.brandVoice) bv.brandVoice = { adjectives: "", missionStatement: "" };
  if (!bv.targetAudience) bv.targetAudience = { demographic: "", painPoints: "" };

  // Assets
  document.getElementById("bvLogoUrl").value = bv.assets.logoUrl || "";
  document.getElementById("bvDriveLink").value = bv.assets.driveLink || "";
  document.getElementById("bvCanvaLink").value = bv.assets.canvaLink || "";

  // Typography
  document.getElementById("bvPrimaryFont").value = bv.typography.primaryFont || "";
  document.getElementById("bvSecondaryFont").value = bv.typography.secondaryFont || "";
  
  // Voice
  document.getElementById("bvAdjectives").value = bv.brandVoice.adjectives || "";
  document.getElementById("bvMission").value = bv.brandVoice.missionStatement || "";

  // Audience
  document.getElementById("bvDemographic").value = bv.targetAudience.demographic || "";
  document.getElementById("bvPainPoints").value = bv.targetAudience.painPoints || "";

  // Colors
  const colorsContainer = document.getElementById("bvColorsContainer");
  if (colorsContainer) {
    colorsContainer.innerHTML = "";
    bv.colors.forEach((color, index) => {
      const item = document.createElement("div");
      item.className = "bv-color-item";
      item.innerHTML = `
        <input type="color" class="bv-color-picker" id="bvColorHex_${index}" value="${color.hex || '#000000'}" onchange="saveBrandVault()">
        <div class="bv-color-inputs">
          <input type="text" class="bv-input" style="padding: 4px 8px; font-size: 0.8rem;" id="bvColorName_${index}" value="${color.name || ''}" placeholder="Color Name" onchange="saveBrandVault()">
          <input type="text" class="bv-input" style="padding: 4px 8px; font-size: 0.8rem;" id="bvColorText_${index}" value="${color.hex || '#000000'}" placeholder="#HEX" onchange="document.getElementById('bvColorHex_${index}').value = this.value; saveBrandVault()">
        </div>
      `;
      colorsContainer.appendChild(item);
    });
  }

  // Update Scorecards
  updateBrandVaultScorecards();
}

function updateBrandVaultScorecards() {
  const client = getActiveClient();
  if (!client || !client.brandVault) return;
  const bv = client.brandVault;

  const totalFields = 9; 
  let filledFields = 0;
  
  if (bv.assets && bv.assets.logoUrl) filledFields++;
  if (bv.assets && bv.assets.driveLink) filledFields++;
  if (bv.assets && bv.assets.canvaLink) filledFields++;
  if (bv.typography && bv.typography.primaryFont) filledFields++;
  if (bv.typography && bv.typography.secondaryFont) filledFields++;
  if (bv.brandVoice && bv.brandVoice.adjectives) filledFields++;
  if (bv.brandVoice && bv.brandVoice.missionStatement) filledFields++;
  if (bv.targetAudience && bv.targetAudience.demographic) filledFields++;
  if (bv.targetAudience && bv.targetAudience.painPoints) filledFields++;
  
  const pct = Math.round((filledFields / totalFields) * 100);
  
  const elTotal = document.getElementById("bvCardTotal");
  const elFilled = document.getElementById("bvCardFilled");
  const elRemaining = document.getElementById("bvCardRemaining");
  const elPct = document.getElementById("bvCardPct");
  const progressFill = document.getElementById("bvProgressFill");
  const progressText = document.getElementById("bvProgressText");
  const progressPctText = document.getElementById("bvProgressPct");
  
  if (elFilled) {
    elTotal.textContent = totalFields;
    elFilled.textContent = filledFields;
    elRemaining.textContent = totalFields - filledFields;
    if (filledFields === totalFields) {
      elRemaining.classList.remove('warning');
    } else {
      elRemaining.classList.add('warning');
    }
    elPct.textContent = pct + "%";
    progressFill.style.width = pct + "%";
    progressText.textContent = `${filledFields} of ${totalFields} fields complete`;
    progressPctText.textContent = pct + "%";
  }
}

function saveBrandVault() {
  const client = getActiveClient();
  if (!client) return;
  if (!client.brandVault) client.brandVault = {};
  
  const bv = client.brandVault;
  
  // Assets
  if (!bv.assets) bv.assets = {};
  bv.assets.logoUrl = document.getElementById("bvLogoUrl").value;
  bv.assets.driveLink = document.getElementById("bvDriveLink").value;
  bv.assets.canvaLink = document.getElementById("bvCanvaLink").value;

  // Typography
  if (!bv.typography) bv.typography = {};
  bv.typography.primaryFont = document.getElementById("bvPrimaryFont").value;
  bv.typography.secondaryFont = document.getElementById("bvSecondaryFont").value;

  // Voice
  if (!bv.brandVoice) bv.brandVoice = {};
  bv.brandVoice.adjectives = document.getElementById("bvAdjectives").value;
  bv.brandVoice.missionStatement = document.getElementById("bvMission").value;

  // Audience
  if (!bv.targetAudience) bv.targetAudience = {};
  bv.targetAudience.demographic = document.getElementById("bvDemographic").value;
  bv.targetAudience.painPoints = document.getElementById("bvPainPoints")?.value || "";

  // Colors
  if (!bv.colors) bv.colors = [];
  for (let i = 0; i < 5; i++) {
    const hexInput = document.getElementById(`bvColorHex_${i}`);
    const nameInput = document.getElementById(`bvColorName_${i}`);
    if (hexInput && nameInput) {
      if (!bv.colors[i]) bv.colors[i] = {};
      bv.colors[i].hex = hexInput.value;
      bv.colors[i].name = nameInput.value;
    }
  }

  // Update UI scorecards instantly without redrawing the whole form
  updateBrandVaultScorecards();

  saveDatabase();
  renderDashboard();
}



// ── Firebase Cloud Sync ──
let isInitialLoad = true;

function backfillMissingClientChecklists() {
  // Clients created before the client-facing checklist feature shipped
  // never got a clientChecklist array. Client Portal Manager backfills it,
  // but only for a client the admin has actually opened that tool for -
  // any client that hasn't been visited there yet silently syncs an empty
  // checklist to its portal, which just looks blank to the client with no
  // explanation. Backfill here so every client gets the starter checklist
  // regardless of whether Client Portal Manager has been opened for them.
  let changed = false;
  Object.values(clientsDb).forEach(client => {
    if (client && !Array.isArray(client.clientChecklist)) {
      client.clientChecklist = DEFAULT_CLIENT_CHECKLIST.map(item => ({
        id: item.id,
        label: item.label,
        checked: false
      }));
      changed = true;
    }
  });
  return changed;
}

let _cloudSaveDebounceTimer = null;

function saveDatabase() {
  // 1. Save locally as fallback - always instant, never debounced, so nothing
  // is lost even if the tab closes before the debounced cloud write below
  // fires.
  backfillMissingClientChecklists();
  localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));

  // 2. Trigger Autosave UI indicator
  const indicator = document.getElementById("autosaveIndicator");
  if (indicator) {
    indicator.innerHTML = "Syncing... 🔄";
    indicator.style.opacity = "1";
  }

  // 3. Debounce the actual cloud write (see comment above this function).
  if (_cloudSaveDebounceTimer) clearTimeout(_cloudSaveDebounceTimer);
  _cloudSaveDebounceTimer = setTimeout(() => {
    _cloudSaveDebounceTimer = null;
    commitDatabaseToCloud();
  }, 500);
}

// ── clientsDb Firestore storage (sharded) ──
//
// HISTORY: clientsDb lived in a single agency/clientsDb document holding
// every client's full state (onboarding, audits, competitor grids,
// proposals, etc.) keyed by client name. That's the same single-document
// pattern that caused the SOP & Wiki Library to hit Firestore's
// 1,048,576-byte per-document hard limit once its combined content grew
// past it - every save AND every load started failing, invisibly, until
// someone happened to notice. clientsDb is well under that limit today
// (roughly 15% as of this writing), but the failure mode when it
// eventually crosses it is identical.
//
// FIX: the same sharding approach used for the SOP wiki. clientsDb is
// bin-packed by client key across as many agency/clientsDb-shard-N
// documents as needed to keep each one safely under a byte threshold,
// plus one tiny agency/clientsDbShardMeta document ({ count: N })
// tracking how many shards currently exist. Every shard is still a single
// document directly under /agency/, so this needs no Firestore rules
// changes. Everything else - loadDatabase(), saveDatabase(), every screen
// that reads or writes clientsDb - keeps working against the same
// in-memory `clientsDb` object as before and doesn't need to know shards
// exist at all.
const CLIENTS_DB_SHARD_PREFIX = "clientsDb-shard-";
const CLIENTS_DB_MAX_SHARD_BYTES = 700000;

let clientsDbShardData = {};          // { [shardIndex]: { clientName: state, ... } }
let clientsDbShardUnsubscribers = [];
let lastKnownClientsDbShardCount = 0;

function getClientsDbShardMetaDocRef() {
  if (!window.firebaseDb || !window.firebaseDoc) return null;
  return window.firebaseDoc(window.firebaseDb, "agency", "clientsDbShardMeta");
}

function getClientsDbShardDocRef(shardIndex) {
  if (!window.firebaseDb || !window.firebaseDoc) return null;
  return window.firebaseDoc(window.firebaseDb, "agency", CLIENTS_DB_SHARD_PREFIX + shardIndex);
}

// Legacy pre-sharding location. Only ever read once, during the one-time
// migration in loadDatabase() below - never written to again after that.
function getLegacyClientsDbDocRef() {
  if (!window.firebaseDb || !window.firebaseDoc) return null;
  return window.firebaseDoc(window.firebaseDb, "agency", "clientsDb");
}

// Greedily bin-packs clientsDb's entries into shard-sized chunks, each
// kept under CLIENTS_DB_MAX_SHARD_BYTES when serialized the same way
// it's actually saved.
function packClientsDbIntoShards(fullDb) {
  const entries = Object.entries(fullDb);
  const shards = [];
  let current = {};
  let currentCount = 0;
  for (const [key, value] of entries) {
    const trial = Object.assign({}, current, { [key]: value });
    const size = new Blob([JSON.stringify(trial)]).size;
    if (size > CLIENTS_DB_MAX_SHARD_BYTES && currentCount > 0) {
      shards.push(current);
      current = { [key]: value };
      currentCount = 1;
    } else {
      current = trial;
      currentCount++;
    }
  }
  if (currentCount > 0 || shards.length === 0) shards.push(current);
  return shards;
}

function rebuildClientsDbFromShards() {
  const merged = {};
  for (let i = 0; i < lastKnownClientsDbShardCount; i++) {
    if (clientsDbShardData[i] && typeof clientsDbShardData[i] === 'object') {
      Object.assign(merged, clientsDbShardData[i]);
    }
  }

  const cloudStr = JSON.stringify(merged);
  const localStr = JSON.stringify(clientsDb);
  if (cloudStr === localStr) return;

  clientsDb = merged;
  localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));

  if (!clientsDb[activeClientName]) {
    activeClientName = Object.keys(clientsDb)[0] || "";
  }

  buildClientDropdown();
  refreshAllViews();
  renderDashboard();
}

function listenToClientsDbShard(shardIndex) {
  const docRef = getClientsDbShardDocRef(shardIndex);
  if (!docRef || !window.firebaseOnSnapshot) return;
  const unsubscribe = window.firebaseOnSnapshot(docRef, (docSnap) => {
    // Skip echoes of our own unconfirmed writes for this shard - if the
    // admin is actively editing (every keystroke triggers a debounced
    // save), a later keystroke can update clientsDb in memory before an
    // earlier keystroke's echo arrives here, and applying that stale
    // echo would clobber the newer edit.
    if (docSnap.metadata && docSnap.metadata.hasPendingWrites) return;
    clientsDbShardData[shardIndex] = docSnap.exists ? docSnap.data() : {};
    rebuildClientsDbFromShards();
  }, (err) => {
    console.error("clientsDb shard listener error:", err);
    showBanner("error", "Couldn't sync with the cloud database: " + err.message);
  });
  clientsDbShardUnsubscribers.push(unsubscribe);
}

function setClientsDbShardListenerCount(count) {
  if (count === lastKnownClientsDbShardCount && clientsDbShardUnsubscribers.length === count) return;
  clientsDbShardUnsubscribers.forEach(unsubscribe => {
    if (typeof unsubscribe === 'function') unsubscribe();
  });
  clientsDbShardUnsubscribers = [];
  clientsDbShardData = {};
  lastKnownClientsDbShardCount = count;
  for (let i = 0; i < count; i++) listenToClientsDbShard(i);
}

function commitDatabaseToCloud() {
  const indicator = document.getElementById("autosaveIndicator");

  if (!(window.firebaseSetDoc && window.firebaseDoc && window.firebaseDb)) {
    // Firebase is not loaded!
    if (indicator) {
      indicator.innerHTML = "Firebase Not Loaded ❌";
      setTimeout(() => { indicator.style.opacity = "0"; }, 3000);
    }
    return;
  }

  const cleanDb = JSON.parse(JSON.stringify(clientsDb));
  const shards = packClientsDbIntoShards(cleanDb);

  const writes = shards.map((shardObj, i) => {
    const docRef = getClientsDbShardDocRef(i);
    return window.firebaseSetDoc(docRef, shardObj);
  });

  // If the client list just got shorter (client deleted) and now needs
  // fewer shards than last time, blank out the now-unused trailing shard
  // documents instead of leaving stale client data sitting in them.
  for (let i = shards.length; i < lastKnownClientsDbShardCount; i++) {
    const docRef = getClientsDbShardDocRef(i);
    writes.push(window.firebaseSetDoc(docRef, {}));
  }

  const metaRef = getClientsDbShardMetaDocRef();
  writes.push(window.firebaseSetDoc(metaRef, { count: shards.length }));

  // Add a manual timeout to detect hanging
  let resolved = false;
  setTimeout(() => {
    if (!resolved && indicator) {
      indicator.innerHTML = "Cloud Timeout ❌";
      setTimeout(() => { indicator.style.opacity = "0"; }, 3000);
    }
  }, 10000);

  Promise.all(writes).then(() => {
    resolved = true;
    if (indicator) {
      indicator.innerHTML = "Saved to Cloud ✅";
      setTimeout(() => { indicator.style.opacity = "0"; }, 2000);
    }
  }).catch(err => {
    resolved = true;
    console.error("Firebase save failed:", err);
    if (indicator) {
      indicator.innerHTML = "Cloud Error ❌: " + err.message;
      setTimeout(() => { indicator.style.opacity = "0"; }, 5000);
    }
  });

  // Mirror only the portal-facing subset of each client into its own
  // public document (see syncPublicPortalDocs). The full clientsDb data
  // above is admin-only under Firestore rules; this is what the
  // unauthenticated client portal is allowed to read.
  syncPublicPortalDocs(cleanDb).catch(err => {
    console.error("Public portal sync failed:", err);
  });
}

// Push the portal-facing subset (branding + checklist) of every client that
// has an active magic link out to clients/{magicToken}. That document's ID
// *is* the capability token: Firestore rules allow anyone to GET a single
// doc by its exact ID but never LIST the collection, so only someone
// holding the actual magic link can read a given client's portal data.
// Non-portal fields (proposals, SEO audits, internal notes, etc.) never
// leave the admin-only agency/clientsDb document.
function foldInOnboardingChecked(targetCategories, existingCategories) {
  if (!Array.isArray(targetCategories) || !Array.isArray(existingCategories)) return false;
  const checkedIds = new Set();
  existingCategories.forEach(cat => (cat.items || []).forEach(item => {
    if (item.checked) checkedIds.add(item.id);
  }));
  let changed = false;
  targetCategories.forEach(cat => (cat.items || []).forEach(item => {
    if (checkedIds.has(item.id) && !item.checked) {
      item.checked = true;
      changed = true;
    }
  }));
  return changed;
}

function foldInClientChecklistChecked(targetItems, existingItems) {
  if (!Array.isArray(targetItems) || !Array.isArray(existingItems)) return false;
  const checkedIds = new Set(existingItems.filter(item => item.checked).map(item => item.id));
  let changed = false;
  targetItems.forEach(item => {
    if (checkedIds.has(item.id) && !item.checked) {
      item.checked = true;
      changed = true;
    }
  });
  return changed;
}

// Pull any approval decisions the client already made (which write
// straight to the public clients/{token} doc, same as the checklist) into
// a target object with .pendingApprovals / .approvalHistory arrays -
// moving the decided item out of pending and into history. Works whether
// "target" is the real live client object (ensureClientPortalListeners)
// or a throwaway wrapper around an outgoing-write clone
// (syncPublicPortalDocs), since both just need their two array
// properties reassigned in place.
function foldInApprovalDecisions(target, publicData) {
  if (!target || !publicData || !Array.isArray(publicData.approvalHistory)) return false;
  if (!Array.isArray(target.pendingApprovals)) target.pendingApprovals = [];
  if (!Array.isArray(target.approvalHistory)) target.approvalHistory = [];

  const knownIds = new Set(target.approvalHistory.map(a => a.id));
  let changed = false;

  publicData.approvalHistory.forEach(entry => {
    if (!knownIds.has(entry.id)) {
      target.approvalHistory = target.approvalHistory.concat([entry]);
      target.pendingApprovals = target.pendingApprovals.filter(p => p.id !== entry.id);
      changed = true;
    }
  });

  return changed;
}

async function syncPublicPortalDocs(dbSnapshot) {
  if (!window.firebaseDb || !window.firebaseDb.collection) return;

  const entries = Object.entries(dbSnapshot).filter(
    ([, client]) => client && client.portalConfig && client.portalConfig.magicToken
  );

  for (const [name, client] of entries) {
    const token = client.portalConfig.magicToken;
    const publicRef = window.firebaseDb.collection("clients").doc(token);
    const localChecklist = client.onboardingChecklist || client.onboarding || [];
    const localClientChecklist = client.clientChecklist || [];
    const approvalsWrapper = {
      pendingApprovals: client.pendingApprovals || [],
      approvalHistory: client.approvalHistory || []
    };

    try {
      // Fold in any checklist progress (and approval decisions) the client
      // already made directly on the portal so this save doesn't stomp on
      // it. (Pulling that progress into the real, live clientsDb so the
      // admin side actually SEES it is handled separately and continuously
      // by ensureClientPortalListeners below - not tied to whether the
      // admin happens to save something.)
      const existing = await publicRef.get();
      if (existing.exists) {
        const existingData = existing.data();
        foldInOnboardingChecked(localChecklist, existingData.onboardingChecklist);
        foldInClientChecklistChecked(localClientChecklist, existingData.clientChecklist);
        foldInApprovalDecisions(approvalsWrapper, existingData);
      }
    } catch (e) {
      console.warn("Could not read existing public portal doc for", name, e);
    }

    const projection = {
      portalConfig: client.portalConfig,
      onboardingChecklist: localChecklist,
      clientChecklist: localClientChecklist,
      pendingApprovals: approvalsWrapper.pendingApprovals,
      approvalHistory: approvalsWrapper.approvalHistory,
      // Published report snapshots (see competitor-analysis/script.js's
      // publishToClientPortal). Admin-only to create - clients never write
      // this field, so no fold-in-existing-progress step is needed here
      // the way there is for the two checklists above.
      reportArchive: client.reportArchive || []
    };

    publicRef.set(projection).catch(err => {
      console.error("Public portal doc write failed for", name, err);
    });
  }
}

// ── Live sync: client-side checklist changes -> agency side ──
// The client portal writes checklist checkbox changes directly to its own
// clients/{token} doc (see updateFirebaseChecklist in portal/js/app.js) -
// that write never goes through the admin's saveDatabase()/clientsDb at
// all. Without a listener dedicated to watching for that, the agency side
// only ever found out about it as an incidental side effect of the admin
// happening to save something else - which is why checking a box on the
// client portal didn't reliably (or promptly) show up here. This keeps one
// real-time listener per client with an active magic link, purely to pull
// client-driven checklist progress back into the real clientsDb the
// moment it happens.
const portalListenerUnsubscribers = {};

function ensureClientPortalListeners() {
  if (!window.firebaseDb || !window.firebaseOnSnapshot || !window.firebaseDoc) return;

  const activeTokens = new Set();

  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client || !client.portalConfig || !client.portalConfig.magicToken) return;
    const token = client.portalConfig.magicToken;
    activeTokens.add(token);

    if (portalListenerUnsubscribers[token]) return; // already listening

    const docRef = window.firebaseDoc(window.firebaseDb, "clients", token);
    const unsubscribe = window.firebaseOnSnapshot(docRef, (docSnap) => {
      if (!docSnap.exists) return;
      // Skip echoes of the admin's own not-yet-confirmed writes to this
      // same doc (from syncPublicPortalDocs above) - only react to changes
      // that actually came from somewhere else (the client's own portal).
      if (docSnap.metadata && docSnap.metadata.hasPendingWrites) return;

      const data = docSnap.data();
      const currentClient = clientsDb[name];
      if (!currentClient) return;

      const changedOnboarding = foldInOnboardingChecked(currentClient.onboardingChecklist, data.onboardingChecklist);
      const changedClientChecklist = foldInClientChecklistChecked(currentClient.clientChecklist, data.clientChecklist);
      const changedApprovals = foldInApprovalDecisions(currentClient, data);

      if (changedOnboarding || changedClientChecklist || changedApprovals) {
        localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));
        try { renderOnboardingChecklist(); } catch (e) {}
        try { renderDashboard(); } catch (e) {}
        try {
          if (typeof iframeNeedsReload !== "undefined" && iframeNeedsReload["tab-portal"] !== undefined) {
            iframeNeedsReload["tab-portal"] = true;
            const activeTabBtn = document.querySelector(".nav-item-btn.active");
            const activeTab = activeTabBtn ? activeTabBtn.getAttribute("data-tab") : "";
            if (activeTab === "tab-portal" && activeClientName === name) {
              refreshIframeTab("tab-portal");
            }
          }
        } catch (e) {}
      }
    }, (err) => {
      console.error("Portal listener error for", name, err);
    });

    portalListenerUnsubscribers[token] = unsubscribe;
  });

  // Stop listening for tokens that no longer belong to any client (deleted
  // client, or a regenerated magic link).
  Object.keys(portalListenerUnsubscribers).forEach(token => {
    if (!activeTokens.has(token)) {
      try { portalListenerUnsubscribers[token](); } catch (e) {}
      delete portalListenerUnsubscribers[token];
    }
  });
}

function loadDatabase() {
  // 1. Instant boot from LocalStorage cache (offline support / immediate render)
  const stored = localStorage.getItem("REVITAL_HUB_CLIENTS");
  if (stored) {
    try {
      clientsDb = JSON.parse(stored);
    } catch (e) {
      clientsDb = {};
    }
  }

  // Set active client
  const storedActive = localStorage.getItem("REVITAL_HUB_ACTIVE_CLIENT");
  if (storedActive && clientsDb[storedActive]) {
    activeClientName = storedActive;
  } else if (Object.keys(clientsDb).length > 0) {
    activeClientName = Object.keys(clientsDb)[0];
  } else {
    // Seed default if empty
    const defaultName = "Nexus Productions";
    clientsDb[defaultName] = createClientBlankState(defaultName);
    activeClientName = defaultName;
  }

  // Self-heal any client missing a clientChecklist (see
  // backfillMissingClientChecklists) and push the fix out immediately so
  // it doesn't sit unsynced until the next unrelated edit.
  if (backfillMissingClientChecklists()) {
    saveDatabase();
  }

  // Render immediately with whatever we have (localStorage cache or the
  // seeded default) so the dropdown is never left empty while we wait on
  // the network. The Firestore listener below will re-render again once
  // cloud data arrives, whether or not it differs from this first render.
  buildClientDropdown();
  refreshAllViews();
  renderDashboard();

    // 2. Setup Firebase real-time listener (sharded - see the
  // "clientsDb Firestore storage (sharded)" comment block above
  // commitDatabaseToCloud for why).
  if (window.firebaseOnSnapshot && window.firebaseDoc && window.firebaseDb && window.firebaseGetDoc) {
    const metaRef = getClientsDbShardMetaDocRef();
    window.firebaseOnSnapshot(metaRef, async (metaSnap) => {
      if (metaSnap.exists && typeof metaSnap.data().count === 'number') {
        setClientsDbShardListenerCount(metaSnap.data().count);
        return;
      }

      // No shard metadata yet - either a brand-new install, or a Hub
      // still on the old single-document format that needs a one-time
      // migration into shards.
      try {
        const legacyRef = getLegacyClientsDbDocRef();
        const legacySnap = legacyRef ? await window.firebaseGetDoc(legacyRef) : null;
        if (legacySnap && legacySnap.exists) {
          clientsDb = legacySnap.data();
          localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));
          if (!clientsDb[activeClientName]) {
            activeClientName = Object.keys(clientsDb)[0] || "";
          }
          buildClientDropdown();
          refreshAllViews();
          renderDashboard();
        }
        // Writes the migrated (or first-ever, brand-new-install) state
        // into shards + shard metadata. The metadata write above will
        // re-trigger this listener with metaSnap.exists === true next
        // time, switching over to the normal per-shard listeners.
        commitDatabaseToCloud();
      } catch (err) {
        console.error("clientsDb migration failed:", err);
        showBanner("error", "Couldn't migrate the client database to the new format: " + err.message);
      }
    }, (err) => {
      console.error("clientsDb shard meta listener error:", err);
      showBanner("error", "Couldn't sync with the cloud database: " + err.message);
    });
  }
}

// ── Global Command Palette (Cmd+K) ──
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('cmdkOverlay');
  const input = document.getElementById('cmdkInput');
  const resultsEl = document.getElementById('cmdkResults');
  let selectedIndex = 0;
  let currentResults = [];

  const tools = [
    { id: 'tab-dashboard', title: 'Overview Dashboard', icon: 'M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z' },
    { id: 'tab-onboarding', title: 'Client Onboarding', icon: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3' },
    { id: 'tab-brandvault', title: 'Brand Vault', icon: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z' },
    { id: 'tab-uxui', title: 'UX/UI Audit', icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' },
    { id: 'tab-seo', title: 'SEO Audit Checklist', icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' },
    { id: 'tab-paidads', title: 'Paid Ads Audit', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    { id: 'tab-creativebrief', title: 'Creative Brief', icon: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' },
    { id: 'tab-proposal', title: 'Proposal Calculator', icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
    { id: 'tab-emailsig', title: 'Email Signature', icon: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6' },
    { id: 'tab-sopwiki', title: 'SOP Wiki', icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' }
  ];

  function openCmdK() {
    overlay.style.display = 'flex';
    input.value = '';
    renderResults('');
    setTimeout(() => input.focus(), 50);
  }

  function closeCmdK() {
    overlay.style.display = 'none';
  }

  function renderResults(query) {
    const q = query.toLowerCase();
    currentResults = tools.filter(t => t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
    selectedIndex = 0;
    
    if (currentResults.length === 0) {
      resultsEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">No matches found.</div>';
      return;
    }

    resultsEl.innerHTML = currentResults.map((item, idx) => `
      <div class="cmdk-item ${idx === 0 ? 'active' : ''}" data-index="${idx}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${item.icon}"></path></svg>
        <div>
          <div class="cmdk-item-title">${item.title}</div>
          <div class="cmdk-item-subtitle">Navigation</div>
        </div>
      </div>
    `).join('');

    resultsEl.querySelectorAll('.cmdk-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-index'));
        executeResult(currentResults[idx]);
      });
      el.addEventListener('mouseenter', () => {
        resultsEl.querySelectorAll('.cmdk-item').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        selectedIndex = parseInt(el.getAttribute('data-index'));
      });
    });
  }

  function executeResult(item) {
    if (!item) return;
    closeCmdK();
    // Simulate clicking the corresponding sidebar button
    const btn = document.querySelector(`.nav-item-btn[data-tab="${item.id}"]`);
    if (btn) btn.click();
  }

  window.addEventListener('keydown', (e) => {
    // Cmd+K or Ctrl+K
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      overlay.style.display === 'flex' ? closeCmdK() : openCmdK();
    }
    
    // Esc
    if (e.key === 'Escape' && overlay.style.display === 'flex') {
      closeCmdK();
    }
    
    // Navigation
    if (overlay.style.display === 'flex') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
        updateSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        updateSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeResult(currentResults[selectedIndex]);
      }
    }
  });

  function updateSelection() {
    const items = resultsEl.querySelectorAll('.cmdk-item');
    items.forEach((item, idx) => {
      if (idx === selectedIndex) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  if(input) {
    input.addEventListener('input', (e) => {
      renderResults(e.target.value);
    });
  }
});

// ── Activity Feed Logic ──
window.addActivityLog = function(action, clientName) {
  if (window.firebaseSetDoc && window.firebaseDoc && window.firebaseDb) {
    const log = {
      action: action,
      client: clientName || activeClientName,
      timestamp: Date.now()
    };
    
    // We store an array of the last 50 logs in a separate document
    const docRef = window.firebaseDoc(window.firebaseDb, "agency", "activityLog");
    
    // Read current first, then append. To prevent race conditions in a real production app we'd use arrayUnion, 
    // but for this MVP we'll just push locally and save, because we have a snapshot listener anyway.
    
    if (!window.agencyActivityLogs) window.agencyActivityLogs = [];
    window.agencyActivityLogs.unshift(log);
    if (window.agencyActivityLogs.length > 50) window.agencyActivityLogs.pop();
    
    window.firebaseSetDoc(docRef, { logs: window.agencyActivityLogs }).catch(err => console.error("Log error", err));
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // Listen to Activity Feed
  setTimeout(() => {
    if (window.firebaseOnSnapshot && window.firebaseDoc && window.firebaseDb) {
      const docRef = window.firebaseDoc(window.firebaseDb, "agency", "activityLog");
      window.firebaseOnSnapshot(docRef, (docSnap) => {
        const listEl = document.getElementById('activityFeedList');
        if (!listEl) return;
        
        if (docSnap.exists) {
          const data = docSnap.data();
          window.agencyActivityLogs = data.logs || [];
          
          if (window.agencyActivityLogs.length === 0) {
            listEl.innerHTML = '<div style="color: var(--color-text-secondary); font-size: 0.9rem;">No recent activity.</div>';
            return;
          }
          
          listEl.innerHTML = window.agencyActivityLogs.map(log => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            return `
              <div style="display: flex; gap: 12px; align-items: flex-start; padding-bottom: 12px; border-bottom: 1px solid var(--border-color);">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary); margin-top: 6px;"></div>
                <div style="flex: 1;">
                  <div style="color: var(--color-text); font-size: 0.95rem;">${log.action}</div>
                  <div style="color: var(--color-text-secondary); font-size: 0.8rem; margin-top: 4px;">
                    <span style="color: var(--color-primary);">${log.client}</span> &bull; ${timeStr}
                  </div>
                </div>
              </div>
            `;
          }).join('');
        } else {
          listEl.innerHTML = '<div style="color: var(--color-text-secondary); font-size: 0.9rem;">No recent activity.</div>';
        }
      });
    }
  }, 2000); // slight delay to wait for Firebase init
});

// Hook into critical actions
const originalCreateClient = window.createClientBlankState;
window.createClientBlankState = function(name) {
  if (window.addActivityLog) window.addActivityLog("Created new client workspace", name);
  return originalCreateClient(name);
};
