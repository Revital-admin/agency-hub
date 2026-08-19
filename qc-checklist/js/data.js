/* ============================================================
   QC CHECKLIST — DATA
   Mirrors the Quality Control (QC) Checklist in the SOP Wiki
   (Core Operations). Universal QC always runs first, then the
   service-specific checklist for what's being reviewed.
   ============================================================ */

const QC_UNIVERSAL = [
  {
    category: "Brand Consistency",
    items: [
      "Colors match the client's approved brand palette",
      "Fonts match the client's approved typography",
      "Logo is used correctly — correct version, size, placement, not distorted",
      "Tone of voice matches the client's approved tone",
      "Messaging aligns with the client's brand story and core values",
      "None of the client's documented messaging \"Don'ts\" are violated"
    ]
  },
  {
    category: "Copy & Content",
    items: [
      "All copy has been proofread — no spelling errors",
      "All copy has been proofread — no grammatical errors",
      "Punctuation is correct and consistent throughout",
      "No placeholder text left in (e.g. \"INSERT COPY HERE\" or \"TBD\")",
      "No client name misspellings — correct legal business name used"
    ]
  },
  {
    category: "Visual",
    items: [
      "All images and graphics are high resolution — no pixelation or blurriness",
      "No watermarked or unlicensed stock images used",
      "No copyrighted material used without proper licensing",
      "Visual hierarchy is clear — most important element draws the eye first",
      "Text is legible — sufficient contrast between text and background",
      "No layout issues — nothing cut off, overlapping, or misaligned"
    ]
  },
  {
    category: "Legal & Compliance",
    items: [
      "No claims that could be considered misleading or false advertising",
      "No use of competitor brand names or logos without permission",
      "No content that could be considered discriminatory, offensive, or controversial",
      "Client-specific content restrictions from intake form are respected",
      "Any required disclaimers or disclosures are included"
    ]
  },
  {
    category: "Links & Technical",
    items: [
      "All links have been clicked and confirmed working",
      "All links go to the correct destination",
      "UTM parameters are added to all trackable links",
      "File is in the correct format for delivery",
      "File is named correctly — ClientName_DeliverableType_Date"
    ]
  },
  {
    category: "Final Pre-Send Check",
    items: [
      "Deliverable matches what was briefed and approved",
      "Revision rounds are tracked — this is Round (X) of (X) included",
      "Task status updated to Internal Review before QC begins",
      "QC reviewer is different from the person who produced this deliverable"
    ]
  }
];

const QC_SERVICE_TYPES = [
  {
    key: "social",
    label: "Social Media Content",
    items: [
      "Image/video sized correctly for the platform and post type",
      "File format is correct (JPG / PNG / MP4 / MOV)",
      "Caption length is appropriate for the platform",
      "Hashtags are relevant, researched, and within platform limits",
      "Caption includes a clear CTA",
      "Captions/subtitles added for accessibility (video content)",
      "Post aligns with the approved content pillar for this week",
      "Post aligns with the content calendar schedule",
      "If scheduled — correct date, time, and platform confirmed in the scheduling tool"
    ]
  },
  {
    key: "paidads",
    label: "Paid Ad Creative",
    items: [
      "Ad sized correctly for the platform and ad format",
      "Text overlay is under 20% of the image (Meta requirement)",
      "Headline is attention-grabbing and relevant to the target audience",
      "Primary text (body copy) is clear and leads to the CTA",
      "CTA button matches the campaign objective",
      "Ad does not violate platform advertising policies",
      // Pixel tracking, UTM parameters, and budget/dates used to each be
      // their own item here, duplicating Campaign Launch Checklist's
      // pre-flight items of the same three facts almost word-for-word.
      // Collapsed to one line pointing at that checklist as the
      // authoritative pre-launch check, rather than re-verifying the
      // same three technical facts a second time under a different name.
      "Tracking pixel, UTM parameters, and budget/dates confirmed via Campaign Launch Checklist (not re-verified here)",
      "Ad reviewed and approved by account manager before going live"
    ]
  },
  {
    key: "seo",
    label: "SEO",
    items: [
      "Target keyword confirmed and matches the brief",
      "Keyword appears in page title, meta title, and first 100 words",
      "Meta description written (under 160 characters) and includes the keyword",
      "Header hierarchy is correct: H1 → H2 → H3 — no skipped levels",
      "Internal and external links added correctly",
      "All images have descriptive alt text",
      "Word count meets or exceeds the brief requirement",
      "Content is original and provides genuine value — answers search intent",
      "Page speed, mobile responsiveness, and indexability confirmed (technical)",
      "Google Business Profile / NAP consistency confirmed (local SEO)"
    ]
  },
  {
    key: "email",
    label: "Email Marketing",
    items: [
      "Subject line and preview text written and complementary",
      "Email has one clear primary CTA — not multiple competing actions",
      "All links tested — every link clicked and confirmed working",
      "Unsubscribe link and physical mailing address present (CAN-SPAM)",
      "Previewed on mobile, desktop, and dark mode — layout correct",
      "Images have alt text and are optimized (no image over 1MB)",
      "Correct sender name and reply-to email set",
      "Sending to the correct list or segment — double-checked",
      "Test email sent to internal team and reviewed before deployment",
      "UTM parameters added to all links, open/click tracking enabled"
    ]
  },
  {
    key: "website",
    label: "Website",
    items: [
      "Design matches the approved mockup — no unapproved changes",
      "Brand colors, fonts, and logo used correctly throughout",
      "Reviewed on desktop, tablet, and mobile — no layout issues",
      "Page speed, image optimization, and lazy loading confirmed",
      "All navigation links, buttons, and CTAs work correctly",
      "No broken links anywhere on the site",
      "Analytics, Pixel, and Tag Manager installed and firing",
      "All pages have unique meta titles and descriptions",
      "Forms tested and connected to the correct email/CRM",
      "Client has reviewed and approved the final design before going live"
    ]
  },
  {
    key: "video",
    label: "Video & Content Production",
    items: [
      "Resolution is minimum 1080p, frame rate consistent throughout",
      "Audio is clear — no background noise, echo, or distortion",
      "Background music properly licensed, doesn't overpower voiceover",
      "Captions/subtitles are accurate and timed correctly",
      "Cuts are clean, transitions smooth, strong hook in first 3 seconds",
      "Lower thirds / text overlays are spelled correctly",
      "Logo / watermark placed correctly per brand guidelines",
      "Final frame includes a clear CTA",
      "Final file exported in the correct format and named correctly",
      "Raw files backed up before delivery"
    ]
  },
  {
    key: "reports",
    label: "Monthly Reports",
    items: [
      "All data pulled from the correct date range",
      "All metrics verified against live platform dashboards — no copy/paste errors",
      "KPIs benchmarked against the client's agreed targets",
      "Previous month's data included for comparison",
      "Executive summary accurately reflects the data",
      "Top 3 wins are genuine, data-backed",
      "Areas for improvement are honest and constructive",
      "Next month recommendations are specific and actionable",
      "Hub audit progress scores included and accurate",
      "Reviewed by account manager for accuracy before delivery",
      "PDF uploaded to the correct client folder, sharing set correctly",
      "Report delivered by the 5th of the month"
    ]
  }
];
