# Team Access — Restricted Sync Verification Checklist

Use this after pushing/deploying the `app.js` and `firestore.rules` commits from Aug 9, 2026 (restricted-teammate sync rewiring). Confirm every item below before starting task #15 (blocking restricted users from direct Firestore access) — that step assumes this one actually works.

## 0. Before testing: push and deploy

```
cd ~/Downloads/"Agency Hub"
rm -f .git/HEAD.lock .git/index.lock
git add app.js
git commit -m "Route Team-Access-restricted teammates through the filtered clientsDb API"
git add firestore.rules
git commit -m "Commit the docSectionMap rules extension already live in Firebase Console"
git push origin main
```

Wait for the Cloudflare Worker build to finish (check the Cloudflare dashboard's Deployments tab), then hard-refresh `hub.revitalproductions.com` before testing.

## 1. Sanity check — unrestricted admin (you)

- [ ] Log in as `admin@revitalproductions.com` (or any account NOT listed in Team Access).
- [ ] Hub loads clients as normal, all sidebar sections visible.
- [ ] Open DevTools → Network tab → confirm you do NOT see repeated calls to `/api/restricted-client-data` (unrestricted admins should stay on the original Firestore listener path).
- [ ] Edit a field on any client, confirm "Saved to Cloud ✅" appears and the edit persists after a reload.

If any of these fail, something in the restriction-detection branch broke the unrestricted path — this is the highest-risk regression, stop and report back before continuing.

## 2. Juan's account (sections: core, ad-accounts-access, reporting-health, production, content-creation, account-ops, retention-social-proof, agency-globals — missing audits, strategy-competition, sales-pipeline)

- [ ] Log in as `juan@revitalproductions.com`.
- [ ] Sidebar: Audits, Strategy & Competition, and Sales sections should be hidden (unchanged from before — this was already working).
- [ ] Open a client he has access to. Fields belonging to Audits/Strategy/Sales-only data (e.g. UX/UI Audit results, Content Strategy, Sales Pipeline proposal/ROI) should be **absent**, not just hidden — check via DevTools console: `clientsDb[activeClientName]` should have no `uxuiAudit`, `strategyBuilder`, `proposal`, `roi`, etc. keys at all.
- [ ] Fields from sections he DOES have (onboarding checklist, brand kit, campaign launch, etc.) should be present and editable.
- [ ] Edit an allowed field (e.g. a checklist item) and save — confirm "Saved to Cloud ✅", then reload and confirm the edit persisted.
- [ ] Try (via DevTools console, not the UI) `fetch('/api/restricted-client-data', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({clientName: '<any client>', fields: {proposal: {test: true}}})}).then(r=>r.json()).then(console.log)` — should return a 403 "Not permitted to write: proposal" error, confirming the server-side section check is real, not just client-side.

## 3. Olaoluwa's account (sections: content-creation, audits, strategy-competition, agency-globals — missing core)

This is the account most likely to expose the "field she can't write got bundled into the save and rejected the whole thing" bug I fixed client-side — worth extra attention here specifically.

- [ ] Log in as `olaoluwa@revitalproductions.com`.
- [ ] Open any client, edit something in a section she has (e.g. a Content Audit or Strategy Builder field).
- [ ] Save — confirm "Saved to Cloud ✅", NOT "Save Failed ❌". If it fails, check the browser console for a "Not permitted to write: lastEditedBy..." style error — that would mean the client-side field filter (`CLIENT_FIELD_SECTIONS_MIRROR`) missed something.
- [ ] Confirm she does NOT see `core`-section fields (onboarding checklist, brand vault, notifications) anywhere in `clientsDb` via DevTools.

## 4. Known, deliberate gap (not a bug)

Restricted-user edits to portal-facing fields (anything in `core`) won't re-sync the public client portal page (`clients/{token}`) until an unrestricted admin's next save does it. If this matters in practice (e.g. Juan regularly edits onboarding checklists clients see live), flag it and we'll wire `syncPublicPortalDocs` into the restricted path next — deferred originally because it also reads `agency/salesPipeline` and `agency/referrals`, which a restricted caller may not have rules access to, so it needs its own careful pass.

## 5. Once everything above passes

Move to task #15: lock restricted users out of direct Firestore reads/writes on `clientsDb`/`clientsDb-shard-*` at the rules level (currently they still technically have document-level access via `hasAccountDataAccess()` — this checklist confirms the app itself no longer *needs* that access, which is what makes it safe to close).
