/* ============================================================
   ACTIVITY LOG — APP LOGIC
   Read-only viewer over agency/adminActivityLog, written to by
   logAdminActivity() in the parent Hub's app.js (client created/deleted,
   approval sent, engagement stage changed - see that function's comment
   for the full list of what gets logged). This tool never writes
   anything itself.
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.getAllClients === 'function') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

let activityLog = [];

function el(id) { return document.getElementById(id); }

function timeAgoLabel(isoString) {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function listenToActivityLog() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb || !window.parent.firebaseOnSnapshot) return;
  const ref = window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "adminActivityLog");
  window.parent.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap && docSnap.exists ? docSnap.data() : null;
    activityLog = (data && data.list) || [];
    renderList();
  }, (err) => console.error("Activity log listener error:", err));
}

function renderList() {
  const searchText = (el('activityLogSearchInput').value || "").trim().toLowerCase();
  const listEl = el('activityLogList');
  const emptyEl = el('activityLogEmpty');

  const filtered = !searchText ? activityLog : activityLog.filter(entry => {
    const haystack = [entry.action, entry.details, entry.by].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(searchText);
  });

  emptyEl.style.display = filtered.length === 0 ? "block" : "none";
  emptyEl.textContent = activityLog.length === 0 ? "No activity logged yet." : "Nothing matches that search.";

  listEl.innerHTML = filtered.map(entry => `
    <div class="activity-log-row">
      <div class="activity-log-row-main">
        <span class="activity-log-action">${escapeHtml(entry.action || "")}</span>
        ${entry.details ? `<span class="activity-log-details">${escapeHtml(entry.details)}</span>` : ""}
      </div>
      <div class="activity-log-row-meta">
        <span class="activity-log-by">${escapeHtml(entry.by || "unknown")}</span>
        <span class="activity-log-time">${timeAgoLabel(entry.createdAt)}</span>
      </div>
    </div>
  `).join("");
}

document.addEventListener('DOMContentLoaded', () => {
  el('activityLogSearchInput').addEventListener('input', renderList);
  listenToActivityLog();

  // Same iframe-load-race guard used across the other cross-client tools -
  // the parent's firebase globals can be a beat behind this iframe's own
  // load, so retry briefly if the listener didn't attach the first time.
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    if (window.parent.firebaseDb) {
      listenToActivityLog();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
