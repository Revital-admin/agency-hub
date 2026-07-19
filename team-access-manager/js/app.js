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
  { key: "execution", label: "Execution" },
  { key: "audits", label: "Audits" },
  { key: "strategy-competition", label: "Strategy & Competition" },
  { key: "sales", label: "Sales" },
  { key: "agency-globals", label: "Agency Globals" }
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
let editingEmail = null; // set while the form is editing an existing entry

function el(id) { return document.getElementById(id); }
function sectionLabel(key) {
  const def = SECTION_DEFS.find(s => s.key === key);
  return def ? def.label : key;
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
  el("saveRestrictionBtn").textContent = "Update Access";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  editingEmail = null;
  el("restrictEmailInput").value = "";
  setCheckedSections([]);
  el("saveRestrictionBtn").textContent = "Save Access";
}

function saveTeamAccessDoc() {
  if (!isEmbedded || !window.parent.firebaseSetDoc || !window.parent.firebaseDoc || !window.parent.firebaseDb) {
    showFormStatus("Not connected to the Hub - can't save.", "error");
    return Promise.reject(new Error("not embedded"));
  }
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "teamAccess");
  return window.parent.firebaseSetDoc(ref, { users: teamAccessUsers });
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
  el("saveRestrictionBtn").addEventListener("click", saveRestriction);
  listenToTeamAccess();
});
