/* ============================================================
   SOCIAL MEDIA AUDIT CHECKLIST — DATA
   All step definitions, sub-tasks, and tool references.
   Edit this file to customise steps, tasks, tips, and tools.
   ============================================================ */

const STEP_COLORS = [
  '#f472b6', // Step 1 — Pink
  '#ec4899', // Step 2 — Dark Pink
  '#fb7185', // Step 3 — Rose
  '#f43f5e', // Step 4 — Dark Rose
  '#c084fc', // Step 5 — Purple (IG specific)
  '#818cf8', // Step 6 — Indigo (TikTok specific)
  '#3b82f6', // Step 7 — Blue (LinkedIn specific)
  '#64748b', // Step 8 — Slate (Analytics specific)
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
    'Audit done',
  ],
  tasks: [
    'Tasks done',
    'Items checked',
    'Actions taken',
    'Tasks complete',
    'Audits passed',
  ],
  remaining: [
    'Still to do',
    'Left to action',
    'Pending items',
    'Gaps remaining',
    'Audit items left',
  ],
  score: [
    'Audit score',
    'Completion %',
    'Channel health',
    'Social score',
    'Profile score',
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
    id: 'sma1',
    num: 1,
    title: 'Bio & Branding Consistency',
    tools: ['Canva', 'Linktree', 'Brand Guidelines'],
    tip: 'Ensure first impressions are clear and professional. Your visual branding and bio copy should tell a new visitor who you are, what you do, and what action they should take in under 3 seconds.',
    subs: [
      {
        id: 'sma1a',
        label: 'Profile Picture & Logo Verification',
        desc: 'Check that profile pictures are high-res, properly centered, recognizable, and consistent across all active platforms.',
      },
      {
        id: 'sma1b',
        label: 'Bio Copy & Value Proposition Optimization',
        desc: 'Ensure bios include a clear value statement, target keywords, active voice, and describe whom the business serves.',
      },
      {
        id: 'sma1c',
        label: 'Link-in-Bio Verification & Structure',
        desc: 'Test the primary profile link. Verify it points to an active landing page or an optimized link-in-bio tool (e.g. Linktree, Beacons) with working links.',
      },
      {
        id: 'sma1d',
        label: 'Username & Handle Alignment',
        desc: 'Confirm the brand uses the same username handle (e.g. @brandname) across all networks, or the closest variations available.',
      },
      {
        id: 'sma1e',
        label: 'Cover Photo & Banner Check',
        desc: 'Review header banners on LinkedIn, Facebook, X, and YouTube to ensure they match current promotions and brand colors.',
      },
    ],
  },
  {
    id: 'sma2',
    num: 2,
    title: 'Profile Content & Posting Cadence',
    tools: ['Later', 'Feed Previewer', 'Notion'],
    tip: 'Review content frequency and grid visual flow. A consistent publishing rhythm keeps your brand top-of-mind and builds platform algorithm momentum.',
    subs: [
      {
        id: 'sma2a',
        label: 'Grid & Feed Visual Layout Review',
        desc: 'Check if the grid/feed visual alignment (on Instagram/TikTok) shows a clean layout structure and consistent color palette.',
      },
      {
        id: 'sma2b',
        label: 'Posting Frequency Audit',
        desc: 'Analyze post timestamps over the last 30 days to flag posting consistency gaps or erratic updates.',
      },
      {
        id: 'sma2c',
        label: 'Pin & Featured Posts Optimization',
        desc: 'Verify that pinned or featured posts at the top of feeds present core offers, best-performing content, or brand introductions.',
      },
      {
        id: 'sma2d',
        label: 'Review Content Format Variety',
        desc: 'Assess the ratio between static image posts, multi-slide carousels, text updates, and short-form videos to ensure variety.',
      },
      {
        id: 'sma2e',
        label: 'Story Highlights Design & Content',
        desc: 'Check that Instagram/Facebook highlights are grouped by topic, use clean cover icons, and contain active, up-to-date links.',
      },
    ],
  },
  {
    id: 'sma3',
    num: 3,
    title: 'Audience Demographics & Engagement',
    tools: ['Instagram Insights', 'TikTok Analytics', 'Brand24'],
    tip: 'Social media is a two-way street. Calculate true engagement rates and inspect community management workflows to make sure audience interactions are nurtured.',
    subs: [
      {
        id: 'sma3a',
        label: 'Calculate Platform Engagement Rates',
        desc: 'Divide average likes, comments, and shares by total followers to find the true platform engagement rate (target 1-3%+).',
      },
      {
        id: 'sma3b',
        label: 'Audit Comment Response Speed & Quality',
        desc: 'Check if the brand responds to all comment questions and inquiries within 12-24 hours with helpful answers.',
      },
      {
        id: 'sma3c',
        label: 'Review DM Inboxes & Auto-Replies',
        desc: 'Test direct message channels. Ensure FAQ quick-responses or automated welcome replies are configured to capture leads.',
      },
      {
        id: 'sma3d',
        label: 'Evaluate Follower Quality & Spam Ratio',
        desc: 'Scan follower lists for bulk bot accounts, inactive profiles, or fake followers that might skew engagement metrics.',
      },
      {
        id: 'sma3e',
        label: 'Monitor Brand Mentions & Community Sentiment',
        desc: 'Audit tagged posts and brand mentions to analyze whether customer sentiment is positive, neutral, or negative.',
      },
    ],
  },
  {
    id: 'sma4',
    num: 4,
    title: 'Short-Form Video Quality (Reels/Shorts)',
    tools: ['CapCut', 'Splice', 'Premiere Pro'],
    tip: 'Short vertical video is the primary engine for organic reach. Focus audits on hook strength, audio clarity, caption layout, and cover visual quality.',
    subs: [
      {
        id: 'sma4a',
        label: 'Evaluate Video Hook Performance',
        desc: 'Analyze video drop-off rates by checking the first 3 seconds. Verify video scripts feature visual/verbal hooks.',
      },
      {
        id: 'sma4b',
        label: 'Check Video Resolution & Lighting',
        desc: 'Ensure videos are uploaded in 1080p, well-lit, steady, and free of blurry screen grabs or distracting background layouts.',
      },
      {
        id: 'sma4c',
        label: 'Audit Audio Quality & Music Settings',
        desc: 'Check voice volume levels, background music, and ensure the brand leverages trending audios to increase reach.',
      },
      {
        id: 'sma4d',
        label: 'Verify On-Screen Subtitles & Captions',
        desc: 'Ensure videos use on-screen subtitles or closed captions to capture the large percentage of users watching on mute.',
      },
      {
        id: 'sma4e',
        label: 'Review Reel/Short Cover Thumbnails',
        desc: 'Verify covers have clean title text overlays and fit the feed aspect ratio grid without cutoffs.',
      },
    ],
  },
  {
    id: 'sma5',
    num: 5,
    title: 'Instagram Specific Features Audit',
    tools: ['Instagram Insights', 'ManyChat'],
    tip: 'Leverage Instagram\'s complete toolbox. Audit feed interactions, carousel progressions, guide layouts, story activity, and automation setups.',
    subs: [
      {
        id: 'sma5a',
        label: 'Analyze Carousel Slide Retention',
        desc: 'Check if multi-slide posts feature progressive steps that encourage swiping to the end, boosting share rates.',
      },
      {
        id: 'sma5b',
        label: 'Audit Instagram Story Activity',
        desc: 'Confirm the brand posts daily stories and utilizes interactive stickers (polls, questions, link stickers) to engage.',
      },
      {
        id: 'sma5c',
        label: 'Review Collaboration Post Usage',
        desc: 'Check if the brand uses Instagram Collab posts to share content directly onto partner and influencer feeds.',
      },
      {
        id: 'sma5d',
        label: 'Verify Tagged & Mentions Feeds',
        desc: 'Review the "Photos of You" tab to hide irrelevant spam tags and ensure customer testimonials are visible.',
      },
      {
        id: 'sma5e',
        label: 'Audit ManyChat / DM Automations',
        desc: 'Verify if automatic keyword triggers (e.g. Comment "GUIDE" to receive PDF) are configured and functioning.',
      },
    ],
  },
  {
    id: 'sma6',
    num: 6,
    title: 'TikTok Specific Features Audit',
    tools: ['TikTok Analytics', 'TikTok Creative Center'],
    tip: 'TikTok requires cultural alignment. Focus audits on video SEO keywords, trending overlays, stitch/duet settings, and playlist structures.',
    subs: [
      {
        id: 'sma6a',
        label: 'Verify Stitch & Duet Permissions',
        desc: 'Ensure stitch, duet, and video response options are toggled ON in account settings to invite community engagement.',
      },
      {
        id: 'sma6b',
        label: 'Review TikTok Playlist Structures',
        desc: 'Check if educational videos are grouped into clean, themed playlists at the top of the feed for easy viewing.',
      },
      {
        id: 'sma6c',
        label: 'Audit TikTok Video SEO Optimization',
        desc: 'Ensure captions, on-screen text overlays, and hashtags contain targeted keywords matching user search bars.',
      },
      {
        id: 'sma6d',
        label: 'Evaluate TikTok Live Utilization',
        desc: 'Assess if the brand uses live streams to answer community questions and build real-time buyer trust.',
      },
      {
        id: 'sma6e',
        label: 'Verify TikTok Creator Q&A Setup',
        desc: 'Confirm the Creator Q&A bio setting is activated to let users post questions directly onto the profile page.',
      },
    ],
  },
  {
    id: 'sma7',
    num: 7,
    title: 'LinkedIn & X (Twitter) Presence',
    tools: ['LinkedIn Analytics', 'TweetDeck', 'Shield App'],
    tip: 'B2B social media has unique rules. Audit employee advocate sharing, long-form post layouts, PDF document carousels, and hashtag sets.',
    subs: [
      {
        id: 'sma7a',
        label: 'Audit Corporate vs. Founder Page Balance',
        desc: 'Assess if executive team members are sharing updates from corporate pages onto their personal feeds (employee advocacy).',
      },
      {
        id: 'sma7b',
        label: 'Review Long-Form Text Readability',
        desc: 'Check if text updates use vertical spacing, bullet points, and clean hooks before the "See More" cutoff line.',
      },
      {
        id: 'sma7c',
        label: 'Verify LinkedIn Document Slideshow Uploads',
        desc: 'Review the frequency of PDF uploads shared as document slideshows (highly favored by the LinkedIn algorithm).',
      },
      {
        id: 'sma7d',
        label: 'Audit X (Twitter) Thread Frequency',
        desc: 'Verify if the brand utilizes connected threads to tell long stories or share detailed industry insights.',
      },
      {
        id: 'sma7e',
        label: 'Review Professional Industry Tagging',
        desc: 'Ensure relevant industry influencers, clients, and partners are tagged correctly in posts to expand network reach.',
      },
    ],
  },
  {
    id: 'sma8',
    num: 8,
    title: 'Conversion Tracking & Performance ROI',
    tools: ['Google Analytics 4', 'Looker Studio', 'UTM Builder'],
    tip: 'Attribution is everything. Confirm that social traffic is mapped using tracking parameters, custom events, and conversions to prove marketing ROI.',
    subs: [
      {
        id: 'sma8a',
        label: 'Verify UTM Parameter Campaign Tagging',
        desc: 'Ensure all profile links and promotion posts use custom UTM campaign parameters (source/medium/campaign).',
      },
      {
        id: 'sma8b',
        label: 'Audit Lead Conversion Actions',
        desc: 'Test page signups and lead magnet submissions coming from social link clicks to ensure they count as conversions.',
      },
      {
        id: 'sma8c',
        label: 'Verify Tracking Pixel Configurations',
        desc: 'Use browser extensions (Meta Pixel Helper, TikTok Pixel Helper) to confirm pixels fire properly on final conversion page loads.',
      },
      {
        id: 'sma8d',
        label: 'Review Monthly Performance Reports',
        desc: 'Verify if social media data is compiled monthly to track changes in engagement, traffic, leads, and sales.',
      },
      {
        id: 'sma8e',
        label: 'Assess Platform Content ROI',
        desc: 'Compare total marketing hours/ad budgets spent against total revenue or leads generated by platform to focus efforts.',
      },
    ],
  },
];
