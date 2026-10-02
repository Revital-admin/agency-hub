/* ============================================================
   shared/checklist-pdf.js — reusable client-presentable PDF report
   builder for the "audit checklist" family of tools (SEO Audit,
   Content Audit, Paid Ads Audit, Email Marketing Audit, Social Media
   Audit, UX/UI Audit). Built on top of shared/pdf-report.js the same
   way website-competitor-analysis and social-competitor-analysis
   reuse it — this is the second shared module, extracted because six
   tools share the exact same STEPS/checked/notes data shape (Oct 2026
   PDF rollout, Batch A).

   Each of these tools used to export its own near-duplicate
   html2canvas/html2pdf implementation (and all shared the same latent
   bug: the steps loop referenced `sub.text`, a field that doesn't
   exist on the data model - it's `sub.label` - so every task row in
   the old PDF printed "undefined"). This rebuild fixes that as a
   side effect of replacing the renderer.

   Usage (see website-competitor-analysis/shared/pdf-report.js history
   for why jsPDF vector text replaced html2canvas/html2pdf):

     RevitalChecklistPDF.build({
       reportTitle: 'SEO AUDIT',            // shown in the page footer bar
       companyName: 'TheHighTable',
       title: 'SEO Audit Checklist',        // cover page H1
       targetLabel: 'Website',              // optional, e.g. "Website" / "Ad Account"
       targetValue: 'thehightable.com',
       dateVal: '2026-10-02',
       stats: { pct, doneTasks, totalTasks },
       metrics: [{ label: 'Total Pages Indexed', value: '1,240' }, ...],  // optional
       narrative: [                          // optional free-text sections
         { label: 'Key Content Opportunities', text: '...' },
         { label: 'Top 3 Immediate Actions', text: '1. ...\n2. ...', bulletize: true },
       ],
       STEPS: STEPS,                         // from that tool's js/data.js
       checked: state.checked,
       notes: state.notes,
       filename: 'SEO_Audit_TheHighTable.pdf',
     });
   ============================================================ */
(function (global) {
  function build(opts) {
    opts = opts || {};
    if (typeof global.RevitalPDF === 'undefined') {
      throw new Error('shared/pdf-report.js must be loaded before shared/checklist-pdf.js');
    }
    const companyName = opts.companyName || 'Client';
    const stats = opts.stats || { pct: 0, doneTasks: 0, totalTasks: 0 };
    const STEPS = opts.STEPS || [];
    const checked = opts.checked || {};
    const notes = opts.notes || {};

    const r = global.RevitalPDF.create({ reportTitle: opts.reportTitle || 'AUDIT REPORT', companyName: companyName });
    const doc = r.doc;
    const C = r.colors;

    // ---- COVER ----
    const subLineParts = [];
    if (opts.targetLabel && opts.targetValue) subLineParts.push(opts.targetLabel + ': ' + opts.targetValue);
    else if (opts.targetValue) subLineParts.push(opts.targetValue);
    if (opts.dateVal) subLineParts.push(opts.dateVal);

    r.coverPage({
      title: opts.title || 'Audit Report',
      subLine: subLineParts.join('   |   '),
      objective: opts.objective || (stats.pct + '% complete — ' + stats.doneTasks + ' of ' + stats.totalTasks + ' checklist items addressed.'),
      preparedFrom: opts.preparedFrom || ('Audit prepared for ' + companyName + '.'),
      note: opts.note || 'Note: this is a manual audit checklist synthesized from hands-on review, not an automated scan.',
    });

    // ---- EXECUTIVE OVERVIEW ----
    r.newPage();
    r.sectionHeader('Executive Overview');
    r.calloutBox('Overall Completion', stats.pct + '% complete (' + stats.doneTasks + ' of ' + stats.totalTasks + ' items addressed).');

    if (opts.metrics && opts.metrics.length) {
      r.paragraph('At a glance', { bold: true, size: 10.5, spaceAfter: 6 });
      r.tableBlock(
        ['Metric', 'Value'],
        opts.metrics.map(function (m) { return [m.label, (m.value || '').trim() || '—']; }),
        [r.CONTENT_W * 0.5, r.CONTENT_W * 0.5]
      );
    }

    (opts.narrative || []).forEach(function (n) {
      if (!n.text || !n.text.trim()) return;
      r.paragraph(n.label, { bold: true, size: 10.5, spaceAfter: 6 });
      if (n.bulletize) {
        r.bulletList(n.text.trim().split('\n').map(function (s) { return s.trim(); }).filter(Boolean));
      } else {
        r.paragraph(n.text.trim(), { spaceAfter: 10 });
      }
    });

    // ---- AUDIT FINDINGS ----
    r.newPage();
    r.sectionHeader('Audit Findings');

    STEPS.forEach(function (step, idx) {
      r.ensureSpace(50);
      doc.setFillColor.apply(doc, C.DARK);
      doc.rect(r.MARGIN, r.y, r.CONTENT_W, 22, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor.apply(doc, C.WHITE);
      doc.text(r.sanitizeText('Step ' + (idx + 1) + ': ' + step.title), r.MARGIN + 10, r.y + 15);
      const done = step.subs.filter(function (s) { return checked[s.id]; }).length;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(done + '/' + step.subs.length + ' complete', r.MARGIN + r.CONTENT_W - 10, r.y + 15, { align: 'right' });
      r.y = r.y + 22 + 10;

      step.subs.forEach(function (sub) {
        const isChecked = !!checked[sub.id];
        const note = (notes[sub.id] || '').trim();
        const statusLabel = isChecked ? 'PASS' : 'ACTION REQUIRED';
        const statusColor = isChecked ? C.GREEN : C.ACCENT;

        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        const labelLines = doc.splitTextToSize(r.sanitizeText(sub.label), r.CONTENT_W - 110);
        let h = labelLines.length * 13 + 6;
        let descLines = [];
        if (!isChecked && sub.desc) {
          doc.setFontSize(8.5);
          descLines = doc.splitTextToSize(r.sanitizeText(sub.desc), r.CONTENT_W - 14);
          h += descLines.length * 11 + 6;
        }
        let noteLines = [];
        if (note) {
          doc.setFontSize(8.5);
          noteLines = doc.splitTextToSize(r.sanitizeText('Note: ' + note), r.CONTENT_W - 28);
          h += noteLines.length * 11 + 14;
        }
        r.ensureSpace(h + 14);

        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, C.DARK);
        doc.text(labelLines, r.MARGIN, r.y + 9);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor.apply(doc, statusColor);
        doc.text(statusLabel, r.MARGIN + r.CONTENT_W, r.y + 9, { align: 'right' });
        r.y += labelLines.length * 13 + 4;

        if (descLines.length) {
          doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, C.GRAY);
          doc.text(descLines, r.MARGIN + 12, r.y);
          r.y += descLines.length * 11 + 6;
        }

        if (noteLines.length) {
          const noteH = noteLines.length * 11 + 10;
          doc.setFillColor.apply(doc, C.CREAM);
          doc.rect(r.MARGIN, r.y, r.CONTENT_W, noteH, 'F');
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, C.DARK);
          doc.text(noteLines, r.MARGIN + 10, r.y + 12);
          r.y += noteH + 6;
        }

        doc.setDrawColor(226, 232, 240);
        doc.line(r.MARGIN, r.y, r.MARGIN + r.CONTENT_W, r.y);
        r.y += 10;
      });

      r.y += 6;
    });

    r.save(opts.filename || ((companyName.replace(/[^a-z0-9]+/gi, '_') || 'Client') + '_Audit_Report.pdf'));
  }

  global.RevitalChecklistPDF = { build: build };
})(window);
