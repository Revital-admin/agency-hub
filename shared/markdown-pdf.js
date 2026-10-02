/* ============================================================
   shared/markdown-pdf.js — renders the Hub's own hand-authored markdown
   (the kind built by buildXMarkdown()-style functions across the
   doc/brief tools - creative-strategy-builder, content-strategy-builder,
   content-strategy-guide, campaign-launch-checklist, kickoff-prep,
   ninety-day-plan, client-welcome-guide, intake-request, ad-campaign-brief,
   etc.) into a RevitalPDF report, instead of handing that markdown to
   marked.parse() + an HTML container for html2canvas/html2pdf to
   screenshot (see shared/pdf-report.js for why that approach was
   replaced everywhere in the Hub, Oct 2026).

   This is NOT a general CommonMark renderer - it only understands the
   small, consistent subset of markdown these tools actually emit:
     # Title                     -> ignored (caller supplies the title to
                                     r.coverPage separately; these
                                     functions already strip this line
                                     before calling marked.parse() too)
     ## Section Header           -> r.sectionHeader()
     **Label:** value            -> bold label line + paragraph
     **Label:** value (no \n)    -> same, inline on one line if short
     - list item                 -> collected into r.bulletList()
     - **bold lead** — rest      -> bullet with a bold lead word/phrase
                                     (rendered as plain text - jsPDF
                                     bulletList doesn't support inline
                                     bold, so the ** markers are stripped)
     *italic line*               -> small italic paragraph (used for the
                                     "Generated via Revital Hub - ..."
                                     footers every one of these tools ends
                                     with)
     ---                         -> skipped (horizontal rule)
     blank line                  -> skipped (spacing handled by spaceAfter)
     anything else               -> plain paragraph

   Usage:
     const r = RevitalPDF.create({ reportTitle: '...', companyName });
     r.coverPage({ title: '...', ... });
     r.newPage();
     RevitalMarkdownPDF.render(r, markdownBodyWithLeadingTitleLineStripped);
     r.save('....pdf');
   ============================================================ */
(function (global) {
  function stripInline(s) {
    // Strip the markdown emphasis markers these tools use - **bold** and
    // *italic* - since jsPDF's bulletList/paragraph draw plain strings.
    return (s || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|[^*])\*([^*]+)\*($|[^*])/g, '$1$2$3').trim();
  }

  function render(r, markdown) {
    const lines = (markdown || '').split('\n');
    let bulletBuffer = [];

    function flushBullets() {
      if (bulletBuffer.length) {
        r.bulletList(bulletBuffer.map(stripInline));
        bulletBuffer = [];
      }
    }

    lines.forEach(function (raw) {
      const line = raw.trim();

      if (!line) return; // blank line - spacing handled by spaceAfter
      if (line === '---') { flushBullets(); return; }
      if (/^#\s+/.test(line)) { flushBullets(); return; } // H1 title - caller owns this

      if (/^##\s+/.test(line)) {
        flushBullets();
        r.sectionHeader(stripInline(line.replace(/^##\s+/, '')));
        return;
      }

      if (/^-\s+/.test(line)) {
        bulletBuffer.push(line.replace(/^-\s+/, ''));
        return;
      }
      flushBullets();

      // "**Label:** value" - the dominant pattern in these tools' markdown
      const labelMatch = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
      if (labelMatch) {
        r.paragraph(labelMatch[1], { bold: true, size: 10, spaceAfter: 3 });
        r.paragraph(labelMatch[2] || '—', { spaceAfter: 10 });
        return;
      }

      // "*italic line*" - used for the "Generated via..." footer
      const italicMatch = line.match(/^\*(.+)\*$/);
      if (italicMatch) {
        r.paragraph(italicMatch[1], { italic: true, size: 8.5, color: r.colors.GRAY, spaceAfter: 10 });
        return;
      }

      // Bold-only line, e.g. "**Some Heading**" with nothing after the colon
      const boldOnlyMatch = line.match(/^\*\*(.+)\*\*$/);
      if (boldOnlyMatch) {
        r.paragraph(boldOnlyMatch[1], { bold: true, size: 10.5, spaceAfter: 8 });
        return;
      }

      r.paragraph(stripInline(line), { spaceAfter: 10 });
    });

    flushBullets();
  }

  global.RevitalMarkdownPDF = { render: render };
})(window);
