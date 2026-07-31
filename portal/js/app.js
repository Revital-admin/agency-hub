// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDszpFkygCjr8ktkPe0ILxbLNHxRkb0bIY",
  authDomain: "revitalhub-895c1.firebaseapp.com",
  projectId: "revitalhub-895c1",
  storageBucket: "revitalhub-895c1.appspot.com",
  messagingSenderId: "367204555811",
  appId: "1:367204555811:web:1ec1e2fcb02db7dae4c7ba"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Globals
let clientName = "";
let clientToken = "";
let clientData = null;

// DOM Elements
const loader = document.getElementById("loader");
const appLayout = document.getElementById("app");
const brandName = document.getElementById("brandName");
const brandLogo = document.getElementById("brandLogo");
const welcomeHeader = document.getElementById("welcomeHeader");
const checklistContainer = document.getElementById("checklistContainer");
const amInitial = document.getElementById("amInitial");
const amName = document.getElementById("amName");
const amEmail = document.getElementById("amEmail");
const amPhone = document.getElementById("amPhone");
const btnBookCall = document.getElementById("btnBookCall");
const btnRevision = document.getElementById("btnRevision");
const btnContentRequest = document.getElementById("btnContentRequest");
const btnUploadFiles = document.getElementById("btnUploadFiles");
const btnDriveFolder = document.getElementById("btnDriveFolder");
const quickActionsWidget = document.getElementById("quickActionsWidget");
const notifBellBtn = document.getElementById("notifBellBtn");
const notifBellBadge = document.getElementById("notifBellBadge");
const notifDropdown = document.getElementById("notifDropdown");
const notifList = document.getElementById("notifList");
const notifMarkAllReadBtn = document.getElementById("notifMarkAllReadBtn");
const reportArchiveFilterBar = document.getElementById("reportArchiveFilterBar");
const reportArchiveSearchInput = document.getElementById("reportArchiveSearchInput");
const reportArchiveSortSelect = document.getElementById("reportArchiveSortSelect");
let reportArchiveSearchText = "";
let reportArchiveSortOrder = "newest";

if (reportArchiveSearchInput) {
  reportArchiveSearchInput.addEventListener("input", (e) => {
    reportArchiveSearchText = e.target.value || "";
    renderReportArchive();
  });
}
if (reportArchiveSortSelect) {
  reportArchiveSortSelect.addEventListener("change", (e) => {
    reportArchiveSortOrder = e.target.value || "newest";
    renderReportArchive();
  });
}


// Nav and Views
const navBtns = document.querySelectorAll(".nav-btn");
const viewSections = document.querySelectorAll(".view-section");

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  clientName = params.get("c") || "";
  clientToken = params.get("t") || "";
}

function init() {
  getUrlParams();

  // The token IS the document ID now (a capability-URL / "anyone with the
  // link" model) - clientName is only used for the on-screen label below,
  // it no longer has any bearing on access.
  if (!clientToken) {
    loader.innerHTML = "<h2>Access Denied</h2><p>Invalid or missing magic link.</p>";
    return;
  }

  const docRef = db.collection("clients").doc(clientToken);

  // Real-time listener
  docRef.onSnapshot((doc) => {
    if (doc.exists) {
      clientData = doc.data();
      renderPortal();

      // Hide loader on first success
      if (loader.style.display !== "none") {
        loader.style.display = "none";
        appLayout.style.display = "flex";
        recordPortalVisit();
      }
    } else {
      loader.innerHTML = "<h2>Access Denied</h2><p>Link expired or invalid token.</p>";
    }
  }, (err) => {
    console.error("Portal listener error:", err);
    loader.innerHTML = "<h2>Access Denied</h2><p>Unable to load this portal.</p>";
  });
}

// Records that this client actually opened their portal - surfaced to
// Ronald on the Agency Health Dashboard so he can tell who's engaging with
// it versus who's never opened the link. Written once per page load (not
// on every live re-render, which would happen far too often) with a
// merge write scoped to just this one field, matching the Firestore rule
// that only allows public writes to touch specific known fields.
let hasRecordedVisit = false;
function recordPortalVisit() {
  if (hasRecordedVisit) return;
  hasRecordedVisit = true;
  const docRef = db.collection("clients").doc(clientToken);
  docRef.set({ lastVisitedAt: new Date().toISOString() }, { merge: true }).catch(err => {
    console.error("Error recording portal visit:", err);
  });
}

// Same idea as recordPortalVisit above, one level more specific: fires
// when the client actually opens the Mood Boards tab (see the nav-btn
// click handler below), not just on page load, and writes one first-
// viewed timestamp per board instead of one per whole visit. Write-once
// per boardId - a key already in clientData.moodBoardViews never gets
// overwritten, so revisiting the tab later doesn't send another write or
// generate a second "viewed" notification on the admin side (see
// foldInMoodBoardViews in app.js, which relies on this same write-once
// behavior).
function recordMoodBoardViews() {
  const boards = Array.isArray(clientData.moodBoards) ? clientData.moodBoards.filter(b => b.sharedWithClient) : [];
  if (!boards.length) return;

  if (!clientData.moodBoardViews) clientData.moodBoardViews = {};
  const nowIso = new Date().toISOString();
  let changed = false;
  boards.forEach(board => {
    if (board.id && !clientData.moodBoardViews[board.id]) {
      clientData.moodBoardViews[board.id] = nowIso;
      changed = true;
    }
  });
  if (!changed) return;

  const docRef = db.collection("clients").doc(clientToken);
  docRef.set({ moodBoardViews: clientData.moodBoardViews }, { merge: true }).catch(err => {
    console.error("Error recording mood board view:", err);
  });
}

