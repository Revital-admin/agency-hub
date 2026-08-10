/* ============================================================
   TEAM ACCESS MANAGER — APP LOGIC
   Hub-wide (not per-client). Reads/writes a single small Firestore
   doc, agency/teamAccess:
     {
       version: N,
       roleTiers: { "Role Name": { sections: [...], note: "..." }, ... },
       users: {
         "email": { role: "Role Name" },                 // enforced - sections come from roleTiers, live
         "email": { role: null, sections: [...] }         // custom - one-off, not tied to any role
       }
     }

   This used to store users as a flat { email: [sectionKey, ...] } list,
   with a hardcoded 5-tier "quick-fill" that just auto-checked boxes once
   and then forgot it had ever done so - editing a tier's definition did
   nothing for anyone already assigned it. Now a role is enforced: assign
   someone a role, and they get that role's CURRENT sections, live, for
   as long as they're on it. Edit the role once here and everyone on it
   updates automatically - no more re-saving each person by hand. Legacy
   array-shaped user entries (saved before this change) are read as
   "Custom" with their existing section list intact, so nobody's access
   silently changes on this upgrade - they just aren't on an enforced
   role until an admin explicitly assigns one.

   Anyone NOT listed in `users` at all has full access to every section
   of the Hub (unchanged default behavior) - this tool only adds explicit
   restrictions for specific teammates. This is a menu-level control: it
   hides sidebar sections for restricted accounts, it does not change
   what the underlying Firestore rules allow that account to read/write.
   Scoped to trusted internal teammates for that reason.
   ============================================================ */

const SECTION_DEFS = [
  { key: "core", label: "Core" },
  { key: "ad-accounts-access", label: "Ad Accounts & Access" },
  { key: "reporting-health", label: "Reporting & Health" },
  { key: "production", label: "Production" },
  { key: "content-creation", label: "Content Creation" },
  { key: "account-ops", label: "Account Ops" },
  { key: "audits", label: "Audits" },
  { key: "strategy-competition", label: "Strategy & Competition" },
  { key: "sales-pipeline", label: "Sales Pipeline" },
  { key: "retention-social-proof", label: "Retention & Social Proof" },
  { key: "agency-globals", label: "Agency Globals" }
];
const SECTION_KEYS = new Set(SECTION_DEFS.map(s => s.key));
// NOTE (July 2026 sidebar reorg): "Account Management" was split into
// "Ad Accounts & Access" and "Reporting & Health"; "Client Retention" and
// "Social Proof" were merged into "Retention & Social Proof". Any Custom
// entry saved before that reorg may still list the old keys
// ("account-management", "client-retention", "social-proof"), which no
// longer match anything - see staleKeysFor/renderStaleKeyWarning below,
// which now surfaces this in the edit form instead of it staying a
// silent, undiscoverable gap.

// Seed data for agency/teamAccess.roleTiers - only used the very first
// time this doc is read and has no roleTiers yet (fresh install). After
// that first save, Firestore is the live source of truth and this
// constant is never consulted again; edit roles from the UI, not here.
const DEFAULT_ROLE_TIERS = {
  "Full Access — Leadership": {
    sections: ["core", "ad-accounts-access", "reporting-health", "production", "content-creation", "account-ops", "audits", "strategy-competition", "sales-pipeline", "retention-social-proof", "agency-globals"],
    note: "Founder / CEO, Creative Director, Executive Producer, Chief Operating Officer (COO), Head of Strategy"
  },
  "Sales & Business Development": {
    sections: ["sales-pipeline", "retention-social-proof", "strategy-competition"],
    note: "Business Development Manager, New Business Representative, Sales Coordinator, Partnerships Manager, Proposal & Bids Specialist"
  },
  "Account Management / Client Services": {
    sections: ["core", "ad-accounts-access", "reporting-health", "production", "content-creation", "account-ops", "retention-social-proof"],
    note: "Producer, Senior Producer, Account Manager, Account Coordinator, Client Success Manager"
  },
  "Digital Marketing": {
    sections: ["ad-accounts-access", "reporting-health", "content-creation", "account-ops", "audits", "strategy-competition"],
    note: "Digital Marketing Strategist, Social Media Manager, Content Manager, SEO Specialist, Paid Ads Specialist, Email Marketing Specialist, Analytics / Reporting Specialist"
  },
  "Operations & Admin": {
    sections: ["core", "ad-accounts-access", "account-ops", "agency-globals"],
    note: "Studio Manager, Operations Manager, Executive Assistant, Bookkeeper / Finance Manager, HR Coordinator"
  }
};

