/* ============================================================
   TESTIMONIAL & REVIEW REQUESTS — APP LOGIC
   Active-client pattern (like Red Flag Checklist, Creative Brief
   Generator): window.parent.getActiveClient() returns clientsDb[activeClient]
   by reference, this tool mutates client.testimonialRequest directly
   (internal ask/response tracking), then window.parent.saveDatabase()
   persists it. Also reads client.testimonialSubmission - the quote the
   client themselves typed into their portal's Leave a Testimonial view,
   synced in from the public clients/{token} doc by the root app.js's
   foldInTestimonialSubmission (same mechanism as content approvals). The
   iframe gets a hard reload whenever the active client changes, so
   DOMContentLoaded always sees the right client fresh.
   ============================================================ */

let isEmbedded = false;
let parentClient = null;
try {
  if (window.parent && typeof window.parent.getActiveClient === 'function') {
    isEmbedded = true;
    parentClient = window.parent.getActiveClient();
  }
} catch (e) {
  console.log("Embedded check bypassed due to CORS");
}

function el(id) { return document.getElementById(id); }

function getRequestState() {
  if (!parentClient.testimonialRequest) {
    parentClient.testimonialRequest = { status: "Not Asked", askedDate: "", templateUsed: "", notes: "" };
  }
  return parentClient.testimonialRequest;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function renderSubmission() {
  const container = el('submissionContainer');
  const submission = parentClient.testimonialSubmission;

  if (!submission || !submission.quote) {
    container.innerHTML = '<p class="testimonial-none-state">No testimonial submitted yet — the client hasn\'t used the "Leave a Testimonial" view in their portal, or hasn\'t been asked.</p>';
    return;
  }

  const authorLine = [submission.authorName, submission.authorTitle].filter(Boolean).join(' — ');
  const permissionBadge = submission.permissionToUse
    ? '<span class="permission-badge allowed">OK to use publicly</span>'
    : '<span class="permission-badge not-allowed">Internal use only — no permission given</span>';

  container.innerHTML = `
    <div class="testimonial-submission-card">
      <div class="testimonial-submission-quote">"${escapeHtml(submission.quote)}"</div>
      <div class="testimonial-submission-meta">
        ${authorLine ? `<span>${escapeHtml(authorLine)}</span>` : ''}
        <span>Submitted ${escapeHtml(submission.submittedDate || '')}</span>
        ${permissionBadge}
      </div>
      <div class="testimonial-submission-actions">
        <button class="btn-secondary" id="copyForCaseStudyBtn">Copy for Case Study Builder</button>
        <button class="btn-secondary" id="goToCaseStudyBtn">Go to Case Study Builder</button>
      </div>
    </div>
  `;

  const copyBtn = el('copyForCaseStudyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const text = submission.quote + (authorLine ? `\n\n— ${authorLine}` : '');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy for Case Study Builder'; }, 2000);
        }).catch(() => {});
      }
    });
  }

  const goBtn = el('goToCaseStudyBtn');
  if (goBtn) {
    goBtn.addEventListener('click', () => {
      if (window.parent && typeof window.parent.navigateToTab === 'function') {
        window.parent.navigateToTab('tab-casestudy');
      }
    });
  }
}

function showSaveStatus(message, type) {
  const status = el('saveStatus');
  status.textContent = message;
  status.className = 'save-status' + (type ? ' ' + type : '');
  if (message) {
    setTimeout(() => {
      status.textContent = '';
      status.className = 'save-status';
    }, 3500);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!isEmbedded || !parentClient) {
    el('noClientState').style.display = '';
    el('trackerInterface').style.display = 'none';
    return;
  }

  el('noClientState').style.display = 'none';
  el('trackerInterface').style.display = '';

  const state = getRequestState();
  el('requestStatus').value = state.status || 'Not Asked';
  el('askedDate').value = state.askedDate || '';
  el('templateUsed').value = state.templateUsed || '';
  el('requestNotes').value = state.notes || '';

  renderSubmission();

  el('saveTrackerBtn').addEventListener('click', () => {
    const state = getRequestState();
    state.status = el('requestStatus').value;
    state.askedDate = el('askedDate').value || '';
    state.templateUsed = el('templateUsed').value.trim();
    state.notes = el('requestNotes').value.trim();

    if (window.parent && typeof window.parent.saveDatabase === 'function') {
      window.parent.saveDatabase();
      showSaveStatus('Saved.', 'success');
      if (window.parent.showBanner) {
        window.parent.showBanner('success', `Testimonial request status saved for ${parentClient.name}.`);
      }
    } else {
      showSaveStatus("Couldn't reach the Hub's database.", 'error');
    }
  });
});
