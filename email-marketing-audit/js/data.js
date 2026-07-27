const STEPS = [
  {
    id: "deliverability",
    step: 1,
    title: "1. Deliverability & Infrastructure",
    description: "Ensure emails actually reach the inbox and domains are authenticated.",
    subs: [
      { id: "em_del_1", label: "DKIM, SPF, and DMARC are properly configured." },
      { id: "em_del_2", label: "Sender reputation and domain health are strong (low bounce rate)." },
      { id: "em_del_3", label: "List hygiene practices are active (e.g. sunsetting unengaged subscribers)." },
      { id: "em_del_4", label: "Double opt-in is enabled for new signups." }
    ]
  },
  {
    id: "automation",
    step: 2,
    title: "2. Core Automation Flows",
    description: "Evaluate the foundational automated email sequences.",
    subs: [
      { id: "em_aut_1", label: "Welcome Series is active and introduces the brand effectively." },
      { id: "em_aut_2", label: "Abandoned Cart flow triggers with a strong incentive or urgency." },
      { id: "em_aut_3", label: "Post-Purchase Nurture sequence is active (thank you, upsell, review request)." },
      { id: "em_aut_4", label: "Winback or Re-engagement sequence targets lapsed customers." }
    ]
  },
  {
    id: "strategy",
    step: 3,
    title: "3. Campaign Strategy",
    description: "Assess regular broadcasts, segmentation, and list growth.",
    subs: [
      { id: "em_str_1", label: "Regular newsletter / broadcast schedule is maintained." },
      { id: "em_str_2", label: "List is segmented based on engagement or purchase history." },
      { id: "em_str_3", label: "A/B testing is utilized for subject lines or CTAs." },
      { id: "em_str_4", label: "Lead capture forms/pop-ups are active and optimized on the website." }
    ]
  },
  {
    id: "design",
    step: 4,
    title: "4. Design & Accessibility",
    description: "Check visual rendering and user experience inside the inbox.",
    subs: [
      { id: "em_des_1", label: "Emails are mobile-responsive and render correctly across devices." },
      { id: "em_des_2", label: "Dark-mode optimization is considered (logos with transparent backgrounds)." },
      { id: "em_des_3", label: "Alt-text is provided for all essential images." },
      { id: "em_des_4", label: "Clear, single Primary Call-to-Action (CTA) per email." }
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
