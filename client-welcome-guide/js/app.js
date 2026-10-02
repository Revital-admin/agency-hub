document.addEventListener('DOMContentLoaded', () => {
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
  // ever opened outside the Hub (no window.parent access).
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

  function buildPortalLink(client) {
    if (!client || !client.portalConfig || !client.portalConfig.magicToken) return '';
    const baseUrl = window.location.origin + '/portal/index.html';
    const clientNameRaw = client.id || client.name || 'Client';
    return `${baseUrl}?c=${encodeURIComponent(clientNameRaw)}&t=${client.portalConfig.magicToken}`;
  }

  function autoFillFromActiveClient() {
    const client = getParentActiveClient();
    if (!client) return;

    const clientNameInput = document.getElementById('clientName');
    const amNameInput = document.getElementById('amName');
    const amEmailInput = document.getElementById('amEmail');
    const portalLinkInput = document.getElementById('portalLink');

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
    if (portalLinkInput) {
      portalLinkInput.value = buildPortalLink(client);
    }

    loadSavedGuideState(client);
  }

  // Unlike Ad Campaign Brief and similar generators, this tool's welcome
  // note / selected services / Loom link were never saved back to the
  // client record - only the auto-filled AM/portal fields survived a
  // reload, so leaving the tab lost anything typed. Persist to
  // client.welcomeGuide the same way Ad Campaign Brief persists to
  // client.adCampaignBrief.
  function loadSavedGuideState(client) {
    const state = client && client.welcomeGuide;
    if (!state) return;
    const welcomeNoteInput = document.getElementById('welcomeNote');
    const loomLinkInput = document.getElementById('loomLink');
    if (welcomeNoteInput && !welcomeNoteInput.value && state.welcomeNote) {
      welcomeNoteInput.value = state.welcomeNote;
    }
    if (loomLinkInput && !loomLinkInput.value && state.loomLink) {
      loomLinkInput.value = state.loomLink;
    }
    if (Array.isArray(state.selectedServices)) {
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = state.selectedServices.includes(cb.value);
      });
    }
  }

  // persist (default true): whether to also write the welcome
  // note/selected services/Loom link back to the parent Hub's clientsDb.
  // Same reasoning as Ad Campaign Brief's generateMarkdown(persist) - the
  // init calls below run before/independent of any real user edit, so
  // they pass false to avoid an unconditional save loop on every reload.
  function renderPreview(persist = true) {
    const clientName = document.getElementById('clientName').value || 'Acme Corp';
    const portalLink = document.getElementById('portalLink').value || 'https://hub.revitalproductions.com/portal/...';
    const amName = document.getElementById('amName').value || 'Jane Doe';
    const amEmail = document.getElementById('amEmail').value || 'jane@revitalproductions.com';
    const welcomeNote = document.getElementById('welcomeNote').value || `We are thrilled to partner with ${clientName} and can't wait to get started!`;
    const loomLink = document.getElementById('loomLink').value.trim();

    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
    let servicesHtml = '';
    if (checkboxes.length === 0) {
      servicesHtml = `
        <div class="service-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          Custom Strategy & Execution
        </div>`;
    } else {
      checkboxes.forEach(cb => {
        servicesHtml += `
          <div class="service-item">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            ${cb.value}
          </div>`;
      });
    }

    const html = `
      <!-- Page 1: Welcome & Setup -->
      <div class="pdf-page" id="page-1">
        <img src="../logo.png" class="pdf-logo" alt="Revital Hub">
        <div class="pdf-title">Welcome to Revital Hub, ${clientName}!</div>
        <div class="pdf-subtitle">Your Official Onboarding Guide</div>

        <div class="welcome-note">
          Hi there! ${welcomeNote}
        </div>

        ${loomLink ? `
        <div class="video-card">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f68d5f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
            Start Here &mdash; Watch Your Portal Walkthrough
          </h3>
          <p>Before your kick-off call, take a few minutes to watch this short video. It walks you through exactly how to use your portal and what to expect from us.</p>
          <a href="${loomLink}" target="_blank" class="btn-pdf-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
            Watch the Walkthrough Video
          </a>
        </div>
        ` : ''}

        <div class="pdf-h2">Your Dedicated Account Manager</div>
        <div class="am-card">
          <div class="am-avatar">${getAvatarInitials(amName)}</div>
          <div class="am-details">
            <strong>${amName}</strong>
            <span>${amEmail}</span>
          </div>
        </div>

        <div class="pdf-h2">What We're Building For You</div>
        <div class="services-grid">
          ${servicesHtml}
        </div>

        <a href="${portalLink}" target="_blank" class="btn-pdf">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
          Access Your Client Portal
        </a>
        <div class="page-number">Page 1</div>
      </div>

      <!-- Page 2: Roadmap -->
      <div class="pdf-page" id="page-2">
        <img src="../logo.png" class="pdf-logo" alt="Revital Hub">
        <div class="pdf-h2" style="margin-top: 0;">The First 30 Days</div>
        
        <div class="roadmap-timeline">
          <div class="timeline-item">
            <strong>Week 1: Kickoff & Intake</strong>
            <p>You fill out our intake form, we grant access to our secure client portal, and we hold our official Kickoff Call to align on goals.</p>
          </div>
          <div class="timeline-item">
            <strong>Week 2: Strategy & Audits</strong>
            <p>Our team runs comprehensive audits on your existing assets and builds your bespoke Content Strategy Builder.</p>
          </div>
          <div class="timeline-item">
            <strong>Week 3: Production & Approvals</strong>
            <p>We begin executing the strategy. You will receive the first batch of deliverables in your portal for review and approval.</p>
          </div>
          <div class="timeline-item">
            <strong>Week 4: Campaign Launch</strong>
            <p>Assets go live. We monitor performance closely and schedule our first Monthly Strategy check-in call.</p>
          </div>
        </div>

        <div class="pdf-h2">Agency Policies & Boundaries</div>
        <div class="policy-grid">
          <div class="policy-card">
            <h3>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f68d5f" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              Communication
            </h3>
            <p>All revision requests and feedback must be submitted through your secure Client Portal. This ensures nothing gets lost in email threads or text messages.</p>
          </div>
          <div class="policy-card">
            <h3>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f68d5f" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
              Approvals
            </h3>
            <p>We require explicit written approval via the portal before any content is published or launched. Verbal approvals are not accepted.</p>
          </div>
          <div class="policy-card">
            <h3>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f68d5f" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              Response Times
            </h3>
            <p>Our team works Monday through Friday. You can expect a response to all portal inquiries within 24 business hours.</p>
          </div>
        </div>
        <div class="page-number">Page 2</div>
      </div>
    `;
    pdfContainer.innerHTML = html;

    if (persist) {
      const client = getParentActiveClient();
      if (client && window.parent.saveDatabase) {
        client.welcomeGuide = {
          welcomeNote: document.getElementById('welcomeNote').value,
          loomLink,
          selectedServices: Array.from(checkboxes).map(cb => cb.value)
        };
        window.parent.saveDatabase();
      }
    }
  }

  formInputs.forEach(input => {
    input.addEventListener('input', () => renderPreview());
    if(input.type === 'checkbox') {
      input.addEventListener('change', () => renderPreview());
    }
  });

  // Oct 2026 rebuild: switched from html2canvas/html2pdf screenshotting
  // the HTML preview (still built above for on-screen display) to the
  // shared RevitalPDF module, building the PDF directly from the form
  // fields instead. Factored into a function so the Download PDF button
  // and the Email to Client send flow below (which needs a data-uri, not
  // a browser download) share one implementation.
  function buildWelcomeGuidePdf(clientName) {
    const portalLink = document.getElementById('portalLink').value || 'https://hub.revitalproductions.com/portal/...';
    const amName = document.getElementById('amName').value || 'Jane Doe';
    const amEmail = document.getElementById('amEmail').value || 'jane@revitalproductions.com';
    const welcomeNote = document.getElementById('welcomeNote').value || `We are thrilled to partner with ${clientName} and can't wait to get started!`;
    const loomLink = document.getElementById('loomLink').value.trim();
    const services = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

    const r = RevitalPDF.create({ reportTitle: 'CLIENT WELCOME GUIDE', companyName: clientName });
    const C = r.colors;

    r.coverPage({
      title: `Welcome to Revital Hub, ${clientName}!`,
      subLine: 'Your Official Onboarding Guide',
      objective: `Hi there! ${welcomeNote}`,
    });

    if (loomLink) {
      r.calloutBox('Start Here - Watch Your Portal Walkthrough', 'Before your kick-off call, take a few minutes to watch this short video: ' + loomLink, C.BLUE);
    }

    r.sectionHeader('Your Dedicated Account Manager');
    r.paragraph(amName, { bold: true, size: 11, spaceAfter: 2 });
    r.paragraph(amEmail, { size: 9.5, color: C.GRAY, spaceAfter: 16 });

    r.paragraph("What We're Building For You", { bold: true, size: 10.5, spaceAfter: 6 });
    if (services.length) {
      r.bulletList(services);
    } else {
      r.bulletList(['Custom Strategy & Execution']);
    }

    r.paragraph('Access your client portal: ' + portalLink, { size: 9.5, color: C.BLUE, spaceAfter: 10 });

    r.newPage();
    r.sectionHeader('The First 30 Days');
    r.calloutBox('Week 1: Kickoff & Intake', 'You fill out our intake form, we grant access to our secure client portal, and we hold our official Kickoff Call to align on goals.');
    r.calloutBox('Week 2: Strategy & Audits', 'Our team runs comprehensive audits on your existing assets and builds your bespoke Content Strategy Builder.');
    r.calloutBox('Week 3: Production & Approvals', 'We begin executing the strategy. You will receive the first batch of deliverables in your portal for review and approval.');
    r.calloutBox('Week 4: Campaign Launch', 'Assets go live. We monitor performance closely and schedule our first Monthly Strategy check-in call.');

    r.sectionHeader('Agency Policies & Boundaries');
    r.paragraph('Communication', { bold: true, size: 10, spaceAfter: 4 });
    r.paragraph('All revision requests and feedback must be submitted through your secure Client Portal. This ensures nothing gets lost in email threads or text messages.', { spaceAfter: 12 });
    r.paragraph('Approvals', { bold: true, size: 10, spaceAfter: 4 });
    r.paragraph('We require explicit written approval via the portal before any content is published or launched. Verbal approvals are not accepted.', { spaceAfter: 12 });
    r.paragraph('Response Times', { bold: true, size: 10, spaceAfter: 4 });
    r.paragraph('Our team works Monday through Friday. You can expect a response to all portal inquiries within 24 business hours.', { spaceAfter: 12 });

    return r;
  }

  // Shared with the "Also attach 90-Day Plan" option below - mirrors
  // ninety-day-plan/js/app.js's own buildNinetyDayPlanPdf (that tool's
  // own PDF rebuild, same Oct 2026 pass) since this is a separate iframe
  // and can't import that file's function directly. Built from the plain
  // plan data object (client.ninetyDayPlan) rather than re-parsing HTML.
  function buildNinetyDayPlanPdfForAttachment(clientName, plan) {
    const p = plan || {};
    const name = clientName || 'Client';
    const r = RevitalPDF.create({ reportTitle: '90-DAY MARKETING ROADMAP', companyName: name });
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
      const r = buildWelcomeGuidePdf(clientName);
      r.save(`Welcome_Guide_${clientName.replace(/\s+/g, '_')}.pdf`);
      generateBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download PDF';
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF generation failed: ' + (err && err.message ? err.message : err));
      generateBtn.innerHTML = 'Download PDF';
    }
    generateBtn.disabled = false;
  });

  // Wait a tiny bit for the parent to fully inject its globals if this
  // iframe just loaded fresh (same pattern used elsewhere in the Hub for
  // the same reason), then auto-fill and render.
  setTimeout(() => {
    autoFillFromActiveClient();
    renderPreview(false);
  }, 300);

  // Initial render (before the auto-fill above resolves, so the preview
  // isn't blank while waiting).
  renderPreview(false);

  // ── Email to Client (real auto-send via Resend, PDF attached) ──
  // Deliberately a manual button, not fired automatically at client
  // creation - the account manager's name/email and the client's contact
  // email don't exist yet at that point, so an auto-send would go out
  // with a half-blank PDF. This button lets whoever fills in the form
  // decide when it's actually ready, using the live form values (which
  // may have been hand-edited here) rather than re-reading stale config.
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
  const attach90DayPlanCheckbox = document.getElementById('attach90DayPlan');
  const attach90DayPlanNote = document.getElementById('attach90DayPlanNote');

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

  const NINETY_DAY_EMAIL_NOTE = "We've also attached your custom 90-Day Plan, mapping out your goals and strategy for the next three months.";

  // Inserts/removes the 90-Day Plan mention from the plain-text email body
  // so the copy always matches what's actually attached, without doing a
  // full re-fill (which would stomp any hand edits made to the body in the
  // meantime). Inserted right before the portal-link line so it reads as
  // part of the same "what's attached" paragraph; falls back to appending
  // at the end if that line was edited away.
  function applyNinetyDayNote(body, include) {
    const hasNote = body.includes(NINETY_DAY_EMAIL_NOTE);
    if (include && !hasNote) {
      const marker = 'You can access your client portal here:';
      const idx = body.indexOf(marker);
      if (idx !== -1) {
        return body.slice(0, idx) + NINETY_DAY_EMAIL_NOTE + '\n\n' + body.slice(idx);
      }
      return body + '\n\n' + NINETY_DAY_EMAIL_NOTE;
    }
    if (!include && hasNote) {
      return body
        .split(NINETY_DAY_EMAIL_NOTE + '\n\n').join('')
        .split(NINETY_DAY_EMAIL_NOTE).join('')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    return body;
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
        alert("This client has no Contact Email set in Client Portal Manager yet - add one before emailing the Welcome Guide.");
        return;
      }

      // Live form values (may have been hand-edited), not raw config -
      // this is the whole point of a manual step instead of auto-firing
      // at client creation before these fields exist.
      const amName = (document.getElementById('amName').value || '').trim();
      const amEmail = (document.getElementById('amEmail').value || '').trim();
      const clientName = (document.getElementById('clientName').value || '').trim() || client.name || 'there';
      const contactName = config.clientContactName || clientName;
      const portalLinkVal = (document.getElementById('portalLink').value || '').trim();

      let subject = 'Welcome to Revital Productions 🎉';
      let body = `Hi ${contactName.split(' ')[0]},\n\nWelcome aboard! Attached is your Welcome Guide — it covers your dedicated Account Manager's contact info, what we're building for you, your first 30 days with us, and how we handle communication and approvals.` +
        (portalLinkVal ? `\n\nYou can access your client portal here: ${portalLinkVal}` : '') +
        `\n\nThanks,\n${amName || 'The Revital Productions team'}`;

      if (window.parent.fetchEmailTemplateById && window.parent.fillTemplateVars && window.parent.templateHtmlToPlainText) {
        try {
          const tpl = await window.parent.fetchEmailTemplateById('tpl-welcome-8');
          if (tpl) {
            const filled = window.parent.fillTemplateVars(tpl.content, {
              contactName: contactName,
              clientName: clientName,
              accountManagerName: amName || 'the Revital Productions team',
              portalLink: portalLinkVal
            });
            subject = tpl.subjectLine || subject;
            body = window.parent.templateHtmlToPlainText(filled);
          }
        } catch (e) {
          console.warn('Could not load welcome email template, using fallback text:', e);
        }
      }

      emailToClientTo.value = config.clientContactEmail;
      emailToClientSubject.value = subject;
      emailToClientBody.value = body;
      refreshEmailToClientMailto();

      // Gate the "Also attach 90-Day Plan" checkbox on whether the client
      // actually has any saved plan data yet (client.ninetyDayPlan, written
      // by the 90-Day Plan Gen tool) - checking an empty box would just
      // send a PDF full of "To be defined." placeholder copy.
      const hasNinetyDayPlan = !!(client.ninetyDayPlan && Object.values(client.ninetyDayPlan).some(v => (v || '').trim()));
      if (attach90DayPlanCheckbox) {
        attach90DayPlanCheckbox.disabled = !hasNinetyDayPlan;
        attach90DayPlanCheckbox.checked = false;
      }
      if (attach90DayPlanNote) {
        attach90DayPlanNote.style.display = hasNinetyDayPlan ? 'none' : 'block';
        attach90DayPlanNote.textContent = hasNinetyDayPlan ? '' : 'No 90-Day Plan saved for this client yet - fill one in on the 90-Day Plan Gen tab first.';
      }

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

  // Keep the email body in sync with what's actually attached: checking
  // "Also attach 90-Day Plan" adds a line mentioning it, unchecking removes
  // it. Uses text search/replace (applyNinetyDayNote above) rather than a
  // full re-fill, so any other hand edits to the body survive the toggle.
  if (attach90DayPlanCheckbox) {
    attach90DayPlanCheckbox.addEventListener('change', () => {
      if (!emailToClientBody) return;
      emailToClientBody.value = applyNinetyDayNote(emailToClientBody.value, attach90DayPlanCheckbox.checked);
      refreshEmailToClientMailto();
    });
  }

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
        console.error('Failed to copy welcome email', err);
        alert('Failed to copy. Please manually select and copy the text.');
      }
    });
  }

  // Generates the PDF in-memory via outputPdf('datauristring') - same
  // pipeline as the Download PDF button, just without triggering a
  // browser download - then POSTs it to /api/send-email as an attachment.
  if (emailToClientSendBtn) {
    emailToClientSendBtn.addEventListener('click', async () => {
      if (!currentEmailToClientFrom) return;
      if (typeof window.RevitalPDF === 'undefined') {
        alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
        return;
      }

      // Fetched once here (rather than re-fetched inside the 90-Day Plan
      // block below) so it's also available for the emailSends metadata
      // in the /api/send-email call further down.
      const activeClient = getParentActiveClient();

      emailToClientSendBtn.disabled = true;
      emailToClientSendBtn.textContent = 'Generating PDF...';
      if (emailToClientStatus) emailToClientStatus.textContent = '';

      const clientName = (document.getElementById('clientName').value || 'Client');
      const filename = `Welcome_Guide_${clientName.replace(/\s+/g, '_')}.pdf`;

      try {
        const r = buildWelcomeGuidePdf(clientName);
        const dataUri = r.doc.output('datauristring');
        const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
        if (!base64) throw new Error('PDF generation produced no data');

        const attachments = [{ filename: filename, content: base64 }];

        // Optional second PDF: built by buildNinetyDayPlanPdfForAttachment
        // above (mirrors ninety-day-plan/js/app.js's own RevitalPDF
        // rebuild) from the plan data straight off the client record.
        if (attach90DayPlanCheckbox && attach90DayPlanCheckbox.checked) {
          const client = activeClient;
          if (client && client.ninetyDayPlan) {
            const planClientName = (document.getElementById('clientName').value || '').trim() || client.name || 'Client';
            const planR = buildNinetyDayPlanPdfForAttachment(planClientName, client.ninetyDayPlan);
            const planFilename = `90_Day_Plan_${planClientName.replace(/\s+/g, '_')}.pdf`;
            const planDataUri = planR.doc.output('datauristring');
            const planBase64 = planDataUri.slice(planDataUri.indexOf(',') + 1);
            if (planBase64) {
              attachments.push({ filename: planFilename, content: planBase64 });
            }
          }
        }

        emailToClientSendBtn.textContent = 'Sending...';

        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: emailToClientTo.value,
            subject: emailToClientSubject.value,
            body: emailToClientBody.value,
            from: currentEmailToClientFrom,
            attachments,
            // Metadata only - lets the Hub's emailSends record (and later
            // a delivery-status webhook) show which client/tool this send
            // belonged to. See _worker.js's handleSendEmail.
            clientId: activeClient ? (activeClient.id || null) : null,
            clientName: activeClient ? (activeClient.name || null) : null,
            tool: 'Welcome Guide Gen'
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
          window.parent.logAdminActivity('Welcome email sent', client.name || client.id);
        }
      } catch (e) {
        console.error('Send welcome email failed:', e);
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