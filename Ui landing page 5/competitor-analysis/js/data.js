/* ============================================================
   data.js — all editable content lives here
   Edit this file to customize rows, prompts, and SWOT cards.
   ============================================================ */

const TABLE_ROWS = [
  { label: 'Followers',              placeholder: 'e.g. 120K IG, 45K TT' },
  { label: 'Posting Frequency',      placeholder: 'e.g. Daily reels, 3x/week' },
  { label: 'Content Style',          placeholder: 'Cinematic, UGC, editorial…' },
  { label: 'Engagement Rate',        placeholder: 'e.g. ~3.2% avg' },
  { label: 'Avg Video Views',        placeholder: 'e.g. 50K per reel' },
  { label: 'Best Performing Content',placeholder: 'BTS, client results, trends…' },
  { label: 'Pricing Model',          placeholder: 'Retainer / project / hourly' },
  { label: 'Brand Identity',         placeholder: 'Tone, aesthetic, positioning…' },
  { label: 'Target Clients',         placeholder: 'SMBs, lifestyle brands…' },
];

const COMPETITOR_COLORS = {
  a: '#4aaaf0', // Blue
  b: '#6fde8e', // Green
  c: '#f5735a', // Coral
};

const SWOT_DATA = [
  {
    key: 's',
    label: 'Strengths',
    sub: 'You vs. them',
    headClass: 's',
    borderColor: '#6fde8e',
    placeholder: 'What do you do better? Full-service team, faster turnaround, stronger storytelling…',
    prompts: [
      'We turn projects around faster than competitors because ___',
      'Our content quality stands out because ___',
      'We offer something competitors don\'t: ___',
      'Clients choose us over others because ___',
      'Our team\'s unique skill or background is ___',
      'We have stronger relationships in ___ industry/niche',
      'Our pricing is more competitive because ___',
      'We\'re better at storytelling / brand voice because ___',
    ],
  },
  {
    key: 'w',
    label: 'Weaknesses',
    sub: 'To address',
    headClass: 'w',
    borderColor: '#f5735a',
    placeholder: 'Where do competitors outperform you? Brand recognition, niche expertise…',
    prompts: [
      'We lack brand recognition in ___ market',
      'Competitors have a larger following on ___',
      'We don\'t yet offer ___ as a service',
      'Our content on ___ platform is underdeveloped',
      'We lose clients to competitors on price because ___',
      'Our team is missing expertise in ___',
      'We don\'t have enough case studies or social proof in ___',
      'Our onboarding / client process needs work in ___',
    ],
  },
  {
    key: 'o',
    label: 'Opportunities',
    sub: 'Market gaps',
    headClass: 'o',
    borderColor: '#4aaaf0',
    placeholder: 'Underserved niches, emerging platforms, verticals they ignore…',
    prompts: [
      'No competitor is strongly serving ___ type of client',
      '___ platform is growing but competitors aren\'t on it yet',
      'There\'s demand for ___ style of content nobody does well',
      'We could white-label or partner with ___',
      '___ industry is underserved for content production',
      'Brands are moving from ___ toward ___ — we can lead that',
      'There\'s a gap in ___ price range we could own',
      'A trend we can capitalize on before competitors: ___',
    ],
  },
  {
    key: 't',
    label: 'Threats',
    sub: 'To watch',
    headClass: 't',
    borderColor: '#f57ac9',
    placeholder: 'Competitor pivots, pricing pressure, AI tools, algorithm shifts…',
    prompts: [
      '___ competitor is growing fast targeting our same clients',
      'AI tools like ___ could undercut our pricing or workflow',
      '___ platform\'s algorithm change could hurt content reach',
      'Clients are cutting budgets in ___ area',
      'A new competitor just entered the market offering ___',
      'Trends are shifting away from ___ content we specialize in',
      'Talent / freelancer costs are rising in ___',
      'Clients are starting to bring ___ in-house instead',
    ],
  },
];
