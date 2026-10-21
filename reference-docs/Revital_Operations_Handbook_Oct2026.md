# Revital Productions — Operations Handbook (October 2026)

**Start here.** This replaces the July 2026 *Complete System Flows & Process Map* as the current description of how Revital runs, and tells you which older reference documents are still reliable. The living, searchable versions of the pages below are in the Hub's **SOP Wiki → Agency Process**:

- 🗺️ **How Revital Works — System Map** — what each tool owns, the client journey, what runs automatically, what is still manual
- 👤 **Account Manager Cheat Sheet — What To Do When** — "this happened → the Hub already did X → you do Y"
- ✅ **End-to-End Dry Run Checklist** — run after big changes and each quarter
- 👥 **New Hire / Departure — What To Do When** — order of operations for onboarding and offboarding teammates and contractors (checklist lives in the Hub's Team Onboarding & Offboarding tool)
- 🔁 **Quarterly Systems Review** — a 90-minute review so systems never drift again

If a document disagrees with the System Map, the System Map wins.

## The one rule

The **Hub is the source of truth**. ClickUp and HubSpot are mirrors fed from it; Stripe holds payments, QuickBooks the books, Google Drive the files. Enter things once, in the Hub.

## What changed since July (and why older PDFs are wrong in places)

| Area | Now |
|---|---|
| Zapier | One Zap only: client uploads → Google Drive. Zaps 1–8 in the July doc were never built. |
| Booking | A prospect booking a discovery call at book.revitalproductions.com adds a Sales Pipeline lead (stage: discovery call scheduled, source: Website booking). ClickUp task + HubSpot deal are created the next time the Pipeline Board is opened. Leads auto-added from Cold Outreach (booked) and Referral Tracker work the same way. |
| Closed Won | From Pipeline Board **or** Follow-Up Tracker, the Hub auto-creates the client profile, portal link, ClickUp folder and Drive folder; then prompts the account-manager handoff. |
| Intake | Still the Google Form; its own email notification is the alert; answers are typed into the Hub; Intake Request tool has an *Open Responses* shortcut. |
| Shared links | No Master Shared Links Tracker / tracker tasks. Paste the 6 shared views into Client Portal Manager; **Portal Readiness** shows what is blank. |
| Revisions & requests | Native portal forms (ClickUp form links retired). Every approval decision, revision and request emails the account manager, creates a ClickUp task (revisions/requests) and a HubSpot note. An hourly check catches anything missed. |
| Response times | Client gets an automatic confirmation email (from hello@) when they submit a revision or content request. A revision still in ClickUp's *Brief Received* status after 24 hours emails the account manager and leadership once (weekdays only) - move the task out of Brief Received to acknowledge it. |
| Reporting | Due by the 5th: reminder to the account manager on the 5th, escalation to leadership on the 8th, for clients whose CRM status is Active. |
| Contracts | DocuSign envelopes sent from Contract & Invoice Tracker call back when signed: in Live mode the record is marked Signed (with date) and invoices@ is emailed; Test (sandbox) mode only sends a [TEST] email. The send dialog now warns loudly when Live isn't ticked. |
| Payment | Hub-generated links only. First payment → email to invoices@ + account manager. QuickBooks Simple Start syncs Stripe. |
| Offboarding | Checklist 100% → portal off, CRM Inactive (HubSpot too), ClickUp folder renamed [Archived] (archive by hand). |
| Email | Automatic internal email comes from Revital Hub `alerts@revitalproductions.com`. |
| Subscriptions | Subscription Tracker rolls Monthly/Annual renewal dates forward itself; annual renewals get a 14-day heads-up email. |

## Reference documents

Cleaned up Oct 2026. Finished or replaced documents moved to `_archive/` (see its README); duplicate PDFs of documents that also have an editable copy were removed — regenerate a PDF from the editable file when you need to share one.

**Current and in use (`reference-docs/`)**
- *Handbook set:* this handbook, `System_Flows_Corrections_Oct2026.md`, `bookkeeping-accounting-workflow-sop.md`
- *Team & access:* Team Access SOP, Role Access Breakdown, Password & Bitwarden Guide (.docx), Bitwarden Rollout Plan
- *Client work:* Paid Client Checklist, Free Client Wrap-Up Checklist, Client Folder Setup guide + SOP (.docx), Report Archive Field Guide, Data Studio Setup Guide
- *Contracts & pricing:* Contractor/Vendor Information Sheet, Freelancer Contractor Agreement Template, Service Pricing Draft, Website & Branding Packages, E-Signature Setup Guide (.docx — DocuSign)
- *Marketing & legal:* Privacy Policy, Google Business Profile Checklist (.md), 5 Things Before Your Brand Shoot, Content Planning Blueprint
- *Planning:* Business Phase Roadmap (.docx), Systems & Ownership Map, Hub Integration Roadmap, Tech Stack & Growth Plan, Software & Insurance Wishlist (.docx)
- *AV / production (kept for when the AV side restarts):* AV Production Software Roadmap, TSA Gear Checklist (plain and branded), Media Storage & Review Tools

**Read with care — dated, partly superseded:** Hub Integration Roadmap and Systems & Ownership Map (add HubSpot and alerts@ to their integration lists); Tech Stack & Growth Plan, Software & Insurance Wishlist (QuickBooks Simple Start is purchased and connected; e-signature is DocuSign; still open: general liability + E&O + cyber insurance, HR/payroll at first hire, bill-pay only if vendor volume justifies it).

**Archived (`_archive/`):** the July System Flows PDF, Where-to-Log-What PDF, the two Hub Automation addenda, the Gap Punchlist and Gaps Plan, Hub Tool Improvement Backlog, Team Access sync verification, Sales Pipeline Triage, the Mr. Joe's proposal, and the Testimonials/Content Cadence notes.

## Still manual on purpose

Team onboarding/offboarding checklists (ticked by hand in the Hub's Team Onboarding & Offboarding tool) · choosing the account manager · typing intake answers into the Hub · archiving the ClickUp folder after offboarding · setting a client's CRM status to Active when onboarding ends · creating payment links in the Hub (never by hand in Stripe).

## Keeping it true

Book the **Quarterly Systems Review** (first week of Jan/Apr/Jul/Oct). When something changes, fix the SOP Wiki page first, then this handbook.
