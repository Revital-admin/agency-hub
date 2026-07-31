/* ============================================================
   SHARED IMAGE DROP ZONE HELPER
   Drag-and-drop + click-to-browse image handling, shared by any
   module that accepts an image (logo, mood board reference, case
   study photo, brand guideline asset, etc.) so the validation/
   compression logic lives in one place instead of being copy-pasted
   per module. Originally written for Client Portal Manager's logo
   upload; generalized here for reuse.

   Validates the file's real bytes (not just file.type, which is
   trivially spoofed by renaming any file), rejects oversized files,
   and compresses down to a small base64 JPEG data URL — small enough
   to live inline in a Firestore document field instead of needing
   Firebase Storage / a separate upload pipeline.
   ============================================================ */

const SHARED_ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const SHARED_IMAGE_SIGNATURES = [
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  // WEBP: "RIFF" .... "WEBP"
  { type: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], extra: { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 } }
];

function _sharedMatchesSignature(bytes, sig) {
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

function _sharedDetectImageType(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer.slice(0, 16));
  for (const sig of SHARED_IMAGE_SIGNATURES) {
    if (_sharedMatchesSignature(bytes, sig)) return sig.type;
  }
  return null;
}

/**
 * Validate + compress an image file into a data URL.
 * opts: { maxSizeBytes (default 5MB), maxWidth (default 800) }
 * Returns a Promise<string dataUrl>, rejecting with a user-facing
 * error message string on failure.
 */
function processImageFile(file, opts = {}) {
  const maxSizeBytes = opts.maxSizeBytes || 5 * 1024 * 1024;
  const maxWidth = opts.maxWidth || 800;

  return new Promise((resolve, reject) => {
    if (!file) { reject("No file given."); return; }

    if (file.size > maxSizeBytes) {
      reject(`File too large (max ${Math.round(maxSizeBytes / (1024 * 1024))}MB).`);
      return;
    }
    if (!SHARED_ALLOWED_IMAGE_TYPES.includes(file.type)) {
      reject("Unsupported file type. Please use a PNG, JPG, or WEBP image.");
      return;
    }

    const sigReader = new FileReader();
    sigReader.onload = (sigEvent) => {
      const detectedType = _sharedDetectImageType(sigEvent.target.result);
      if (!detectedType) {
        reject("That file isn't a valid image.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          // JPEG at 0.85 quality keeps file size down; PNGs with
          // transparency (e.g. logos) still come through readable, just
          // flattened onto white - acceptable tradeoff for reference
          // images. Callers needing true transparency (Client Portal
          // Manager's logo) should pass { keepPng: true }.
          const mime = opts.keepPng ? "image/png" : "image/jpeg";
          const quality = opts.keepPng ? undefined : 0.85;
          resolve(canvas.toDataURL(mime, quality));
        };
        img.onerror = () => reject("Couldn't read that image. It may be corrupted.");
        img.src = e.target.result;
      };
      reader.onerror = () => reject("Couldn't read that file.");
      reader.readAsDataURL(file);
    };
    sigReader.onerror = () => reject("Couldn't read that file.");
    sigReader.readAsArrayBuffer(file.slice(0, 16));
  });
}

/**
 * Wire up drag-and-drop + click-to-browse on a drop zone element.
 * Calls onFile(file) once per valid file the user drops or selects —
 * the caller is responsible for calling processImageFile() on it and
 * handling the result/errors.
 *
 * Multi-file support: if fileInputEl has the `multiple` attribute set,
 * every file in the drop/selection is passed to onFile (once each) -
 * lets a caller drag a whole batch of images in one go instead of
 * repeating the action per file. Callers that want the original
 * single-file-only behavior (e.g. a logo upload that replaces, not
 * appends) simply leave `multiple` off their <input>, unchanged from
 * before this was added.
 */
function wireDropZone(zoneEl, fileInputEl, onFile) {
  if (!zoneEl || !fileInputEl) return;

  const allowsMultiple = fileInputEl.hasAttribute("multiple");

  function dispatchFiles(fileList) {
    if (!fileList || !fileList.length) return;
    if (allowsMultiple) {
      Array.from(fileList).forEach(f => onFile(f));
    } else if (fileList[0]) {
      onFile(fileList[0]);
    }
  }

  zoneEl.addEventListener("click", () => fileInputEl.click());

  zoneEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    zoneEl.classList.add("dragover");
  });

  zoneEl.addEventListener("dragleave", (e) => {
    e.preventDefault();
    zoneEl.classList.remove("dragover");
  });

  zoneEl.addEventListener("drop", (e) => {
    e.preventDefault();
    zoneEl.classList.remove("dragover");
    dispatchFiles(e.dataTransfer.files);
  });

  fileInputEl.addEventListener("change", (e) => {
    dispatchFiles(e.target.files);
    fileInputEl.value = ""; // allow re-selecting the same file(s) again later
  });
}
