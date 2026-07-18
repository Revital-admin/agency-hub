// Same starter list as DEFAULT_CLIENT_CHECKLIST in the parent hub's
// data-store.js. Duplicated here because this runs in its own iframe
// document and can't see the parent's top-level `const` declarations -
// only used to backfill clients created before this feature existed.
const DEFAULT_CLIENT_CHECKLIST_FALLBACK = [
  { id: 'cc_1', label: 'Complete the intake questionnaire' },
  { id: 'cc_2', label: 'Attend the kickoff call' },
  { id: 'cc_3', label: 'Share brand guidelines & assets' },
  { id: 'cc_4', label: 'Confirm project goals & KPIs' },
  { id: 'cc_5', label: 'Provide platform access (GA4, Ads, social accounts, etc.)' }
];

// Cryptographically secure token generator (replaces Math.random-based tokens)
function generateSecureToken(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// Connect to parent Hub state safely
let parentSave, getActiveClient;
try {
  parentSave = window.parent.saveDatabase;
  getActiveClient = window.parent.getActiveClient;
} catch (e) {
  console.log("CORS blocked parent access");
}

// DOM Elements
const magicLinkInput = document.getElementById("magicLink");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const primaryColorInput = document.getElementById("primaryColor");
const colorHexText = document.getElementById("colorHex");
const secondaryColorInput = document.getElementById("secondaryColor");
const colorHexSecondaryText = document.getElementById("colorHexSecondary");
const logoDropZone = document.getElementById("logoDropZone");
const dropZoneText = document.getElementById("dropZoneText");
const logoPreview = document.getElementById("logoPreview");
const logoFileInput = document.getElementById("logoFileInput");
const btnEyedropper = document.getElementById("btnEyedropper");
const btnEyedropperSec = document.getElementById("btnEyedropperSec");


const inputs = {
  clientContactName: document.getElementById("clientContactName"),
  clientLogoUrlInput: document.getElementById("clientLogoUrl"),
  projectsEmbedUrl: document.getElementById("projectsEmbedUrl"),
  calendarEmbedUrl: document.getElementById("calendarEmbedUrl"),
  campaignBriefUrl: document.getElementById("campaignBriefUrl"),
  completedWorkUrl: document.getElementById("completedWorkUrl"),
  liveAnalyticsUrl: document.getElementById("liveAnalyticsUrl"),
  feedbackFormUrl: document.getElementById("feedbackFormUrl"),
  revisionFormUrl: document.getElementById("revisionFormUrl"),
  contentRequestFormUrl: document.getElementById("contentRequestFormUrl"),
  brandAssetsUrl: document.getElementById("brandAssetsUrl"),
  monthlyReportsUrl: document.getElementById("monthlyReportsUrl"),
  fileUploadUrl: document.getElementById("fileUploadUrl"),
  driveFolderUrl: document.getElementById("driveFolderUrl"),
  accountManagerName: document.getElementById("accountManagerName"),
  accountManagerEmail: document.getElementById("accountManagerEmail"),
  accountManagerPhone: document.getElementById("accountManagerPhone"),
  calendlyLink: document.getElementById("calendlyLink"),
  clientContactEmail: document.getElementById("clientContactEmail")
};

function init() {
  if (!getActiveClient) {
    console.error("Hub database not accessible.");
    return;
  }

  const client = getActiveClient();
  if (!client) return;

  // Ensure portalConfig exists
  if (!client.portalConfig) {
    client.portalConfig = {
      accountManagerName: "",
      accountManagerEmail: "",
      accountManagerPhone: "",
      calendlyLink: "",
      projectsEmbedUrl: "",
      calendarEmbedUrl: "",
      campaignBriefUrl: "",
      completedWorkUrl: "",
      feedbackFormUrl: "",
      revisionFormUrl: "",
      contentRequestFormUrl: "",
      brandAssetsUrl: "",
      monthlyReportsUrl: "",
      fileUploadUrl: "",
      driveFolderUrl: "",
      liveAnalyticsUrl: "",
      clientLogoUrl: "",
      clientContactName: "",
      clientContactEmail: "",
      primaryColor: "#10b981",
      secondaryColor: "#6366f1",
      magicToken: generateSecureToken()
    };
    if (parentSave) parentSave();
  }

  // Ensure clientChecklist exists for clients created before this feature.
  if (!Array.isArray(client.clientChecklist)) {
    client.clientChecklist = DEFAULT_CLIENT_CHECKLIST_FALLBACK.map(item => ({
      id: item.id,
      label: item.label,
      checked: false
    }));
    if (parentSave) parentSave();
  }

  // Ensure approvals arrays exist for clients created before this feature.
  if (!Array.isArray(client.pendingApprovals)) client.pendingApprovals = [];
  if (!Array.isArray(client.approvalHistory)) client.approvalHistory = [];

  renderClientChecklist(client);
  renderApprovals(client);
  initApprovalControls();

  const config = client.portalConfig;

  // Load Magic Link
  const baseUrl = window.location.origin + "/portal/index.html";
  const token = config.magicToken;
  const clientNameRaw = client.id || client.name || "Client";
  magicLinkInput.value = `${baseUrl}?c=${encodeURIComponent(clientNameRaw)}&t=${token}`;

  // Load Color
  primaryColorInput.value = config.primaryColor || "#10b981";
  colorHexText.textContent = config.primaryColor || "#10b981";
  secondaryColorInput.value = config.secondaryColor || "#6366f1";
  colorHexSecondaryText.textContent = config.secondaryColor || "#6366f1";

  // Load Text Inputs
  // Load Logo
  if (config.clientLogoUrl) {
    logoPreview.src = config.clientLogoUrl;
    logoPreview.style.display = "block";
    dropZoneText.style.display = "none";
    if (window.EyeDropper) {
      btnEyedropper.style.display = "flex";
      btnEyedropperSec.style.display = "flex";
    }
  }

  // Setup Drag and Drop
  logoDropZone.addEventListener("click", () => logoFileInput.click());
  
  logoDropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    logoDropZone.classList.add("dragover");
  });
  
  logoDropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    logoDropZone.classList.remove("dragover");
  });
  
  logoDropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    logoDropZone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  });
  
  logoFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageUpload(e.target.files[0]);
    }
  });

  // Setup Eyedroppers
  if (window.EyeDropper) {
    btnEyedropper.addEventListener("click", async () => {
      try {
        const eyeDropper = new EyeDropper();
        const result = await eyeDropper.open();
        primaryColorInput.value = result.sRGBHex;
        colorHexText.textContent = result.sRGBHex;
        updateConfig("primaryColor", result.sRGBHex);
      } catch (e) {
        console.log("Eyedropper cancelled");
      }
    });

    btnEyedropperSec.addEventListener("click", async () => {
      try {
        const eyeDropper = new EyeDropper();
        const result = await eyeDropper.open();
        secondaryColorInput.value = result.sRGBHex;
        colorHexSecondaryText.textContent = result.sRGBHex;
        updateConfig("secondaryColor", result.sRGBHex);
      } catch (e) {
        console.log("Eyedropper cancelled");
      }
    });
  }

  Object.keys(inputs).forEach(key => {
    if (inputs[key]) {
      inputs[key].value = config[key] || "";
      inputs[key].addEventListener("input", (e) => {
        updateConfig(key, e.target.value);
      });
    }
  });

  // Event Listeners for autosave
  primaryColorInput.addEventListener("input", (e) => {
    colorHexText.textContent = e.target.value;
    updateConfig("primaryColor", e.target.value);
  });
  secondaryColorInput.addEventListener("input", (e) => {
    colorHexSecondaryText.textContent = e.target.value;
    updateConfig("secondaryColor", e.target.value);
  });

  copyLinkBtn.addEventListener("click", () => {
    magicLinkInput.select();
    
    // Modern clipboard API fallback to execCommand
    const copyToClipboard = async () => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(magicLinkInput.value);
        } else {
          document.execCommand("copy");
        }
        
        const originalText = copyLinkBtn.textContent;
        copyLinkBtn.textContent = "Copied!";
        setTimeout(() => {
          copyLinkBtn.textContent = originalText;
        }, 2000);
      } catch (err) {
        console.error('Failed to copy', err);
        alert('Failed to copy. Please manually select and copy the link.');
      }
    };
    
    copyToClipboard();
  });
}

