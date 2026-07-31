# Backup & Restore Runbook

Companion to [data-loss-prevention-plan.md](./data-loss-prevention-plan.md), which explains *why* this exists (the Reginald White / Evry Intention LLC incident) and the app-level fixes already shipped. This doc is the actionable checklist: what backups exist, how to verify they're actually working, and how to restore from one if client data ever looks wrong again.

Nobody has run a real test-restore against this project yet - the fixes below are correct by code review, not by having been exercised end to end. Do that at least once (Step 3) rather than trusting this document alone.

---

## What exists today, in priority order

1. **The Hub's own Export/Import (self-service, no Firestore console needed).** Sidebar → **Export Full Backup** downloads a single JSON file with every client workspace plus every agency-wide doc (notifications, trackers, activity log, etc.), timestamped in the filename. **Import** (same sidebar area) reads a file in that same format back in - it *merges* client workspaces into the current `clientsDb` rather than wiping it, and asks for explicit confirmation before overwriting any agency-wide doc. This is the fastest recovery path and the easiest one to test yourself without touching Firestore at all.

2. **App-level automatic backup.** Every successful client-database save also writes a full snapshot to `agency/clientsDbBackup-shard-0`, `-1`, etc. (plus `agency/clientsDbBackupShardMeta`, which has a `savedAt` timestamp). This is what saved the two client workspaces during the original incident. As of this session, it's fixed to only fire *after* the version-conflict check passes, so a rejected/stale save can no longer overwrite it with stale data (see the "Fix clientsDb safety-net backup firing before the version-conflict check" commit).

3. **Firestore's own scheduled backups (Google-managed, independent of this app's code).** Recommended in the data-loss-prevention doc. **Status: not confirmed enabled** - this is the one item on this whole list that requires action, not just verification, if it hasn't been turned on. See Step 1.

---

## Step 1: Confirm Firestore scheduled backups are on (one-time, do this first if not already done)

1. Google Cloud Console → Firestore → Databases.
2. Find this project's database row → **Scheduled backups** column → **Edit settings**.
3. Confirm **Daily** (or Weekly) is checked with a retention period set (up to 14 weeks).
4. If it's off: turn it on. Requires the Blaze plan (already needed for normal Firestore usage). Cost at this data size is a fraction of a cent per month - not a real budget concern.

## Step 2: Periodically confirm the automatic backups are actually current

Monthly is reasonable given how small and low-traffic this database is.

- **App-level backup**: Firestore console → `agency` collection → `clientsDbBackupShardMeta` doc → check `savedAt`. Should be recent (within the last several days, given how often client data gets edited). If it's weeks old while the Hub is in active use, something broke the backup write path - check the browser console during a save for `"clientsDb backup write failed"`.
- **Manual export habit**: click **Export Full Backup** in the sidebar and save the JSON somewhere durable (Google Drive, etc.) before any major change to the Hub's code or data model. Costs 10 seconds, and it's a copy that lives outside Firestore entirely - useful if something ever went wrong with Firestore itself, not just the app's data in it.

## Step 3: Actually test a restore (recommended: quarterly, and after any change touching `commitDatabaseToCloud` in `app.js`)

Nobody has done this yet. Do it once for real so this document reflects something verified, not just reasoned-through.

**Easiest path - the Hub's own Import, tested safely:**
1. Click **Export Full Backup** to get a current, known-good JSON file.
2. In a **separate/incognito browser tab or session** (so you don't touch the real live session), or in a `wrangler dev` instance pointed at a **duplicate/test Firestore project** (Firebase console → clone project) rather than production - import that JSON file via the sidebar **Import** button.
3. Confirm every client workspace and agency doc came back correctly - spot-check a few clients' proposal data, contract status, and portal config against what you'd expect.

**Firestore-native path (for testing the Step 1 scheduled backups specifically):**
1. Firestore console → the scheduled backup schedule → pick a snapshot → **Restore**.
2. Restore to a **new database**, never in-place over the live one, even for a test.
3. Point a local `wrangler dev` instance at that restored test database (swap the Firebase project config) and confirm the Hub loads client data correctly from it.

**App-level shard backup path (fastest if data goes missing again for real, not just for testing):**
1. Firestore console → `agency` collection → read `clientsDbBackup-shard-0`, `-1`, etc. and `clientsDbBackupShardMeta`.
2. Copy each backup shard's contents into the corresponding live `agency/clientsDb-shard-N` document, and set `agency/clientsDbShardMeta`'s `count` to match. Bump `version` higher than whatever it currently is, so the version-guard on the next real save doesn't reject it as a conflict.
3. Reload the Hub and confirm all clients reappear.

## Recovery priority, if this is ever needed for real

1. **Export Full Backup / Import**, if you have a recent manual export on hand (Step 2's habit) - fastest, no Firestore console needed.
2. **App-level automatic backup** (`clientsDbBackup-shard-*` + `clientsDbBackupShardMeta`) - always recent as of the last successful save, no manual export required.
3. **Firestore's own scheduled backups** (Step 1) - the deepest fallback, independent of anything this app's code does.

## Checklist

- [ ] Firestore scheduled backups confirmed enabled (Step 1) - **do this first if not already done, everything else assumes it's on**
- [ ] Monthly: `clientsDbBackupShardMeta.savedAt` checked for staleness
- [ ] Monthly-ish: manual **Export Full Backup** saved somewhere outside Firestore
- [ ] At least once, and quarterly going forward: a real test-restore performed (Step 3) and confirmed working end to end
