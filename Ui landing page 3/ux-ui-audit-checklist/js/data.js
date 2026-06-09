/* ============================================================
   UX/UI AUDIT CHECKLIST — DATA
   All step definitions, sub-tasks, and tool references.
   Edit this file to customise steps, tasks, tips, and tools.
   ============================================================ */

const STEP_COLORS = [
  '#c084fc', // Step 1 — purple
  '#818cf8', // Step 2 — indigo
  '#38bdf8', // Step 3 — sky blue
  '#2dd4bf', // Step 4 — teal
  '#34d399', // Step 5 — emerald
  '#fb7185', // Step 6 — rose
  '#f472b6', // Step 7 — pink
  '#a1a1aa', // Step 8 — slate
];

/* ----------------------------------------------------------------
   METRIC LABEL SETS
   Each score card cycles through these label variants over time.
   Edit or add labels — they rotate on a staggered interval.
   ---------------------------------------------------------------- */
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
    'Friction points',
    'Items remaining',
  ],
  score: [
    'UX/UI score',
    'Completion %',
    'Overall health',
    'Progress score',
    'UX readiness',
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
    id: 's1',
    num: 1,
    title: 'First Impressions & Value Proposition',
    tools: ['Hotjar', 'Google Analytics'],
    tip: 'Evaluate the homepage within the first 5 seconds. The user should instantly understand what the business does, who it is for, and the primary action they should take.',
    subs: [
      {
        id: 's1a',
        label: 'Assess the Above-the-Fold clarity',
        desc: 'Ensure the primary value proposition (Headline + Subheadline) is visible without scrolling and states the core benefit clearly.',
      },
      {
        id: 's1b',
        label: 'Verify the Primary Call-to-Action (CTA)',
        desc: 'Check that there is one clear, high-contrast primary CTA button above the fold.',
      },
      {
        id: 's1c',
        label: 'Check Visual Hierarchy of Hero Section',
        desc: 'Ensure the hero image/video supports the value proposition and does not compete with the CTA or text.',
      },
      {
        id: 's1d',
        label: 'Establish Brand Trust Indicators',
        desc: 'Check for immediate trust factors like client logos, testimonials, or ratings visible near the top.',
      },
      {
        id: 's1e',
        label: 'Evaluate First Load Friction',
        desc: 'Ensure there are no intrusive popups, cookie consent banners, or chatbots blocking the primary value proposition immediately upon loading.',
      },
    ],
  },
  {
    id: 's2',
    num: 2,
    title: 'Navigation & Information Architecture',
    tools: ['Card Sorting', 'UserTesting'],
    tip: 'Navigation should be predictive and simple. Limit main menu items to 5–7 categories. Keep the labels descriptive and clear, avoiding jargon.',
    subs: [
      {
        id: 's2a',
        label: 'Audit Navigation Menu Labels',
        desc: 'Ensure menu links use standard, descriptive terms (e.g., "Services" rather than "What We Do") for ease of understanding.',
      },
      {
        id: 's2b',
        label: 'Test Search Bar Prominence & Quality',
        desc: 'Ensure the search input is easy to find, provides autocomplete suggestions, and handles typos or empty results gracefully.',
      },
      {
        id: 's2c',
        label: 'Verify Footer Structure',
        desc: 'Footer should act as a safety net, containing sitemap links, contact info, privacy policy, and social links in a structured layout.',
      },
      {
        id: 's2d',
        label: 'Check Breadcrumbs for Deep Pages',
        desc: 'Verify that breadcrumb trails exist on multi-level pages so users can easily navigate back to parent categories.',
      },
      {
        id: 's2e',
        label: 'Evaluate User Journey Paths',
        desc: 'Ensure that standard user flows (like finding pricing or contacting support) take fewer than 3 clicks from any page.',
      },
    ],
  },
  {
    id: 's3',
    num: 3,
    title: 'Mobile Responsiveness & Touch Experience',
    tools: ['Chrome DevTools', 'Mobile Devices'],
    tip: 'Over 60% of web traffic is mobile. Design for mobile-first. Ensure all clickable elements (buttons, links, form inputs) are easily tappable with a thumb without misclicks.',
    subs: [
      {
        id: 's3a',
        label: 'Inspect Viewport and Zoom Settings',
        desc: 'Ensure the viewport is responsive and horizontal scrolling is completely eliminated on all mobile devices.',
      },
      {
        id: 's3b',
        label: 'Verify Tap Target Sizes (min 48x48px)',
        desc: 'Ensure all buttons, icons, and text links have a minimum hit area of 48x48px with at least 8px of spacing between them.',
      },
      {
        id: 's3c',
        label: 'Check Mobile Menu (Hamburger) Usability',
        desc: 'Ensure the mobile menu is easy to trigger, closes easily, and displays items in an readable, screen-fitting list.',
      },
      {
        id: 's3d',
        label: 'Optimize Sticky Navigation & Header',
        desc: 'Verify that the header shrinks or hides on scroll-down and reappears on scroll-up to maximize mobile viewport space.',
      },
      {
        id: 's3e',
        label: 'Ensure Media Responsiveness',
        desc: 'Check that images, videos, and tables scale properly without overflowing the container or shrinking to unreadable sizes.',
      },
    ],
  },
  {
    id: 's4',
    num: 4,
    title: 'Forms & Input Fields',
    tools: ['Typeform', 'Formisimo'],
    tip: 'Forms are critical friction points. Minimize fields, use inline validation, and make inputs easy to select. Every extra field decreases conversion rate.',
    subs: [
      {
        id: 's4a',
        label: 'Implement Single-Column Layouts',
        desc: 'Group form fields vertically in a single column to reduce visual complexity and cognitive load.',
      },
      {
        id: 's4b',
        label: 'Use Clear Labels and Persistent Placeholders',
        desc: 'Ensure labels remain visible (or float) when the user types. Never use placeholders as labels.',
      },
      {
        id: 's4c',
        label: 'Apply Real-time Inline Validation',
        desc: 'Show success/error messages immediately after the user completes a field, rather than waiting for submission.',
      },
      {
        id: 's4d',
        label: 'Enable Auto-fill & Input Helpers',
        desc: 'Use correct HTML input attributes (e.g., email, tel, autocomplete) to enable mobile autofill and display correct keyboard layouts.',
      },
      {
        id: 's4e',
        label: 'Provide a Clear Success State',
        desc: 'Ensure form submission displays a clear success message, redirects to a thank you page, and disables the submit button to prevent double-clicks.',
      },
    ],
  },
  {
    id: 's5',
    num: 5,
    title: 'Accessibility & Readability (a11y)',
    tools: ['Lighthouse', 'WAVE Tool', 'Contrast Checker'],
    tip: 'Accessibility ensures all users can interact with your product. Aim for WCAG 2.1 AA compliance. High contrast and keyboard navigation are core requirements.',
    subs: [
      {
        id: 's5a',
        label: 'Verify Text Contrast Ratios (min 4.5:1)',
        desc: 'Ensure body text has a contrast ratio of at least 4.5:1 (3:1 for large text) against its background.',
      },
      {
        id: 's5b',
        label: 'Test Keyboard-Only Navigation',
        desc: 'Ensure a user can navigate the entire site using only the Tab, Enter, and Arrow keys, with a highly visible focus indicator.',
      },
      {
        id: 's5c',
        label: 'Check Image Alt Tags & Aria Attributes',
        desc: 'Confirm all meaningful images have descriptive alt text, and decorative icons have aria-hidden="true".',
      },
      {
        id: 's5d',
        label: 'Ensure Font Scaling & Zoom Support',
        desc: 'Verify that the website layout remains functional when browser text size is zoomed up to 200%.',
      },
      {
        id: 's5e',
        label: 'Use Semantics for Screen Readers',
        desc: 'Check that headers (h1–h6), buttons, and links use correct HTML elements to communicate structure to assistive tools.',
      },
    ],
  },
  {
    id: 's6',
    num: 6,
    title: 'Visual Design, Layout & Typography',
    tools: ['Figma', 'Grid Ruler'],
    tip: 'Consistency builds trust. Establish a clear typographical hierarchy, align elements to a grid, and use whitespace to let the design breathe.',
    subs: [
      {
        id: 's6a',
        label: 'Check Color Palette Consistency',
        desc: 'Limit the primary palette to 3 colors (60-30-10 rule: 60% dominant, 30% secondary, 10% accent) and ensure consistent application.',
      },
      {
        id: 's6b',
        label: 'Verify Typographical Hierarchy',
        desc: 'Check that there are distinct styling differences (font-family, size, weight, line-height) between headers and body copy.',
      },
      {
        id: 's6c',
        label: 'Ensure Reading Comfort (Line Length & Height)',
        desc: 'Limit text column widths to 45–75 characters per line, and set body line-height to 1.5–1.6.',
      },
      {
        id: 's6d',
        label: 'Apply Consistent Spacing (Grid System)',
        desc: 'Align components to a consistent spacing scale (e.g., 4px, 8px, 16px, 24px) to create visual rhythm.',
      },
      {
        id: 's6e',
        label: 'Evaluate Whitespace (Negative Space)',
        desc: 'Ensure sections and elements have adequate spacing so the layout does not feel cramped or cluttered.',
      },
    ],
  },
  {
    id: 's7',
    num: 7,
    title: 'Interaction Design & Micro-animations',
    tools: ['Chrome DevTools', 'CSS Transitions'],
    tip: 'Feedback loops make interfaces feel alive and responsive. Provide immediate visual feedback for all user actions like clicks, hovers, and submissions.',
    subs: [
      {
        id: 's7a',
        label: 'Audit Button Hover & Active States',
        desc: 'Verify that all clickable elements change state (color, shadow, or scale) on hover, focus, and active clicks.',
      },
      {
        id: 's7b',
        label: 'Implement Intuitive Transition Durations',
        desc: 'Keep animations and transitions subtle and fast (between 150ms and 300ms) to prevent feeling sluggish.',
      },
      {
        id: 's7c',
        label: 'Use Loading and Progress Indicators',
        desc: 'For any action taking longer than 1 second, display a spinner, progress bar, or skeleton loader to set expectations.',
      },
      {
        id: 's7d',
        label: 'Verify Feedback Messages (Toasts & Alerts)',
        desc: 'Ensure system messages (success, warning, error) appear in a consistent location and remain visible long enough to be read.',
      },
      {
        id: 's7e',
        label: 'Prevent Accidental Clicks (Disable Buttons)',
        desc: 'Immediately disable submit or action buttons after they are clicked to prevent duplicate transactions or API requests.',
      },
    ],
  },
  {
    id: 's8',
    num: 8,
    title: 'Speed Perception & Error Prevention',
    tools: ['GTmetrix', 'PageSpeed Insights'],
    tip: 'Design to reduce cognitive load and prevent errors. When errors or empty states occur, explain why they happened and provide a clear way forward.',
    subs: [
      {
        id: 's8a',
        label: 'Optimize Perception of Loading Time',
        desc: 'Use lazy loading, skeleton screens, and critical CSS rendering to make the page feel fast even on slower connections.',
      },
      {
        id: 's8b',
        label: 'Redesign Empty States with Action Items',
        desc: 'When lists, carts, or searches are empty, show a helpful graphic and a direct CTA (e.g., "Start Shopping").',
      },
      {
        id: 's8c',
        label: 'Create a Helpful, Brand-aligned 404 Page',
        desc: 'Provide a friendly 404 error message, a search bar, and links back to the home page or main sections.',
      },
      {
        id: 's8d',
        label: 'Implement Undo Actions for Deletions',
        desc: 'For critical actions (like deleting an item), allow the user to "Undo" easily, rather than showing disruptive confirmation modals.',
      },
      {
        id: 's8e',
        label: 'Perform Cognitive Load Review',
        desc: 'Review the entire site to remove unnecessary steps, text, or visual clutter that distracts users from their goals.',
      },
    ],
  },
];
