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
  accountManagerName: document.getElementById("accountManagerName"),
  accountManagerEmail: document.getElementById("accountManagerEmail"),
  accountManagerPhone: document.getElementById("accountManagerPhone"),
  calendlyLink: document.getElementById("calendlyLink")
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
      liveAnalyticsUrl: "",
      clientLogoUrl: "",
      clientContactName: "",
      primaryColor: "#10b981",
      secondaryColor: "#6366f1",
      magicToken: generateSecureToken()
    };
    if (parentSave) parentSave();
  }

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
      inputs[key].addEventListener("input", (e) => {
        updateConfig(key, e.target.value);
      });
    }
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

// Wait a tiny bit for the parent to fully inject state if loading fresh
setTimeout(init, 300);
