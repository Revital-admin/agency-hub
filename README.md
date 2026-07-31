# Revital Productions — Client Onboarding & Audit Hub

An internal business-operations Hub for Revital Productions: one place for client data, contracts, audits, reporting, production workflows, and the sales pipeline, organized per client and shared across the whole team. It's grown into the closest thing the agency has to a business OS — 60+ purpose-built tools sharing one client data model, one auth gate, and one backend.

Live at **hub.revitalproductions.com**. Access is gated to `@revitalproductions.com` Google accounts via Cloudflare Access — there's no separate login screen or signup flow.

For a full map of how the platform fits together (core shell vs. tools, the client data model, auth, shared backend services, and known rough edges), see **[ARCHITECTURE.md](./ARCHITECTURE.md)**. That doc is the up-to-date reference; this README is just the front door.

If client data ever looks wrong, see **[BACKUP_RESTORE_RUNBOOK.md](./BACKUP_RESTORE_RUNBOOK.md)** for the recovery steps.

---

## Tech stack

- **Backend**: a single Cloudflare Worker (`_worker.js`) — serves the static site, bridges Cloudflare Access identity to a Firebase custom token, and handles email (Resend), contract file storage (R2), and e-signature (DocuSign) API routes.
- **Data**: Firestore. `agency/*` holds internal data (client roster, sharded across multiple docs since a single client list exceeds Firestore's 1MB doc limit); `clients/{token}` is a narrow public-portal projection for the client-facing `portal/` app, keyed by a magic-link token.
- **Frontend**: vanilla HTML/CSS/JS. `index.html` + root `app.js` are the shell (nav, client switcher, shared data access); every tool is its own directory with its own `index.html`/`css`/`js`, loaded into an iframe and talking to the shell via a `window.parent.*` API.
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

Because the Hub depends on Cloudflare Access headers, a live Firestore project, and Worker-only API routes (`/api/mint-firebase-token`, `/api/send-email`, `/api/contracts`, `/api/docusign/send-envelope`), a plain static file server (`python3 -m http.server`, `npx serve`, etc.) will render the UI but auth, data persistence, and every API-backed feature won't work. For real local testing, use `wrangler dev` against the same `wrangler.toml` config used for production, with your own Firestore/R2 credentials wired in.
