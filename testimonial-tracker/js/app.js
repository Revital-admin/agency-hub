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

/* ── Send Ask Email (real auto-send via Resend, plain text) ──
   Distinct from the bell's testimonial_prompt nudge (fired automatically
   when a client's health flips Green, via buildTestimonialAskDraftEmail
   in the parent Hub's app.js) - this is the same email content, but
   available on-demand from the tracker itself for whenever the team
   decides to ask, not just the automatic Green-flip moment. Reuses the
   parent's buildTestimonialAskDraftEmail so the two stay in sync rather
   than maintaining two copies of the same copy. */

const sendAskPanel = el('sendAskPanel');
const sendAskTo = el('sendAskTo');
const sendAskSubject = el('sendAskSubject');
const sendAskBody = el('sendAskBody');
const sendAskOpenBtn = el('sendAskOpenBtn');
const sendAskCopyBtn = el('sendAskCopyBtn');
const sendAskSendBtn = el('sendAskSendBtn');
const sendAskStatus = el('sendAskStatus');
const sendAskCloseBtn = el('sendAskCloseBtn');
const openSendAskBtn = el('openSendAskBtn');

let currentAskDraft = null; // { to, subject, body, from? }

function refreshSendAskMailto() {
  if (!sendAskOpenBtn || !sendAskTo) return;
  sendAskOpenBtn.href = `mailto:${encodeURIComponent(sendAskTo.value)}?subject=${encodeURIComponent(sendAskSubject.value)}&body=${encodeURIComponent(sendAskBody.value)}`;
}

if (sendAskCloseBtn) {
  sendAskCloseBtn.addEventListener('click', () => {
    if (sendAskPanel) sendAskPanel.style.display = 'none';
  });
}

[sendAskTo, sendAskSubject, sendAskBody].forEach(elx => {
  if (elx) elx.addEventListener('input', refreshSendAskMailto);
});

if (sendAskCopyBtn) {
  sendAskCopyBtn.addEventListener('click', async () => {
    const text = `To: ${sendAskTo.value}\nSubject: ${sendAskSubject.value}\n\n${sendAskBody.value}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        sendAskBody.select();
        document.execCommand('copy');
      }
      const original = sendAskCopyBtn.textContent;
      sendAskCopyBtn.textContent = 'Copied!';
      setTimeout(() => { sendAskCopyBtn.textContent = original; }, 2000);
    } catch (err) {
      console.error('Failed to copy testimonial ask email', err);
      alert('Failed to copy. Please manually select and copy the text.');
    }
  });
}

if (openSendAskBtn) {
  openSendAskBtn.addEventListener('click', () => {
    if (!isEmbedded || !parentClient) return;
    if (!window.parent.buildTestimonialAskDraftEmail) {
      alert("Couldn't build the ask email - try reloading the Hub.");
      return;
    }
    const draft = window.parent.buildTestimonialAskDraftEmail(parentClient, parentClient.name);
    if (!draft) {
      alert(`${parentClient.name} has no Contact Email set in Client Portal Manager yet - add one before sending a testimonial ask.`);
      return;
    }
    currentAskDraft = draft;

    sendAskTo.value = draft.to;
    sendAskSubject.value = draft.subject;
    sendAskBody.value = draft.body;
    refreshSendAskMailto();

    if (sendAskSendBtn) {
      sendAskSendBtn.style.display = draft.sendEnabled ? 'inline-block' : 'none';
      sendAskSendBtn.disabled = false;
      sendAskSendBtn.textContent = 'Send';
    }
    if (sendAskStatus) {
      sendAskStatus.textContent = draft.sendEnabled ? '' : `Add ${parentClient.name}'s Account Manager Name + Email in Client Portal Manager to enable sending.`;
      sendAskStatus.style.color = 'var(--text-muted)';
    }

    if (sendAskPanel) {
      sendAskPanel.style.display = 'block';
      sendAskPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

if (sendAskSendBtn) {
  sendAskSendBtn.addEventListener('click', async () => {
    if (!currentAskDraft || !currentAskDraft.sendEnabled || !currentAskDraft.from) return;

    sendAskSendBtn.disabled = true;
    sendAskSendBtn.textContent = 'Sending...';
    if (sendAskStatus) sendAskStatus.textContent = '';

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: sendAskTo.value,
          subject: sendAskSubject.value,
          body: sendAskBody.value,
          from: currentAskDraft.from
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }

      sendAskSendBtn.textContent = 'Sent ✓';
      if (sendAskStatus) {
        sendAskStatus.textContent = 'Sent successfully.';
        sendAskStatus.style.color = 'var(--color-success, #10b981)';
      }

      // Sending the ask IS the ask, so log it the same way manually
      // filling in Status/Date Asked and clicking Save would.
      const state = getRequestState();
      state.status = 'Asked';
      state.askedDate = todayStr();
      state.templateUsed = 'Testimonial Ask (sent via Send Ask Email)';
      el('requestStatus').value = state.status;
      el('askedDate').value = state.askedDate;
      el('templateUsed').value = state.templateUsed;

      if (window.parent && typeof window.parent.saveDatabase === 'function') {
        window.parent.saveDatabase();
      }
      if (window.parent.showBanner) {
        window.parent.showBanner('success', `Testimonial ask emailed to ${parentClient.name}.`);
      }
    } catch (e) {
      console.error('Send testimonial ask failed:', e);
      sendAskSendBtn.disabled = false;
      sendAskSendBtn.textContent = 'Send';
      if (sendAskStatus) {
        sendAskStatus.textContent = "Couldn't send automatically (" + e.message + ") - use Copy or \"Open in Email App\" instead.";
        sendAskStatus.style.color = 'var(--color-error, #f68d5f)';
      }
    }
  });
}

function todayStr() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
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
