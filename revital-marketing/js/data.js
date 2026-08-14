/* ============================================================
   REVITAL MARKETING — SEO / SOCIAL HEALTH CHECKLIST DATA
   For Revital's OWN brand (revitalproductions.com, its own social
   channels) - not a client audit. Meant to be run periodically (monthly
   or quarterly), not once - see "Reset for New Cycle" in js/app.js.
   ============================================================ */

const MARKETING_CHECKLIST = [
  {
    category: "Website / SEO",
    items: [
      { id: "mk-gsc", label: "Google Search Console checked for crawl errors / indexing issues" },
      { id: "mk-core-pages", label: "Core pages (home, services, portfolio, contact) load fast and are mobile-friendly" },
      { id: "mk-meta", label: "Meta titles/descriptions current on core pages" },
      { id: "mk-gbp", label: "Google Business Profile fully filled out — hours, services, photos current" },
      { id: "mk-portfolio", label: "Recent client work added to the site's portfolio/case studies" }
    ]
  },
  {
    category: "Social Presence",
    items: [
      { id: "mk-ig-bio", label: "Instagram bio/link current" },
      { id: "mk-li-page", label: "LinkedIn company page current — services, recent posts" },
      { id: "mk-fb-page", label: "Facebook page current (if used)" },
      { id: "mk-profile-images", label: "Profile photo/cover images current across all channels" },
      { id: "mk-posting-gaps", label: "Content calendar above reviewed for dead gaps — nothing scheduled sitting unposted" }
    ]
  },
  {
    category: "Reputation / Proof",
    items: [
      { id: "mk-reviews", label: "Recent Google reviews responded to" },
      { id: "mk-testimonials", label: "Latest testimonials/case studies reflected on the website" },
      { id: "mk-nfc-cards", label: "NFC Google Review Card program still active and stocked" }
    ]
  }
];
