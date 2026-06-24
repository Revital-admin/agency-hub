/* ============================================================
   app.js
   Application state controller, Event Handlers & View Renderer
   ============================================================ */

// ── Firebase Configuration ──
const firebaseConfig = {
  apiKey: "AIzaSyDszpFkygCjr8ktkPe0ILxbLNHxRkb0bIY",
  authDomain: "revitalhub-895c1.firebaseapp.com",
  projectId: "revitalhub-895c1",
  storageBucket: "revitalhub-895c1.firebasestorage.app",
  messagingSenderId: "501330884945",
  appId: "1:501330884945:web:7f94e80c49036d9f2b3b70"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ── Global Variables ──
let clientsDb = {};
let activeClientName = "";
let iframeNeedsReload = {
  "tab-uxui": true,
  "tab-seo": true,
  "tab-strategy": true,
  "tab-strategybuilder": true,
  "tab-socialaudit": true,
  "tab-webcomp": true,
  "tab-socialcomp": true,
  "tab-report": true,
  "tab-copywriting": true
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
      notes: "" // local note for this task
    }))
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

  return {
    name: name,
    createdDate: today,
    targetUrl: "",
    onboardingDate: today,
    onboardingChecklist: onboarding,
    uxuiAudit: uxuiAudit,
    seoAudit: seoAudit,
    contentStrategy: contentStrategy,
    strategyBuilder: strategyBuilder,
    socialAudit: socialAudit,
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
    copywriting: {
      activeFramework: "aida",
      notes: "",
      inputs: { product: "", audience: "", benefit: "", cta: "", tone: "persuasive" },
      targetUrl: ""
    }
  };
}

