# Auto-Send Email Integration — Status: Implemented

This was a planning doc for adding real automated email sending to the Hub. **That work is done** — kept here as the rationale/history behind the current setup, not as an open proposal. If you're reading this to decide whether to build auto-send, stop: it's already built and in use by 9+ tools (Client Portal Manager, Contract & Invoice Tracker, Change Order Generator, QBR Generator, SOP Wiki, Client Welcome Guide, Renewal Tracker, Intake Request, and the root Hub app).

## What actually got built

- **Service**: Resend, as recommended below.
- **Route**: `POST /api/send-email` in `_worker.js` (`handleSendEmail`) — accepts `{to, subject, body, from, replyTo, attachments}`, gated to `@revitalproductions.com` Cloudflare-Access-authenticated requests, calls Resend's API server-side with the key stored as the `RESEND_API_KEY` Worker secret.
- **Domain verification**: root domain (`revitalproductions.com`), not a subdomain — emails send as the account manager's own real address (`jane@revitalproductions.com`), exactly the setup described below as the goal. The route validates every `from` address ends in `@revitalproductions.com` before calling Resend, so it can't be used to spoof other senders.
- **Attachments**: supported (base64, 10MB combined cap) — used for Welcome Guide / Intake Form PDF emails.
- **Fallback**: tools that send email generally still keep a mailto/manual option alongside the auto-send button rather than removing the old path outright.

Everything below this line is the original planning doc, preserved for context on *why* Resend and *why* root-domain verification were chosen — useful if a vendor swap is ever considered, since the route is a single, isolated integration point (see "Why the vendor choice itself is low-risk" below).

---

## Where things stood before this was built

Every "email" feature — the approval-request email in Client Portal Manager, the referral/testimonial-ask flows — built a subject/body/`to` into an editable draft plus a `mailto:` link, and a person reviewed and sent it from their own inbox. The Cloudflare Worker (`_worker.js`) had no outbound email calls.

Real auto-send meant adding a third-party transactional email API and a new Worker route that calls it.

## Recommended service: Resend

Of the options compared (Resend, SendGrid, Mailgun, Postmark), Resend fit best for a Cloudflare Worker: a plain REST API (`fetch()` with a JSON body — no SDK/SMTP library needed, which matters since Workers don't support Node's `net`/SMTP sockets), a permanent free tier rather than a time-limited trial, and it's the option Cloudflare's own docs point to now that Cloudflare's native Workers Email sending is still in beta.

Rough shape as researched at the time (verify current numbers directly on each vendor's pricing page if revisiting this):
- **Resend** — free tier around 3,000 emails/month with no expiration; paid tier starts around $20/mo for 50k emails.
- **SendGrid** — dropped its permanent free plan; now a 60-day trial only, then a paid plan.
- **Mailgun / Postmark** — free tiers are either very low-volume or developer/test-only, not meant for ongoing production use.

At Revital's likely volume (approval requests, stale-client nudges, testimonial asks — well under a few hundred/month), Resend's free tier comfortably covers it.

## Why Resend, long-term

- **Technical fit with Workers is real, not incidental.** Both Resend's own docs and Cloudflare's own developer docs walk through this exact pairing as a supported path, because Workers can't open raw SMTP sockets. SendGrid/Mailgun's official SDKs lean on Node APIs Workers doesn't have.
- **DNS is already on Cloudflare**, so domain verification was a same-dashboard task.

Caveat noted at the time: Resend's shared-IP/log-retention setup is tuned for typical SaaS transactional volume and gets less favorable above roughly 100k emails/month. Not a near-term concern at Revital's actual volume.

**Why the vendor choice itself is low-risk:** the integration point is a single Worker route (`POST /api/send-email`) that the rest of the Hub calls generically. If Resend ever stops fitting, swapping providers means rewriting that one server-side function — nothing else in the Hub or portal talks to the email provider directly.

## Alternative considered: sending through Google Workspace instead

Technically possible via the Gmail API with a service account + domain-wide delegation, but meaningfully more fragile for a Worker (custom JWT-signing code instead of an SDK, a Super Admin approval step) to save $0 at Revital's volume, since it comfortably fits inside Resend's free tier anyway. Resend was chosen for simplicity and maintainability, not cost.

## Domain verification approach that was used

Root-domain verification (`revitalproductions.com`), not a subdomain — this is what lets emails send as each account manager's own address rather than a shared subdomain sender. This required merging Resend's SPF record into Workspace's existing root-domain SPF record (a domain can only have one SPF TXT record) rather than adding a second one. DKIM didn't conflict (separate selector); MX (incoming mail) wasn't touched.
