# Data Loss Prevention Plan — Client Onboarding & Audit Hub

Prepared for Revital Productions. Covers the client data loss incident (two client workspaces — Reginald White and Evry Intention LLC — disappeared from the live database), the fixes already shipped, and what's recommended going forward.

## What happened

The Hub stores all client data (`clientsDb`) in Firestore, split across "shards" (documents capped around 700KB each) so the whole database doesn't have to live in one oversized document. On page load, the app boots instantly from a local cache, then attaches a real-time listener to each shard and merges them back into one in-memory `clientsDb` as each shard's data arrives.

The bug: nothing checked whether *every* shard had reported in before treating that in-memory `clientsDb` as complete. If a save happened while even one shard was still loading — a slow connection, a backgrounded tab, or an edit made moments after the page opened — the app would write that partial picture back to Firestore, silently overwriting the full shard set. Any client living only in the shard that hadn't loaded yet was deleted with no warning and no error.

This is confirmed as the actual cause of the two missing workspaces. Both were recovered from an older, pre-sharding backup document that Firestore still had on file.

## Fixes already shipped (live in `app.js`)

**1. Shard-load completeness guard.** The app now tracks which shard indices have reported in at least once since the listener count was last set. `commitDatabaseToCloud()` — the function that writes `clientsDb` back to Firestore — now checks this before writing, and skips the cloud write entirely if any shard hasn't loaded yet. The local save (to the browser's cache) still happens immediately either way, so nothing is lost in the meantime; the cloud write just retries automatically on the next save once all shards are in. This closes the exact hole that caused the original incident.

**2. Safety-net backup on every save.** Whenever `commitDatabaseToCloud()` does write (i.e., once it's confirmed the data is complete), it also writes a full copy to `agency/clientsDbBackup-shard-0`, `-1`, etc. (plus `agency/clientsDbBackupShardMeta` tracking the shard count and timestamp) with a timestamp. This is a fire-and-forget write — if it fails, it doesn't block or interrupt the real save — but it means there's always a recent, complete snapshot to recover from if something unexpected corrupts the live shards again.

**Update:** the backup is now sharded the same way the live data is (reusing the same packing logic), so it can't hit Firestore's ~1MB per-document size limit as the client roster grows — the original version wrote one big document and had the same size ceiling the old pre-sharding format did. `agency/clientsDbBackup`, the old single-document location, is no longer written to and can be ignored or deleted.

## Recommended additional safeguard: Firestore scheduled backups

The two fixes above stop this specific bug from recurring, but they're both still part of the app's own code — if a *different* bug ever corrupted the data, the app-level backup could get corrupted too. Firestore's own scheduled backups are managed by Google independently of the app entirely, so they're a genuine second layer of protection.

**How to turn it on:**
1. Go to the Google Cloud console → Firestore → Databases.
2. Find your database's row, and in the "Scheduled backups" column click **Edit settings**.
3. Check **Daily** (or **Weekly**), set a retention period (up to 14 weeks), and **Save**.

**Cost:** requires the Blaze (pay-as-you-go) plan, which the project already needs for normal Firestore usage. Backup storage is billed at roughly **$0.03 per GiB per month retained** — given the Hub's client database is a handful of records (well under 1 MB total), expect this to run a fraction of a cent per month, not a real cost concern.

## Going forward

- The app-level fixes are live and require no ongoing action.
- Turning on Firestore's scheduled backups (above) is the one remaining step, and it's a one-time setup.
- If client data ever looks wrong again, the recovery path is: check `agency/clientsDbBackup-shard-*` + `agency/clientsDbBackupShardMeta` first (app-level, most recent), then Firestore's own scheduled backup snapshots if that's enabled.
- **Update:** the backup write used to fire before the version-conflict check in `commitDatabaseToCloud()`, meaning a rejected save could still overwrite the backup with stale data. Fixed - it now only fires once that check confirms the save is being accepted.
- For the actual step-by-step (confirming backups are on, checking they're current, and testing a real restore - which hasn't been done yet), see **[BACKUP_RESTORE_RUNBOOK.md](./BACKUP_RESTORE_RUNBOOK.md)**.