// Allowed image types and their magic-byte signatures (checked against actual
// file bytes, not the browser-reported MIME type, since file.type is derived
// from the file extension and is trivially spoofed by renaming any file).
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const IMAGE_SIGNATURES = [
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  // WEBP: "RIFF" .... "WEBP"
  { type: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, extra: { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 } }
];

function showLogoError(message) {
  dropZoneText.style.display = "block";
  dropZoneText.style.color = "#ef4444";
  dropZoneText.innerHTML = message + "<br><small>or click to try again</small>";
  logoPreview.style.display = "none";
  logoFileInput.value = "";
}

function resetLogoError() {
  dropZoneText.style.color = "";
}

function matchesSignature(bytes, sig) {
  for (let i = 0; i < sig.bytes.length; i++) {
    if (bytes[i] !== sig.bytes[i]) return false;
  }
  if (sig.extra) {
    for (let i = 0; i < sig.extra.bytes.length; i++) {
      if (bytes[sig.extra.offset + i] !== sig.extra.bytes[i]) return false;
    }
  }
  return true;
}

function detectImageType(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer.slice(0, 16));
  for (const sig of IMAGE_SIGNATURES) {
    if (matchesSignature(bytes, sig)) return sig.type;
  }
  return null;
}

function handleImageUpload(file) {
  resetLogoError();

  // 1. Reject files that are too large before doing any work.
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    showLogoError("File too large (max 5MB).");
    return;
  }

  // 2. Quick reject based on the browser-reported type. Not trustworthy on
  // its own (see note above) but cheap and catches the common case.
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    showLogoError("Unsupported file type. Please upload a PNG, JPG, or WEBP image.");
    return;
  }

  // 3. Real validation: sniff the actual file bytes for a known image
  // signature so a renamed non-image file (e.g. malicious.exe -> logo.png)
  // can't slip through just because the extension/MIME type looks right.
  const sigReader = new FileReader();
  sigReader.onload = (sigEvent) => {
    const detectedType = detectImageType(sigEvent.target.result);
    if (!detectedType) {
      showLogoError("That file isn't a valid image.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Compress image
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 400;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/png");

        // Show Preview
        logoPreview.src = dataUrl;
        logoPreview.style.display = "block";
        dropZoneText.style.display = "none";

        // Show Eyedroppers if supported
        if (window.EyeDropper) {
          btnEyedropper.style.display = "flex";
          btnEyedropperSec.style.display = "flex";
        }

        // Save
        updateConfig("clientLogoUrl", dataUrl);
      };
      img.onerror = () => {
        showLogoError("Couldn't read that image. It may be corrupted.");
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };
  sigReader.onerror = () => {
    showLogoError("Couldn't read that file.");
  };
  sigReader.readAsArrayBuffer(file.slice(0, 16));
}

function updateConfig(key, value) {
  const client = getActiveClient();
  if (client && client.portalConfig) {
    client.portalConfig[key] = value;
    if (parentSave) parentSave();
  }
}

// ── Client-Facing Checklist ──
// Fully independent from the account manager's internal onboarding
// tracker. Whatever's added here is exactly what shows up on the client's
// own portal, in the same order, nothing filtered or guessed.
function renderClientChecklist(client) {
  const listEl = document.getElementById("clientChecklistList");
  if (!listEl) return;

  listEl.innerHTML = "";

  const items = client.clientChecklist || [];
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "client-checklist-empty";
    empty.textContent = "No tasks yet. Add one below.";
    listEl.appendChild(empty);
    return;
  }

  items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "client-checklist-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!item.checked;
    checkbox.addEventListener("change", () => {
      item.checked = checkbox.checked;
      if (parentSave) parentSave();
    });

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "client-checklist-label";
    labelInput.value = item.label || "";
    labelInput.addEventListener("input", () => {
      item.label = labelInput.value;
      if (parentSave) parentSave();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "client-checklist-remove";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      client.clientChecklist.splice(index, 1);
      if (parentSave) parentSave();
      renderClientChecklist(client);
    });

    row.appendChild(checkbox);
    row.appendChild(labelInput);
    row.appendChild(removeBtn);
    listEl.appendChild(row);
  });
}

