# clientsDb Per-Document Refactor — Scoping Plan

Companion to [data-loss-prevention-plan.md](./data-loss-prevention-plan.md) and [BACKUP_RESTORE_RUNBOOK.md](./BACKUP_RESTORE_RUNBOOK.md). Written Sep 2026, before any code changes, to size up the fix for the root cause behind both the original 1MiB-document incident and the save-conflict-banner annoyance: `clientsDb` bin-packs every client into a shared pool of Firestore documents instead of giving each client its own.

**This is a plan, not a change.** Nothing below has been implemented yet.

---

## The problem, restated precisely

`clientsDb` is one big in-memory JS object (`{ [clientName]: {...} }`), currently persisted across Firestore as `agency/clientsDb-shard-0`, `-1`, `-2`, ... via a greedy byte-size bin-packer (`packClientsDbIntoShards`, 700KB/shard cap, `app.js` ~line 5953). Two consequences fall directly out of that shape:

1. **Shared size ceiling.** No single client is guaranteed its own space. A client whose own data alone exceeds ~700KB rides through unsplit (this session's `findOversizedShards` guard, commit `745188d`, only catches this after the fact with a warning banner — it doesn't fix the underlying ceiling).
2. **Shared version/conflict scope.** All shards share one version counter (`agency/clientsDbShardMeta.version`). Any save anywhere — on *any* client — bumps it, so the save-conflict banner fires for everyone with the doc open, regardless of which client they're actually editing. Confirmed earlier this session: editing Client A and someone else saving Client B still triggers your conflict banner.

Both trace to the same root cause: clients share documents instead of each owning one.

## The target shape

One Firestore document per client, in a new top-level collection — `clientWorkspaces/{clientName}` — mirroring the pattern already proven safe in this exact codebase for Resource Booking Calendar (`resourceBookings/{bookingId}`) and Hours & Time Log (`hoursLogEntries/{entryId}`), both migrated off shared-document storage in Aug 2026 for the identical reason.

**Naming correction (caught before any code was written):** the obvious name, `clients/{clientName}`, collides with an *existing* `clients` collection already in production use for the public client portal (keyed by magic token, `allow get: if true` in `firestore.rules` - anyone holding a token can read their own doc, unauthenticated, by design). Putting private full client records in that same collection, even keyed by client name instead of token, would make every client's full internal data (proposals, contracts, notes, pricing) readable by anyone who could guess or enumerate a client name - client names are far less random than magic tokens. Using `clientWorkspaces` instead, matching the UI's own "CLIENT WORKSPACE" sidebar label, admin-only like `clientsDb` is today.

Critically, **the in-memory shape does not change.** `clientsDb` stays a single JS object indexed by client name, because that's what every call site already expects — see blast radius below. Only the persistence layer underneath it changes: instead of bin-packing the whole object into N shard documents, each client's slice gets its own document; instead of listening to shard documents, a live `onSnapshot` on the `clientWorkspaces` collection keeps the in-memory object in sync by merging individual doc add/modify/remove events.

This is the load-bearing design decision of this whole plan: it keeps the refactor scoped to the sync layer (a few functions in `app.js` and `_worker.js`) instead of touching the ~260 places across the codebase that read or write `clientsDb` as an object.

## Blast radius (confirmed by grep, not estimated)

- **`app.js`: 219 references to `clientsDb`**, including ~45 direct bracket-access reads/writes (`clientsDb[name]`, `clientsDb[activeClientName]`, etc.) scattered across dozens of features, not concentrated in one module.
- **41 other files** reference `clientsDb` — every tool that runs in an iframe (Hours Tracker, Proposal Calculator, Mood Board Builder, SEO Rank Tracker, and ~35 more), each reaching into `window.parent.clientsDb` directly.
- **`_worker.js`** independently re-implements the *entire* shard bin-packing scheme server-side (`firestoreGetDoc`/`firestoreSetDoc` against `agency/clientsDb-shard-N`, its own version-bump logic) for the Team-Access-restricted REST path. This is a second, separate implementation of the same logic that would also need to change.
- **`firestore.rules`** gates all of `clientsDb`/its shards with one coarse `hasAccountDataAccess()` predicate (all-or-nothing) — see lines ~196-197. The two existing per-document collections (`resourceBookings`, `hoursLogEntries`) are *not* actually a precedent for finer-grained per-record security — both just use `allow read, write: if isAdmin()`. True per-client Team-Access filtering at the rules level would be new, unproven territory here, not an established pattern.

