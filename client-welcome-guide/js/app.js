document.addEventListener('DOMContentLoaded', () => {
  const formInputs = document.querySelectorAll('input, textarea');
  const pdfContainer = document.getElementById('pdfContainer');
  const generateBtn = document.getElementById('generatePdfBtn');

  function getAvatarInitials(name) {
    if (!name) return 'AM';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  function renderPreview() {
    const clientName = document.getElementById('clientName').value || 'Acme Corp';
    const intakeLink = document.getElementById('intakeLink').value || 'https://forms.gle/...';
    const amName = document.getElementById('amName').value || 'Jane Doe';
    const amEmail = document.getElementById('amEmail').value || 'jane@revitalproductions.com';
    const welcomeNote = document.getElementById('welcomeNote').value || `We are thrilled to partner with ${clientName} and can't wait to get started!`;
    
    const checkboxes = document.querySelectorAll('input[name="services"]:checked');
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

        <a href="${intakeLink}" target="_blank" class="btn-pdf">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Click Here to Start Your Onboarding
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
      image:        { type: 'png' },
      html2canvas:  { scale: 4, useCORS: true, letterRendering: true },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    generateBtn.innerHTML = 'Generating...';
    generateBtn.disabled = true;

    html2pdf().set(opt).from(pdfContainer).save().then(() => {
      generateBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download PDF';
      generateBtn.disabled = false;
    });
  });

  // Initial render
  renderPreview();
});