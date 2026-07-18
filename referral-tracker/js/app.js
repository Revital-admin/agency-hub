/* ============================================================
   REFERRAL TRACKER — APP LOGIC
   (agency-wide: not tied to a single client, so this stores its own
   list at agency/referrals rather than living inside clientsDb)
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.firebaseDb === 'object') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

let referrals = [];

function el(id) { return document.getElementById(id); }

function getReferralsDocRef() {
  if (!isEmbedded || !window.parent.firebaseDoc || !window.parent.firebaseDb) return null;
  return window.parent.firebaseDoc(window.parent.firebaseDb, "agency", "referrals");
}

async function loadReferrals() {
  if (isEmbedded && window.parent.firebaseGetDoc) {
    try {
      const ref = getReferralsDocRef();
      const snap = await window.parent.firebaseGetDoc(ref);
      referrals = (snap && snap.exists && snap.data().list) || [];
      return;
    } catch (e) {
      console.error("Couldn't load referrals from the cloud:", e);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', "Couldn't load referrals from the cloud: " + e.message);
      }
      referrals = [];
      return;
    }
  }
  try {
    const saved = localStorage.getItem('referral-tracker-list');
    referrals = saved ? JSON.parse(saved) : [];
  } catch (e) { referrals = []; }
}

async function persist() {
  if (isEmbedded && window.parent.firebaseSetDoc) {
    try {
      const ref = getReferralsDocRef();
      await window.parent.firebaseSetDoc(ref, { list: referrals });
      return true;
    } catch (e) {
      console.error("Couldn't save referrals to the cloud:", e);
      if (window.parent.showBanner) {
        window.parent.showBanner('error', "Couldn't save — your change may be lost on reload: " + e.message);
      }
      return false;
    }
  }
  try {
    localStorage.setItem('referral-tracker-list', JSON.stringify(referrals));
  } catch (e) {}
  return true;
}

function todayStr() {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

function uid() {
  return 'ref-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

const STATUS_OPTIONS = ['Pending', 'Became Client', 'Declined'];
const REWARD_OPTIONS = ['Not Owed', 'Owed', 'Paid'];

function populateReferrerDatalist() {
  const list = el('referrerOptions');
  list.innerHTML = '';
  if (!isEmbedded || typeof window.parent.getAllClients !== 'function') return;
  let clients = {};
  try { clients = window.parent.getAllClients() || {}; } catch (e) { clients = {}; }
  Object.keys(clients).sort().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    list.appendChild(opt);
  });
}

function renderSummary() {
  const pending = referrals.filter(r => r.status === 'Pending');
  const won = referrals.filter(r => r.status === 'Became Client');
  const owed = referrals.filter(r => r.rewardStatus === 'Owed');

  el('summaryPending').textContent = pending.length;
  el('summaryWon').textContent = won.length;
  el('summaryOwed').textContent = owed.length;
}

function optionsHtml(list, selected) {
  return list.map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('');
}

function renderTable() {
  renderSummary();

  const rows = [...referrals].sort((a, b) => (b.dateReferred || '').localeCompare(a.dateReferred || ''));

  const tbody = el('trackerTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(r => {
    const tr = document.createElement('tr');
    const closed = r.status !== 'Pending';
    tr.className = closed ? 'urgency-closed' : (r.rewardStatus === 'Owed' ? 'urgency-yellow' : 'urgency-green');

    tr.innerHTML = `
      <td class="name-cell">${r.referrerName}</td>
      <td class="name-cell">${r.referredName}</td>
      <td class="date-cell">${r.dateReferred || '--'}</td>
      <td><select class="status-select" data-id="${r.id}">${optionsHtml(STATUS_OPTIONS, r.status)}</select></td>
      <td><select class="reward-select" data-id="${r.id}">${optionsHtml(REWARD_OPTIONS, r.rewardStatus)}</select></td>
      <td><input type="number" class="reward-amount-input" data-id="${r.id}" value="${r.rewardAmount || ''}" placeholder="$"></td>
      <td><input type="text" class="notes-input" data-id="${r.id}" value="${(r.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="delete-btn" data-id="${r.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  wireRowListeners();
}

function findReferral(id) {
  return referrals.find(r => r.id === id);
}

function wireRowListeners() {
  document.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const r = findReferral(sel.getAttribute('data-id'));
      if (!r) return;
      r.status = sel.value;
      // Becoming a client is the natural trigger for a reward to be owed,
      // but this is just a helpful default — reward status stays fully
      // editable afterward for cases with no reward, already-paid, etc.
      if (sel.value === 'Became Client' && r.rewardStatus === 'Not Owed') {
        r.rewardStatus = 'Owed';
      }
      await persist();
      renderTable();
    });
  });

  document.querySelectorAll('.reward-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const r = findReferral(sel.getAttribute('data-id'));
      if (!r) return;
      r.rewardStatus = sel.value;
      await persist();
      renderTable();
    });
  });

  document.querySelectorAll('.reward-amount-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const r = findReferral(inp.getAttribute('data-id'));
      if (!r) return;
      r.rewardAmount = inp.value;
      await persist();
    });
  });

  document.querySelectorAll('.notes-input').forEach(inp => {
    inp.addEventListener('input', async () => {
      const r = findReferral(inp.getAttribute('data-id'));
      if (!r) return;
      r.notes = inp.value;
      await persist();
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteReferral(btn.getAttribute('data-id')));
  });
}

async function deleteReferral(id) {
  if (!confirm('Delete this referral record? This can\'t be undone.')) return;
  const previous = referrals;
  referrals = referrals.filter(r => r.id !== id);
  const ok = await persist();
  if (!ok) {
    referrals = previous; // roll back on a failed write
  }
  renderTable();
}

async function addReferral() {
  const referrerInput = el('newReferrerName');
  const referredInput = el('newReferredName');
  const dateInput = el('newReferralDate');

  const referrerName = referrerInput.value.trim();
  const referredName = referredInput.value.trim();
  if (!referrerName || !referredName) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Enter both who referred and who they referred.');
    return;
  }

  referrals.push({
    id: uid(),
    referrerName,
    referredName,
    dateReferred: dateInput.value || todayStr(),
    status: 'Pending',
    rewardStatus: 'Not Owed',
    rewardAmount: '',
    notes: ''
  });

  const ok = await persist();
  if (!ok) {
    referrals.pop(); // roll back on a failed write
    renderTable();
    return;
  }

  referrerInput.value = '';
  referredInput.value = '';
  dateInput.value = '';
  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Logged referral: ${referrerName} → ${referredName}.`);
  }
}

function initListeners() {
  el('addReferralBtn').addEventListener('click', addReferral);
}

document.addEventListener('DOMContentLoaded', async () => {
  populateReferrerDatalist();
  await loadReferrals();
  renderTable();
  initListeners();
});
