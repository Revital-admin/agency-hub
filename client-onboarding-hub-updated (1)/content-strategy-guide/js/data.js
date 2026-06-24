/* ============================================================
   SOCIAL & DIGITAL MARKETING CONTENT STRATEGY GUIDE — DATA
   All step definitions, sub-tasks, and tool references.
   Edit this file to customise steps, tasks, tips, and tools.
   ============================================================ */

const STEP_COLORS = [
  '#10b981', // Step 1 — Emerald
  '#0d9488', // Step 2 — Dark Teal
  '#3b82f6', // Step 3 — Blue
  '#8b5cf6', // Step 4 — Violet
  '#ec4899', // Step 5 — Pink
  '#f59e0b', // Step 6 — Amber
  '#f97316', // Step 7 — Orange
  '#64748b', // Step 8 — Slate
];

/* ----------------------------------------------------------------
   METRIC LABEL SETS
   Each score card cycles through these label variants over time.
   ---------------------------------------------------------------- */
const METRIC_LABELS = {
  steps: [
    'Steps complete',
    'Phases finished',
    'Stages cleared',
    'Milestones hit',
    'Strategy done',
  ],
  tasks: [
    'Tasks done',
    'Items checked',
    'Actions taken',
    'Tasks complete',
    'Deliverables ready',
  ],
  remaining: [
    'Still to do',
    'Left to action',
    'Pending items',
    'Gaps remaining',
    'Strategy items left',
  ],
  score: [
    'Strategy score',
    'Completion %',
    'Overall readiness',
    'Campaign score',
    'Marketing health',
  ],
};

/* ----------------------------------------------------------------
   STEPS DATA
   Each step has:
    - id        unique string
    - num       display number (1–8)
    - title     short title shown in header
    - tools     array of tool names shown as tags
    - tip       expanded tip shown inside the step body
    - subs      array of sub-tasks { id, label, desc }
   ---------------------------------------------------------------- */
