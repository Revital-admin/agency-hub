# Revital Productions — Client Onboarding & Audit Hub

An internal business-operations Hub for Revital Productions: one place for client data, contracts, audits, reporting, production workflows, and the sales pipeline, organized per client and shared across the whole team. It's grown into the closest thing the agency has to a business OS — 80+ purpose-built tools sharing one client data model, one auth gate, and one backend.

Live at **hub.revitalproductions.com**. Access is gated to `@revitalproductions.com` Google accounts via Cloudflare Access — there's no separate login screen or signup flow.

For a full map of how the platform fits together (core shell vs. tools, the client data model, auth, shared backend services, and known rough edges), see **[ARCHITECTURE.md](./ARCHITECTURE.md)**. That doc is the up-to-date reference; this README is just the front door.

If client data ever looks wrong, see **[BACKUP_RESTORE_RUNBOOK.md](./BACKUP_RESTORE_RUNBOOK.md)** for the recovery steps.

---

## Tech stack

- **Backend**: a single Cloudflare Worker (`_worker.js`) — serves the static site, bridges Cloudflare Access identity to a Firebase custom token, and hosts every server-side integration:
  - **Resend** — outbound email (`/api/send-email`), used by 8+ tools.
  - **R2** — contract file storage (`/api/contracts`).
  - **DocuSign** — e-signature envelopes (`/api/docusign/send-envelope`). Runs in **test and live mode side by side** (separate secret pairs, a UI toggle picks which one a given send uses), same pattern as Stripe below. Test mode works today; live mode needs a completed Go-Live (production DocuSign account + approved integration key) before it does anything — see the SOP wiki's Contract Signing Process SOP for the checklist.
  - **Stripe** — real recurring billing via Checkout Sessions (`/api/billing/create-subscription-checkout`) and a webhook (`/api/stripe/webhook`) that keeps payment status in sync. Test and live mode both run permanently (not a one-time cutover like DocuSign) — see the SOP wiki's Recurring Billing SOP.
  - **Google Calendar** (domain-wide delegation service account, `GOOGLE_SERVICE_ACCOUNT_KEY`) — powers the public Prospect Booking page (`/api/booking/*`, book.revitalproductions.com) and the Team Roster Time Off → Calendar sync (a shared "Revital Team Out" calendar plus busy-blocks on each person's own calendar). Both run on **Central time** (`America/Chicago`) — this was wrong (hardcoded to Eastern) until fixed August 2026.
  - **ClickUp** — one-way sync (`/api/pipeline/sync-clickup`) mirroring Sales Pipeline Board deal creates/stage-changes into ClickUp's own Sales Pipeline list. Hub is authoritative; ClickUp-side edits never flow back.
  - **Contractor Portal** (`/api/contractor-portal/*`) — magic-token, no-login access for contractors to log hours and request time off (admin approval required), without touching the shared roster/hours documents directly.
  - **Idle Lock PIN** (`/api/idle-lock/*`) — per-person, admin-generated, salted-hash PINs that lock the Hub after 20 minutes idle, independent of the underlying Cloudflare Access session.
  - **Weekly Agency Health Digest** — a Cron Trigger (no HTTP request involved) that emails a Monday-morning client-health summary; reuses the Firestore credential, not a separate integration.
- **Data**: Firestore. `agency/*` holds internal data (client roster, sharded across multiple docs since a single client list exceeds Firestore's 1MB doc limit); `clients/{token}` is a narrow public-portal projection for the client-facing `portal/` app, keyed by a magic-link token.
- **Frontend**: vanilla HTML/CSS/JS. `index.html` + root `app.js` are the shell (nav, client switcher, shared data access); every tool is its own directory with its own `index.html`/`css`/`js`, loaded into an iframe and talking to the shell via a `window.parent.*` API. 82 tool tabs as of August 2026.
- **Auth**: Cloudflare Access at the edge (Google SSO, domain-restricted) — not application code.

---

## Deploying

This deploys via Cloudflare's git-connected auto-deploy, not GitHub Pages or a manual upload flow. To ship a change:

```bash
git push origin main
```

If a change needs a fresh Worker deploy immediately rather than waiting on the git-connected build:

```bash
npx wrangler deploy
```

(Requires `wrangler` to be authenticated against the Cloudflare account this project lives under — run `npx wrangler whoami` to check.)

**Before either, run the smoke test:**

```bash
node scripts/verify-hub.js
```

There's no automated test suite for this project - it's ~40k lines of hand-maintained JS with no safety net beyond this script. It statically checks every JS file for syntax errors, confirms every tool folder is actually wired into the nav/reload system and every iframe-based tab has a matching dispatch case (the exact bug class fixed in the "6 tools with hardcoded iframe src" commit — a tool that's never wired in silently never refreshes when you switch clients), and flags a couple of advisory-only concerns (direct Firestore writes that skip the shared version-guard helper, JS referencing an element id that doesn't exist in its own HTML). See the comment at the top of the script for details. Exits non-zero if anything real is broken.

**Make it automatic (one-time setup, per clone):**

```bash
git config core.hooksPath .githooks
```

This points git at the committed `.githooks/pre-push` hook, which runs the smoke test on every `git push` and blocks the push if it fails (`git push --no-verify` skips it in an emergency). Cloudflare's git-connected auto-deploy has no build-time checks of its own — without this, a broken push goes straight to production the moment it lands on `main`. Every clone needs to run the `git config` line once; it isn't inherited automatically. A GitHub Actions workflow (`.github/workflows/verify.yml`) runs the same check server-side as a second layer, independent of whether any given clone has the hook enabled — see that file's comment for the one-time GitHub branch-protection setting that would let it actually block a bad push, not just flag it.

---

## Running locally

Because the Hub depends on Cloudflare Access headers, a live Firestore project, and Worker-only API routes (`/api/mint-firebase-token`, `/api/send-email`, `/api/contracts`, `/api/docusign/send-envelope`, `/api/billing/create-subscription-checkout`, `/api/booking/*`, and more), a plain static file server (`python3 -m http.server`, `npx serve`, etc.) will render the UI but auth, data persistence, and every API-backed feature won't work. For real local testing, use `wrangler dev` against the same `wrangler.toml` config used for production, with your own Firestore/R2 credentials wired in.
