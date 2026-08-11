# Cloudflare Rate Limiting

Companion note to [BACKUP_RESTORE_RUNBOOK.md](./BACKUP_RESTORE_RUNBOOK.md) and [data-loss-prevention-plan.md](./data-loss-prevention-plan.md) — this one covers request-level abuse protection on the Hub's two unauthenticated public endpoints, not data safety.

## Why this exists

Most of the Hub sits behind Cloudflare Access (Google SSO, @revitalproductions.com only). Two things deliberately don't:

- **Prospect Booking** (`book.revitalproductions.com`, `/api/booking/*`) — has to work for someone with no account at all.
- **Contractor Portal** (`hub.revitalproductions.com/contractor-portal/*` + `/api/contractor-portal/*`) — same reason, gated by a magic-link token instead of a login.

Neither of those routes has anything else in front of them (no login, no CAPTCHA), so without a rate limit, a script could hammer either one — spamming fake bookings, or just running up Firestore read/write costs — with nothing to stop it.

## What's live (Aug 2026)

One Cloudflare **Rate limiting rule** on the `revitalproductions.com` zone, named **"Booking API rate limit"**:

- Match: `URI Path wildcard "/api/booking/*"` AND `Hostname equals book.revitalproductions.com`
- Rate: 5 requests / 10 seconds, tracked per IP
- Action: Block for 10 seconds
- Status: Active (confirmed deployed and showing in Security → Security rules)

Set up and verified working via the Cloudflare dashboard (Security → Security rules → Rate limiting rules → Create rule).

## Why Contractor Portal doesn't have one yet

**Cloudflare's Free plan caps a zone at 1 rate limiting rule.** revitalproductions.com is on Free, and the one available slot went to Booking, not Contractor Portal, for a specific reason: Contractor Portal already requires a real token (checked server-side to be at least 16 characters — see `getContractorProjection` in `_worker.js`) before it returns anything. Someone hitting it without a valid token wastes a Firestore read and gets nothing back — it's already reasonably self-protecting. Booking has no secret at all; it's meant to be shared and clicked by any prospect, which makes it the more realistic target for form-spam bots.

**Free plan constraints, for reference** (from Cloudflare's own [Rate limiting rules availability table](https://developers.cloudflare.com/waf/rate-limiting-rules/#availability)):

| | Free | Pro | Business |
|---|---|---|---|
| Rules per zone | 1 | 2 | 5 |
| Counting period | 10s only | up to 1 min | up to 10 min |
| Mitigation duration | 10s only | up to 1 hour | up to 1 day |

**To do later:** if the Hub moves to Cloudflare Pro (or another rule slot frees up), add a second rule:
- Match: `URI Path wildcard "/api/contractor-portal/*"` OR `"/contractor-portal/*"` AND `Hostname equals hub.revitalproductions.com`
- Same starting point: 5 requests / 10s (or looser, once on Pro's longer windows — e.g. 20/min), Block

## If a real user ever gets blocked

The 10-second block window means this self-resolves fast — worst case, someone waits 10 seconds and retries. If it happens repeatedly to a legitimate prospect or contractor, loosen the request count in the rule rather than removing it.