function initClientChecklistControls() {
  const addBtn = document.getElementById("addClientChecklistItemBtn");
  const input = document.getElementById("newClientChecklistItem");
  if (!addBtn || !input) return;

  const addItem = () => {
    const client = getActiveClient();
    if (!client) return;
    const label = input.value.trim();
    if (label === "") return;

    if (!Array.isArray(client.clientChecklist)) client.clientChecklist = [];
    client.clientChecklist.push({
      id: `cc_custom_${Date.now()}`,
      label: label,
      checked: false
    });
    if (parentSave) parentSave();
    input.value = "";
    renderClientChecklist(client);
  };

  addBtn.addEventListener("click", addItem);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addItem();
    }
  });
}

initClientChecklistControls();

// Wait a tiny bit for the parent to fully inject state if loading fresh
setTimeout(init, 300);

// ── Content Approvals ──
// Type-specific review checklists, duplicated here (rather than shared)
// for the same reason DEFAULT_CLIENT_CHECKLIST_FALLBACK is duplicated -
// this runs in its own iframe document and can't see the parent's or
// portal's top-level `const` declarations. Keep this list in sync with
// the matching one in portal/js/app.js if you edit either.
const APPROVAL_TYPE_LABELS = {
  social: "Social Media Content",
  ads: "Paid Ad Creative",
  email: "Email Campaign",
  website: "Website Page",
  video: "Video & Production"
};

