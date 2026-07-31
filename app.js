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
      window.currentAdminEmail = user.email.toLowerCase();
      recordLastSeen(window.currentAdminEmail);
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

// Records a lightweight "last seen in the Hub" timestamp per teammate,
// in agency/teamActivity: { users: { "email": { lastSeen: isoString } } }.
// Written with merge:true so each login only touches that one person's
// key rather than overwriting everyone else's last-seen data at once.
// Purely informational (shown in Team Access Manager) - never gates access.
// Every agency-wide Firestore doc referenced anywhere in the Hub, outside
// of clientsDb's own (sharded) storage - kept as an explicit list rather
// than discovered dynamically since Firestore has no "list all docs in a
// collection" from client-side security rules here. Add new tools' agency
// docs to this list so Export Full Backup actually captures them.
const AGENCY_BACKUP_DOC_NAMES = [
  "accessLoginLog", "activityLog", "adAccountLog", "adminActivityLog",
  "adminNotifications", "callSheets", "changeOrders",
  // "contractInvoiceLog" removed - it was never a real doc anything writes
  // to (see agency-health-dashboard/js/app.js fix, same date); the actual
  // one every tool reads/writes is "contractInvoices" below.
  "contractInvoices", "emailTemplates", "proposalFollowUps", "rawFootageLog",
  "referrals", "releaseForms", "revisionFeedbackLog", "runOfShow",
  "servicePricing", "sops", "subscriptionTracker", "teamAccess",
  "teamActivity", "teamRoster", "vendorRentalTracker", "venueTechSpecs"
];

async function fetchAllAgencyDocsForBackup() {
  const result = {};
  if (!window.firebaseDb || !window.firebaseDb.collection) return result;

  await Promise.all(AGENCY_BACKUP_DOC_NAMES.map(async (docName) => {
    try {
      const snap = await window.firebaseDb.collection("agency").doc(docName).get();
      if (snap.exists) result[docName] = snap.data();
    } catch (e) {
      console.warn(`Could not read agency/${docName} for backup:`, e);
    }
  }));

  return result;
}

// Agency-wide "who did what and when" log, lives in agency/adminActivityLog
// as { list: [...] } - same flat-doc pattern as adminNotifications, but
// re-reads the doc fresh on every call instead of keeping an in-memory
// copy, since (unlike the notification bell) nothing in the parent Hub
// renders this list - it's only viewed from the separate Activity Log
// tool - so there's no local state to keep in sync, and re-reading avoids
// clobbering entries logged from another open tab/session in between
// calls. Callable from any iframe tool via window.parent.logAdminActivity.
async function logAdminActivity(action, details) {
  if (!window.firebaseDb || !window.firebaseDb.collection) return;
  try {
    const ref = window.firebaseDb.collection("agency").doc("adminActivityLog");
    const snap = await ref.get();
    const list = (snap.exists && snap.data().list) || [];
    list.unshift({
      id: 'act_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      action: action,
      details: details || "",
      by: window.currentAdminEmail || "unknown",
      createdAt: new Date().toISOString()
    });
    if (list.length > 300) list.length = 300;
    await ref.set({ list: list });
  } catch (e) {
    console.warn("Could not log admin activity:", e);
  }
}

function recordLastSeen(email) {
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseSetDoc || !email) return;
  try {
    const ref = window.firebaseDoc(window.firebaseDb, "agency", "teamActivity");
    window.firebaseSetDoc(ref, { users: { [email]: { lastSeen: new Date().toISOString() } } }, { merge: true })
      .catch(err => console.warn("Couldn't record last-seen:", err));
  } catch (e) {
    console.warn("Couldn't record last-seen:", e);
  }
}

// ── Team Access restrictions (sidebar-level) ──
// By default every @revitalproductions.com Google account gets full
// access to every section of the Hub - unchanged from before. The
// Team Access panel (tab-teamaccess) lets Ronald optionally restrict
// specific teammates to only certain sections; anyone not explicitly
// listed in agency/teamAccess keeps full access. This only hides
// sidebar sections client-side - it is not a data-security boundary,
// by design (see Team Access panel copy), so it's meant for trusted
// internal teammates rather than outside parties.
function applyTeamAccessRestrictions(allowedSections) {
  const navSections = document.querySelectorAll('.nav-section[data-section]');
  let activeItemHidden = false;

  navSections.forEach(sectionEl => {
    const key = sectionEl.getAttribute('data-section');
    const allowed = !allowedSections || allowedSections.indexOf(key) !== -1;
    sectionEl.style.display = allowed ? '' : 'none';
    if (!allowed && sectionEl.querySelector('.nav-item-btn.active')) {
      activeItemHidden = true;
    }
  });

  // The Team Access panel itself is only for full-access (unrestricted)
  // accounts - a restricted teammate should never see the tool that
  // controls everyone's restrictions. It lives in the sidebar footer
  // (with Export/Import/Delete), not inside a nav-section, so hide the
  // button directly rather than looking for a wrapping <li>.
  const teamAccessBtn = document.getElementById('teamAccessFooterBtn');
  if (teamAccessBtn) {
    teamAccessBtn.style.display = allowedSections ? 'none' : '';
  }

  // Service Pricing Admin controls default pricing for every proposal -
  // same admin/leadership-only visibility rule as Team Access above, and
  // lives right next to it in the footer for the same reason (only
  // full-access/unrestricted accounts see either one). Export All Data /
  // Import Backups / Delete Client stay visible to everyone, unchanged.
  const servicePricingBtn = document.getElementById('servicePricingFooterBtn');
  if (servicePricingBtn) {
    servicePricingBtn.style.display = allowedSections ? 'none' : '';
  }

  // Subscription & Tool Cost Tracker is financial info too - same
  // admin/leadership-only footer gating as Team Access and Service
  // Pricing Admin right next to it.
  const subscriptionTrackerBtn = document.getElementById('subscriptionTrackerFooterBtn');
  if (subscriptionTrackerBtn) {
    subscriptionTrackerBtn.style.display = allowedSections ? 'none' : '';
  }

  // Activity Log shows who did what across every client - same
  // admin/leadership-only gating as the rest of the footer tools.
  const activityLogBtn = document.getElementById('activityLogFooterBtn');
  if (activityLogBtn) {
    activityLogBtn.style.display = allowedSections ? 'none' : '';
  }

  // If restrictions just hid whatever tab the user was looking at,
  // land them on the first tab they're still allowed to see instead
  // of leaving them on a now-hidden section.
  if (allowedSections && activeItemHidden) {
    const firstVisibleBtn = document.querySelector('.nav-section[data-section]:not([style*="display: none"]) .nav-item-btn');
    if (firstVisibleBtn) firstVisibleBtn.click();
  }
}

function initTeamAccessGate() {
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseOnSnapshot) return;
  const ref = window.firebaseDoc(window.firebaseDb, "agency", "teamAccess");
  window.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap.exists ? docSnap.data() : null;
    const users = (data && data.users) ? data.users : {};
    const email = (window.currentAdminEmail || "").toLowerCase();
    const allowedSections = Object.prototype.hasOwnProperty.call(users, email) ? users[email] : null;
    applyTeamAccessRestrictions(allowedSections);
  }, (err) => {
    console.error("Team access gate listener error:", err);
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
  try { initSidebarFooterToggle(); } catch(e) { console.error("SidebarFooterToggle Error:", e); }
  try { initMobileNavigation(); } catch(e) { console.error("MobileNav Error:", e); }
  try { initParentEventListeners(); } catch(e) { console.error("ParentListeners Error:", e); }
  try { initAdminNotifBell(); } catch(e) { console.error("AdminNotifBell Error:", e); }
  try { loadAdminNotifications(); } catch(e) { console.error("AdminNotifications Error:", e); }
  try { initTeamAccessGate(); } catch(e) { console.error("TeamAccessGate Error:", e); }
  try { refreshAllViews(); } catch(e) { console.error("Refresh Error:", e); }
  // Overview Dashboard (tab-dashboard) is active by default at boot, so
  // no tab-click fires to trigger this the way it does for every other
  // tab - needs its own explicit first call here.
  renderSalesPipelineValue().catch(e => console.error("SalesPipelineValue Error:", e));
  renderWhosOutToday().catch(e => console.error("WhosOutToday Error:", e));

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
  "tab-teamaccess": true,
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
  "tab-meetingnotes": true,
  "tab-reportarchive": true,
  "tab-brandassetkit": true,
  "tab-budgetpacing": true,
  // These two were never even added to this map, on top of never getting
  // a switch-case/render function below - so unlike the pair above (which
  // at least got flagged true and then silently no-op'd), these hardcoded-
  // src iframes never got touched by the reload system in any way, not
  // even a wasted attempt. Found via a static-analysis pass cross-
  // referencing every tool folder against its wiring in this file - see
  // the same pass's summary for the other 4 already-flagged-but-unwired
  // tabs fixed alongside these two.
  "tab-brandguidelines": true,
  "tab-moodboard": true,

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
  "tab-timeline": true,
  "tab-roiprojector": true,
  "tab-sopwiki": true,
  "tab-proposal": true,
  "tab-servicepricing": true,
  "tab-redflag": true,
  "tab-healthdashboard": true,
  "tab-changeorder": true,
  "tab-qbr": true,
  "tab-casestudy": true,
  "tab-portfolioshowcase": true,
  "tab-emailtemplates": true,
  "tab-subscriptiontracker": true,
  "tab-activitylog": true,
  "tab-teamroster": true,
  "tab-hourslog": true,
  "tab-testimonialtracker": true,
  "tab-intakequalifier": true,
  "tab-discoverycall": true,
  "tab-packagerecommend": true,
  "tab-followuptracker": true,
  "tab-coldoutreach": true,
  "tab-contractinvoice": true,
  "tab-referraltracker": true,
  "tab-renewaltracker": true,
  "tab-offboarding": true,
  "tab-qc": true,
  "tab-weeklycheckin": true,
  "tab-accesslog": true,
  "tab-adaccountlog": true,
  "tab-revisionfeedback": true,
  "tab-callsheet": true,
  "tab-rawfootage": true,
  "tab-releaseforms": true,
  "tab-runofshow": true,
  "tab-venuespecs": true,
  "tab-vendorrental": true
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
  logAdminActivity("Client created", name);
  generateNewClientOnboardingEmails(clientsDb[name], name).catch(e => console.warn("Could not draft onboarding emails:", e));
}

