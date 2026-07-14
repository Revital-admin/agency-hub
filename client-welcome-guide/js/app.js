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
  }

  function renderPreview() {
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
  }

  formInputs.forEach(input => {
    input.addEventListener('input', renderPreview);
    if(input.type === 'checkbox') {
      input.addEventListener('change', renderPreview);
    }
  });

  generateBtn.addEventListener('click', () => {
    const clientName = document.getElementById('clientName').value || 'Client';
    const opt = {
      margin:       0,
      filename:     `Welcome_Guide_${clientName.replace(/\s+/g, '_')}.pdf`,
      // Same fix as the Intake Request generator: JPEG instead of PNG (no
      // alpha layer), scale 2 instead of 4, and an explicit pagebreak mode
      // so html2pdf breaks at the two .pdf-page divs instead of silently
      // slicing in a mostly-blank extra page whenever content ran a hair
      // past 11in. Old settings were producing 100MB+ files.
      image:        { type: 'jpeg', quality: 0.92 },
      // html2canvas defaults to using the page's current scroll offset
      // (window.pageYOffset) as the capture origin even for a detached,
      // never-visible element - forcing scrollX/scrollY to 0 makes it
      // render as if the page were unscrolled, which is what a detached
      // capture should always want. Omitting this was the actual cause
      // of the blank-space-then-offset-content pattern that persisted
      // through the container/overflow fixes.
      // Same fix as Intake Request, but this template has TWO .pdf-page
      // divs stacked (page-1 and page-2), so the forced height is two
      // full pages tall (816x2112 CSS px at 96dpi) instead of one.
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
      if (pdfBtn) { pdfBtn.disabled = false; pdfBtn.innerHTML = origText || 'Download PDF'; }
      if (generateBtn) { generateBtn.disabled = false; generateBtn.innerHTML = 'Download PDF'; }
      return;
    }

    // Capture from a copy of the preview content, appended off-screen,
    // instead of the live pdfContainer inside the sticky/scrollable
    // preview panel. A completely un-attached element (never appended
    // anywhere) has no real position in the document, which can leave
    // html2canvas unable to correctly scope its capture to just that
    // element - appending it off-screen gives it an actual, measurable
    // position/size while staying invisible to the user.
    const exportContainer = document.createElement('div');
    exportContainer.style.position = 'absolute';
    exportContainer.style.top = '0';
    exportContainer.style.left = '-9999px';
    exportContainer.innerHTML = pdfContainer.innerHTML;
    document.body.appendChild(exportContainer);

    // Appending to the DOM doesn't guarantee the browser has actually
    // laid out/painted the new element before the next line runs - layout
    // is batched, not synchronous. Capturing immediately was producing a
    // genuinely empty result with no thrown error at all (html2canvas
    // just found nothing to draw yet). A double requestAnimationFrame
    // waits for two real paint cycles, the standard reliable way to
    // guarantee layout has happened before capturing.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        html2pdf().set(opt).from(exportContainer).save().then(() => {
          exportContainer.remove();
          generateBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download PDF';
          generateBtn.disabled = false;
        }).catch((err) => {
          console.error('PDF generation failed:', err);
          exportContainer.remove();
          alert('PDF generation failed - check the browser console for details.');
          generateBtn.innerHTML = 'Download PDF';
          generateBtn.disabled = false;
        });
      });
    });
  });

  // Wait a tiny bit for the parent to fully inject its globals if this
  // iframe just loaded fresh (same pattern used elsewhere in the Hub for
  // the same reason), then auto-fill and render.
  setTimeout(() => {
    autoFillFromActiveClient();
    renderPreview();
  }, 300);

  // Initial render (before the auto-fill above resolves, so the preview
  // isn't blank while waiting).
  renderPreview();
});