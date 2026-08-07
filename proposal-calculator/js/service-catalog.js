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
        "defaultPrice": 350,
        "defaultFeeType": "monthly",
        "defaultCost": 105
      },
      {
        "name": "Reels & Short-Form Video",
        "defaultPrice": 400,
        "defaultFeeType": "monthly",
        "defaultCost": 120
      },
      {
        "name": "Stories",
        "defaultPrice": 150,
        "defaultFeeType": "monthly",
        "defaultCost": 45
      },
      {
        "name": "Community Management (responding to comments, DMs, engaging followers)",
        "defaultPrice": 250,
        "defaultFeeType": "monthly",
        "defaultCost": 75
      },
      {
        "name": "Content Calendar Management",
        "defaultPrice": 200,
        "defaultFeeType": "monthly",
        "defaultCost": 60
      },
      {
        "name": "Hashtag Strategy",
        "defaultPrice": 100,
        "defaultFeeType": "monthly",
        "defaultCost": 30
      },
      {
        "name": "Profile Optimization",
        "defaultPrice": 100,
        "defaultFeeType": "monthly",
        "defaultCost": 30
      },
      {
        "name": "Social Listening & Trend Monitoring",
        "defaultPrice": 150,
        "defaultFeeType": "monthly",
        "defaultCost": 45
      }
    ]
  },
  {
    "category": "💰 Paid Social",
    "services": [
      {
        "name": "Meta Ads (Facebook + Instagram)",
        "defaultPrice": 600,
        "defaultFeeType": "monthly",
        "defaultCost": 180
      },
      {
        "name": "TikTok Ads",
        "defaultPrice": 500,
        "defaultFeeType": "monthly",
        "defaultCost": 150
      },
      {
        "name": "LinkedIn Ads",
        "defaultPrice": 600,
        "defaultFeeType": "monthly",
        "defaultCost": 180
      },
      {
        "name": "Pinterest Ads",
        "defaultPrice": 350,
        "defaultFeeType": "monthly",
        "defaultCost": 105
      },
      {
        "name": "Snapchat Ads",
        "defaultPrice": 350,
        "defaultFeeType": "monthly",
        "defaultCost": 105
      },
      {
        "name": "Audience Research & Targeting",
        "defaultPrice": 200,
        "defaultFeeType": "monthly",
        "defaultCost": 60
      },
      {
        "name": "Ad Creative Production",
        "defaultPrice": 300,
        "defaultFeeType": "monthly",
        "defaultCost": 90
      },
      {
        "name": "Campaign Setup & Management",
        "defaultPrice": 500,
        "defaultFeeType": "setup",
        "defaultCost": 200
      },
      {
        "name": "A/B Testing",
        "defaultPrice": 150,
        "defaultFeeType": "monthly",
        "defaultCost": 45
      },
      {
        "name": "Retargeting Campaigns",
        "defaultPrice": 250,
        "defaultFeeType": "monthly",
        "defaultCost": 75
      },
      {
        "name": "Budget Management & Reporting",
        "defaultPrice": 150,
        "defaultFeeType": "monthly",
        "defaultCost": 45
      }
    ]
  },
  {
    "category": "🔍 Paid Search",
    "services": [
      {
        "name": "Google Ads — Search",
        "defaultPrice": 700,
        "defaultFeeType": "monthly",
        "defaultCost": 210
      },
      {
        "name": "Google Ads — Display",
        "defaultPrice": 500,
        "defaultFeeType": "monthly",
        "defaultCost": 150
      },
      {
        "name": "Google Ads — Performance Max",
        "defaultPrice": 600,
        "defaultFeeType": "monthly",
        "defaultCost": 180
      },
      {
        "name": "Google Ads — Shopping",
        "defaultPrice": 500,
        "defaultFeeType": "monthly",
        "defaultCost": 150
      },
      {
        "name": "Keyword Research",
        "defaultPrice": 200,
        "defaultFeeType": "monthly",
        "defaultCost": 60
      },
      {
        "name": "Ad Copywriting",
        "defaultPrice": 200,
        "defaultFeeType": "monthly",
        "defaultCost": 60
      },
      {
        "name": "Landing Page Recommendations",
        "defaultPrice": 150,
        "defaultFeeType": "monthly",
        "defaultCost": 45
      },
      {
        "name": "Bid Strategy Management",
        "defaultPrice": 200,
        "defaultFeeType": "monthly",
        "defaultCost": 60
      },
      {
        "name": "Conversion Tracking Setup",
        "defaultPrice": 350,
        "defaultFeeType": "setup",
        "defaultCost": 140
      },
      {
        "name": "Quality Score Optimization",
        "defaultPrice": 150,
        "defaultFeeType": "monthly",
        "defaultCost": 45
      }
    ]
  },
  {
    "category": "🌐 SEO",
    "services": [
      {
        "name": "On-Page SEO (meta titles, descriptions, headers, content optimization)",
        "defaultPrice": 400,
        "defaultFeeType": "monthly",
        "defaultCost": 120
      },
      {
        "name": "Technical SEO (site speed, crawlability, schema markup)",
        "defaultPrice": 350,
        "defaultFeeType": "monthly",
        "defaultCost": 105
      },
      {
        "name": "Local SEO (Google Business Profile, local citations, NAP consistency)",
        "defaultPrice": 450,
        "defaultFeeType": "monthly",
        "defaultCost": 135
      },
      {
        "name": "Off-Page SEO (link building, backlink outreach)",
        "defaultPrice": 400,
        "defaultFeeType": "monthly",
        "defaultCost": 120
      },
      {
        "name": "Keyword Research & Strategy",
        "defaultPrice": 200,
        "defaultFeeType": "monthly",
        "defaultCost": 60
      },
      {
        "name": "SEO Content Writing (blog posts, landing pages)",
        "defaultPrice": 350,
        "defaultFeeType": "monthly",
        "defaultCost": 105
      },
      {
        "name": "SEO Audits",
        "defaultPrice": 500,
        "defaultFeeType": "setup",
        "defaultCost": 200
      },
      {
        "name": "Google Search Console Management",
        "defaultPrice": 150,
        "defaultFeeType": "monthly",
        "defaultCost": 45
      },
      {
        "name": "Rank Tracking & Reporting",
        "defaultPrice": 150,
        "defaultFeeType": "monthly",
        "defaultCost": 45
      }
    ]
  },
  {
    "category": "📧 Email Marketing",
    "services": [
      {
        "name": "Newsletter Campaigns",
        "defaultPrice": 250,
        "defaultFeeType": "monthly",
        "defaultCost": 75
      },
      {
        "name": "Promotional Emails",
        "defaultPrice": 200,
        "defaultFeeType": "monthly",
        "defaultCost": 60
      },
      {
        "name": "Drip / Nurture Sequences",
        "defaultPrice": 300,
        "defaultFeeType": "monthly",
        "defaultCost": 90
      },
      {
        "name": "Welcome Sequences",
        "defaultPrice": 150,
        "defaultFeeType": "monthly",
        "defaultCost": 45
      },
      {
        "name": "Re-engagement Campaigns",
        "defaultPrice": 200,
        "defaultFeeType": "monthly",
        "defaultCost": 60
      },
      {
        "name": "List Building & Growth",
        "defaultPrice": 300,
        "defaultFeeType": "setup",
        "defaultCost": 120
      },
      {
        "name": "List Segmentation & Hygiene",
        "defaultPrice": 150,
        "defaultFeeType": "monthly",
        "defaultCost": 45
      },
      {
        "name": "Email Copywriting",
        "defaultPrice": 200,
        "defaultFeeType": "monthly",
        "defaultCost": 60
      },
      {
        "name": "Template Design",
        "defaultPrice": 250,
        "defaultFeeType": "monthly",
        "defaultCost": 75
      },
      {
        "name": "A/B Testing (subject lines, send times, CTAs)",
        "defaultPrice": 100,
        "defaultFeeType": "monthly",
        "defaultCost": 30
      },
      {
        "name": "Platform Setup & Integration (Mailchimp, Klaviyo, ActiveCampaign, etc.)",
        "defaultPrice": 400,
        "defaultFeeType": "setup",
        "defaultCost": 160
      },
      {
        "name": "Performance Reporting",
        "defaultPrice": 100,
        "defaultFeeType": "monthly",
        "defaultCost": 30
      }
    ]
  },
  {
    "category": "🌐 Website Design",
    "services": [
      {
        "name": "New Website Builds",
        "defaultPrice": 3500,
        "defaultFeeType": "setup",
        "defaultCost": 1400
      },
      {
        "name": "Website Redesigns",
        "defaultPrice": 500,
        "defaultFeeType": "monthly",
        "defaultCost": 150
      },
      {
        "name": "Landing Page Design & Development",
        "defaultPrice": 600,
        "defaultFeeType": "setup",
        "defaultCost": 240
      },
      {
        "name": "Website Maintenance & Updates",
        "defaultPrice": 150,
        "defaultFeeType": "monthly",
        "defaultCost": 45
      },
      {
        "name": "UX/UI Optimization",
        "defaultPrice": 300,
        "defaultFeeType": "monthly",
        "defaultCost": 90
      },
      {
        "name": "Conversion Rate Optimization (CRO)",
        "defaultPrice": 300,
        "defaultFeeType": "monthly",
        "defaultCost": 90
      },
      {
        "name": "Speed & Performance Optimization",
        "defaultPrice": 200,
        "defaultFeeType": "monthly",
        "defaultCost": 60
      },
      {
        "name": "Mobile Responsiveness",
        "defaultPrice": 150,
        "defaultFeeType": "monthly",
        "defaultCost": 45
      },
      {
        "name": "Hosting & Domain Management",
        "defaultPrice": 50,
        "defaultFeeType": "monthly",
        "defaultCost": 15
      },
      {
        "name": "Analytics Setup (GA4, Meta Pixel, GTM)",
        "defaultPrice": 300,
        "defaultFeeType": "setup",
        "defaultCost": 120
      },
      {
        "name": "E-commerce Setup (Shopify, WooCommerce)",
        "defaultPrice": 800,
        "defaultFeeType": "setup",
        "defaultCost": 320
      },
      {
        "name": "Platform Support: WordPress, Shopify, Webflow, Squarespace, Wix",
        "defaultPrice": 150,
        "defaultFeeType": "monthly",
        "defaultCost": 45
      }
    ]
  },
  {
    "category": "🎯 Inbound Marketing",
    "services": [
      {
        "name": "Content Strategy Development",
        "defaultPrice": 500,
        "defaultFeeType": "setup",
        "defaultCost": 200
      },
      {
        "name": "Blog Writing & Management",
        "defaultPrice": 300,
        "defaultFeeType": "monthly",
        "defaultCost": 90
      },
      {
        "name": "Lead Magnet Creation (guides, checklists, templates, free audits)",
        "defaultPrice": 400,
        "defaultFeeType": "setup",
        "defaultCost": 160
      },
      {
        "name": "Landing Page Copywriting",
        "defaultPrice": 250,
        "defaultFeeType": "monthly",
        "defaultCost": 75
      },
      {
        "name": "Lead Capture Form Setup",
        "defaultPrice": 200,
        "defaultFeeType": "setup",
        "defaultCost": 80
      },
      {
        "name": "Marketing Funnel Build",
        "defaultPrice": 800,
        "defaultFeeType": "setup",
        "defaultCost": 320
      },
      {
        "name": "CTA Strategy",
        "defaultPrice": 100,
        "defaultFeeType": "monthly",
        "defaultCost": 30
      },
      {
        "name": "Content Distribution",
        "defaultPrice": 200,
        "defaultFeeType": "monthly",
        "defaultCost": 60
      },
      {
        "name": "Organic Lead Generation",
        "defaultPrice": 300,
        "defaultFeeType": "monthly",
        "defaultCost": 90
      },
      {
        "name": "Marketing Automation Setup",
        "defaultPrice": 600,
        "defaultFeeType": "setup",
        "defaultCost": 240
      }
    ]
  },
  {
    "category": "🗺️ Strategy",
    "services": [
      {
        "name": "Marketing Audit (full assessment of current marketing efforts)",
        "defaultPrice": 600,
        "defaultFeeType": "setup",
        "defaultCost": 240
      },
      {
        "name": "Competitor Analysis",
        "defaultPrice": 250,
        "defaultFeeType": "monthly",
        "defaultCost": 75
      },
      {
        "name": "Brand Positioning",
        "defaultPrice": 400,
        "defaultFeeType": "monthly",
        "defaultCost": 120
      },
      {
        "name": "Go-To-Market Strategy",
        "defaultPrice": 500,
        "defaultFeeType": "monthly",
        "defaultCost": 150
      },
      {
        "name": "Quarterly Marketing Planning",
        "defaultPrice": 300,
        "defaultFeeType": "monthly",
        "defaultCost": 90
      },
      {
        "name": "Campaign Strategy",
        "defaultPrice": 300,
        "defaultFeeType": "monthly",
        "defaultCost": 90
      },
      {
        "name": "KPI Framework Development",
        "defaultPrice": 400,
        "defaultFeeType": "setup",
        "defaultCost": 160
      },
      {
        "name": "Analytics & Data Interpretation",
        "defaultPrice": 200,
        "defaultFeeType": "monthly",
        "defaultCost": 60
      },
      {
        "name": "Marketing Roadmap Development",
        "defaultPrice": 500,
        "defaultFeeType": "setup",
        "defaultCost": 200
      },
      {
        "name": "Consulting & Advisory",
        "defaultPrice": 250,
        "defaultFeeType": "monthly",
        "defaultCost": 75
      }
    ]
  },
  {
    "category": "💻 Software & Tech Stack",
    "services": [
      {
        "name": "HubSpot Marketing Hub",
        "defaultPrice": 75,
        "defaultFeeType": "monthly",
        "defaultCost": 50
      },
      {
        "name": "Sprout Social Seat",
        "defaultPrice": 249,
        "defaultFeeType": "monthly",
        "defaultCost": 199
      },
      {
        "name": "Klaviyo Base Plan",
        "defaultPrice": 65,
        "defaultFeeType": "monthly",
        "defaultCost": 45
      }
    ]
  },
  {
    "category": "🎨 Branding & Design",
    "services": [
      {
        "name": "Brand Strategy Session",
        "defaultPrice": 300,
        "defaultFeeType": "setup",
        "defaultCost": 120
      },
      {
        "name": "Primary Logo Design",
        "defaultPrice": 600,
        "defaultFeeType": "setup",
        "defaultCost": 240
      },
      {
        "name": "Logo Variations & Submark",
        "defaultPrice": 250,
        "defaultFeeType": "setup",
        "defaultCost": 100
      },
      {
        "name": "Color Palette & Typography System",
        "defaultPrice": 200,
        "defaultFeeType": "setup",
        "defaultCost": 80
      },
      {
        "name": "Brand Style Guide / Guidelines",
        "defaultPrice": 400,
        "defaultFeeType": "setup",
        "defaultCost": 160
      },
      {
        "name": "Social Media Profile Graphics",
        "defaultPrice": 150,
        "defaultFeeType": "setup",
        "defaultCost": 60
      },
      {
        "name": "Branded Social Media Templates",
        "defaultPrice": 300,
        "defaultFeeType": "setup",
        "defaultCost": 120
      },
      {
        "name": "Business Card / Promotional Design",
        "defaultPrice": 150,
        "defaultFeeType": "setup",
        "defaultCost": 60
      }
    ]
  },
  {
    "category": "⭐ Reputation & Reviews",
    "services": [
      {
        "name": "NFC Google Review Card (Single, Branded)",
        "defaultPrice": 75,
        "defaultFeeType": "setup",
        "defaultCost": 20
      },
      {
        "name": "NFC Review Starter Kit (5 Cards + Countertop Stand)",
        "defaultPrice": 249,
        "defaultFeeType": "setup",
        "defaultCost": 85
      },
      {
        "name": "Multi-Location NFC Review Deployment (10 units/location)",
        "defaultPrice": 450,
        "defaultFeeType": "setup",
        "defaultCost": 150
      },
      {
        "name": "NFC Review Program Management (monitoring, reprogramming, replacements)",
        "defaultPrice": 50,
        "defaultFeeType": "monthly",
        "defaultCost": 15
      }
    ]
  }
];
