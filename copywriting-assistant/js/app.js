/* ============================================================
   copywriting-assistant/js/app.js
   Application State, Event Listeners, Counters, and Parent Sync
   ============================================================ */

/* ── Check if embedded in parent Revital Hub ── */
let isEmbedded = false;
let parentClient = null;
try {
  if (window.parent && typeof window.parent.getActiveClient === 'function') {
    isEmbedded = true;
    parentClient = window.parent.getActiveClient();
  }
} catch(e) {
  console.warn("CORS prevented parent access:", e);
}
/* ── State ──────────────────────────────────────────────────── */
const state = {
  inputs: {
    product: "",
    audience: "",
    benefit: "",
    cta: "",
    tone: "persuasive"
  },
  activeFramework: "aida",
  notes: "",
  targetUrl: ""
};

function initState() {
  if (isEmbedded && parentClient) {
    // Schema verification on parentClient
    if (!parentClient.copywriting) {
      parentClient.copywriting = {
        activeFramework: "aida",
        notes: "",
        inputs: { product: "", audience: "", benefit: "", cta: "", tone: "persuasive" },
        targetUrl: ""
      };
    }
    
    const pcCopy = parentClient.copywriting;
    state.activeFramework = pcCopy.activeFramework || "aida";
    state.notes = pcCopy.notes || "";
    state.targetUrl = pcCopy.targetUrl || "";
    
    if (pcCopy.inputs) {
      Object.keys(state.inputs).forEach(k => {
        if (pcCopy.inputs[k] !== undefined) {
          state.inputs[k] = pcCopy.inputs[k];
        }
      });
    }
  } else {
    try {
      const saved = localStorage.getItem("copywriting-assistant-state");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.activeFramework) state.activeFramework = parsed.activeFramework;
        if (parsed.notes) state.notes = parsed.notes;
        if (parsed.targetUrl) state.targetUrl = parsed.targetUrl;
        if (parsed.inputs) {
          Object.keys(state.inputs).forEach(k => {
            if (parsed.inputs[k] !== undefined) state.inputs[k] = parsed.inputs[k];
          });
        }
      }
    } catch (e) {
      // localStorage fallback
    }
  }
}