let isEmbedded = false;
try {
  if (window.parent && window.parent.firebaseDb) {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

let roleTiers = {}; // { roleName: { sections: [...], note: "" } }
let teamAccessUsers = {}; // { email: { role: name|null, sections: [...] (if role is null) } }
let teamActivity = {}; // { email: { lastSeen: isoString } }
let editingEmail = null; // set while the person form is editing an existing entry
// Which role (by name) is currently expanded for editing in the Access
// Roles list below - null means all 5 are collapsed to a single summary
// row each. Only one at a time, on purpose: showing all 5 fully expanded
// simultaneously (11 section checkboxes apiece) was the whole reason this
// list got too long to scan at a glance.
let expandedRoleName = null;
// Optimistic-concurrency guard (see saveTeamAccessDoc below), kept fresh by
// listenToTeamAccess's live onSnapshot rather than a one-time load.
let docVersion = 0;

function el(id) { return document.getElementById(id); }
function sectionLabel(key) {
  const def = SECTION_DEFS.find(s => s.key === key);
  return def ? def.label : key;
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function formatLastSeen(iso) {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "Never";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Normalizes one stored user entry into { role: name|null, sections: [...] }
// regardless of which shape it was saved in - the legacy flat array (pre-
// roles), or the current object shape. Never mutates the input.
function normalizeUserEntry(entry) {
  if (Array.isArray(entry)) return { role: null, sections: entry.slice() };
  if (entry && typeof entry === "object") {
    return { role: entry.role || null, sections: Array.isArray(entry.sections) ? entry.sections.slice() : [] };
  }
  return { role: null, sections: [] };
}

// The actual enforcement resolution, mirrored in root app.js's
// initTeamAccessGate (that's the copy that really matters - this one is
// just for rendering this tool's own table/preview accurately).
function effectiveSections(entry) {
  const norm = normalizeUserEntry(entry);
  if (norm.role && roleTiers[norm.role]) return roleTiers[norm.role].sections || [];
  return norm.sections;
}

function staleKeysFor(sections) {
  return (sections || []).filter(k => !SECTION_KEYS.has(k));
}

// ── Role select (person form) ──
function populateRoleSelect() {
  const select = el("roleSelect");
  if (!select) return;
  const options = Object.keys(roleTiers).sort().map(name =>
    `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
  ).join("");
  select.innerHTML = `<option value="">— Custom (pick sections manually) —</option>${options}`;
}

function renderRoleSelectionUI() {
  const roleName = el("roleSelect").value;
  const previewEl = el("rolePreview");
  const customGroup = el("customSectionsGroup");

  if (!roleName) {
    // Custom mode
    previewEl.textContent = "";
    customGroup.style.display = "";
    return;
  }

  customGroup.style.display = "none";
  const role = roleTiers[roleName];
  if (!role) {
    previewEl.textContent = "This role no longer exists - pick another or switch to Custom.";
    return;
  }
  previewEl.textContent = (role.sections || []).length
    ? `Grants: ${role.sections.map(sectionLabel).join(", ")}`
    : "This role currently grants no sections (fully restricted).";
}

// ── Custom-mode checkboxes ──
function renderSectionCheckboxes() {
  const container = el("sectionCheckboxes");
  container.innerHTML = SECTION_DEFS.map(s => `
    <label class="checkbox-item">
      <div class="custom-checkbox">
        <input type="checkbox" class="section-checkbox" value="${s.key}">
        <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </div>
      <span>${s.label}</span>
    </label>
  `).join("");
}

function getCheckedSections() {
  return Array.from(document.querySelectorAll(".section-checkbox:checked")).map(cb => cb.value);
}

function setCheckedSections(sections) {
  document.querySelectorAll(".section-checkbox").forEach(cb => {
    cb.checked = sections.includes(cb.value);
  });
}

function renderStaleKeyWarning(sections) {
  const warn = el("staleKeyWarning");
  const stale = staleKeysFor(sections);
  if (stale.length) {
    warn.style.display = "";
    warn.textContent = `⚠ Includes section key(s) that no longer exist in the current sidebar: ${stale.join(", ")}. Likely left over from before the July 2026 sidebar reorg - uncheck/re-save to clean this up (it isn't granting access to anything anymore).`;
  } else {
    warn.style.display = "none";
    warn.textContent = "";
  }
}

function showFormStatus(message, type) {
  const status = el("formStatus");
  status.textContent = message;
  status.className = "form-status" + (type ? " " + type : "");
  if (message) setTimeout(() => { status.textContent = ""; status.className = "form-status"; }, 4000);
}

// ── Roles management ──
// Collapsed-by-default accordion: each role is a single compact row
// (name + section-count summary) until clicked, which expands it in
// place to the full name/note/checkbox editor. Only one role expanded
// at a time (expandedRoleName) - showing all 5 fully expanded together
// (11 checkboxes apiece) was what made this list too long to scan.
function roleSummaryText(role) {
  const count = (role.sections || []).length;
  if (count === 0) return "No sections (fully restricted)";
  if (count === SECTION_DEFS.length) return "All sections";
  return `${count} section${count === 1 ? "" : "s"}`;
}

function renderRolesList() {
  const container = el("rolesList");
  const names = Object.keys(roleTiers).sort();
  if (!names.length) {
    container.innerHTML = `<p style="font-size:0.85rem; color:var(--color-text-secondary);">No roles defined yet.</p>`;
  } else {
    container.innerHTML = names.map(name => {
      const role = roleTiers[name] || { sections: [], note: "" };
      const isExpanded = expandedRoleName === name;

      const headerHtml = `
        <button type="button" class="role-row-toggle" data-role="${escapeHtml(name)}" aria-expanded="${isExpanded}">
          <span class="role-row-name">${escapeHtml(name)}</span>
          <span class="role-row-summary">${escapeHtml(roleSummaryText(role))}${role.note ? " &middot; " + escapeHtml(role.note) : ""}</span>
          <svg class="role-row-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>`;

      if (!isExpanded) {
        return `<div class="step-card role-row" data-role-block="${escapeHtml(name)}">${headerHtml}</div>`;
      }

      const checkboxes = SECTION_DEFS.map(s => `
        <label class="checkbox-item">
          <div class="custom-checkbox">
            <input type="checkbox" class="role-section-checkbox" data-role="${escapeHtml(name)}" value="${s.key}" ${role.sections.includes(s.key) ? "checked" : ""}>
            <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <span>${s.label}</span>
        </label>
      `).join("");

      return `
        <div class="step-card role-row role-row-expanded" data-role-block="${escapeHtml(name)}">
          ${headerHtml}
          <div class="role-row-body">
            <div class="form-group">
              <label>Role name</label>
              <input type="text" class="role-name-input" data-original="${escapeHtml(name)}" value="${escapeHtml(name)}">
            </div>
            <div class="form-group">
              <label>Typical job titles (optional, for reference only)</label>
              <input type="text" class="role-note-input" data-role="${escapeHtml(name)}" value="${escapeHtml(role.note || "")}">
            </div>
            <div class="form-group">
              <label>Sections this role grants</label>
              <div class="section-checkbox-grid">${checkboxes}</div>
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn-primary save-role-btn" data-role="${escapeHtml(name)}" style="padding:8px 16px; font-size:0.85rem;">Save Role</button>
              <button type="button" class="btn btn-secondary delete-role-btn" data-role="${escapeHtml(name)}" style="padding:8px 16px; font-size:0.85rem;">Delete Role</button>
            </div>
            <p class="role-tier-hint role-save-status" data-role="${escapeHtml(name)}"></p>
          </div>
        </div>`;
    }).join("");
  }

  // Header button toggles expand/collapse. Save/Delete buttons live inside
  // .role-row-body, a sibling of the header rather than a descendant of
  // it, so clicking them doesn't also trigger the toggle.
  container.querySelectorAll(".role-row-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-role");
      expandedRoleName = (expandedRoleName === name) ? null : name;
      renderRolesList();
    });
  });
  container.querySelectorAll(".save-role-btn").forEach(btn => {
    btn.addEventListener("click", () => saveRole(btn.getAttribute("data-role")));
  });
  container.querySelectorAll(".delete-role-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteRole(btn.getAttribute("data-role")));
  });
}

