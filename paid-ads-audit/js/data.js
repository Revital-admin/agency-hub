const STEPS = [
  {
    id: "pa-step-1",
    step: 1,
    title: "Account Setup & Tracking",
    description: "Ensure the foundational data is accurate",
    subs: [
      { id: "pa-1", label: "Google Analytics 4 (GA4) properly linked to ad accounts", points: 5, actionUrl: "#", impact: "High" },
      { id: "pa-2", label: "Meta Pixel installed and firing correctly on key events", points: 5, actionUrl: "#", impact: "High" },
      { id: "pa-3", label: "Conversion Tracking / Purchase Events configured properly", points: 5, actionUrl: "#", impact: "High" },
      { id: "pa-4", label: "Google Tag Manager (GTM) utilized for tag management", points: 5, actionUrl: "#", impact: "Medium" },
      { id: "pa-5", label: "UTM Parameters consistently applied to all ad links", points: 5, actionUrl: "#", impact: "High" }
    ]
  },
  {
    id: "pa-step-2",
    step: 2,
    title: "Campaign Architecture",
    description: "Evaluate how the budget is being deployed",
    subs: [
      { id: "pa-6", label: "Clear Full-Funnel Strategy deployed (Top / Mid / Bottom of Funnel)", points: 5, actionUrl: "#", impact: "High" },
      { id: "pa-7", label: "Retargeting / Remarketing campaigns actively running", points: 5, actionUrl: "#", impact: "High" },
      { id: "pa-8", label: "Budget is optimally distributed across best-performing platforms", points: 5, actionUrl: "#", impact: "High" }
    ]
  },
  {
    id: "pa-step-3",
    step: 3,
    title: "Audience Targeting",
    description: "Assess who the ads are being shown to",
    subs: [
      { id: "pa-9", label: "Lookalike / Similar Audiences utilized effectively", points: 5, actionUrl: "#", impact: "Medium" },
      { id: "pa-10", label: "Custom Audiences (Email lists, past purchasers) syncing", points: 5, actionUrl: "#", impact: "High" },
      { id: "pa-11", label: "Exclusion Audiences applied to prevent wasted spend", points: 5, actionUrl: "#", impact: "High" },
      { id: "pa-12", label: "Audience overlap is minimized to prevent self-bidding", points: 5, actionUrl: "#", impact: "Medium" }
    ]
  },
  {
    id: "pa-step-4",
    step: 4,
    title: "Ad Creative & Copy",
    description: "Review the actual assets being shown",
    subs: [
      { id: "pa-13", label: "Ad Copy aligns perfectly with the established Brand Voice", points: 5, actionUrl: "#", impact: "Medium" },
      { id: "pa-14", label: "Strong variety of ad formats (Videos, Static Images, Carousels)", points: 5, actionUrl: "#", impact: "High" },
      { id: "pa-15", label: "Strong, clear Call-to-Actions (CTAs) present on all ads", points: 5, actionUrl: "#", impact: "High" },
      { id: "pa-16", label: "A/B Testing framework actively running to optimize creatives", points: 5, actionUrl: "#", impact: "High" }
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
    'Audit score',
    'Completion %',
    'Overall health',
    'Progress score',
    'SEO readiness',
  ],
};