function renderPortal() {
  const config = clientData.portalConfig;
  
  // Branding
  brandName.textContent = clientName + " Portal";
  if (config.clientLogoUrl) {
    brandLogo.src = config.clientLogoUrl;
    brandLogo.style.display = "block";
    brandName.style.display = "none";
  } else {
    brandLogo.style.display = "none";
    brandName.style.display = "block";
  }
  
  if (config.clientContactName) {
    welcomeHeader.textContent = "Welcome back, " + config.clientContactName + "!";
  } else {
    welcomeHeader.textContent = "Welcome back!";
  }

  if (config.primaryColor) {
    document.documentElement.style.setProperty("--color-primary", config.primaryColor);
    document.documentElement.style.setProperty("--color-primary-glow", hexToRgba(config.primaryColor, 0.2));
  }
  if (config.secondaryColor) {
    document.documentElement.style.setProperty("--color-secondary", config.secondaryColor);
    document.documentElement.style.setProperty("--color-secondary-glow", hexToRgba(config.secondaryColor, 0.2));
  } else {
    document.documentElement.style.setProperty("--color-secondary", "#6366f1");
    document.documentElement.style.setProperty("--color-secondary-glow", hexToRgba("#6366f1", 0.2));
  }
  if (config.accentColor) {
    document.documentElement.style.setProperty("--color-accent", config.accentColor);
    document.documentElement.style.setProperty("--color-accent-glow", hexToRgba(config.accentColor, 0.2));
  } else {
    document.documentElement.style.setProperty("--color-accent", "#f59e0b");
    document.documentElement.style.setProperty("--color-accent-glow", hexToRgba("#f59e0b", 0.2));
  }

  // Account Manager
  if (config.accountManagerName) {
    amName.textContent = config.accountManagerName;
    amInitial.textContent = config.accountManagerName.charAt(0).toUpperCase();
  }
  if (config.accountManagerEmail) {
    amEmail.textContent = "Email " + config.accountManagerName.split(' ')[0];
    amEmail.href = "mailto:" + config.accountManagerEmail;
  }
  if (config.accountManagerPhone) {
    var amFirstName = config.accountManagerName ? config.accountManagerName.split(' ')[0] : "";
    amPhone.textContent = "Call/Text " + amFirstName;
    amPhone.href = "tel:" + config.accountManagerPhone.replace(/[^0-9+]/g, '');
    amPhone.style.display = "block";
  } else {
    amPhone.style.display = "none";
  }
  if (config.calendlyLink) {
    btnBookCall.style.display = "inline-flex";
    btnBookCall.href = config.calendlyLink;
  }

  // Iframes setup
  setupIframe("navProjects", "projectsIframe", config.projectsEmbedUrl);
  setupIframe("navCalendar", "calendarIframe", config.calendarEmbedUrl);
  setupIframe("navCampaign", "campaignIframe", config.campaignBriefUrl);
  setupIframe("navCompleted", "completedIframe", config.completedWorkUrl);
  setupIframe("navAssets", "assetsIframe", config.brandAssetsUrl);

  // Monthly Reports is always visible - it shows the published report
  // archive natively regardless of whether an external embed link is also
  // configured. The embed (if any) is just an optional extra section
  // beneath the archive, not the only content.
  document.getElementById("navMonthlyReports").style.display = "flex";
  const monthlyReportsEmbedWrapper = document.getElementById("monthlyReportsEmbedWrapper");
  const monthlyReportsIframe = document.getElementById("monthlyReportsIframe");
  if (config.monthlyReportsUrl) {
    monthlyReportsEmbedWrapper.style.display = "block";
    monthlyReportsIframe.dataset.src = config.monthlyReportsUrl;
    const viewSection = document.getElementById("view-monthlyreports");
    if (viewSection && viewSection.classList.contains("active") && monthlyReportsIframe.src !== config.monthlyReportsUrl) {
      monthlyReportsIframe.src = config.monthlyReportsUrl;
    }
  } else {
    monthlyReportsEmbedWrapper.style.display = "none";
  }

  renderEngagementStage(config.engagementStage);
  renderReportArchive();
  renderNotifications();

  const navBilling = document.getElementById("navBilling");
  if (navBilling) {
    if (config.showBillingInPortal && clientData.billingSummary) {
      navBilling.style.display = "flex";
      renderBillingSummary(clientData.billingSummary);
    } else {
      navBilling.style.display = "none";
    }
  }

  renderRenewalBanner(config.showBillingInPortal ? clientData.billingSummary : null);

  renderReferralSummary(clientData.referralSummary);

  const analyticsEmbed = document.getElementById("analyticsEmbedContainer");
  const statsPlaceholder = document.getElementById("dashboardStatsPlaceholder");
  if (config.liveAnalyticsUrl) {
    analyticsEmbed.style.display = "block";
    document.getElementById("analyticsIframe").src = config.liveAnalyticsUrl;
    if (statsPlaceholder) statsPlaceholder.style.display = "none";
  } else if (statsPlaceholder) {
    statsPlaceholder.style.display = "grid";
  }

  const btnFeedback = document.getElementById("btnFeedback");
  if (config.feedbackFormUrl) {
    btnFeedback.style.display = "inline-flex";
    btnFeedback.href = config.feedbackFormUrl;
  }

  let hasQuickActions = false;
  if (config.revisionFormUrl) {
    btnRevision.style.display = "inline-flex";
    btnRevision.href = config.revisionFormUrl;
    hasQuickActions = true;
  }
  if (config.contentRequestFormUrl) {
    btnContentRequest.style.display = "inline-flex";
    btnContentRequest.href = config.contentRequestFormUrl;
    hasQuickActions = true;
  }
  if (config.fileUploadUrl) {
    btnUploadFiles.style.display = "inline-flex";
    btnUploadFiles.href = config.fileUploadUrl;
    hasQuickActions = true;
  }
  if (config.driveFolderUrl) {
    btnDriveFolder.style.display = "inline-flex";
    btnDriveFolder.href = config.driveFolderUrl;
    hasQuickActions = true;
  }
  if (hasQuickActions) {
    quickActionsWidget.style.display = "block";
  }


  // Checklist
  renderChecklist();

  // Content Approvals
  renderApprovalsView();

  // Brand Kit (Lite) - was defined but never called, so it never
  // actually rendered for any client. Fixed as part of the Hub-wide
  // bug pass.
  renderBrandKit();

  // Open Action Items - same dead-call bug as Brand Kit above.
  renderActionItems();

  // Mood Boards shared by the team
  renderMoodBoards();

  // Testimonial request
  renderTestimonialView();
}

function setupIframe(navId, iframeId, url) {
  const navBtn = document.getElementById(navId);
  const iframe = document.getElementById(iframeId);
  if (url) {
    navBtn.style.display = "flex";
    
    // Store URL for lazy-loading instead of booting it up immediately
    iframe.dataset.src = url; 
    
    // Check if the view is currently active. If it is, load it immediately.
    // Otherwise, it will load when the user clicks the navigation button.
    const viewSection = document.getElementById(navBtn.dataset.target);
    if (viewSection && viewSection.classList.contains("active")) {
      if (iframe.src !== url) iframe.src = url;
    }
  } else {
    navBtn.style.display = "none";
  }
}

// ── Monthly Reports (published archive) ──
// Same metric key -> label mapping used by the admin-side report tool
// (competitor-analysis/script.js). Duplicated here rather than shared
// since this is a separate iframe document.
const REPORT_METRIC_LABELS = {
  followers_total: "Followers (Total)",
  followers_new: "Followers (New)",
  impressions: "Impressions",
  engagement: "Engagement Rate",
  posted: "Content Posted",
  top_post: "Top Performing Post"
};

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function renderReportArchive() {
  const listEl = document.getElementById("reportArchiveList");
  const detailEl = document.getElementById("reportDetailView");
  if (!listEl || !detailEl) return;

  detailEl.style.display = "none";
  listEl.style.display = "flex";
  listEl.style.flexDirection = "column";
  listEl.style.gap = "16px";
  listEl.innerHTML = "";

  const reports = Array.isArray(clientData.reportArchive) ? clientData.reportArchive : [];

  if (reports.length === 0) {
    if (reportArchiveFilterBar) reportArchiveFilterBar.style.display = "none";
    listEl.style.display = "block";
    listEl.innerHTML = '<p class="report-archive-empty" style="color:var(--color-text-secondary);">No reports have been published yet. Check back soon!</p>';
    return;
  }

  // Search box only earns its keep once there's actually something to
  // search through - a handful of reports is faster to just eyeball.
  if (reportArchiveFilterBar) {
    reportArchiveFilterBar.style.display = reports.length > 3 ? "flex" : "none";
  }

  const searchText = reportArchiveSearchText.trim().toLowerCase();
  const filteredReports = !searchText ? reports : reports.filter(report => {
    const haystack = [report.monthYear, report.notes, report.date, report.focus]
      .filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(searchText);
  });

  if (filteredReports.length === 0) {
    listEl.style.display = "block";
    listEl.innerHTML = '<p class="report-archive-empty" style="color:var(--color-text-secondary);">No reports match your search.</p>';
    return;
  }

  // reports is stored oldest-to-newest as entries are added, so reversing
  // gives newest-first; "oldest first" is just the array as-is.
  const orderedReports = reportArchiveSortOrder === "oldest" ? filteredReports : [...filteredReports].reverse();

  orderedReports.forEach((report) => {
    const card = document.createElement("div");
    card.className = "report-card";
    card.style.background = "var(--color-bg-elevated)";
    card.style.border = "1px solid var(--color-border)";
    card.style.borderRadius = "8px";
    card.style.padding = "20px";
    
    // Check if it's the old schema or the new schema
    if (report.monthYear && report.url) {
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0 0 8px 0; font-size:18px;">${escapeHtml(report.monthYear)}</h3>
            <p style="margin:0; font-size:14px; color:var(--color-text-secondary);">${escapeHtml(report.notes || "")}</p>
          </div>
          <a href="${escapeHtml(report.url)}" target="_blank" class="btn-primary" style="text-decoration:none;">View Report</a>
        </div>
      `;
    } else {
      // old schema
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0 0 8px 0; font-size:18px;">${escapeHtml(report.date || "Untitled Report")}</h3>
            <p style="margin:0; font-size:14px; color:var(--color-text-secondary);">${escapeHtml(report.focus || "")}</p>
          </div>
          <button class="btn-primary">View Details</button>
        </div>
      `;
      card.querySelector('button').addEventListener("click", () => showReportDetail(report));
    }
    listEl.appendChild(card);
  });
}