const STEPS = [
  {
    id: 'cs1',
    num: 1,
    title: 'Audience Research & Platform Selection',
    tools: ['SparkToro', 'Instagram Insights', 'TikTok Analytics'],
    tip: 'Define clear target demographics and match them to platform user bases. Choose channels where your buyers already spend their time instead of trying to be everywhere at once.',
    subs: [
      {
        id: 'cs1a',
        label: 'Define Platform Target Demographics',
        desc: 'Document age, location, and platform usage behavior (e.g. B2B professionals on LinkedIn, Gen Z on TikTok).',
      },
      {
        id: 'cs1b',
        label: 'Conduct Competitor Social Audits',
        desc: 'Analyze competitor channels for post frequency, engagement rate, design aesthetics, and top performing posts.',
      },
      {
        id: 'cs1c',
        label: 'Select Primary & Secondary Digital Channels',
        desc: 'Choose 2-3 core channels (e.g. Meta, YouTube, LinkedIn) based on research, and allocate resources accordingly.',
      },
      {
        id: 'cs1d',
        label: 'Establish Platform-Specific Goals',
        desc: 'Set goals for each selected channel (e.g. brand awareness on Instagram, lead generation on LinkedIn, community on Discord).',
      },
      {
        id: 'cs1e',
        label: 'Audit Existing Social Channel Profiles',
        desc: 'Optimize bios, profile pictures, cover designs, link-in-bio setups, and verify consistent branding across channels.',
      },
    ],
  },
  {
    id: 'cs2',
    num: 2,
    title: 'Brand Identity, Voice & Aesthetics',
    tools: ['Figma', 'Canva', 'Coolors'],
    tip: 'Consistent visual design and brand voice make your social channels easily recognizable. Build reusable graphic and video templates to speed up content creation.',
    subs: [
      {
        id: 'cs2a',
        label: 'Develop Social Media Visual Guidelines',
        desc: 'Define standard brand typography, social color palettes, post design patterns, and photography style guides.',
      },
      {
        id: 'cs2b',
        label: 'Establish Platform-Specific Voices & Tones',
        desc: 'Define tone guidelines (e.g. casual and humorous on TikTok, conversational on Instagram, professional and authoritative on LinkedIn).',
      },
      {
        id: 'cs2c',
        label: 'Create Reusable Graphic Post Templates',
        desc: 'Design templates in Canva or Figma for quotes, announcements, single image posts, and multi-slide carousel guides.',
      },
      {
        id: 'cs2d',
        label: 'Draft Community Engagement Rules',
        desc: 'Create response templates and guidelines for handling comments, direct messages, brand reviews, and crisis communications.',
      },
      {
        id: 'cs2e',
        label: 'Define Video Presentation & Production Guidelines',
        desc: 'Establish guidelines for video recording (e.g. camera framing, lighting setup, audio check, and standard video hooks).',
      },
    ],
  },
  {
    id: 'cs3',
    num: 3,
    title: 'Content Pillars & Creative Formats',
    tools: ['AnswerThePublic', 'Pinterest Trends', 'ChatGPT'],
    tip: 'Avoid posting random updates. Organize your plan around 3-4 content pillars that educate, entertain, build trust, and drive conversions.',
    subs: [
      {
        id: 'cs3a',
        label: 'Establish 3–4 Content Pillars',
        desc: 'Define core messaging pillars (e.g. Educational tips, Behind-the-Scenes processes, Client Success proof, Promotional hooks).',
      },
      {
        id: 'cs3b',
        label: 'Research Trending Hooks & Video Audios',
        desc: 'Scan social platforms weekly to collect viral audio patterns, video hooks, and trending meme concepts.',
      },
      {
        id: 'cs3c',
        label: 'Plan Recurring Content Series',
        desc: 'Create recurring show formats (e.g. "Tip of the Week", "Founder Diaries", "Client Spotlight Video") for predictive posting.',
      },
      {
        id: 'cs3d',
        label: 'Select Core Content Formats per Pillar',
        desc: 'Decide format distribution: short-form video (Reels/Shorts), text posts, carousel guides, infographics, or long-form videos.',
      },
      {
        id: 'cs3e',
        label: 'Outline Digital Asset Specifications',
        desc: 'Document correct crop ratios (9:16 vertical, 1:1 square, 16:9 landscape) and text-safe zones for each social platform.',
      },
    ],
  },
  {
    id: 'cs4',
    num: 4,
    title: 'Short-Form Video Production (TikTok/Reels)',
    tools: ['CapCut', 'Premiere Pro', 'Teleprompter App'],
    tip: 'Short-form vertical video is the fastest way to build an organic social audience. Structure scripts to catch attention in the first 3 seconds, and keep editing fast and dynamic.',
    subs: [
      {
        id: 'cs4a',
        label: 'Write Attention-Grabbing Hooks & Scripts',
        desc: 'Draft script outlines featuring strong verbal/visual hooks placed in the first 3 seconds to maximize viewer retention.',
      },
      {
        id: 'cs4b',
        label: 'Schedule Batch-Filming Sessions',
        desc: 'Set up bi-weekly recording blocks to record multiple video scripts (e.g., 5-10 videos) in a single session.',
      },
      {
        id: 'cs4c',
        label: 'Implement Dynamic Video Editing Rules',
        desc: 'Edit video content with fast cuts, text subtitles, sound effects, B-roll, zoom transitions, and color corrections.',
      },
      {
        id: 'cs4d',
        label: 'Create High-CTR Video Covers & Thumbnails',
        desc: 'Design visual cover graphics for Reels, TikToks, and YouTube Shorts featuring large, readable title overlays.',
      },
      {
        id: 'cs4e',
        label: 'Draft SEO-Optimized Video Captions & Tags',
        desc: 'Write video captions featuring primary keywords, a brief summary, call-to-actions, and platform-relevant hashtags.',
      },
    ],
  },
  {
    id: 'cs5',
    num: 5,
    title: 'Paid Advertising & Conversion Funnels',
    tools: ['Meta Ads Manager', 'TikTok Ads Manager', 'LinkedIn Campaign Manager'],
    tip: 'Pair organic social content with paid ad campaigns. Use retargeting campaigns to capture warm leads and turn social views into sales or newsletter signups.',
    subs: [
      {
        id: 'cs5a',
        label: 'Set Up Advertising Accounts & Tracking Pixels',
        desc: 'Install Meta Pixel, TikTok Pixel, and LinkedIn Insight Tag on your website to track landing page conversions.',
      },
      {
        id: 'cs5b',
        label: 'Design Top-of-Funnel (TOFU) Awareness Ads',
        desc: 'Configure ad campaigns to boost best-performing organic social posts to targeted lookalike and interest audiences.',
      },
      {
        id: 'cs5c',
        label: 'Build Middle-of-Funnel (MOFU) Lead Ads',
        desc: 'Create paid lead campaigns offering free downloadable templates, audits, or guidebooks to capture email addresses.',
      },
      {
        id: 'cs5d',
        label: 'Configure Bottom-of-Funnel (BOFU) Retargeting Ads',
        desc: 'Set up ad sequences targetting landing page visitors, checkout abandoners, or video viewers with customer case studies.',
      },
      {
        id: 'cs5e',
        label: 'Design & A/B Test Ad Creatives',
        desc: 'Prepare and test multiple variations of ad formats (e.g., User-Generated Content style, image grids, direct copywriting).',
      },
    ],
  },
  {
    id: 'cs6',
    num: 6,
    title: 'Editorial Calendar & Scheduling Loop',
    tools: ['Buffer', 'Later', 'Notion'],
    tip: 'Create a calendar workflow that helps you schedule posts in advance. This prevents last-minute posting stress and ensures consistency.',
    subs: [
      {
        id: 'cs6a',
        label: 'Build Centralized Social Media Calendar',
        desc: 'Configure a visual calendar board tracking publishing dates, platforms, creative assets, status, and caption copy.',
      },
      {
        id: 'cs6b',
        label: 'Establish Content Approval Workflows',
        desc: 'Set up a step-by-step workflow (e.g. Idea → Scripting → Editing → Copy Review → Approved → Scheduled).',
      },
      {
        id: 'cs6c',
        label: 'Configure Auto-Publishing Platforms',
        desc: 'Connect social accounts to scheduling software (e.g. Later/Buffer) to automate daily post publishing.',
      },
      {
        id: 'cs6d',
        label: 'Align Calendar with Seasonal/Promo Events',
        desc: 'Schedule content campaigns around company product launches, industry seasonal peaks, or holiday promotions.',
      },
      {
        id: 'cs6e',
        label: 'Create Structured Social Asset Library',
        desc: 'Store finished videos, raw clips, graphics, thumbnail templates, and fonts in clean, shared folders.',
      },
    ],
  },
  {
    id: 'cs7',
    num: 7,
    title: 'Influencer Campaigns & UGC Strategy',
    tools: ['HypeAuditor', 'Affiliate Programs', 'Collabstr'],
    tip: 'User-Generated Content (UGC) and creator endorsements build high trust. Create structured influencer partnerships to reach pre-established target communities.',
    subs: [
      {
        id: 'cs7a',
        label: 'Research Niche Micro-Influencers',
        desc: 'Find social creators (1K–50K followers) with high engagement rates and audiences that match your ideal customer profile.',
      },
      {
        id: 'cs7b',
        label: 'Establish Creator Pitch & Outreach Scripts',
        desc: 'Draft templates for product gifting campaigns, affiliate programs, or paid creator partnerships.',
      },
      {
        id: 'cs7c',
        label: 'Create Influencer Agreements & Usage Rights',
        desc: 'Draft simple contracts defining required content deliverables, timelines, tracking links, and digital usage rights.',
      },
      {
        id: 'cs7d',
        label: 'Launch Customer UGC Incentive Programs',
        desc: 'Encourage customer tagging and sharing through unboxing contests, product review rewards, or social challenges.',
      },
      {
        id: 'cs7e',
        label: 'Organize Influencer Asset Tracking System',
        desc: 'Set up a sheet tracking creator names, outreach status, costs, live links, views, and generated sales.',
      },
    ],
  },
  {
    id: 'cs8',
    num: 8,
    title: 'Social Listening & ROI Performance Analytics',
    tools: ['Google Analytics 4', 'Looker Studio', 'Brand24'],
    tip: 'Regularly review your data to see what works. Focus on metrics like click-through rates, profile visits, leads, and conversion sales rather than just likes or follower counts.',
    subs: [
      {
        id: 'cs8a',
        label: 'Configure Social Brand Listening Alerts',
        desc: 'Set up alerts to track brand mentions, direct tags, competitor activity, and industry keywords on social media.',
      },
      {
        id: 'cs8b',
        label: 'Track Monthly Channel Growth Metrics',
        desc: 'Record monthly reach, impressions, followers, and video views for all active profiles to measure top-of-funnel growth.',
      },
      {
        id: 'cs8c',
        label: 'Measure Social Conversion & Lead Inquiries',
        desc: 'Monitor direct link clicks, UTM link parameters in Google Analytics 4, and direct message inquiries to track interest.',
      },
      {
        id: 'cs8d',
        label: 'Build Looker Studio Social ROI Dashboard',
        desc: 'Assemble organic engagement statistics and paid ad spends into an interactive monthly dashboard.',
      },
      {
        id: 'cs8e',
        label: 'Schedule Recurring Content Strategy Audits',
        desc: 'Review data monthly, identify top-performing posts and topics, and adjust the next month\'s production calendar.',
      },
    ],
  },
];