function roleSaveStatus(name, message, isError) {
  const block = document.querySelector(`[data-role-block="${CSS.escape(name)}"] .role-save-status`);
  if (!block) return;
  block.textContent = message;
  block.style.color = isError ? "#ef4444" : "var(--color-success, #10b981)";
  if (message) setTimeout(() => { block.textContent = ""; }, 4000);
}

function saveRole(originalName) {
  const block = document.querySelector(`[data-role-block="${CSS.escape(originalName)}"]`);
  if (!block) return;
  const newName = block.querySelector(".role-name-input").value.trim();
  const note = block.querySelector(".role-note-input").value.trim();
  const sections = Array.from(block.querySelectorAll(".role-section-checkbox:checked")).map(cb => cb.value);

  if (!newName) {
    roleSaveStatus(originalName, "Role name can't be empty.", true);
    return;
  }
  if (newName !== originalName && roleTiers[newName]) {
    roleSaveStatus(originalName, `A role named "${newName}" already exists.`, true);
    return;
  }

  const nextRoleTiers = { ...roleTiers };
  delete nextRoleTiers[originalName];
  nextRoleTiers[newName] = { sections, note };

  // Renaming cascades to every person currently assigned the old name, so
  // nobody silently loses access because their role field now points at
  // a name that no longer exists in roleTiers.
  const nextUsers = { ...teamAccessUsers };
  if (newName !== originalName) {
    Object.keys(nextUsers).forEach(email => {
      const norm = normalizeUserEntry(nextUsers[email]);
      if (norm.role === originalName) {
        nextUsers[email] = { role: newName };
      }
    });
  }

  const prevRoleTiers = roleTiers;
  const prevUsers = teamAccessUsers;
  const prevExpandedRoleName = expandedRoleName;
  roleTiers = nextRoleTiers;
  teamAccessUsers = nextUsers;
  // Keep the row expanded through a rename instead of it silently
  // collapsing (the accordion keys off the current name, which just changed).
  if (expandedRoleName === originalName) expandedRoleName = newName;

  saveTeamAccessDoc().then(() => {
    roleSaveStatus(newName, "Saved.", false);
    renderRolesList();
    populateRoleSelect();
    renderTable();
  }).catch(err => {
    roleTiers = prevRoleTiers;
    teamAccessUsers = prevUsers;
    expandedRoleName = prevExpandedRoleName;
    roleSaveStatus(originalName, err.message || "Save failed - try again.", true);
    renderRolesList();
  });
}

