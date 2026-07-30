> Revital Productions — Client Onboarding & Audit Hub
> Architecture reference — core platform vs. tools
>
> Written from a direct audit of the live codebase (not a design spec written in advance). Where the code disagreed with older planning docs, the code wins — those docs are flagged below as stale.

## What this is for

The Hub has grown into the closest thing Revital has to a business operating system: one place that holds client data, contracts, audits, reporting, production workflows, and sales-pipeline tools, all organized per client. That happened organically, one tool at a time, without a single doc describing what's "core" (shared, load-bearing, touched by everything) versus what's a "tool" (one self-contained feature). This doc is that map, plus a short account of where the data model already has some tangle, and what's worth doing about it.

Treat this as a living doc — update it when the core platform itself changes (new shared service, new data boundary), not when a new tool is added. Tools don't need an entry here; the "How a tool works" section below describes the pattern all of them follow.

## The mental model

```
Cloudflare Access (Google SSO, @revitalproductions.com only)
        |
        v
_worker.js  (Cloudflare Worker — the only backend)
        |
        +--> serves static assets (index.html, app.js, every tool's files)
        +--> /api/user, /api/mint-firebase-token   (auth bridge)
        +--> /api/send-email                        (Resend)
        +--> /api/contracts  (GET/POST/DELETE)       (R2 file storage)
        +--> /api/docusign/send-envelope             (DocuSign)
        |
        v
index.html + app.js  (the "core" — nav shell, client switcher,
                       clientsDb data model, shared Firestore access)
        |
        v
61 tool directories, each an iframe with its own index.html/css/js,
talking to the core via window.parent.*
        |
        v
Firestore  (agency/* = internal, clients/{token} = public portal projection)
```

## The core platform

### 1. Shell & navigation (`index.html`, `app.js`)

`index.html` is the only real page. Every tool lives in a `<section id="tab-X">` containing an empty `<iframe src="">`. `app.js` has one big `switch (tabId)` (see `refreshIframeTab()`) that calls a per-tool `renderX()` function, which sets that iframe's `src` to `"<tool-dir>/index.html"` via `setIframeAbsoluteSrc()`. Tools are lazy-loaded — the iframe stays empty until its tab is opened, and `iframeNeedsReload` tracks which tools need their iframe re-pointed when the active client changes.

The sidebar's grouping (Agency Globals, Core, Ad Accounts & Access, Reporting & Health, Production, Content Creation, Account Ops, Audits, Strategy & Competition, Sales Pipeline, Retention & Social Proof, Admin) is just markup in `index.html` — there's no registry file, so "which section does a new tool belong in" is a judgment call made at add-time, not something the platform enforces.

### 2. Auth

