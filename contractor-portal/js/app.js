// Contractor Portal - standalone page, no Firebase SDK, no Cloudflare Access.
// Every read/write goes through /api/contractor-portal/* Worker routes, which
// validate the ?t= token server-side against contractorPortal/{token} on
// every single request. This file never touches Firestore directly.

(function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('t') || '';

  const el = (id) => document.getElementById(id);

  const loadingEl = el('cpLoading');
  const invalidEl = el('cpInvalid');
  const contentEl = el('cpContent');

  let portalData = null;

  function fmtDate(d) {
    if (!d) return '';
    const parts = String(d).split('-');
    if (parts.length !== 3) return d;
    const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function showStatus(elId, message, ok) {
    const s = el(elId);
    s.textContent = message;
    s.className = 'cp-form-status ' + (ok ? 'cp-status-ok' : 'cp-status-err');
    if (message) {
      setTimeout(() => { s.textContent = ''; s.className = 'cp-form-status'; }, 4000);
    }
  }

  async function apiGet() {
    const res = await fetch(`/api/contractor-portal/data?t=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('bad response');
    return res.json();
  }

  async function apiPost(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ t: token }, body))
    });
    return res.json();
  }

  function renderInfo(data) {
    el('cpName').textContent = data.memberName || '—';
    el('cpRole').textContent = data.role || '—';
    el('cpStartDate').textContent = data.startDate ? fmtDate(data.startDate) : '—';
    el('cpAgreementStatus').textContent = data.agreementStatus || 'Not Sent';
  }

  function renderTimeOff(data) {
    const list = el('cpTimeOffList');
    const empty = el('cpTimeOffEmpty');
    const combined = [
      ...(data.pendingTimeOff || []).map(r => Object.assign({}, r, { status: r.status || 'pending' })),
      ...(data.timeOff || []).map(r => Object.assign({}, r, { status: r.status || 'approved' }))
    ];
    combined.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));

    if (!combined.length) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    list.innerHTML = combined.map(r => {
      const badgeClass = r.status === 'declined' ? 'cp-badge-declined'
        : r.status === 'pending' ? 'cp-badge-pending' : 'cp-badge-approved';
      const dateRange = r.endDate && r.endDate !== r.startDate
        ? `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`
        : fmtDate(r.startDate);
      const cancelBtn = r.status === 'pending'
        ? `<button class="cp-btn-small" data-cancel-id="${r.id}">Cancel</button>`
        : '';
      return `<div class="cp-list-item">
        <div>
          <div class="cp-list-item-main">${dateRange}</div>
          ${r.note ? `<div class="cp-list-item-sub">${escapeHtml(r.note)}</div>` : ''}
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="cp-badge ${badgeClass}">${r.status}</span>
          ${cancelBtn}
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('[data-cancel-id]').forEach(btn => {
      btn.addEventListener('click', () => cancelTimeOff(btn.getAttribute('data-cancel-id')));
    });
  }

  function renderClientWork(data) {
    const wrap = el('cpClientWorkWrap');
    const clients = data.clientWork || [];
    if (!clients.length) {
      wrap.innerHTML = '';
      return;
    }

    wrap.innerHTML = clients.map(c => {
      const kit = c.brandKit || {};
      const brief = c.creativeBrief || {};

      const swatches = ['primaryColor', 'secondaryColor', 'accentColor']
        .filter(k => kit[k])
        .map(k => `<div class="cp-swatch">
          <div class="cp-swatch-color" style="background:${escapeHtml(kit[k])};"></div>
          <div class="cp-swatch-hex">${escapeHtml(kit[k])}</div>
        </div>`).join('');

      const hasBrandBasics = swatches || kit.fontPrimary || kit.fontSecondary || kit.toneOfVoice || kit.logoUrl;
      const brandBasicsHtml = hasBrandBasics ? `
        <div class="cp-card-subtitle">Brand Basics</div>
        ${swatches ? `<div class="cp-swatch-row">${swatches}</div>` : ''}
        ${kit.fontPrimary ? `<div class="cp-brief-field"><span class="cp-brief-label">Primary Font</span><span class="cp-brief-value">${escapeHtml(kit.fontPrimary)}</span></div>` : ''}
        ${kit.fontSecondary ? `<div class="cp-brief-field"><span class="cp-brief-label">Secondary Font</span><span class="cp-brief-value">${escapeHtml(kit.fontSecondary)}</span></div>` : ''}
        ${kit.toneOfVoice ? `<div class="cp-brief-field"><span class="cp-brief-label">Tone of Voice</span><span class="cp-brief-value">${escapeHtml(kit.toneOfVoice)}</span></div>` : ''}
        ${kit.logoUrl ? `<div class="cp-brief-field"><a href="${escapeHtml(kit.logoUrl)}" target="_blank" rel="noopener" class="cp-brief-value" style="color:var(--color-accent, #f68d5f);">Logo / Brand Assets Folder →</a></div>` : ''}
      ` : '';

      const briefRows = [
        ['objective', 'Objective'],
        ['targetAudience', 'Target Audience'],
        ['keyMessage', 'Key Message'],
        ['toneOfVoice', 'Tone'],
        ['deliverables', 'Deliverables'],
        ['references', 'References']
      ].filter(([key]) => brief[key]);

      const briefHtml = briefRows.length ? `
        <div class="cp-card-subtitle">Creative Brief</div>
        ${brief.campaignName ? `<div class="cp-brief-field"><span class="cp-brief-label">Campaign</span><span class="cp-brief-value">${escapeHtml(brief.campaignName)}</span></div>` : ''}
        ${briefRows.map(([key, label]) => `<div class="cp-brief-field"><span class="cp-brief-label">${label}</span><span class="cp-brief-value">${escapeHtml(brief[key])}</span></div>`).join('')}
      ` : '';

      const emptyNote = (!hasBrandBasics && !briefRows.length)
        ? `<p class="cp-empty-state">Nothing's been added for this client yet.</p>` : '';

      return `<div class="cp-card">
        <div class="cp-client-name">${escapeHtml(c.name)}</div>
        ${brandBasicsHtml}
        ${briefHtml}
        ${emptyNote}
      </div>`;
    }).join('');

    wrap.innerHTML = `<div class="cp-brand" style="justify-content:center; margin:0 0 12px;"><span class="cp-dot"></span><span>Your Client Work</span></div>` + wrap.innerHTML;
  }

  function renderHours(data) {
    const list = el('cpHoursList');
    const empty = el('cpHoursEmpty');
    const entries = (data.hours || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 20);

    if (!entries.length) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    list.innerHTML = entries.map(h => `<div class="cp-list-item">
      <div>
        <div class="cp-list-item-main">${fmtDate(h.date)} — ${escapeHtml(h.clientName || 'No client')}</div>
        ${h.notes ? `<div class="cp-list-item-sub">${escapeHtml(h.notes)}</div>` : ''}
      </div>
      <div style="text-align:right;">
        <div class="cp-list-item-main">${h.hours}h</div>
        <div class="cp-list-item-sub">${h.billable ? 'Billable' : 'Non-billable'}</div>
      </div>
    </div>`).join('');
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function renderAll(data) {
    portalData = data;
    renderInfo(data);
    renderClientWork(data);
    renderTimeOff(data);
    renderHours(data);
  }

  async function refresh() {
    const data = await apiGet();
    if (!data || data.ok === false) {
      showInvalid();
      return;
    }
    renderAll(data);
  }

  function showInvalid() {
    loadingEl.style.display = 'none';
    contentEl.style.display = 'none';
    invalidEl.style.display = 'block';
  }

  async function submitTimeOff() {
    const startDate = el('cpTimeOffStart').value;
    const endDate = el('cpTimeOffEnd').value;
    const note = el('cpTimeOffNote').value.trim();
    if (!startDate) {
      showStatus('cpTimeOffStatus', 'Pick a start date.', false);
      return;
    }
    if (endDate && endDate < startDate) {
      showStatus('cpTimeOffStatus', 'End date cannot be before the start date.', false);
      return;
    }
    const btn = el('cpTimeOffSubmitBtn');
    btn.disabled = true;
    try {
      const result = await apiPost('/api/contractor-portal/time-off', {
        action: 'request', startDate, endDate: endDate || startDate, note
      });
      if (result && result.ok) {
        showStatus('cpTimeOffStatus', 'Request submitted.', true);
        el('cpTimeOffStart').value = '';
        el('cpTimeOffEnd').value = '';
        el('cpTimeOffNote').value = '';
        await refresh();
      } else {
        showStatus('cpTimeOffStatus', 'Something went wrong. Try again.', false);
      }
    } catch (e) {
      showStatus('cpTimeOffStatus', 'Something went wrong. Try again.', false);
    } finally {
      btn.disabled = false;
    }
  }

  async function cancelTimeOff(reqId) {
    try {
      const result = await apiPost('/api/contractor-portal/time-off', { action: 'cancel', reqId });
      if (result && result.ok) {
        await refresh();
      }
    } catch (e) {
      // silent - list just won't update
    }
  }

  async function submitHours() {
    const date = el('cpHoursDate').value;
    const hours = parseFloat(el('cpHoursAmount').value);
    const clientName = el('cpHoursClient').value.trim();
    const billable = el('cpHoursBillable').checked;
    const notes = el('cpHoursNotes').value.trim();

    if (!date || !hours || hours <= 0) {
      showStatus('cpHoursStatus', 'Add a date and hours.', false);
      return;
    }
    if (hours > 24) {
      showStatus('cpHoursStatus', 'Hours for a single day can\'t exceed 24.', false);
      return;
    }
    const btn = el('cpHoursSubmitBtn');
    btn.disabled = true;
    try {
      const result = await apiPost('/api/contractor-portal/hours', { date, hours, clientName, billable, notes });
      if (result && result.ok) {
        showStatus('cpHoursStatus', 'Logged.', true);
        el('cpHoursDate').value = '';
        el('cpHoursAmount').value = '';
        el('cpHoursClient').value = '';
        el('cpHoursNotes').value = '';
        el('cpHoursBillable').checked = true;
        await refresh();
      } else {
        showStatus('cpHoursStatus', 'Something went wrong. Try again.', false);
      }
    } catch (e) {
      showStatus('cpHoursStatus', 'Something went wrong. Try again.', false);
    } finally {
      btn.disabled = false;
    }
  }

  async function init() {
    if (!token || token.length < 16) {
      showInvalid();
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    el('cpHoursDate').value = todayStr;

    try {
      const data = await apiGet();
      if (!data || data.ok === false) {
        showInvalid();
        return;
      }
      renderAll(data);
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
    } catch (e) {
      showInvalid();
      return;
    }

    el('cpTimeOffSubmitBtn').addEventListener('click', submitTimeOff);
    el('cpHoursSubmitBtn').addEventListener('click', submitHours);

    // Keep the End Date picker from even offering dates before Start
    // Date, as a first line of defense on top of the submitTimeOff()
    // check above (which still applies if End is edited before Start).
    el('cpTimeOffStart').addEventListener('change', () => {
      el('cpTimeOffEnd').min = el('cpTimeOffStart').value || '';
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