const APPROVAL_CHECKLISTS = {
  social: [
    "All copy (captions, text overlays, hashtags) is correct",
    "All visuals (images, graphics, video) are approved",
    "Tone and messaging align with our brand voice",
    "No spelling, grammar, or factual errors",
    "The scheduled go-live date is correct"
  ],
  ads: [
    "All ad images/videos are approved",
    "Headlines and body copy are correct",
    "CTAs and destination URLs are correct and tested",
    "Target audience and campaign objective are correct as briefed",
    "The ad budget and campaign dates are confirmed"
  ],
  email: [
    "Subject line and preview text are correct",
    "All body copy is correct - no spelling or factual errors",
    "All links have been tested and go to the correct destination",
    "The sending list/segment is correct",
    "The scheduled send date and time are correct"
  ],
  website: [
    "All page copy (headlines, body text, CTAs) is correct",
    "Colors, fonts, and branding match our brand guidelines",
    "All navigation links and buttons work correctly",
    "Any forms or integrations have been tested",
    "The page looks correct on both mobile and desktop"
  ],
  video: [
    "The overall concept, message, and storyline are approved",
    "All on-screen text and captions are correct",
    "Voiceover or dialogue is correct",
    "Music/audio is appropriate and approved",
    "The final frame CTA and branding are correct"
  ]
};

