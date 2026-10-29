/* ============================================================
   SOP WIKI — CONTENT PATCHES
   The live SOP library is stored in Firestore (agency/sops-shard-N), so
   editing data.js (the starter seed) never changes what the team sees.
   This file is a versioned list of one-time changes to the LIVE library.
   When an admin (no Team Access restriction) opens the SOP Wiki, any patch
   whose id isn't yet recorded in agency/sopPatchState is applied to the
   loaded library, saved, then recorded - so each patch runs exactly once
   and is reviewable here in git. Add new patches to the END with a new id;
   never edit an applied patch (it won't re-run).

   Ops:
     { type: "prepend", sopId, html }          callout at the top of a SOP
     { type: "replace", sopId, find, with }    plain-text swap inside a SOP
     { type: "add", sop: { id, title, category, content } }  new SOP
   ============================================================ */

const SOP_PATCH_NOTE = (html) =>
  `<blockquote><p><strong>&#9888;&#65039; Updated October 2026</strong></p>${html}<p><em>The steps below are kept for reference where they still apply; where they disagree with this note, this note wins. See &ldquo;How Revital Works &mdash; System Map&rdquo; for the full current picture.</em></p></blockquote>`;

const SOP_PATCH_ONBOARDING = SOP_PATCH_NOTE(`
<ul>
<li><strong>Closed Won creates the Hub profile automatically.</strong> Winning a deal in Sales Pipeline Board <em>or</em> Proposal Follow-Up Tracker creates the client workspace, portal link, ClickUp folder (8 lists) and Drive folder for you, and fills in the contact email from the lead. Next step is Kickoff Prep &amp; Deck &rarr; Sales &rarr; Delivery Handoff to pick the account manager.</li>
<li><strong>Intake</strong> is still the Google Form (link in the Hub&rsquo;s Intake Request tool). Turn on the form&rsquo;s &ldquo;email notifications for new responses&rdquo; so the team is alerted; use the <em>Open Responses</em> shortcut, then type the answers into the client&rsquo;s Hub profile. The ClickUp status &ldquo;Intake Form Received&rdquo; is not set automatically &mdash; set it by hand if you use it.</li>
<li><strong>No Zaps and no Master Shared Links Tracker.</strong> Zapier&rsquo;s only live Zap is client file uploads to Google Drive. The &ldquo;7 tracker tasks&rdquo; step does not exist; skip it. Paste the 6 shared view links straight into Client Portal Manager, and check the <strong>Portal Readiness</strong> list there to see what is still blank before sending the Welcome Email.</li>
<li><strong>Submit a Revision / Submit a Content Request</strong> are built into the client portal now. Do <em>not</em> create ClickUp forms or paste form links &mdash; those fields are gone.</li>
</ul>`);

const SOP_PATCH_DELIVERY = SOP_PATCH_NOTE(`
<ul>
<li>Client <strong>Approved / Minor Corrections / Revision Required</strong> decisions, <strong>revision requests</strong> and <strong>content requests</strong> from the portal are saved in the Hub and <strong>emailed to the account manager</strong> (from Revital Hub &lt;alerts@&gt;) automatically.</li>
<li>Revision, minor-correction and content-request items also create a <strong>ClickUp task</strong> (Client Feedback &amp; Revisions, or Campaign Briefs) and a note on the client&rsquo;s HubSpot deal when one exists. You no longer log them by hand.</li>
<li>An hourly check catches anything that arrived while nobody had the Hub open, so a Friday-night request is announced within about an hour.</li>
<li>Your job: action the task, re-run QC, and send the revised version back for approval from Client Portal Manager.</li>
</ul>`);

