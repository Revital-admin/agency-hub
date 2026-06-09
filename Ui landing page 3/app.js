/* ============================================================
   app.js
   Application state controller, Event Handlers & View Renderer
   ============================================================ */

// ── Global Variables ──
let clientsDb = {};
let activeClientName = "";
let iframeNeedsReload = {
  "tab-uxui": true,
  "tab-seo": true,
  "tab-strategy": true,
  "tab-socialaudit": true,
  "tab-webcomp": true,
  "tab-socialcomp": true,
  "tab-report": true
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
      checked: false
    }))
  }));

  // Clone SEO audit steps
  const seoAudit = {
    checked: {},
    targetUrl: ""
  };

  // Clone UXUI audit
  const uxuiAudit = {
    checked: {},
    targetUrl: ""
  };

  // Clone Content Strategy steps
  const contentStrategy = {
    checked: {},
    targetUrl: ""
  };

  // Clone Social Media Audit steps
  const socialAudit = {
    checked: {},
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

    // Migrate or verify uxuiAudit object structure
    if (!client.uxuiAudit || Array.isArray(client.uxuiAudit) || typeof client.uxuiAudit !== 'object') {
      client.uxuiAudit = {
        checked: {},
        targetUrl: ""
      };
    } else {
      if (!client.uxuiAudit.checked) client.uxuiAudit.checked = {};
      if (client.uxuiAudit.targetUrl === undefined) client.uxuiAudit.targetUrl = "";
    }

    // Migrate or verify seoAudit object structure
    if (!client.seoAudit || Array.isArray(client.seoAudit) || typeof client.seoAudit !== 'object') {
      client.seoAudit = {
        checked: {},
        targetUrl: ""
      };
    } else {
      if (!client.seoAudit.checked) client.seoAudit.checked = {};
      if (client.seoAudit.targetUrl === undefined) client.seoAudit.targetUrl = "";
    }

    // Migrate or verify contentStrategy object structure
    if (!client.contentStrategy || Array.isArray(client.contentStrategy) || typeof client.contentStrategy !== 'object') {
      client.contentStrategy = {
        checked: {},
        targetUrl: ""
      };
    } else {
      if (!client.contentStrategy.checked) client.contentStrategy.checked = {};
      if (client.contentStrategy.targetUrl === undefined) client.contentStrategy.targetUrl = "";
    }

    // Migrate or verify socialAudit object structure
    if (!client.socialAudit || Array.isArray(client.socialAudit) || typeof client.socialAudit !== 'object') {
      client.socialAudit = {
        checked: {},
        targetUrl: ""
      };
    } else {
      if (!client.socialAudit.checked) client.socialAudit.checked = {};
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

function saveDatabase() {
  localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));
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

  // Logged Competitors count
  let loggedComps = 0;
  // Check Web Competitors names
  client.webComp.names.forEach(name => {
    if (name && name !== "Competitor A" && name !== "Competitor B" && name !== "Competitor C" && name.trim() !== "") {
      loggedComps++;
    }
  });
  // Check Social Competitors names
  client.socialComp.names.forEach(name => {
    if (name && name !== "Competitor A" && name !== "Competitor B" && name !== "Competitor C" && name.trim() !== "") {
      loggedComps++;
    }
  });
  document.getElementById("dashCompetitorVal").textContent = `${loggedComps} / 6`;
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

// Onboarding inputs sync
document.getElementById("obTargetUrl").addEventListener("input", (e) => {
  const client = getActiveClient();
  client.targetUrl = e.target.value;
  saveDatabase();
  // Keep dashboard hero in sync
  document.getElementById("dashHeroTargetUrl").textContent = e.target.value || "No website logged yet";
});

document.getElementById("obTargetDate").addEventListener("input", (e) => {
  const client = getActiveClient();
  client.onboardingDate = e.target.value;
  saveDatabase();
});

// Add custom onboarding item
document.getElementById("addCustomObBtn").addEventListener("click", () => {
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
      checked: false
    });
    saveDatabase();
    labelInput.value = "";
    renderOnboardingChecklist();
    renderDashboard();
    showBanner("success", "Added custom onboarding checklist item!");
  }
});