**Conclusion:** if the in-memory shape is preserved (per the design decision above), the ~260 call sites across `app.js` and the 41 tool iframes need **zero changes**. The real work is concentrated in four places: the sync functions in `app.js`, the save function in `app.js`, the restricted-access path in `_worker.js`, and (optionally, see Phase 4) `firestore.rules`.

## What actually changes

1. **Read/sync (`app.js`):** Replace `startUnrestrictedClientsDbSync`'s shard-meta + shard listeners with one `onSnapshot` on the `clientWorkspaces` collection. On each snapshot's docChanges, `added`/`modified` events write `clientsDb[doc.id] = doc.data()`; `removed` deletes that key. Rebuild the dependent UI the same way it already does today after a shard update.
2. **Write/save (`app.js`):** `commitDatabaseToCloud` currently writes the *whole* `clientsDb` (repacked into shards) on every save. Change it to write only the *changed* client's document to `clientWorkspaces/{clientName}`. This requires tracking which client(s) actually changed since the last save — likely the simplest version is "whichever client is currently active," since nearly every write path already flows through `switchClient`/`activeClientName`. Needs a closer look during implementation for any code path that edits a non-active client's data (bulk operations, nudge checks that touch other clients' records) — those would need to loop and write each touched client's doc individually rather than relying on "just save the active one."
3. **Conflict detection:** Move from the single shared `clientsDbDocVersion` to a per-document version field (`clientWorkspaces/{clientName}.version`), compared only against that one client's fetched version before writing. This is what naturally fixes the cross-client false-conflict problem as a side effect, not a separate feature to build.
4. **Restricted (Team Access) path (`_worker.js`):** The REST endpoint's shard read/write logic needs the equivalent per-document rewrite. This is real, separate work — it's a different codebase (server-side REST calls, not client SDK) reimplementing the same bin-packing today, so it needs its own pass, not just a copy-paste of the `app.js` changes.
5. **`findOversizedShards` guard (commit `745188d`):** Becomes unnecessary post-migration — each client naturally gets Firestore's real ~1MiB ceiling instead of a shared 700KB packed-shard ceiling, and there's no more bin-packing to overflow. Can be removed once the migration is confirmed stable, not before.
6. **Backup paths:** `agency/clientsDbBackup-shard-*` (the app-level safety-net backup) and the Export/Import JSON format can both stay exactly as they are — they already operate on the in-memory `clientsDb` object as a whole, which is unaffected by this refactor. No changes needed there, which keeps the Step 3 test-restore work from this session valid without modification.

## What does NOT change

- The in-memory `clientsDb` object shape, and therefore all ~260 call sites across `app.js` and every tool iframe.
- Export Full Backup / Import Backups (operate on the in-memory object).
- The app-level shard backup mechanism (`clientsDbBackup-shard-*`) — separate concern, not urgent to migrate alongside this.
- The idle-lock and save-conflict-banner draft-restore features shipped this session (`50e3998`, `745188d`) — both key off the active client and DOM state, not the storage layer directly.

## Migration path

1. **One-time backfill script:** read the current shards (or call the existing `rebuildClientsDbFromShards`), write one document per client into the new `clientWorkspaces` collection. Verify count and a content diff against the source before treating it as done.
2. **Parallel-write period:** for a real stretch of time (a couple of weeks, not a couple of days, given this subsystem's history), write to *both* the old shards and the new per-client collection on every save, but keep reading from shards as the source of truth. This costs nothing but a few extra writes and gives a live, ongoing equivalence check with zero user-facing risk.
3. **Cutover:** switch reads to the `clientWorkspaces` collection listener. Keep the shard-write path active but dormant (or keep writing shards too, cheaply, as an extra safety net) for another stretch before removing it entirely.
4. **Legacy fallback:** keep a one-time migration read from the old shards, mirroring how `getLegacyClientsDbDocRef()` already handles the pre-sharding format today — so a Hub that somehow never got the new writes still self-heals on load.
5. **Rollback:** a simple flag to flip the sync path back to shards if anything looks wrong post-cutover, for as long as the shard data is still being kept current in parallel.

## Suggested phasing

- **Phase 1 — DONE (parallel-write only), Sep 2026.** `app.js`'s `commitDatabaseToCloud` now writes every client's data to `clientWorkspaces/{clientName}` alongside the real shard save, verified live: triggered a real save and confirmed all 6 clients (including Evry Intention LLC) got their own document. Reads, sync, and conflict-detection are untouched - still shard-based. Cutover has NOT happened yet; this is intentionally still just the parallel-write period.
- **Phase 2 — DONE (parallel-write only), Sep 2026.** `_worker.js`'s `handleRestrictedClientDataWrite` (the Team-Access-restricted REST path) now also writes to `clientWorkspaces/{clientName}` right after its real shard write, using the same raw REST `firestoreSetDoc` helper this file already uses elsewhere (not the browser SDK, since this runs server-side under a service-account token). No "which client changed" ambiguity here unlike Phase 1's app.js version - this endpoint is already scoped to exactly one client per call. Client names needed `encodeURIComponent()` before going into the raw REST URL path (`agency/clientsDb-shard-N` never needed this since shard indexes are just numbers) - free-text client names can contain spaces/parentheses/etc. that would otherwise break the URL. The Worker's write bypasses `firestore.rules` entirely (service-account access, same as its other writes), so no rules change was needed for this half.

**Observed during live Phase 2 testing (Sep 2026) - a real race, not a bug:** wrote a test value to a client's `meetingNotes` via the Worker endpoint, and on the first attempt it briefly showed up in `clientWorkspaces` then disappeared moments later - not silently dropped, but overwritten back out by that same open admin tab's own next full-roster parallel-write (Phase 1), which fired using an in-memory `clientsDb` snapshot captured before its per-shard listener had caught up with the Worker's just-written update. Confirmed self-correcting: an immediately-rechecked second write, and a delayed recheck of it, both held. This is the same listener-staleness race the "SECOND SAFETY NET" comment in `commitDatabaseToCloud` already documents and accepts for the real shard writes (a version-number match doesn't guarantee shard *content* has actually caught up) - not something this refactor introduces, just newly visible because nothing reads `clientWorkspaces` yet to mask a momentary mismatch. Low-stakes for exactly that reason during the parallel-write period; worth re-checking this doesn't matter once cutover makes `clientWorkspaces` the thing actually read from.
- **Phase 3 (optional/stretch)** — revisit `firestore.rules` to gate `clientWorkspaces/{clientName}` per-document instead of all-or-nothing, potentially simplifying or removing the custom REST endpoint entirely. Genuinely new territory for this codebase; worth its own separate scoping pass rather than bundling into Phase 1/2.
- **Phase 4 (optional)** — now that conflicts are per-client instead of global, the save-conflict banner's "hard-block-and-ask" UX could be revisited (e.g., a real-time merge might become safe when it wasn't before). Not assumed here — flagged only as something worth reconsidering once Phase 1 has been live for a while, not something to design now.

## Risk notes specific to this codebase

Two real client-data-loss incidents (Reginald White, Evry Intention LLC) are the reason this subsystem gets extra caution. Recommend:

- No phase ships without `node scripts/verify-hub.js` passing clean, same as every other change this session.
- The parallel-write period is not optional — it's the cheapest possible insurance against a subtle bug in the new per-document write/merge logic, and costs nothing but a few extra Firestore writes per save.
- Every phase should be validated with an actual Export Full Backup comparison (diff the exported JSON before/after cutover for a few real clients) rather than trusting code review alone — consistent with this session's own "test it for real, don't just reason about it" approach to the backup runbook.

## Effort estimate (rough)

- Phase 1: the largest single piece — new sync/save/conflict logic, backfill script, parallel-write instrumentation, cutover, verification. Not a small change, but contained to `app.js`.
- Phase 2: a comparable-sized rewrite, but in `_worker.js` and only exercised by restricted teammates — lower urgency, can trail Phase 1 by as much time as needed.
- Phase 3/4: unscoped stretch goals, deliberately left vague until Phase 1 is proven live.

No code changes have been made as part of this document. Next step, if you want to proceed, is starting Phase 1 in a feature branch with the parallel-write approach above.
