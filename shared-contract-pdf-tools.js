/* ============================================================
   SHARED CONTRACT PDF TOOLS
   R2 upload/delete + the DocuSign signature-anchor auto-detection
   heuristic, shared by any tool that uploads PDFs into the shared
   agency/contractTemplates library (currently Contract & Invoice
   Tracker's client-facing templates, and Team Roster's contractor
   documents - both read/write the SAME Firestore doc, and until this
   file existed each had its own byte-for-byte copy of everything
   below). Consolidated so a future fix to the anchor-detection
   heuristic, or the R2 upload/delete calls, only has to be made once.

   Requires pdf.js and pdf-lib to already be loaded on the page (each
   including tool's index.html loads those - this file doesn't load
   them itself, since load order/versions are the including page's
   call). Include this AFTER pdf.js/pdf-lib and BEFORE the tool's own
   js/app.js.
   ============================================================ */

// ── R2 upload / delete (agency/contractTemplates library storage) ──

async function uploadPdfToR2(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/contracts', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || `Upload failed (${res.status})`);
  return data.key;
}

// Same as uploadPdfToR2 but for bytes already processed in-memory (e.g.
// the anchor-tagged version) rather than a raw File object.
async function uploadBytesToR2(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const form = new FormData();
  form.append('file', blob, filename);
  const res = await fetch('/api/contracts', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || `Upload failed (${res.status})`);
  return data.key;
}

function deleteR2Object(key, label) {
  // Best-effort cleanup - if this fails, an orphaned object is left in
  // R2, which costs a few cents of storage but breaks nothing, so it's
  // not worth blocking or surfacing an error over.
  if (!key) return;
  // label (optional) is the caller's human-readable name for this file
  // (e.g. "Master Service Agreement") - passed through as a query param
  // so handleContractDelete in _worker.js can attach it to the backup
  // copy it makes before actually deleting, for the Recently Deleted
  // restore panel. Purely cosmetic - deletion/backup still work fine
  // without it, just showing the raw key instead of a name.
  const url = '/api/contracts/' + encodeURIComponent(key) + (label ? '?label=' + encodeURIComponent(label) : '');
  fetch(url, { method: 'DELETE' }).catch(e => {
    console.warn('Could not delete old contract file from storage (non-fatal):', e);
  });
}

/* ── Auto-detect + bake DocuSign anchor tags on upload/replace ──
   Every contract seen so far follows the same signature-block layout:
   the Client (or "Individual"/Model/Property Owner/Contractor/etc.)
   signs in the LEFT column, Revital Productions signs in the RIGHT
   column, and the Client's column usually has one extra row
   (Title/Company), so its Date line sits lower on the page than
   Revital's. detectClientAnchors scans a PDF's text positions (via
   pdf.js) looking for that pattern on every page it appears on (a
   document can have more than one signature block - e.g. the Social
   Media Growth Agreement has both a main SIGNATURES page and a
   separate Appendix A acknowledgment page) and returns the exact
   coordinates for each. bakeAnchorsAtDetection then stamps real,
   invisible [[SIG_CLIENT]]/[[DATE_CLIENT]] text at those coordinates
   via pdf-lib - the same anchor strings every built-in and
   library-uploaded document uses, read by handleDocusignSendEnvelope
   in _worker.js. DocuSign places a tab at EVERY occurrence of a given
   anchor string in the document, so one signHereTabs/dateSignedTabs
   entry already covers all of them.

   This is a heuristic, not a guarantee - an unusually laid-out
   document could get the wrong result, which is exactly why a newly
   tagged entry is marked needsAnchorReview instead of being made
   DocuSign-eligible immediately (see each tool's review panel). If
   detection fails outright (pattern not found), the document is just
   uploaded as a normal flat PDF. */

let pdfjsWorkerConfigured = false;
function ensurePdfjsWorker() {
  if (pdfjsWorkerConfigured) return;
  const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  if (lib && lib.GlobalWorkerOptions) {
    lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    pdfjsWorkerConfigured = true;
  }
}

// Returns an ARRAY of detections, one per page that has a Client
// Signature/Date pair.
async function detectClientAnchors(bytes) {
  ensurePdfjsWorker();
  const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  if (!lib) return null;
  // .slice() - pdf.js's worker transport can transfer/detach the buffer
  // backing a Uint8Array passed as `data`, which would corrupt the
  // caller's original `bytes` before it gets used again for baking.
  const doc = await lib.getDocument({ data: bytes.slice() }).promise;
  const detections = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter(it => it.str && it.str.trim())
      .map(it => ({ str: it.str.trim(), x: it.transform[4], y: it.transform[5] }));

    // Exact "Signature"/"Date" matches first, since that's the clean
    // case - but some PDFs (notably OCR'd ones, where the OCR renderer
    // sometimes fuses adjacent words like "Client" + "Date" or "Client" +
    // "Signature" into a single text-showing operation) never produce a
    // standalone "Date"/"Signature" item at all. Falling back to items
    // that simply END with " Date"/" Signature" catches those fused
    // labels too, without weakening the exact match for documents where
    // it already works fine.
    const exactSig = items.filter(it => it.str === 'Signature');
    const fuzzySig = items.filter(it => it.str !== 'Signature' && it.str.endsWith(' Signature'));
    const sigItems = [...exactSig, ...fuzzySig];
    const exactDate = items.filter(it => it.str === 'Date');
    const fuzzyDate = items.filter(it => it.str !== 'Date' && it.str.endsWith(' Date'));
    const dateItems = [...exactDate, ...fuzzyDate];
    if (sigItems.length < 2 || dateItems.length < 2) continue;

    sigItems.sort((a, b) => a.x - b.x);
    const clientSig = sigItems[0];
    const midX = (sigItems[0].x + sigItems[sigItems.length - 1].x) / 2;

    // Same column as the client's Signature, and below it on the page
    // (smaller y = lower, since PDF y increases upward) - among those,
    // the LOWEST one, since the client's block usually runs one row
    // longer than Revital's.
    const leftDates = dateItems.filter(d => d.x < midX && d.y < clientSig.y);
    if (!leftDates.length) continue;
    leftDates.sort((a, b) => a.y - b.y);
    const clientDate = leftDates[0];

    detections.push({
      page: p - 1, // 0-indexed, matches pdf-lib's getPages()
      sigX: clientSig.x,
      sigY: clientSig.y,
      dateX: clientDate.x,
      dateY: clientDate.y
    });
  }
  return detections.length ? detections : null;
}

// Older saved entries stored a single {page,sigX,...} object rather than
// an array (from before a document could have multiple Client signature
// locations) - normalize both shapes to an array so every caller only
// has to handle one form.
function normalizeAnchorDetections(raw) {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

async function bakeAnchorsAtDetection(bytes, detections) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdfDoc = await PDFDocument.load(bytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const place = (page, text, x, y) => {
    page.drawText(text, { x, y, size: 1, font, color: rgb(1, 1, 1), opacity: 0 });
  };
  for (const detection of normalizeAnchorDetections(detections)) {
    const page = pages[detection.page];
    place(page, '[[SIG_CLIENT]]', detection.sigX, detection.sigY);
    place(page, '[[DATE_CLIENT]]', detection.dateX, detection.dateY);
  }
  return await pdfDoc.save();
}