let currentReportForExport = null;

function showReportDetail(report) {
  const listEl = document.getElementById("reportArchiveList");
  const detailEl = document.getElementById("reportDetailView");
  const contentEl = document.getElementById("reportDetailContent");
  if (!listEl || !detailEl || !contentEl) return;

  currentReportForExport = report;
  const downloadBtn = document.getElementById("btnDownloadReportPdf");
  if (downloadBtn) downloadBtn.style.display = "inline-flex";

  listEl.style.display = "none";
  detailEl.style.display = "block";

  const platforms = Array.isArray(report.platforms) ? report.platforms : [];
  const cellData = report.cellData || {};
  const metricKeys = Object.keys(REPORT_METRIC_LABELS);

  let tableHtml = '<table class="report-metrics-table"><thead><tr><th>Metric</th>';
  platforms.forEach((p) => {
    tableHtml += `<th><span class="platform-dot" style="background:${escapeHtml(p.color || "#999")}"></span>${escapeHtml(p.name || "Platform")}</th>`;
  });
  tableHtml += "</tr></thead><tbody>";

  metricKeys.forEach((key) => {
    tableHtml += `<tr><td class="metric-label">${escapeHtml(REPORT_METRIC_LABELS[key])}</td>`;
    platforms.forEach((_, idx) => {
      const val = cellData[key] && cellData[key][idx] ? cellData[key][idx] : "\u2014";
      tableHtml += `<td>${escapeHtml(val)}</td>`;
    });
    tableHtml += "</tr>";
  });
  tableHtml += "</tbody></table>";

  contentEl.innerHTML = `
    <div class="report-detail-header">
      <h3>${escapeHtml(report.date || "Report")}</h3>
      ${report.preparedBy ? `<p class="report-meta">Prepared by ${escapeHtml(report.preparedBy)}</p>` : ""}
      ${report.focus ? `<p class="report-meta">Focus: ${escapeHtml(report.focus)}</p>` : ""}
    </div>
    ${report.wins ? `<div class="report-wins"><strong>Key wins this month</strong><p>${escapeHtml(report.wins)}</p></div>` : ""}
    ${platforms.length > 0 ? tableHtml : ""}
  `;
}

// Engagement-stage stepper: a coarse, admin-set "where are we overall"
// indicator (set from client-portal-manager's "Engagement Stage" dropdown),
// separate from the client checklist - the checklist is a list of specific
// tasks, this is just "onboarding / strategy / production / review /
// delivered" so a client doesn't have to ask "so what's happening now?"
const ENGAGEMENT_STAGES = [
  { key: "onboarding", label: "Onboarding" },
  { key: "strategy", label: "Strategy" },
  { key: "production", label: "Production" },
  { key: "review", label: "Review" },
  { key: "delivered", label: "Delivered" }
];

function renderEngagementStage(stageKey) {
  const widget = document.getElementById("dashEngagementStageWidget");
  const track = document.getElementById("dashEngagementStageTrack");
  if (!widget || !track) return;

  const currentIndex = ENGAGEMENT_STAGES.findIndex(s => s.key === stageKey);
  if (currentIndex === -1) {
    widget.style.display = "none";
    return;
  }

  widget.style.display = "block";
  track.innerHTML = "";

  ENGAGEMENT_STAGES.forEach((stage, i) => {
    const stepEl = document.createElement("div");
    stepEl.className = "engagement-stage-step";
    if (i < currentIndex) stepEl.classList.add("stage-done");
    else if (i === currentIndex) stepEl.classList.add("stage-current");

    const dot = document.createElement("span");
    dot.className = "engagement-stage-dot";
    const label = document.createElement("span");
    label.className = "engagement-stage-label";
    label.textContent = stage.label;

    stepEl.appendChild(dot);
    stepEl.appendChild(label);
    track.appendChild(stepEl);

    if (i < ENGAGEMENT_STAGES.length - 1) {
      const connector = document.createElement("span");
      connector.className = "engagement-stage-connector";
      if (i < currentIndex) connector.classList.add("stage-done");
      track.appendChild(connector);
    }
  });
}

function renderChecklist() {
  checklistContainer.innerHTML = "";

  const checklistHeading = document.getElementById("checklistHeading");

  // The client-facing checklist is its own, fully independent list -
  // configured per-client in the hub's "Client Checklist" section - rather
  // than a filtered view of the account manager's internal onboarding
  // tracker (clientData.onboardingChecklist). That older approach kept
  // leaking internal-only tasks onto the client's portal because it relied
  // on keyword-guessing or a manual per-task visibility flag layered on
  // top of internal data. This is just whatever the admin put here.
  const allItems = Array.isArray(clientData.clientChecklist) ? clientData.clientChecklist : [];

  const progressWidget = document.getElementById("dashOnboardingProgressWidget");

  if (allItems.length === 0) {
    if (progressWidget) progressWidget.style.display = "none";
    return;
  }

  let completedCount = 0;

  allItems.forEach(item => {
    if (item.checked) completedCount++;

    const div = document.createElement("label");
    div.className = "check-item";
    
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!item.checked;
    
    cb.addEventListener("change", (e) => {
      item.checked = e.target.checked;
      updateFirebaseChecklist();
    });

    const span = document.createElement("span");
    span.textContent = item.label ? item.label.replace("Client: ", "") : "Task"; 

    div.appendChild(cb);
    div.appendChild(span);
    checklistContainer.appendChild(div);
  });

  // Once every item is checked off, hide the whole sidebar widget - a
  // finished checklist sitting there forever just adds clutter once it's
  // no longer something the client needs to act on. Re-appears
  // automatically if anything gets unchecked later (admin edit, or the
  // client unchecking something on their own), since this whole function
  // re-runs on every live sync.
  const isComplete = allItems.length > 0 && completedCount === allItems.length;
  const checklistWidget = document.getElementById("checklistWidget");
  if (checklistWidget) {
    checklistWidget.style.display = isComplete ? "none" : "";
  }
  if (checklistHeading) {
    checklistHeading.textContent = isComplete ? "Checklist" : "Onboarding Checklist";
  }

  // Dashboard progress bar - same completion math, surfaced on the main
  // view so the client sees it without opening the sidebar. Hides itself
  // once onboarding is fully complete rather than sitting at 100% forever.
  if (progressWidget) {
    if (isComplete) {
      progressWidget.style.display = "none";
    } else {
      progressWidget.style.display = "block";
      const pct = Math.round((completedCount / allItems.length) * 100);
      const label = document.getElementById("dashOnboardingProgressLabel");
      const pctEl = document.getElementById("dashOnboardingProgressPct");
      const fill = document.getElementById("dashOnboardingProgressFill");
      if (label) label.textContent = `Onboarding: ${completedCount} of ${allItems.length} complete`;
      if (pctEl) pctEl.textContent = `${pct}%`;
      if (fill) fill.style.width = `${pct}%`;
    }
  }

  // Check Confetti
  if (allItems.length > 0 && completedCount === allItems.length) {
    if (!window.hasFiredConfetti) {
      fireConfetti();
      window.hasFiredConfetti = true;
    }
  }
}


