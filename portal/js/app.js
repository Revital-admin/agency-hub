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
      }
    } else {
      loader.innerHTML = "<h2>Access Denied</h2><p>Link expired or invalid token.</p>";
    }
  }, (err) => {
    console.error("Portal listener error:", err);
    loader.innerHTML = "<h2>Access Denied</h2><p>Unable to load this portal.</p>";
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

  renderReportArchive();

  const analyticsEmbed = document.getElementById("analyticsEmbedContainer");
  if (config.liveAnalyticsUrl) {
    analyticsEmbed.style.display = "block";
    document.getElementById("analyticsIframe").src = config.liveAnalyticsUrl;
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
  listEl.style.display = "grid";
  listEl.innerHTML = "";

  const reports = Array.isArray(clientData.reportArchive) ? clientData.reportArchive : [];

  if (reports.length === 0) {
    listEl.style.display = "block";
    listEl.innerHTML = '<p class="report-archive-empty">No reports have been published yet. Check back soon!</p>';
    return;
  }

  reports.forEach((report) => {
    const card = document.createElement("div");
    card.className = "report-card";
    card.innerHTML = `
      <div class="report-card-date">${escapeHtml(report.date || "Untitled Report")}</div>
      <div class="report-card-focus">${escapeHtml(report.focus || "")}</div>
    `;
    card.addEventListener("click", () => showReportDetail(report));
    listEl.appendChild(card);
  });
}

function showReportDetail(report) {
  const listEl = document.getElementById("reportArchiveList");
  const detailEl = document.getElementById("reportDetailView");
  const contentEl = document.getElementById("reportDetailContent");
  if (!listEl || !detailEl || !contentEl) return;

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

function renderChecklist() {
  checklistContainer.innerHTML = "";

  // The client-facing checklist is its own, fully independent list -
  // configured per-client in the hub's "Client Checklist" section - rather
  // than a filtered view of the account manager's internal onboarding
  // tracker (clientData.onboardingChecklist). That older approach kept
  // leaking internal-only tasks onto the client's portal because it relied
  // on keyword-guessing or a manual per-task visibility flag layered on
  // top of internal data. This is just whatever the admin put here.
  const allItems = Array.isArray(clientData.clientChecklist) ? clientData.clientChecklist : [];

  if (allItems.length === 0) return;

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

// Back button from a report's detail view to the archive grid
const btnBackToReports = document.getElementById("btnBackToReports");
if (btnBackToReports) {
  btnBackToReports.addEventListener("click", () => {
    document.getElementById("reportDetailView").style.display = "none";
    document.getElementById("reportArchiveList").style.display = "";
    renderReportArchive();
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
        <div class="approval-card-header">
          <span class="approval-type-badge">${escapeHtml(typeLabel)}</span>
          <h4>${escapeHtml(entry.title)}</h4>
        </div>
        ${entry.previewLink ? `<a href="${escapeHtml(entry.previewLink)}" target="_blank" rel="noopener" class="approval-preview-link">View Preview &rarr;</a>` : ""}
        ${checklistHtml}
        <textarea class="approval-notes-input" placeholder="Notes (required if requesting corrections or a revision)"></textarea>
        <div class="approval-actions">
          <button type="button" class="btn-approval btn-approve" data-decision="approved">Approved</button>
          <button type="button" class="btn-approval btn-minor" data-decision="minor">Minor Corrections</button>
          <button type="button" class="btn-approval btn-revision" data-decision="revision">Revision Required</button>
        </div>
      `;

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
        <div class="approval-history-main">
          <strong>${escapeHtml(entry.title)}</strong>
          <span class="approval-history-type">${escapeHtml(typeLabel)}</span>
        </div>
        <div class="approval-history-meta">${decisionLabel} &middot; ${escapeHtml(decidedDate)}</div>
        ${entry.notes ? `<div class="approval-history-notes">&ldquo;${escapeHtml(entry.notes)}&rdquo;</div>` : ""}
      `;
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
