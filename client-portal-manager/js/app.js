// Connect to parent Hub state safely
let parentDb, parentSave, getActiveClient, activeClientName;
try {
  parentDb = window.parent.clientsDb;
  parentSave = window.parent.saveDatabase;
  getActiveClient = window.parent.getActiveClient;
  activeClientName = window.parent.activeClientName;
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
  if (!parentDb || !getActiveClient) {
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
      magicToken: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    };
    if (parentSave) parentSave();
  }

  const config = client.portalConfig;

  // Load Magic Link
  const baseUrl = window.location.origin + "/portal/index.html";
  const token = config.magicToken;
  const clientNameRaw = window.parent.activeClientName || "Client";
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

function handleImageUpload(file) {
  if (!file.type.match('image.*')) return;
  
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
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
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