function updateFirebaseChecklist() {
  const docRef = db.collection("clients").doc(clientToken);

  // Firestore rules only allow unauthenticated writes that touch the
  // clientChecklist field - this is the client's own separate checklist,
  // not the account manager's internal onboarding tracker.
  const checklist = Array.isArray(clientData.clientChecklist) ? clientData.clientChecklist : [];
  const purifiedChecklist = JSON.parse(JSON.stringify(checklist));

  docRef.set({
    clientChecklist: purifiedChecklist
  }, { merge: true }).catch(err => {
    console.error("Error updating checklist:", err);
  });
}

// ── Billing (read-only) ──
// Pulled from the Contract & Invoice Status Tracker via the hub's
// syncPublicPortalDocs (see app.js's fetchBillingSummaries). Nothing here
// is writable from the portal - no payment is ever collected in this view.
const BILLING_STATUS_CLASSES = {
  "Not Sent": "status-not-sent",
  "Sent": "status-sent",
  "Signed": "status-signed",
  "Paid": "status-paid",
  "Overdue": "status-overdue"
};

function billingPill(status) {
  const cls = BILLING_STATUS_CLASSES[status] || "status-not-sent";
  return `<span class="billing-status-pill ${cls}">${escapeHtml(status || "Not Sent")}</span>`;
}

function formatDateNice(dateStr) {
  if (!dateStr) return "--";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Surfaces the contract renewal date as a visible dashboard banner rather
// than only inside the Billing tab's table (see renderBillingSummary
// below) - clients who never open Billing still see it coming. Only
// applies when Billing visibility is turned on for this client (same gate
// as the tab itself) and there's an actual signed renewal date on file.
const RENEWAL_BANNER_WINDOW_DAYS = 30;

function renderRenewalBanner(summary) {
  const banner = document.getElementById("dashRenewalBanner");
  if (!banner) return;

  if (!summary || !summary.contractRenewalDate || summary.contractStatus !== "Signed") {
    banner.style.display = "none";
    return;
  }

  const renewalDate = new Date(summary.contractRenewalDate + "T00:00:00");
  if (isNaN(renewalDate.getTime())) {
    banner.style.display = "none";
    return;
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysUntil = Math.round((renewalDate - today) / 86400000);

  if (daysUntil > RENEWAL_BANNER_WINDOW_DAYS) {
    banner.style.display = "none";
    return;
  }

  let text;
  if (daysUntil < 0) {
    text = `Your contract renewal date (${formatDateNice(summary.contractRenewalDate)}) has passed - reach out to your account manager if you haven't heard from us.`;
  } else if (daysUntil === 0) {
    text = `Your contract renews today (${formatDateNice(summary.contractRenewalDate)}).`;
  } else {
    text = `Your contract renews in ${daysUntil} day${daysUntil === 1 ? "" : "s"} (${formatDateNice(summary.contractRenewalDate)}).`;
  }

  banner.textContent = text;
  banner.style.display = "block";
}

function renderBillingSummary(summary) {
  const grid = document.getElementById("billingSummaryGrid");
  if (!grid) return;

  if (!summary) {
    grid.innerHTML = `<div class="billing-empty">No billing information on file yet.</div>`;
    return;
  }

  grid.innerHTML = `
    <div class="billing-card">
      <div class="billing-card-label">Contract Status</div>
      <div class="billing-card-value">${billingPill(summary.contractStatus)}</div>
      ${summary.contractRenewalDate ? `<div class="billing-card-sub">Renews ${formatDateNice(summary.contractRenewalDate)}</div>` : ""}
    </div>
    <div class="billing-card">
      <div class="billing-card-label">Invoice Status</div>
      <div class="billing-card-value">${billingPill(summary.invoiceStatus)}</div>
      ${summary.invoiceAmount ? `<div class="billing-card-sub">${escapeHtml(summary.invoiceAmount)}</div>` : ""}
    </div>
    <div class="billing-card">
      <div class="billing-card-label">Invoice Due</div>
      <div class="billing-card-value">${formatDateNice(summary.invoiceDueDate)}</div>
    </div>
    <div class="billing-card">
      <div class="billing-card-label">Last Payment</div>
      <div class="billing-card-value">${formatDateNice(summary.invoicePaidDate)}</div>
    </div>
  `;
}

// ── Referral tracking (read-only) ──
// Pulled from the Referral Tracker via the hub's syncPublicPortalDocs (see
// fetchReferralSummaries in app.js). Shown unconditionally (no per-client
// toggle, unlike Billing) since this is just a reflection of referrals the
// client themselves made - nothing sensitive to gate behind an opt-in.
const REFERRAL_STATUS_CLASSES = {
  "Pending": "status-sent",
  "Became Client": "status-paid",
  "Declined": "status-overdue"
};
const REWARD_STATUS_CLASSES = {
  "Not Owed": "status-not-sent",
  "Owed": "status-sent",
  "Paid": "status-paid"
};

function referralPill(value, classMap) {
  const cls = classMap[value] || "status-not-sent";
  return `<span class="billing-status-pill ${cls}">${escapeHtml(value || "")}</span>`;
}

function renderReferralSummary(summary) {
  const section = document.getElementById("myReferralsSection");
  const summaryEl = document.getElementById("myReferralsSummary");
  const listEl = document.getElementById("myReferralsList");
  if (!section || !summaryEl || !listEl) return;

  if (!summary || !Array.isArray(summary.entries) || summary.entries.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  const clientWord = summary.becameClientCount === 1 ? "client" : "clients";
  summaryEl.textContent = `You've referred ${summary.totalReferrals} ${summary.totalReferrals === 1 ? "person" : "people"} so far - ${summary.becameClientCount} became ${clientWord}.`;

  listEl.innerHTML = summary.entries.map(entry => `
    <div class="referral-tracked-row">
      <div class="referral-tracked-main">
        <strong>${escapeHtml(entry.referredName)}</strong>
        <span class="referral-tracked-date">${escapeHtml(entry.dateReferred)}</span>
      </div>
      <div class="referral-tracked-pills">
        ${referralPill(entry.status, REFERRAL_STATUS_CLASSES)}
        ${referralPill(entry.rewardStatus, REWARD_STATUS_CLASSES)}
      </div>
    </div>
  `).join("");
}

// ── Notification Bell ──
// The hub pushes an entry here (new approval request, new published
// report) via pushClientNotification() in the parent app.js. The portal
// only ever flips read: false -> true on entries that already exist - it
// never invents new ones - matching the Firestore rule that allows public
// writes to this field.
function timeAgo(isoString) {
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

function renderNotifications() {
  if (!notifList || !notifBellBadge) return;

  const items = Array.isArray(clientData.notifications) ? clientData.notifications : [];
  const unreadCount = items.filter(n => !n.read).length;

  if (unreadCount > 0) {
    notifBellBadge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
    notifBellBadge.style.display = "flex";
  } else {
    notifBellBadge.style.display = "none";
  }

  notifList.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "notif-empty";
    empty.textContent = "Nothing yet - you'll see updates here as work moves forward.";
    notifList.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const row = document.createElement("div");
    row.className = "notif-item" + (item.read ? " read" : "");

    const dot = document.createElement("span");
    dot.className = "notif-item-dot";

    const body = document.createElement("div");
    body.className = "notif-item-body";
    const p = document.createElement("p");
    p.textContent = item.message || "";
    const time = document.createElement("div");
    time.className = "notif-item-time";
    time.textContent = timeAgo(item.createdAt);
    body.appendChild(p);
    body.appendChild(time);

    row.appendChild(dot);
    row.appendChild(body);

    row.addEventListener("click", () => {
      if (!item.read) {
        item.read = true;
        renderNotifications();
        updateFirebaseNotifications();
      }
    });

    notifList.appendChild(row);
  });
}

function updateFirebaseNotifications() {
  const docRef = db.collection("clients").doc(clientToken);
  const notifications = Array.isArray(clientData.notifications) ? clientData.notifications : [];
  const purified = JSON.parse(JSON.stringify(notifications));

  docRef.set({
    notifications: purified
  }, { merge: true }).catch(err => {
    console.error("Error updating notifications:", err);
  });
}

if (notifBellBtn && notifDropdown) {
  notifBellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    notifDropdown.style.display = notifDropdown.style.display === "none" ? "flex" : "none";
  });
  document.addEventListener("click", (e) => {
    if (notifDropdown.style.display !== "none" && !notifDropdown.contains(e.target) && e.target !== notifBellBtn) {
      notifDropdown.style.display = "none";
    }
  });
}

