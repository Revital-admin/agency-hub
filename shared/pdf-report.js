/* ============================================================
   shared/pdf-report.js — reusable client-presentable PDF report builder
   ============================================================
   Oct 2026: every tool in the Hub used to build its own "Download PDF"
   by screenshotting the editing UI with html2canvas/html2pdf. That
   approach had two confirmed, unfixable-at-the-config-level bugs: (1)
   html2canvas's backgroundColor option was silently ignored by the
   bundled version, so anything without its own opaque CSS background
   rendered white-on-white; (2) html2canvas sliced one long screenshot
   across PDF pages with zero awareness of content boundaries, so
   paragraphs and table cells got cut mid-sentence at page breaks.

   This module replaces that entirely with native jsPDF vector text,
   first proven out in website-competitor-analysis (see that tool's
   app.js for the original, confirmed-working implementation this was
   extracted from). Real text with real pagination logic can't suffer
   either failure mode, and it produces an actual client-presentable
   report - cover page, section headers, callouts, tables - instead of
   a screenshot of the internal editing form.

   Usage (each tool's own downloadPDF() calls this, then adds its own
   content using the returned helpers - see website-competitor-analysis/
   js/app.js for a full worked example):

     const r = RevitalPDF.create({ reportTitle: 'SOME TOOL NAME', companyName });
     r.coverPage({ title: 'Some Tool Name', eyebrow: 'CATEGORY LABEL', subLine: '...' , objective: '...' });
     r.newPage();
     r.sectionHeader('Executive Overview');
     r.paragraph('...', { italic: true, color: r.colors.GRAY });
     r.calloutBox('Core Finding', '...');
     r.tableBlock(['Col A','Col B'], [['x','y']], [w1, w2]);
     r.bulletList(['...', '...']);
     r.save('Some_Report.pdf');

   Depends on jsPDF being loaded first (window.jspdf.jsPDF) - each tool's
   index.html must include the jsPDF CDN script before its own app.js:
     <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
   ============================================================ */
