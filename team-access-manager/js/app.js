/* ============================================================
   TEAM ACCESS MANAGER — APP LOGIC
   Hub-wide (not per-client). Reads/writes a single small Firestore
   doc, agency/teamAccess: { users: { "email": ["sectionKey", ...] } }.

   Anyone NOT listed in that map has full access to every section of
   the Hub (unchanged default behavior) - this tool only adds explicit
   restrictions for specific teammates. This is a menu-level control:
   it hides sidebar sections for restricted accounts, it does not
   change what the underlying Firestore rules allow that account to
   read/write. Scoped to trusted internal teammates for that reason.
   ============================================================ */

const SECTION_DEFS = [
  { key: "core", label: "Core" },
  { key: "account-management", label: "Account Management" },
  { key: "production", label: "Production" },
  { key: "content-creation", label: "Content Creation" },
  { key: "account-ops", label: "Account Ops" },
  { key: "audits", label: "Audits" },
  { key: "strategy-competition", label: "Strategy & Competition" },
  { key: "sales-pipeline", label: "Sales Pipeline" },
  { key: "client-retention", label: "Client Retention" },
  { key: "social-proof", label: "Social Proof" },
  { key: "agency-globals", label: "Agency Globals" }
];

// Role tiers — a quick-fill convenience for the section checkboxes below.
// Picking a role auto-checks the sections that role would typically need;
// the checkboxes stay fully editable after, and this has no effect on
// storage (still just { email: [sectionKey, ...] } in Firestore).
//
// Trimmed to roles that would actually log into the Hub - the marketing/
// client-facing side of the business (leadership, sales, account
// management, digital marketing, ops/admin). Field production and AV crew
// (shoot-day crew, editors, live events techs, etc.) don't use the Hub
// day-to-day, so they're left off rather than padding the list.
const ROLE_TIERS = [
  {
    tier: "Full Access — Leadership",
    sections: ["core", "account-management", "production", "content-creation", "account-ops", "audits", "strategy-competition", "sales-pipeline", "client-retention", "social-proof", "agency-globals"],
    roles: ["Founder / CEO", "Creative Director", "Executive Producer", "Chief Operating Officer (COO)", "Head of Strategy"]
  },
  {
    tier: "Sales & Business Development",
    sections: ["sales-pipeline", "social-proof", "strategy-competition"],
    roles: ["Business Development Manager", "New Business Representative", "Sales Coordinator", "Partnerships Manager", "Proposal & Bids Specialist"]
  },
  {
    tier: "Account Management / Client Services",
    sections: ["core", "account-management", "production", "content-creation", "account-ops", "client-retention", "social-proof"],
    roles: ["Producer", "Senior Producer", "Account Manager", "Account Coordinator", "Client Success Manager"]
  },
  {
    tier: "Digital Marketing",
    sections: ["account-management", "content-creation", "account-ops", "audits", "strategy-competition"],
    roles: ["Digital Marketing Strategist", "Social Media Manager", "Content Manager", "SEO Specialist", "Paid Ads Specialist", "Email Marketing Specialist", "Analytics / Reporting Specialist"]
  },
  {
    tier: "Operations & Admin",
    sections: ["core", "account-management", "agency-globals"],
    roles: ["Studio Manager", "Operations Manager", "Executive Assistant", "Bookkeeper / Finance Manager", "HR Coordinator"]
  }
];