if (notifMarkAllReadBtn) {
  notifMarkAllReadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const items = Array.isArray(clientData.notifications) ? clientData.notifications : [];
    let changed = false;
    items.forEach(n => {
      if (!n.read) {
        n.read = true;
        changed = true;
      }
    });
    if (changed) {
      renderNotifications();
      updateFirebaseNotifications();
    }
  });
}

// Back button from a report's detail view to the archive grid
const btnBackToReports = document.getElementById("btnBackToReports");
if (btnBackToReports) {
  btnBackToReports.addEventListener("click", () => {
    document.getElementById("reportDetailView").style.display = "none";
    document.getElementById("reportArchiveList").style.display = "";
    currentReportForExport = null;
    renderReportArchive();
  });
}

// ── Report PDF export ──
// Builds a standalone, branded copy of the currently-open report (client's
// own logo/colors, not a fixed Revital look - this page's CSS vars are
// already set per-client in renderPortal) into the off-screen container
// below, then hands it to html2pdf. Only ever used for the "old schema"
// structured reports (date/focus/wins/platforms/cellData) - the newer
// monthYear/url reports are just external links with nothing in-app to
// export, and showReportDetail (the only thing that reveals this button)
// is never called for those.
const btnDownloadReportPdf = document.getElementById("btnDownloadReportPdf");
if (btnDownloadReportPdf) {
  btnDownloadReportPdf.addEventListener("click", () => {
    if (!currentReportForExport || typeof html2pdf === "undefined") return;

    const report = currentReportForExport;
    const config = clientData.portalConfig || {};
    const platforms = Array.isArray(report.platforms) ? report.platforms : [];
    const cellData = report.cellData || {};
    const metricKeys = Object.keys(REPORT_METRIC_LABELS);

    let tableRows = "";
    metricKeys.forEach((key) => {
      tableRows += `<tr><td class="metric-label">${escapeHtml(REPORT_METRIC_LABELS[key])}</td>`;
      platforms.forEach((_, idx) => {
        const val = cellData[key] && cellData[key][idx] ? cellData[key][idx] : "—";
        tableRows += `<td>${escapeHtml(val)}</td>`;
      });
      tableRows += "</tr>";
    });
    let platformHeaders = "";
    platforms.forEach((p) => {
      platformHeaders += `<th><span class="platform-dot" style="background:${escapeHtml(p.color || "#999")}"></span>${escapeHtml(p.name || "Platform")}</th>`;
    });

    const brandLabel = config.clientLogoUrl
      ? `<img src="${escapeHtml(config.clientLogoUrl)}" style="height:36px; max-width:180px; object-fit:contain;">`
      : `<div style="font-family:var(--font-heading); font-size:1.1rem; font-weight:700; background:linear-gradient(to right, var(--color-primary), var(--color-secondary)); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">${escapeHtml(clientName)} Portal</div>`;

    const exportContainer = document.getElementById("reportPdfExportContainer");
    exportContainer.innerHTML = `
      <div class="pdf-export-page">
        <div class="pdf-export-header">
          ${brandLabel}
          <div class="pdf-export-title">${escapeHtml(report.date || "Report")}</div>
          ${report.preparedBy ? `<p class="report-meta">Prepared by ${escapeHtml(report.preparedBy)}</p>` : ""}
          ${report.focus ? `<p class="report-meta">Focus: ${escapeHtml(report.focus)}</p>` : ""}
        </div>
        ${report.wins ? `<div class="report-wins"><strong>Key wins this month</strong><p>${escapeHtml(report.wins)}</p></div>` : ""}
        ${platforms.length > 0 ? `<table class="report-metrics-table"><thead><tr><th>Metric</th>${platformHeaders}</tr></thead><tbody>${tableRows}</tbody></table>` : ""}
      </div>
    `;

    const originalText = btnDownloadReportPdf.innerHTML;
    btnDownloadReportPdf.textContent = "Generating...";
    btnDownloadReportPdf.disabled = true;

    const fileName = `${(clientName || "Client").replace(/\s+/g, "_")}_Report_${(report.date || "report").replace(/[^a-z0-9]+/gi, "_")}.pdf`;

    html2pdf().set({
      margin: 0,
      filename: fileName,
      image: { type: "jpeg", quality: 0.92 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: null, scrollX: 0, scrollY: 0 },
      jsPDF: { unit: "in", format: "letter", orientation: "portrait" }
    }).from(exportContainer.querySelector(".pdf-export-page")).save().then(() => {
      btnDownloadReportPdf.innerHTML = originalText;
      btnDownloadReportPdf.disabled = false;
      exportContainer.innerHTML = "";
    }).catch((err) => {
      console.error("PDF export failed:", err);
      btnDownloadReportPdf.innerHTML = originalText;
      btnDownloadReportPdf.disabled = false;
      exportContainer.innerHTML = "";
    });
  });
}

// Navigation Tab Switching
navBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    navBtns.forEach(b => b.classList.remove("active"));
    viewSections.forEach(v => v.classList.remove("active"));
    
    btn.classList.add("active");
    const targetSection = document.getElementById(btn.dataset.target);
    targetSection.classList.add("active");

    if (btn.dataset.target === "view-moodboards") {
      recordMoodBoardViews();
    }

    // Lazy Load logic: If the target section has an iframe with a dataset.src, load it now!
    const targetIframe = targetSection.querySelector("iframe");
    if (targetIframe && targetIframe.dataset.src && targetIframe.src !== targetIframe.dataset.src) {
      targetIframe.src = targetIframe.dataset.src;
    }
  });
});

// Utilities
function hexToRgba(hex, alpha) {
  var c;
  if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
      c= hex.substring(1).split('');
      if(c.length== 3){
          c= [c[0], c[0], c[1], c[1], c[2], c[2]];
      }
      c= '0x'+c.join('');
      return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
  }
  return `rgba(16, 185, 129, ${alpha})`;
}

// Confetti Effect
function fireConfetti() {
  const colors = [clientData.portalConfig.primaryColor || '#10b981', clientData.portalConfig.secondaryColor || '#6366f1', '#ffffff'];
  for (let i = 0; i < 100; i++) {
    createParticle(colors[Math.floor(Math.random() * colors.length)]);
  }
}
function createParticle(color) {
  const particle = document.createElement('div');
  particle.className = 'confetti';
  particle.style.backgroundColor = color;
  particle.style.left = Math.random() * window.innerWidth + 'px';
  particle.style.top = -10 + 'px';
  document.body.appendChild(particle);

  const animation = particle.animate([
    { transform: `translate3d(0,0,0) rotate(0deg)`, opacity: 1 },
    { transform: `translate3d(${Math.random()*200 - 100}px, ${window.innerHeight}px, 0) rotate(${Math.random()*720}deg)`, opacity: 0 }
  ], {
    duration: Math.random() * 2000 + 1500,
    easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
  });

  animation.onfinish = () => particle.remove();
}

