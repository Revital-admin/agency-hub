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

try {
  if (typeof firebase.appCheck === 'function') {
    const appCheck = firebase.appCheck();
    appCheck.activate(
      '6Leh2TItAAAAAIWxkC1Z93flfDJanjWKgkwT1Dvm',
      true // isTokenAutoRefreshEnabled
    );
  }
} catch (e) {
  console.warn("Firebase AppCheck could not be initialized. It may be blocked by your browser extensions.", e);
}

const db = firebase.firestore();

// ── Auth & Identity ──
let currentUserEmail = null;
let isAdmin = false;
let globalAdmins = [];

async function checkIdentity() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('dev') === 'admin') {
    currentUserEmail = "dev_bypass_admin";
    isAdmin = true;
    console.log("Developer Admin Bypass Active");
    updateAdminUI();
    updateUserProfile();
    return;
  }
  try {
    const response = await fetch('/cdn-cgi/access/get-identity');
    if (response.ok) {
      const data = await response.json();
      if (data && data.email) {
        currentUserEmail = data.email.toLowerCase();
        verifyAdminStatus();
      }
    }
    updateUserProfile();
  } catch (error) {
    console.log("Running locally or Cloudflare identity unavailable.");
  }
}

function verifyAdminStatus() {
  if (currentUserEmail && globalAdmins.includes(currentUserEmail)) {
    isAdmin = true;
  } else {
    isAdmin = false;
  }
  updateAdminUI();
}

function updateAdminUI() {
  const adminBtn = document.getElementById("adminSettingsBtn");
  if (adminBtn) adminBtn.style.display = isAdmin ? 'inline-block' : 'none';
  
  const addQuickLinkBtn = document.getElementById("addQuickLinkBtn");
  if (addQuickLinkBtn) addQuickLinkBtn.style.display = isAdmin ? 'flex' : 'none';

  if (typeof window.renderLinks === 'function') {
    window.renderLinks();
  }
}

// ── Admin Modal Functions ──
function openAdminSettings() {
  document.getElementById("adminModal").style.display = "flex";
  renderAdminList();
}
function closeAdminSettings() {
  document.getElementById("adminModal").style.display = "none";
}
function renderAdminList() {
  const listEl = document.getElementById("adminEmailsList");
  if (!listEl) return;
  listEl.innerHTML = "";
  globalAdmins.forEach(email => {
    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.padding = "8px 0";
    li.style.borderBottom = "1px solid var(--color-border)";
    
    const isMaster = email === "admin@revitalproductions.com";
    li.innerHTML = `
      <span style="font-size: 14px; color: var(--color-text);">${email} ${isMaster ? '<span style="color:#6b7280; font-size:12px;">(Master)</span>' : ''}</span>
      ${!isMaster ? `<button onclick="removeAdminEmail('${email}')" style="background:none; border:none; color:#f87171; cursor:pointer;">Remove</button>` : '<span></span>'}
    `;
    listEl.appendChild(li);
  });
}
window.addAdminEmail = function() {
  const input = document.getElementById("newAdminEmail");
  const email = input.value.trim().toLowerCase();
  if (!email || !email.includes("@")) return alert("Enter a valid email.");
  if (globalAdmins.includes(email)) return alert("Already an admin.");
  globalAdmins.push(email);
  saveAdminsToFirebase();
  input.value = "";
}
window.removeAdminEmail = function(email) {
  if (email === "admin@revitalproductions.com") return;
  if (!confirm(`Remove ${email} from admins?`)) return;
  globalAdmins = globalAdmins.filter(e => e !== email);
  saveAdminsToFirebase();
}

// ── Theme & User Profile ──



