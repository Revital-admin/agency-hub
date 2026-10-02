document.addEventListener('DOMContentLoaded', () => {
  const formInputs = document.querySelectorAll('input, textarea');
  const pdfContainer = document.getElementById('pdfContainer');
  const generateBtn = document.getElementById('generatePdfBtn');

  // ── Hub integration ──
  // Same pattern as Client Welcome Guide: auto-fill from the active
  // client, fall back gracefully to manual entry if opened outside the
  // Hub (no window.parent access).
  function getParentActiveClient() {
    try {
      if (window.parent && typeof window.parent.getActiveClient === 'function') {
        return window.parent.getActiveClient();
      }
    } catch (e) {
      // Cross-origin or otherwise inaccessible - fall back to manual entry.
    }
    return null;
  }

  function autoFillFromActiveClient() {
    const client = getParentActiveClient();
    if (!client) return;

    const clientNameInput = document.getElementById('clientName');
    const amNameInput = document.getElementById('amName');
    const amEmailInput = document.getElementById('amEmail');

    if (clientNameInput && !clientNameInput.value) {
      clientNameInput.value = client.name || '';
    }
    const config = client.portalConfig || {};
    if (amNameInput && !amNameInput.value) {
      amNameInput.value = config.accountManagerName || '';
    }
    if (amEmailInput && !amEmailInput.value) {
      amEmailInput.value = config.accountManagerEmail || '';
    }

    loadSavedPlanState(client);
  }

  // Persisted to client.ninetyDayPlan the same way Welcome Guide persists
  // to client.welcomeGuide - otherwise leaving the tab loses anything typed.
  function loadSavedPlanState(client) {
    const state = client && client.ninetyDayPlan;
    if (!state) return;
    const fieldIds = ['planIntro', 'month1', 'month2', 'month3', 'channelRecommendations', 'budgetAllocation', 'success3mo', 'success6mo', 'success12mo'];
    fieldIds.forEach(id => {
      const input = document.getElementById(id);
      if (input && !input.value && state[id]) {
        input.value = state[id];
      }
    });
  }

  function collectPlanData() {
    const fieldIds = ['planIntro', 'month1', 'month2', 'month3', 'channelRecommendations', 'budgetAllocation', 'success3mo', 'success6mo', 'success12mo'];
    const data = {};
    fieldIds.forEach(id => {
      const input = document.getElementById(id);
      data[id] = input ? input.value : '';
    });
    return data;
  }

  // persist (default true): whether to also write the plan fields back to
  // the parent Hub's clientsDb. Same reasoning as Welcome Guide's
  // renderPreview(persist) - the init calls below run before/independent
  // of any real user edit, so they pass false to avoid an unconditional
  // save loop on every reload.
  function renderPreview(persist = true) {
    const clientName = document.getElementById('clientName').value || 'Acme Corp';
    const planData = collectPlanData();

    if (window.parent && typeof window.parent.build90DayPlanHtml === 'function') {
      pdfContainer.innerHTML = window.parent.build90DayPlanHtml(clientName, planData);
    } else {
      // Only hit if this tool is somehow opened outside the Hub shell
      // (build90DayPlanHtml lives in the parent's app.js) - shouldn't
      // happen in normal use, but fail visibly instead of a blank preview.
      pdfContainer.innerHTML = '<div style="padding: 40px; color: var(--color-text-muted);">Preview requires the Agency Hub shell (build90DayPlanHtml not found on window.parent).</div>';
    }

    if (persist) {
      const client = getParentActiveClient();
      if (client && window.parent.saveDatabase) {
        client.ninetyDayPlan = planData;
        window.parent.saveDatabase();
      }
    }
  }

  formInputs.forEach(input => {
    input.addEventListener('input', () => renderPreview());
  });

  // Oct 2026 rebuild: switched from html2canvas/html2pdf screenshotting the
  // on-screen preview (built by window.parent.build90DayPlanHtml, which
  // still drives the live HTML preview above) to the shared RevitalPDF
  // module, building the PDF directly from planData instead of
  // reparsing/screenshotting HTML. Factored into a function so both the
  // Download PDF button and the Email to Client send button (below) can
  // build the same document - the latter needs the raw bytes/data-uri to
  // attach rather than triggering a browser download.
  function buildNinetyDayPlanPdf(clientName, planData) {
    const p = planData || {};
    const name = clientName || 'Client';
    const r = RevitalPDF.create({ reportTitle: '90-DAY MARKETING ROADMAP', companyName: name });
    const C = r.colors;

    r.coverPage({
      title: '90-Day Marketing Roadmap',
      subLine: `${name} — Your First Quarter Plan`,
      objective: p.planIntro || undefined,
    });

    r.newPage();
    r.sectionHeader('The Roadmap');
    r.calloutBox('Month 1', p.month1 || 'Priorities to be defined.');
    r.calloutBox('Month 2', p.month2 || 'Priorities to be defined.');
    r.calloutBox('Month 3', p.month3 || 'Priorities to be defined.');

    r.sectionHeader('Channels & Budget');
    r.paragraph('Recommended Channels', { bold: true, size: 10.5, spaceAfter: 6 });
    r.paragraph(p.channelRecommendations || 'To be defined.', { spaceAfter: 14 });
    r.paragraph('Budget Allocation', { bold: true, size: 10.5, spaceAfter: 6 });
    r.paragraph(p.budgetAllocation || 'To be defined.', { spaceAfter: 14 });

    r.sectionHeader('Success Criteria');
    r.tableBlock(['Timeframe', 'What success looks like'], [
      ['At 3 Months', p.success3mo || 'To be defined.'],
      ['At 6 Months', p.success6mo || 'To be defined.'],
      ['At 12 Months', p.success12mo || 'To be defined.'],
    ], [r.CONTENT_W * 0.25, r.CONTENT_W * 0.75]);

    return r;
  }

  generateBtn.addEventListener('click', () => {
    const clientName = document.getElementById('clientName').value || 'Client';
    if (typeof window.RevitalPDF === 'undefined') {
      alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
      return;
    }

    generateBtn.innerHTML = 'Generating...';
    generateBtn.disabled = true;

    try {
      const r = buildNinetyDayPlanPdf(clientName, collectPlanData());
      r.save(`90_Day_Plan_${clientName.replace(/\s+/g, '_')}.pdf`);
      generateBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download PDF';
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF generation failed: ' + (err && err.message ? err.message : err));
      generateBtn.innerHTML = 'Download PDF';
    }
    generateBtn.disabled = false;
  });

  // Wait for the parent to fully inject its globals if this iframe just
  // loaded fresh (same pattern used elsewhere in the Hub), then auto-fill
  // and render.
  setTimeout(() => {
    autoFillFromActiveClient();
    renderPreview(false);
  }, 300);

  // Initial render (before the auto-fill above resolves, so the preview
  // isn't blank while waiting).
  renderPreview(false);

  // ── Email to Client (real auto-send via Resend, PDF attached) ──
  // Standalone send for this tool's own PDF only - useful for a later
  // stand-alone resend/refresh of the roadmap. The combined send
  // (Welcome Guide + 90-Day Plan in one email) lives in Welcome Guide's
  // own "Email to Client" panel via the "Also attach 90-Day Plan" option.
  const emailToClientBtn = document.getElementById('emailToClientBtn');
  const emailToClientPanel = document.getElementById('emailToClientPanel');
  const emailToClientTo = document.getElementById('emailToClientTo');
  const emailToClientSubject = document.getElementById('emailToClientSubject');
  const emailToClientBody = document.getElementById('emailToClientBody');
  const emailToClientOpenBtn = document.getElementById('emailToClientOpenBtn');
  const emailToClientCopyBtn = document.getElementById('emailToClientCopyBtn');
  const emailToClientSendBtn = document.getElementById('emailToClientSendBtn');
  const emailToClientStatus = document.getElementById('emailToClientStatus');
  const emailToClientCloseBtn = document.getElementById('emailToClientCloseBtn');

  if (emailToClientCloseBtn) {
    emailToClientCloseBtn.addEventListener('click', () => {
      if (emailToClientPanel) emailToClientPanel.style.display = 'none';
    });
  }

  let currentEmailToClientFrom = null;

  function refreshEmailToClientMailto() {
    if (!emailToClientOpenBtn || !emailToClientTo) return;
    emailToClientOpenBtn.href = `mailto:${encodeURIComponent(emailToClientTo.value)}?subject=${encodeURIComponent(emailToClientSubject.value)}&body=${encodeURIComponent(emailToClientBody.value)}`;
  }

  if (emailToClientBtn) {
    emailToClientBtn.addEventListener('click', async () => {
      const client = getParentActiveClient();
      if (!client) {
        alert('No active client selected - open this tool from within a client workspace.');
        return;
      }
      const config = client.portalConfig || {};
      if (!config.clientContactEmail) {
        alert("This client has no Contact Email set in Client Portal Manager yet - add one before emailing the 90-Day Plan.");
        return;
      }

      const amName = (document.getElementById('amName').value || '').trim();
      const amEmail = (document.getElementById('amEmail').value || '').trim();
      const clientName = (document.getElementById('clientName').value || '').trim() || client.name || 'there';
      const contactName = config.clientContactName || clientName;

      const subject = `Your 90-Day Marketing Roadmap`;
      const body = `Hi ${contactName.split(' ')[0]},\n\nAttached is your 90-Day Marketing Roadmap - month-by-month priorities, channel recommendations, and what success looks like at 3, 6, and 12 months.\n\nThanks,\n${amName || 'The Revital Productions team'}`;

      emailToClientTo.value = config.clientContactEmail;
      emailToClientSubject.value = subject;
      emailToClientBody.value = body;
      refreshEmailToClientMailto();

      currentEmailToClientFrom = (amEmail && amName) ? `${amName} <${amEmail}>` : null;
      if (emailToClientSendBtn) {
        emailToClientSendBtn.style.display = currentEmailToClientFrom ? 'inline-block' : 'none';
        emailToClientSendBtn.disabled = false;
        emailToClientSendBtn.textContent = 'Send with PDF attached';
      }
      if (emailToClientStatus) {
        emailToClientStatus.textContent = currentEmailToClientFrom ? '' : "Add this client's Account Manager Name + Email above to enable sending.";
        emailToClientStatus.style.color = 'var(--text-muted)';
      }

      if (emailToClientPanel) {
        emailToClientPanel.style.display = 'block';
        emailToClientPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  [emailToClientTo, emailToClientSubject, emailToClientBody].forEach(el => {
    if (el) el.addEventListener('input', refreshEmailToClientMailto);
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
        console.error('Failed to copy 90-day plan email', err);
        alert('Failed to copy. Please manually select and copy the text.');
      }
    });
  }

  if (emailToClientSendBtn) {
    emailToClientSendBtn.addEventListener('click', async () => {
      if (!currentEmailToClientFrom) return;
      if (typeof window.RevitalPDF === 'undefined') {
        alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
        return;
      }

      emailToClientSendBtn.disabled = true;
      emailToClientSendBtn.textContent = 'Generating PDF...';
      if (emailToClientStatus) emailToClientStatus.textContent = '';

      const clientNameRaw = (document.getElementById('clientName').value || 'Client');
      const clientNameForFile = clientNameRaw.replace(/\s+/g, '_');
      const filename = `90_Day_Plan_${clientNameForFile}.pdf`;

      try {
        const r = buildNinetyDayPlanPdf(clientNameRaw, collectPlanData());
        const dataUri = r.doc.output('datauristring');
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
            from: currentEmailToClientFrom,
            attachments: [{ filename: filename, content: base64 }]
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || `Send failed (${res.status})`);
        }

        emailToClientSendBtn.textContent = 'Sent ✓';
        if (emailToClientStatus) {
          emailToClientStatus.textContent = 'Sent successfully with the PDF attached.';
          emailToClientStatus.style.color = 'var(--color-success, #10b981)';
        }
        const client = getParentActiveClient();
        if (client && window.parent.logAdminActivity) {
          window.parent.logAdminActivity('90-Day Plan email sent', client.name || client.id);
        }
      } catch (e) {
        console.error('Send 90-day plan email failed:', e);
        emailToClientSendBtn.disabled = false;
        emailToClientSendBtn.textContent = 'Send with PDF attached';
        if (emailToClientStatus) {
          emailToClientStatus.textContent = "Couldn't send automatically (" + e.message + ") - use Copy or \"Open in Email App\" instead.";
          emailToClientStatus.style.color = 'var(--color-error, #f68d5f)';
        }
      }
    });
  }
});