Cloudflare Access gates the whole domain to `@revitalproductions.com` Google accounts — this isn't app code, it's configured at the Cloudflare edge. `_worker.js` reads the `Cf-Access-Authenticated-User-Email` header on every request; `/api/mint-firebase-token` takes that verified email and mints a Firebase custom auth token (hand-signed RS256 JWT via Web Crypto, since Workers can't run the Node-based `firebase-admin` SDK), so the Hub can also authenticate against Firestore. `firestore.rules`' `isAdmin()` then checks `request.auth.token.email` ends in `@revitalproductions.com` — the same domain check, duplicated in three places (`app.js`, `_worker.js`, `firestore.rules`) by necessity, since each layer needs its own copy.

### 3. Client data model (`clientsDb`)

Every client's data across every tool lives in one big in-memory object, `clientsDb = { [clientName]: {...} }`, built by `createClientBlankState()`. It's persisted to Firestore **sharded** across `agency/clientsDb-shard-0`, `-1`, etc. (each capped ~700KB, bin-packed by `packClientsDbIntoShards()`), because a single client roster eventually exceeds Firestore's 1MB per-document limit. Real-time listeners (`listenToClientsDbShard()`) merge shards back into one `clientsDb`; `commitDatabaseToCloud()` is the only path that writes it back out, and refuses to write until every expected shard has loaded at least once (this guard is the fix for a real data-loss incident — see `data-loss-prevention-plan.md`, which is accurate and still the reference for that story). Every save also fires a fire-and-forget backup write to `agency/clientsDbBackup-shard-N`.

**Worth knowing:** `sop-wiki` re-implements this same shard/bin-pack pattern independently for its own content, rather than reusing the core's version. It works, but it's a second copy of non-trivial logic (shard sizing, load-completeness guarding) that has to be kept correct twice.

### 4. Public Client Portal boundary

`firestore.rules` defines a second, much narrower collection: `clients/{clientId}`, one doc per client, keyed by a crypto-random magic-link token (holding the link *is* the access control — `allow get: if true`, `allow list: if false`, so it can't be enumerated). This is deliberately a "capability projection" — only what the client-facing `portal/` app needs (branding, their own checklist, approvals, testimonial submission, notifications), never the full internal `clientsDb`. The rule's `allow update` clause whitelists the exact fields an unauthenticated portal visitor may touch; everything else on that doc is admin-write-only. This is the one place in the whole system with real per-field write security, and it's worth treating as the model for any future public-facing surface.

### 5. Shared backend services (all in `_worker.js`)

- **`/api/contracts`** (POST/GET/DELETE) — R2-backed file storage for the Contract Template Library. POST validates the upload actually looks like a PDF.
- **`/api/send-email`** — sends real email via Resend, server-side (API key never reaches the browser). Used by at least 8 different tools (Contract Tracker, QBR Generator, Change Order Generator, Client Welcome Guide, Renewal Tracker, Intake Request, Client Portal Manager, plus core `app.js`) — this is the closest thing to a shared "platform capability" outside the data layer, and any tool needing to send mail should call this rather than rolling its own `mailto:`-only flow.
- **`/api/docusign/send-envelope`** — real e-signature envelopes. Documents (built-ins, uploaded library docs, anything with the baked-in `[[SIG_CLIENT]]`/`[[DATE_CLIENT]]` anchor strings) are anchor-tag agnostic — DocuSign matches the string wherever it appears, so this works the same regardless of which tool produced the PDF.

### 6. The `window.parent` API every tool relies on

Set up in `index.html`'s inline `<script>` block, not `app.js`:

- `window.firebaseDb`, `window.firebaseDoc(db, coll, id)`, `window.firebaseGetDoc(ref)`, `window.firebaseSetDoc(ref, data, opts)`, `window.firebaseOnSnapshot(ref, cb)` — a small shim over the Firebase v8 compat SDK, written so tool code can call it in a v9-modular-looking style.
- `window.firebaseSetDocFromJSON(ref, jsonString)` — **exists specifically because of a cross-realm bug**: an object literal built inside a tool's iframe isn't recognized by the Firestore SDK when handed to `firebaseSetDoc` directly (different JS realm, same shape, gets rejected as "a custom Object object"). Tools writing cross-boundary objects are supposed to JSON-stringify and use this instead. (I hit this same class of bug myself this session, independently, working with `pdf-lib`/`Uint8Array` across an iframe boundary — same root cause, different SDK. It's a real, recurring hazard of the iframe-per-tool architecture, not a one-off.)
- `window.getActiveClient()`, `window.getAllClients()`, `window.clientsDb` — read access to the shared client data model.
- `window.uploadBytesToR2()`-style helpers — **not actually shared**. Contract Tracker and the now-removed SOW Generator each had their own copy of this pattern (same R2 upload call, same Firestore re-fetch-before-write pattern) rather than one shared implementation. Worth consolidating if/when another tool needs the same "upload a generated PDF, register it somewhere" flow.

## How a tool works

Each of the 61 tool directories is a self-contained mini-app: its own `index.html`, `css/`, `js/app.js`. The pattern, consistently:

1. It's loaded into a `<section>`'s iframe by `app.js`'s `renderX()` → `setIframeAbsoluteSrc()`.
2. It reads the active client via `window.parent.getActiveClient()` (or, for content shared across all clients rather than per-client, reads/writes a doc directly under Firestore's `agency/` collection, bypassing `clientsDb` entirely — the Contract Template Library is the clearest example).
3. It saves per-client data by mutating the client object and calling `window.parent.saveDatabase()`; it saves agency-wide data by calling `window.parent.firebaseSetDoc()`/`firebaseSetDocFromJSON()` directly.
4. Some tools (e.g. Brand Guidelines Builder, SOP Wiki) also detect whether they're embedded (`window.parent.getAllClients` exists) versus opened standalone, and degrade gracefully if not — worth keeping as the pattern for any tool that might reasonably be opened outside the shell.

There's no shared component library beyond CSS (`style.css`, `vars.css`, `shared-components.css`) and one shared widget (`shared-dropzone.js`) — every tool's HTML/JS is otherwise independent, which is why patterns like the R2-upload helper above get copy-pasted instead of imported.

## Related docs (don't duplicate — read these instead)

- **`where_to_log_what_hub_vs_clickup.pdf`** — the *external* system boundary: which lifecycle events belong in the Hub vs. ClickUp. Complements this doc, which is about the *internal* boundary (core vs. tool).
- **`data-loss-prevention-plan.md`** — accurate, still current. The full story behind the shard-load-completeness guard described above.
- **`Auto-Send Email Integration Plan.md`** — **stale**. It says "there is no email-sending backend anywhere in the Hub" and proposes building `/api/send-email`. That route has since been fully built and is in production use by 8 tools (see above). This doc should be deleted or marked superseded so nobody re-reads it as current state.
- **`README.md`** — **stale**. Describes an early localStorage-only, GitHub-Pages-hosted prototype with no Firebase/Firestore/R2/Cloudflare Worker/DocuSign at all. Worth a rewrite pointing here instead, since right now it actively misdescribes the stack to anyone opening the repo fresh.
- **`functions/api/user.js`** — **dead code**. `_worker.js` itself notes the Cloudflare Pages Functions convention this file follows "never actually ran" once the project moved to deploying as a Worker with static assets. Safe to delete.

## Data-duplication audit

Went looking for other cases like the Brand Vault → Portal sync gap fixed earlier this session (two tools each owning a copy of "the same" real-world data with nothing keeping them in sync). Findings:

**The one real gap (fixed):** Brand Identity Vault (`client.brandVault`, built into core `app.js`) and the Client Portal's brand display (`client.brandKit`) were two separate fields with no sync — filling in the Vault had zero effect on what a client saw in their portal. Fixed by deriving `brandKit` from `brandVault` on every Vault save.

**Looks like duplication but isn't (already well-reasoned, worth knowing about):**
- `client.brandGuideline` (Brand Guidelines Builder) is a deliberately *separate* deep-dive document, explicitly commented as "intentionally independent, not layered on" the Lite/Vault brandKit summary — different use case (a full brand guideline doc vs. a quick reference), not an oversight. Client Portal Manager already prefers `brandGuideline` over `brandKit` when both exist, so there's a sensible fallback chain, not silent conflict.
- `client.onboardingChecklist` (internal, account-manager-facing task tracker) vs. `client.clientChecklist` (the client's own portal-facing checklist) are two intentionally different lists — `data-store.js` documents this explicitly ("should never be shown to a client as-is").

**Practice worth adopting:** both of the "isn't actually a bug" cases above were only findable by reading code comments left by whoever built them — there's no single data dictionary. A short, append-only "client field registry" (one line per top-level `client.*` field: owner tool, purpose, who else reads it) would turn future "is this a duplicate?" questions from a grep-and-read exercise into a lookup.

## If you're adding something new

**A new tool:** give it its own directory (index.html/css/js), wire it into `index.html`'s nav + a `<section>`, add a `renderX()`/switch-case pair in `app.js` matching the existing pattern, and pick a sidebar section that actually fits — there's no enforcement, so this is on you at add-time. If it needs to send email or store a generated file, check the shared services above before writing a new one.

**A new per-client data field:** decide up front whether it's account-manager-internal or client-visible — if client-visible, it needs a `firestore.rules` `allow update` entry under `clients/{clientId}`, same as the existing whitelisted fields. If something similar-sounding might already exist (brand info, checklists, contact info), grep for it first — see the audit above for what that turns up.

**Cross-iframe object handoffs:** remember the realm problem — a plain object or typed array built in one JS context isn't trusted as "real" by SDKs running in another. Use `firebaseSetDocFromJSON` for Firestore writes from inside a tool's iframe; for anything else crossing that boundary, construct the object in the realm that's going to consume it, not the one that produced the source data.
