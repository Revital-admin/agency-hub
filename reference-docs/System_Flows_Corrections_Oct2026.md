# System Flows — Corrections & Updates (October 2026)

Addendum to *Complete System Flows & Process Map* (July 2026, now in `_archive/`) and the Hub Automation Addendum. Where this disagrees with those, this wins.

## 1. Zapier: only one Zap exists

The July doc describes Zaps 1–8. Only **one** Zap is live: **client uploads → Google Drive**. Everything else in Section 9 (Zap 1 intake alert, Zaps 2–8 shared-links tracker tasks) is not in use and is replaced by the Hub (below). Section 10's Zapier line should read: *"Client file uploads → Google Drive."*

## 2. Intake (Section 2, Day 0)

- The client still fills out the Google Form linked from the Hub's Intake Request PDF.
- **Alert:** the form's own *Get email notifications for new responses* setting replaces Zap 1. Point it at the onboarding owner or an `intake@` alias.
- **Answers → Hub:** still copied into the client profile by hand. The Intake Request tool now has an *Open Responses* shortcut (paste the form's Responses link once; saved in the browser).
- There is no automatic "Intake Form Received" ClickUp status change.

## 3. Closed Won → Hub profile (Section 1 end / Section 2 start)

Winning a deal from **either** Sales Pipeline Board or Proposal Follow-Up Tracker now:

1. Logs "Deal marked Closed Won" and syncs ClickUp + HubSpot.
2. **Creates the Hub client profile automatically** (workspace, portal link, ClickUp folder, Drive folder, contact email from the lead). Skipped if a client with that name already exists.
3. Notifies in the Hub to complete **Sales → Delivery Handoff** (the account manager is still chosen by a person).

## 4. ClickUp setup & shared links (Section 2)

The ClickUp client folder (8 lists) is created by the Hub. There is no tracker-task step. The 6 shared view links are pasted into Client Portal Manager; **Portal Readiness** (same screen) lists anything still blank and whether the welcome email can go out.

## 5. Delivery, revisions & requests (Sections 3, 6, 7)

- **Submit a Revision** and **Submit a Content Request** in the client portal are now native Hub forms (the ClickUp form links are retired).
- Every client approval decision, revision and content request: saved in the Hub, **emailed to the account manager**, and mirrored to ClickUp — a task in *Client Feedback & Revisions* (revisions, minor corrections) or *Campaign Briefs* (content requests) — plus a note on the HubSpot deal when one exists.
- An **hourly Worker sweep** catches anything not yet reported (e.g. nobody had the Hub open).

## 6. Reporting (Section 4)

Logging a report in Monthly Report Archive adds a note to the client's HubSpot deal. **By-the-5th deadline (Oct 2026):** each day the Worker checks every client whose CRM status (Client Portal Manager) is **Active**. From the 5th, a client with no report for the previous month gets a nudge email to their account manager (once per month); from the 8th, anything still missing is escalated in one email to the digest recipients. The 35-day stale-report flag still exists as a backstop.

## 7. Payment (Section 5)

- Only payment links generated in the Hub (Proposal Calculator) update the Contract & Invoice Tracker. Links made by hand in Stripe are not matched.
- A **first successful payment** now emails `invoices@` and the account manager. Failed payments and cancellations alert as before. QuickBooks syncs Stripe transactions (Simple Start, connected Oct 2026).

## 8. Offboarding (Section 8)

When the checklist reaches 100%: portal deactivated, CRM status set to Inactive (and pushed to HubSpot with a note), ClickUp folder renamed "[Archived] …" (ClickUp's API cannot archive; archive it by hand in ClickUp).

## 9. Automated email sender

Internal alerts (health digest, compliance, subscriptions, handoff, client activity, payments) come from **Revital Hub `alerts@revitalproductions.com`**. Client-facing mail still comes from `hello@`.