function deleteRole(name) {
  const assignedCount = Object.keys(teamAccessUsers).filter(email => normalizeUserEntry(teamAccessUsers[email]).role === name).length;
  if (assignedCount > 0) {
    alert(`Can't delete "${name}" - ${assignedCount} teammate(s) are currently assigned this role. Reassign or remove them first (Restricted Teammates table below), then delete the role.`);
    return;
  }
  if (!confirm(`Delete the "${name}" role? This can't be undone.`)) return;

  const prevRoleTiers = roleTiers;
  const prevExpandedRoleName = expandedRoleName;
  const nextRoleTiers = { ...roleTiers };
  delete nextRoleTiers[name];
  roleTiers = nextRoleTiers;
  if (expandedRoleName === name) expandedRoleName = null;

  saveTeamAccessDoc().then(() => {
    renderRolesList();
    populateRoleSelect();
    if (window.parent.showBanner) window.parent.showBanner("success", `Deleted role "${name}".`);
  }).catch(err => {
    roleTiers = prevRoleTiers;
    expandedRoleName = prevExpandedRoleName;
    renderRolesList();
    alert(err.message || "Delete failed - try again.");
  });
}

function addRole() {
  const name = (prompt("Name for the new role:") || "").trim();
  if (!name) return;
  if (roleTiers[name]) {
    alert(`A role named "${name}" already exists.`);
    return;
  }
  const prevRoleTiers = roleTiers;
  const prevExpandedRoleName = expandedRoleName;
  roleTiers = { ...roleTiers, [name]: { sections: [], note: "" } };
  // Open the new role expanded right away - it starts with zero sections,
  // so there's no reason to make someone click twice to get to the
  // checkboxes they almost certainly want to fill in immediately.
  expandedRoleName = name;
  saveTeamAccessDoc().then(() => {
    renderRolesList();
    populateRoleSelect();
  }).catch(err => {
    roleTiers = prevRoleTiers;
    expandedRoleName = prevExpandedRoleName;
    renderRolesList();
    alert(err.message || "Couldn't add role - try again.");
  });
}