function updateUserProfile() {
  const avatarEl = document.getElementById('userAvatar');
  const emailEl = document.getElementById('userEmail');
  if (!avatarEl || !emailEl) return;
  
  if (currentUserEmail) {
    emailEl.textContent = currentUserEmail;
    avatarEl.textContent = currentUserEmail.charAt(0).toUpperCase();
  } else {
    emailEl.textContent = "Guest";
    avatarEl.textContent = "?";
  }
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

function saveAdminsToFirebase() {
  if (db && db.collection) {
    db.collection("hub").doc("settings").set({ admins: globalAdmins })
      .then(() => renderAdminList())
      .catch(err => console.error(err));
  }
}


// ── Global Variables ──
let clientsDb = {};
let activeClientName = "";
let iframeNeedsReload = {
  "tab-uxui": true,
  "tab-seo": true,
  "tab-strategy": true,
  "tab-strategybuilder": true,
  "tab-personalbrand": true,
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
      primaryColor: "#10b981",
      secondaryColor: "#6366f1",
      magicToken: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    }
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

  try {
    buildClientDropdown();
  } catch(e) { document.getElementById("dashHeroClientName").textContent = "Error in buildClientDropdown: " + e.message; }
  
  try {
    renderDashboard();
  } catch(e) { document.getElementById("dashHeroClientName").textContent = "Error in renderDashboard: " + e.message; }
  
  try {
    renderOnboardingChecklist();
  } catch(e) { document.getElementById("dashHeroClientName").textContent = "Error in renderOnboardingChecklist: " + e.message; }
  
  try {
    renderBrandVault();
  } catch(e) { document.getElementById("dashHeroClientName").textContent = "Error in renderBrandVault: " + e.message; }

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
  client.onboardingChecklist.forEach(cat => {
    cat.items.forEach(item => {
      totalOb++;
      if (item.checked) checkedOb++;
    });
  });
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
    
    // Simplistic check: count all string properties that are not empty
    const countFields = (obj) => {
      if (typeof obj === 'string') {
        totalPbFields++;
        if (obj.trim() !== '') filledPbFields++;
      } else if (Array.isArray(obj)) {
        totalPbFields++;
        if (obj.length > 0) filledPbFields++;
      } else if (typeof obj === 'object' && obj !== null) {
        Object.values(obj).forEach(countFields);
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
    const rawSrc = iframe.getAttribute('src') || relativeFallbackPath;
    const newSrc = new URL(rawSrc, window.location.href).href;
    if (iframe.src !== newSrc) {
      iframe.src = newSrc;
    }
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
        if (userEmailEl) userEmailEl.textContent = data.email;
        if (userAvatarEl) {
          userAvatarEl.textContent = data.email.charAt(0).toUpperCase();
        }
      }
    })
    .catch(err => console.log('Running locally or no Cloudflare Access headers present.', err));
}

