/* ============================================================
   CLIENT RENEWAL TRACKER — APP LOGIC
   (cross-client: reads/writes every client's `renewal` record)
   ============================================================ */

let isEmbedded = false;
try {
  if (window.parent && typeof window.parent.getAllClients === 'function') {
    isEmbedded = true;
  }
} catch (e) {
  console.warn("CORS prevented parent access:", e);
}

const SANDBOX_NAME = "Quick Sandbox (One-Offs)";
const STATUS_OPTIONS = ['On Track', 'At Risk', 'Renewed', 'Churned'];

function el(id) { return document.getElementById(id); }

function getClients() {
  if (isEmbedded) {
    try { return window.parent.getAllClients() || {}; } catch (e) { return {}; }
  }
  try {
    const saved = localStorage.getItem('renewal-tracker-clients');
    return saved ? JSON.parse(saved) : {};
  } catch (e) { return {}; }
}

function persist() {
  if (isEmbedded) {
    window.parent.saveDatabase();
  } else {
    try { localStorage.setItem('renewal-tracker-clients', JSON.stringify(getClients())); } catch (e) {}
  }
}

function toDateOnly(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addMonths(dateStr, months) {
  const dt = toDateOnly(dateStr);
  dt.setMonth(dt.getMonth() + Number(months || 12));
  return dt.toISOString().slice(0, 10);
}

function todayStr() {
  return toDateOnly(new Date()).toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStrVal) {
  const from = toDateOnly(fromStr);
  const to = toDateOnly(toStrVal);
  return Math.round((to - from) / 86400000);
}

function getUrgency(r) {
  if (r.status === 'Renewed' || r.status === 'Churned') return 'closed';
  const daysUntil = daysBetween(todayStr(), r.renewalDate);
  if (r.status === 'At Risk' || daysUntil <= 7) return 'red';
  if (daysUntil <= 30) return 'yellow';
  return 'green';
}

function populateClientSelect() {
  const clients = getClients();
  const select = el('newClientSelect');
  select.innerHTML = '<option value="">Select a client to track...</option>';
  Object.keys(clients).sort().forEach(name => {
    if (name === SANDBOX_NAME) return;
    const r = clients[name].renewal;
    if (r && (r.status === 'On Track' || r.status === 'At Risk')) return; // already being tracked
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

function renderSummary(rows) {
  const tracked = rows.filter(r => r.rec.status === 'On Track' || r.rec.status === 'At Risk');
  const within30 = tracked.filter(r => daysBetween(todayStr(), r.rec.renewalDate) <= 30);
  const within7 = tracked.filter(r => daysBetween(todayStr(), r.rec.renewalDate) <= 7);

  el('summaryTracked').textContent = tracked.length;
  el('summary30').textContent = within30.length;
  el('summary7').textContent = within7.length;
}

function statusOptionsHtml(selected) {
  return STATUS_OPTIONS.map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('');
}

function renderTable() {
  const clients = getClients();
  const showClosed = el('showClosedToggle').checked;

  const allRows = Object.keys(clients)
    .filter(name => clients[name].renewal)
    .map(name => ({ name, rec: clients[name].renewal }));

  renderSummary(allRows);

  const rows = allRows
    .filter(r => showClosed || (r.rec.status === 'On Track' || r.rec.status === 'At Risk'))
    .sort((a, b) => (a.rec.renewalDate || '9999').localeCompare(b.rec.renewalDate || '9999'));

  const tbody = el('trackerTableBody');
  tbody.innerHTML = '';
  el('emptyState').style.display = rows.length === 0 ? 'block' : 'none';

  rows.forEach(row => {
    const { name, rec } = row;
    const daysUntil = daysBetween(todayStr(), rec.renewalDate);
    const urgency = getUrgency(rec);
    const tr = document.createElement('tr');
    tr.className = 'urgency-' + urgency;

    const isOpen = rec.status === 'On Track' || rec.status === 'At Risk';

    tr.innerHTML = `
      <td class="client-cell">${name}</td>
      <td class="date-cell">${rec.renewalDate || '--'}</td>
      <td class="date-cell">${isOpen ? (daysUntil >= 0 ? daysUntil + 'd' : Math.abs(daysUntil) + 'd overdue') : '--'}</td>
      <td class="date-cell">${rec.contractLengthMonths || 12} mo</td>
      <td><select class="status-select" data-client="${name}">${statusOptionsHtml(rec.status)}</select></td>
      <td>${rec.status === 'Churned' && rec.churnReason ? `<span class="churn-reason-tag">${rec.churnReason}</span>${rec.churnDetail ? `<div style="font-size:0.68rem; color:var(--text-muted); margin-top:4px; max-width:180px;">${rec.churnDetail}</div>` : ''}` : '—'}</td>
      <td><input type="text" class="notes-input" data-client="${name}" value="${(rec.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes..."></td>
      <td>
        <div class="row-actions">
          <button class="renewed-btn" data-client="${name}" ${!isOpen ? 'disabled' : ''}>Mark Renewed</button>
          <button class="churned-btn" data-client="${name}" ${!isOpen ? 'disabled' : ''}>Mark Churned</button>
          <button class="email-client-btn" data-client="${name}">Email Client</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  wireRowListeners();
}

function wireRowListeners() {
  document.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const clients = getClients();
      const rec = clients[sel.getAttribute('data-client')].renewal;
      rec.status = sel.value;
      persist();
      renderTable();
      populateClientSelect();
    });
  });

  document.querySelectorAll('.notes-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const clients = getClients();
      clients[inp.getAttribute('data-client')].renewal.notes = inp.value;
      persist();
    });
  });

  document.querySelectorAll('.renewed-btn').forEach(btn => {
    btn.addEventListener('click', () => markRenewed(btn.getAttribute('data-client')));
  });
  document.querySelectorAll('.churned-btn').forEach(btn => {
    btn.addEventListener('click', () => openChurnReasonPanel(btn.getAttribute('data-client')));
  });
  document.querySelectorAll('.email-client-btn').forEach(btn => {
    btn.addEventListener('click', () => openEmailToClientPanel(btn.getAttribute('data-client')));
  });
}

function markRenewed(clientName) {
  const clients = getClients();
  const rec = clients[clientName].renewal;
  if (!rec) return;

  // Advance the renewal date forward by the contract length instead of
  // just flipping a flag, so the tracker is already set up for the next
  // cycle without anyone having to remember to re-add it.
  rec.renewalDate = addMonths(rec.renewalDate, rec.contractLengthMonths || 12);
  rec.status = 'On Track';
  rec.lastRenewedDate = todayStr();

  persist();
  renderTable();
  populateClientSelect();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `${clientName} renewed — next renewal set to ${rec.renewalDate}.`);
  }
}

function markChurned(clientName, reason, detail) {
  const clients = getClients();
  const rec = clients[clientName].renewal;
  if (!rec) return;
  rec.status = 'Churned';
  rec.churnReason = reason || '';
  rec.churnDetail = detail || '';
  rec.churnedDate = todayStr();
  persist();
  renderTable();
  populateClientSelect();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Marked ${clientName} as churned.`);
  }

  // Nothing previously connected this moment to Client Offboarding
  // Checklist - whoever churned the client had to separately remember to
  // go start it themselves (access revocation, final invoice, asset
  // handoff, etc.). No draft email here, same reasoning as the health-Red
  // flip nudge in weekly-account-checkin - this is an internal
  // follow-through reminder, not something meant to go out to the client.
  if (isEmbedded && window.parent.pushAdminNotification) {
    window.parent.pushAdminNotification('client_churned', `${clientName} was marked churned - start Client Offboarding Checklist.`, clientName, null);
  }
}

/* ── Churn Reason panel ── */
let currentChurnClientName = null;

function openChurnReasonPanel(clientName) {
  currentChurnClientName = clientName;
  el('churnReasonClientName').textContent = clientName;
  el('churnReasonSelect').value = 'Budget / Price';
  el('churnReasonDetail').value = '';
  el('churnReasonPanel').style.display = 'block';
  el('churnReasonPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeChurnReasonPanel() {
  currentChurnClientName = null;
  el('churnReasonPanel').style.display = 'none';
}

function addTrackedRenewal() {
  const select = el('newClientSelect');
  const dateInput = el('newRenewalDate');
  const lengthInput = el('newContractLength');
  const clientName = select.value;
  if (!clientName) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Choose a client first.');
    return;
  }
  if (!dateInput.value) {
    if (isEmbedded && window.parent.showBanner) window.parent.showBanner('error', 'Set a renewal date first.');
    return;
  }

  const clients = getClients();
  if (!clients[clientName]) return;

  clients[clientName].renewal = {
    status: 'On Track',
    renewalDate: dateInput.value,
    contractLengthMonths: Number(lengthInput.value) || 12,
    lastRenewedDate: '',
    notes: ''
  };

  persist();
  select.value = '';
  dateInput.value = '';
  lengthInput.value = '12';
  populateClientSelect();
  renderTable();

  if (isEmbedded && window.parent.showBanner) {
    window.parent.showBanner('success', `Now tracking renewal for ${clientName}.`);
  }
}

function initListeners() {
  el('addTrackedRenewalBtn').addEventListener('click', addTrackedRenewal);
  el('showClosedToggle').addEventListener('change', renderTable);
  el('churnReasonCloseBtn').addEventListener('click', closeChurnReasonPanel);
  el('churnReasonConfirmBtn').addEventListener('click', () => {
    if (!currentChurnClientName) return;
    const reason = el('churnReasonSelect').value;
    const detail = el('churnReasonDetail').value.trim();
    markChurned(currentChurnClientName, reason, detail);
    closeChurnReasonPanel();
  });
}

/* ── Email to Client (real auto-send via Resend, PDF attached) ──
   Same pattern as Welcome Guide Gen / Intake Request Gen's "Email to
   Client" button: generate a PDF in-memory, POST it + the email fields
   to /api/send-email. Unlike those single-client tools, this one is a
   cross-client table, so there's no "active client" - each row's own
   Email button opens the one shared panel, scoped to that row's client
   via currentEmailContext below. */

function formatDateNice(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildRenewalNoticeHtml(clientName, rec, config) {
  const daysUntil = daysBetween(todayStr(), rec.renewalDate);
  const daysLabel = daysUntil >= 0 ? `${daysUntil} day${daysUntil === 1 ? '' : 's'}` : `${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} overdue`;
  const amName = config.accountManagerName || 'Your Revital Productions Account Manager';
  const amEmail = config.accountManagerEmail || '';

  return `
    <div class="pdf-page" id="renewal-pdf-page">
      <img src="../logo.png" class="pdf-logo" alt="Revital Hub">
      <div class="pdf-title">Renewal Notice</div>
      <div class="pdf-subtitle">${clientName} &mdash; Contract Renewal Summary</div>

      <div class="pdf-h2">Renewal Details</div>
      <div class="renewal-info-grid">
        <div class="renewal-info-item">
          <div class="label">Renewal Date</div>
          <div class="value">${formatDateNice(rec.renewalDate)}</div>
        </div>
        <div class="renewal-info-item">
          <div class="label">Days Until Renewal</div>
          <div class="value">${daysLabel}</div>
        </div>
        <div class="renewal-info-item">
          <div class="label">Contract Length</div>
          <div class="value">${rec.contractLengthMonths || 12} months</div>
        </div>
        <div class="renewal-info-item">
          <div class="label">Status</div>
          <div class="value">${rec.status || 'On Track'}</div>
        </div>
      </div>

      ${rec.notes ? `
      <div class="pdf-h2">Notes</div>
      <div class="renewal-notes-box">${escapeHtmlLocal(rec.notes)}</div>
      ` : ''}

      <div class="renewal-am-card">
        Questions about your renewal? Reach out to your account manager,<br>
        <strong>${escapeHtmlLocal(amName)}</strong>${amEmail ? ` &middot; ${escapeHtmlLocal(amEmail)}` : ''}
      </div>
    </div>
  `;
}

function escapeHtmlLocal(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

const emailToClientPanel = document.getElementById('emailToClientPanel');
const emailToClientTo = document.getElementById('emailToClientTo');
const emailToClientSubject = document.getElementById('emailToClientSubject');
const emailToClientBody = document.getElementById('emailToClientBody');
const emailToClientOpenBtn = document.getElementById('emailToClientOpenBtn');
const emailToClientCopyBtn = document.getElementById('emailToClientCopyBtn');
const emailToClientSendBtn = document.getElementById('emailToClientSendBtn');
const emailToClientStatus = document.getElementById('emailToClientStatus');
const emailToClientCloseBtn = document.getElementById('emailToClientCloseBtn');
const pdfContainer = document.getElementById('pdfContainer');

let currentEmailContext = null; // { clientName, rec, config, from }

function refreshEmailToClientMailto() {
  if (!emailToClientOpenBtn || !emailToClientTo) return;
  emailToClientOpenBtn.href = `mailto:${encodeURIComponent(emailToClientTo.value)}?subject=${encodeURIComponent(emailToClientSubject.value)}&body=${encodeURIComponent(emailToClientBody.value)}`;
}

if (emailToClientCloseBtn) {
  emailToClientCloseBtn.addEventListener('click', () => {
    if (emailToClientPanel) emailToClientPanel.style.display = 'none';
  });
}

[emailToClientTo, emailToClientSubject, emailToClientBody].forEach(elx => {
  if (elx) elx.addEventListener('input', refreshEmailToClientMailto);
});

if (emailToClientCopyBtn) {
  emailToClientCopyBtn.addEventListener('click', async () => {
    const text = `To: ${emailToClientTo.value}\nSubject: ${emailToClientSubject.value}\n\n${emailToClientBody.value}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        emailToClientBody.select();
        document.execCommand('copy');
      }
      const original = emailToClientCopyBtn.textContent;
      emailToClientCopyBtn.textContent = 'Copied!';
      setTimeout(() => { emailToClientCopyBtn.textContent = original; }, 2000);
    } catch (err) {
      console.error('Failed to copy renewal email', err);
      alert('Failed to copy. Please manually select and copy the text.');
    }
  });
}

async function openEmailToClientPanel(clientName) {
  const clients = getClients();
  const client = clients[clientName];
  const rec = client && client.renewal;
  if (!client || !rec) return;

  const config = client.portalConfig || {};
  if (!config.clientContactEmail) {
    alert(`${clientName} has no Contact Email set in Client Portal Manager yet - add one before emailing a renewal notice.`);
    return;
  }

  const amName = (config.accountManagerName || '').trim();
  const amEmail = (config.accountManagerEmail || '').trim();
  const contactName = config.clientContactName || clientName;

  let subject = `Let's Talk About What's Next for ${clientName}`;
  let body = `Hi ${contactName.split(' ')[0]},\n\nYour current contract is coming up for renewal on ${formatDateNice(rec.renewalDate)}, and I wanted to reach out well in advance so we have plenty of time to plan ahead.\n\nI'd love to schedule a renewal call to talk through your goals for the next 6-12 months and any adjustments that make sense.\n\nThanks,\n${amName || 'The Revital Productions team'}`;

  if (isEmbedded && window.parent.fetchEmailTemplateById && window.parent.fillTemplateVars && window.parent.templateHtmlToPlainText) {
    try {
      const tpl = await window.parent.fetchEmailTemplateById('tpl-contract-renewal-15');
      if (tpl) {
        const filled = window.parent.fillTemplateVars(tpl.content, {
          contactName: contactName,
          clientName: clientName,
          contractEndDate: formatDateNice(rec.renewalDate)
        });
        subject = window.parent.fillTemplateVars(tpl.subjectLine || subject, { clientName: clientName });
        body = window.parent.templateHtmlToPlainText(filled) + `\n\nThanks,\n${amName || 'The Revital Productions team'}`;
      }
    } catch (e) {
      console.warn('Could not load renewal email template, using fallback text:', e);
    }
  }

  emailToClientTo.value = config.clientContactEmail;
  emailToClientSubject.value = subject;
  emailToClientBody.value = body;
  refreshEmailToClientMailto();

  currentEmailContext = {
    clientName,
    rec,
    config,
    from: (amEmail && amName) ? `${amName} <${amEmail}>` : null
  };

  if (emailToClientSendBtn) {
    emailToClientSendBtn.style.display = currentEmailContext.from ? 'inline-block' : 'none';
    emailToClientSendBtn.disabled = false;
    emailToClientSendBtn.textContent = 'Send with PDF attached';
  }
  if (emailToClientStatus) {
    emailToClientStatus.textContent = currentEmailContext.from ? '' : `Add ${clientName}'s Account Manager Name + Email in Client Portal Manager to enable sending.`;
    emailToClientStatus.style.color = 'var(--text-muted)';
  }

  if (emailToClientPanel) {
    emailToClientPanel.style.display = 'block';
    emailToClientPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

if (emailToClientSendBtn) {
  emailToClientSendBtn.addEventListener('click', async () => {
    if (!currentEmailContext || !currentEmailContext.from) return;
    if (typeof html2pdf === 'undefined') {
      alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
      return;
    }

    emailToClientSendBtn.disabled = true;
    emailToClientSendBtn.textContent = 'Generating PDF...';
    if (emailToClientStatus) emailToClientStatus.textContent = '';

    const { clientName, rec, config } = currentEmailContext;
    pdfContainer.innerHTML = buildRenewalNoticeHtml(clientName, rec, config);

    const opt = {
      margin: 0,
      filename: `Renewal_Notice_${clientName.replace(/\s+/g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 0.92 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    const exportContainer = document.createElement('div');
    exportContainer.innerHTML = pdfContainer.innerHTML;

    try {
      const dataUri = await html2pdf().set(opt).from(exportContainer).outputPdf('datauristring');
      const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
      if (!base64) throw new Error('PDF generation produced no data');

      emailToClientSendBtn.textContent = 'Sending...';

      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailToClientTo.value,
          subject: emailToClientSubject.value,
          body: emailToClientBody.value,
          from: currentEmailContext.from,
          attachments: [{ filename: opt.filename, content: base64 }]
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }

      emailToClientSendBtn.textContent = 'Sent ✓';
      if (emailToClientStatus) {
        emailToClientStatus.textContent = 'Sent successfully with the Renewal Notice PDF attached.';
        emailToClientStatus.style.color = 'var(--color-success, #10b981)';
      }
      if (isEmbedded && window.parent.logAdminActivity) {
        window.parent.logAdminActivity('Renewal notice email sent', clientName);
      }
      if (isEmbedded && window.parent.showBanner) {
        window.parent.showBanner('success', `Renewal notice emailed to ${clientName}.`);
      }
    } catch (e) {
      console.error('Send renewal email failed:', e);
      emailToClientSendBtn.disabled = false;
      emailToClientSendBtn.textContent = 'Send with PDF attached';
      if (emailToClientStatus) {
        emailToClientStatus.textContent = "Couldn't send automatically (" + e.message + ") - use Copy or \"Open in Email App\" instead.";
        emailToClientStatus.style.color = 'var(--color-error, #f68d5f)';
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  populateClientSelect();
  renderTable();
  initListeners();

  // Same fix as Contract & Invoice Tracker: this iframe can finish
  // loading before the parent Hub's clientsDb has synced, leaving the
  // "select a client" dropdown permanently empty since it only ever
  // populates once. Poll briefly and re-populate once real data shows up.
  let pollAttempts = 0;
  const pollTimer = setInterval(() => {
    pollAttempts++;
    if (Object.keys(getClients()).length > 0) {
      populateClientSelect();
      renderTable();
      clearInterval(pollTimer);
    } else if (pollAttempts >= 30) {
      clearInterval(pollTimer);
    }
  }, 250);
});
