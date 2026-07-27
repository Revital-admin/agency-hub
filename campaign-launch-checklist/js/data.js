const STEPS = [
  {
    id: "cl-step-1",
    step: 1,
    title: "Tracking & Attribution",
    description: "Ensure the foundational data is perfectly accurate before launch",
    subs: [
      { id: "cl-1", label: "Tracking pixels installed and verified firing correctly on landing page", points: 5, actionUrl: "#", impact: "High" },
      { id: "cl-2", label: "UTM parameters mapped and correctly appended to all ad URLs", points: 5, actionUrl: "#", impact: "High" },
      { id: "cl-3", label: "Conversion/Purchase events tested and confirmed functioning", points: 5, actionUrl: "#", impact: "High" }
    ]
  },
  {
    id: "cl-step-2",
    step: 2,
    title: "Audience & Targeting",
    description: "Verify who the ads are being shown to",
    subs: [
      { id: "cl-4", label: "Targeting locations, ages, and demographics strictly verified", points: 5, actionUrl: "#", impact: "High" },
      { id: "cl-5", label: "Exclusion audiences applied (e.g., excluding past purchasers)", points: 5, actionUrl: "#", impact: "Medium" },
      { id: "cl-6", label: "Budget limits (Daily/Lifetime) double-checked for accuracy", points: 5, actionUrl: "#", impact: "High" },
      { id: "cl-7", label: "Campaign start and end dates set properly", points: 5, actionUrl: "#", impact: "High" }
    ]
  },
  {
    id: "cl-step-3",
    step: 3,
    title: "Creative & Copy QA",
    description: "Review the actual assets being shown",
    subs: [
      { id: "cl-8", label: "Ad copy completely spell-checked and finalized", points: 5, actionUrl: "#", impact: "High" },
      { id: "cl-9", label: "Creative assets formatted natively for all required placements", points: 5, actionUrl: "#", impact: "Medium" },
      { id: "cl-10", label: "Destination URLs tested to ensure no broken links", points: 5, actionUrl: "#", impact: "High" }
    ]
  },
  {
    id: "cl-step-4",
    step: 4,
    title: "Landing Page Readiness",
    description: "Ensure the destination is fully optimized",
    subs: [
      { id: "cl-11", label: "Landing page loads efficiently on both mobile and desktop", points: 5, actionUrl: "#", impact: "High" },
      { id: "cl-12", label: "Lead capture forms or checkout flows successfully test-submitted", points: 5, actionUrl: "#", impact: "High" },
      { id: "cl-13", label: "Privacy Policy and Terms of Service links present", points: 5, actionUrl: "#", impact: "Medium" }
    ]
  },
  {
    id: "cl-step-5",
    step: 5,
    title: "Platform-Specific Gotchas",
    description: "Catch the default settings that waste money",
    subs: [
      { id: "cl-14", label: "Google Ads: Search Partners & Display Expansion explicitly disabled", points: 5, actionUrl: "#", impact: "High" },
      { id: "cl-15", label: "Meta Ads: Advantage+ settings reviewed and manual placements checked", points: 5, actionUrl: "#", impact: "High" },
      { id: "cl-16", label: "TikTok: Spark Ads authorization codes verified and linked", points: 5, actionUrl: "#", impact: "Medium" }
    ]
  },
  {
    id: "cl-step-6",
    step: 6,
    title: "Legal & Compliance",
    description: "Ensure ads won't be rejected or banned",
    subs: [
      { id: "cl-17", label: "Special Ad Categories (Housing, Employment, Credit, Politics) properly declared", points: 5, actionUrl: "#", impact: "High" },
      { id: "cl-18", label: "Industry-specific compliance reviewed (e.g., Health, Crypto, Finance)", points: 5, actionUrl: "#", impact: "High" }
    ]
  },
  {
    id: "cl-step-7",
    step: 7,
    title: "Admin & Billing Readiness",
    description: "Verify financials and approvals",
    subs: [
      { id: "cl-19", label: "Payment method successfully linked and verified (no failed charges)", points: 5, actionUrl: "#", impact: "High" },
      { id: "cl-20", label: "Client has explicitly signed off on the total ad spend limit in writing", points: 5, actionUrl: "#", impact: "High" }
    ]
  },
  {
    id: "cl-step-8",
    step: 8,
    title: "Routing & Notifications",
    description: "Ensure leads and data are actually received",
    subs: [
      { id: "cl-21", label: "Lead form submissions routing properly to the CRM / Email", points: 5, actionUrl: "#", impact: "High" },
      { id: "cl-22", label: "Internal team notifications (Slack/Email) set up for new leads/purchases", points: 5, actionUrl: "#", impact: "Medium" },
      { id: "cl-23", label: "Reporting dashboard (Looker Studio/AgencyAnalytics) hooked up", points: 5, actionUrl: "#", impact: "High" }
    ]
  }
];

const STEP_COLORS = [
  '#b5502f',
  '#c06342',
  '#ca7655',
  '#d58968',
  '#df9b7a',
  '#eaae8d',
  '#f4c1a0',
  '#ffd4b3',
];

const METRIC_LABELS = {
  steps: [
    'Steps complete',
    'Steps finished',
    'Phases done',
    'Stages cleared',
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
    'QA score',
    'Completion %',
    'Overall health',
    'Launch readiness',
    'Pre-flight score',
  ],
};