// ── Restricted teammates table ──
function renderTable() {
  const tbody = el("restrictionsTableBody");
  const emails = Object.keys(teamAccessUsers).sort();
  tbody.innerHTML = "";
  el("emptyState").style.display = emails.length === 0 ? "block" : "none";

  emails.forEach(email => {
    const norm = normalizeUserEntry(teamAccessUsers[email]);
    const sections = effectiveSections(teamAccessUsers[email]);
    const tagsHtml = sections.length
      ? sections.map(key => `<span class="section-tag">${sectionLabel(key)}</span>`).join("")
      : `<span class="section-tag-empty">No sections (fully restricted)</span>`;
    const roleCell = norm.role
      ? (roleTiers[norm.role] ? escapeHtml(norm.role) : `<span style="color:#ef4444;">${escapeHtml(norm.role)} (deleted)</span>`)
      : `<span class="section-tag-empty">Custom</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="email-cell">${escapeHtml(email)}</td>
      <td>${roleCell}</td>
      <td><div class="section-tag-list">${tagsHtml}</div></td>
      <td class="last-seen-cell">${formatLastSeen((teamActivity[email] || {}).lastSeen)}</td>
      <td>
        <div class="row-actions">
          <button class="edit-btn" data-email="${escapeHtml(email)}">Edit</button>
          <button class="remove-btn" data-email="${escapeHtml(email)}">Remove</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => startEdit(btn.getAttribute("data-email")));
  });
  document.querySelectorAll(".remove-btn").forEach(btn => {
    btn.addEventListener("click", () => removeRestriction(btn.getAttribute("data-email")));
  });
}

function startEdit(email) {
  editingEmail = email;
  el("restrictEmailInput").value = email;
  const norm = normalizeUserEntry(teamAccessUsers[email]);
  el("roleSelect").value = (norm.role && roleTiers[norm.role]) ? norm.role : "";
  renderRoleSelectionUI();
  setCheckedSections(norm.sections);
  renderStaleKeyWarning(norm.sections);
  el("saveRestrictionBtn").textContent = "Update Access";
  el("restrictEmailInput").closest(".step-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm() {
  editingEmail = null;
  el("restrictEmailInput").value = "";
  el("roleSelect").value = "";
  renderRoleSelectionUI();
  setCheckedSections([]);
  renderStaleKeyWarning([]);
  el("saveRestrictionBtn").textContent = "Save Access";
}

function saveTeamAccessDoc() {
  if (!isEmbedded || !window.parent.saveVersionedAgencyDoc || !window.parent.firebaseDoc || !window.parent.firebaseDb) {
    showFormStatus("Not connected to the Hub - can't save.", "error");
    return Promise.reject(new Error("not embedded"));
  }
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamAccess");
  return window.parent.saveVersionedAgencyDoc({
    docRef: ref,
    currentVersion: docVersion,
    buildPayload: (v) => ({ users: teamAccessUsers, roleTiers: roleTiers, version: v }),
  }).then(result => {
    if (!result.ok) {
      const err = new Error(result.reason === "conflict"
        ? "Someone else updated Team Access while you had it open. Reload the page to see their changes, then redo your edit."
        : (result.error ? result.error.message : "Save failed - try again."));
      throw err;
    }
    docVersion = result.version;
  });
}

function saveRestriction() {
  const emailInput = el("restrictEmailInput");
  const email = emailInput.value.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    showFormStatus("Enter a valid email first.", "error");
    return;
  }

  const roleName = el("roleSelect").value;
  const entry = roleName ? { role: roleName } : { role: null, sections: getCheckedSections() };

  const prevUsers = teamAccessUsers;
  const nextUsers = { ...teamAccessUsers };
  // Renaming: if editing and the email changed, drop the old key.
  if (editingEmail && editingEmail !== email) {
    delete nextUsers[editingEmail];
  }
  nextUsers[email] = entry;
  teamAccessUsers = nextUsers;

  saveTeamAccessDoc().then(() => {
    showFormStatus("Saved.", "success");
    resetForm();
    renderTable();
    if (window.parent.showBanner) {
      window.parent.showBanner("success", `Updated Hub access for ${email}.`);
    }
  }).catch(err => {
    teamAccessUsers = prevUsers;
    console.error("Team access save failed:", err);
    showFormStatus(err.message || "Save failed - try again.", "error");
  });
}

function removeRestriction(email) {
  if (!confirm(`Remove the access restriction for ${email}? They'll go back to seeing everything in the Hub.`)) return;
  const prevUsers = teamAccessUsers;
  const nextUsers = { ...teamAccessUsers };
  delete nextUsers[email];
  teamAccessUsers = nextUsers;
  saveTeamAccessDoc().then(() => {
    renderTable();
    if (editingEmail === email) resetForm();
    if (window.parent.showBanner) {
      window.parent.showBanner("success", `${email} now has full Hub access again.`);
    }
  }).catch(err => {
    teamAccessUsers = prevUsers;
    console.error("Team access remove failed:", err);
    showFormStatus(err.message || "Couldn't remove - try again.", "error");
  });
}

function listenToTeamActivity() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot) return;
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamActivity");
  window.parent.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap.exists ? docSnap.data() : null;
    teamActivity = (data && data.users) ? data.users : {};
    renderTable();
  }, (err) => {
    console.error("Team activity listener error:", err);
  });
}