function renameActiveClient() {
  const sandboxName = "Quick Sandbox (One-Offs)";
  if (activeClientName === sandboxName) {
    showBanner("error", "Cannot rename the Quick Sandbox workspace.");
    return;
  }
  if (!activeClientName || !clientsDb[activeClientName]) {
    showBanner("error", "No active client workspace to rename.");
    return;
  }

  const oldName = activeClientName;
  const newNameInput = prompt(`Rename "${oldName}" to:`, oldName);
  if (!newNameInput) return;
  const newName = newNameInput.trim();
  if (newName === "" || newName === oldName) return;

  if (clientsDb[newName]) {
    showBanner("error", `A client workspace named "${newName}" already exists.`);
    return;
  }

  // Move the client's full state to the new key and update its internal
  // `name` field to match (kept in sync since createClientBlankState()
  // stores name on the object itself). Client portal links are unaffected
  // - the portal resolves clients by a separate Firestore token, not by
  // this name/key, so nothing on the client-facing side breaks.
  const clientState = clientsDb[oldName];
  clientState.name = newName;
  clientsDb[newName] = clientState;
  delete clientsDb[oldName];

  activeClientName = newName;
  localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);

  saveDatabase();
  buildClientDropdown();
  refreshAllViews();
  showBanner("success", `Renamed "${oldName}" to "${newName}".`);
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

  const deletedName = activeClientName;
  delete clientsDb[activeClientName];
  saveDatabase();

  // Switch to first remaining client
  activeClientName = Object.keys(clientsDb)[0];
  localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);

  buildClientDropdown();
  refreshAllViews();
  showBanner("success", "Client profile removed.");
  logAdminActivity("Client deleted", deletedName);
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

  // Native tooltip fallback so the full name is always reachable even when
  // the styled dropdown truncates a long client name with an ellipsis.
  select.title = activeClientName;
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
    case "tab-teamaccess":
      renderTeamAccess();
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
    case "tab-timeline":
      renderTimelineScheduler();
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
    case "tab-coldoutreach":
      renderColdOutreachSequencer();
      break;
    case "tab-roiprojector":
      renderRoiProjector();
      break;
    case "tab-contractinvoice":
      renderContractInvoiceTracker();
      break;
    case "tab-referraltracker":
      renderReferralTracker();
      break;
    case "tab-renewaltracker":
      renderRenewalTracker();
      break;
    case "tab-offboarding":
      renderOffboardingChecklistTab();
      break;
    case "tab-qc":
      renderQcChecklistTab();
      break;
    case "tab-weeklycheckin":
      renderWeeklyCheckinTab();
      break;
    case "tab-accesslog":
      renderAccessLoginLogTab();
      break;
    case "tab-adaccountlog":
      renderAdAccountLogTab();
      break;
    case "tab-revisionfeedback":
      renderRevisionFeedbackTab();
      break;
    case "tab-callsheet":
      renderCallSheetTab();
      break;
    case "tab-rawfootage":
      renderRawFootageTab();
      break;
    case "tab-releaseforms":
      renderReleaseFormsTab();
      break;
    case "tab-runofshow":
      renderRunOfShowTab();
      break;
    case "tab-venuespecs":
      renderVenueTechSpecsTab();
      break;
    case "tab-vendorrental":
      renderVendorRentalTab();
      break;
    case "tab-sopwiki":
      renderSopWiki();
      break;
    case "tab-proposal":
      renderProposalCalculator();
      break;
    case "tab-servicepricing":
      renderServicePricingAdmin();
      break;
    case "tab-redflag":
      renderRedFlagChecklist();
      break;
    case "tab-healthdashboard":
      renderHealthDashboard();
      break;
    case "tab-changeorder":
      renderChangeOrderGenerator();
      break;
    case "tab-qbr":
      renderQbrGenerator();
      break;
    case "tab-casestudy":
      renderCaseStudyBuilder();
      break;
    case "tab-portfolioshowcase":
      renderPortfolioShowcase();
      break;
    case "tab-emailtemplates":
      renderEmailTemplateLibrary();
      break;
    case "tab-subscriptiontracker":
      renderSubscriptionTracker();
      break;
    case "tab-activitylog":
      renderActivityLogTab();
      break;
    case "tab-teamroster":
      renderTeamRoster();
      break;
    case "tab-hourslog":
      renderHoursLog();
      break;
    case "tab-testimonialtracker":
      renderTestimonialTracker();
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
    // Found via a static-analysis pass: these 6 had a hardcoded iframe
    // src baked directly into index.html and were never wired into this
    // switch statement at all, so switching client workspaces never
    // refreshed them - same bug class (and same fix) as the batch this
    // file's iframeNeedsReload comment already documents fixing earlier.
    // brandguidelines/moodboard weren't even in the iframeNeedsReload map
    // above; the other 4 were flagged true but had no case here, so
    // refreshIframeTab() silently did nothing for them.
    case "tab-brandassetkit":
      renderBrandAssetKit();
      break;
    case "tab-brandguidelines":
      renderBrandGuidelines();
      break;
    case "tab-budgetpacing":
      renderBudgetPacing();
      break;
    case "tab-meetingnotes":
      renderMeetingNotes();
      break;
    case "tab-moodboard":
      renderMoodBoard();
      break;
    case "tab-reportarchive":
      renderReportArchive();
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

      // Same idea for the Admin panel (Team Access, Service Pricing,
      // Subscription Tracker, Activity Log) - it's a separate collapsible
      // block, not a .nav-section, since it's exempt from the section-
      // level Team Access restriction logic (see applyTeamAccessRestrictions).
      const parentFooter = btn.closest(".sidebar-footer");
      if (parentFooter && parentFooter.classList.contains("collapsed")) {
        parentFooter.classList.remove("collapsed");
        const footerToggleBtn = parentFooter.querySelector(".sidebar-footer-toggle");
        if (footerToggleBtn) footerToggleBtn.setAttribute("aria-expanded", "true");
        saveSidebarFooterCollapsed(false);
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
      // Refreshed on open rather than on every clientsDb change (like
      // renderDashboard/renderOnboardingChecklist above) - it reads an
      // extra doc (contractInvoices) for renewal dates, and My Clients
      // isn't the active-client view those others are, so there's no
      // reason to pay that cost on every save across the whole Hub.
      if (targetTab === "tab-myclients") {
        renderMyClients().catch(e => console.error("Error in renderMyClients:", e));
      }
      // Same reasoning as My Clients above - reads contractInvoices too,
      // agency-wide rather than active-client, so refreshed on open
      // rather than on every save.
      if (targetTab === "tab-dashboard") {
        renderSalesPipelineValue().catch(e => console.error("Error in renderSalesPipelineValue:", e));
        renderWhosOutToday().catch(e => console.error("Error in renderWhosOutToday:", e));
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

// ── Collapsible Admin Panel (sidebar footer) ──
// Same pattern as the nav sections above, but tracked separately since
// the Admin panel isn't a .nav-section (it's deliberately exempt from
// applyTeamAccessRestrictions' section-hiding loop - see that function's
// comments - so reusing .nav-section here would risk hiding Export/
// Import/Delete Client for restricted teammates, which must always stay
// visible to everyone).
const SIDEBAR_FOOTER_COLLAPSED_KEY = "REVITAL_HUB_ADMIN_PANEL_COLLAPSED";

function getSidebarFooterCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_FOOTER_COLLAPSED_KEY) === "true";
  } catch (e) {
    return false;
  }
}

function saveSidebarFooterCollapsed(isCollapsed) {
  try {
    localStorage.setItem(SIDEBAR_FOOTER_COLLAPSED_KEY, isCollapsed ? "true" : "false");
  } catch (e) {}
}

function initSidebarFooterToggle() {
  const footer = document.getElementById("sidebarFooterSection");
  const toggleBtn = document.getElementById("sidebarFooterToggle");
  if (!footer || !toggleBtn) return;

  // Don't collapse it if the user is currently on one of its own tabs
  // (Team Access, Service Pricing, Subscription Tracker, Activity Log),
  // same reasoning as the nav sections - never hide where they already are.
  const activeBtn = document.querySelector(".nav-item-btn.active");
  const activeIsInFooter = !!(activeBtn && activeBtn.closest(".sidebar-footer"));

  if (getSidebarFooterCollapsed() && !activeIsInFooter) {
    footer.classList.add("collapsed");
    toggleBtn.setAttribute("aria-expanded", "false");
  }

  toggleBtn.addEventListener("click", () => {
    const isCollapsed = footer.classList.toggle("collapsed");
    toggleBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    saveSidebarFooterCollapsed(isCollapsed);
  });
}

// ── View Refresh Controllers ──
function refreshAllViews() {
  // Keep one live listener per client with a magic link so client-driven
  // checklist changes reach the agency side immediately, not just as a
  // side effect of the admin happening to save something.
  try { ensureClientPortalListeners(); } catch (e) {}
  try { runStaleClientNudgeCheck(); } catch (e) {}
  runRenewalNudgeCheck().catch(e => console.error("Error in runRenewalNudgeCheck:", e));

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

// Generic HTML-escaping helper for core-level innerHTML templates (My
// Clients, the command palette, etc.) - root app.js didn't have one of
// its own before (every tool file has its own local copy; this is that
// same pattern's first use directly in the core).
function escapeHtmlCore(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ── Dashboard Overview Renderer ──

// "My Clients" - a filtered, cross-client view for whoever's logged in,
// instead of paging through the workspace switcher one client at a time.
// Matches clientsDb entries against window.currentAdminEmail via the same
// portalConfig.accountManagerEmail field Team Roster & Capacity's live
// caseload and Client Portal Manager's capacity warning already use (see
// getAccountManagerCapacitySnapshot) - no new data to maintain, just
// another view onto it. Lives directly in the core (like Overview
// Dashboard) rather than as an iframe tool, since it needs to scan every
// client in clientsDb at once, not just the active one.
//
// Renewal date isn't on the client object itself - it lives in Contract &
// Invoice Tracker's own agency/contractInvoices doc (see that tool's
// header comment for why it's kept separate from clientsDb). Read fresh
// each time this view opens rather than kept as a live listener, since
// it's just informational context here, not something this view edits.
async function fetchContractRenewalsByClientName() {
  const byName = {};
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseGetDoc) return byName;
  try {
    const ref = window.firebaseDoc(window.firebaseDb, "agency", "contractInvoices");
    const snap = await window.firebaseGetDoc(ref);
    const list = (snap.exists && snap.data().list) || [];
    list.forEach(r => {
      if (r.clientName && r.contractStatus === "Signed" && r.contractRenewalDate) {
        byName[r.clientName] = r.contractRenewalDate;
      }
    });
  } catch (e) {
    console.warn("Couldn't load contract renewal dates for My Clients:", e);
  }
  return byName;
}

// Returns the set of client names with a signed (active) contract in
// Contract & Invoice Tracker's agency/contractInvoices - used below to
// exclude already-signed clients from Sales Pipeline Value, since a
// proposal only counts as open pipeline if the deal hasn't closed yet.
// Separate read from fetchContractRenewalsByClientName even though it's
// the same doc - they're used independently and neither is hot-path
// enough that combining them into one fetch is worth the coupling.
async function fetchSignedClientNameSet() {
  const signed = new Set();
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseGetDoc) return signed;
  try {
    const ref = window.firebaseDoc(window.firebaseDb, "agency", "contractInvoices");
    const snap = await window.firebaseGetDoc(ref);
    const list = (snap.exists && snap.data().list) || [];
    list.forEach(r => { if (r.clientName && r.contractStatus === "Signed") signed.add(r.clientName); });
  } catch (e) {
    console.warn("Couldn't load signed-client list for Sales Pipeline Value:", e);
  }
  return signed;
}

// Agency-wide (unlike every other Overview Dashboard card, which is
// scoped to the active client): sums Proposal Calculator's
// computedMonthly across every client that isn't yet a signed contract.
// There was previously no way to see total open-proposal value without
// opening each client's Proposal Calculator one at a time and reading
// the on-screen total.
async function renderSalesPipelineValue() {
  const valueEl = document.getElementById("dashPipelineValue");
  const countEl = document.getElementById("dashPipelineCount");
  if (!valueEl) return;

  const signedNames = await fetchSignedClientNameSet();
  const sandboxName = "Quick Sandbox (One-Offs)";

  let total = 0, count = 0;
  Object.keys(clientsDb).forEach(name => {
    if (name === sandboxName || signedNames.has(name)) return;
    const proposal = clientsDb[name].proposal;
    const monthly = proposal && typeof proposal.computedMonthly === "number" ? proposal.computedMonthly : 0;
    if (monthly > 0) {
      total += monthly;
      count++;
    }
  });

  valueEl.textContent = "$" + Math.round(total).toLocaleString("en-US");
  if (countEl) countEl.textContent = count + (count === 1 ? " open proposal" : " open proposals");
}

