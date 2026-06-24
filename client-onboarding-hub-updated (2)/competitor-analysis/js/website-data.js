/* ============================================================
   website-data.js — all editable content lives here
   ============================================================ */

const TABLE_ROWS = [
  { label: 'Primary Value Prop',      placeholder: 'e.g. Messaging clarity, core hook...' },
  { label: 'Design & UX Quality',     placeholder: 'e.g. Modern, clean, typography...' },
  { label: 'Mobile Responsive UX',    placeholder: 'e.g. Navigation, scaling, tap-friendly...' },
  { label: 'Key Site Features',       placeholder: 'e.g. Booking, portal, blog, search...' },
  { label: 'Primary CTA & Funnel',    placeholder: 'e.g. Inquire button, lead magnet...' },
  { label: 'SEO & Organic Keywords',  placeholder: 'e.g. Ranks #1 for "X production", backlinks...' },
  { label: 'Load Speed & Perf',       placeholder: 'e.g. Lighthouse score, desktop vs mobile...' },
  { label: 'Technology Stack',        placeholder: 'e.g. Webflow, WordPress, Shopify...' },
  { label: 'Social Proof & Trust',    placeholder: 'e.g. Testimonials, logos, case studies...' },
  { label: 'Navigation & Structure',  placeholder: 'e.g. Simple, intuitive menu, internal links...' }
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
    placeholder: 'What does your website do better? Clearer value prop, faster speed, better conversion...',
    prompts: [
      'Our website loads significantly faster than competitors because ___',
      'Our primary value proposition is clearer above the fold: ___',
      'We offer an interactive tool/calculator that they lack: ___',
      'Our responsive layout and mobile menu are more intuitive',
      'We showcase stronger client video testimonials and social proof',
      'Our contact form is shorter and easier to fill out',
      'Our website branding is more modern and premium than theirs',
      'We have a dedicated client portal that increases retention'
    ]
  },
  {
    key: 'w',
    label: 'Weaknesses',
    sub: 'To address',
    headClass: 'w',
    borderColor: '#f5735a',
    placeholder: 'Where do competitor websites outperform yours? Domain authority, resources...',
    prompts: [
      'Our website load time on mobile is slow, causing bounces',
      'We lack clear navigation and visitors get lost looking for ___',
      'Competitors rank higher for main industry keywords because ___',
      'Our typography and color styling feel outdated',
      'We do not have a resource/blog section to attract top-of-funnel traffic',
      'Our website does not make it easy to book a call directly',
      'We do not display client logos or reviews on the homepage',
      'Our website copy is too long and complex for quick reading'
    ]
  },
  {
    key: 'o',
    label: 'Opportunities',
    sub: 'Market gaps',
    headClass: 'o',
    borderColor: '#4aaaf0',
    placeholder: 'Feature gaps, SEO keywords, emerging design layouts...',
    prompts: [
      'We can target local keywords that competitors are ignoring, e.g. ___',
      'None of the competitors have a self-serve booking calendar',
      'We can add a dynamic FAQ section matching recent search trends',
      'Adding video background headers can set us apart visually',
      'We can launch a high-value lead magnet (e.g. guide or audit tool)',
      'No competitor explains their production process visually; we can do this',
      'We can build a resource center to capture educational searches',
      'Improving our Google Lighthouse score can boost our ranking'
    ]
  },
  {
    key: 't',
    label: 'Threats',
    sub: 'To watch',
    headClass: 't',
    borderColor: '#f57ac9',
    placeholder: 'Competitor redesigns, search trends, AI search impact...',
    prompts: [
      '___ competitor just launched a fully custom modern redesign',
      'Competitors have very high Domain Authority, making SEO hard to beat',
      'Search engines are using AI overviews, reducing organic traffic to blog links',
      'Competitors are running paid search ads for our primary services',
      'They have automated chatbot workflows that capture leads instantly',
      'Their website has translated versions, capturing international clients',
      'Algorithm updates might penalize sites with our current stack',
      'Competitors are offering free tools/checklists that dominate search traffic'
    ]
  }
];
