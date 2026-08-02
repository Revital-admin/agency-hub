# Media Storage & Review Tools — Options

## Comparison

| | **Frame.io** (current) | **Shade** | **LucidLink** |
|---|---|---|---|
| What it is | Cloud review & approval platform | AI-powered cloud NAS + media manager | Cloud-native mountable file system |
| Core strength | Frame-accurate client commenting, Premiere panel sync | Storage + AI search + review in one platform | Editors work directly off a mounted cloud drive, in any NLE |
| Storage | Upload-based — media uploaded just for review | Mountable drive, AI-indexed | Mountable drive, S3-compatible backing |
| Client review | Yes — this is its whole purpose | Yes, built in | No — not a review tool |
| Pricing | Free / $15 / $25 per member/mo, custom Enterprise | ~$20/seat/mo or custom | $7–$32/seat/mo, custom above |
| Replaces Drive? | No | Partially (aims to replace Drive + Frame.io + a MAM) | No — complements it |

## Where each one fits

**Frame.io** — keep as-is for client-facing revision review. It's doing its job (the "Submit a Revision" flow already routes through it/ClickUp), and switching would mean giving up its deepest strength: frame-accurate client commenting.

**Shade** — only worth it if the real bottleneck becomes footage storage and search across old projects, not the review step. It's trying to replace Frame.io + Drive + a media asset manager all at once, which is a bigger swap than it sounds.

**LucidLink** — the one worth watching. It solves a different problem than Frame.io: not client review, but editors working off shared, high-speed storage without a download/upload cycle. Cheaper entry point ($7/seat vs. Frame.io's $15) and it doesn't compete with anything currently in place.

## How LucidLink pairs with Google Drive

They're not competing — LucidLink Connect (2026) mounts your existing Google Drive directly into a LucidLink filespace. Drive content stays exactly where it is; LucidLink just streams it on demand as if it were a local high-speed drive, with no migration or duplicate copies.

In practice, that looks like:
- Editors work from the LucidLink-mounted drive during active production (fast, no download/upload cycle, works in any NLE).
- Client-facing folders and final deliverables stay in Google Drive exactly as they are today — nothing about the current client-portal Drive links changes.
- LucidLink can also back up/sync Drive content into a Filespace for consolidation, if that's ever wanted.

So adopting LucidLink wouldn't touch the Drive-based client delivery workflow already in place — it would sit underneath it, on the editing side only.

## Future NAS/SAN build

LucidLink is designed to work *with* on-prem storage, not just cloud — it's explicitly built for hybrid setups. On-prem shared storage (the kind a NAS/SAN build would provide — comparable to what Avid NEXIS or SNS EVO offer) can run alongside LucidLink: local edit bays get full local-network speed straight off the NAS/SAN, while LucidLink handles remote/off-site access to the same media pool without needing a VPN or manual file transfers.

The practical options once a NAS/SAN exists:
- Run them side by side — NAS/SAN for in-office speed, LucidLink for remote access to whatever subset needs to travel.
- Point LucidLink at the NAS/SAN as its backing store, if it's fronted with S3-compatible object storage — turning the on-prem box into the origin for a LucidLink filespace everyone (local and remote) mounts the same way.

Either way, building the NAS/SAN first doesn't lock out a LucidLink decision later — worth revisiting once that hardware plan firms up.

---

*Sources: [Shade — Frame.io Reviews & Pricing](https://shade.inc/blog/frame-io-review-video-production), [LucidLink Connect](https://www.lucidlink.com/connect), [LucidLink Connect integrations](https://www.lucidlink.com/blog/lucidlink-connect-integrations), [LucidLink — Modernize file infrastructure](https://www.lucidlink.com/solutions/modernize-file-infrastructure), [Backup cloud storage to a Filespace](https://support.lucidlink.com/hc/en-us/articles/31125359780621-Backup-cloud-storage-to-a-Filespace)*
