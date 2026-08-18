# Agency Hub — Tool Improvement Backlog

Full audit of every tool folder in the Hub, done the night of Aug 16, 2026, right after finishing Production Board. Nothing below has been built yet — this is the punch list to work from tomorrow. Organized so the easy/safe stuff is first.

## Tier 1 — Quick fixes (bugs / dev hygiene, no design decisions needed) — ✅ DONE (Aug 17, 2026)

These are copy-paste leftovers and small bugs. Safe to knock out fast, in any order.

- **SEO Audit Checklist, Social Media Audit Checklist, UX/UI Audit Checklist** — all three define `window.hexToRgba` twice in the same file, and their DOMContentLoaded bootloader calls functions (`setupEventHandlers`, `renderDynamicPlatforms`, etc.) that don't exist in the file. Harmless (silently no-op'd) but confusing. One cleanup pass fixes all three since they share a common ancestor.
- **Paid Ads Audit** — its localStorage fallback keys are literally `seo-checklist-state` / `seo-checklist-notes` / `seo-checklist-data`, copy-pasted from SEO Audit Checklist. If either tool's `isEmbedded` check ever fails, they'd silently read/overwrite each other's saved progress. One-line rename.
- **Campaign Launch Checklist** — same issue: internally still named/commented "SEO AUDIT CHECKLIST," same `seo-checklist-*` localStorage keys. Also has stray dev files sitting in the folder that aren't referenced anywhere: `check_quotes.py`, `check_quotes_detailed.py`, `test_logo.py`, `test_logs3.py`, `temp.html` — safe to delete.
- **Content Audit, Content Strategy Guide, Email Marketing Audit** — all three forked from the same base file; state variable names don't match what's on screen (e.g. Content Audit's state uses `listSize`/`openRate`, which are email-audit terms, but the labels shown are page-count/traffic). Not broken, just confusing to edit later. Rename pass.
- **Timeline Scheduler** — `index.html` has two elements with `id="phasesList"` (invalid duplicate ID); the second one is dead orphaned markup right before `</main>`. Delete it.
- **Revital Marketing** (the agency's own internal marketing tracker) — the page header still reads "Sales Pipeline," a copy-paste leftover. Should say something like "Marketing" or "Revital Brand."
- **Client Portal** (client-facing!) — if anything throws during page load, the loading screen gets replaced with the raw JS error message and line number instead of a friendly fallback. A real client could see this. Low-risk fix: show a generic "something went wrong, we've been notified" message, keep the real error in `console.error` only.

## Tier 2 — Missing search/filter as these grow

None of these are broken today — they're fine at current volume — but each is a log/list with no way to search or filter, and will get unwieldy as entries pile up over months/years. Same pattern Production Board and Content Calendar already use.

- **Hours Tracker** — no search or date-range filter on the entries table; three people logging daily will make this long fast.
- **Meeting Notes Logger** — no search/filter on a client's meeting timeline; matters most for long-tenured clients with years of monthly syncs.
- **Cold Outreach Sequencer** — no filter on the leads table (only a client-name autocomplete on the *add* row).
- **Referral Tracker** — agency-wide log, no search/filter, accumulates indefinitely.
- **Release Forms Tracker** — has a client-name filter but no status filter. Worth adding since a pending waiver is a legal/compliance risk you'd want to isolate quickly (a "show pending only" toggle, same pattern Renewal Tracker already uses).

## Tier 3 — Data accuracy gaps — ✅ DONE (Aug 18, 2026)

Small logic additions that would make existing fields actually trustworthy instead of manually maintained.

- **Vendor / Rental & COI Tracker** — `coiStatus` ("On File"/"Missing"/"Expired") is a manual dropdown never cross-checked against the actual `coiExpiration` date. An "On File" entry whose date already passed won't get flagged until someone remembers to update it by hand. SEO Rank Tracker and Review & Reputation Tracker already auto-compute staleness from a date — same pattern would work here.
- **Run of Show Tracker** — the table renders in the order events were logged, not by event date. For a scheduling tool, sorting by soonest-upcoming would be more useful.
- **Monthly Report Archive** — "Month / Year" is free text (e.g. "October 2024") with no format enforcement, and the list sorts by insertion order, not parsed date — an inconsistently typed entry silently sorts in the wrong place.
- **Client Welcome Guide** — unlike similar generators (Ad Campaign Brief), the form (welcome note, selected services, Loom link) isn't saved back to the client record — only the auto-filled fields survive a reload. Leaving the tab loses anything typed. Should persist to `client.welcomeGuide` the same way Ad Campaign Brief does.
- **Email Signature Generator** — no required-field check on Name/Email; the signature just renders with blanks silently if you skip them.
- **Contractor Portal** — no validation preventing an end date before a start date, or an unreasonable hours value on time-off requests. Low stakes (contractor-facing, low volume) but easy to add.

## Tier 4 — Bigger decisions (worth talking through before building)

These aren't quick fixes — each is either a real architectural question or a noticeable rebuild. Flagging them rather than just building them.

- **Brand data lives in three places that can silently disagree.** Brand Identity Vault (`client.brandVault`) derives `client.brandKit`, which Brand Asset Kit (Lite) reads. Separately, Brand Guidelines Builder has its own independent `client.brandGuideline` that never syncs with the Vault. Client Portal Manager's "Sync Colors from Brand Kit" button only bridges two of the three. This means colors filled into Brand Guidelines Builder can quietly diverge from what the Vault/Portal/Asset Kit show — the exact class of bug Brand Asset Kit (Lite) was rebuilt to fix in the first place. Needs a decision: make Brand Guidelines Builder read from the Vault too, or clearly label it as an intentionally separate external-facing document.
- **Three tools cover overlapping ground on content/creative strategy**: Content Strategy Builder (12-step form), Content Strategy Guide (8-step checklist), and Creative Strategy Builder (4-panel stack/funnel/thread/taxonomy). Not broken, but it's not obvious which one to open for what. Worth a naming or scope pass even if they stay separate.
- **Competitor Analysis is the roughest tool in the Hub.** It's not even one tool — it's three separately-named legacy HTML files with no `index.html`, using their own standalone CSS instead of the shared system (visibly looks like a dropped-in template, not part of the Hub). One filename has a baked-in typo ("Competiteor Analysis Form.html") referenced directly in the iframe src. This is the best candidate for an actual rebuild rather than a small tweak.
- **Two parallel design systems exist across the Hub.** Most tools (47 of them, including Production Board and Content Calendar) use `../style.css` with the brand-bar/site-header/step-card shell and DM Mono/Fraunces fonts. About 15 tools (Mood Board Builder, Sales Pipeline Board, QBR Generator, Copywriting Assistant, Testimonial Tracker, Review & Reputation Tracker, Meeting Notes Logger, Monthly Report Archive, Red Flag Checklist, and others) use an older `vars.css` + `shared-components.css` + `forms.css` system with Inter font instead. This was already an issue Production Band hit tonight before its restyle. Worth a decision: standardize everything on one system over time, or confirm the split is intentional (e.g. Contractor Portal's separate system is deliberate — it's a token-gated external page with no Firebase SDK).
- **A few tools skip the shared page shell entirely** (no `bg-grid`/`brand-bar`/`site-header`): Ad Account Setup, Service Pricing Admin (borrows Proposal Calculator's CSS instead), and Team Access Manager. Service Pricing Admin is the biggest outlier structurally. Proposal Calculator's own custom full-screen layout is likely intentional given how it's used, so not flagging that one as a problem.

## Everything else — already solid, no action needed

Agency Health Dashboard, Contract & Invoice Tracker, Raw Footage Tracker, Proposal Follow-Up Tracker, Renewal Tracker, Marketing News Feed, My Time Off, Package Recommendation Engine, Payback Period Calculator, Personal Branding Builder, Portfolio Showcase, QBR Generator, QC Checklist, Review & Reputation Tracker, Revision & Feedback Tracker, ROI Projector, SEO Rank Tracker, Subscription & Tool Cost Tracker, Task Name Generator, Team Roster & Capacity, Team Transitions, Testimonial & Review Requests, Venue Tech-Spec Library, Weekly Account Check-In, SOP Wiki (its "Checklist Mode" is a known, intentional prototype — not broken, just early), Booking, Access Login Log, Ad Account Log, Ad Campaign Brief, Admin Activity Log, Brand Asset Kit (Lite), Brand Roadmap, Budget Pacing Tracker, Business Insurance Tracker, Call Sheet Builder, Case Study Builder, Change Order Generator, Client Checklists, Discovery Call Script, Email Campaign Tracker, Email Template Library, Intake Pre-Qualifier, Intake Request, Kickoff Prep, Marketing Budget Calculator.

Not tools, skipped: Legal Documents (Originals), billing-canceled, billing-success, contracts (all static/redirect pages, not interactive tools).

---

## Tier 1 completion notes (Aug 17, 2026)

All seven Tier 1 items done. Two things worth flagging that came up during the work, beyond what was originally scoped:

- **Content Strategy Guide turned out to already be clean** — no `textInputs`/mismatched-state-name issue actually present, despite being grouped with Content Audit and Email Marketing Audit in the original writeup. No changes needed there.
- **Real functional bug found in Content Audit and Email Marketing Audit, not just a naming issue**: the four custom text fields in each tool (Pages Indexed/Avg Traffic/Opportunities/Actions, and List Size/Open Rate/Opportunities/Actions respectively) were never actually saving what got typed into them — the save listener was only ever attached to the checklist container, which doesn't contain those fields (they sit in sibling sections above/below it). Fixed in both tools, plus added the missing step that reloads saved values back into the fields on page load (which never existed either). Worth a mental note: "not broken, just confusing" backlog items are worth a quick functional check before assuming the fix is cosmetic-only.

*Next step: pick Tier 2, 3, or 4 whenever ready.*

## Tier 3 completion notes (Aug 18, 2026)

All six items done:

- **Vendor/Rental & COI Tracker** — added `isCoiAutoExpired()`: an "On File" entry whose `coiExpiration` has passed now gets an inline "Expired" badge and counts toward the Missing/Expired summary stat, without overwriting the stored dropdown value.
- **Run of Show Tracker** — table now sorts by soonest-upcoming `eventDate` (undated entries sort last), instead of insertion order.
- **Monthly Report Archive** — Month/Year is now a real `<input type="month">` instead of free text, storing a `sortKey` alongside the display string; list sorts by that key. Legacy entries without a `sortKey` fall back to their `dateAdded` timestamp.
- **Client Welcome Guide** — welcome note, selected services, and Loom link now persist to `client.welcomeGuide` on every edit (same `persist` pattern Ad Campaign Brief uses), and reload back in on return.
- **Email Signature Generator** — Full Name and Revital Email are now marked required; a warning banner appears and the Copy Signature button disables itself until both are filled, so placeholder text (`[Your Name]`) can no longer get copied into a real signature.
- **Contractor Portal** — time-off End Date can no longer be set before Start Date (client-side date-picker `min` plus a submit-time check); hours logged for a single day are capped at 24.

Nothing found beyond the original scope this round — no surprise bugs like Tier 1's Content Audit save issue.

*Next step: Tier 4 (bigger decisions) whenever ready — those are flagged as worth discussing first, not just building.*