function escapeHtmlLocal(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

// Builds a ready-to-send email (not auto-sent - this app has no email
// backend/API anywhere) notifying the client that something is waiting
// on them, and drops it into the read-only-turned-editable panel so the
// account manager can review, tweak, and send it from their own inbox.
function buildApprovalEmail(client, entry) {
  const config = client.portalConfig || {};
  const clientFirstName = (config.clientContactName || client.name || "there").split(" ")[0];
  const baseUrl = window.location.origin + "/portal/index.html";
  const clientNameRaw = client.id || client.name || "Client";
  const portalLink = config.magicToken
    ? `${baseUrl}?c=${encodeURIComponent(clientNameRaw)}&t=${config.magicToken}`
    : "";
  const amFirstName = config.accountManagerName ? config.accountManagerName.split(" ")[0] : "Your account manager";
  const typeLabel = APPROVAL_TYPE_LABELS[entry.contentType] || "deliverable";

  const subject = `${entry.title} is ready for your approval`;
  const bodyLines = [
    `Hi ${clientFirstName},`,
    "",
    `${entry.title} (${typeLabel}) is ready for your review.`,
    ""
  ];
  if (entry.previewLink) {
    bodyLines.push(`Preview: ${entry.previewLink}`, "");
  }
  bodyLines.push(
    "Please head to your Client Portal and open the Approvals tab to review and respond - you can select Approved, Approved with Minor Corrections, or Revision Required:",
    portalLink,
    "",
    "We ask for a response within 48 hours so we can stay on schedule.",
    "",
    "Thanks!",
    amFirstName
  );
  const body = bodyLines.join("\n");

  const toEl = document.getElementById("approvalEmailTo");
  const subjectEl = document.getElementById("approvalEmailSubject");
  const bodyEl = document.getElementById("approvalEmailBody");
  const openBtn = document.getElementById("approvalEmailOpenBtn");
  const panel = document.getElementById("approvalEmailReady");
  if (!toEl || !subjectEl || !bodyEl || !openBtn || !panel) return;

  toEl.value = config.clientContactEmail || "";
  subjectEl.value = subject;
  bodyEl.value = body;

  const refreshMailto = () => {
    const mailto = `mailto:${encodeURIComponent(toEl.value)}?subject=${encodeURIComponent(subjectEl.value)}&body=${encodeURIComponent(bodyEl.value)}`;
    openBtn.href = mailto;
  };
  refreshMailto();
  [toEl, subjectEl, bodyEl].forEach(el => {
    el.removeEventListener("input", refreshMailto);
    el.addEventListener("input", refreshMailto);
  });

  panel.style.display = "block";
}

function renderApprovals(client) {
  const pendingEl = document.getElementById("pendingApprovalsList");
  const historyEl = document.getElementById("approvalHistoryList");
  if (!pendingEl || !historyEl) return;

  const pending = Array.isArray(client.pendingApprovals) ? client.pendingApprovals : [];
  const history = Array.isArray(client.approvalHistory) ? client.approvalHistory : [];

  pendingEl.innerHTML = "";
  if (pending.length === 0) {
    const empty = document.createElement("div");
    empty.className = "client-checklist-empty";
    empty.textContent = "No pending approvals.";
    pendingEl.appendChild(empty);
  } else {
    pending.forEach(entry => {
      const row = document.createElement("div");
      row.className = "approval-row";
      row.innerHTML = `
        <div class="approval-row-main">
          <strong>${escapeHtmlLocal(entry.title)}</strong>
          <div class="approval-row-meta">${escapeHtmlLocal(APPROVAL_TYPE_LABELS[entry.contentType] || "")} &middot; Awaiting client response</div>
        </div>
        <button type="button" class="client-checklist-remove approval-remove-btn" data-id="${escapeHtmlLocal(entry.id)}">Remove</button>
      `;
      pendingEl.appendChild(row);
    });
    pendingEl.querySelectorAll(".approval-remove-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        client.pendingApprovals = client.pendingApprovals.filter(p => p.id !== btn.dataset.id);
        if (parentSave) parentSave();
        renderApprovals(client);
      });
    });
  }

  historyEl.innerHTML = "";
  if (history.length === 0) {
    const empty = document.createElement("div");
    empty.className = "client-checklist-empty";
    empty.textContent = "No decisions yet.";
    historyEl.appendChild(empty);
  } else {
    const decisionLabels = {
      approved: "✅ Approved",
      minor: "🔄 Approved with Minor Corrections",
      revision: "❌ Revision Required"
    };
    history.slice().reverse().forEach(entry => {
      const row = document.createElement("div");
      row.className = "approval-row approval-history-row";
      const decisionLabel = decisionLabels[entry.decision] || entry.decision || "";
      const decidedDate = entry.decidedAt ? new Date(entry.decidedAt).toLocaleDateString() : "";
      row.innerHTML = `
        <div class="approval-row-main">
          <strong>${escapeHtmlLocal(entry.title)}</strong>
          <div class="approval-row-meta">${decisionLabel} &middot; ${escapeHtmlLocal(decidedDate)}</div>
          ${entry.notes ? `<div class="approval-notes">&ldquo;${escapeHtmlLocal(entry.notes)}&rdquo;</div>` : ""}
        </div>
      `;
      historyEl.appendChild(row);
    });
  }
}

function initApprovalControls() {
  const createBtn = document.getElementById("createApprovalBtn");
  const copyBtn = document.getElementById("approvalEmailCopyBtn");
  if (!createBtn) return;

  createBtn.addEventListener("click", () => {
    const client = getActiveClient();
    if (!client) return;

    const typeEl = document.getElementById("newApprovalType");
    const titleEl = document.getElementById("newApprovalTitle");
    const linkEl = document.getElementById("newApprovalLink");

    const title = titleEl.value.trim();
    if (!title) {
      alert("Please enter a deliverable title.");
      return;
    }

    if (!Array.isArray(client.pendingApprovals)) client.pendingApprovals = [];

    const entry = {
      id: generateSecureToken(8),
      contentType: typeEl.value,
      title: title,
      previewLink: linkEl.value.trim(),
      checklist: APPROVAL_CHECKLISTS[typeEl.value] || [],
      createdAt: new Date().toISOString()
    };
    client.pendingApprovals.push(entry);
    if (parentSave) parentSave();

    titleEl.value = "";
    linkEl.value = "";

    buildApprovalEmail(client, entry);
    renderApprovals(client);
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const to = document.getElementById("approvalEmailTo").value;
      const subject = document.getElementById("approvalEmailSubject").value;
      const body = document.getElementById("approvalEmailBody").value;
      const text = `To: ${to}\nSubject: ${subject}\n\n${body}`;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          const bodyEl = document.getElementById("approvalEmailBody");
          bodyEl.select();
          document.execCommand("copy");
        }
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
      } catch (err) {
        console.error("Failed to copy approval email", err);
        alert("Failed to copy. Please manually select and copy the text.");
      }
    });
  }
}