let isEmbedded = false;
try {
  if (window.parent && window.parent.firebaseDb) {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

let teamAccessUsers = {}; // { email: [sectionKey, ...] }
let teamActivity = {}; // { email: { lastSeen: isoString } }
let editingEmail = null; // set while the form is editing an existing entry

function el(id) { return document.getElementById(id); }
function sectionLabel(key) {
  const def = SECTION_DEFS.find(s => s.key === key);
  return def ? def.label : key;
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

function populateRoleTierSelect() {
  const select = el("roleTierSelect");
  if (!select) return;
  const options = ROLE_TIERS.map(t => `<option value="${t.tier.replace(/"/g, "&quot;")}">${t.tier}</option>`).join("");
  select.innerHTML = `<option value="">— Select an access tier —</option>${options}`;
}

function applyRoleTier(tierName) {
  const hint = el("roleTierHint");
  if (!tierName) {
    if (hint) hint.textContent = "";
    return;
  }
  const tier = ROLE_TIERS.find(t => t.tier === tierName);
  if (!tier) return;
  setCheckedSections(tier.sections);
  if (hint) {
    hint.textContent = `Applied "${tier.tier}" access (${tier.sections.map(sectionLabel).join(", ")}). Adjust the checkboxes below if this person needs more or less. See the SOP Wiki for which role maps to which tier.`;
  }
}

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

function showFormStatus(message, type) {
  const status = el("formStatus");
  status.textContent = message;
  status.className = "form-status" + (type ? " " + type : "");
  if (message) setTimeout(() => { status.textContent = ""; status.className = "form-status"; }, 4000);
}

function renderTable() {
  const tbody = el("restrictionsTableBody");
  const emails = Object.keys(teamAccessUsers).sort();
  tbody.innerHTML = "";
  el("emptyState").style.display = emails.length === 0 ? "block" : "none";

  emails.forEach(email => {
    const sections = teamAccessUsers[email] || [];
    const tr = document.createElement("tr");
    const tagsHtml = sections.length
      ? sections.map(key => `<span class="section-tag">${sectionLabel(key)}</span>`).join("")
      : `<span class="section-tag-empty">No sections (fully restricted)</span>`;
    tr.innerHTML = `
      <td class="email-cell">${email}</td>
      <td><div class="section-tag-list">${tagsHtml}</div></td>
      <td class="last-seen-cell">${formatLastSeen((teamActivity[email] || {}).lastSeen)}</td>
      <td>
        <div class="row-actions">
          <button class="edit-btn" data-email="${email}">Edit</button>
          <button class="remove-btn" data-email="${email}">Remove</button>
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
  setCheckedSections(teamAccessUsers[email] || []);
  if (el("roleTierSelect")) el("roleTierSelect").value = "";
  if (el("roleTierHint")) el("roleTierHint").textContent = "";
  el("saveRestrictionBtn").textContent = "Update Access";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  editingEmail = null;
  el("restrictEmailInput").value = "";
  setCheckedSections([]);
  if (el("roleTierSelect")) el("roleTierSelect").value = "";
  if (el("roleTierHint")) el("roleTierHint").textContent = "";
  el("saveRestrictionBtn").textContent = "Save Access";
}

function saveTeamAccessDoc() {
  if (!isEmbedded || !window.parent.firebaseSetDocFromJSON || !window.parent.firebaseDoc || !window.parent.firebaseDb) {
    showFormStatus("Not connected to the Hub - can't save.", "error");
    return Promise.reject(new Error("not embedded"));
  }
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamAccess");
  // A plain object literal built in this iframe's own JS realm gets
  // rejected by Firestore ("a custom Object object") when handed straight
  // to a Firestore call bound to the parent page - this was the real
  // cause of "Save Access does nothing." Pass a JSON string instead so
  // the parent parses it in its own realm before writing.
  return window.parent.firebaseSetDocFromJSON(ref, JSON.stringify({ users: teamAccessUsers }));
}

function saveRestriction() {
  const emailInput = el("restrictEmailInput");
  const email = emailInput.value.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    showFormStatus("Enter a valid email first.", "error");
    return;
  }

  const sections = getCheckedSections();

  // Renaming: if editing and the email changed, drop the old key.
  if (editingEmail && editingEmail !== email) {
    delete teamAccessUsers[editingEmail];
  }
  teamAccessUsers[email] = sections;

  saveTeamAccessDoc().then(() => {
    showFormStatus("Saved.", "success");
    resetForm();
    renderTable();
    if (window.parent.showBanner) {
      window.parent.showBanner("success", `Updated Hub access for ${email}.`);
    }
  }).catch(err => {
    console.error("Team access save failed:", err);
    showFormStatus("Save failed - try again.", "error");
  });
}

function removeRestriction(email) {
  if (!confirm(`Remove the access restriction for ${email}? They'll go back to seeing everything in the Hub.`)) return;
  delete teamAccessUsers[email];
  saveTeamAccessDoc().then(() => {
    renderTable();
    if (editingEmail === email) resetForm();
    if (window.parent.showBanner) {
      window.parent.showBanner("success", `${email} now has full Hub access again.`);
    }
  }).catch(err => {
    console.error("Team access remove failed:", err);
    showFormStatus("Couldn't remove - try again.", "error");
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
    renderTable();
  }, (err) => {
    console.error("Team access listener error:", err);
    showFormStatus("Couldn't load current restrictions.", "error");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderSectionCheckboxes();
  populateRoleTierSelect();
  el("saveRestrictionBtn").addEventListener("click", saveRestriction);
  if (el("roleTierSelect")) {
    el("roleTierSelect").addEventListener("change", (e) => applyRoleTier(e.target.value));
  }
  listenToTeamAccess();
  listenToTeamActivity();
});