document.addEventListener("DOMContentLoaded", () => {
  fetchCloudflareProfile();
  try { initTabNavigation(); } catch(e) { console.error("TabNav Error:", e); }
  try { initMobileNavigation(); } catch(e) { console.error("MobileNav Error:", e); }
  try { initParentEventListeners(); } catch(e) { console.error("ParentListeners Error:", e); }
  try { initQuickLinks(); } catch(e) { console.error("QuickLinks Error:", e); }
  try { refreshAllViews(); } catch(e) { console.error("Refresh Error:", e); }

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


// ── Team Quick Links Logic ──
function initQuickLinks() {
  const defaultLinks = [
    { id: 'sop', name: 'Master SOP Index', url: '', icon: '📋' },
    { id: 'drive', name: 'Google Drive', url: '', icon: '📁' },
    { id: 'intake', name: 'Client Intake Form', url: '', icon: '📝' },
    { id: 'handoff', name: 'Onboarding Handoff', url: '', icon: '🔄' },
    { id: 'tracker', name: 'Shared Links Tracker', url: '', icon: '🔗' }
  ];
  
  let savedLinks = defaultLinks;
  
  // Try local first for instant paint
  try {
    const saved = localStorage.getItem('revital-team-links-array');
    if (saved) {
      savedLinks = JSON.parse(saved);
      if (!Array.isArray(savedLinks)) savedLinks = defaultLinks;
    }
  } catch(e) {}

  // Function to save to both LocalStorage and Firebase
  function saveQuickLinks() {
    localStorage.setItem('revital-team-links-array', JSON.stringify(savedLinks));
    if (db && db.collection) {
      db.collection("hub").doc("quickLinks").set({ links: savedLinks })
        .catch(err => console.error("Error saving Quick Links to Firebase:", err));
    }
  }

  // Subscribe to Firebase changes
  if (db && db.collection) {
    db.collection("hub").doc("quickLinks").onSnapshot((doc) => {
      if (doc.exists) {
        const data = doc.data();
        if (data && Array.isArray(data.links)) {
          savedLinks = data.links;
          localStorage.setItem('revital-team-links-array', JSON.stringify(savedLinks));
          if (typeof renderLinks === 'function') {
            renderLinks();
          }
        }
      } else {
        // If it doesn't exist on firebase yet, upload our defaults
        saveQuickLinks();
      }
    });
  }

  const listEl = document.getElementById('dynamicQuickLinksList');
  const addBtn = document.getElementById('addQuickLinkBtn');
  const inlineForm = document.getElementById('inlineAddLinkForm');
  const nameInput = document.getElementById('newLinkName');
  const urlInput = document.getElementById('newLinkUrl');
  const saveBtn = document.getElementById('saveNewLinkBtn');
  const cancelBtn = document.getElementById('cancelNewLinkBtn');

  window.renderLinks = function renderLinks() {
    listEl.innerHTML = '';
    savedLinks.forEach((link, index) => {
      const li = document.createElement('li');
      li.className = 'quick-link-li';
      li.style.position = 'relative';
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.justifyContent = 'space-between';
      li.style.marginBottom = '8px';
      
      const isMissingUrl = !link.url || link.url.trim() === '';
      const hrefAttr = isMissingUrl ? '#' : link.url;
      const targetAttr = isMissingUrl ? '' : 'target="_blank"';
      const opacity = isMissingUrl ? '0.5' : '1';

      li.innerHTML = `
        <a href="${hrefAttr}" ${targetAttr} class="quick-link-item" style="opacity: ${opacity}; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color 0.2s;">
          <span class="icon">${link.icon || '🔗'}</span> ${link.name}
        </a>
        <div class="quick-link-actions" style="display: ${isAdmin ? 'flex' : 'none'}; gap: 4px; opacity: 0; transition: opacity 0.2s;">
          <button class="edit-ql-btn" data-index="${index}" style="background: none; border: none; color: var(--color-text-secondary); cursor: pointer; padding: 2px;" title="Edit">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path></svg>
          </button>
          <button class="del-ql-btn" data-index="${index}" style="background: none; border: none; color: #f87171; cursor: pointer; padding: 2px;" title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;

      li.addEventListener('mouseenter', () => li.querySelector('.quick-link-actions').style.opacity = '1');
      li.addEventListener('mouseleave', () => li.querySelector('.quick-link-actions').style.opacity = '0');

      if (isMissingUrl) {
        li.querySelector('a').addEventListener('click', (e) => {
          e.preventDefault();
          const newUrl = prompt(`Enter the URL for ${link.name}:`, '');
          if (newUrl !== null) {
            savedLinks[index].url = newUrl.trim();
            saveQuickLinks();
            renderLinks();
          }
        });
      }

      listEl.appendChild(li);
    });

    document.querySelectorAll('.del-ql-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = e.currentTarget.getAttribute('data-index');
        if (confirm(`Remove "${savedLinks[idx].name}"?`)) {
          savedLinks.splice(idx, 1);
          saveQuickLinks();
          renderLinks();
        }
      });
    });

    document.querySelectorAll('.edit-ql-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = e.currentTarget.getAttribute('data-index');
        const link = savedLinks[idx];
        const newName = prompt('Edit Link Name:', link.name);
        if (newName === null) return;
        const newUrl = prompt('Edit URL (include https://):', link.url || '');
        if (newUrl === null) return;

        savedLinks[idx].name = newName.trim() || 'Unnamed Link';
        savedLinks[idx].url = newUrl.trim();
        saveQuickLinks();
        renderLinks();
      });
    });
  }

  if (addBtn && inlineForm) {
    addBtn.addEventListener('click', () => {
      addBtn.style.display = 'none';
      inlineForm.style.display = 'flex';
      nameInput.value = '';
      urlInput.value = '';
      nameInput.focus();
    });

    cancelBtn.addEventListener('click', () => {
      inlineForm.style.display = 'none';
      addBtn.style.display = isAdmin ? 'flex' : 'none';
    });

    saveBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();
      if (!name) { alert('Please enter a name.'); return; }
      
      savedLinks.push({
        id: 'custom_' + Date.now(),
        name: name,
        url: url,
        icon: '🔗'
      });
      saveQuickLinks();
      
      inlineForm.style.display = 'none';
      addBtn.style.display = isAdmin ? 'flex' : 'none';
      renderLinks();
    });
  }

  renderLinks();
}


// ── Firebase Cloud Sync ──
let isInitialLoad = true;

function saveDatabase() {
  // 1. Save locally as fallback
  localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));
  
  // 2. Trigger Autosave UI indicator
  const indicator = document.getElementById("autosaveIndicator");
  if (indicator) {
    indicator.innerHTML = "Syncing... 🔄";
    indicator.style.opacity = "1";
  }

  // 3. Save to Firebase
  if (window.firebaseSetDoc && window.firebaseDoc && window.firebaseDb) {
    const docRef = window.firebaseDoc(window.firebaseDb, "agency", "clientsDb");
    // Parse/stringify to clean iframe prototypes so Firebase doesn't crash on "custom Object"
    const cleanDb = JSON.parse(JSON.stringify(clientsDb));
    window.firebaseSetDoc(docRef, cleanDb).then(() => {
      if (indicator) {
        indicator.innerHTML = "Saved to Cloud ✅";
        setTimeout(() => { indicator.style.opacity = "0"; }, 2000);
      }
    }).catch(err => {
      console.error("Firebase save failed:", err);
      if (indicator) {
        indicator.innerHTML = "Cloud Error ❌";
        setTimeout(() => { indicator.style.opacity = "0"; }, 3000);
      }
    });
  }
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

  // 2. Setup Firebase real-time listener
  if (window.firebaseOnSnapshot && window.firebaseDoc && window.firebaseDb) {
    const docRef = window.firebaseDoc(window.firebaseDb, "agency", "clientsDb");
    window.firebaseOnSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const cloudData = docSnap.data();
        
        const cloudStr = JSON.stringify(cloudData);
        const localStr = JSON.stringify(clientsDb);
        
        if (cloudStr !== localStr) {
          clientsDb = cloudData;
          localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));
          
          if (!clientsDb[activeClientName]) {
            activeClientName = Object.keys(clientsDb)[0] || "";
          }
          
          buildClientDropdown();
          refreshAllViews();
          renderDashboard();
        }
      } else {
        // Doc doesn't exist yet, we push our local DB to seed it
        saveDatabase();
      }
    });
  } else {
    // No firebase, just render
    buildClientDropdown();
    refreshAllViews();
    renderDashboard();
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
        
        if (docSnap.exists()) {
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
