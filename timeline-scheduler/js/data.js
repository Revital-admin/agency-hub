/* ============================================================
   TIMELINE SCHEDULER — DEFAULT DATA
   Seeded from the real 33-step sequence that was living in ClickUp's
   "Campaign Briefs" list (Reginald White / Client Portal Template),
   which is the standard order every website-build client's project
   was already following - just without any real dates attached.
   offsetDays is calendar days from the client's Project Start Date;
   these are reasonable starting defaults, not fixed - every date is
   editable per client once a template is applied.

   NOTE: contract/proposal/SOW review and account-manager/project-team
   assignment are intentionally NOT phases here - that's already
   tracked in the Client Onboarding tool, so including it here would
   just be double work. These templates start where the actual
   project-specific work begins, so every client gets the same
   consistent flow for whatever kind of work is being done.
   ============================================================ */

const DEFAULT_TEMPLATES = [
  {
    id: "website-build",
    name: "Website Build",
    description: "Standard sequence from project kickoff through launch and post-launch checks.",
    builtIn: true,
    phases: [
      { order: 1,  name: "Set up the internal project folder structure", offsetDays: 0 },
      { order: 2,  name: "Create CRM entry and configure ClickUp", offsetDays: 0 },
      { order: 3,  name: "Send the welcome package", offsetDays: 1 },
      { order: 4,  name: "Verify agreements, NDAs, and initial invoice", offsetDays: 1 },
      { order: 5,  name: "Gather platform and account access", offsetDays: 2 },
      { order: 6,  name: "Send and review the intake questionnaire", offsetDays: 4 },
      { order: 7,  name: "Conduct the internal pre-kickoff meeting", offsetDays: 6 },
      { order: 8,  name: "Conduct the official client kickoff", offsetDays: 7 },
      { order: 9,  name: "Define success metrics, reporting, and first deliverables", offsetDays: 8 },
      { order: 10, name: "Collect client assets and content", offsetDays: 11 },
      { order: 11, name: "Confirm sitemap and page scope", offsetDays: 13 },
      { order: 12, name: "Define page requirements and content", offsetDays: 16,
        subItems: ["Page 1", "Page 2", "Page 3", "Page 4", "Page 5"] },
      { order: 13, name: "Review competitors and inspiration", offsetDays: 14 },
      { order: 14, name: "Set up the Framer project", offsetDays: 15 },
      { order: 15, name: "Create page wireframes", offsetDays: 20 },
      { order: 16, name: "Create design direction and style tile", offsetDays: 20 },
      { order: 17, name: "Design the homepage", offsetDays: 24 },
      { order: 18, name: "Review and approve the landing page", offsetDays: 27 },
      { order: 19, name: "Design the inner pages", offsetDays: 31 },
      { order: 20, name: "Design mobile and tablet layouts", offsetDays: 34 },
      { order: 21, name: "Complete design revision rounds", offsetDays: 37 },
      { order: 22, name: "Build the website in Framer", offsetDays: 44 },
      { order: 23, name: "Set up CMS, forms, and integrations", offsetDays: 49 },
      { order: 24, name: "Test responsive layouts", offsetDays: 52 },
      { order: 25, name: "Run accessibility and browser testing", offsetDays: 54 },
      { order: 26, name: "Set up SEO and social metadata", offsetDays: 55 },
      { order: 27, name: "Connect analytics and domain", offsetDays: 56 },
      { order: 28, name: "Obtain final client approval", offsetDays: 59 },
      { order: 29, name: "Launch the website", offsetDays: 61 },
      { order: 30, name: "Complete client handoff and training", offsetDays: 64 },
      { order: 31, name: "Run post-launch checks", offsetDays: 71 },
    ],
  },
  {
    id: "video-production",
    name: "Video Production Project",
    description: "Pre-production through final delivery, from concept to archived footage.",
    builtIn: true,
    phases: [
      { order: 1,  name: "Define concept, deliverables, and script/outline", offsetDays: 0 },
      { order: 2,  name: "Location scout and venue tech-spec review", offsetDays: 2 },
      { order: 3,  name: "Confirm cast/talent and vendor/rental needs", offsetDays: 4 },
      { order: 4,  name: "Build the call sheet and run of show", offsetDays: 6 },
      { order: 5,  name: "Collect signed release forms", offsetDays: 6 },
      { order: 6,  name: "Conduct the pre-production meeting", offsetDays: 7 },
      { order: 7,  name: "Shoot day(s)", offsetDays: 9 },
      { order: 8,  name: "Ingest and back up raw footage", offsetDays: 10 },
      { order: 9,  name: "Select footage and build the rough cut", offsetDays: 15 },
      { order: 10, name: "Internal review of the rough cut", offsetDays: 17 },
      { order: 11, name: "Client review and revision round(s)", offsetDays: 21 },
      { order: 12, name: "Finalize color, audio, and graphics", offsetDays: 24 },
      { order: 13, name: "Deliver final files", offsetDays: 27 },
      { order: 14, name: "Archive raw footage and close out project", offsetDays: 29 },
    ],
  },
  {
    id: "paid-ads-launch",
    name: "Paid Ads Campaign Launch",
    description: "Account access through live campaign, ending with the first optimization review.",
    builtIn: true,
    phases: [
      { order: 1,  name: "Run the Paid Ads Audit on existing accounts (if any)", offsetDays: 0 },
      { order: 2,  name: "Gather ad account access and billing setup", offsetDays: 1 },
      { order: 3,  name: "Complete the Ad Account Setup checklist", offsetDays: 3 },
      { order: 4,  name: "Define targeting, budget, and KPIs", offsetDays: 4 },
      { order: 5,  name: "Build the creative brief for ad assets", offsetDays: 5 },
      { order: 6,  name: "Produce ad creative and copy", offsetDays: 11 },
      { order: 7,  name: "Build campaign structure and tracking/pixels", offsetDays: 13 },
      { order: 8,  name: "Internal QA via the Campaign Launch Pre-Flight Checklist", offsetDays: 15 },
      { order: 9,  name: "Launch campaigns", offsetDays: 16 },
      { order: 10, name: "First optimization review (7-day check-in)", offsetDays: 23 },
    ],
  },
  {
    id: "seo-content-campaign",
    name: "SEO / Content Campaign",
    description: "Kicks off an ongoing content engine, ending with the first 30-day performance review.",
    builtIn: true,
    phases: [
      { order: 1,  name: "Run the SEO Audit", offsetDays: 0 },
      { order: 2,  name: "Keyword research and content gap analysis", offsetDays: 5 },
      { order: 3,  name: "Build the content calendar and strategy", offsetDays: 9 },
      { order: 4,  name: "Draft the first batch of content", offsetDays: 16 },
      { order: 5,  name: "Client review and revisions", offsetDays: 20 },
      { order: 6,  name: "Publish first batch and fix technical SEO issues", offsetDays: 23 },
      { order: 7,  name: "Set up rank/traffic tracking and reporting cadence", offsetDays: 24 },
      { order: 8,  name: "First 30-day performance review", offsetDays: 53 },
    ],
  },
  {
    id: "rebrand-refresh",
    name: "Rebrand / Brand Refresh",
    description: "New brand identity work from discovery through final rollout.",
    builtIn: true,
    phases: [
      { order: 1,  name: "Brand discovery session", offsetDays: 0 },
      { order: 2,  name: "Competitor and market review", offsetDays: 3 },
      { order: 3,  name: "Build the mood board", offsetDays: 7 },
      { order: 4,  name: "Present initial creative direction", offsetDays: 11 },
      { order: 5,  name: "Develop brand guidelines", offsetDays: 19 },
      { order: 6,  name: "Build the brand asset kit", offsetDays: 25 },
      { order: 7,  name: "Client review and revision round(s)", offsetDays: 29 },
      { order: 8,  name: "Final handoff and rollout plan", offsetDays: 33 },
    ],
  },
  {
    id: "social-media-management",
    name: "Social Media Management",
    description: "Ongoing social account takeover, from audit through the first monthly report.",
    builtIn: true,
    phases: [
      { order: 1,  name: "Run the Social Media Audit", offsetDays: 0 },
      { order: 2,  name: "Gather platform access and brand assets", offsetDays: 1 },
      { order: 3,  name: "Define content pillars and posting cadence", offsetDays: 5 },
      { order: 4,  name: "Build the first content calendar", offsetDays: 9 },
      { order: 5,  name: "Draft the first batch of posts", offsetDays: 13 },
      { order: 6,  name: "Client review and approval workflow set up", offsetDays: 16 },
      { order: 7,  name: "Begin scheduled posting", offsetDays: 18 },
      { order: 8,  name: "First monthly performance report", offsetDays: 48 },
    ],
  },
  {
    id: "email-marketing-campaign",
    name: "Email Marketing Campaign",
    description: "List and platform setup through the first send cadence and performance review.",
    builtIn: true,
    phases: [
      { order: 1,  name: "Run the Email Marketing Audit", offsetDays: 0 },
      { order: 2,  name: "Gather ESP access and list exports", offsetDays: 1 },
      { order: 3,  name: "Clean and segment the list", offsetDays: 5 },
      { order: 4,  name: "Build email templates", offsetDays: 10 },
      { order: 5,  name: "Draft the first campaign(s)", offsetDays: 14 },
      { order: 6,  name: "Client review and revisions", offsetDays: 17 },
      { order: 7,  name: "Send the first campaign", offsetDays: 19 },
      { order: 8,  name: "First performance review (opens, clicks, conversions)", offsetDays: 26 },
    ],
  },
  {
    id: "case-study-testimonial",
    name: "Case Study / Testimonial Project",
    description: "Turning a completed client win into marketing content, from interview through promotion.",
    builtIn: true,
    phases: [
      { order: 1,  name: "Identify the client win and confirm participation", offsetDays: 0 },
      { order: 2,  name: "Gather results, metrics, and supporting data", offsetDays: 3 },
      { order: 3,  name: "Conduct the client interview", offsetDays: 7 },
      { order: 4,  name: "Draft the case study or testimonial", offsetDays: 11 },
      { order: 5,  name: "Internal review", offsetDays: 13 },
      { order: 6,  name: "Client review and approval", offsetDays: 17 },
      { order: 7,  name: "Design and finalize the asset", offsetDays: 20 },
      { order: 8,  name: "Publish to portfolio/case study library", offsetDays: 22 },
      { order: 9,  name: "Promote across social and email channels", offsetDays: 24 },
    ],
  },
  {
    id: "content-strategy-overhaul",
    name: "Content Strategy Overhaul",
    description: "A one-time strategy engagement - audit through a finalized strategy doc, handed off for production.",
    builtIn: true,
    phases: [
      { order: 1, name: "Audit current content and channels", offsetDays: 0 },
      { order: 2, name: "Competitive and market review", offsetDays: 3 },
      { order: 3, name: "Stakeholder interviews and goals alignment", offsetDays: 5 },
      { order: 4, name: "Build the content strategy document", offsetDays: 10 },
      { order: 5, name: "Internal review", offsetDays: 13 },
      { order: 6, name: "Present strategy to client", offsetDays: 16 },
      { order: 7, name: "Incorporate feedback and finalize", offsetDays: 19 },
      { order: 8, name: "Hand off to content production", offsetDays: 21 },
    ],
  },
  {
    id: "personal-branding-project",
    name: "Personal Branding Project",
    description: "For individual personal-brand clients - discovery through a live posting cadence.",
    builtIn: true,
    phases: [
      { order: 1, name: "Personal brand discovery session (goals, voice, audience)", offsetDays: 0 },
      { order: 2, name: "Define content pillars and brand positioning", offsetDays: 4 },
      { order: 3, name: "Build out the Personal Branding Builder profile", offsetDays: 8 },
      { order: 4, name: "Draft the first batch of personal brand content", offsetDays: 13 },
      { order: 5, name: "Client review and revisions", offsetDays: 17 },
      { order: 6, name: "Publish the first batch of content", offsetDays: 19 },
      { order: 7, name: "Set up the ongoing posting cadence", offsetDays: 20 },
      { order: 8, name: "First performance checkpoint", offsetDays: 45 },
    ],
  },
  {
    id: "website-redesign-ux-overhaul",
    name: "Website Redesign / UX Overhaul",
    description: "For improving an existing site (not a ground-up build) - audit through relaunch.",
    builtIn: true,
    phases: [
      { order: 1,  name: "Run the UX/UI Audit on the existing site", offsetDays: 0 },
      { order: 2,  name: "Review findings and prioritize issues", offsetDays: 3 },
      { order: 3,  name: "Define redesign scope and goals", offsetDays: 5 },
      { order: 4,  name: "Build updated wireframes for affected pages", offsetDays: 9 },
      { order: 5,  name: "Design revisions and style updates", offsetDays: 14 },
      { order: 6,  name: "Client review and revision round(s)", offsetDays: 19 },
      { order: 7,  name: "Implement updates in Framer", offsetDays: 24 },
      { order: 8,  name: "QA and cross-device testing", offsetDays: 28 },
      { order: 9,  name: "Relaunch updated pages", offsetDays: 30 },
      { order: 10, name: "Post-relaunch performance check", offsetDays: 37 },
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
    // ClickUp had the contract-through-intake-questionnaire stretch
    // marked "Published" (the closest equivalent to done). Those admin
    // steps aren't tracked in this template anymore (they live in
    // Client Onboarding), so the done line now lands on order 6 -
    // "Send and review the intake questionnaire", the last of that
    // group that still has an equivalent phase here. Everything from
    // "Conduct the internal pre-kickoff meeting" onward was still
    // "Brief Received" (i.e. not actually started).
    doneThroughOrder: 6,
  },
  "Evry Intention LLC": {
    templateId: "website-build",
    // ClickUp only had a single unstarted placeholder task ("Website
    // build") for this client - nothing worth preserving beyond
    // "hasn't started yet", so it gets the template fresh.
    doneThroughOrder: 0,
  },
};