// Boot
init();

// ── Mobile Sidebar Logic ──
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileCloseBtn = document.getElementById("mobileCloseBtn");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const sidebar = document.getElementById("sidebar");

function openSidebar() {
  if (sidebar) sidebar.classList.add("open");
  if (sidebarOverlay) sidebarOverlay.classList.add("active");
}

function closeSidebar() {
  if (sidebar) sidebar.classList.remove("open");
  if (sidebarOverlay) sidebarOverlay.classList.remove("active");
}

if (mobileMenuBtn) mobileMenuBtn.addEventListener("click", openSidebar);
if (mobileCloseBtn) mobileCloseBtn.addEventListener("click", closeSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeSidebar);

// Close sidebar on navigation click (mobile)
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (window.innerWidth <= 1024) {
      closeSidebar();
    }
  });
});

// ── Content Approvals ──
// Type label lookup, duplicated from client-portal-manager/js/app.js for
// the same cross-iframe reason DEFAULT_CLIENT_CHECKLIST_FALLBACK is
// duplicated there - each iframe document only sees its own top-level
// `const` declarations. Keep this in sync with APPROVAL_TYPE_LABELS in
// client-portal-manager/js/app.js if you edit either.
const PORTAL_APPROVAL_TYPE_LABELS = {
  social: "Social Media Content",
  ads: "Paid Ad Creative",
  email: "Email Campaign",
  website: "Website Page",
  video: "Video & Production"
};

const PORTAL_DECISION_LABELS = {
  approved: "✅ Approved",
  minor: "🔄 Approved with Minor Corrections",
  revision: "❌ Revision Required"
};

// Visual preview tile for an approval card/row - a real thumbnail image if
// the admin pasted one in client-portal-manager, otherwise a plain tile
// labeled with the content type so there's still a visual anchor instead
// of just a text "View Preview" link. sizeClass picks the large card-top
// tile (approval-thumbnail) vs. the small history-row square
// (approval-history-thumb); shared "thumb-visual" class carries the
// image/fallback toggling logic so both share one CSS rule set.
function thumbnailMarkup(entry, sizeClass) {
  const typeLabel = PORTAL_APPROVAL_TYPE_LABELS[entry.contentType] || "Deliverable";
  if (!entry.thumbnailUrl) {
    return `<div class="thumb-visual ${sizeClass} thumb-empty"><div class="thumb-fallback">${escapeHtml(typeLabel)}</div></div>`;
  }
  return `<div class="thumb-visual ${sizeClass}">
    <img src="${escapeHtml(entry.thumbnailUrl)}" alt="${escapeHtml(entry.title)}" loading="lazy">
    <div class="thumb-fallback">${escapeHtml(typeLabel)}</div>
  </div>`;
}

// A broken/unreachable thumbnailUrl (bad paste, expired share link) should
// degrade to the same plain type tile used when there's no thumbnail at
// all, not a broken-image icon. Wired via JS instead of an inline onerror
// attribute to avoid fragile quote-escaping through a template literal -
// the fallback div is already in the markup (hidden via CSS), this just
// flips a class so CSS swaps which one shows.
function wireThumbnailFallbacks(container) {
  container.querySelectorAll(".thumb-visual img").forEach(img => {
    img.addEventListener("error", () => {
      img.parentElement.classList.add("broken");
    });
  });
}

// Back-and-forth thread on a pending approval, so a revision conversation
// can happen in one place instead of spilling into email. Lives on the
// entry itself as entry.comments = [{id, author, authorName, text,
// createdAt}] - carried into approvalHistory once decided (see
// decideApproval) so the full conversation stays visible afterward, just
// without the ability to add more once it's no longer pending.
function commentThreadHtml(entry, readOnly) {
  const comments = Array.isArray(entry.comments) ? entry.comments : [];
  const listHtml = comments.length
    ? comments.map(c => `
        <div class="approval-comment approval-comment-${c.author === 'client' ? 'client' : 'admin'}">
          <div class="approval-comment-meta">
            <span class="approval-comment-author">${escapeHtml(c.author === 'client' ? 'You' : (c.authorName || 'Revital team'))}</span>
            <span class="approval-comment-time">${c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</span>
          </div>
          <div class="approval-comment-text">${escapeHtml(c.text || '')}</div>
        </div>
      `).join('')
    : `<div class="approval-comment-empty">No comments yet.</div>`;

  const inputHtml = readOnly ? '' : `
    <div class="approval-comment-input-row">
      <textarea class="approval-comment-input" placeholder="Add a comment..."></textarea>
      <button type="button" class="approval-comment-send-btn">Send</button>
    </div>
  `;

  return `<div class="approval-comment-thread">${listHtml}${inputHtml}</div>`;
}

function wireCommentThread(card, entry) {
  const sendBtn = card.querySelector(".approval-comment-send-btn");
  const input = card.querySelector(".approval-comment-input");
  if (!sendBtn || !input) return;

  sendBtn.addEventListener("click", () => {
    const text = input.value.trim();
    if (!text) return;
    addApprovalComment(entry, text);
  });
}

function addApprovalComment(entry, text) {
  if (!Array.isArray(entry.comments)) entry.comments = [];
  entry.comments.push({
    id: 'cm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    author: 'client',
    text: text,
    createdAt: new Date().toISOString()
  });

  renderApprovalsView();

  const purifiedPending = JSON.parse(JSON.stringify(clientData.pendingApprovals || []));
  db.collection("clients").doc(clientToken).set({
    pendingApprovals: purifiedPending
  }, { merge: true }).catch(err => {
    console.error("Error adding approval comment:", err);
  });
}

