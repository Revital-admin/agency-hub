/* ============================================================
   TEAM ONBOARDING & OFFBOARDING — CHECKLIST DATA
   Onboarding items pulled from the SOP Wiki's "First Hire 30-Day
   Onboarding Plan" (Pre-Day 1 Setup Checklist + Week 1 Day 1) and
   "Team Member Onboarding SOP" (ClickUp Teams / folder access).
   Offboarding items are the mirror of those - nothing formal existed
   for a departing teammate before this tool (only the Client
   Offboarding SOP did), so this is built directly off what onboarding
   grants, reversed, plus the client-handoff step that's specific to
   someone leaving.
   ============================================================ */

const TRANSITION_CHECKLISTS = {
  onboarding: [
    {
      category: "Accounts & Access",
      items: [
        { id: "on-email", label: "@revitalproductions.com email created and tested" },
        { id: "on-clickup", label: "ClickUp account created — correct spaces/folders shared, added to the right Team" },
        { id: "on-hub", label: "Revital Hub access granted (Cloudflare Access)" },
        { id: "on-team-access-role", label: "Team Access Manager role assigned (or confirmed default full access is appropriate)" },
        { id: "on-drive", label: "Google Drive access granted to the shared Revital Productions folder" },
        { id: "on-password-manager", label: "Password manager vault access granted" },
        { id: "on-canva", label: "Canva Pro seat added (if applicable)" },
        { id: "on-adobe", label: "Adobe Creative Cloud seat added (if applicable)" },
        { id: "on-loom", label: "Loom account/seat added" },
        { id: "on-meta", label: "Meta Business Manager access added (if applicable)" },
        { id: "on-google-ads", label: "Google Ads MCC access added (if applicable)" }
      ]
    },
    {
      category: "Documents & Records",
      items: [
        { id: "on-agreement", label: "Employment / Contractor Agreement and NDA signed and on file" },
        { id: "on-roster-entry", label: "Team Roster entry created — role, employment type, capacity" },
        { id: "on-signature", label: "Email signature created (Hub Email Signature Generator)" },
        { id: "on-30day-plan", label: "30-Day Onboarding Plan duplicated, filled in, and role-specific Week 3-4 section completed" }
      ]
    },
    {
      category: "Day 1",
      items: [
        { id: "on-welcome-call", label: "Welcome / orientation call completed" },
        { id: "on-hub-tour", label: "Hub portal + ClickUp workspace walkthrough completed" },
        { id: "on-comm-policy", label: "Client Communication Policy (Part A & B) reviewed" },
        { id: "on-qc-tool", label: "Hub's QC Checklist tool walked through in full" },
        { id: "on-client-onboarding-sop", label: "Client Onboarding SOP reviewed" }
      ]
    },
    {
      category: "Week 2+",
      items: [
        { id: "on-clients-assigned", label: "Clients assigned (Team Roster + Client Portal Manager account manager field, if applicable)" },
        { id: "on-clickup-lists", label: "Added to the relevant ClickUp lists/folders for their role" },
        { id: "on-30day-checkin", label: "30-day check-in scheduled" }
      ]
    }
  ],
  offboarding: [
    {
      category: "Handoff",
      items: [
        { id: "off-departure-confirmed", label: "Departure date confirmed and communicated to leadership" },
        { id: "off-clients-reassigned", label: "Any assigned clients reassigned to another account manager (Client Portal Manager — this also re-syncs ClickUp)" },
        { id: "off-deliverables-reassigned", label: "In-flight deliverables reassigned or completed" },
        { id: "off-knowledge-handoff", label: "Passwords/knowledge handed off to manager or replacement" }
      ]
    },
    {
      category: "Access Removal",
      items: [
        { id: "off-hub-revoked", label: "Revital Hub access revoked (Cloudflare Access)" },
        { id: "off-clickup-removed", label: "ClickUp seat removed / deactivated" },
        { id: "off-email-deactivated", label: "@revitalproductions.com email deactivated or forwarded" },
        { id: "off-drive-removed", label: "Google Drive access removed" },
        { id: "off-password-manager-revoked", label: "Password manager vault access revoked" },
        { id: "off-tools-removed", label: "Canva / Adobe Creative Cloud / Loom seats removed" },
        { id: "off-meta-google-removed", label: "Meta Business Manager / Google Ads MCC access removed" },
        { id: "off-team-access-removed", label: "Removed from Team Access Manager (if a custom entry existed)" }
      ]
    },
    {
      category: "Records & Wrap-Up",
      items: [
        { id: "off-roster-inactive", label: "Team Roster entry marked inactive / removed" },
        { id: "off-equipment-returned", label: "Company equipment returned (if applicable)" },
        { id: "off-final-pay", label: "Final pay / contractor invoice settled" },
        { id: "off-activity-logged", label: "Exit logged in Activity Log" }
      ]
    }
  ]
};
