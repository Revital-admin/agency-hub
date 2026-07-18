let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.getAllClients === 'function') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const SANDBOX_NAME = "Quick Sandbox (One-Offs)";

function el(id) { return document.getElementById(id); }

function getClients() {
  if (isEmbedded) {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  return {};
}

function persist() {
  if (isEmbedded) window.parent.saveDatabase();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function populateClientSelect() {
  const clients = getClients();
  const select = el('newClientSelect');
  select.innerHTML = '<option value="">Select a client to track...</option>';
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    if (clients[name].budgetPacing) return; // already tracked
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

function getPacingClass(spent, total, startDate, endDate) {
  if (!total || total <= 0) return 'pace-good';
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();
  
  if (now > end) return 'pace-danger'; // past end date
  if (now < start) return 'pace-good'; // hasn't started
  
  const totalDays = (end - start) / (1000 * 60 * 60 * 24);
  const daysPassed = (now - start) / (1000 * 60 * 60 * 24);
  const expectedPacingRatio = daysPassed / totalDays;
  const actualPacingRatio = spent / total;

  if (actualPacingRatio > expectedPacingRatio * 1.15) return 'pace-danger'; // Overspending
  if (actualPacingRatio < expectedPacingRatio * 0.85) return 'pace-warn';   // Underspending
  return 'pace-good';
}

function formatValue(type, val) {
  if (type === 'Ad Spend') return '$' + Number(val || 0).toLocaleString();
  return Number(val || 0).toString() + ' hrs';
}

function renderTable() {
  const clients = getClients();
  const listEl = el('trackerList');
  listEl.innerHTML = '';

  const tracked = Object.keys(clients).filter(name => clients[name].budgetPacing);
  
  if (tracked.length === 0) {
    el('emptyState').style.display = 'flex';
  } else {
    el('emptyState').style.display = 'none';
  }

  tracked.forEach(name => {
    const p = clients[name].budgetPacing;
    const pct = p.totalBudget ? Math.min(100, Math.round((p.spentToDate / p.totalBudget) * 100)) : 0;
    const paceClass = getPacingClass(p.spentToDate, p.totalBudget, p.startDate, p.endDate);

    const card = document.createElement('div');
    card.className = 'pacing-card';
    
    card.innerHTML = `
      <div class="card-header">
        <div>
          <h3 class="card-title">${name}</h3>
          <span class="card-type">${p.budgetType || 'Retainer'}</span>
        </div>
        <button class="btn-remove-action delete-btn" data-client="${name}">✕</button>
      </div>

      <div class="progress-container">
        <div class="progress-bar ${paceClass}" style="width: ${pct}%"></div>
      </div>

      <div class="pacing-stats">
        <span class="spent">${formatValue(p.budgetType, p.spentToDate)} Spent</span>
        <span class="total">${formatValue(p.budgetType, p.totalBudget)} Total</span>
      </div>

      <div class="card-actions">
        <div class="form-group" style="margin:0">
          <label style="font-size:10px">Spent to Date</label>
          <input type="number" class="form-control spent-input" data-client="${name}" value="${p.spentToDate}">
        </div>
        <div class="form-group" style="margin:0">
          <label style="font-size:10px">Total Budget</label>
          <input type="number" class="form-control total-input" data-client="${name}" value="${p.totalBudget}">
        </div>
      </div>
      <div class="form-row mt-2">
        <div class="form-group" style="flex:1; margin:0">
          <label style="font-size:10px">Start Date</label>
          <input type="date" class="form-control start-input" data-client="${name}" value="${p.startDate}">
        </div>
        <div class="form-group" style="flex:1; margin:0">
          <label style="font-size:10px">End Date</label>
          <input type="date" class="form-control end-input" data-client="${name}" value="${p.endDate}">
        </div>
      </div>
    `;
    listEl.appendChild(card);
  });

  wireListeners();
}

function wireListeners() {
  const clients = getClients();

  document.querySelectorAll('.spent-input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const c = e.target.getAttribute('data-client');
      clients[c].budgetPacing.spentToDate = Number(e.target.value) || 0;
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.total-input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const c = e.target.getAttribute('data-client');
      clients[c].budgetPacing.totalBudget = Number(e.target.value) || 0;
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.start-input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const c = e.target.getAttribute('data-client');
      clients[c].budgetPacing.startDate = e.target.value;
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.end-input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const c = e.target.getAttribute('data-client');
      clients[c].budgetPacing.endDate = e.target.value;
      persist();
      renderTable();
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!confirm("Stop tracking this budget?")) return;
      const c = e.target.getAttribute('data-client');
      delete clients[c].budgetPacing;
      persist();
      populateClientSelect();
      renderTable();
    });
  });
}

function getNextMonthEnd() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(0); // last day of current month
  return d.toISOString().slice(0, 10);
}

function getMonthStart() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

el('addTrackerBtn').addEventListener('click', () => {
  const clientName = el('newClientSelect').value;
  if (!clientName) {
    alert("Select a client first.");
    return;
  }

  const clients = getClients();
  const type = confirm("Track Ad Spend? (Cancel for Retainer Hours)") ? 'Ad Spend' : 'Retainer Hours';
  
  clients[clientName].budgetPacing = {
    budgetType: type,
    totalBudget: type === 'Ad Spend' ? 5000 : 20,
    spentToDate: 0,
    startDate: getMonthStart(),
    endDate: getNextMonthEnd()
  };

  persist();
  el('newClientSelect').value = '';
  populateClientSelect();
  renderTable();
});

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  renderTable();
});