// Same doc as fetchContractRenewalsByClientName, different signal: which
// clients currently have an overdue invoice. Kept separate rather than
// merged into that function's return shape, since runRenewalNudgeCheck
// already depends on that one's exact shape and this is a distinct,
// independent use (My Clients' "needs attention" signals below).
async function fetchOverdueInvoiceAmountsByClientName() {
  const byName = {};
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseGetDoc) return byName;
  try {
    const ref = window.firebaseDoc(window.firebaseDb, "agency", "contractInvoices");
    const snap = await window.firebaseGetDoc(ref);
    const list = (snap.exists && snap.data().list) || [];
    list.forEach(r => {
      if (r.clientName && r.invoiceStatus === "Overdue") {
        byName[r.clientName] = r.invoiceAmount || "";
      }
    });
  } catch (e) {
    console.warn("Couldn't load overdue invoice info for My Clients:", e);
  }
  return byName;
}

async function renderMyClients() {
  const listEl = document.getElementById("myClientsList");
  const emptyEl = document.getElementById("myClientsEmpty");
  if (!listEl) return;

  const myEmail = (window.currentAdminEmail || "").trim().toLowerCase();
  const sandboxName = "Quick Sandbox (One-Offs)";

  const mine = Object.keys(clientsDb)
    .filter(name => name !== sandboxName)
    .map(name => clientsDb[name])
    .filter(c => c && myEmail && c.portalConfig && (c.portalConfig.accountManagerEmail || "").trim().toLowerCase() === myEmail)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  if (emptyEl) emptyEl.style.display = mine.length === 0 ? "block" : "none";
  if (mine.length === 0) {
    listEl.innerHTML = "";
    return;
  }

  const [renewalsByName, overdueByName] = await Promise.all([
    fetchContractRenewalsByClientName(),
    fetchOverdueInvoiceAmountsByClientName(),
  ]);

  listEl.innerHTML = mine.map(c => {
    const checklist = Array.isArray(c.onboardingChecklist) ? c.onboardingChecklist : [];
    let total = 0, checked = 0;
    checklist.forEach(cat => (cat.items || []).forEach(item => {
      total++;
      if (item.checked) checked++;
    }));
    const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
    const pendingApprovals = Array.isArray(c.pendingApprovals) ? c.pendingApprovals.length : 0;
    const stage = (c.portalConfig && c.portalConfig.engagementStage) || "onboarding";

    let renewalNote = "";
    const renewalDate = renewalsByName[c.name];
    if (renewalDate) {
      const days = Math.round((new Date(renewalDate) - new Date(new Date().toDateString())) / 86400000);
      if (!Number.isNaN(days) && days <= 30) {
        renewalNote = days < 0
          ? ` &middot; <span style="color:#ef4444;">renewal overdue</span>`
          : ` &middot; <span style="color:#f68d5f;">renews in ${days}d</span>`;
      }
    }

    let overdueNote = "";
    if (Object.prototype.hasOwnProperty.call(overdueByName, c.name)) {
      const amt = overdueByName[c.name];
      overdueNote = ` &middot; <span style="color:#ef4444;">invoice overdue${amt ? ` (${escapeHtmlCore(String(amt))})` : ''}</span>`;
    }

    return `
      <div class="step-card" style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; padding:16px 20px;">
        <div>
          <div style="font-weight:600; font-size:1rem;">${escapeHtmlCore(c.name)}</div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">
            Onboarding ${pct}% complete${pendingApprovals > 0 ? ` &middot; <span style="color:#f68d5f;">${pendingApprovals} approval${pendingApprovals === 1 ? '' : 's'} waiting</span>` : ''}${renewalNote}${overdueNote}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:0.72rem; text-transform:capitalize; background:rgba(99,102,241,0.15); color:#6366f1; padding:3px 10px; border-radius:20px; white-space:nowrap;">${escapeHtmlCore(stage)}</span>
          <button type="button" class="btn btn-secondary my-clients-open-btn" data-client="${escapeHtmlCore(c.name)}" style="padding:6px 14px; font-size:0.8rem;">Open</button>
        </div>
      </div>`;
  }).join("");

  listEl.querySelectorAll(".my-clients-open-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      switchClient(btn.getAttribute("data-client"));
      navigateToTab("tab-dashboard");
    });
  });
}

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

  // Client Health — pulled from the latest Weekly Account Check-In, if any
  const healthVal = document.getElementById("dashHealthVal");
  const healthDesc = document.getElementById("dashHealthDesc");
  const healthProgress = document.getElementById("dashHealthProgress");
  if (healthVal && healthDesc && healthProgress) {
    const checkins = Array.isArray(client.weeklyCheckins) ? client.weeklyCheckins : [];
    const latest = checkins.length ? checkins[0] : null; // already kept newest-first
    if (latest && latest.healthRating) {
      const colors = { Green: "#22c55e", Yellow: "#eab308", Red: "#ef4444" };
      const color = colors[latest.healthRating] || "var(--color-text-secondary)";
      healthVal.textContent = latest.healthRating;
      healthVal.style.color = color;
      healthDesc.textContent = `Week of ${latest.date}${latest.q1_responsive ? ' — client ' + latest.q1_responsive.toLowerCase() : ''}`;
      healthProgress.style.width = "100%";
      healthProgress.style.background = color;
    } else {
      healthVal.textContent = "No check-in yet";
      healthVal.style.color = "";
      healthDesc.textContent = "Run a Weekly Account Check-In to populate this";
      healthProgress.style.width = "0%";
      healthProgress.style.background = "";
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

// ── Timeline Scheduler Controller ──
function renderTimelineScheduler() {
  setIframeAbsoluteSrc('#tab-timeline iframe', "timeline-scheduler/index.html");
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

// ── Team Access Controller ──
function renderTeamAccess() {
  setIframeAbsoluteSrc('#tab-teamaccess iframe', "team-access-manager/index.html");
}

// ── Package Recommendation Engine Controller ──
function renderPackageRecommendationEngine() {
  setIframeAbsoluteSrc('#tab-packagerecommend iframe', "package-recommendation-engine/index.html");
}

// ── Proposal Follow-Up Sequence Tracker Controller ──
function renderColdOutreachSequencer() {
  setIframeAbsoluteSrc('#tab-coldoutreach iframe', "cold-outreach-sequencer/index.html");
}

function renderFollowUpTracker() {
  setIframeAbsoluteSrc('#tab-followuptracker iframe', "proposal-followup-tracker/index.html");
}

// ── ROI Projector Controller ──
function renderRoiProjector() {
  setIframeAbsoluteSrc('#tab-roiprojector iframe', "roi-projector/index.html");
}

// ── Contract & Invoice Status Tracker Controller ──
function renderContractInvoiceTracker() {
  setIframeAbsoluteSrc('#tab-contractinvoice iframe', "contract-invoice-tracker/index.html");
}

// ── Referral Tracker Controller ──
function renderReferralTracker() {
  setIframeAbsoluteSrc('#tab-referraltracker iframe', "referral-tracker/index.html");
}

// ── Client Renewal Tracker Controller ──
function renderRenewalTracker() {
  setIframeAbsoluteSrc('#tab-renewaltracker iframe', "renewal-tracker/index.html");
}

// ── Client Offboarding Checklist Controller ──
function renderOffboardingChecklistTab() {
  setIframeAbsoluteSrc('#tab-offboarding iframe', "client-offboarding-checklist/index.html");
}

// ── QC Checklist Controller ──
function renderQcChecklistTab() {
  setIframeAbsoluteSrc('#tab-qc iframe', "qc-checklist/index.html");
}

// ── Weekly Account Check-In Controller ──
function renderWeeklyCheckinTab() {
  setIframeAbsoluteSrc('#tab-weeklycheckin iframe', "weekly-account-checkin/index.html");
}

// ── Access & Login Log Controller ──
function renderAccessLoginLogTab() {
  setIframeAbsoluteSrc('#tab-accesslog iframe', "access-login-log/index.html");
}

// ── Client Ad Account Log Controller ──
function renderAdAccountLogTab() {
  setIframeAbsoluteSrc('#tab-adaccountlog iframe', "ad-account-log/index.html");
}

// ── Revision & Feedback Tracker Controller ──
function renderRevisionFeedbackTab() {
  setIframeAbsoluteSrc('#tab-revisionfeedback iframe', "revision-feedback-tracker/index.html");
}

// ── Call Sheet Builder Controller ──
function renderCallSheetTab() {
  setIframeAbsoluteSrc('#tab-callsheet iframe', "call-sheet-builder/index.html");
}

// ── Raw Footage & Delivery Tracker Controller ──
function renderRawFootageTab() {
  setIframeAbsoluteSrc('#tab-rawfootage iframe', "raw-footage-tracker/index.html");
}

// ── Release Forms Tracker Controller ──
function renderReleaseFormsTab() {
  setIframeAbsoluteSrc('#tab-releaseforms iframe', "release-forms-tracker/index.html");
}

// ── Run of Show Tracker Controller ──
function renderRunOfShowTab() {
  setIframeAbsoluteSrc('#tab-runofshow iframe', "run-of-show-tracker/index.html");
}

// ── Venue Tech-Spec Library Controller ──
function renderVenueTechSpecsTab() {
  setIframeAbsoluteSrc('#tab-venuespecs iframe', "venue-tech-spec-library/index.html");
}

// ── Vendor / Rental & COI Tracker Controller ──
function renderVendorRentalTab() {
  setIframeAbsoluteSrc('#tab-vendorrental iframe', "vendor-rental-tracker/index.html");
}

// ── SOP Wiki Controller ──
function renderSopWiki() {
  setIframeAbsoluteSrc('#tab-sopwiki iframe', "sop-wiki/index.html?v=1.7");
}

// ── Proposal Calculator Controller ──
function renderProposalCalculator() {
  setIframeAbsoluteSrc('#tab-proposal iframe', "proposal-calculator/index.html?v=12");
}

// ── Service Pricing Admin Controller ──
function renderServicePricingAdmin() {
  setIframeAbsoluteSrc('#tab-servicepricing iframe', "service-pricing-admin/index.html?v=3");
}

// ── Red Flag Checklist Controller ──
function renderRedFlagChecklist() {
  setIframeAbsoluteSrc('#tab-redflag iframe', "red-flag-checklist/index.html");
}

// ── Agency Health Dashboard Controller ──
function renderHealthDashboard() {
  setIframeAbsoluteSrc('#tab-healthdashboard iframe', "agency-health-dashboard/index.html");
}

// ── Change Order Generator Controller ──
function renderChangeOrderGenerator() {
  setIframeAbsoluteSrc('#tab-changeorder iframe', "change-order-generator/index.html");
}

// ── QBR Generator Controller ──
function renderQbrGenerator() {
  setIframeAbsoluteSrc('#tab-qbr iframe', "qbr-generator/index.html");
}

// ── Case Study Builder Controller ──
function renderCaseStudyBuilder() {
  setIframeAbsoluteSrc('#tab-casestudy iframe', "case-study-builder/index.html");
}

// ── Portfolio Showcase Controller ──
function renderPortfolioShowcase() {
  setIframeAbsoluteSrc('#tab-portfolioshowcase iframe', "portfolio-showcase/index.html");
}

// ── Email Template Library Controller ──
function renderEmailTemplateLibrary() {
  setIframeAbsoluteSrc('#tab-emailtemplates iframe', "email-template-library/index.html");
}

// ── Subscription & Tool Cost Tracker Controller ──
function renderSubscriptionTracker() {
  setIframeAbsoluteSrc('#tab-subscriptiontracker iframe', "subscription-tracker/index.html");
}

// ── Activity Log Controller ──
function renderActivityLogTab() {
  setIframeAbsoluteSrc('#tab-activitylog iframe', "admin-activity-log/index.html");
}

// ── Team Roster & Capacity Controller ──
function renderTeamRoster() {
  setIframeAbsoluteSrc('#tab-teamroster iframe', "team-roster/index.html");
}

function renderHoursLog() {
  setIframeAbsoluteSrc('#tab-hourslog iframe', "hours-tracker/index.html");
}

// ── Newly-wired iframe reload fixes (see the switch-case comment above) ──
function renderBrandAssetKit() {
  setIframeAbsoluteSrc('#tab-brandassetkit iframe', "brand-asset-kit/index.html?v=2");
}
function renderBrandGuidelines() {
  setIframeAbsoluteSrc('#tab-brandguidelines iframe', "brand-guidelines-builder/index.html");
}
function renderBudgetPacing() {
  setIframeAbsoluteSrc('#tab-budgetpacing iframe', "budget-pacing-tracker/index.html");
}
function renderMeetingNotes() {
  setIframeAbsoluteSrc('#tab-meetingnotes iframe', "meeting-notes-logger/index.html");
}
function renderMoodBoard() {
  setIframeAbsoluteSrc('#tab-moodboard iframe', "mood-board-builder/index.html");
}
function renderReportArchive() {
  setIframeAbsoluteSrc('#tab-reportarchive iframe', "monthly-report-archive/index.html");
}

// ── Testimonial & Review Requests Controller ──
function renderTestimonialTracker() {
  setIframeAbsoluteSrc('#tab-testimonialtracker iframe', "testimonial-tracker/index.html");
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

// ── Shared optimistic-concurrency save for agency-wide list/library docs ──
// Used by every tool that keeps one shared (non-per-client) doc in
// Firestore under agency/* with its own version counter - Access & Login
// Log, Ad Account Log, the Contract Template Library, Email Template
// Library, Service Pricing, and over a dozen others each had a
// byte-for-byte copy of this exact read-compare-write guard before it was
// consolidated here (each one's own "someone else updated this while you
// had it open" bug class, now fixed in one place instead of ~18).
//
// Deliberately returns a plain result object rather than showing a
// banner itself - some callers show the parent's banner, others (like
// Email Template Library) surface their own toast/rollback UI instead,
// so presentation stays the caller's call.
//
// docRef: a Firestore doc ref (from window.parent.firebaseDoc(...) -
//   already a parent-realm object regardless of which tool constructed
//   it, so no cross-realm issue there).
// currentVersion: the version number the caller last loaded/saved.
// buildPayload(nextVersion): returns the full object to write (e.g.
//   {list: entries, version: nextVersion} or {prices: overrides, version:
//   nextVersion}) - built in the CALLER's realm, which is fine because
//   it's immediately JSON.stringify'd below (a generic property walk,
//   unlike an SDK's instanceof-style type check, works the same
//   regardless of which realm constructed the object).
//
// Resolves to {ok:true, version} on success, or {ok:false, reason:
// 'conflict'|'error', error?} - callers should store `version` back into
// their own version variable on success.
async function saveVersionedAgencyDoc({ docRef, currentVersion, buildPayload }) {
  try {
    const freshSnap = await window.firebaseGetDoc(docRef);
    const freshData = freshSnap && freshSnap.exists ? freshSnap.data() : null;
    const freshVersion = (freshData && freshData.version) || 0;

    if (freshVersion !== currentVersion) {
      return { ok: false, reason: "conflict", freshVersion };
    }

    const nextVersion = freshVersion + 1;
    // buildPayload runs in whichever tool's iframe defined it, so the
    // object it returns is realm-foreign here - route through
    // firebaseSetDocFromJSON (stringify -> parse back in THIS realm)
    // rather than docRef.set() directly, same reasoning as every existing
    // cross-iframe Firestore write in the Hub.
    const payload = buildPayload(nextVersion);
    await window.firebaseSetDocFromJSON(docRef, JSON.stringify(payload));
    return { ok: true, version: nextVersion };
  } catch (e) {
    return { ok: false, reason: "error", error: e };
  }
}

// ── Account Manager Capacity Snapshot ──
// Team Roster & Capacity used to rely entirely on a manually-typed
// "current client count" per person, which drifts stale the moment
// someone's caseload actually changes. Every client already carries a
// real assignment though - portalConfig.accountManagerEmail (set in
// Client Portal Manager, used to sign welcome/portal emails) - so for
// anyone whose role is literally "Account Manager" we can compute their
// real live caseload instead of trusting a stale number. Non-AM roles
// (Video Editor, Designer, etc.) have no equivalent per-client
// assignment field in this data model, so they still fall back to the
// manual count in Team Roster's own render logic.
//
// Returns a map keyed by lowercased AM email -> { member, clientNames }.
// Used by both Team Roster (to render live load + the expandable client
// list) and Client Portal Manager (to warn if the AM you just typed in
// is already stretched thin) - built once, shared, rather than
// duplicating the match-by-email loop in both tools.
async function getAccountManagerCapacitySnapshot() {
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseGetDoc) return {};
  try {
    const ref = window.firebaseDoc(window.firebaseDb, "agency", "teamRoster");
    const snap = await window.firebaseGetDoc(ref);
    const data = snap && snap.exists ? snap.data() : null;
    const members = (data && data.list) || [];
    const clients = getAllClients() || {};

    const byEmail = {};
    members.forEach(m => {
      if (m.role !== "Account Manager") return;
      const email = (m.email || "").trim().toLowerCase();
      if (!email) return;
      byEmail[email] = { member: m, clientNames: [] };
    });

    Object.keys(clients).forEach(clientName => {
      const client = clients[clientName];
      const amEmail = ((client.portalConfig && client.portalConfig.accountManagerEmail) || "").trim().toLowerCase();
      if (amEmail && byEmail[amEmail]) byEmail[amEmail].clientNames.push(clientName);
    });

    return byEmail;
  } catch (e) {
    console.warn("Couldn't build the account-manager capacity snapshot:", e);
    return {};
  }
}

// Same underlying timeOff data as Team Roster's Calendar view (see
// team-roster/js/app.js's renderTimeline) - just "today's column" of
// that same data, surfaced on the dashboard so checking who's out
// doesn't require a click into Team Roster first. Local calendar day,
// not UTC, so this doesn't flip over an hour early/late depending on
// timezone.
function todayIsoLocalForDashboard() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function renderWhosOutToday() {
  const el = document.getElementById('whosOutTodayList');
  if (!el) return;
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseGetDoc) return;
  try {
    const ref = window.firebaseDoc(window.firebaseDb, "agency", "teamRoster");
    const snap = await window.firebaseGetDoc(ref);
    const data = snap && snap.exists ? snap.data() : null;
    const members = (data && data.list) || [];
    const today = todayIsoLocalForDashboard();

    const outToday = members.filter(m => {
      const timeOff = Array.isArray(m.timeOff) ? m.timeOff : [];
      return timeOff.some(t => t.startDate <= today && today <= (t.endDate || t.startDate));
    });

    el.innerHTML = outToday.length
      ? outToday.map(m => `<div style="padding:3px 0;">${escapeHtmlCore(m.memberName)}</div>`).join('')
      : `<div style="color: var(--color-text-muted);">Everyone's in today.</div>`;
  } catch (e) {
    console.warn("Couldn't load who's out today:", e);
    el.innerHTML = `<div style="color: var(--color-text-muted);">Couldn't load.</div>`;
  }
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
    exportDataBtn.addEventListener("click", async () => {
      const originalLabel = exportDataBtn.innerHTML;
      exportDataBtn.disabled = true;
      exportDataBtn.textContent = "Exporting...";
      try {
        const agencyDocs = await fetchAllAgencyDocsForBackup();
        const backup = {
          exportedAt: new Date().toISOString(),
          clientsDb: clientsDb,
          agencyDocs: agencyDocs
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", dataStr);
        const dateStamp = new Date().toISOString().slice(0, 10);
        downloadAnchor.setAttribute("download", `Revital_Productions_Full_Backup_${dateStamp}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showBanner("success", "Full backup exported (all clients + agency-wide data)!");
        logAdminActivity("Full backup exported", `${Object.keys(clientsDb).length} clients, ${Object.keys(agencyDocs).length} agency docs`);
      } catch (e) {
        console.error("Backup export failed:", e);
        showBanner("error", "Backup export failed - check the console for details.");
      } finally {
        exportDataBtn.disabled = false;
        exportDataBtn.innerHTML = originalLabel;
      }
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
      reader.onload = async function(evt) {
        try {
          const imported = JSON.parse(evt.target.result);

          if (typeof imported !== 'object' || Array.isArray(imported)) {
            throw new Error("Invalid file structure. Must be a JSON object.");
          }

          // Export Full Backup (see exportDataBtn above) wraps client data
          // as {exportedAt, clientsDb, agencyDocs} instead of the old flat
          // {clientName: {...}} shape - detect which one this file is so
          // older exported backups still import exactly as before.
          const isFullBackupFormat = imported && typeof imported.clientsDb === 'object' && !Array.isArray(imported.clientsDb);
          const importedClients = isFullBackupFormat ? imported.clientsDb : imported;

          clientsDb = { ...clientsDb, ...importedClients };
          saveDatabase();

          activeClientName = Object.keys(importedClients)[0];
          localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);

          buildClientDropdown();
          refreshAllViews();
          showBanner("success", "Client workspaces merged and imported successfully!");
          logAdminActivity("Backup imported", `${Object.keys(importedClients).length} client(s)`);

          if (isFullBackupFormat && imported.agencyDocs && Object.keys(imported.agencyDocs).length > 0) {
            const restoreAgencyData = confirm(
              `This backup also includes agency-wide data (${Object.keys(imported.agencyDocs).length} docs - notifications, trackers, activity log, etc.) from ${imported.exportedAt || "an earlier export"}.\n\n` +
              `Restore that too? This OVERWRITES the current live versions of each doc it includes. Choose Cancel to just keep the client workspaces you already imported above.`
            );
            if (restoreAgencyData && window.firebaseDb && window.firebaseDb.collection) {
              try {
                await Promise.all(Object.entries(imported.agencyDocs).map(([docName, data]) =>
                  window.firebaseDb.collection("agency").doc(docName).set(data)
                ));
                showBanner("success", "Agency-wide data restored from backup.");
                logAdminActivity("Agency data restored from backup", `${Object.keys(imported.agencyDocs).length} docs`);
              } catch (restoreErr) {
                console.error("Agency data restore failed:", restoreErr);
                showBanner("error", "Client workspaces imported, but agency-wide data restore failed - check the console.");
              }
            }
          }
        } catch (err) {
          console.error("Import failed:", err);
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

  // Edit (rename) Client Button
  const editClientBtn = document.getElementById("editClientBtn");
  if (editClientBtn) {
    editClientBtn.addEventListener("click", renameActiveClient);
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
      e.target.title = e.target.value;
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

  // ── Keep client.brandKit in sync ──
  // The Client Portal's brand section (portal/js/app.js renderBrandKit())
  // reads client.brandKit, not client.brandVault - but this Vault is the
  // one this SOP-driven workflow actually points staff to fill in. Before
  // this sync, saving here had zero effect on what the client ever saw:
  // Vault could be perfectly filled out and the portal would still show an
  // empty brand section, because nothing kept the two in sync. Deriving
  // brandKit from brandVault on every save means Vault is now the single
  // real data-entry point - Brand Asset Kit (Lite) is a read-only display
  // of this same derived data (see brand-asset-kit/js/app.js).
  if (!client.brandKit) client.brandKit = {};
  client.brandKit.primaryColor = (bv.colors[0] && bv.colors[0].hex) || client.brandKit.primaryColor || '';
  client.brandKit.secondaryColor = (bv.colors[1] && bv.colors[1].hex) || client.brandKit.secondaryColor || '';
  client.brandKit.accentColor = (bv.colors[2] && bv.colors[2].hex) || client.brandKit.accentColor || '';
  client.brandKit.fontPrimary = bv.typography.primaryFont || client.brandKit.fontPrimary || '';
  client.brandKit.fontSecondary = bv.typography.secondaryFont || client.brandKit.fontSecondary || '';
  client.brandKit.toneOfVoice = bv.brandVoice.adjectives || client.brandKit.toneOfVoice || '';
  client.brandKit.logoUrl = bv.assets.logoUrl || client.brandKit.logoUrl || '';

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
  // Second line of defense (see rebuildClientsDbFromShards): never let
  // this overwrite the local cache with a clientsDb we know is still
  // mid-sync. In the normal case clientsDb is never in that state by
  // the time anything can call saveDatabase(), but a cross-client tool
  // acting the instant its iframe loads is exactly the edge case that
  // exposed this, so it's worth checking here too rather than trusting
  // a single guard.
  if (!lastKnownClientsDbShardCount || clientsDbAllShardsLoaded) {
    localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));
  } else {
    console.warn("saveDatabase: skipping localStorage write - clientsDb shards still loading.");
  }

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

// SAFETY GUARD (see commitDatabaseToCloud below): tracks which shard
// indices have received at least one real snapshot since the listener
// count was last (re)set, and whether that adds up to every shard we
// expect. Prevents writing a partial in-memory clientsDb - built from
// only some shards having loaded yet - back over the full set in
// Firestore, which would silently delete whichever clients only lived
// in a shard that hadn't arrived yet.
let clientsDbShardsLoadedIndices = new Set();
let clientsDbAllShardsLoaded = false;

// Optimistic-concurrency guard for clientsDb itself (see
// commitDatabaseToCloud below) - kept fresh by loadDatabase's meta-doc
// listener, same version-field pattern every other agency/* doc in the
// Hub now uses (see saveVersionedAgencyDoc). clientsDb was the one doc
// left without this protection after this session's sweep - the exact
// "someone else saved while you had it open" bug class that already
// caused a real data-loss incident once (see data-loss-prevention-plan.md),
// just never closed here specifically.
let clientsDbDocVersion = 0;

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
  // Don't downgrade the already-loaded clientsDb (booted instantly from
  // localStorage - see loadDatabase()) to a partial state while shards
  // are still trickling in. Each shard's onSnapshot used to rebuild
  // clientsDb from ONLY the shards that had arrived so far, so a
  // complete five-client roster could be briefly - or, if a shard was
  // slow/failed, not-so-briefly - replaced by a two-client partial
  // merge and written straight to localStorage. That's what made
  // clients "disappear": any tool reading clientsDb during that window
  // (e.g. a cross-client tool like Contract & Invoice Tracker) would
  // see, and could persist, the incomplete list. Wait until every
  // expected shard has been seen at least once before promoting the
  // merge.
  if (!clientsDbAllShardsLoaded) return;

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

    clientsDbShardsLoadedIndices.add(shardIndex);
    clientsDbAllShardsLoaded = clientsDbShardsLoadedIndices.size >= lastKnownClientsDbShardCount;

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
  clientsDbShardsLoadedIndices = new Set();
  clientsDbAllShardsLoaded = (count === 0);
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

  // SAFETY GUARD: if we're supposed to be listening to cloud shards
  // (lastKnownClientsDbShardCount > 0) but haven't yet received a first
  // snapshot from every one of them, clientsDb in memory is only a
  // partial picture assembled from whichever shards have loaded so far.
  // Writing it back to Firestore now would re-shard that partial picture
  // and blank out whichever clients live in a shard we haven't heard
  // from yet - this is how "Reginald White" and "Evry Intention LLC"
  // silently disappeared. Skip the cloud write until every shard has
  // reported in at least once; the local save above already protects
  // this session's edits in the meantime, and this function gets called
  // again on the next debounced save.
  if (lastKnownClientsDbShardCount > 0 && !clientsDbAllShardsLoaded) {
    console.warn("commitDatabaseToCloud: skipped - not all clientsDb shards have loaded yet (" +
      clientsDbShardsLoadedIndices.size + "/" + lastKnownClientsDbShardCount + ")");
    if (indicator) {
      indicator.innerHTML = "Waiting for cloud sync… ⏳";
      setTimeout(() => { indicator.style.opacity = "0"; }, 3000);
    }
    return;
  }

  const cleanDb = JSON.parse(JSON.stringify(clientsDb));
  const shards = packClientsDbIntoShards(cleanDb);

  // Safety-net backup: a "last known good" full snapshot, written
  // alongside the real shards whenever we're confident clientsDb is
  // complete (guard above). If the live shards ever get corrupted again
  // for any reason, this is always a recent, complete copy to recover
  // from - see agency/clientsDbBackup-shard-0, -1, etc. and
  // agency/clientsDbBackupShardMeta. Sharded the exact same way as the
  // live data (reusing the `shards` array above) so it can't hit
  // Firestore's ~1MB per-document limit as the client roster grows -
  // an earlier version of this wrote one big document and had the same
  // size ceiling the old pre-sharding format did. Fire-and-forget: a
  // backup failure shouldn't block or alarm the user about the actual
  // save below. (agency/clientsDbBackup, the old single-document
  // location, is no longer written to - safe to ignore/delete.)
  const backupMetaRef = window.firebaseDoc(window.firebaseDb, "agency", "clientsDbBackupShardMeta");
  window.firebaseGetDoc(backupMetaRef).then((backupMetaSnap) => {
    const prevBackupShardCount = (backupMetaSnap.exists && typeof backupMetaSnap.data().count === 'number')
      ? backupMetaSnap.data().count : 0;

    const backupWrites = shards.map((shardObj, i) => {
      const ref = window.firebaseDoc(window.firebaseDb, "agency", "clientsDbBackup-shard-" + i);
      return window.firebaseSetDoc(ref, shardObj);
    });
    // Blank out any trailing backup shards left over from a larger
    // previous backup, same reasoning as the live-shard cleanup below.
    for (let i = shards.length; i < prevBackupShardCount; i++) {
      const ref = window.firebaseDoc(window.firebaseDb, "agency", "clientsDbBackup-shard-" + i);
      backupWrites.push(window.firebaseSetDoc(ref, {}));
    }
    backupWrites.push(window.firebaseSetDoc(backupMetaRef, { count: shards.length, savedAt: new Date().toISOString() }));

    return Promise.all(backupWrites);
  }).catch(err => console.error("clientsDb backup write failed:", err));

  const metaRef = getClientsDbShardMetaDocRef();

  // Add a manual timeout to detect hanging - covers the version check
  // below too, not just the writes, since both are part of one save cycle.
  let resolved = false;
  setTimeout(() => {
    if (!resolved && indicator) {
      indicator.innerHTML = "Cloud Timeout ❌";
      setTimeout(() => { indicator.style.opacity = "0"; }, 3000);
    }
  }, 10000);

  // Optimistic-concurrency guard, same version-field pattern as every
  // other agency/* doc (see saveVersionedAgencyDoc) - re-read the meta
  // doc's version fresh right before writing, and refuse the ENTIRE save
  // (not just the meta doc) if it moved since this tab last synced,
  // rather than silently overwriting whatever another admin just saved
  // elsewhere in the client roster. This is deliberately the same
  // hard-block-and-ask behavior as everywhere else, not a softer
  // auto-merge - clientsDb fires this on nearly every edit across the
  // whole Hub, so a rejected save is expected to be rare in practice for
  // a team this size, and staying consistent with the pattern every other
  // tool already uses (rather than inventing a different, more complex
  // behavior just for this one doc) keeps the "someone else saved, reload
  // and redo" mental model the same everywhere an admin might see it.
  window.firebaseGetDoc(metaRef).then((freshMetaSnap) => {
    const freshVersion = (freshMetaSnap.exists && typeof freshMetaSnap.data().version === "number")
      ? freshMetaSnap.data().version : 0;

    if (freshVersion !== clientsDbDocVersion) {
      resolved = true;
      console.warn("commitDatabaseToCloud: skipped - clientsDb changed elsewhere since this tab last synced (local v" +
        clientsDbDocVersion + " vs cloud v" + freshVersion + ").");
      if (indicator) {
        indicator.innerHTML = "Save Skipped ⚠️";
        setTimeout(() => { indicator.style.opacity = "0"; }, 5000);
      }
      showBanner("error", "Someone else saved changes to the client database while you had this open. Reload the page to see their changes, then redo your last edit.");
      return;
    }

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

    const nextVersion = freshVersion + 1;
    writes.push(window.firebaseSetDoc(metaRef, { count: shards.length, version: nextVersion }));

    return Promise.all(writes).then(() => {
      resolved = true;
      clientsDbDocVersion = nextVersion;
      if (indicator) {
        indicator.innerHTML = "Saved to Cloud ✅";
        setTimeout(() => { indicator.style.opacity = "0"; }, 2000);
      }

      // Mirror only the portal-facing subset of each client into its own
      // public document (see syncPublicPortalDocs). The full clientsDb
      // data above is admin-only under Firestore rules; this is what the
      // unauthenticated client portal is allowed to read. Only runs after
      // a confirmed successful save - cleanDb shouldn't be pushed out to
      // the public portal on a skipped/failed save, since it may not
      // reflect the true current state.
      syncPublicPortalDocs(cleanDb).catch(err => {
        console.error("Public portal sync failed:", err);
      });
    });
  }).catch(err => {
    resolved = true;
    console.error("Firebase save failed:", err);
    if (indicator) {
      indicator.innerHTML = "Cloud Error ❌: " + err.message;
      setTimeout(() => { indicator.style.opacity = "0"; }, 5000);
    }
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

// Keeps the admin's in-memory clientChecklist in sync with whatever the
// client's own portal doc actually says, in both directions (checked and
// unchecked). Used by ensureClientPortalListeners' onSnapshot handler
// below, which fires because the client's portal doc just changed in
// Firestore - so "existingItems" here is the freshest truth available.
// (There used to also be a one-directional version of this run defensively
// inside syncPublicPortalDocs, at save time, but it only ever pulled a
// checked box IN from the portal, never matched an unchecked one - which
// meant an account manager unchecking a box in Client Portal Manager and
// saving would get silently reverted back to checked. Since this listener
// already keeps clientsDb bidirectionally in sync continuously, that extra
// fold at save time was both redundant and the actual source of that bug,
// so it was removed rather than fixed in place.)
function syncClientChecklistFromPortal(targetItems, existingItems) {
  if (!Array.isArray(targetItems) || !Array.isArray(existingItems)) return false;
  const existingCheckedById = new Map(existingItems.map(item => [item.id, !!item.checked]));
  let changed = false;
  targetItems.forEach(item => {
    if (!existingCheckedById.has(item.id)) return;
    const existingChecked = existingCheckedById.get(item.id);
    if (!!item.checked !== existingChecked) {
      item.checked = existingChecked;
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
// Pull in a client's testimonial submission (written straight to the
// public clients/{token} doc via the portal's Leave a Testimonial view,
// same as checklist/approvals above) into a target object's
// .testimonialSubmission property. Simpler than foldInApprovalDecisions
// since it's a single write-once object, not two arrays to reconcile -
// just copy it over if the target doesn't have it yet or it's changed.
function foldInTestimonialSubmission(target, publicData) {
  if (!target || !publicData || !publicData.testimonialSubmission) return false;
  const incoming = publicData.testimonialSubmission;
  const current = target.testimonialSubmission;
  if (current && current.submittedDate === incoming.submittedDate && current.quote === incoming.quote) {
    return false; // already have this exact submission, nothing changed
  }
  target.testimonialSubmission = incoming;
  return true;
}

// Appends one entry to a client's notification feed (the bell icon on
// their portal). Admin-only to create - called from wherever the hub
// pushes something the client needs to know about (a new approval request,
// a newly published report). The client can only ever mark entries read,
// never add their own - see foldInNotificationReadState below and the
// matching Firestore rule. Exposed on window (plain function declarations
// do this automatically in a classic script) so tool iframes like Client
// Portal Manager and Monthly Report Archive can call it via
// window.parent.pushClientNotification(client, type, message).
function pushClientNotification(client, type, message) {
  if (!client) return;
  if (!Array.isArray(client.notifications)) client.notifications = [];
  client.notifications.unshift({
    id: 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    type: type || 'info',
    message: message,
    createdAt: new Date().toISOString(),
    read: false
  });
  // Cap so this doesn't grow unbounded over a long client relationship.
  if (client.notifications.length > 30) client.notifications.length = 30;
}

// Notifications are admin-authored only - the client can never create one,
// only mark an existing one read. So the only thing that needs folding in
// from the existing public doc before every save is which ones the client
// has already read, the same one-directional "only ever flips one way"
// pattern as foldInOnboardingChecked above (never un-reads something).
function foldInNotificationReadState(targetNotifications, existingNotifications) {
  if (!Array.isArray(targetNotifications) || !Array.isArray(existingNotifications)) return false;
  const readIds = new Set(existingNotifications.filter(n => n.read).map(n => n.id));
  let changed = false;
  targetNotifications.forEach(n => {
    if (readIds.has(n.id) && !n.read) {
      n.read = true;
      changed = true;
    }
  });
  return changed;
}

// ── Admin-side notification bell ──
// Mirrors the client portal's bell, but for Ronald: flags when a client
// approves/requests revision on a deliverable, or submits a testimonial,
// so he doesn't have to have that client open in the Hub to notice. Kept
// in its own agency-wide Firestore doc (like the Contract & Invoice
// Tracker's agency/contractInvoices) rather than per-client, since this is
// a single admin-facing feed across every client at once. Loaded once at
// boot and written whenever a new one is pushed - no live listener, since
// this session is always the one generating them (client-driven events
// arrive via ensureClientPortalListeners below, which already runs
// continuously in this same session).
let adminNotifications = [];

async function loadAdminNotifications() {
  if (!window.firebaseDb || !window.firebaseDb.collection) return;
  try {
    const snap = await window.firebaseDb.collection("agency").doc("adminNotifications").get();
    adminNotifications = (snap.exists && snap.data().list) || [];
  } catch (e) {
    console.warn("Could not load admin notifications:", e);
    adminNotifications = [];
  }
  renderAdminNotifications();
}

function persistAdminNotifications() {
  if (!window.firebaseDb || !window.firebaseDb.collection) return;
  window.firebaseDb.collection("agency").doc("adminNotifications").set({ list: adminNotifications }).catch(e => {
    console.error("Could not save admin notifications:", e);
  });
}

function pushAdminNotification(type, message, clientName, draftEmail) {
  adminNotifications.unshift({
    id: 'an_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    type: type || 'info',
    message: message,
    clientName: clientName || null,
    // Optional {to, subject, body, from?, sendEnabled?}. Most flows still
    // only produce a pre-filled draft the admin reviews and sends
    // themselves via mailto/copy (see Auto-Send Email Integration Plan.md)
    // - same pattern as buildApprovalEmail in client-portal-manager. Drafts
    // with sendEnabled:true (currently just the stale-client nudge, wired
    // first per the plan's rollout order) also get a real "Send" button
    // that calls /api/send-email server-side via Resend.
    draftEmail: draftEmail || null,
    createdAt: new Date().toISOString(),
    read: false,
    sent: false
  });
  if (adminNotifications.length > 30) adminNotifications.length = 30;
  persistAdminNotifications();
  renderAdminNotifications();
}

// Builds a reminder-email draft for the stale-client nudge. This is the
// first flow wired to real auto-send (see Auto-Send Email Integration
// Plan.md) - sendEnabled:true is what makes buildDraftEmailPanel() show a
// real "Send" button instead of just Copy/mailto. "from" is the account
// manager's own @revitalproductions.com address (root-domain Resend
// verification lets us send as them directly), so replies land straight in
// their inbox with no Reply-To trick needed. Falls back to no send button
// at all if either the account manager's email or the client's contact
// email is missing - Copy/mailto still work either way.
function buildStaleNudgeDraftEmail(client, name, pendingCount) {
  const config = client.portalConfig || {};
  if (!config.clientContactEmail) return null;

  const contactFirstName = (config.clientContactName || name).split(' ')[0];
  const amFirstName = config.accountManagerName ? config.accountManagerName.split(' ')[0] : "our team";
  const magicLink = config.magicToken
    ? `${window.location.origin}/portal/index.html?c=${encodeURIComponent(name)}&t=${config.magicToken}`
    : "";
  const approvalPhrase = pendingCount === 1 ? "an approval" : `${pendingCount} approvals`;

  const subject = `Quick follow-up - ${approvalPhrase} waiting on your review`;
  const body = `Hi ${contactFirstName},\n\nJust a friendly nudge - you have ${approvalPhrase} waiting for your review in your client portal:\n${magicLink}\n\nLet us know if anything's unclear or you'd like to hop on a quick call.\n\nThanks,\n${amFirstName}`;

  const draft = { to: config.clientContactEmail, subject: subject, body: body };
  if (config.accountManagerEmail && config.accountManagerName) {
    draft.from = `${config.accountManagerName} <${config.accountManagerEmail}>`;
    draft.sendEnabled = true;
  }
  return draft;
}

// Builds the testimonial-ask draft email - triggered from
// weekly-account-checkin/js/app.js the moment a client's health rating
// flips to Green, since that's the best moment to ask while they're happy.
// Exposed on window (implicit for a plain top-level function in a
// non-module script) so that iframe can call
// window.parent.buildTestimonialAskDraftEmail(client, name) the same way
// it already calls window.parent.pushAdminNotification. Same
// sendEnabled/from pattern as the stale-client nudge above - no account
// manager configured means no Send button, Copy/mailto only.
function buildTestimonialAskDraftEmail(client, name) {
  const config = client.portalConfig || {};
  if (!config.clientContactEmail) return null;

  const contactFirstName = (config.clientContactName || name).split(' ')[0];
  const amFirstName = config.accountManagerName ? config.accountManagerName.split(' ')[0] : "our team";
  const magicLink = config.magicToken
    ? `${window.location.origin}/portal/index.html?c=${encodeURIComponent(name)}&t=${config.magicToken}`
    : "";

  const subject = `Quick favor - would you share a testimonial?`;
  const body = `Hi ${contactFirstName},\n\nThings have been going really well lately, and we'd love it if you had a minute to share a quick testimonial about working with us - it really helps other clients get a sense of what to expect.\n\nYou can leave one right from your client portal, under "Leave a Testimonial":\n${magicLink}\n\nNo pressure at all, and thank you either way for being a great client to work with!\n\nThanks,\n${amFirstName}`;

  const draft = { to: config.clientContactEmail, subject: subject, body: body };
  if (config.accountManagerEmail && config.accountManagerName) {
    draft.from = `${config.accountManagerName} <${config.accountManagerEmail}>`;
    draft.sendEnabled = true;
  }
  return draft;
}

// Templates in the Email Template Library are authored as simple <p>/<br>
// HTML (see email-template-library/js/data.js), not full markup - a
// lightweight regex swap to plain text is enough for a mailto body without
// needing a real HTML parser.
function templateHtmlToPlainText(html) {
  return (html || "")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function fillTemplateVars(text, vars) {
  return Object.keys(vars).reduce((acc, key) => acc.split(`{{${key}}}`).join(vars[key] || ""), text);
}

async function fetchEmailTemplateById(templateId) {
  if (!window.firebaseDb || !window.firebaseDb.collection) return null;
  try {
    const snap = await window.firebaseDb.collection("agency").doc("emailTemplates").get();
    const list = (snap.exists && snap.data().list) || [];
    return list.find(t => t.id === templateId) || null;
  } catch (e) {
    console.warn(`Could not fetch email template ${templateId}:`, e);
    return null;
  }
}

// Fires once, right when a new client workspace is created (Day 1 of the
// Client Onboarding SOP) - pulls the real Welcome Email (#8) and Intake
// Form (#17) templates from the Email Template Library and substitutes
// whatever client info exists so far. This is just a reference/reminder
// copy for the notification bell - contact name / account manager name
// are usually still blank at this exact moment (Client Portal Manager
// hasn't been filled in yet for a brand-new client), so it can't be the
// real send. The real send (with the actual PDF attached, via Resend)
// lives inside the Welcome Guide Gen / Intake Request Gen tools
// themselves, as an "Email to Client" button - deliberately manual,
// since whoever fills in those tools (account manager for Welcome, sales
// or account manager for Intake) is the one who knows when it's actually
// ready to go out, not a fixed timing rule.
async function generateNewClientOnboardingEmails(client, name) {
  const config = client.portalConfig || {};
  const contactName = config.clientContactName || name;
  const accountManagerName = config.accountManagerName || "the Revital Productions team";
  const contactEmail = config.clientContactEmail || "";

  const [welcomeTpl, intakeTpl] = await Promise.all([
    fetchEmailTemplateById("tpl-welcome-8"),
    fetchEmailTemplateById("tpl-intake-send-17")
  ]);

  if (welcomeTpl) {
    const filled = fillTemplateVars(welcomeTpl.content, { contactName, clientName: name, accountManagerName });
    const body = templateHtmlToPlainText(filled) + "\n\n[Reference copy only - once this client's Account Manager info is filled in, use the \"Email to Client\" button inside the Welcome Guide Gen tool to send this with the real PDF attached.]";
    pushAdminNotification(
      'client_welcome_email',
      `Welcome email drafted for ${name}.`,
      name,
      { to: contactEmail, subject: welcomeTpl.subjectLine, body: body }
    );
  }

  if (intakeTpl) {
    const filled = fillTemplateVars(intakeTpl.content, { contactName, clientName: name, accountManagerName });
    const body = templateHtmlToPlainText(filled) + "\n\n[Reference copy only - once this client's Account Manager info is filled in, use the \"Email to Client\" button inside the Intake Request Gen tool to send this with the real PDF attached.]";
    pushAdminNotification(
      'client_intake_email',
      `Intake form email drafted for ${name}.`,
      name,
      { to: contactEmail, subject: intakeTpl.subjectLine, body: body }
    );
  }
}

// Slow-moving signal, so this only needs to run occasionally rather than on
// every refreshAllViews() call (which fires on nearly every save). Flags
// clients who have something waiting on them (a pending approval) AND
// haven't opened their portal in a while - the two together are what make
// it worth a nudge, since a stale visit with nothing pending just means
// there's nothing new to look at.
let lastStaleNudgeCheckAt = 0;
const STALE_NUDGE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // re-scan at most hourly
const STALE_NUDGE_DAYS_THRESHOLD = 7;
const STALE_NUDGE_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // don't re-nudge same client within 3 days

// Builds a renewal-reminder email draft - same "who's this for" shape as
// buildStaleNudgeDraftEmail above (sendEnabled:true + a real "from" only
// when the account manager's name/email and the client's contact email
// are both on file). Renewal date comes from Contract & Invoice Tracker's
// own agency/contractInvoices doc via fetchContractRenewalsByClientName
// (see My Clients, which reads the same doc for the same reason) - it's
// not on the client object itself.
function buildRenewalNudgeDraftEmail(client, name, days) {
  const config = client.portalConfig || {};
  if (!config.clientContactEmail) return null;

  const contactFirstName = (config.clientContactName || name).split(' ')[0];
  const amFirstName = config.accountManagerName ? config.accountManagerName.split(' ')[0] : "our team";
  const whenPhrase = days < 0
    ? `was due to renew ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
    : days === 0
      ? "renews today"
      : `is coming up for renewal in ${days} day${days === 1 ? '' : 's'}`;

  const subject = `Your agreement with Revital Productions — renewal coming up`;
  const body = `Hi ${contactFirstName},\n\nJust a heads-up that your agreement with Revital Productions ${whenPhrase}. Let us know if you'd like to review anything before it renews, or if you have any questions about the next term.\n\nThanks,\n${amFirstName}`;

  const draft = { to: config.clientContactEmail, subject: subject, body: body };
  if (config.accountManagerEmail && config.accountManagerName) {
    draft.from = `${config.accountManagerName} <${config.accountManagerEmail}>`;
    draft.sendEnabled = true;
  }
  return draft;
}

let lastRenewalNudgeCheckAt = 0;
const RENEWAL_NUDGE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // same hourly cadence as the stale-client check
const RENEWAL_NUDGE_DAYS_THRESHOLD = 30; // flag renewals within 30 days (matches My Clients' own renewal note)
const RENEWAL_NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // renewals move slower than portal check-ins, so a longer cooldown than the 3-day stale-client one

// Same notification-bell nudge pattern as runStaleClientNudgeCheck below,
// for contracts coming up (or already overdue) for renewal instead of
// unread portal approvals. Async (unlike that one) because the renewal
// date isn't in clientsDb - it's a second doc read, same one My Clients
// uses. Called fire-and-forget from refreshAllViews, not awaited.
async function runRenewalNudgeCheck() {
  const now = Date.now();
  if (now - lastRenewalNudgeCheckAt < RENEWAL_NUDGE_CHECK_INTERVAL_MS) return;
  lastRenewalNudgeCheckAt = now;

  const renewalsByName = await fetchContractRenewalsByClientName();

  Object.entries(renewalsByName).forEach(([name, renewalDate]) => {
    const client = clientsDb[name];
    if (!client || !client.portalConfig || !client.portalConfig.magicToken) return;

    const days = Math.round((new Date(renewalDate) - new Date(new Date().toDateString())) / 86400000);
    if (Number.isNaN(days) || days > RENEWAL_NUDGE_DAYS_THRESHOLD) return;

    const alreadyNudged = adminNotifications.some(n =>
      n.type === 'contract_renewal' &&
      n.clientName === name &&
      (now - new Date(n.createdAt).getTime()) < RENEWAL_NUDGE_COOLDOWN_MS
    );
    if (alreadyNudged) return;

    const draftEmail = buildRenewalNudgeDraftEmail(client, name, days);
    const phrase = days < 0 ? `renewal was due ${Math.abs(days)}d ago` : `renews in ${days}d`;
    pushAdminNotification('contract_renewal', `${name}'s contract ${phrase}.`, name, draftEmail);
  });
}

function runStaleClientNudgeCheck() {
  const now = Date.now();
  if (now - lastStaleNudgeCheckAt < STALE_NUDGE_CHECK_INTERVAL_MS) return;
  lastStaleNudgeCheckAt = now;

  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client || !client.portalConfig || !client.portalConfig.magicToken) return;

    const pendingCount = Array.isArray(client.pendingApprovals) ? client.pendingApprovals.length : 0;
    if (pendingCount === 0) return;

    const lastVisited = client.portalLastVisitedAt ? new Date(client.portalLastVisitedAt).getTime() : null;
    const daysSinceVisit = lastVisited ? Math.floor((now - lastVisited) / 86400000) : null;
    const isStale = daysSinceVisit === null || daysSinceVisit >= STALE_NUDGE_DAYS_THRESHOLD;
    if (!isStale) return;

    const alreadyNudged = adminNotifications.some(n =>
      n.type === 'stale_client' &&
      n.clientName === name &&
      (now - new Date(n.createdAt).getTime()) < STALE_NUDGE_COOLDOWN_MS
    );
    if (alreadyNudged) return;

    const visitPhrase = daysSinceVisit === null ? "never opened their portal" : `hasn't opened their portal in ${daysSinceVisit}d`;
    const approvalPhrase = pendingCount === 1 ? "1 pending approval" : `${pendingCount} pending approvals`;
    const draftEmail = buildStaleNudgeDraftEmail(client, name, pendingCount);
    pushAdminNotification('stale_client', `${name} ${visitPhrase} and has ${approvalPhrase} waiting.`, name, draftEmail);
  });
}

function adminNotifTimeAgo(isoString) {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

function renderAdminNotifications() {
  const badge = document.getElementById("adminNotifBellBadge");
  const list = document.getElementById("adminNotifList");
  if (!badge || !list) return;

  const unreadCount = adminNotifications.filter(n => !n.read).length;
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }

  list.innerHTML = "";
  if (adminNotifications.length === 0) {
    const empty = document.createElement("div");
    empty.className = "admin-notif-empty";
    empty.textContent = "Nothing yet - you'll see client activity here as it happens.";
    list.appendChild(empty);
    return;
  }

  adminNotifications.forEach(item => {
    const row = document.createElement("div");
    row.className = "admin-notif-item" + (item.read ? " read" : "");

    const dot = document.createElement("span");
    dot.className = "admin-notif-item-dot";

    const body = document.createElement("div");
    body.className = "admin-notif-item-body";
    const p = document.createElement("p");
    p.textContent = item.message || "";
    const time = document.createElement("div");
    time.className = "admin-notif-item-time";
    time.textContent = adminNotifTimeAgo(item.createdAt);
    body.appendChild(p);
    body.appendChild(time);

    // Most flows still only reveal a pre-filled draft for the admin to
    // review, edit, and send themselves (mailto/copy) - only drafts with
    // sendEnabled:true (see pushAdminNotification) get a real "Send"
    // button that calls /api/send-email server-side. (Auto-Send Email
    // Integration Plan.md has the full story on what's wired vs. not.)
    if (item.draftEmail) {
      const draftBtn = document.createElement("button");
      draftBtn.type = "button";
      draftBtn.className = "admin-notif-draft-btn";
      draftBtn.textContent = expandedDraftEmailIds.has(item.id) ? "Hide draft email" : "Show draft email";
      draftBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (expandedDraftEmailIds.has(item.id)) expandedDraftEmailIds.delete(item.id);
        else expandedDraftEmailIds.add(item.id);
        renderAdminNotifications();
      });
      body.appendChild(draftBtn);

      if (expandedDraftEmailIds.has(item.id)) {
        body.appendChild(buildDraftEmailPanel(item.draftEmail, item));
      }
    }

    row.appendChild(dot);
    row.appendChild(body);

    row.addEventListener("click", () => {
      if (!item.read) {
        item.read = true;
        renderAdminNotifications();
        persistAdminNotifications();
      }
    });

    list.appendChild(row);
  });
}

// Which stale-nudge notifications currently have their draft-email panel
// expanded - only lives for this page session, doesn't need to persist.
const expandedDraftEmailIds = new Set();

function buildDraftEmailPanel(draftEmail, item) {
  const panel = document.createElement("div");
  panel.className = "admin-notif-draft-panel";
  panel.addEventListener("click", (e) => e.stopPropagation());

  const toRow = document.createElement("div");
  toRow.className = "admin-notif-draft-to";
  toRow.textContent = "To: " + (draftEmail.to || "(no contact email on file)");
  panel.appendChild(toRow);
  if (draftEmail.from) {
    const fromRow = document.createElement("div");
    fromRow.className = "admin-notif-draft-to";
    fromRow.textContent = "From: " + draftEmail.from;
    panel.appendChild(fromRow);
  }

  const subjectInput = document.createElement("input");
  subjectInput.type = "text";
  subjectInput.className = "admin-notif-draft-input";
  subjectInput.value = draftEmail.subject || "";
  panel.appendChild(subjectInput);

  const bodyTextarea = document.createElement("textarea");
  bodyTextarea.className = "admin-notif-draft-textarea";
  bodyTextarea.value = draftEmail.body || "";
  panel.appendChild(bodyTextarea);

  const actions = document.createElement("div");
  actions.className = "admin-notif-draft-actions";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "admin-notif-draft-copy-btn";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", async () => {
    const text = `To: ${draftEmail.to}\nSubject: ${subjectInput.value}\n\n${bodyTextarea.value}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
      }
    } catch (e) { console.error("Copy failed:", e); }
  });
  actions.appendChild(copyBtn);

  const mailtoLink = document.createElement("a");
  mailtoLink.className = "admin-notif-draft-mailto-btn";
  mailtoLink.textContent = "Open in email app";
  mailtoLink.target = "_blank";
  mailtoLink.href = `mailto:${encodeURIComponent(draftEmail.to || "")}?subject=${encodeURIComponent(subjectInput.value)}&body=${encodeURIComponent(bodyTextarea.value)}`;
  actions.appendChild(mailtoLink);

  // Real auto-send, via the Worker's /api/send-email route (Resend) - only
  // shown for drafts explicitly opted in with sendEnabled:true (currently
  // just the stale-client nudge). Every other draft type still falls back
  // to Copy/mailto only, per the plan's one-flow-at-a-time rollout.
  if (draftEmail.sendEnabled && draftEmail.from) {
    const sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.className = "admin-notif-draft-send-btn";
    sendBtn.textContent = item && item.sent ? "Sent ✓" : "Send";
    sendBtn.disabled = !!(item && item.sent);

    const statusEl = document.createElement("div");
    statusEl.className = "admin-notif-draft-status";

    sendBtn.addEventListener("click", async () => {
      sendBtn.disabled = true;
      sendBtn.textContent = "Sending...";
      statusEl.textContent = "";
      try {
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: draftEmail.to,
            subject: subjectInput.value,
            body: bodyTextarea.value,
            from: draftEmail.from
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || `Send failed (${res.status})`);
        }
        sendBtn.textContent = "Sent ✓";
        statusEl.textContent = "Sent successfully.";
        statusEl.classList.add("success");
        if (item) {
          item.sent = true;
          persistAdminNotifications();
        }
      } catch (e) {
        console.error("Send email failed:", e);
        sendBtn.disabled = false;
        sendBtn.textContent = "Send";
        statusEl.textContent = "Couldn't send automatically (" + e.message + ") - use Copy or \"Open in email app\" below instead.";
        statusEl.classList.add("error");
      }
    });

    actions.appendChild(sendBtn);
    panel.appendChild(actions);
    panel.appendChild(statusEl);
    return panel;
  }

  panel.appendChild(actions);
  return panel;
}

function initAdminNotifBell() {
  const bellBtn = document.getElementById("adminNotifBellBtn");
  const dropdown = document.getElementById("adminNotifDropdown");
  const markAllBtn = document.getElementById("adminNotifMarkAllReadBtn");
  if (!bellBtn || !dropdown) return;

  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === "none" ? "flex" : "none";
  });
  document.addEventListener("click", (e) => {
    if (dropdown.style.display !== "none" && !dropdown.contains(e.target) && e.target !== bellBtn) {
      dropdown.style.display = "none";
    }
  });
  if (markAllBtn) {
    markAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      let changed = false;
      adminNotifications.forEach(n => {
        if (!n.read) { n.read = true; changed = true; }
      });
      if (changed) {
        renderAdminNotifications();
        persistAdminNotifications();
      }
    });
  }
}

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

// The Contract & Invoice Status Tracker deliberately keeps its own record
// list at agency/contractInvoices rather than inside clientsDb (a contract
// can exist before someone is a fully onboarded client - see that tool's
// own comment header) - so the only way to surface a read-only billing
// summary on a client's portal is a direct read of that collection here,
// matched back to a client by name. One read per sync rather than a
// standing listener, since this only needs to be current as of the next
// save, not instantaneous.
async function fetchBillingSummaries() {
  const summaries = {};
  try {
    const snap = await window.firebaseDb.collection("agency").doc("contractInvoices").get();
    const list = (snap.exists && snap.data().list) || [];
    list.forEach(rec => {
      if (!rec.clientName) return;
      summaries[rec.clientName.toLowerCase()] = {
        contractStatus: rec.contractStatus || "",
        contractRenewalDate: rec.contractRenewalDate || "",
        invoiceStatus: rec.invoiceStatus || "",
        invoiceAmount: rec.invoiceAmount || "",
        invoiceDueDate: rec.invoiceDueDate || "",
        invoicePaidDate: rec.invoicePaidDate || ""
      };
    });
  } catch (e) {
    console.warn("Could not read contract/invoice records for billing summaries:", e);
  }
  return summaries;
}

// Same pattern as fetchBillingSummaries above, but for the Referral
// Tracker's agency/referrals collection - it too deliberately lives
// outside clientsDb (a referral can come from someone who isn't a client
// yet). Aggregates every entry where referrerName matches this client by
// name into one summary: how many referrals, how many became clients, and
// the individual entries so the portal can list them.
async function fetchReferralSummaries() {
  const summaries = {};
  try {
    const snap = await window.firebaseDb.collection("agency").doc("referrals").get();
    const list = (snap.exists && snap.data().list) || [];
    list.forEach(rec => {
      if (!rec.referrerName) return;
      const key = rec.referrerName.toLowerCase();
      if (!summaries[key]) {
        summaries[key] = { totalReferrals: 0, becameClientCount: 0, entries: [] };
      }
      summaries[key].totalReferrals++;
      if (rec.status === 'Became Client') summaries[key].becameClientCount++;
      summaries[key].entries.push({
        referredName: rec.referredName || "",
        dateReferred: rec.dateReferred || "",
        status: rec.status || "Pending",
        rewardStatus: rec.rewardStatus || "Not Owed",
        rewardAmount: rec.rewardAmount || ""
      });
    });
  } catch (e) {
    console.warn("Could not read referral records for referral summaries:", e);
  }
  return summaries;
}

async function syncPublicPortalDocs(dbSnapshot) {
  if (!window.firebaseDb || !window.firebaseDb.collection) return;

  const entries = Object.entries(dbSnapshot).filter(
    ([, client]) => client && client.portalConfig && client.portalConfig.magicToken
  );

  const billingSummaries = await fetchBillingSummaries();
  const referralSummaries = await fetchReferralSummaries();

  for (const [name, client] of entries) {
    const token = client.portalConfig.magicToken;
    const publicRef = window.firebaseDb.collection("clients").doc(token);
    const localChecklist = client.onboardingChecklist || client.onboarding || [];
    const localClientChecklist = client.clientChecklist || [];
    const localNotifications = client.notifications || [];
    const approvalsWrapper = {
      pendingApprovals: client.pendingApprovals || [],
      approvalHistory: client.approvalHistory || []
    };

    let preservedLastVisitedAt = null;

    try {
      // Fold in onboarding progress and approval decisions the client
      // already made directly on the portal so this save doesn't stomp on
      // them. (Pulling that progress into the real, live clientsDb so the
      // admin side actually SEES it is handled separately and continuously
      // by ensureClientPortalListeners below - not tied to whether the
      // admin happens to save something.)
      //
      // clientChecklist is deliberately NOT folded here (it used to be,
      // one-directionally: only ever pulling a checked box in from the
      // existing portal doc, never a match). That meant an account manager
      // unchecking a box in Client Portal Manager and saving would get
      // silently reverted back to checked right here, since the portal's
      // existing doc still showed it checked from before. clientChecklist
      // is kept in sync continuously and bidirectionally by
      // ensureClientPortalListeners below instead, so by the time a save
      // happens client.clientChecklist already reflects the latest state
      // from both sides - the admin's own edit (made just now, in memory)
      // should simply win here, not get folded against a stale snapshot.
      const existing = await publicRef.get();
      if (existing.exists) {
        const existingData = existing.data();
        foldInOnboardingChecked(localChecklist, existingData.onboardingChecklist);
        foldInApprovalDecisions(approvalsWrapper, existingData);
        foldInTestimonialSubmission(client, existingData);
        foldInNotificationReadState(localNotifications, existingData.notifications);
        // lastVisitedAt is written directly by the portal on load (see
        // portal/js/app.js) and read back into clientsDb by
        // ensureClientPortalListeners below - the admin never sets this
        // field, so it just needs to be carried forward here rather than
        // silently wiped by this being a full (non-merge) .set() below.
        preservedLastVisitedAt = existingData.lastVisitedAt || null;
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
      // The client's own testimonial submission (Leave a Testimonial view)
      // - folded in above from the existing public doc first so this save
      // never stomps on a submission that just came in.
      testimonialSubmission: client.testimonialSubmission || null,
      // Published report snapshots (see competitor-analysis/script.js's
      // publishToClientPortal). Admin-only to create - clients never write
      // this field, so no fold-in-existing-progress step is needed here
      // the way there is for the two checklists above.
      reportArchive: client.reportArchive || [],
      // Bell-icon notification feed (new approval requests, new published
      // reports). Admin-only to create; the client can only mark entries
      // read (folded in above), never add their own.
      notifications: localNotifications,
      // Read-only billing snapshot pulled from the Contract & Invoice
      // Status Tracker (see fetchBillingSummaries above). null if this
      // client isn't tracked there under a matching name. The portal only
      // shows this at all if portalConfig.showBillingInPortal is on.
      billingSummary: billingSummaries[name.toLowerCase()] || null,
      // Read-only referral tracking pulled from the Referral Tracker (see
      // fetchReferralSummaries above). null if this client has never
      // referred anyone under a matching name.
      referralSummary: referralSummaries[name.toLowerCase()] || null,
      // Carried forward as-is (see preservedLastVisitedAt above) - the
      // admin never writes this, only preserves whatever the portal itself
      // already recorded so a Hub save doesn't erase it.
      lastVisitedAt: preservedLastVisitedAt
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
      const changedClientChecklist = syncClientChecklistFromPortal(currentClient.clientChecklist, data.clientChecklist);

      // Capture known approval IDs before folding so any newly-arrived
      // decisions can be identified afterward and turned into an admin
      // notification below - foldInApprovalDecisions itself only reports
      // whether *something* changed, not which entries are new.
      const priorApprovalIds = new Set((currentClient.approvalHistory || []).map(a => a.id));
      const changedApprovals = foldInApprovalDecisions(currentClient, data);
      if (changedApprovals) {
        const decisionLabels = { approved: "Approved", minor: "Approved with Minor Corrections", revision: "Revision Requested" };
        (currentClient.approvalHistory || [])
          .filter(a => !priorApprovalIds.has(a.id))
          .forEach(entry => {
            const label = decisionLabels[entry.decision] || entry.decision || "responded";
            pushAdminNotification("approval", `${name}: "${entry.title}" — ${label}`);
          });
      }

      const changedTestimonial = foldInTestimonialSubmission(currentClient, data);
      if (changedTestimonial) {
        pushAdminNotification("testimonial", `${name} submitted a testimonial.`);
      }

      // Portal last-visited tracking - the portal writes lastVisitedAt to
      // its own public doc on load (see portal/js/app.js); pull it into
      // clientsDb here the same way everything else client-driven arrives,
      // so admin-facing views (Agency Health Dashboard) can show it
      // without a separate fetch.
      const changedVisit = !!(data.lastVisitedAt && data.lastVisitedAt !== currentClient.portalLastVisitedAt);
      if (changedVisit) {
        currentClient.portalLastVisitedAt = data.lastVisitedAt;
      }

      if (changedOnboarding || changedClientChecklist || changedApprovals || changedTestimonial || changedVisit) {
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

  // Bug fix (Hub-wide stress test): this schema-migration/defaults pass
  // was defined but never actually called anywhere, so legacy client
  // records missing newer fields (e.g. older copywriting/onboarding
  // formats) were never backfilled. Every write inside it is guarded to
  // only fill in genuinely missing/undefined data, so it's safe to run
  // on every load.
  migrateSchemaAndDefaults();

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
        clientsDbDocVersion = typeof metaSnap.data().version === 'number' ? metaSnap.data().version : 0;
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

  // Read live from the sidebar DOM instead of a hand-maintained list -
  // the old hardcoded list here only covered 17 of 60+ tools and had
  // already drifted (My Clients, added this session, was never going to
  // be in a list someone has to remember to update by hand). .nav-item-btn
  // also matches the Admin footer buttons (Team Access, Service Pricing,
  // etc.), which is desirable - they're just as reachable via the
  // sidebar, so they should be just as searchable here. offsetParent
  // check skips anything currently hidden (a collapsed section still in
  // the DOM, or a Team-Access-restricted section/footer tool) so a
  // restricted teammate can't use the palette to reach something the
  // sidebar is deliberately hiding from them.
  const GENERIC_TOOL_ICON = 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5';
  function getNavTools() {
    return Array.from(document.querySelectorAll('.nav-item-btn[data-tab]'))
      .filter(btn => btn.offsetParent !== null)
      .map(btn => {
        const span = btn.querySelector('span:last-child');
        const pathEl = btn.querySelector('svg path');
        return {
          kind: 'tool',
          id: btn.getAttribute('data-tab'),
          title: (span ? span.textContent : btn.textContent).trim(),
          icon: pathEl ? pathEl.getAttribute('d') : GENERIC_TOOL_ICON
        };
      });
  }

  // Client jump: only searched (not listed by default - a full client
  // roster dumped into the palette on every open would bury the tool
  // list), and only once the query is non-trivial so "a" doesn't match
  // half the roster. Matches My Clients' "Open" behavior exactly -
  // switchClient + land on the dashboard - so Cmd+K becomes a second,
  // faster way to reach the same place, not a different destination.
  const CLIENT_ICON = 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8';
  function getClientMatches(q) {
    if (!q || q.length < 2) return [];
    const sandboxName = "Quick Sandbox (One-Offs)";
    return Object.keys(clientsDb)
      .filter(name => name !== sandboxName && name.toLowerCase().includes(q))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 8)
      .map(name => ({ kind: 'client', id: name, title: name, icon: CLIENT_ICON }));
  }

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
    const q = query.toLowerCase().trim();
    const toolMatches = getNavTools().filter(t => t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
    // Client matches first when there's a real query - "type a client
    // name" is usually someone who already knows exactly where they want
    // to go, same as picking that client from the workspace switcher.
    currentResults = [...getClientMatches(q), ...toolMatches];
    selectedIndex = 0;

    if (currentResults.length === 0) {
      resultsEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">No matches found.</div>';
      return;
    }

    resultsEl.innerHTML = currentResults.map((item, idx) => `
      <div class="cmdk-item ${idx === 0 ? 'active' : ''}" data-index="${idx}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${item.icon}"></path></svg>
        <div>
          <div class="cmdk-item-title">${escapeHtmlCore(item.title)}</div>
          <div class="cmdk-item-subtitle">${item.kind === 'client' ? 'Switch to client' : 'Navigation'}</div>
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
    if (item.kind === 'client') {
      switchClient(item.id);
      navigateToTab('tab-dashboard');
      return;
    }
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
