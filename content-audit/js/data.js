const STEPS = [
  {
    id: "ca-1",
    step: 1,
    title: "1. Content Inventory & Mapping",
    description: "Catalog existing content and map it to the buyer journey.",
    subs: [
      { id: "ca_inv_1", label: "All existing URLs and content assets have been logged." },
      { id: "ca_inv_2", label: "Content is mapped to buyer journey stages (Awareness, Consideration, Decision)." },
      { id: "ca_inv_3", label: "Outdated, low-quality, or redundant content flagged for pruning/consolidation." },
      { id: "ca_inv_4", label: "Content gaps and missing topic clusters have been identified." }
    ]
  },
  {
    id: "ca-2",
    step: 2,
    title: "2. SEO & Keyword Performance",
    description: "Evaluate organic traffic trends and keyword visibility.",
    subs: [
      { id: "ca_seo_1", label: "Top-performing pages identified via organic traffic and backlinks." },
      { id: "ca_seo_2", label: "Keyword rankings analyzed and cannibalization issues resolved." },
      // Meta title/description optimization used to be its own item here,
      // duplicating the SEO Audit Checklist's "Check metadata" section
      // (title tags + meta descriptions) under a different name. Linked
      // to that checklist as the authoritative check instead.
      { id: "ca_seo_3", label: "Meta titles and descriptions optimized (see SEO Audit Checklist → Check metadata)." },
      { id: "ca_seo_4", label: "Internal linking structure effectively distributes page authority." }
    ]
  },
  {
    id: "ca-3",
    step: 3,
    title: "3. Quality, Formatting & Relevance",
    description: "Assess readability, accuracy, and brand alignment.",
    subs: [
      { id: "ca_qual_1", label: "Content is highly readable with clear formatting (H2s, H3s, bullet points)." },
      { id: "ca_qual_2", label: "Content aligns with Google's E-E-A-T (Experience, Expertise, Authoritativeness, Trust) guidelines." },
      { id: "ca_qual_3", label: "Information is accurate, up-to-date, and matches current brand voice." },
      { id: "ca_qual_4", label: "Adequate multimedia usage (images, videos, infographics) supports the text." }
    ]
  },
  {
    id: "ca-4",
    step: 4,
    title: "4. Engagement & Conversions",
    description: "Review how effectively content drives user action.",
    subs: [
      { id: "ca_eng_1", label: "User engagement metrics (Time on Page, Bounce Rate) are within healthy ranges." },
      { id: "ca_eng_2", label: "Every piece of content contains a clear, relevant Call-to-Action (CTA)." },
      { id: "ca_eng_3", label: "Lead capture mechanisms (forms, pop-ups, gated content) are optimized." },
      { id: "ca_eng_4", label: "Conversion rates for key content pieces have been analyzed." }
    ]
  }
];

const STEP_COLORS = [
  '#b5502f',
  '#ce7c5b',
  '#e6a887',
  '#ffd4b3',
];

const METRIC_LABELS = {
  steps: [
    'Phases complete',
    'Stages finished',
    'Sections done',
    'Modules cleared',
    'Milestones hit',
  ],
  tasks: [
    'Tasks done',
    'Items checked',
    'Actions taken',
    'Tasks complete',
    'Checks passed',
  ],
  remaining: [
    'Still to do',
    'Left to action',
    'Pending tasks',
    'Outstanding',
    'Items remaining',
  ],
  score: [
    'Audit score',
    'Completion %',
    'Overall health',
    'Progress score',
    'Readiness',
  ],
};