(function (global) {
  function create(opts) {
    opts = opts || {};
    if (typeof global.jspdf === 'undefined' || !global.jspdf.jsPDF) {
      throw new Error('jsPDF failed to load. Check your internet connection or disable ad-blockers.');
    }
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });

    const PAGE_W = 612, PAGE_H = 792;
    const MARGIN = 54;
    const CONTENT_W = PAGE_W - MARGIN * 2;
    let y = MARGIN;
    let pageNum = 1;
    let startedFirstPage = false;

    // Revital brand palette (matches the live Hub's own dark theme:
    // --bg-sidebar #1a1a17, --primary #f68d5f - see root style.css :root).
    const DARK = [26, 26, 23];
    const ACCENT = [246, 141, 95];
    const CREAM = [250, 243, 237];
    const GRAY = [110, 108, 100];
    const LIGHT = [240, 219, 204];
    const WHITE = [255, 255, 255];
    const GREEN = [62, 122, 76], RED = [176, 69, 59], BLUE = [59, 111, 160], PINK = [163, 76, 116];

    const reportTitle = (opts.reportTitle || 'REPORT').toUpperCase();
    const companyName = opts.companyName || 'Client';

    // jsPDF's standard fonts (Helvetica etc.) use WinAnsiEncoding (cp1252),
    // which happens to special-case common "smart" punctuation - em/en
    // dashes, curly quotes, the bullet, ellipsis - so those render fine.
    // Arrows, checkmarks, emoji, and most other symbols outside Latin-1 are
    // NOT in that encoding and silently render as garbage characters (found
    // Oct 2026 via a real content-audit item containing "→", which rendered
    // as "!'" in the PDF). Replace the common offenders with ASCII
    // equivalents and strip anything else outside the supported range
    // before it ever reaches doc.text()/splitTextToSize().
    const ARROW_MAP = {
      '→': '->', '←': '<-', '↔': '<->',
      '⇒': '=>', '⇐': '<=', '⇔': '<=>',
      '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x',
    };
    function sanitizeText(s) {
      if (s === null || s === undefined) return s;
      if (Array.isArray(s)) return s.map(sanitizeText);
      // NOTE: astral-plane emoji (outside the Basic Multilingual Plane, e.g.
      // U+1F300+) aren't stripped here - matching them correctly requires
      // the regex /u flag with \u{...} syntax, and a plain 4-digit \uXXXX
      // escape for a 5-digit code point silently misparses into a stray
      // literal character plus a huge unintended range (this broke the
      // first version of this function - it deleted almost all ASCII text).
      // Arrows/checkmarks (the actual bug this was written for) and BMP
      // dingbats/misc-technical symbols are covered; that's the known
      // real-world case so far.
      return String(s)
        .replace(/[←-⇿✓✔✗✘]/g, function (ch) { return ARROW_MAP[ch] || ''; })
        .replace(/[⌀-➿]/g, ''); // misc technical / dingbats (BMP only)
    }

    function footer() {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, GRAY);
      doc.text(companyName.toUpperCase() + '   |   ' + pageNum, PAGE_W - MARGIN, PAGE_H - 30, { align: 'right' });
      doc.text(reportTitle, MARGIN, PAGE_H - 30);
    }
    function newPage() {
      if (startedFirstPage) {
        footer();
        doc.addPage();
        pageNum++;
      }
      startedFirstPage = true;
      y = MARGIN;
    }
    function ensureSpace(h) {
      if (y + h > PAGE_H - MARGIN - 16) newPage();
    }
    function sectionHeader(title) {
      title = sanitizeText(title);
      ensureSpace(70);
      doc.setFillColor.apply(doc, DARK);
      doc.rect(MARGIN, y, CONTENT_W * 0.62, 24, 'F');
      doc.setFillColor.apply(doc, ACCENT);
      doc.rect(MARGIN + CONTENT_W * 0.62, y, CONTENT_W * 0.38, 24, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.setTextColor.apply(doc, WHITE);
      doc.text(reportTitle, MARGIN + 10, y + 15.5);
      doc.setTextColor.apply(doc, DARK);
      doc.text(('PREPARED FOR ' + companyName).toUpperCase().slice(0, 48), MARGIN + CONTENT_W * 0.62 + 10, y + 15.5);
      y += 24 + 20;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(21); doc.setTextColor.apply(doc, DARK);
      doc.text(title, MARGIN, y);
      y += 6;
      doc.setDrawColor.apply(doc, ACCENT); doc.setLineWidth(1.5);
      doc.line(MARGIN, y + 6, MARGIN + CONTENT_W, y + 6);
      y += 26;
    }
    function paragraph(text, o) {
      text = sanitizeText(text);
      o = o || {};
      const size = o.size || 10;
      doc.setFont('helvetica', o.bold ? 'bold' : (o.italic ? 'italic' : 'normal'));
      doc.setFontSize(size);
      doc.setTextColor.apply(doc, o.color || DARK);
      const width = o.width || CONTENT_W;
      const x = o.x || MARGIN;
      const lines = doc.splitTextToSize(text, width);
      const lh = size * 1.42;
      ensureSpace(lines.length * lh + 6);
      doc.text(lines, x, y);
      y += lines.length * lh + (o.spaceAfter !== undefined ? o.spaceAfter : 10);
    }
    function calloutBox(label, text, accent) {
      label = sanitizeText(label); text = sanitizeText(text);
      accent = accent || ACCENT;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      const bodyLines = doc.splitTextToSize(text, CONTENT_W - 30);
      const boxH = 30 + bodyLines.length * 13.5 + 8;
      ensureSpace(boxH + 14);
      doc.setFillColor.apply(doc, CREAM);
      doc.rect(MARGIN, y, CONTENT_W, boxH, 'F');
      doc.setFillColor.apply(doc, accent);
      doc.rect(MARGIN, y, 3.5, boxH, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.setTextColor.apply(doc, accent);
      doc.text(label.toUpperCase(), MARGIN + 14, y + 17);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.setTextColor.apply(doc, DARK);
      doc.text(bodyLines, MARGIN + 14, y + 33);
      y += boxH + 16;
    }
    function bulletList(items, o) {
      items = (items || []).map(sanitizeText);
      o = o || {};
      doc.setFont('helvetica', 'normal'); doc.setFontSize(o.size || 10);
      // Lookahead: reserve space for the whole list where reasonably possible
      // so a single short bullet doesn't get stranded alone at the top of a
      // fresh page just because the group as a whole didn't fit.
      const totalEstimate = items.reduce(function(sum, item) {
        const lines = doc.splitTextToSize(item, CONTENT_W - 16);
        return sum + lines.length * 14 + 5;
      }, 0);
      if (totalEstimate < PAGE_H - MARGIN * 2 - 40) ensureSpace(totalEstimate);
      items.forEach(function (item) {
        const lines = doc.splitTextToSize(item, CONTENT_W - 16);
        const lh = 14;
        ensureSpace(lines.length * lh + 4);
        doc.setTextColor.apply(doc, ACCENT);
        doc.text('•', MARGIN, y);
        doc.setTextColor.apply(doc, DARK);
        doc.text(lines, MARGIN + 14, y);
        y += lines.length * lh + 5;
      });
      y += 6;
    }
    function tableBlock(headers, rowsArr, colWidths) {
      headers = (headers || []).map(sanitizeText);
      rowsArr = (rowsArr || []).map(function (row) { return row.map(sanitizeText); });
      ensureSpace(26);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.setFillColor.apply(doc, DARK);
      doc.rect(MARGIN, y, CONTENT_W, 22, 'F');
      doc.setTextColor.apply(doc, WHITE);
      let cx = MARGIN + 8;
      headers.forEach(function (h, i) { doc.text(String(h).toUpperCase(), cx, y + 14); cx += colWidths[i]; });
      y += 22;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      rowsArr.forEach(function (r, ri) {
        const wrapped = r.map(function (cell, ci) { return doc.splitTextToSize(cell || '—', colWidths[ci] - 14); });
        const maxLines = Math.max.apply(null, wrapped.map(function (w) { return w.length; }));
        const rowH = Math.max(24, maxLines * 12.5 + 12);
        ensureSpace(rowH);
        if (ri % 2 === 1) { doc.setFillColor.apply(doc, CREAM); doc.rect(MARGIN, y, CONTENT_W, rowH, 'F'); }
        doc.setTextColor.apply(doc, DARK);
        cx = MARGIN + 8;
        wrapped.forEach(function (w, ci) { doc.text(w, cx, y + 14); cx += colWidths[ci]; });
        doc.setDrawColor.apply(doc, LIGHT); doc.setLineWidth(0.5);
        doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);
        y += rowH;
      });
      y += 16;
    }
    // Generic bordered box (SWOT quadrant, positioning cell, etc.) - caller
    // supplies x/width so these can be laid out in a 2-up (or N-up) grid.
    function quadrantBox(x, w, title, text, accent) {
      title = sanitizeText(title); text = sanitizeText(text);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      const bodyLines = doc.splitTextToSize(text || 'Not yet filled in.', w - 24);
      const boxH = 34 + bodyLines.length * 13;
      doc.setDrawColor.apply(doc, accent); doc.setLineWidth(1.2);
      doc.rect(x, y, w, boxH);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      doc.setTextColor.apply(doc, accent);
      doc.text(doc.splitTextToSize(title.toUpperCase(), w - 24), x + 12, y + 18);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.setTextColor.apply(doc, DARK);
      doc.text(bodyLines, x + 12, y + 34);
      return boxH;
    }
    // Two side-by-side quadrantBox calls sharing a row, returning the taller
    // height so the caller can advance y past both at once.
    function quadrantRow(items) {
      const gap = 14;
      const colW = (CONTENT_W - gap * (items.length - 1)) / items.length;
      let x = MARGIN;
      let maxH = 0;
      const rowTop = y;
      items.forEach(function (item) {
        y = rowTop;
        const h = quadrantBox(x, colW, item.title, item.text, item.accent);
        if (h > maxH) maxH = h;
        x += colW + gap;
      });
      y = rowTop + maxH;
    }
    function coverPage(o) {
      o = o || {};
      newPage();
      doc.setFillColor.apply(doc, DARK);
      doc.rect(MARGIN, 100, CONTENT_W, 92, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(25); doc.setTextColor.apply(doc, WHITE);
      doc.text(doc.splitTextToSize(sanitizeText(companyName.toUpperCase()), CONTENT_W - 40), MARGIN + 20, 100 + 38);
      doc.setFontSize(14); doc.setTextColor.apply(doc, ACCENT);
      doc.text(sanitizeText((o.title || reportTitle).toUpperCase()), MARGIN + 20, 100 + 62);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor.apply(doc, LIGHT);
      if (o.subLine) doc.text(sanitizeText(o.subLine), MARGIN + 20, 100 + 80);

      y = 100 + 92 + 50;
      if (o.objective) calloutBox('Objective', o.objective, ACCENT);
      if (o.preparedFrom) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor.apply(doc, DARK);
        doc.text('PREPARED FROM:', MARGIN, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        const lines = doc.splitTextToSize(sanitizeText(o.preparedFrom), CONTENT_W - 100);
        doc.text(lines, MARGIN + 92, y);
        y += lines.length * 13 + 10;
      }
      if (o.note) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, GRAY);
        doc.text(doc.splitTextToSize(sanitizeText(o.note), CONTENT_W), MARGIN, y);
      }
    }
    function save(filename) {
      footer();
      doc.save(filename);
    }

    return {
      doc: doc,
      colors: { DARK: DARK, ACCENT: ACCENT, CREAM: CREAM, GRAY: GRAY, LIGHT: LIGHT, WHITE: WHITE, GREEN: GREEN, RED: RED, BLUE: BLUE, PINK: PINK },
      PAGE_W: PAGE_W, PAGE_H: PAGE_H, MARGIN: MARGIN, CONTENT_W: CONTENT_W,
      get y() { return y; }, set y(v) { y = v; },
      newPage: newPage,
      ensureSpace: ensureSpace,
      sectionHeader: sectionHeader,
      paragraph: paragraph,
      calloutBox: calloutBox,
      bulletList: bulletList,
      tableBlock: tableBlock,
      quadrantBox: quadrantBox,
      quadrantRow: quadrantRow,
      coverPage: coverPage,
      save: save,
      sanitizeText: sanitizeText,
    };
  }

  global.RevitalPDF = { create: create };
})(window);