function renderApprovalsView() {
  const pendingContainer = document.getElementById("pendingApprovalsContainer");
  const historyContainer = document.getElementById("approvalHistoryContainer");
  const navApprovals = document.getElementById("navApprovals");
  const badge = document.getElementById("navApprovalsBadge");
  if (!pendingContainer || !historyContainer || !navApprovals) return;

  const pending = Array.isArray(clientData.pendingApprovals) ? clientData.pendingApprovals : [];
  const history = Array.isArray(clientData.approvalHistory) ? clientData.approvalHistory : [];

  // Only show the nav item at all once there's something to see, so
  // clients with nothing pending yet aren't confused by an empty tab.
  if (pending.length === 0 && history.length === 0) {
    navApprovals.style.display = "none";
  } else {
    navApprovals.style.display = "flex";
  }

  if (pending.length > 0) {
    badge.textContent = String(pending.length);
    badge.style.display = "inline-flex";
  } else {
    badge.style.display = "none";
  }

  pendingContainer.innerHTML = "";
  if (pending.length === 0) {
    pendingContainer.innerHTML = '<p class="approval-empty">Nothing waiting on you right now.</p>';
  } else {
    pending.forEach(entry => {
      const typeLabel = PORTAL_APPROVAL_TYPE_LABELS[entry.contentType] || "Deliverable";
      const checklist = Array.isArray(entry.checklist) ? entry.checklist : [];

      const card = document.createElement("div");
      card.className = "approval-card";

      const checklistHtml = checklist.length
        ? `<ul class="approval-checklist">${checklist.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : "";

      card.innerHTML = `
        ${thumbnailMarkup(entry, "approval-thumbnail")}
        <div class="approval-card-header">
          <span class="approval-type-badge">${escapeHtml(typeLabel)}</span>
          <h4>${escapeHtml(entry.title)}</h4>
        </div>
        ${entry.previewLink ? `<a href="${escapeHtml(entry.previewLink)}" target="_blank" rel="noopener" class="approval-preview-link">View Preview &rarr;</a>` : ""}
        ${checklistHtml}
        ${commentThreadHtml(entry)}
        <textarea class="approval-notes-input" placeholder="Notes (required if requesting corrections or a revision)"></textarea>
        <div class="approval-actions">
          <button type="button" class="btn-approval btn-approve" data-decision="approved">Approved</button>
          <button type="button" class="btn-approval btn-minor" data-decision="minor">Minor Corrections</button>
          <button type="button" class="btn-approval btn-revision" data-decision="revision">Revision Required</button>
        </div>
      `;

      wireThumbnailFallbacks(card);
      wireCommentThread(card, entry);

      card.querySelectorAll(".btn-approval").forEach(btn => {
        btn.addEventListener("click", () => {
          const notesEl = card.querySelector(".approval-notes-input");
          const notes = notesEl ? notesEl.value.trim() : "";
          const decision = btn.dataset.decision;

          if (decision !== "approved" && !notes) {
            alert("Please add a quick note so we know what to change.");
            return;
          }

          decideApproval(entry, decision, notes);
        });
      });

      pendingContainer.appendChild(card);
    });
  }

  historyContainer.innerHTML = "";
  if (history.length === 0) {
    historyContainer.innerHTML = '<p class="approval-empty">No decisions yet.</p>';
  } else {
    history.slice().reverse().forEach(entry => {
      const typeLabel = PORTAL_APPROVAL_TYPE_LABELS[entry.contentType] || "Deliverable";
      const decisionLabel = PORTAL_DECISION_LABELS[entry.decision] || entry.decision || "";
      const decidedDate = entry.decidedAt ? new Date(entry.decidedAt).toLocaleDateString() : "";

      const row = document.createElement("div");
      row.className = "approval-history-row";
      row.innerHTML = `
        <div class="approval-history-row-inner">
          ${thumbnailMarkup(entry, "approval-history-thumb")}
          <div class="approval-history-body">
            <div class="approval-history-main">
              <strong>${escapeHtml(entry.title)}</strong>
              <span class="approval-history-type">${escapeHtml(typeLabel)}</span>
            </div>
            <div class="approval-history-meta">${decisionLabel} &middot; ${escapeHtml(decidedDate)}</div>
            ${entry.notes ? `<div class="approval-history-notes">&ldquo;${escapeHtml(entry.notes)}&rdquo;</div>` : ""}
            ${Array.isArray(entry.comments) && entry.comments.length > 0 ? commentThreadHtml(entry, true) : ""}
          </div>
        </div>
      `;
      wireThumbnailFallbacks(row);
      historyContainer.appendChild(row);
    });
  }
}

function decideApproval(entry, decision, notes) {
  const docRef = db.collection("clients").doc(clientToken);

  const historyEntry = {
    id: entry.id,
    contentType: entry.contentType,
    title: entry.title,
    previewLink: entry.previewLink || "",
    thumbnailUrl: entry.thumbnailUrl || "",
    comments: Array.isArray(entry.comments) ? entry.comments : [],
    decision: decision,
    notes: notes || "",
    decidedAt: new Date().toISOString()
  };

  const newPending = (clientData.pendingApprovals || []).filter(p => p.id !== entry.id);
  const newHistory = (clientData.approvalHistory || []).concat([historyEntry]);

  // Update local state immediately so the UI reflects the decision without
  // waiting on the round trip, then persist. Same JSON-purify step as
  // updateFirebaseChecklist - strips this iframe's own realm off the
  // objects before they cross into the parent-bound Firestore SDK.
  clientData.pendingApprovals = newPending;
  clientData.approvalHistory = newHistory;
  renderApprovalsView();

  const purifiedPending = JSON.parse(JSON.stringify(newPending));
  const purifiedHistory = JSON.parse(JSON.stringify(newHistory));

  docRef.set({
    pendingApprovals: purifiedPending,
    approvalHistory: purifiedHistory
  }, { merge: true }).catch(err => {
    console.error("Error recording approval decision:", err);
  });
}

function renderActionItems() {
  const container = document.getElementById("actionItemsWidget");
  const list = document.getElementById("actionItemsList");
  if (!container || !list) return;

  // clientData.openActionItems never existed as a field anywhere - the
  // Hub's Meeting Notes Logger only ever writes to clientData.meetingNotes
  // ([{id, date, title, summary, actionItems: [{id, text, completed}]}]),
  // it never separately maintained a flattened "open items" list. Compute
  // it here instead of expecting the Hub to keep a redundant copy in sync -
  // this also means completing an item in Meeting Notes Logger correctly
  // drops it from here without any extra write path.
  const meetings = Array.isArray(clientData.meetingNotes) ? clientData.meetingNotes : [];
  const items = [];
  meetings.forEach(m => {
    (m.actionItems || []).forEach(ai => {
      if (!ai.completed) {
        items.push({ text: ai.text, meetingDate: m.date || m.title || "" });
      }
    });
  });
  // Most recently logged meeting's open items first.
  items.sort((a, b) => (b.meetingDate || "").localeCompare(a.meetingDate || ""));

  if (items.length === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  list.innerHTML = items.map(ai => `
    <div style="display:flex; gap:12px; align-items:flex-start; padding:12px; background:rgba(0,0,0,0.2); border-radius:8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" style="margin-top:2px; flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle></svg>
      <div>
        <p style="margin:0; font-size:15px;">${escapeHtml(ai.text)}</p>
        <small style="color:var(--color-text-secondary); font-size:12px;">Logged: ${escapeHtml(ai.meetingDate || '')}</small>
      </div>
    </div>
  `).join('');
}

function renderBrandKit() {
  const container = document.getElementById("brandKitContainer");
  const colorsList = document.getElementById("brandColorsList");
  const typographyInfo = document.getElementById("typographyInfo");
  const logoLink = document.getElementById("brandLogoLink");
  if (!container) return;

  const kit = clientData.brandKit;
  if (!kit || (!kit.primaryColor && !kit.fontPrimary && !kit.logoUrl)) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  
  // Colors
  colorsList.innerHTML = '';
  const colors = [
    { label: 'Primary', hex: kit.primaryColor },
    { label: 'Secondary', hex: kit.secondaryColor },
    { label: 'Accent', hex: kit.accentColor }
  ];
  colors.forEach(c => {
    if (c.hex) {
      colorsList.innerHTML += `
        <div style="text-align:center;">
          <div style="width:48px; height:48px; border-radius:8px; background-color:${escapeHtml(c.hex)}; border:1px solid rgba(255,255,255,0.1); margin-bottom:4px;"></div>
          <div style="font-size:10px; color:var(--color-text-secondary);">${escapeHtml(c.hex)}</div>
        </div>
      `;
    }
  });

  // Typography
  typographyInfo.innerHTML = `
    ${kit.fontPrimary ? `<div><strong style="color:var(--color-text);">Primary Font:</strong> ${escapeHtml(kit.fontPrimary)}</div>` : ''}
    ${kit.fontSecondary ? `<div style="margin-top:4px;"><strong style="color:var(--color-text);">Secondary Font:</strong> ${escapeHtml(kit.fontSecondary)}</div>` : ''}
    ${kit.toneOfVoice ? `<div style="margin-top:8px; color:var(--color-text-secondary);">${escapeHtml(kit.toneOfVoice)}</div>` : ''}
  `;

  // Logo
  if (kit.logoUrl) {
    logoLink.innerHTML = `<a href="${escapeHtml(kit.logoUrl)}" target="_blank" class="btn-secondary" style="text-decoration:none;">Access Logo / Brand Assets Folder</a>`;
  } else {
    logoLink.innerHTML = '';
  }
}

function renderMoodBoards() {
  const container = document.getElementById("moodBoardsContainer");
  const emptyState = document.getElementById("moodBoardsEmptyState");
  const nav = document.getElementById("navMoodBoards");
  if (!container || !nav) return;

  const boards = Array.isArray(clientData.moodBoards) ? clientData.moodBoards.filter(b => b.sharedWithClient) : [];

  if (boards.length === 0) {
    nav.style.display = "none";
    container.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  nav.style.display = "flex";
  if (emptyState) emptyState.style.display = "none";

  container.innerHTML = boards.map(board => {
    const allLinks = board.embedLinks || [];
    // Uploaded images used to get piped through the same 380px <iframe>
    // treatment as real reference URLs, which is wrong for a data URL -
    // no object-fit, a scrollbar-prone embed, and a redundant "open in
    // new tab" link pointing at a raw base64 string. Split them into a
    // proper thumbnail grid; the iframe embed stays for actual external
    // reference links (Pinterest boards, etc).
    const images = allLinks.filter(isMoodBoardImage);
    const links = allLinks.filter(l => !isMoodBoardImage(l));

    return `
    <div class="moodboard-card">
      <div class="moodboard-card-header">
        <h3>${escapeHtml(board.title || "")}</h3>
        <span class="moodboard-category-badge">${escapeHtml(board.category || "")}</span>
      </div>
      ${board.ideaSummary ? `<p>${escapeHtml(board.ideaSummary)}</p>` : ""}
      ${board.visualDirection ? `<div class="moodboard-section-label">Visual Direction</div><p>${escapeHtml(board.visualDirection)}</p>` : ""}
      ${board.keyElements ? `<div class="moodboard-section-label">Key Elements</div><p>${escapeHtml(board.keyElements)}</p>` : ""}
      ${images.length ? `
        <div class="moodboard-section-label">Reference Images</div>
        <div class="moodboard-image-grid">
          ${images.map((l, idx) => `
            <button type="button" class="moodboard-image-tile" data-board-id="${escapeHtml(board.id || "")}" data-idx="${idx}" aria-label="View ${escapeHtml(l.label || 'reference image')} full size">
              <img src="${escapeHtml(l.url)}" alt="${escapeHtml(l.label || '')}" loading="lazy">
              ${l.label ? `<span class="moodboard-image-caption">${escapeHtml(l.label)}</span>` : ""}
            </button>
          `).join("")}
        </div>
      ` : ""}
      ${links.length ? `
        <div class="moodboard-section-label">References</div>
        ${links.map(l => `
          <div class="moodboard-embed-wrapper">
            <iframe src="${escapeHtml(l.url)}" loading="lazy"></iframe>
          </div>
          <a class="moodboard-embed-link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label || l.url)} ↗</a>
        `).join("")}
      ` : ""}
    </div>
  `;
  }).join("");

  container.querySelectorAll(".moodboard-image-tile").forEach(btn => {
    btn.addEventListener("click", () => {
      openMoodBoardLightbox(btn.getAttribute("data-board-id"), parseInt(btn.getAttribute("data-idx"), 10));
    });
  });
}

function isMoodBoardImage(l) {
  return !!(l && (l.isImage || (l.url || "").startsWith("data:image")));
}

// ── Mood board image lightbox ──
// Click-to-new-tab on a raw base64 data URL was a rough experience (huge
// ugly URL bar, no zoom, no way to browse the board's other images). This
// is a lightweight in-page modal instead, with prev/next across whichever
// board's grid was opened from.
let lightboxImages = [];
let lightboxIndex = 0;

function openMoodBoardLightbox(boardId, idx) {
  const board = (clientData.moodBoards || []).find(b => b.id === boardId);
  if (!board) return;
  lightboxImages = (board.embedLinks || []).filter(isMoodBoardImage);
  lightboxIndex = idx;
  if (!lightboxImages.length) return;

  const overlay = document.getElementById("moodboardLightbox");
  if (!overlay) return;
  overlay.style.display = "flex";
  renderLightboxImage();
}

function renderLightboxImage() {
  const img = document.getElementById("moodboardLightboxImg");
  const caption = document.getElementById("moodboardLightboxCaption");
  const counter = document.getElementById("moodboardLightboxCounter");
  const current = lightboxImages[lightboxIndex];
  if (!img || !current) return;
  img.src = current.url;
  img.alt = current.label || "";
  if (caption) caption.textContent = current.label || "";
  if (counter) counter.textContent = lightboxImages.length > 1 ? `${lightboxIndex + 1} / ${lightboxImages.length}` : "";
}

function closeMoodBoardLightbox() {
  const overlay = document.getElementById("moodboardLightbox");
  if (overlay) overlay.style.display = "none";
  lightboxImages = [];
}

function moodBoardLightboxStep(delta) {
  if (!lightboxImages.length) return;
  lightboxIndex = (lightboxIndex + delta + lightboxImages.length) % lightboxImages.length;
  renderLightboxImage();
}

document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("moodboardLightbox");
  if (!overlay) return;
  document.getElementById("moodboardLightboxClose")?.addEventListener("click", closeMoodBoardLightbox);
  document.getElementById("moodboardLightboxPrev")?.addEventListener("click", () => moodBoardLightboxStep(-1));
  document.getElementById("moodboardLightboxNext")?.addEventListener("click", () => moodBoardLightboxStep(1));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeMoodBoardLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (overlay.style.display !== "flex") return;
    if (e.key === "Escape") closeMoodBoardLightbox();
    if (e.key === "ArrowLeft") moodBoardLightboxStep(-1);
    if (e.key === "ArrowRight") moodBoardLightboxStep(1);
  });
});

// ── Testimonial submission ──
// Writes directly to this client's own public clients/{token} doc, same
// merge-write pattern as decideApproval() above - firestore.rules only
// allows unauthenticated portal writes to touch a short allow-list of
// fields (clientChecklist, pendingApprovals, approvalHistory,
// testimonialSubmission), so this is the one new field added to that
// list for this feature. The internal Hub side picks this up the same
// way it already picks up approval decisions - see foldInTestimonialSubmission
// in the root app.js.
function renderTestimonialView() {
  const formContainer = document.getElementById("testimonialFormContainer");
  const submittedContainer = document.getElementById("testimonialSubmittedContainer");
  if (!formContainer || !submittedContainer) return;

  const submission = clientData.testimonialSubmission;
  if (submission && submission.quote) {
    formContainer.style.display = "none";
    submittedContainer.style.display = "block";
    document.getElementById("testimonialSubmittedQuote").textContent = "“" + submission.quote + "”";
    const authorLine = [submission.authorName, submission.authorTitle].filter(Boolean).join(" — ");
    document.getElementById("testimonialSubmittedAuthor").textContent = authorLine;
  } else {
    formContainer.style.display = "block";
    submittedContainer.style.display = "none";
  }
}

function submitTestimonial() {
  const quoteField = document.getElementById("testimonialQuote");
  const authorNameField = document.getElementById("testimonialAuthorName");
  const authorTitleField = document.getElementById("testimonialAuthorTitle");
  const permissionField = document.getElementById("testimonialPermission");

  const quote = (quoteField.value || "").trim();
  if (!quote) {
    alert("Please write a few sentences before submitting.");
    return;
  }

  const submission = {
    quote: quote,
    authorName: (authorNameField.value || "").trim(),
    authorTitle: (authorTitleField.value || "").trim(),
    permissionToUse: !!permissionField.checked,
    submittedDate: new Date().toISOString().slice(0, 10)
  };

  const docRef = db.collection("clients").doc(clientToken);

  // Update local state immediately so the UI reflects the submission
  // without waiting on the round trip, then persist.
  clientData.testimonialSubmission = submission;
  renderTestimonialView();

  docRef.set({
    testimonialSubmission: JSON.parse(JSON.stringify(submission))
  }, { merge: true }).catch(err => {
    console.error("Error submitting testimonial:", err);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const submitBtn = document.getElementById("submitTestimonialBtn");
  if (submitBtn) submitBtn.addEventListener("click", submitTestimonial);
});