const SOP_PATCHES = [
  {
    id: "2026-10-ops-sync-v1",
    ops: [
      // ── Onboarding family ──
      { type: "prepend", sopId: "sop-sops-and-internal-processes", html: SOP_PATCH_ONBOARDING },
      { type: "prepend", sopId: "sop-onboarding-checklist", html: SOP_PATCH_ONBOARDING },
      { type: "prepend", sopId: "sop-client-onboarding-sop", html: SOP_PATCH_ONBOARDING },
      { type: "prepend", sopId: "sop-first-hire-30-day-onboarding-plan", html: SOP_PATCH_NOTE(`
<ul>
<li>There are <strong>no Zapier automations to learn</strong> (the only live Zap moves client uploads into Google Drive) and the <strong>Master Shared Links Tracker is not in use</strong>. Skip those items in the plan.</li>
<li>Learn instead: the Hub&rsquo;s Closed Won handoff, Portal Readiness, and the automatic account-manager emails &mdash; all covered in &ldquo;How Revital Works &mdash; System Map&rdquo; and the &ldquo;Account Manager Cheat Sheet.&rdquo;</li>
</ul>`) },

      // ── Delivery family ──
      { type: "prepend", sopId: "sop-revision-and-feedback-process-sop", html: SOP_PATCH_DELIVERY },
      { type: "prepend", sopId: "sop-content-approval-workflow", html: SOP_PATCH_DELIVERY },
      { type: "prepend", sopId: "sop-client-welcome-portal-guide", html: SOP_PATCH_NOTE(`
<ul>
<li>The portal&rsquo;s <strong>Submit a Revision</strong> and <strong>Submit a Content Request</strong> buttons are native forms that are always shown &mdash; there are no ClickUp form links to set up.</li>
<li>Before sending a client their link, open Client Portal Manager and check the <strong>Portal Readiness</strong> list.</li>
</ul>`) },

      // ── Offboarding ──
      { type: "prepend", sopId: "sop-client-offboarding-sop", html: SOP_PATCH_NOTE(`
<ul>
<li>When the Hub&rsquo;s Offboarding Checklist reaches 100%: the client portal is deactivated, the CRM status is set to <strong>Inactive</strong> and pushed to HubSpot (with a timeline note), the ClickUp client folder is renamed <strong>[Archived] &lt;name&gt;</strong>, and a 90-day re-engagement reminder is set.</li>
<li>ClickUp&rsquo;s API cannot archive a folder &mdash; <strong>archive it by hand in ClickUp</strong> after the rename.</li>
<li>There are no tracker tasks to archive (the Master Shared Links Tracker is not in use).</li>
</ul>`) },

      // ── Automation plan ──
      { type: "prepend", sopId: "sop-automation-plan-zapier-clickup", html: SOP_PATCH_NOTE(`
<ul>
<li>Zapier now has <strong>one live Zap</strong>: client file uploads to Google Drive. The Zapier automations in this plan (1, 2, 18) were never built and <strong>are no longer needed</strong> &mdash; the Hub covers them:</li>
<li><em>Closed Won &rarr; setup</em>: the Hub auto-creates the client profile, ClickUp folder and Drive folder, then prompts the account-manager handoff (which emails the AM).</li>
<li><em>Intake alert</em>: the Google Form&rsquo;s own email notification on new responses.</li>
<li><em>Client approvals, revisions, requests</em>: the Hub emails the AM and creates the ClickUp task and HubSpot note itself, plus an hourly catch-up check.</li>
<li><em>Report due</em>: from the 5th of each month the Hub nudges the AM of any Active client without last month&rsquo;s report, and escalates on the 8th.</li>
</ul>`) },

      // ── Where to log what ──
      { type: "prepend", sopId: "sop-where-to-log-what-hub-vs-clickup", html: SOP_PATCH_NOTE(`
<ul>
<li>The Hub is the source of truth; <strong>ClickUp and HubSpot are mirrors</strong> fed from it. Pipeline stage, account manager, health, onboarding/CRM status, client approvals, revisions, content requests, report delivery and offboarding are pushed automatically &mdash; don&rsquo;t re-enter them in ClickUp or HubSpot.</li>
</ul>`) },

      // ── Reporting ──
      { type: "prepend", sopId: "sop-monthly-reporting-sop", html: SOP_PATCH_NOTE(`
<ul>
<li><strong>Due by the 5th.</strong> Each day the Hub checks every client whose CRM status (Client Portal Manager) is <strong>Active</strong>. From the 5th, a client with no report for the previous month gets a nudge email to their account manager; from the 8th, anything still missing is escalated to leadership.</li>
<li>Logging the report in <strong>Monthly Report Archive</strong> is what stops the reminders. It also notifies the client in their portal and adds a note to their HubSpot deal.</li>
<li>Set a client&rsquo;s CRM status to <strong>Active</strong> once onboarding finishes, or they are skipped.</li>
</ul>`) },

      // ── Payments ──
      { type: "prepend", sopId: "sop-invoice-and-billing-sop", html: SOP_PATCH_NOTE(`
<ul>
<li><strong>QuickBooks is on Simple Start</strong> with the Stripe Connector installed; Stripe charges sync into QuickBooks under Transactions &rarr; Integration transactions &rarr; Stripe, where they are reviewed and confirmed.</li>
<li>Only payment links <strong>generated in the Hub</strong> (Proposal Calculator / Contract &amp; Invoice Tracker) update the Tracker. Links created by hand in Stripe are not matched.</li>
<li>A client&rsquo;s <strong>first successful payment</strong> emails invoices@ and their account manager. Failed payments email invoices@; a canceled subscription emails the account manager.</li>
</ul>`) },
      { type: "prepend", sopId: "sop-recurring-billing-stripe-sop", html: SOP_PATCH_NOTE(`
<ul>
<li>Only payment links <strong>generated in the Hub</strong> are tied to a Contract &amp; Invoice Tracker record. Never share a hand-made Stripe link for a recurring client &mdash; the payment won&rsquo;t be matched.</li>
<li>First payment &rarr; email to invoices@ + account manager. Failed payment &rarr; email to invoices@. Subscription canceled &rarr; email to the account manager. QuickBooks (Simple Start) syncs Stripe automatically.</li>
</ul>`) },

      // ── Email aliases & alerts ──
      { type: "prepend", sopId: "sop-email-alias-filter-setup", html: SOP_PATCH_NOTE(`
<ul>
<li>New alias: <strong>alerts@revitalproductions.com</strong> &mdash; the sender for the Hub&rsquo;s automatic internal emails (shown as &ldquo;Revital Hub&rdquo;): health digest, compliance and subscription alerts, client activity, handoffs, report-due reminders, payment alerts. Replies land in the admin inbox.</li>
<li>Suggested filter: <em>from alerts@ &rarr; label &ldquo;Hub Alerts&rdquo;</em>, skip the inbox for the digest if it gets noisy. Also add alerts@ to contacts so it never lands in spam.</li>
<li>Client-facing mail (approval requests, testimonial asks) still comes from hello@ or the account manager.</li>
</ul>`) },
      { type: "prepend", sopId: "sop-weekly-agency-health-digest-sop", html: SOP_PATCH_NOTE(`
<ul>
<li>The digest, and the Hub&rsquo;s other automatic internal emails, now send from <strong>Revital Hub &lt;alerts@revitalproductions.com&gt;</strong>.</li>
<li>Other automatic emails to know about: hourly client-activity catch-up, monthly report-due nudges (5th) and escalation (8th), overdue and upcoming-annual subscription alerts, first-payment / failed-payment / canceled alerts, and the daily compliance and stale-pipeline checks.</li>
</ul>`) },

      // ── Small text fixes ──
      { type: "replace", sopId: "sop-sales-call-checklist", find: "(when built)", with: "(live in the Hub)" }
    ]
  },

  {
    id: "2026-10-understandable-v1",
    ops: [
      {
        type: "add",
        sop: {
          id: "sop-how-revital-works-system-map",
          title: "🗺️ How Revital Works — System Map",
          category: "Agency Process",
          format: "html",
          checklistEnabled: false,
          content: `<p><em>Last updated: October 2026. This is the single current picture of how work moves through Revital. If another document disagrees, this one wins &mdash; and if this one is wrong, fix it here first.</em></p>

<h2>The one rule</h2>
<p><strong>The Hub is the source of truth.</strong> ClickUp and HubSpot are mirrors fed from the Hub &mdash; don&rsquo;t enter the same thing twice. Stripe holds payments, QuickBooks holds the books, Google Drive holds files.</p>

<h2>What each tool owns</h2>
<table>
<thead><tr><th>Tool</th><th>Owns</th></tr></thead>
<tbody>
<tr><td>Revital Hub</td><td>Client profiles, portal, approvals, requests, reports, checklists, pipeline, proposals, contract &amp; invoice tracking, subscriptions, team access</td></tr>
<tr><td>ClickUp</td><td>Delivery work: client folder (8 lists), tasks for revisions and content requests, sales pipeline mirror</td></tr>
<tr><td>HubSpot</td><td>Deal and contact mirror, timeline notes on client activity</td></tr>
<tr><td>Stripe</td><td>Collecting payments, subscriptions, retries. Links must be generated from the Hub.</td></tr>
<tr><td>QuickBooks (Simple Start)</td><td>Books, expenses, 1099s. Stripe transactions sync in and are reviewed there.</td></tr>
<tr><td>DocuSign</td><td>Signing contracts (SOW + MSA)</td></tr>
<tr><td>Google Workspace</td><td>Email, Drive, Calendar, the intake Google Form</td></tr>
<tr><td>Zapier</td><td>One Zap only: client file uploads to Google Drive</td></tr>
<tr><td>Cloudflare</td><td>Hosts the Hub and its Worker (email, ClickUp/HubSpot sync, scheduled checks)</td></tr>
</tbody></table>

<h2>The client journey, start to finish</h2>
<ol>
<li><strong>Lead.</strong> Added in Sales Pipeline Board &rarr; ClickUp task and HubSpot deal are created automatically. Pre-qualify and run the discovery call using the Hub tools.</li>
<li><strong>Proposal.</strong> Build it in Proposal Calculator; generate the Stripe payment link <em>there</em>. Track follow-ups in Proposal Follow-Up Tracker (Day 3 / 7 / 12).</li>
<li><strong>Sign &amp; pay.</strong> Client signs in DocuSign and pays through the Hub-generated link. First payment emails invoices@ and the account manager.</li>
<li><strong>Closed Won.</strong> Mark the deal Won (Pipeline Board or Follow-Up Tracker). The Hub creates the client profile, portal link, ClickUp folder and Drive folder, then prompts the handoff.</li>
<li><strong>Handoff.</strong> Kickoff Prep &amp; Deck &rarr; Sales &rarr; Delivery Handoff: pick the account manager (this emails them and sets the ClickUp assignee and HubSpot owner).</li>
<li><strong>Intake.</strong> Send the Google Form from the Intake Request tool. Form email notifications alert the team. Review for red flags, then type the answers into the Hub profile.</li>
<li><strong>Portal setup.</strong> Client Portal Manager: paste the 6 shared view links, add the Drive folder and logo, confirm the account manager. Clear the <strong>Portal Readiness</strong> list, then send the Welcome Guide and book the kickoff.</li>
<li><strong>Delivery.</strong> Produce &rarr; QC Checklist &rarr; Send for Approval (Client Portal Manager). Client responds in the portal; the account manager is emailed and, for revisions, a ClickUp task is created.</li>
<li><strong>Monthly report.</strong> Build, QC, then log it in Monthly Report Archive by the 5th. Reminders fire on the 5th and 8th for Active clients.</li>
<li><strong>Offboarding.</strong> Finish the Offboarding Checklist: portal deactivates, HubSpot goes Inactive, ClickUp folder is renamed [Archived] (archive it by hand), re-engagement reminder is set.</li>
</ol>

<h2>What runs automatically</h2>
<table>
<thead><tr><th>When</th><th>What</th></tr></thead>
<tbody>
<tr><td>Every hour</td><td>Catches client approvals, revisions and requests nobody had the Hub open to report</td></tr>
<tr><td>Daily</td><td>Contractor compliance, stale pipeline, overdue/annual subscription alerts, monthly report due check (5th/8th), Monthly/Annual subscription dates roll forward</td></tr>
<tr><td>Weekly (Mon)</td><td>Agency health digest</td></tr>
<tr><td>On event</td><td>Stripe payment events, Closed Won, client portal actions, offboarding completion</td></tr>
</tbody></table>
<p>All automatic internal emails come from <strong>Revital Hub &lt;alerts@revitalproductions.com&gt;</strong>.</p>

<h2>What is still manual (on purpose)</h2>
<ul>
<li>Choosing the account manager (no assignment rule yet).</li>
<li>Typing intake answers into the Hub profile.</li>
<li>Archiving the ClickUp folder after offboarding.</li>
<li>Setting a client&rsquo;s CRM status to Active when onboarding finishes.</li>
<li>Creating payment links in the Hub (never by hand in Stripe).</li>
</ul>`
        }
      },
      {
        type: "add",
        sop: {
          id: "sop-account-manager-cheat-sheet",
          title: "👤 Account Manager Cheat Sheet — What To Do When",
          category: "Agency Process",
          format: "html",
          checklistEnabled: false,
          content: `<p><em>Last updated: October 2026. One page: something happened &mdash; here&rsquo;s what the Hub already did and what you do next.</em></p>
<table>
<thead><tr><th>When this happens</th><th>The Hub already&hellip;</th><th>You do</th></tr></thead>
<tbody>
<tr><td>A deal is marked Closed Won</td><td>Created the client profile, portal, ClickUp + Drive folders; rang the bell</td><td>Kickoff Prep &amp; Deck &rarr; Sales &rarr; Delivery Handoff: pick the account manager</td></tr>
<tr><td>You&rsquo;re assigned a client</td><td>Emailed you the handoff notes; set the ClickUp assignee and HubSpot owner</td><td>Send the intake form, set up the portal, book the kickoff</td></tr>
<tr><td>Intake form comes in (email from Google Forms)</td><td>Nothing</td><td>Open the answers, run the red flag review, type them into the Hub profile, then send the Welcome Guide</td></tr>
<tr><td>Before sending the portal link</td><td>Shows <strong>Portal Readiness</strong> in Client Portal Manager</td><td>Fill what&rsquo;s red, glance at what&rsquo;s yellow</td></tr>
<tr><td>Client sends a <strong>revision</strong> (or Revision Required on an approval)</td><td>Emailed you; created a ClickUp task; added a HubSpot note</td><td>Do the work, re-run QC, send it back for approval</td></tr>
<tr><td>Client sends a <strong>content request</strong></td><td>Emailed you; created a Campaign Briefs task</td><td>Scope it against the SOW within 2 business days; in scope &rarr; production, out of scope &rarr; Change Order</td></tr>
<tr><td>Client approves</td><td>Emailed you; noted on HubSpot</td><td>Publish, mark complete in ClickUp</td></tr>
<tr><td>It&rsquo;s the 5th and a report is missing</td><td>Emailed you a reminder</td><td>Build, QC, log in Monthly Report Archive (stops the reminders)</td></tr>
<tr><td>First payment arrives</td><td>Emailed you and invoices@</td><td>Confirm kickoff is booked; make sure the CRM status is set to Active when onboarding is done</td></tr>
<tr><td>A payment fails</td><td>Emailed invoices@; marked Past Due in the Tracker</td><td>Reach out to the client; Stripe retries on its own schedule</td></tr>
<tr><td>A subscription is canceled</td><td>Emailed you</td><td>Pause work until it&rsquo;s resolved with the client</td></tr>
<tr><td>Client leaves</td><td>Offboarding Checklist at 100% deactivates the portal, sets HubSpot to Inactive, renames the ClickUp folder [Archived]</td><td>Archive the ClickUp folder by hand; send the offboarding email and review request</td></tr>
</tbody></table>
<h2>Rules of thumb</h2>
<ul>
<li>Enter things once, in the Hub. ClickUp and HubSpot update themselves.</li>
<li>Payment links come from the Hub only.</li>
<li>Emails from <strong>Revital Hub &lt;alerts@&gt;</strong> are automatic and actionable &mdash; replies go to the admin inbox, so contact the client directly instead.</li>
<li>Can&rsquo;t find something? Check &ldquo;How Revital Works &mdash; System Map.&rdquo;</li>
</ul>`
        }
      },
      {
        type: "add",
        sop: {
          id: "sop-end-to-end-dry-run-checklist",
          title: "✅ End-to-End Dry Run Checklist",
          category: "Agency Process",
          format: "html",
          checklistEnabled: true,
          content: `<p><em>Last updated: October 2026. Run this once after any big change and once a quarter. Use a throwaway client named &ldquo;ZZ Test Client&rdquo; so it&rsquo;s easy to spot and delete.</em></p>
<h2>Sales &amp; close</h2>
<ul>
<li>Add &ldquo;ZZ Test Client&rdquo; (with a real test email) in Sales Pipeline Board &mdash; confirm a ClickUp task and HubSpot deal appear</li>
<li>Mark it Closed Won from the Pipeline Board &mdash; confirm the Hub profile, portal link, ClickUp folder and Drive folder were created and the bell notification showed</li>
<li>Repeat on a second test lead using Proposal Follow-Up Tracker &rarr; Mark as Won &mdash; confirm the same things happen</li>
<li>Complete the Sales &rarr; Delivery Handoff &mdash; confirm the account manager email arrives from Revital Hub &lt;alerts@&gt;</li>
</ul>
<h2>Onboarding</h2>
<ul>
<li>Open Client Portal Manager &mdash; Portal Readiness lists what is missing; fill it until it reads &ldquo;Fully set up&rdquo;</li>
<li>Open the portal link in a private window &mdash; Submit a Revision and Submit a Content Request buttons are visible</li>
<li>Submit the Google intake form with test answers &mdash; the notification email arrives</li>
</ul>
<h2>Delivery</h2>
<ul>
<li>Send a deliverable for approval &mdash; the approval email draft builds and sends</li>
<li>In the portal, choose Revision Required with a note &mdash; account manager email arrives, ClickUp task appears in Client Feedback &amp; Revisions, HubSpot note appears</li>
<li>Submit a revision and a content request from the portal forms &mdash; same three results (content request lands in Campaign Briefs)</li>
<li>With the Hub closed, submit another request; within about an hour the same emails and task arrive</li>
</ul>
<h2>Reporting &amp; payment</h2>
<ul>
<li>Log a report in Monthly Report Archive &mdash; the client sees it in the portal; HubSpot note appears</li>
<li>Generate a Hub payment link for $1 and pay it &mdash; first-payment email arrives; Tracker shows Paid or Active; the charge appears in QuickBooks &rarr; Integration transactions &rarr; Stripe</li>
<li>Refund the $1 in Stripe</li>
</ul>
<h2>Offboarding &amp; cleanup</h2>
<ul>
<li>Finish the Offboarding Checklist &mdash; portal shows &ldquo;Portal No Longer Active&rdquo;, HubSpot deal Inactive, ClickUp folder renamed [Archived]</li>
<li>Delete the test client, the ClickUp folder, the Drive folder and the HubSpot deal/contact</li>
<li>Note anything that failed and fix it before real clients depend on it</li>
</ul>`
        }
      },
      {
        type: "add",
        sop: {
          id: "sop-quarterly-systems-review",
          title: "🔁 Quarterly Systems Review",
          category: "Agency Process",
          format: "html",
          checklistEnabled: true,
          content: `<p><em>Last updated: October 2026. Put a recurring 90-minute block on the calendar: first week of January, April, July and October. Goal: nobody ever has to &ldquo;relearn the systems&rdquo; again &mdash; small fixes happen on schedule.</em></p>
<h2>Is it still true?</h2>
<ul>
<li>Skim &ldquo;How Revital Works &mdash; System Map&rdquo; and the Account Manager Cheat Sheet against how work really happens; fix whatever drifted</li>
<li>Any tool added or dropped this quarter? Update the Subscription Tracker and the tool table in the System Map</li>
<li>Run the End-to-End Dry Run Checklist</li>
</ul>
<h2>Is it working?</h2>
<ul>
<li>Agency Health Dashboard: any client with stale reports, old pending approvals or no recent check-in?</li>
<li>Every real client has CRM status set correctly (Active / Paused / Inactive)</li>
<li>Pipeline: every lead has an email and a stage; stale leads closed or followed up</li>
<li>Subscription Tracker: costs and dates match actual statements; QuickBooks Simple Start still the right plan</li>
<li>QuickBooks: Stripe transactions reviewed; bank reconciled</li>
</ul>
<h2>Is it safe?</h2>
<ul>
<li>Team Access: remove anyone who left; confirm roles match what people do</li>
<li>Insurance policies and renewals (Business Insurance Tracker); contractor W-9s and agreements current</li>
<li>Firestore backups still running; password manager rollout up to date</li>
</ul>
<h2>Is it simple?</h2>
<ul>
<li>List Hub tools nobody opened this quarter; hide or retire them instead of keeping them &ldquo;just in case&rdquo;</li>
<li>List any step still done by hand that happened more than 5 times; decide whether to automate it</li>
<li>Write down one thing to fix next quarter and one thing to stop doing</li>
</ul>`
        }
      }
    ]
  },
  {
    id: "2026-10-team-lifecycle-v1",
    ops: [
      {
        type: "add",
        sop: {
          id: "sop-new-hire-departure-what-to-do-when",
          title: "\ud83d\udc65 New Hire / Departure \u2014 What To Do When",
          category: "Agency Process",
          format: "html",
          checklistEnabled: true,
          content: `<p><em>Last updated: October 2026. The Hub tool <strong>Team Onboarding &amp; Offboarding</strong> holds the tickable checklist; this page is the order of operations. Nothing here is automatic yet &mdash; a person ticks each box.</em></p>
<h2>A new hire or contractor is confirmed</h2>
<ul>
<li>Agreement and NDA out for signature in DocuSign (contractors: also collect a W-9 and fill in the Contractor/Vendor Information Sheet)</li>
<li>Decide Full Account or Alias first (Team Email Account Setup SOP), then create the @revitalproductions.com account; 2-Step Verification is required within 7 days of first login</li>
<li>Open <strong>Team Onboarding &amp; Offboarding</strong> &rarr; start an Onboarding entry and work down Accounts &amp; Access</li>
<li>Give access to what the role needs only: Hub role in Team Access Manager, ClickUp spaces, shared Drive folder, Bitwarden shared collections, and HubSpot only if they touch leads</li>
<li>Add them to Team Roster (role, employment type, capacity); create an email signature</li>
<li>Duplicate the First Hire 30-Day Onboarding Plan, fill it in, share it on Day 1</li>
</ul>
<h2>Week 1&ndash;4</h2>
<ul>
<li>Day 1: welcome call, Hub and ClickUp tour, Client Communication Policy, QC Checklist, Client Onboarding SOP</li>
<li>Week 2: assign clients (Team Roster and the account manager field in Client Portal Manager &mdash; this re-syncs ClickUp and HubSpot)</li>
<li>Day 30: check-in; set up payment (payroll or contractor ACH)</li>
</ul>
<h2>Someone is leaving</h2>
<ul>
<li>Open an Offboarding entry. <strong>First</strong> reassign their clients in Client Portal Manager and any in-flight deliverables &mdash; before access is removed</li>
<li>Collect passwords and knowledge handoff; rotate any shared password they could see</li>
<li>Remove access: Hub (Cloudflare Access), ClickUp, email, Drive, Bitwarden, Canva/Adobe/Loom, Meta/Google Ads, HubSpot, DocuSign, QuickBooks/Stripe if applicable</li>
<li>Mark Team Roster inactive; settle final pay or contractor invoice; log the exit</li>
</ul>
<h2>Check</h2>
<ul>
<li>Quarterly Systems Review: every person in Team Access and Team Roster still works here and has the right role</li>
</ul>`
        }
      }
    ]
  },
  {
    id: "2026-10-finance-v1",
    ops: [
      {
        type: "prepend",
        sopId: "sop-invoice-and-billing-sop",
        html: SOP_PATCH_NOTE(`
<ul>
<li><strong>How clients are billed now:</strong> with a Hub-generated Stripe payment link (Proposal Calculator, or Send Billing Link in Contract &amp; Invoice Tracker). Never create the link by hand in Stripe &mdash; hand-made links don&rsquo;t update the Tracker. Monthly retainers run as Stripe subscriptions.</li>
<li><strong>The Tracker updates itself:</strong> a successful payment marks the Tracker record paid/active and emails invoices@ and the account manager on the first payment. Failed payments and cancellations alert as before. If every retry fails, the subscription is left <em>past due</em> (not cancelled) so you can chase the client.</li>
<li><strong>QuickBooks is the books, not the billing tool:</strong> Stripe charges, fees and payouts sync into QuickBooks (Transactions &rarr; Integration transactions &rarr; Stripe). Create a QuickBooks invoice only for something Stripe doesn&rsquo;t cover (formal invoice document, net terms, AV freelance work), and match the deposit when it lands.</li>
<li>ClickUp and HubSpot are mirrors of the Hub; the Invoices &amp; Payments list there is no longer where payment status is decided.</li>
<li>The overdue follow-up cadence below (Day 1 / 7 / 15) still applies to anything billed by manual invoice.</li>
</ul>`)
      },
      {
        type: "prepend",
        sopId: "sop-expense-tracking-and-tax-categories",
        html: SOP_PATCH_NOTE(`
<ul>
<li><strong>QuickBooks now holds the books.</strong> The business bank account and Stripe are connected, so expenses are categorized in QuickBooks (bank feed) and receipts are attached to the transaction there. Use the category names in this SOP when you categorize.</li>
<li>If the team still logs expenses in the ClickUp Expenses Tracker, treat that as a convenience copy &mdash; QuickBooks is the one that counts at tax time. Confirm with your bookkeeper or CPA which they want to keep.</li>
<li>Contractor payments: pay by ACH from the business account and log each one as an expense against the vendor in QuickBooks (this also tracks 1099 totals). See the Monthly Close &amp; Tax Calendar page.</li>
</ul>`)
      },
      {
        type: "prepend",
        sopId: "sop-contract-signing-process-sop",
        html: SOP_PATCH_NOTE(`
<ul>
<li><strong>Signed status is now automatic for live DocuSign sends.</strong> When the client signs, the Tracker record is marked Signed (with the date) and invoices@ is emailed. Set the renewal date by hand if the contract has one.</li>
<li>In the Send Contract panel, make sure the <strong>Live</strong> box is ticked for real contracts. Unticked means TEST MODE (sandbox): not legally binding and the record is not changed. The panel now shows a red warning and a confirmation in test mode.</li>
</ul>`)
      },
      {
        type: "add",
        sop: {
          id: "sop-monthly-close-and-tax-calendar",
          title: "\ud83d\udcc5 Monthly Close & Tax Calendar",
          category: "Finance & Reporting",
          format: "html",
          checklistEnabled: true,
          content: `<p><em>Last updated: October 2026. Owner: whoever does the bookkeeping (in-house bookkeeper or Ronald until there is one). This is a routine, not tax advice &mdash; confirm dates, rates and thresholds with your CPA, because tax rules change.</em></p>
<h2>Monthly close (first week of each month)</h2>
<ul>
<li>QuickBooks: categorize every bank-feed transaction; attach receipts to anything over a few dollars</li>
<li>QuickBooks &rarr; Integration transactions &rarr; Stripe: review and confirm new charges, fees and payouts; confirm each payout matches a deposit in the business checking account</li>
<li>Reconcile the business checking account and any business credit card to the statement</li>
<li>Contract &amp; Invoice Tracker vs QuickBooks: every paid client appears in both; anything unpaid is chased (Overdue follow-up in the Invoice &amp; Billing SOP)</li>
<li>Subscription Tracker: dates and amounts match this month&rsquo;s statements; cancel anything unused</li>
<li>Contractors: every contractor payment was made by ACH from the business account and logged as an expense against their vendor record</li>
<li>Financial Center: click Sync Now, then set the manual numbers (tax reserve, owner funding)</li>
</ul>
<h2>Quarterly</h2>
<ul>
<li>Estimated tax payments &mdash; US federal estimates are generally due around April 15, June 15, September 15 and January 15; confirm the amounts and the Louisiana state dates with your CPA</li>
<li>Move the agreed percentage of revenue into the tax reserve each month so the quarterly payment is not a surprise</li>
<li>Review the P&amp;L: revenue by service, software costs, contractor costs, margin; compare with the Service Pricing tool</li>
<li>Insurance and contractor paperwork: policies current (Business Insurance Tracker); W-9 and agreement on file for every contractor</li>
</ul>
<h2>Annual</h2>
<ul>
<li>January: 1099-NEC forms for contractors. The reporting threshold was $600 for payments made through 2025 and is $2,000 for payments made in 2026 onward (per current IRS guidance &mdash; confirm with your CPA). Forms are due to contractors and the IRS around January 31.</li>
<li>Send the year-end QuickBooks reports to your CPA; give the CPA Accountant access in QuickBooks (Manage Users &rarr; Accountants) rather than sharing a login</li>
<li>Review this page and the bookkeeping SOP with your CPA</li>
</ul>`
        }
      }
    ]
  },
  {
    id: "2026-10-lifecycle-v1",
    ops: [
      {
        type: "add",
        category: "Agency Process",
        page: {
          id: "sop-client-project-lifecycle-checklist",
          title: "Client Project Lifecycle Checklist",
          format: "html",
          checklistEnabled: true,
          content: `<p><em>Last updated: October 2026. The one checklist for a client from first conversation to renewal. Each line names the owner and the Hub tool. Tick it per client; if a step isn't done, say who owns it.</em></p>
<h2>1. Lead &amp; discovery</h2>
<ul>
<li>Lead is on the Sales Pipeline Board (bookings and cold-outreach/referral leads land there automatically) &mdash; Owner: sales lead</li>
<li>Discovery call held; needs, budget and timeline noted on the lead &mdash; Owner: sales lead</li>
</ul>
<h2>2. Proposal, contract &amp; first payment</h2>
<ul>
<li>Proposal built in the Proposal Calculator &mdash; Owner: sales lead</li>
<li>Contract sent from Contract &amp; Invoice Tracker (tick <strong>Live</strong> for real contracts) and signed &mdash; Owner: sales lead</li>
<li>Hub-generated Stripe payment link sent and first payment received &mdash; Owner: sales lead / finance</li>
</ul>
<h2>3. Closed Won handoff</h2>
<ul>
<li>Lead moved to Closed Won; client profile created; account manager chosen &mdash; Owner: Ronald</li>
<li>Handoff notes passed to the account manager; internal pre-kickoff held &mdash; Owner: sales lead &rarr; AM</li>
</ul>
<h2>4. Onboarding</h2>
<ul>
<li>Timeline Scheduler timeline created from the right template &mdash; every phase has a target date &mdash; Owner: account manager</li>
<li>Welcome package sent; intake questionnaire sent and answered; platform access gathered &mdash; Owner: account manager</li>
<li>Client portal ready and client invited; CRM status set to Active &mdash; Owner: account manager</li>
<li>Official kickoff held; success metrics and first deliverables agreed &mdash; Owner: account manager</li>
</ul>
<h2>5. Production, QC &amp; approval</h2>
<ul>
<li>Work built inside the phase time box (see Project Deadlines &amp; Time-Box Standards) &mdash; Owner: assigned team member</li>
<li>Internal quality check before anything goes to the client &mdash; Owner: account manager</li>
<li>Delivered via the portal; revision round count tracked (2 included) &mdash; Owner: account manager</li>
<li>Written client approval recorded &mdash; Owner: account manager</li>
</ul>
<h2>6. Launch</h2>
<ul>
<li>Launch checklist done; client notified; invoice/balance paid per contract &mdash; Owner: account manager / finance</li>
</ul>
<h2>7. Ongoing: reporting &amp; check-ins</h2>
<ul>
<li>Weekly Account Check-In done and logged &mdash; Owner: account manager</li>
<li>Monthly report delivered by the 5th &mdash; Owner: account manager</li>
<li>Client activity (requests, revisions) answered inside the response times &mdash; Owner: account manager</li>
</ul>
<h2>8. Renewal &amp; offboarding</h2>
<ul>
<li>Renewal conversation 30 days before term end &mdash; Owner: account manager</li>
<li>If leaving: Team Transitions/offboarding checklist to 100%, final invoice settled, portal off, CRM Inactive &mdash; Owner: Ronald</li>
</ul>`
        }
      },
      {
        type: "add",
        category: "Agency Process",
        page: {
          id: "sop-project-deadlines-and-time-box-standards",
          title: "Project Deadlines & Time-Box Standards",
          format: "html",
          checklistEnabled: false,
          content: `<p><em>Last updated: October 2026. <strong>All numbers on this page are starting points &mdash; edit them to match reality.</strong> Goal: every phase has a date, every deliverable has a time box, and nobody works past it without a decision.</em></p>
<h2>The rules</h2>
<ul>
<li><strong>Every phase gets a target date</strong> when the timeline is created in Timeline Scheduler. No dates, no kickoff.</li>
<li><strong>Time box:</strong> when a phase reaches its target date, finish it, or the account manager decides the same day: cut scope, add a named extra day, or tell the client the new date. Don't let it drift silently.</li>
<li><strong>2 revision rounds are included.</strong> Consolidated feedback per round. A third round is a Change Order (new quote, signed before work).</li>
<li><strong>Client delays move the date, not the effort.</strong> If the client hasn't responded in 3 business days, send one reminder; at 7 business days, pause the phase and say so in writing.</li>
<li><strong>Scope changes</strong> go through a Change Order &mdash; never absorb them quietly.</li>
</ul>
<h2>Standard turnaround (from the client portal guide)</h2>
<table>
<thead><tr><th>Work</th><th>Our turnaround</th></tr></thead>
<tbody>
<tr><td>Social posts and graphics</td><td>2 business days</td></tr>
<tr><td>Paid ad creative</td><td>2 business days</td></tr>
<tr><td>Video and Reels</td><td>3&ndash;4 business days</td></tr>
<tr><td>Email campaigns</td><td>2 business days</td></tr>
<tr><td>Website pages</td><td>3&ndash;5 business days</td></tr>
</tbody></table>
<h2>What the public website promises (keep our targets inside these)</h2>
<p>From revitalproductions.com &mdash; the Process section and Pricing cards. If you change a promise there, change it here.</p>
<table>
<thead><tr><th>Offer</th><th>Website says</th></tr></thead>
<tbody>
<tr><td>Website process: Proposal / strategy</td><td>1 week</td></tr>
<tr><td>Website process: Define</td><td>2 weeks</td></tr>
<tr><td>Website process: Build</td><td>3&ndash;6 weeks</td></tr>
<tr><td>Website process: Ship</td><td>2 weeks</td></tr>
<tr><td><strong>Website total</strong></td><td><strong>8&ndash;11 weeks</strong> (56&ndash;77 days)</td></tr>
<tr><td>Brand strategy (from $1,200)</td><td>4&ndash;6 weeks</td></tr>
<tr><td>Visual identity (from $2,300)</td><td>1 month</td></tr>
<tr><td>Campaign (from $3,000)</td><td>2&ndash;4 months</td></tr>
</tbody></table>
<p>The Website Build template target below (71 days) sits inside the 8&ndash;11 week promise; plan to the low end and treat the high end as the hard stop. The Paid Ads Campaign Launch template covers the launch only &mdash; the ongoing run is what the 2&ndash;4 month Campaign window covers.</p>
<h2>Project length targets (Timeline Scheduler templates)</h2>
<p>Last phase target, in days from start. Longer than this needs a reason.</p>
<table>
<thead><tr><th>Template</th><th>Target length</th></tr></thead>
<tbody>
<tr><td>Blog / Website Content Batch</td><td>14 days</td></tr>
<tr><td>Content Strategy Overhaul</td><td>21 days</td></tr>
<tr><td>Case Study / Testimonial Project</td><td>24 days</td></tr>
<tr><td>Paid Ads Campaign Launch</td><td>25 days</td></tr>
<tr><td>Email Marketing Campaign</td><td>26 days</td></tr>
<tr><td>Video Production Project</td><td>30 days</td></tr>
<tr><td>Rebrand / Brand Refresh</td><td>33 days</td></tr>
<tr><td>Website Redesign / UX Overhaul</td><td>37 days</td></tr>
<tr><td>Personal Branding Project</td><td>45 days</td></tr>
<tr><td>Social Media Management (onboarding)</td><td>48 days</td></tr>
<tr><td>SEO / Content Campaign (setup)</td><td>53 days</td></tr>
<tr><td>Website Build</td><td>71 days</td></tr>
</tbody></table>
<h2>Weekly focus rhythm</h2>
<ul>
<li><strong>Monday:</strong> account manager checks the week's phase dates; the weekly digest email lists anything overdue.</li>
<li><strong>During the week:</strong> work only on this week's phases; new asks go to the account manager, not straight to the queue.</li>
<li><strong>Friday:</strong> Weekly Account Check-In per client; move phase statuses so the Hub is accurate.</li>
</ul>
<h2>What the Hub does automatically</h2>
<ul>
<li>When a phase is past its target date and not done, the account manager gets an email the first day it is late.</li>
<li>At 3 days late, the leadership/digest recipients get one escalation email.</li>
<li>Overdue phases also appear in the weekly health digest.</li>
<li>To stop alerts: mark the phase Done or move its target date (and tell the client).</li>
</ul>`
        }
      }
    ]
  },
];
