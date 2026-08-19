/* ============================================================
   CLIENT CHECKLISTS — DATA
   Three checklists sharing one tool (see js/app.js for the tab switcher):
   Paid Client, Free Client Wrap-Up, and Offboarding (the original
   checklist this tool started as - mirrors the "Offboarding Checklist"
   at the end of the Client Offboarding SOP in SOP Wiki > Client Journey).
   Paid Client and Free Client Wrap-Up mirror the two standalone
   Aug 2026 reference PDFs of the same name in reference-docs/.
   ============================================================ */

const PAID_CLIENT_CATEGORIES = [
  {
    category: "Kickoff (First 30 Days)",
    items: [
      // Intake form, kickoff call, and welcome guide used to be tracked
      // separately here too, duplicating 3 of the 11 items on the actual
      // Onboarding tab's checklist (Discovery & Kickoff category). Collapsed
      // into one linking item so the two checklists can't silently drift
      // out of sync - this still gates the rest of the Paid Client
      // lifecycle on kickoff being done, without re-tracking it twice.
      { id: "paid-onboarding-complete", label: "Onboarding checklist fully complete (see Onboarding tab)" },
      { id: "paid-portal-built", label: "Client's Hub portal built and live" },
      { id: "paid-content-strategy", label: "Content strategy & initial audits built" }
    ]
  },
  {
    category: "Ongoing Health Rhythm",
    items: [
      { id: "paid-weekly-checkin", label: "Weekly account check-in actually logged, not skipped" },
      { id: "paid-health-reviewed", label: "Account health score reviewed on the Agency Health Dashboard" },
      { id: "paid-qc-passed", label: "Deliverables pass QC before the client ever sees them" },
      { id: "paid-monthly-report", label: "Monthly report built, QC'd, and delivered on time" }
    ]
  },
  {
    category: "Growth & Retention Watch",
    items: [
      { id: "paid-scope-creep-acted", label: "Scope-creep nudges turn into a real Change Order, not free work absorbed quietly" },
      { id: "paid-upsell-reviewed", label: "Upsell nudges get a real look, not just a dismissed notification" },
      { id: "paid-testimonial-flagged", label: "Testimonial/case-study moments flagged when they happen - paid clients are proof too" },
      { id: "paid-renewal-started", label: "Renewal conversation starts when the renewal nudge fires, not after the contract's expired" }
    ]
  },
  {
    category: "If It's Ending",
    items: [
      { id: "paid-alert-responded", label: "A stale-client or low-pulse alert gets a real response, not just a read receipt" },
      { id: "paid-renew-or-offboard", label: "Decision made: renew, or offboard gracefully" },
      { id: "paid-offboarding-run", label: "If offboarding: run the standard checklist on the Offboarding tab" }
    ]
  }
];

const FREE_CLIENT_CATEGORIES = [
  {
    category: "Define “Done” - Before You're Deep In It",
    items: [
      { id: "free-scope-written", label: "Scope of the free work is written down somewhere - what's included, what isn't" },
      { id: "free-end-date-set", label: "An end date or completion trigger is set" },
      { id: "free-client-knows-limited", label: "The client knows this is a limited engagement, not an ongoing free service" }
    ]
  },
  {
    category: "Harvest While You Work",
    items: [
      { id: "free-flag-case-study", label: "Standout pieces flagged for Case Study Builder as they're delivered, not after the fact" },
      { id: "free-save-results-data", label: "Any before/after or results data saved if it exists" },
      { id: "free-note-portfolio", label: "Portfolio-worthy pieces noted for Portfolio Showcase as they're seen" },
      { id: "free-watch-testimonial-moment", label: "Natural testimonial moments watched for - don't wait for wrap-up to ask" }
    ]
  },
  {
    category: "At Wrap-Up",
    items: [
      { id: "free-testimonial-sent", label: "Testimonial ask sent (Testimonial Tracker)" },
      { id: "free-case-study-built", label: "Case study built (Case Study Builder)" },
      { id: "free-portfolio-added", label: "Best assets added to Portfolio Showcase" },
      { id: "free-outcome-logged", label: "Outcome logged - converted / did not convert / undecided - somewhere you'll see it again" }
    ]
  },
  {
    category: "Convert or Close",
    items: [
      { id: "free-convert-decision", label: "Decision made: offer a paid engagement, or close it out gracefully" },
      { id: "free-proposal-sent", label: "If converting: pricing/proposal sent before the free work ends, not after" },
      { id: "free-offboarding-run", label: "If closing: run the standard checklist on the Offboarding tab" }
    ]
  }
];

// Single merged tab - Paid Client and Free Client Wrap-Up shown together
// as one "Client Checklist" (2 tabs total on this tool, the other being
// Offboarding, unchanged). Category names are prefixed so it's obvious
// at a glance which group of items applies to a paid vs. a free/pilot
// client - a given client is normally only working through one half of
// this list at a time, not both.
const CLIENT_CHECKLIST_CATEGORIES = [
  ...PAID_CLIENT_CATEGORIES.map(cat => ({ category: `Paid Client - ${cat.category}`, items: cat.items })),
  ...FREE_CLIENT_CATEGORIES.map(cat => ({ category: `Free Client - ${cat.category}`, items: cat.items }))
];

const OFFBOARDING_CATEGORIES = [
  {
    category: "Confirmation",
    items: [
      { id: "ob-confirmed-writing", label: "Offboarding confirmed in writing with client" },
      { id: "ob-crm-status", label: "Deal Onboarding Status updated to Offboarding in CRM" },
      { id: "ob-termination-agreement", label: "Early Termination Agreement issued if applicable" }
    ]
  },
  {
    category: "Final Audits & Delivery",
    items: [
      { id: "ob-final-audits", label: "Final Hub audits run and scores exported" },
      { id: "ob-deliverables-done", label: "All in-flight deliverables completed or cancelled — client notified" },
      { id: "ob-qc-passed", label: "All remaining deliverables passed QC before delivery" }
    ]
  },
  {
    category: "Access Handoff",
    items: [
      { id: "ob-access-transferred", label: "All platform access transferred back to client" },
      { id: "ob-access-removed", label: "All Revital team access removed from client platforms" },
      { id: "ob-access-log-updated", label: "All access removals logged in Access & Logins Tracker" },
      { id: "ob-hub-profile-removed", label: "Client Hub profile removed" }
    ]
  },
  {
    category: "Final Reporting",
    items: [
      { id: "ob-final-report-built", label: "Final performance report built, QC passed, and delivered" },
      { id: "ob-report-uploaded", label: "Report uploaded to client portal" }
    ]
  },
  {
    category: "CRM & Workspace Cleanup",
    items: [
      { id: "ob-deal-moved", label: "Deal moved to Closed Won or Inactive in CRM" },
      { id: "ob-inactive-reason", label: "Inactive Reason logged" },
      { id: "ob-folder-archived", label: "Client delivery folder archived in ClickUp" },
      { id: "ob-shared-links-archived", label: "All Master Shared Links Tracker tasks set to Archived status" },
      { id: "ob-tag-deleted", label: "Client ClickUp tag deleted from workspace Settings → Tags" }
    ]
  }
];
