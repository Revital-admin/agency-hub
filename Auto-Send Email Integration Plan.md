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

## Alternative considered: sending through Google Workspace instead

Since Revital already pays for Google Workspace, it's worth asking whether that could send these emails instead of adding Resend. Short answer: technically yes, but it's the more complex and fragile option here, for reasons specific to Workers.

Gmail's SMTP servers are out — same problem as SendGrid/Mailgun's SMTP option, Workers can't open a raw SMTP socket. The real option is the **Gmail API** (a REST API, so it can be called via `fetch()`), authenticated as a Workspace account via a **service account with domain-wide delegation**. That setup requires:
- A Super Admin in the Google Workspace Admin Console authorizing the service account's client ID for the `gmail.send` scope (Security → API controls → Domain-wide delegation) — and as of recent Google security tightening, high-privilege grants like this may need a second Super Admin to approve it.
- A service account JSON key stored as a Worker secret, plus hand-rolled JWT-signing code in the Worker to exchange it for an access token — Workers can't use Google's official Node client libraries, so this part is custom crypto code rather than an SDK call, which is meaningfully more fragile than sending one header with an API key.

The upside: it's free (no per-email cost, since it rides the existing Workspace subscription) and sends as your real @revitalproductions.com address rather than a new subdomain. The downside: since Revital's actual volume comfortably fits inside Resend's free tier anyway, the "it's free" advantage doesn't translate into real savings — you'd be trading a much simpler integration (one API key) for a more complex, more fragile one (service account + JWT signing + admin approval step) to save $0. Gmail/Workspace's own send limit (roughly 2,000/day per account) is also not a differentiator either way — both options comfortably cover Revital's volume.

**Recommendation stands: Resend**, specifically because the setup is simpler and more maintainable, not because it's cheaper (it isn't, meaningfully, at this volume).

## What integration actually involves

1. **Sign up for Resend** (or whichever service you pick) — this step is yours to do, not something I can do on your behalf.
2. **Verify a sending domain** — you'll need to add SPF/DKIM DNS records for whatever domain the emails should come from. Your DNS is managed through Cloudflare (GoDaddy is just the registrar, per the Subscription & Tool Cost Tracker — DNS is delegated to Cloudflare's nameservers), which actually makes this easier: it's the same dashboard/account that already hosts the Worker, so there's no separate login or nameserver hunting — just add the records Resend gives you directly in the Cloudflare DNS tab. Sending from a bare Gmail address won't work for a real API integration.

   **Subdomain vs. root domain — this decides what the "From" address can look like:**
   - Verify a subdomain (e.g. `mail.revitalproductions.com`) and emails send as `jane@mail.revitalproductions.com` — completely isolated from the existing Google Workspace DNS on the root domain, zero risk of touching it. Set Reply-To to the account manager's real address so replies still land in their actual inbox.
   - Verify the **root domain** (`revitalproductions.com`) and emails can send as the account manager's real address (`jane@revitalproductions.com`) directly. This is what lets each account manager's name/address be the visible sender. The one thing this requires doing carefully: a domain can only have one SPF TXT record, and Workspace already has one on the root domain. Resend's setup will hand you an SPF record to add — it needs to be **merged into** the existing one (e.g. `v=spf1 include:_spf.google.com include:<resend's include> ~all`), not added as a second record, or SPF breaks for both Workspace and Resend mail. DKIM doesn't conflict either way (separate selector), and MX (incoming mail) isn't touched by any of this.

   Given the goal of sending as each account manager's own address, root-domain verification with a merged SPF record is the way to do that — a normal, well-supported setup, just one DNS edit that needs to be additive rather than a fresh record.
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