// ── Local Storage Management ──
function loadDatabase() {
  const stored = localStorage.getItem("REVITAL_HUB_CLIENTS");
  if (stored) {
    try {
      clientsDb = JSON.parse(stored);
    } catch (e) {
      console.error("Error parsing localStorage database, resetting.");
      clientsDb = {};
    }
  }

  // If database is empty, seed a default client workspace
  if (Object.keys(clientsDb).length === 0) {
    const defaultName = "Nexus Productions";
    clientsDb[defaultName] = createClientBlankState(defaultName);
    saveDatabase();
  }

  // Ensure Quick Sandbox workspace is seeded
  const sandboxName = "Quick Sandbox (One-Offs)";
  if (!clientsDb[sandboxName]) {
    clientsDb[sandboxName] = createClientBlankState(sandboxName);
    saveDatabase();
  }

  // Schema migration and verification loop to protect against legacy localStorage data
  Object.keys(clientsDb).forEach(name => {
    const client = clientsDb[name];
    const blank = createClientBlankState(name);

    // Verify top-level keys
    Object.keys(blank).forEach(key => {
      if (client[key] === undefined) {
        client[key] = blank[key];
      }
    });

    // Ensure notes exist on onboarding checklist items
    if (client.onboardingChecklist && Array.isArray(client.onboardingChecklist)) {
      client.onboardingChecklist.forEach(cat => {
        if (cat.items && Array.isArray(cat.items)) {
          cat.items.forEach(item => {
            if (item.notes === undefined) {
              item.notes = "";
            }
          });
        }
      });
    }

    // Migrate or verify uxuiAudit object structure
    if (!client.uxuiAudit || Array.isArray(client.uxuiAudit) || typeof client.uxuiAudit !== 'object') {
      client.uxuiAudit = {
        checked: {},
        notes: {},
        targetUrl: ""
      };
    } else {
      if (!client.uxuiAudit.checked) client.uxuiAudit.checked = {};
      if (!client.uxuiAudit.notes) client.uxuiAudit.notes = {};
      if (client.uxuiAudit.targetUrl === undefined) client.uxuiAudit.targetUrl = "";
    }

    // Migrate or verify seoAudit object structure
    if (!client.seoAudit || Array.isArray(client.seoAudit) || typeof client.seoAudit !== 'object') {
      client.seoAudit = {
        checked: {},
        notes: {},
        targetUrl: ""
      };
    } else {
      if (!client.seoAudit.checked) client.seoAudit.checked = {};
      if (!client.seoAudit.notes) client.seoAudit.notes = {};
      if (client.seoAudit.targetUrl === undefined) client.seoAudit.targetUrl = "";
    }

    // Migrate or verify contentStrategy object structure
    if (!client.contentStrategy || Array.isArray(client.contentStrategy) || typeof client.contentStrategy !== 'object') {
      client.contentStrategy = {
        checked: {},
        notes: {},
        targetUrl: ""
      };
    } else {
      if (!client.contentStrategy.checked) client.contentStrategy.checked = {};
      if (!client.contentStrategy.notes) client.contentStrategy.notes = {};
      if (client.contentStrategy.targetUrl === undefined) client.contentStrategy.targetUrl = "";
    }

    // Migrate or verify strategyBuilder object structure
    if (!client.strategyBuilder || Array.isArray(client.strategyBuilder) || typeof client.strategyBuilder !== 'object') {
      client.strategyBuilder = {
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
    } else {
      if (!client.strategyBuilder.data) {
        client.strategyBuilder.data = {};
      }
      if (client.strategyBuilder.targetUrl === undefined) {
        client.strategyBuilder.targetUrl = "";
      }
      if (!client.strategyBuilder.data.platforms || !Array.isArray(client.strategyBuilder.data.platforms)) {
        const d = client.strategyBuilder.data;
        const legacyPlatforms = [];
        
        if (d.igPurpose !== undefined || d.igFrequency !== undefined || d.igContentTypes !== undefined) {
          legacyPlatforms.push({
            id: 'instagram',
            name: 'Instagram',
            purpose: d.igPurpose || '',
            contentTypes: Array.isArray(d.igContentTypes) ? d.igContentTypes : [],
            frequency: d.igFrequency || ''
          });
        } else {
          legacyPlatforms.push({ id: 'instagram', name: 'Instagram', purpose: '', contentTypes: [], frequency: '' });
        }

        if (d.ttPurpose !== undefined || d.ttFrequency !== undefined || d.ttContentTypes !== undefined) {
          legacyPlatforms.push({
            id: 'tiktok',
            name: 'TikTok',
            purpose: d.ttPurpose || '',
            contentTypes: Array.isArray(d.ttContentTypes) ? d.ttContentTypes : [],
            frequency: d.ttFrequency || ''
          });
        } else {
          legacyPlatforms.push({ id: 'tiktok', name: 'TikTok', purpose: '', contentTypes: [], frequency: '' });
        }

        if (d.ytPurpose !== undefined || d.ytFrequency !== undefined || d.ytContentTypes !== undefined) {
          legacyPlatforms.push({
            id: 'youtube',
            name: 'YouTube',
            purpose: d.ytPurpose || '',
            contentTypes: Array.isArray(d.ytContentTypes) ? d.ytContentTypes : [],
            frequency: d.ytFrequency || ''
          });
        } else {
          legacyPlatforms.push({ id: 'youtube', name: 'YouTube', purpose: '', contentTypes: [], frequency: '' });
        }

        if (d.liPurpose !== undefined || d.liFrequency !== undefined || d.liContentTypes !== undefined) {
          legacyPlatforms.push({
            id: 'linkedin',
            name: 'LinkedIn',
            purpose: d.liPurpose || '',
            contentTypes: Array.isArray(d.liContentTypes) ? d.liContentTypes : [],
            frequency: d.liFrequency || ''
          });
        } else {
          legacyPlatforms.push({ id: 'linkedin', name: 'LinkedIn', purpose: '', contentTypes: [], frequency: '' });
        }

        client.strategyBuilder.data.platforms = legacyPlatforms;

        const oldKeys = [
          'igPurpose', 'igFrequency', 'igContentTypes',
          'ttPurpose', 'ttFrequency', 'ttContentTypes',
          'ytPurpose', 'ytFrequency', 'ytContentTypes',
          'liPurpose', 'liFrequency', 'liContentTypes'
        ];
        oldKeys.forEach(k => { delete d[k]; });
      }
    }

    // Migrate or verify socialAudit object structure
    if (!client.socialAudit || Array.isArray(client.socialAudit) || typeof client.socialAudit !== 'object') {
      client.socialAudit = {
        checked: {},
        notes: {},
        targetUrl: ""
      };
    } else {
      if (!client.socialAudit.checked) client.socialAudit.checked = {};
      if (!client.socialAudit.notes) client.socialAudit.notes = {};
      if (client.socialAudit.targetUrl === undefined) client.socialAudit.targetUrl = "";
    }

    // Verify webComp sub-keys
    if (client.webComp && typeof client.webComp === 'object') {
      Object.keys(blank.webComp).forEach(k => {
        if (client.webComp[k] === undefined) {
          client.webComp[k] = blank.webComp[k];
        }
      });
    }

    // Verify socialComp sub-keys
    if (client.socialComp && typeof client.socialComp === 'object') {
      Object.keys(blank.socialComp).forEach(k => {
        if (client.socialComp[k] === undefined) {
          client.socialComp[k] = blank.socialComp[k];
        }
      });
    }

    // Verify report sub-keys
    if (client.report && typeof client.report === 'object') {
      Object.keys(blank.report).forEach(k => {
        if (client.report[k] === undefined) {
          client.report[k] = blank.report[k];
        }
      });
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
  saveDatabase();

  // Load last active client name
  const storedActive = localStorage.getItem("REVITAL_HUB_ACTIVE_CLIENT");
  if (storedActive && clientsDb[storedActive]) {
    activeClientName = storedActive;
  } else {
    activeClientName = Object.keys(clientsDb)[0];
    localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);
  }
}

// ── Database Management (Firebase + Local Storage) ──
let isFirestoreLoaded = false;

function loadDatabase() {
  // 1. Instant boot from LocalStorage cache
  const stored = localStorage.getItem("REVITAL_HUB_CLIENTS");
  if (stored) {
    try {
      clientsDb = JSON.parse(stored);
    } catch (e) {
      console.error("Error parsing localStorage database, resetting.");
      clientsDb = {};
    }
  }

  // Run schema migration for local cache (to render immediately)
  migrateSchemaAndDefaults();

  // Load last active client name
  const storedActive = localStorage.getItem("REVITAL_HUB_ACTIVE_CLIENT");
  if (storedActive && clientsDb[storedActive]) {
    activeClientName = storedActive;
  } else if (Object.keys(clientsDb).length > 0) {
    activeClientName = Object.keys(clientsDb)[0];
    localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);
  }

  // 2. Real-time Firebase Sync
  db.collection("hub").doc("clients").onSnapshot((doc) => {
    isFirestoreLoaded = true;
    if (doc.exists) {
      clientsDb = doc.data() || {};
      
      // Update local cache
      localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));
      
      migrateSchemaAndDefaults();
      
      // Ensure active client still exists
      if (!clientsDb[activeClientName] && Object.keys(clientsDb).length > 0) {
        activeClientName = Object.keys(clientsDb)[0];
        localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);
      }
      
      // Re-render UI now that fresh cloud data arrived
      refreshAllViews();
    } else {
      // Document doesn't exist yet, push the local state to create it
      saveDatabase();
    }
  }, (error) => {
    console.error("Error listening to Firestore:", error);
    showBanner("error", "Database connection lost. Changes saving locally.");
  });
}

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

