/* ============================================================
   SERVICE CATALOG — shared between the Proposal Calculator and
   the Service Pricing Admin window. This is the single list of
   every service, its category, and its DEFAULT price/fee-type -
   the same values baked into the calculator's checkboxes as
   data-price/data-fee attributes. Admin overrides live separately
   in Firestore (agency/servicePricing) and take priority over
   these defaults at runtime; this file is only the baseline/
   fallback list, generated from the calculator's own markup so
   the two can never drift out of sync on WHICH services exist.
   ============================================================ */

const SERVICE_CATALOG = [
  {
    "category": "📣 Organic Social",
    "services": [
      {
        "name": "Feed Posts (static images, carousels)",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Reels & Short-Form Video",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Stories",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Community Management (responding to comments, DMs, engaging followers)",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Content Calendar Management",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Hashtag Strategy",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Profile Optimization",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Social Listening & Trend Monitoring",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      }
    ]
  },
  {
    "category": "💰 Paid Social",
    "services": [
      {
        "name": "Meta Ads (Facebook + Instagram)",
        "defaultPrice": 1000,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "TikTok Ads",
        "defaultPrice": 1200,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "LinkedIn Ads",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Pinterest Ads",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Snapchat Ads",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Audience Research & Targeting",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Ad Creative Production",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Campaign Setup & Management",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "A/B Testing",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Retargeting Campaigns",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Budget Management & Reporting",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      }
    ]
  },
  {
    "category": "🔍 Paid Search",
    "services": [
      {
        "name": "Google Ads — Search",
        "defaultPrice": 1000,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Google Ads — Display",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Google Ads — Performance Max",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Google Ads — Shopping",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Keyword Research",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Ad Copywriting",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Landing Page Recommendations",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Bid Strategy Management",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Conversion Tracking Setup",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Quality Score Optimization",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      }
    ]
  },
  {
    "category": "🌐 SEO",
    "services": [
      {
        "name": "On-Page SEO (meta titles, descriptions, headers, content optimization)",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Technical SEO (site speed, crawlability, schema markup)",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Local SEO (Google Business Profile, local citations, NAP consistency)",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Off-Page SEO (link building, backlink outreach)",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Keyword Research & Strategy",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "SEO Content Writing (blog posts, landing pages)",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "SEO Audits",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Google Search Console Management",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Rank Tracking & Reporting",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      }
    ]
  },
  {
    "category": "📧 Email Marketing",
    "services": [
      {
        "name": "Newsletter Campaigns",
        "defaultPrice": 1500,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Promotional Emails",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Drip / Nurture Sequences",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Welcome Sequences",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Re-engagement Campaigns",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "List Building & Growth",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "List Segmentation & Hygiene",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Email Copywriting",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Template Design",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "A/B Testing (subject lines, send times, CTAs)",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Platform Setup & Integration (Mailchimp, Klaviyo, ActiveCampaign, etc.)",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Performance Reporting",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      }
    ]
  },
  {
    "category": "🌐 Website Design",
    "services": [
      {
        "name": "New Website Builds",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Website Redesigns",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Landing Page Design & Development",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Website Maintenance & Updates",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "UX/UI Optimization",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Conversion Rate Optimization (CRO)",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Speed & Performance Optimization",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Mobile Responsiveness",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Hosting & Domain Management",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Analytics Setup (GA4, Meta Pixel, GTM)",
        "defaultPrice": 800,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "E-commerce Setup (Shopify, WooCommerce)",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Platform Support: WordPress, Shopify, Webflow, Squarespace, Wix",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      }
    ]
  },
  {
    "category": "🎯 Inbound Marketing",
    "services": [
      {
        "name": "Content Strategy Development",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Blog Writing & Management",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Lead Magnet Creation (guides, checklists, templates, free audits)",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Landing Page Copywriting",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Lead Capture Form Setup",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Marketing Funnel Build",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "CTA Strategy",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Content Distribution",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Organic Lead Generation",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Marketing Automation Setup",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      }
    ]
  },
  {
    "category": "🗺️ Strategy",
    "services": [
      {
        "name": "Marketing Audit (full assessment of current marketing efforts)",
        "defaultPrice": 1500,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Competitor Analysis",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Brand Positioning",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Go-To-Market Strategy",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Quarterly Marketing Planning",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Campaign Strategy",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "KPI Framework Development",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Analytics & Data Interpretation",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Marketing Roadmap Development",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Consulting & Advisory",
        "defaultPrice": 0,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      }
    ]
  },
  {
    "category": "💻 Software & Tech Stack",
    "services": [
      {
        "name": "HubSpot Marketing Hub",
        "defaultPrice": 800,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Sprout Social Seat",
        "defaultPrice": 250,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      },
      {
        "name": "Klaviyo Base Plan",
        "defaultPrice": 50,
        "defaultFeeType": "monthly",
        "defaultCost": 0
      }
    ]
  },
  {
    "category": "🎨 Branding & Design",
    "services": [
      {
        "name": "Brand Strategy Session",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Primary Logo Design",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Logo Variations & Submark",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Color Palette & Typography System",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Brand Style Guide / Guidelines",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Social Media Profile Graphics",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Branded Social Media Templates",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      },
      {
        "name": "Business Card / Promotional Design",
        "defaultPrice": 0,
        "defaultFeeType": "setup",
        "defaultCost": 0
      }
    ]
  }
];
