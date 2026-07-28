/* ============================================================
   TIMELINE SCHEDULER — DEFAULT DATA
   Seeded from the real 33-step sequence that was living in ClickUp's
   "Campaign Briefs" list (Reginald White / Client Portal Template),
   which is the standard order every website-build client's project
   was already following - just without any real dates attached.
   offsetDays is calendar days from the client's Project Start Date;
   these are reasonable starting defaults, not fixed - every date is
   editable per client once a template is applied.
   ============================================================ */

const DEFAULT_TEMPLATES = [
  {
    id: "website-build",
    name: "Website Build",
    description: "Standard sequence from signed contract through launch and post-launch checks.",
    builtIn: true,
    phases: [
      { order: 1,  name: "Review contract, proposal, and SOW", offsetDays: 0 },
      { order: 2,  name: "Assign account manager and project team", offsetDays: 1 },
      { order: 3,  name: "Set up the internal project folder structure", offsetDays: 1 },
      { order: 4,  name: "Create CRM entry and configure ClickUp", offsetDays: 1 },
      { order: 5,  name: "Send the welcome package", offsetDays: 2 },
      { order: 6,  name: "Verify agreements, NDAs, and initial invoice", offsetDays: 2 },
      { order: 7,  name: "Gather platform and account access", offsetDays: 3 },
      { order: 8,  name: "Send and review the intake questionnaire", offsetDays: 5 },
      { order: 9,  name: "Conduct the internal pre-kickoff meeting", offsetDays: 7 },
      { order: 10, name: "Conduct the official client kickoff", offsetDays: 8 },
      { order: 11, name: "Define success metrics, reporting, and first deliverables", offsetDays: 9 },
      { order: 12, name: "Collect client assets and content", offsetDays: 12 },
      { order: 13, name: "Confirm sitemap and page scope", offsetDays: 14 },
      { order: 14, name: "Define page requirements and content", offsetDays: 17,
        subItems: ["Page 1", "Page 2", "Page 3", "Page 4", "Page 5"] },
      { order: 15, name: "Review competitors and inspiration", offsetDays: 15 },
      { order: 16, name: "Set up the Framer project", offsetDays: 16 },
      { order: 17, name: "Create page wireframes", offsetDays: 21 },
      { order: 18, name: "Create design direction and style tile", offsetDays: 21 },
      { order: 19, name: "Design the homepage", offsetDays: 25 },
      { order: 20, name: "Review and approve the landing page", offsetDays: 28 },
      { order: 21, name: "Design the inner pages", offsetDays: 32 },
      { order: 22, name: "Design mobile and tablet layouts", offsetDays: 35 },
      { order: 23, name: "Complete design revision rounds", offsetDays: 38 },
      { order: 24, name: "Build the website in Framer", offsetDays: 45 },
      { order: 25, name: "Set up CMS, forms, and integrations", offsetDays: 50 },
      { order: 26, name: "Test responsive layouts", offsetDays: 53 },
      { order: 27, name: "Run accessibility and browser testing", offsetDays: 55 },
      { order: 28, name: "Set up SEO and social metadata", offsetDays: 56 },
      { order: 29, name: "Connect analytics and domain", offsetDays: 57 },
      { order: 30, name: "Obtain final client approval", offsetDays: 60 },
      { order: 31, name: "Launch the website", offsetDays: 62 },
      { order: 32, name: "Complete client handoff and training", offsetDays: 65 },
      { order: 33, name: "Run post-launch checks", offsetDays: 72 },
    ],
  },
];

/* ── One-time migration seeds for clients that already had real progress
   sitting in ClickUp before this tool existed. Applied automatically the
   first time each named client opens this tool with no timeline yet -
   see maybeSeedMigratedClient() in app.js. Everything here is still
   fully editable afterward, this just avoids losing where they actually
   were. ClickUp had no real due dates on any of these tasks, so dates
   are left to be filled in via Project Start Date + Recalculate. */
const MIGRATION_SEEDS = {
  "Reginald White": {
    templateId: "website-build",
    // Steps 01-08 (contract through intake questionnaire) were marked
    // "Published" in ClickUp - the closest equivalent to done for that
    // internal-setup stretch. Everything from 09 onward was still
    // "Brief Received" (i.e. not actually started).
    doneThroughOrder: 8,
  },
  "Evry Intention LLC": {
    templateId: "website-build",
    // ClickUp only had a single unstarted placeholder task ("Website
    // build") for this client - nothing worth preserving beyond
    // "hasn't started yet", so it gets the template fresh.
    doneThroughOrder: 0,
  },
};