// Reset Onboarding Checklist
document.getElementById("resetOnboardingBtn").addEventListener("click", () => {
  const confirmReset = confirm("Reset all onboarding items back to blank templates? Custom added tasks will be deleted.");
  if (!confirmReset) return;

  const client = getActiveClient();
  const blueprints = DEFAULT_ONBOARDING_CHECKLIST.map(cat => ({
    category: cat.category,
    items: cat.items.map(item => ({
      id: item.id,
      label: item.label,
      checked: false
    }))
  }));

  client.onboardingChecklist = blueprints;
  saveDatabase();
  renderOnboardingChecklist();
  renderDashboard();
  showBanner("success", "Onboarding checklist reset to template.");
});

// ── UX/UI Audit Suite Controller ──
function renderUxuiAudit() {
  const iframe = document.querySelector('#tab-uxui iframe');
  if (iframe) {
    iframe.src = iframe.getAttribute('src') || "ux-ui-audit-checklist/index.html";
  }
}

// ── SEO Audit Suite Controller ──
function renderSeoAudit() {
  const iframe = document.querySelector('#tab-seo iframe');
  if (iframe) {
    iframe.src = iframe.getAttribute('src') || "seo-audit-checklist/index.html";
  }
}

// ── Content Strategy Guide Controller ──
function renderContentStrategy() {
  const iframe = document.querySelector('#tab-strategy iframe');
  if (iframe) {
    iframe.src = iframe.getAttribute('src') || "content-strategy-guide/index.html";
  }
}

// ── Social Media Audit Controller ──
function renderSocialAudit() {
  const iframe = document.querySelector('#tab-socialaudit iframe');
  if (iframe) {
    iframe.src = iframe.getAttribute('src') || "social-media-audit/index.html";
  }
}

// ── Competitor Analysis Matricies (Website & Social) ──
function renderWebCompetitors() {
  const iframe = document.querySelector('#tab-webcomp iframe');
  if (iframe) {
    iframe.src = iframe.getAttribute('src') || "competitor-analysis/Website Competitor Analysis Form.html";
  }
}

function renderSocialCompetitors() {
  const iframe = document.querySelector('#tab-socialcomp iframe');
  if (iframe) {
    iframe.src = iframe.getAttribute('src') || "competitor-analysis/Competiteor Analysis Form.html";
  }
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
  const iframe = document.querySelector('#tab-report iframe');
  if (iframe) {
    iframe.src = iframe.getAttribute('src') || "competitor-analysis/revital-monthly-report-styled.html";
  }
}

function updateReportPreview() {
  // Preview is now handled inside the iframe
}

// ── Print Buttons ──
document.getElementById("printOnboardingBtn").addEventListener("click", () => window.print());

// ── Sidebar Utilities: Export / Import JSON ──
document.getElementById("exportDataBtn").addEventListener("click", () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(clientsDb, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `Revital_Productions_Hub_${activeClientName.replace(/\s+/g, "_")}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showBanner("success", "Client workspaces exported successfully!");
});

document.getElementById("importDataBtn").addEventListener("click", () => {
  document.getElementById("importFileInput").click();
});

document.getElementById("importFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const imported = JSON.parse(evt.target.result);
      
      // Simple structural check
      if (typeof imported !== 'object' || Array.isArray(imported)) {
        throw new Error("Invalid file structure. Must be a JSON object.");
      }

      // Merge and save
      clientsDb = { ...clientsDb, ...imported };
      saveDatabase();
      
      // Switch active client to first imported client
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
  // Clear file input value to allow uploading same file again
  e.target.value = "";
});

// Delete Client Button
document.getElementById("deleteClientBtn").addEventListener("click", deleteActiveClient);

// Add Client button dropdown
document.getElementById("addClientBtn").addEventListener("click", createNewClient);

// Dropdown change listener
document.getElementById("clientSelect").addEventListener("change", (e) => {
  switchClient(e.target.value);
});

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

// ── Application Boostrapper ──
document.addEventListener("DOMContentLoaded", () => {
  loadDatabase();
  initTabNavigation();
  initMobileNavigation();
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
