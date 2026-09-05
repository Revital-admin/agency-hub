document.addEventListener('DOMContentLoaded', () => {
  if (window.initDismissibleCards) initDismissibleCards();

  const formInputs = document.querySelectorAll('input, textarea');
  const pdfContainer = document.getElementById('pdfContainer');
  const generateBtn = document.getElementById('generatePdfBtn');

  function getAvatarInitials(name) {
    if (!name) return 'AM';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  // ── Hub integration ──
  // Auto-fill from the currently active client so nothing needs to be
  // retyped by hand. Falls back gracefully to manual entry if this file is
  // ever opened outside the Hub (no window.parent access). Unlike the
  // Welcome Guide, the intake link itself is NOT client-specific (it's the
  // same shared form for everyone), so only the client/AM fields auto-fill.
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
  }

  function renderPreview() {
    const clientName = document.getElementById('clientName').value || 'Acme Corp';
    const intakeLink = document.getElementById('intakeLink').value || 'https://forms.gle/...';
    const amName = document.getElementById('amName').value || 'Jane Doe';
    const amEmail = document.getElementById('amEmail').value || 'jane@revitalproductions.com';
    const welcomeNote = document.getElementById('welcomeNote').value || `We are thrilled to be partnering with ${clientName} - welcome aboard!`;

    const html = `
      <div class="pdf-page" id="page-1">
        <img src="../logo.png" class="pdf-logo" alt="Revital Hub">
        <div class="pdf-title">Welcome to Revital Productions, ${clientName}!</div>
        <div class="pdf-subtitle">Let's Get Your Onboarding Started</div>

        <div class="welcome-note">
          Hi there! ${welcomeNote}
        </div>

        <div class="pdf-h2">Your Dedicated Account Manager</div>
        <div class="am-card">
          <div class="am-avatar">${getAvatarInitials(amName)}</div>
          <div class="am-details">
            <strong>${amName}</strong>
            <span>${amEmail}</span>
          </div>
        </div>

        <div class="pdf-h2">What's Next</div>
        <div class="welcome-note" style="margin-bottom: 0.3in;">
          Before we can build out your full onboarding plan and services, we need a bit of information about your business and goals. Please take a few minutes to complete the intake form below - once we receive it, you'll get your full Welcome Guide and access to your secure Client Portal.
        </div>

        <a href="${intakeLink}" target="_blank" class="btn-pdf">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Complete Your Intake Form
        </a>
        <div class="page-number">Page 1</div>
      </div>
    `;
    pdfContainer.innerHTML = html;
  }

  formInputs.forEach(input => {
    input.addEventListener('input', renderPreview);
  });

  generateBtn.addEventListener('click', () => {
    const clientName = document.getElementById('clientName').value || 'Client';
    const opt = {
      margin:       0,
      filename:     `Intake_Request_${clientName.replace(/\s+/g, '_')}.pdf`,
      // JPEG (no alpha channel) instead of PNG, and scale 2 instead of 4 -
      // the old settings were rendering a near-transparent full-resolution
      // alpha mask alongside the color layer, then (due to no pagebreak
      // mode being set) silently doubling that onto a second, mostly-blank
      // page whenever the content was even a hair over 11in tall. Together
      // that produced 100MB+ PDFs with a phantom blank first page.
      image:        { type: 'jpeg', quality: 0.92 },
      // html2canvas defaults to using the page's current scroll offset
      // (window.pageYOffset) as the capture origin even for a detached,
      // never-visible element - forcing scrollX/scrollY to 0 makes it
      // render as if the page were unscrolled, which is what a detached
      // capture should always want. Omitting this was the actual cause
      // of the blank-space-then-offset-content pattern that persisted
      // through the container/overflow fixes.
      // Explicit width/height forces html2canvas to render exactly one
      // 8.5x11in page's worth of pixels (816x1056 CSS px at 96dpi)
      // instead of auto-measuring the container - auto-measurement was
      // apparently landing a hair over the one-page threshold even with
      // overflow:hidden and no box-shadow, rounding up to a spurious
      // blank 2nd page. This removes that ambiguity entirely.
      html2canvas:  { scale: 2, useCORS: true, letterRendering: true, scrollX: 0, scrollY: 0 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
      // pagebreak avoid-all forces page-break-inside:avoid onto every
      // single element in the container, which turned out to conflict
      // with jsPDF's page-slicing math and was actively pushing this to
      // 3 pages instead of fixing it (this was a 2-page bug before
      // avoid-all was added). Now that .pdf-page has overflow:hidden
      // guaranteeing it measures as exactly one true page, the default
      // slicing behavior (no explicit pagebreak option) should have
      // nothing left to slice.
    };

    generateBtn.innerHTML = 'Generating...';
    generateBtn.disabled = true;

    if (typeof html2pdf === 'undefined') {
      alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
      generateBtn.disabled = false;
      generateBtn.innerHTML = 'Download PDF';
      return;
    }

    // Capture from a detached copy of the preview content (never
    // attached to the page) instead of the live pdfContainer sitting
    // inside the sticky/scrollable preview panel. Appending it to
    // document.body (even off-screen) was tried and made things worse -
    // it produced a genuinely empty capture, so reverted to this simpler
    // in-memory-only approach, which does reliably capture real content.
    const exportContainer = document.createElement('div');
    exportContainer.innerHTML = pdfContainer.innerHTML;

    // NOTE: an earlier attempt intercepted the chain via
    // .toPdf().get('pdf').then(pdf => { ...trim pages...; pdf.save(...) })
    // to manually strip a leading blank page via jsPDF's own page API.
    // That produced a consistently EMPTY (3289-byte, zero-content) PDF -
    // .get('pdf') appears to resolve before the canvas image is actually
    // attached to the page, so calling pdf.save() on it directly skips
    // content that the built-in .save() step normally attaches. Reverted
    // to the plain, built-in .save() chain, which reliably captures full,
    // correct content (confirmed via multiple rendered test files).
    html2pdf().set(opt).from(exportContainer).save().then(() => {
      generateBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download PDF';
      generateBtn.disabled = false;
    }).catch((err) => {
      console.error('PDF generation failed:', err);
      alert('PDF generation failed - check the browser console for details.');
      generateBtn.innerHTML = 'Download PDF';
      generateBtn.disabled = false;
    });
  });

  // Wait a tiny bit for the parent to fully inject its globals if this
  // iframe just loaded fresh, then auto-fill and render.
  setTimeout(() => {
    autoFillFromActiveClient();
    renderPreview();
  }, 300);

  // Initial render (before the auto-fill above resolves, so the preview
  // isn't blank while waiting).
  renderPreview();

  // ── Email to Client (real auto-send via Resend, PDF attached) ──
  // Manual button, not fired automatically at client creation - same
  // reasoning as the Welcome Guide tool: the account manager fields and
  // the client's contact email don't exist yet at creation time, so this
  // has to be a deliberate step once whoever fills the form in (sales or
  // the account manager) is actually done.
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
        alert("This client has no Contact Email set in Client Portal Manager yet - add one before emailing the intake form.");
        return;
      }

      const amName = (document.getElementById('amName').value || '').trim();
      const amEmail = (document.getElementById('amEmail').value || '').trim();
      const clientName = (document.getElementById('clientName').value || '').trim() || client.name || 'there';
      const contactName = config.clientContactName || clientName;
      const intakeFormLinkVal = (document.getElementById('intakeLink').value || '').trim();

      let subject = 'Your Onboarding Form — Revital Productions';
      let body = `Hi ${contactName.split(' ')[0]},\n\nWelcome aboard! Please find your onboarding intake form attached - once we get it back we can build out your full plan.` +
        (intakeFormLinkVal ? `\n\nYou can fill it out directly here: ${intakeFormLinkVal}` : '') +
        `\n\nThanks,\n${amName || 'The Revital Productions team'}`;

      if (window.parent.fetchEmailTemplateById && window.parent.fillTemplateVars && window.parent.templateHtmlToPlainText) {
        try {
          const tpl = await window.parent.fetchEmailTemplateById('tpl-intake-send-17');
          if (tpl) {
            const filled = window.parent.fillTemplateVars(tpl.content, {
              contactName: contactName,
              clientName: clientName,
              accountManagerName: amName || 'the Revital Productions team',
              intakeFormLink: intakeFormLinkVal
            });
            subject = tpl.subjectLine || subject;
            body = window.parent.templateHtmlToPlainText(filled);
          }
        } catch (e) {
          console.warn('Could not load intake email template, using fallback text:', e);
        }
      }

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
        console.error('Failed to copy intake email', err);
        alert('Failed to copy. Please manually select and copy the text.');
      }
    });
  }

  if (emailToClientSendBtn) {
    emailToClientSendBtn.addEventListener('click', async () => {
      if (!currentEmailToClientFrom) return;
      if (typeof html2pdf === 'undefined') {
        alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
        return;
      }

      // Fetched once here so it's available for the emailSends metadata
      // in the /api/send-email call further down.
      const activeClient = getParentActiveClient();

      emailToClientSendBtn.disabled = true;
      emailToClientSendBtn.textContent = 'Generating PDF...';
      if (emailToClientStatus) emailToClientStatus.textContent = '';

      const clientNameForFile = ((document.getElementById('clientName').value || 'Client')).replace(/\s+/g, '_');
      const opt = {
        margin: 0,
        filename: `Intake_Request_${clientNameForFile}.pdf`,
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
            from: currentEmailToClientFrom,
            attachments: [{ filename: opt.filename, content: base64 }],
            // Metadata only - lets the Hub's emailSends record (and later
            // a delivery-status webhook) show which client/tool this send
            // belonged to. See _worker.js's handleSendEmail.
            clientId: activeClient ? (activeClient.id || null) : null,
            clientName: activeClient ? (activeClient.name || null) : null,
            tool: 'Intake Request Gen'
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
          window.parent.logAdminActivity('Intake form email sent', client.name || client.id);
        }
      } catch (e) {
        console.error('Send intake email failed:', e);
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
