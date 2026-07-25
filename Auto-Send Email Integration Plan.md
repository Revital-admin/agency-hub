# Auto-Send Email — Integration Plan

Internal planning doc for Revital Productions. Covers what it would take to move from the Hub's current "build a ready-to-send email, a human sends it" pattern to real automated sending.

## Where things stand today

Confirmed by searching the whole codebase: there is no email-sending backend anywhere in the Hub. Every "email" feature — the approval-request email in Client Portal Manager, the referral/testimonial-ask flows — builds a subject/body/`to` into an editable draft plus a `mailto:` link, and a person reviews and sends it from their own inbox. The Cloudflare Worker (`_worker.js`) only has two routes today (`/api/user`, `/api/mint-firebase-token`) and no outbound email calls.

Real auto-send means adding a third-party transactional email API and a new Worker route that calls it.

## Recommended service: Resend

Of the options compared (Resend, SendGrid, Mailgun, Postmark), Resend fits best for a Cloudflare Worker: a plain REST API (`fetch()` with a JSON body — no SDK/SMTP library needed, which matters since Workers don't support Node's `net`/SMTP sockets), a permanent free tier rather than a time-limited trial, and it's the option Cloudflare's own docs point to now that Cloudflare's native Workers Email sending is still in beta.

Rough shape as researched (verify current numbers directly on each vendor's pricing page before committing — comparison sites drift out of date fast and some of what's indexed right now looks unreliable):
- **Resend** — free tier around 3,000 emails/month with no expiration; paid tier starts around $20/mo for 50k emails.
- **SendGrid** — dropped its permanent free plan; now a 60-day trial only, then a paid plan.
- **Mailgun / Postmark** — free tiers are either very low-volume or developer/test-only, not meant for ongoing production use.

At Revital's likely volume (approval requests, stale-client nudges, testimonial asks — probably well under a few hundred/month), Resend's free tier should cover it for a long time.

## Is Resend actually right for Revital, long-term?

Yes, with one caveat below. Two things make it a good fit specifically for this setup, not just a generic recommendation:

- **Technical fit with Workers is real, not incidental.** Both Resend's own docs and Cloudflare's own developer docs walk through this exact pairing (Resend + Workers) as a supported path, because Workers can't open raw SMTP sockets — Resend's plain REST API is one of the few transactional providers that fits that constraint cleanly. SendGrid/Mailgun's official SDKs lean on Node APIs Workers doesn't have.
- **DNS is already on Cloudflare** (per Ronald), so domain verification is a same-dashboard task, not a separate registrar login.

The one real caveat from researching this further: Resend's shared-IP/log-retention setup is tuned for typical SaaS transactional volume, and gets noticeably less favorable above roughly 100k emails/month (pricier per-email, shorter log retention for debugging). That's not a near-term concern — Revital's actual volume (approval requests, stale nudges, testimonial asks, maybe onboarding/report notices across the client roster) is realistically in the dozens-to-low-hundreds per month, nowhere near that ceiling.

If Revital ever wants **bulk marketing sends** (a newsletter blast to all clients, not one-to-one transactional emails), that's a different product category — worth evaluating separately at that point rather than assuming Resend covers it too.

**Why the vendor choice itself is low-risk:** the integration point is a single Worker route (`POST /api/send-email`, step 4 below) that the rest of the Hub calls generically. If Resend ever stops fitting, swapping providers later means rewriting that one server-side function — nothing else in the Hub or portal talks to the email provider directly. So the bigger future-proofing decision isn't really "which vendor" — it's keeping that one-route abstraction, which this plan already does.

## What integration actually involves

1. **Sign up for Resend** (or whichever service you pick) — this step is yours to do, not something I can do on your behalf.
2. **Verify a sending domain** — you'll need to add SPF/DKIM/DMARC DNS records for whatever domain the emails should come from (e.g. `mail.revitalproductions.com` or a subdomain of it). Your DNS is managed through Cloudflare (GoDaddy is just the registrar, per the Subscription & Tool Cost Tracker — DNS is delegated to Cloudflare's nameservers), which actually makes this easier: it's the same dashboard/account that already hosts the Worker, so there's no separate login or nameserver hunting — just add the records Resend gives you directly in the Cloudflare DNS tab. Sending from a bare Gmail address won't work for a real API integration.
3. **Get an API key** and hand it to me (or store it yourself) — it gets set as a Cloudflare Worker secret (`wrangler secret put RESEND_API_KEY`), never committed to the repo or put in client-side code.
4. **Add one Worker route** (e.g. `POST /api/send-email`) that accepts `{to, subject, body}` from the Hub's admin-side JS, calls Resend's send endpoint server-side, and returns success/failure. This is the only new backend code needed — everything else stays the same.
5. **Wire specific flows to call it**, one at a time rather than all at once:
   - Start with the **stale-client nudge** reminder email (lowest risk — it's a nice-to-have reminder, not a client-facing legal/financial notice).
   - Then the **approval-request** email, replacing `buildApprovalEmail`'s mailto link with a "Send" button that calls the new route.
   - Testimonial-ask and anything else last, once the first two have run cleanly for a few weeks.
6. **Keep a manual fallback** — if the API call fails (bad key, rate limit, Resend outage), fall back to showing the same ready-to-send draft/mailto link that exists today, rather than silently losing the email.

## What this doesn't change

Nothing about approval logging, checklist behavior, or any of the other features built this session depends on this. This is purely a delivery-mechanism upgrade for a handful of existing "email" features — nothing needs to wait on it.

## Decision needed from you before I can build any of this

- Which service (Resend recommended, but your call)
- Which sending domain/subdomain to verify
- Confirmation you're comfortable handing me an API key to store as a Worker secret (I never see or store it in plaintext anywhere the client can read)

Once you've got an account and a verified domain, this is roughly a half-day build for the first flow (stale-client nudge) plus the Worker route.
