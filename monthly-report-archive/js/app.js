let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.getAllClients === 'function') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const SANDBOX_NAME = "Quick Sandbox (One-Offs)";
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function el(id) { return document.getElementById(id); }

// Month/Year used to be free text ("October 2024", "Oct 2024", "10/2024" -
// all typed by different people over time), which meant the list could
// only ever sort by insertion order, not by the actual month. The input
// is now a real <input type="month"> (value like "2024-10"), so every
// new entry gets a reliable sortKey alongside the display string. Old
// entries saved before this change won't have a sortKey - fall back to
// the ISO dateAdded timestamp's year-month, which is a reasonable proxy
// since reports were normally logged the same month they were for.
function sortKeyFor(report) {
  if (report.sortKey) return report.sortKey;
  if (report.dateAdded) return report.dateAdded.slice(0, 7);
  return '0000-00';
}

function formatMonthYear(monthInputValue) {
  const [yearStr, monthStr] = (monthInputValue || '').split('-');
  const monthIdx = parseInt(monthStr, 10) - 1;
  if (!yearStr || isNaN(monthIdx) || !MONTH_NAMES[monthIdx]) return monthInputValue || '';
  return `${MONTH_NAMES[monthIdx]} ${yearStr}`;
}

function getClients() {
  if (isEmbedded) {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  return {};
}

function persist() {
  if (isEmbedded) window.parent.saveDatabase();
}

function uid() {
  return 'rep-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function populateClientSelect() {
  const clients = getClients();
  const select = el('clientSelect');
  select.innerHTML = '<option value="">Select a client...</option>';
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

function renderState() {
  const clientName = el('clientSelect').value;

  // Before a client is picked, .left-panel only holds the selector but
  // still reserves its full column width, which visually shoves the
  // empty-state placeholder off-center. This class (see css/style.css)
  // stacks the panels full-width instead while a client is unselected.
  const splitLayout = document.querySelector('.split-layout');
  if (splitLayout) splitLayout.classList.toggle('no-client', !clientName);

  if (!clientName) {
    el('emptyState').style.display = 'flex';
    el('reportsInterface').style.display = 'none';
    return;
  }

  el('emptyState').style.display = 'none';
  el('reportsInterface').style.display = 'block';

  // Set default month
  const d = new Date();
  el('newMonth').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const clients = getClients();
  const reports = clients[clientName].reportArchive || [];

  const listEl = el('reportsList');
  listEl.innerHTML = '';

  if (reports.length === 0) {
    listEl.innerHTML = '<p style="color: var(--color-text-secondary)">No reports published yet.</p>';
    return;
  }

  // Reverse chronological by actual month, not insertion order
  [...reports].sort((a, b) => sortKeyFor(b).localeCompare(sortKeyFor(a))).forEach(r => {
    const card = document.createElement('div');
    card.className = 'report-card';

    card.innerHTML = `
      <div class="report-info">
        <h4>${(r.monthYear || 'Unknown').replace(/</g, '&lt;')}</h4>
        ${r.notes ? `<p>${r.notes.replace(/</g, '&lt;')}</p>` : ''}
      </div>
      <div class="report-actions">
        <a href="${r.url}" target="_blank" class="btn-secondary sm" style="text-decoration:none">Open Link</a>
        <button class="btn-remove-action delete-rep-btn" data-id="${r.id}" style="color:#f87171">✕</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  wireDynamicListeners();
}

function wireDynamicListeners() {
  const clientName = el('clientSelect').value;
  const clients = getClients();

  document.querySelectorAll('.delete-rep-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!confirm("Delete this report from the portal?")) return;
      const rId = e.currentTarget.getAttribute('data-id');
      clients[clientName].reportArchive = (clients[clientName].reportArchive || []).filter(r => r.id !== rId);
      persist();
      renderState();
    });
  });
}

function saveReport() {
  const clientName = el('clientSelect').value;
  if (!clientName) return;

  const monthRaw = el('newMonth').value.trim();
  const monthYear = formatMonthYear(monthRaw);
  const url = el('newUrl').value.trim();
  const notes = el('newNotes').value.trim();

  if (!monthRaw || !url) {
    if (isEmbedded && window.parent.showBanner) {
      window.parent.showBanner('error', 'Please provide a Month and a URL.');
    } else {
      alert("Please provide a Month and a URL.");
    }
    return;
  }

  const clients = getClients();
  if (!clients[clientName].reportArchive) {
    clients[clientName].reportArchive = [];
  }

  clients[clientName].reportArchive.push({
    id: uid(),
    sortKey: monthRaw,
    monthYear,
    url,
    notes,
    dateAdded: new Date().toISOString()
  });

  if (isEmbedded && window.parent.pushClientNotification) {
    window.parent.pushClientNotification(clients[clientName], "report", `Your ${monthYear} report is now available in Monthly Reports.`);
  }

  persist();

  // Reset form
  el('newUrl').value = '';
  el('newNotes').value = '';

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', 'Report published to Client Portal!');
  }

  renderState();
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  el('clientSelect').addEventListener('change', renderState);
  el('saveReportBtn').addEventListener('click', saveReport);
  renderState();

  // The parent Hub loads its client database asynchronously (instant
  // localStorage boot, then a Firestore sync on top of that). If this
  // module's iframe finishes loading before that data is ready,
  // populateClientSelect() above runs against an empty client list and -
  // since nothing else ever re-triggers it - the dropdown stays empty
  // forever, even after the real data arrives moments later. Poll
  // briefly and re-populate once real client data shows up.
  let clientPollAttempts = 0;
  const clientPoll = setInterval(() => {
    clientPollAttempts++;
    const hasClients = Object.keys(getClients()).length > 0;
    if (hasClients || clientPollAttempts > 30) {
      clearInterval(clientPoll);
      if (hasClients) populateClientSelect();
    }
  }, 250);
});
