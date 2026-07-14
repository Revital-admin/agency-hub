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

  // Wait a tiny bit for the parent to fully inject its globals if this
  // iframe just loaded fresh, then auto-fill and render.
  setTimeout(() => {
    autoFillFromActiveClient();
    renderPreview();
  }, 300);

  // Initial render (before the auto-fill above resolves, so the preview
  // isn't blank while waiting).
  renderPreview();
});
