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
  // Same letter bands the audit tools and the Overview Dashboard use.
  function gradeFromPct(pct) {
    if (pct >= 97) return 'A+'; if (pct >= 93) return 'A'; if (pct >= 90) return 'A-';
    if (pct >= 87) return 'B+'; if (pct >= 83) return 'B'; if (pct >= 80) return 'B-';
    if (pct >= 77) return 'C+'; if (pct >= 73) return 'C'; if (pct >= 70) return 'C-';
    if (pct >= 67) return 'D+'; if (pct >= 60) return 'D'; return 'F';
  }

  function build(opts) {
    opts = opts || {};
    if (typeof global.RevitalPDF === 'undefined') {
      throw new Error('shared/pdf-report.js must be loaded before shared/checklist-pdf.js');
    }
    const companyName = opts.companyName || 'Client';
    const STEPS = opts.STEPS || [];
    const checked = opts.checked || {};
    const failedMap = opts.failed || {};
    const notes = opts.notes || {};
    const lens = opts.lens || {};
    // mode 'progress' = to-do style checklists (Campaign Launch, Content Strategy Guide):
    // no pass/fail, no letter grade - unchecked items are simply still to do.
    const progress = opts.mode === 'progress';
    const stepNotes = lens.stepNotes || [];

    // Item states: PASS (checked) / NEEDS WORK (failed) / NOT REVIEWED (neither).
    // Grade = how WELL it's going (passed of reviewed); completion = how much is reviewed.
    function itemState(sub) {
      if (checked[sub.id]) return 'pass';
      if (failedMap[sub.id] && !progress) return 'fail';
      return 'open';
    }
    const analysed = STEPS.map(function (step, idx) {
      const subs = step.subs.map(function (sub) { return { sub: sub, state: itemState(sub) }; });
      const passed = subs.filter(function (x) { return x.state === 'pass'; });
      const failed = subs.filter(function (x) { return x.state === 'fail'; });
      const open = subs.filter(function (x) { return x.state === 'open'; });
      const reviewed = passed.length + failed.length;
      const rate = progress ? Math.round(passed.length / (subs.length || 1) * 100) : (reviewed ? Math.round(passed.length / reviewed * 100) : null);
      return { step: step, idx: idx, passed: passed, failed: progress ? open : failed, open: progress ? [] : open, reviewed: reviewed, rate: rate,
               grade: progress ? rate + '%' : (rate === null ? '-' : gradeFromPct(rate)), note: stepNotes[idx] || '' };
    });
    const total = analysed.reduce(function (n, a) { return n + a.step.subs.length; }, 0);
    const passedN = analysed.reduce(function (n, a) { return n + a.passed.length; }, 0);
    const failedN = analysed.reduce(function (n, a) { return n + a.failed.length; }, 0);
    const openN = progress ? 0 : total - passedN - failedN;
    const reviewedN = passedN + failedN;
    const passRate = progress ? Math.round(passedN / (total || 1) * 100) : (reviewedN ? Math.round(passedN / reviewedN * 100) : null);
    const completion = progress ? passRate : (total ? Math.round(reviewedN / total * 100) : 0);
    const overallGrade = progress ? passRate + '% complete' : (passRate === null ? 'Not graded yet' : gradeFromPct(passRate));

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
      objective: opts.objective || (progress ? (passRate + '% complete - ' + passedN + ' of ' + total + ' items done.') : passRate === null
        ? 'No items reviewed yet - ' + total + ' checklist items to assess.'
        : 'Overall grade ' + overallGrade + ' (' + passRate + '% of reviewed checks passed) - ' + reviewedN + ' of ' + total + ' items reviewed.'),
      preparedFrom: opts.preparedFrom || ('Audit prepared for ' + companyName + '.'),
      note: opts.note || 'Note: this is a manual audit checklist synthesized from hands-on review, not an automated scan.',
    });

    // ---- EXECUTIVE OVERVIEW ----
    r.newPage();
    r.sectionHeader('Executive Overview');
    if (lens.intro) r.paragraph(lens.intro, { size: 10.5, italic: true, color: C.GRAY, spaceAfter: 12 });
    if (progress) {
      r.calloutBox('Overall Progress', passedN + ' of ' + total + ' items complete (' + passRate + '%). ' + failedN + ' remaining.');
    } else r.calloutBox('Overall Grade',
      passRate === null
        ? 'Not graded yet - mark each checklist item Pass or Needs work to generate a grade.'
        : overallGrade + ' - ' + passedN + ' of ' + reviewedN + ' reviewed checks passed (' + passRate + '%). ' +
          failedN + ' need work' + (openN ? ', ' + openN + ' not reviewed yet' : '') + '. Review is ' + completion + '% complete.');

    // Auto-written bottom line from the real results
    const worst = analysed.filter(function (a) { return a.failed.length; })
      .sort(function (x, y) { return (x.rate - y.rate) || (y.failed.length - x.failed.length); });
    if (worst.length) {
      const top = worst.slice(0, 3).map(function (a) { return a.step.title.replace(/^\d+\.\s*/, '') + ' (' + a.failed.length + ')'; });
      r.calloutBox(progress ? 'Most work remaining' : 'Where to focus first', (progress ? 'Most items still to do: ' : 'Most issues sit in: ') + top.join('; ') + '.', progress ? C.ACCENT : C.RED);
    } else if (reviewedN) {
      r.calloutBox(progress ? 'Status' : 'Where to focus first', progress ? 'Every item is complete.' : 'No failing items flagged. ' + (openN ? 'Finish reviewing the remaining ' + openN + ' items to confirm.' : 'Every item passed.'), C.GREEN);
    }

    if (opts.metrics && opts.metrics.length) {
      r.paragraph('At a glance', { bold: true, size: 10.5, spaceAfter: 6 });
      r.tableBlock(
        ['Metric', 'Value'],
        opts.metrics.map(function (m) { return [m.label, (m.value || '').trim() || '-']; }),
        [r.CONTENT_W * 0.5, r.CONTENT_W * 0.5]
      );
    }

    (opts.narrative || []).forEach(function (n) {
      if (!n.text || !n.text.trim()) return;
      r.paragraph(n.label, { bold: true, size: 10.5, spaceAfter: 6 });
      if (n.bulletize) {
        r.bulletList(n.text.trim().split('\n').map(function (x) { return x.trim(); }).filter(Boolean));
      } else {
        r.paragraph(n.text.trim(), { spaceAfter: 10 });
      }
    });

    r.paragraph(progress ? 'Progress by section' : 'Scorecard by section', { bold: true, size: 12, spaceAfter: 8 });
    r.tableBlock(
      progress ? ['Section', 'Progress', 'Done', 'Remaining'] : ['Section', 'Grade', 'Passed', 'Needs work', 'Not reviewed'],
      analysed.map(function (a) {
        return progress ? [a.step.title, a.grade, String(a.passed.length), String(a.failed.length)]
                        : [a.step.title, a.grade, String(a.passed.length), String(a.failed.length), String(a.open.length)];
      }),
      progress ? [r.CONTENT_W * 0.52, r.CONTENT_W * 0.16, r.CONTENT_W * 0.14, r.CONTENT_W * 0.18]
               : [r.CONTENT_W * 0.46, r.CONTENT_W * 0.12, r.CONTENT_W * 0.12, r.CONTENT_W * 0.16, r.CONTENT_W * 0.14]
    );

    // ---- PRIORITY FIXES ----
    r.newPage();
    r.sectionHeader(progress ? 'Still To Do' : 'Priority Fixes');
    if (!failedN) {
      r.paragraph(progress ? 'Everything is complete.' : 'Nothing has been marked Needs work.' + (openN ? ' See "Not Yet Reviewed" for the items still to assess.' : ''), { italic: true, color: C.GRAY });
    } else {
      r.paragraph(progress ? failedN + ' item' + (failedN === 1 ? '' : 's') + ' still to do, sections with the most work left first.' : failedN + ' item' + (failedN === 1 ? '' : 's') + ' to fix, weakest sections first. High-impact items are listed first within a section.', { size: 10.5, italic: true, color: C.GRAY, spaceAfter: 10 });
      worst.forEach(function (a) {
        r.ensureSpace(130); // keep the section header with its first item
        doc.setFillColor.apply(doc, C.DARK);
        doc.rect(r.MARGIN, r.y, r.CONTENT_W, 22, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor.apply(doc, C.WHITE);
        doc.text(r.sanitizeText(a.step.title), r.MARGIN + 10, r.y + 15);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.text(progress ? a.grade + ' done  |  ' + a.failed.length + ' remaining' : 'Grade ' + a.grade + '  |  ' + a.failed.length + ' to fix', r.MARGIN + r.CONTENT_W - 10, r.y + 15, { align: 'right' });
        r.y += 22 + 10;
        if (a.note) r.paragraph(a.note, { size: 9, italic: true, color: C.GRAY, spaceAfter: 8 });

        const impactRank = { High: 0, Medium: 1, Low: 2 };
        a.failed.slice().sort(function (x, y) {
          return (impactRank[x.sub.impact] === undefined ? 3 : impactRank[x.sub.impact]) - (impactRank[y.sub.impact] === undefined ? 3 : impactRank[y.sub.impact]);
        }).forEach(function (x) {
          const sub = x.sub;
          const note = (notes[sub.id] || '').trim();
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
          const labelLines = doc.splitTextToSize(r.sanitizeText(sub.label), r.CONTENT_W - 110);
          let h = labelLines.length * 13 + 6;
          let descLines = [], noteLines = [];
          doc.setFontSize(8.5);
          if (sub.desc) { descLines = doc.splitTextToSize(r.sanitizeText(sub.desc), r.CONTENT_W - 14); h += descLines.length * 11 + 6; }
          if (note) { noteLines = doc.splitTextToSize(r.sanitizeText('Note: ' + note), r.CONTENT_W - 28); h += noteLines.length * 11 + 14; }
          r.ensureSpace(h + 14);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, C.DARK);
          doc.text(labelLines, r.MARGIN, r.y + 9);
          doc.setFontSize(8); doc.setTextColor.apply(doc, C.RED);
          doc.text(progress ? 'TO DO' : (sub.impact ? 'NEEDS WORK  |  ' + String(sub.impact).toUpperCase() + ' IMPACT' : 'NEEDS WORK'), r.MARGIN + r.CONTENT_W, r.y + 9, { align: 'right' });
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

        if (a.step.tools && a.step.tools.length) r.paragraph('Suggested tools: ' + a.step.tools.join(', '), { size: 9, bold: true, spaceAfter: 4 });
        if (a.step.tip) r.calloutBox('How to approach it', a.step.tip);
        r.y += 4;
      });
    }

    // ---- WHAT'S WORKING ----
    if (passedN) {
      r.newPage();
      r.sectionHeader(progress ? 'Completed' : "What's Working");
      r.paragraph(progress ? passedN + ' item' + (passedN === 1 ? '' : 's') + ' done.' : passedN + ' check' + (passedN === 1 ? '' : 's') + ' passed - protect these as the account evolves.', { size: 10.5, italic: true, color: C.GRAY, spaceAfter: 10 });
      analysed.filter(function (a) { return a.passed.length; }).forEach(function (a) {
        r.paragraph(a.step.title + '  -  ' + a.passed.length + '/' + a.step.subs.length + (progress ? ' done' : ' passed'), { bold: true, size: 10.5, spaceAfter: 4 });
        r.bulletList(a.passed.map(function (x) { return x.sub.label; }), { size: 9.5 });
      });
    }

    // ---- NOT YET REVIEWED ----
    if (openN) {
      r.newPage();
      r.sectionHeader('Not Yet Reviewed');
      r.paragraph(openN + ' item' + (openN === 1 ? ' has' : 's have') + ' not been assessed, so they are not counted against the grade.', { size: 10.5, italic: true, color: C.GRAY, spaceAfter: 10 });
      analysed.filter(function (a) { return a.open.length; }).forEach(function (a) {
        r.paragraph(a.step.title + '  -  ' + a.open.length + ' to review', { bold: true, size: 10.5, spaceAfter: 4 });
        r.bulletList(a.open.map(function (x) { return x.sub.label; }), { size: 9.5 });
      });
    }

    // ---- NEXT STEPS ----
    if (failedN) {
      r.newPage();
      r.sectionHeader('Next Steps');
      r.paragraph(progress ? 'Do next, in order' : 'Fix first, in order', { bold: true, size: 12, spaceAfter: 8 });
      const rows = [];
      worst.forEach(function (a) {
        a.failed.forEach(function (x) {
          if (rows.length < 12) rows.push([x.sub.label, a.step.title.replace(/^\d+\.\s*/, ''), (a.step.tools && a.step.tools.length) ? a.step.tools.join(', ') : '-']);
        });
      });
      r.tableBlock([progress ? 'Task' : 'Fix', 'Section', 'Tool'], rows, [r.CONTENT_W * 0.52, r.CONTENT_W * 0.28, r.CONTENT_W * 0.2]);
      if (failedN > rows.length) r.paragraph('+ ' + (failedN - rows.length) + ' more in Priority Fixes.', { size: 9, italic: true, color: C.GRAY });
      r.calloutBox('Bottom Line', progress
        ? (lens.closing ? lens.closing + ' ' : '') + passRate + '% complete. Finishing the ' + failedN + ' remaining item' + (failedN === 1 ? '' : 's') + (worst.length ? ', starting with ' + worst[0].step.title.replace(/^\d+\.\s*/, '') : '') + ', gets this over the line.'
        : (lens.closing ? lens.closing + ' ' : '') +
        'Currently graded ' + overallGrade + (passRate !== null ? ' (' + passRate + '%)' : '') + '. Resolving the ' + failedN +
        ' flagged item' + (failedN === 1 ? '' : 's') + (worst.length ? ', starting with ' + worst[0].step.title.replace(/^\d+\.\s*/, '') : '') + ', is the fastest route to a stronger score.');
      r.paragraph('Prepared for internal strategy discussion.', { size: 8.5, italic: true, color: C.GRAY, spaceAfter: 0 });
    }

    r.save(opts.filename || ((companyName.replace(/[^a-z0-9]+/gi, '_') || 'Client') + '_Audit_Report.pdf'));
  }

  global.RevitalChecklistPDF = { build: build };
})(window);