function saveDatabase() {
  // Always update local cache first for instant feedback
  localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));
  
  // Push to Firebase
  if (db && db.collection) {
    db.collection("hub").doc("clients").set(clientsDb)
      .catch((error) => {
        console.error("Error saving to Firestore:", error);
        showBanner("error", "Failed to sync to cloud. Retrying in background.");
      });
  }
}

function getActiveClient() {
  return clientsDb[activeClientName];
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
    case "tab-strategy":
      renderContentStrategy();
      break;
    case "tab-strategybuilder":
      renderStrategyBuilder();
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

// ── View Refresh Controllers ──
function refreshAllViews() {
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

  buildClientDropdown();
  renderDashboard();
  renderOnboardingChecklist();

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
  document.getElementById("dashHeroClientName").textContent = client.name;
  document.getElementById("dashHeroTargetUrl").textContent = client.targetUrl || "No website logged yet";
  document.getElementById("dashHeroCreatedDate").textContent = client.createdDate || "N/A";

  // Calculate Onboarding completion %
  let totalOb = 0;
  let checkedOb = 0;
  client.onboardingChecklist.forEach(cat => {
    cat.items.forEach(item => {
      totalOb++;
      if (item.checked) checkedOb++;
    });
  });
  const obPct = totalOb > 0 ? Math.round((checkedOb / totalOb) * 100) : 0;
  document.getElementById("dashOnboardingVal").textContent = `${obPct}%`;

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

  // Calculate SEO checklist checked % (39 items total)
  let totalSeo = 0;
  DEFAULT_SEO_AUDIT.forEach(step => {
    totalSeo += step.subs.length;
  });
  let checkedSeo = 0;
  if (client.seoAudit && client.seoAudit.checked) {
    Object.keys(client.seoAudit.checked).forEach(k => {
      if (client.seoAudit.checked[k]) {
        checkedSeo++;
      }
    });
  }
  const seoPct = totalSeo > 0 ? Math.round((checkedSeo / totalSeo) * 100) : 0;
  document.getElementById("dashSeoVal").textContent = `${seoPct}%`;

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

  // Logged Website Competitors count
  let loggedWebComps = 0;
  client.webComp.names.forEach(name => {
    if (name && name !== "Competitor A" && name !== "Competitor B" && name !== "Competitor C" && name.trim() !== "") {
      loggedWebComps++;
    }
  });
  document.getElementById("dashWebCompetitorVal").textContent = `${loggedWebComps} / 3`;

  // Logged Social Competitors count
  let loggedSocialComps = 0;
  client.socialComp.names.forEach(name => {
    if (name && name !== "Competitor A" && name !== "Competitor B" && name !== "Competitor C" && name.trim() !== "") {
      loggedSocialComps++;
    }
  });
  document.getElementById("dashSocialCompetitorVal").textContent = `${loggedSocialComps} / 3`;

  // Calculate Copywriting Assistant stats
  let copyWords = 0;
  if (client.copywriting && client.copywriting.notes) {
    const text = client.copywriting.notes.trim();
    copyWords = text === "" ? 0 : text.split(/\s+/).length;
  }
  document.getElementById("dashCopywritingVal").textContent = `${copyWords} words`;
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
        saveDatabase();
        renderOnboardingChecklist();
        renderDashboard();
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
    const rawSrc = iframe.getAttribute('src') || relativeFallbackPath;
    iframe.src = new URL(rawSrc, window.location.href).href;
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

// ── Content Strategy Guide Controller ──
function renderContentStrategy() {
  setIframeAbsoluteSrc('#tab-strategy iframe', "content-strategy-guide/index.html");
}

// ── Content Strategy Builder Controller ──
function renderStrategyBuilder() {
  setIframeAbsoluteSrc('#tab-strategybuilder iframe', "content-strategy-builder/index.html");
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
          notes: ""
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
          notes: ""
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
document.addEventListener("DOMContentLoaded", () => {
  initTabNavigation();
  initMobileNavigation();
  initParentEventListeners();
  refreshAllViews();

  // Reset Sandbox Button listener
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
});

// Run database load immediately to populate state before child iframes execute their scripts
loadDatabase();