// Used only by the Download PDF builder below - output copy/notes are
// plain text (typed by whoever's using the tool), so this has to be
// escaped before going into the exported document's innerHTML the same
// way any other untrusted-ish string would be.
function escapeHtmlCopy(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function saveState() {
  if (isEmbedded && parentClient) {
    parentClient.copywriting.activeFramework = state.activeFramework;
    parentClient.copywriting.notes = state.notes;
    parentClient.copywriting.inputs = { ...state.inputs };
    parentClient.copywriting.targetUrl = state.targetUrl;
    window.parent.saveDatabase();
  } else {
    try {
      localStorage.setItem("copywriting-assistant-state", JSON.stringify(state));
    } catch (e) {}
  }
}

/* ── DOM Elements ───────────────────────────────────────────── */
const elements = {
  targetUrlInput: document.getElementById("targetUrlInput"),
  resetInputsBtn: document.getElementById("resetInputsBtn"),
  valFramework: document.getElementById("val-framework"),
  valInputs: document.getElementById("val-inputs"),
  valWords: document.getElementById("val-words"),
  inputProduct: document.getElementById("inputProduct"),
  inputAudience: document.getElementById("inputAudience"),
  inputBenefit: document.getElementById("inputBenefit"),
  inputCta: document.getElementById("inputCta"),
  selectTone: document.getElementById("selectTone"),
  tabButtons: document.querySelectorAll(".tab-btn"),
  activeFrameworkTitle: document.getElementById("activeFrameworkTitle"),
  outputCopy: document.getElementById("outputCopy"),
  workspaceNotes: document.getElementById("workspaceNotes"),
  charCount: document.getElementById("charCount"),
  wordCount: document.getElementById("wordCount"),
  copyBtn: document.getElementById("copyBtn"),
  downloadTxtBtn: document.getElementById("downloadTxtBtn"),
  downloadPdfBtn: document.getElementById("downloadPdfBtn")
};

/* ── Renderers ──────────────────────────────────────────────── */
function renderInputs() {
  elements.inputProduct.value = state.inputs.product;
  elements.inputAudience.value = state.inputs.audience;
  elements.inputBenefit.value = state.inputs.benefit;
  elements.inputCta.value = state.inputs.cta;
  elements.selectTone.value = state.inputs.tone;
}

function renderOutputCopy() {
  const framework = COPY_TEMPLATES[state.activeFramework];
  if (!framework) return;

  elements.activeFrameworkTitle.textContent = `${framework.name} output`;

  // Generate output copy text
  let copyText = framework.generate(
    state.inputs.product,
    state.inputs.audience,
    state.inputs.benefit,
    state.inputs.cta
  );

  // Apply tone modifier if witty/bold/casual (simulated modifications)
  copyText = applyToneModifier(copyText, state.inputs.tone);

  elements.outputCopy.value = copyText;
  updateCounters(copyText);
}

function applyToneModifier(text, tone) {
  // Simple post-processing tone modifications to give realistic tone feel
  switch (tone) {
    case "witty":
      return text.replace(/Are you/g, "Is your brain melting trying to").replace(/Click below to/g, "Tap that shiny button to 💥");
    case "bold":
      return text.toUpperCase().replace(/📢 ATTENTION:/g, "💥 WAKE UP:").replace(/🚀 ACTION:/g, "⚡ ACT NOW:");
    case "casual":
      return text.replace(/Hey/g, "Yo, what's up").replace(/succeed/g, "do your thing").replace(/experience the difference/g, "see how it goes");
    default:
      return text;
  }
}

function updateCounters(text) {
  const charLength = text.length;
  const wordLength = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  elements.charCount.textContent = `Chars: ${charLength}`;
  elements.wordCount.textContent = `Words: ${wordLength}`;
}

function renderWorkspaceNotes() {
  elements.workspaceNotes.value = state.notes;
}

function updateScoreCards() {
  if (elements.valFramework) {
    elements.valFramework.textContent = state.activeFramework.toUpperCase();
  }
  
  if (elements.valInputs) {
    let filled = 0;
    const fields = ["product", "audience", "benefit", "cta"];
    fields.forEach(f => {
      if (state.inputs[f] && state.inputs[f].trim() !== "") {
        filled++;
      }
    });
    elements.valInputs.textContent = `${filled}/4`;
  }
  
  if (elements.valWords) {
    const text = state.notes || "";
    const wordLength = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
    elements.valWords.textContent = wordLength;
  }
}

/* ── Event Handlers ─────────────────────────────────────────── */
function bindEvents() {
  // Target URL input
  if (elements.targetUrlInput) {
    elements.targetUrlInput.value = state.targetUrl || "";
    elements.targetUrlInput.addEventListener("input", (e) => {
      state.targetUrl = e.target.value.trim();
      saveState();
      if (isEmbedded) {
        window.parent.renderDashboard();
      }
    });
  }

  // Inputs change
  ["inputProduct", "inputAudience", "inputBenefit", "inputCta"].forEach(id => {
    const el = elements[id];
    if (el) {
      el.addEventListener("input", (e) => {
        const field = id.replace("input", "").toLowerCase();
        state.inputs[field] = e.target.value;
        saveState();
        renderOutputCopy();
        updateScoreCards();
      });
    }
  });

  // Tone selector
  if (elements.selectTone) {
    elements.selectTone.addEventListener("change", (e) => {
      state.inputs.tone = e.target.value;
      saveState();
      renderOutputCopy();
      updateScoreCards();
    });
  }

  // Tab Buttons (Framework change)
  elements.tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      elements.tabButtons.forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      state.activeFramework = btn.getAttribute("data-framework");
      saveState();
      renderOutputCopy();
      updateScoreCards();
    });
  });

  // Workspace Notes scratchpad change
  if (elements.workspaceNotes) {
    elements.workspaceNotes.addEventListener("input", (e) => {
      state.notes = e.target.value;
      saveState();
      updateScoreCards();
      if (isEmbedded) {
        window.parent.renderDashboard();
      }
    });
  }

  // Copy output text
  if (elements.copyBtn) {
    elements.copyBtn.addEventListener("click", () => {
      const text = elements.outputCopy.value;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          showFeedback(elements.copyBtn, "Copied!");
        }).catch(() => {
          fallbackCopyText(text);
        });
      } else {
        fallbackCopyText(text);
      }
    });
  }

  // Download txt file
  if (elements.downloadTxtBtn) {
    elements.downloadTxtBtn.addEventListener("click", () => {
      const text = elements.outputCopy.value + "\n\n=== SCRATCHPAD NOTES ===\n\n" + elements.workspaceNotes.value;
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Copywriting_Draft_${state.activeFramework.toUpperCase()}_${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showFeedback(elements.downloadTxtBtn, "Saved!");
    });
  }

  // Download PDF - a real leave-behind/shareable document, unlike Save
  // TXT above (plain text is fine internally, but not something you'd
  // hand a lead or drop into a polished deck). Output is plain text
  // already (not markdown, unlike most of the Hub's other copy-building
  // tools), so this just drops outputCopy's value in as a paragraph
  // rather than parsing it as markdown.
  // Oct 2026 rebuild: switched from html2canvas/html2pdf to the shared
  // RevitalPDF module.
  if (elements.downloadPdfBtn) {
    elements.downloadPdfBtn.addEventListener("click", () => {
      const btn = elements.downloadPdfBtn;
      if (typeof window.RevitalPDF === 'undefined') {
        alert('PDF generator library failed to load. Please check your internet connection or disable ad-blockers.');
        return;
      }
      btn.disabled = true;
      const origHtml = btn.innerHTML;
      btn.innerHTML = "<span>Generating...</span>";

      const frameworkTitle = (elements.activeFrameworkTitle && elements.activeFrameworkTitle.textContent) || state.activeFramework.toUpperCase();
      const productLabel = state.inputs.product || "Copywriting Draft";
      const clientName = (isEmbedded && parentClient && parentClient.name) ? parentClient.name : "";
      const copyText = elements.outputCopy.value || "(No copy generated yet.)";
      const notesText = (elements.workspaceNotes.value || "").trim();

      try {
        const r = RevitalPDF.create({ reportTitle: 'COPYWRITING DRAFT', companyName: clientName || 'Client' });
        const C = r.colors;

        r.coverPage({
          title: productLabel,
          subLine: `Framework: ${frameworkTitle}` + (clientName ? `   |   Client: ${clientName}` : '') + `   |   ${new Date().toLocaleDateString()}`,
        });

        r.newPage();
        r.sectionHeader(productLabel);
        r.paragraph(copyText, { spaceAfter: 16 });

        if (notesText) {
          r.sectionHeader('Scratchpad Notes');
          r.paragraph(notesText, { color: C.GRAY, spaceAfter: 10 });
        }

        r.save(`Copywriting_${productLabel.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      } catch (e) {
        console.error("PDF error:", e);
        alert("Something went wrong generating the PDF: " + (e && e.message ? e.message : e));
      }

      btn.disabled = false;
      btn.innerHTML = origHtml;
    });
  }

  // Reset inputs button
  if (elements.resetInputsBtn) {
    elements.resetInputsBtn.addEventListener("click", () => {
      if (!confirm("Are you sure you want to reset all input details and notes? This cannot be undone.")) return;
      state.inputs.product = "";
      state.inputs.audience = "";
      state.inputs.benefit = "";
      state.inputs.cta = "";
      state.inputs.tone = "persuasive";
      state.activeFramework = "aida";
      state.notes = "";
      state.targetUrl = "";
      
      saveState();
      
      // Update UI elements
      renderInputs();
      renderWorkspaceNotes();
      renderOutputCopy();
      updateScoreCards();
      
      if (elements.targetUrlInput) {
        elements.targetUrlInput.value = "";
      }
      
      // Select the AIDA tab visually
      elements.tabButtons.forEach(btn => {
        const fw = btn.getAttribute("data-framework");
        if (fw === "aida") {
          btn.classList.add("active");
          btn.setAttribute("aria-selected", "true");
        } else {
          btn.classList.remove("active");
          btn.setAttribute("aria-selected", "false");
        }
      });
      
      // Update parent dashboard if embedded
      if (isEmbedded) {
        window.parent.renderDashboard();
      }
    });
  }
}

function fallbackCopyText(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed"; // Avoid scrolling to bottom
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    showFeedback(elements.copyBtn, "Copied!");
  } catch (err) {
    console.error('Fallback copy failed', err);
  }
  document.body.removeChild(textArea);
}

function showFeedback(button, message) {
  const span = button.querySelector("span");
  const origText = span.textContent;
  span.textContent = message;
  button.classList.add("success-state");
  setTimeout(() => {
    span.textContent = origText;
    button.classList.remove("success-state");
  }, 2000);
}

/* ── App Initialization ─────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  initState();
  renderInputs();
  renderWorkspaceNotes();
  renderOutputCopy();
  updateScoreCards();
  bindEvents();
});