function listenToTeamAccess() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot) {
    // Not embedded (e.g. opened directly outside the Hub) - nothing to manage.
    el("teamAccessContent").style.display = "none";
    el("notAuthorizedState").style.display = "block";
    el("notAuthorizedState").textContent = "Open this from inside the Hub to manage team access.";
    return;
  }

  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamAccess");
  window.parent.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap.exists ? docSnap.data() : null;
    teamAccessUsers = (data && data.users) ? data.users : {};
    // First-ever load with no roleTiers saved yet: seed in-memory from the
    // defaults so the UI has something to show. Not written to Firestore
    // until an actual save happens (adding/editing a role, or saving a
    // person) - doesn't clobber anything by just being viewed.
    roleTiers = (data && data.roleTiers && Object.keys(data.roleTiers).length) ? data.roleTiers : JSON.parse(JSON.stringify(DEFAULT_ROLE_TIERS));
    docVersion = (data && data.version) || 0;

    // Gate the panel itself: a restricted teammate should never be able
    // to open Team Access, even if they reach this URL directly - only
    // accounts with no entry in the map (full access) can manage it.
    const currentEmail = (window.parent.currentAdminEmail || "").toLowerCase();
    const isRestricted = currentEmail && Object.prototype.hasOwnProperty.call(teamAccessUsers, currentEmail);

    if (isRestricted) {
      el("teamAccessContent").style.display = "none";
      el("notAuthorizedState").style.display = "block";
      el("notAuthorizedState").textContent = "You don't have access to manage Team Access.";
      return;
    }

    el("teamAccessContent").style.display = "";
    el("notAuthorizedState").style.display = "none";
    populateRoleSelect();
    renderRolesList();
    renderTable();
  }, (err) => {
    console.error("Team access listener error:", err);
    showFormStatus("Couldn't load current restrictions.", "error");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderSectionCheckboxes();
  el("saveRestrictionBtn").addEventListener("click", saveRestriction);
  el("roleSelect").addEventListener("change", () => {
    renderRoleSelectionUI();
    renderStaleKeyWarning(getCheckedSections());
  });
  document.querySelectorAll(".section-checkbox").forEach(cb => {
    cb.addEventListener("change", () => renderStaleKeyWarning(getCheckedSections()));
  });
  el("addRoleBtn").addEventListener("click", addRole);
  listenToTeamAccess();
  listenToTeamActivity();
});
