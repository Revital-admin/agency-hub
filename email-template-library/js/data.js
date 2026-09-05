/* ============================================================
   EMAIL TEMPLATE LIBRARY — starter content
   Seeded from the templates referenced by number throughout the
   System Flows doc (Template #2, #8, #11, #13, etc.) so the library
   isn't empty on first load. This is only the fallback shown before
   Firestore data exists / when opened outside the Hub - once saved,
   agency/emailTemplates in Firestore is the real source of truth and
   this file is never written back to.
   ============================================================ */

const EMAIL_TEMPLATES = [
  {
    id: "tpl-followup-2",
    category: "Sales Follow-Up",
    templateNumber: "#2",
    title: "Follow-Up — Day 3",
    subjectLine: "Following up on your proposal",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Just wanted to float this back to the top of your inbox — I sent over a proposal for {{clientName}} a few days ago and wanted to see if you had any questions.</p><p>Happy to jump on a quick call if it's easier to talk through the scope or pricing.</p><p>Looking forward to hearing from you.</p>"
  },
  {
    id: "tpl-followup-3",
    category: "Sales Follow-Up",
    templateNumber: "#3",
    title: "Follow-Up — Day 7 (Value Add)",
    subjectLine: "One more thing that might help",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Wanted to share a quick resource/example relevant to what we discussed for {{clientName}} — thought it might help while you're weighing the proposal.</p><p>Still happy to answer questions or adjust scope if anything needs tweaking.</p>"
  },
  {
    id: "tpl-followup-4",
    category: "Sales Follow-Up",
    templateNumber: "#4",
    title: "Follow-Up — Day 12 (Expiry Warning)",
    subjectLine: "Your proposal is expiring soon",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Just a heads up that the pricing in the proposal we sent for {{clientName}} is set to expire soon. If you're still interested, let's get it locked in — happy to answer any last questions first.</p>"
  },
  {
    id: "tpl-welcome-8",
    category: "Onboarding",
    templateNumber: "#8",
    title: "Welcome Email (Welcome Guide attached)",
    subjectLine: "Welcome to Revital Productions 🎉",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Welcome aboard! We're excited to start working with {{clientName}}.</p><p>Attached is your Welcome Guide — inside you'll find your dedicated Account Manager's contact info, what we're building for you, your first 30 days with us mapped out week by week, and how we handle communication and approvals.</p><p>You can access your client portal here: {{portalLink}}</p><p>Talk soon,<br>{{accountManagerName}}</p>"
  },
  {
    id: "tpl-kickoff-10",
    category: "Onboarding",
    templateNumber: "#10",
    title: "Kick-Off Call Confirmation",
    subjectLine: "Confirming our kick-off call",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Confirming our kick-off call for {{clientName}} on {{kickoffDate}}. We'll walk through your client portal, answer any questions, and align on next steps.</p><p>See you then!</p>"
  },
  {
    id: "tpl-intake-received-17c",
    category: "Onboarding",
    templateNumber: "#17C",
    title: "Intake Form Received Confirmation",
    subjectLine: "Got your intake form — thank you!",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Thanks for filling out your intake form — we've received it and our team is reviewing it now.</p><p>We'll be in touch shortly to schedule your kick-off call.</p>"
  },
  {
    id: "tpl-review-12",
    category: "Content Delivery",
    templateNumber: "#12",
    title: "Client Review Notification",
    subjectLine: "Ready for your review",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>A new deliverable is ready for your review: <strong>{{deliverableName}}</strong>.</p><p>You can view and approve it here: {{previewLink}}</p><p>Let us know if you'd like any changes.</p>"
  },
  {
    id: "tpl-revision-received-13",
    category: "Content Delivery",
    templateNumber: "#13",
    title: "Revision Received Confirmation",
    subjectLine: "Got your revision request",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Thanks — we've received your revision request for {{deliverableName}} and the team is on it.</p><p>We'll let you know as soon as the updated version is ready for review.</p>"
  },
  {
    id: "tpl-revision-delivered-14",
    category: "Content Delivery",
    templateNumber: "#14",
    title: "Revision Delivered",
    subjectLine: "Your revised deliverable is ready",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>The revised version of {{deliverableName}} is ready for review in your client portal.</p><p>Take a look and let us know if it's good to go.</p>"
  },
  {
    id: "tpl-monthly-report-11",
    category: "Reporting",
    templateNumber: "#11",
    title: "Monthly Report Delivery",
    subjectLine: "Your {{reportMonth}} report is ready",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Your {{reportMonth}} performance report is ready and available in your client portal.</p><p>Highlights are summarized on the first page — happy to walk through it live if that's helpful.</p>"
  },
  {
    id: "tpl-offboarding-final-16",
    category: "Offboarding",
    templateNumber: "#16",
    title: "Offboarding Final Email",
    subjectLine: "Wrapping up — thank you for working with us",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>As we wrap up our work together, thank you for the opportunity to support {{clientName}} — it's been a pleasure.</p><p>Your final performance report is attached, and your portal access will be deactivated shortly.</p><p>If you ever want to pick things back up, we'd love to hear from you.</p>"
  },
  {
    id: "tpl-proposal-sent-1",
    category: "Sales",
    templateNumber: "#1",
    title: "Proposal Sent",
    subjectLine: "Your Revital Productions Proposal — {{clientName}}",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>It was great connecting with you today. As promised, I've put together your proposal package — the Marketing Proposal, Statement of Work, and Master Service Agreement.</p><p>Once the documents are signed and your first payment is submitted, I'll send your welcome email and we'll get your kick-off call on the calendar.</p><p>Happy to answer anything — just reply to this email.</p>"
  },
  {
    id: "tpl-not-moving-forward-5",
    category: "Sales",
    templateNumber: "#5",
    title: "Not Moving Forward",
    subjectLine: "Re: Revital Productions — {{clientName}}",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Thank you for the time you took to consider working together — I genuinely appreciated learning about {{clientName}}.</p><p>If circumstances change down the road, don't hesitate to reach out. We'll always be happy to reconnect.</p><p>Wishing you nothing but success.</p>"
  },
  {
    id: "tpl-reengagement-6",
    category: "Sales",
    templateNumber: "#6",
    title: "Re-Engagement (90 Days Later)",
    subjectLine: "Checking In — {{clientName}}",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>It's been a few months since we last connected and I wanted to check in — not to pitch anything, just to see how things are going on the marketing front.</p><p>If you'd like to catch up, happy to jump on a quick 15-minute call — no agenda, just a conversation.</p>"
  },
  {
    id: "tpl-decision-maker-intro-7",
    category: "Sales",
    templateNumber: "#7",
    title: "Decision Maker Introduction",
    subjectLine: "Summary for {{decisionMakerName}} — Revital Productions Proposal",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>As discussed, here's a quick summary you can share with {{decisionMakerName}} to help them get up to speed — what we do, what we discussed, and what we proposed (services, monthly investment, term, start date).</p><p>Happy to schedule a quick call with both of you together if that's easier.</p>"
  },
  {
    id: "tpl-intake-followup-9",
    category: "Onboarding",
    templateNumber: "#9",
    title: "Intake Form Follow-Up",
    subjectLine: "Quick Reminder — Your Onboarding Form Is Waiting",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Just a quick friendly reminder that we're still waiting on your completed onboarding form — we need this before we can schedule your kick-off call.</p><p>Reply here if you run into any issues and I'll help right away.</p>"
  },
  {
    id: "tpl-contract-renewal-15",
    category: "Renewal",
    templateNumber: "#15",
    title: "Contract Renewal",
    subjectLine: "Let's Talk About What's Next for {{clientName}}",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Your current contract is coming up for renewal on {{contractEndDate}}, and I wanted to reach out well in advance so we have plenty of time to plan ahead.</p><p>I'd love to schedule a renewal call to talk through your goals for the next 6-12 months and any adjustments that make sense.</p>"
  },
  {
    id: "tpl-intake-send-17",
    category: "Onboarding",
    templateNumber: "#17",
    title: "Intake Form — Send to Client",
    subjectLine: "Your Onboarding Form — Revital Productions",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Welcome aboard! Attached is your Client Onboarding Form — this is how we learn everything we need to know about your business, brand, and goals before our kick-off call.</p><p>Please complete and return this within 48 hours so we can get your kick-off call on the calendar.</p><p>You'll also have access to your client portal here: {{portalLink}} — we'll use it for all deliverables, feedback, and approvals going forward.</p><p>Talk soon,<br>{{accountManagerName}}</p>"
  },
  {
    id: "tpl-intake-followup-17b",
    category: "Onboarding",
    templateNumber: "#17B",
    title: "Intake Form — Follow-Up (No Response)",
    subjectLine: "Quick Reminder — Your Onboarding Form",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Just a friendly nudge — we're still waiting on your completed onboarding form. I've re-attached it in case the original got buried.</p><p>Reach out if anything is unclear and I'll help you through it.</p>"
  },
  {
    id: "tpl-referral-reward-18",
    category: "Referral",
    templateNumber: "#18",
    title: "Referral Reward Notification",
    subjectLine: "🎉 Your Referral Reward Is Ready — {{referredClientName}}",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Amazing news — {{referredClientName}} just officially joined the Revital Productions family, and it's because of you. Thank you.</p><p>You've earned your referral reward — reply with your choice of account credit, gift card, percentage of first month, or a free service add-on.</p>"
  },
  {
    id: "tpl-referral-program-info-18b",
    category: "Referral",
    templateNumber: "#18B",
    title: "Referral Program Info",
    subjectLine: "How Our Referral Program Works — Revital Productions",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>So glad you asked — here's how our referral program works. If someone you refer becomes a client, you earn a reward once they sign and pay their first invoice.</p><p>Feel free to just pass along my name and email and I'll take it from there.</p>"
  },
  {
    id: "tpl-referral-reward-confirmation-19",
    category: "Referral",
    templateNumber: "#19",
    title: "Referral Reward Confirmation",
    subjectLine: "Your Referral Reward — Confirmed ✅",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Your referral reward is confirmed — {{rewardDetails}}.</p><p>Thank you again for the introduction, it genuinely means so much to us. And if you know anyone else who could benefit from what we do, we'd love another introduction.</p>"
  },
  {
    id: "tpl-sales-assessment-outreach-1",
    category: "Sales & Prospecting",
    templateNumber: "#1 (Sales)",
    title: "Free Marketing Assessment Outreach",
    subjectLine: "Quick question about {{clientName}}'s marketing",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>I came across {{clientName}} and noticed {{specificObservation}}.</p><p>I run Revital Productions — a marketing and digital production company. I'd love to offer you a free Marketing Assessment: a quick breakdown of what's working, what's not, and what we'd recommend on your social, website, and ads. No strings attached.</p><p>Interested? Just reply and I'll get it started.</p>"
  },
  {
    id: "tpl-sales-assessment-delivery-2",
    category: "Sales & Prospecting",
    templateNumber: "#2 (Sales)",
    title: "Free Marketing Assessment Delivery",
    subjectLine: "Your Free Marketing Assessment — {{clientName}}",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>Thank you for letting us take a look at {{clientName}}'s marketing — here's what we found: what's working, the opportunities we identified, and our top recommendation.</p><p>I'd love to walk you through these findings — would you be open to a quick 20-minute call this week?</p>"
  },
  {
    id: "tpl-testimonial-request-20",
    category: "Client Success",
    templateNumber: "#20",
    title: "Testimonial Request",
    subjectLine: "Would you be open to sharing your experience with us?",
    format: "html",
    date: "2026-07-21",
    content: "<p>Hi {{contactName}},</p><p>We've really loved working with {{clientName}} and the results we've seen together. We put together in-depth case studies for our best client partnerships — it's great exposure for your brand too since it gets your company featured in our marketing.</p><p>Would you be open to sharing a few sentences about your experience? I've set up a quick spot in your client portal under \"Leave a Testimonial\" where you can type it directly whenever's convenient — takes less than five minutes.</p><p>No pressure at all, and thank you again for the trust.</p>"
  },
  {
    id: "tpl-content-request-22",
    category: "Content & Asset Requests",
    templateNumber: "#22",
    title: "Content/Asset Request",
    subjectLine: "A few things we need from you for {{deliverableName}}",
    format: "html",
    date: "2026-08-18",
    content: "<p>Hi {{contactName}},</p><p>We're getting started on {{deliverableName}} for {{clientName}} and need a few things from your end before we can move forward:</p><ul><li>{{itemNeeded1}}</li><li>{{itemNeeded2}}</li><li>{{itemNeeded3}}</li></ul><p>If you can get these to us by {{dueDate}}, we'll stay on track for {{targetCompletionDate}}. You can reply directly to this email or upload files through your client portal — whichever's easier.</p><p>Let us know if anything on the list needs clarifying.</p><p>Thanks,<br>{{accountManagerName}}</p>"
  },
  {
    id: "tpl-content-request-followup-22b",
    category: "Content & Asset Requests",
    templateNumber: "#22B",
    title: "Content/Asset Request — Follow-Up (No Response)",
    subjectLine: "Quick reminder — still need a few things for {{deliverableName}}",
    format: "html",
    date: "2026-08-18",
    content: "<p>Hi {{contactName}},</p><p>Just a friendly nudge — we're still waiting on {{itemNeeded1}} (and anything else from our last note) before we can move forward on {{deliverableName}}.</p><p>To keep {{clientName}} on track for {{targetCompletionDate}}, we'd need these by {{dueDate}}. Let us know if you're missing anything or need more time, and we'll adjust the timeline together.</p>"
  },
  {
    id: "tpl-contract-send-21",
    category: "Contracts",
    templateNumber: "#21",
    title: "Contract Sent for Signature",
    subjectLine: "Your Contract with Revital Productions — {{clientName}}",
    format: "html",
    date: "2026-07-26",
    content: "<p>Hi {{contactName}},</p><p>Attached is your {{contractName}} for {{clientName}} — please review, sign, and return at your earliest convenience.</p><p>If anything in the agreement needs clarifying, just reply here and I'm happy to walk through it.</p><p>Thanks,<br>{{accountManagerName}}</p>"
  }
];
