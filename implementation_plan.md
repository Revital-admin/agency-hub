# Add Firebase Authentication and Fix Cloud Syncing — Status: Superseded

This proposed adding Firebase Email/Password auth (a login modal, a "Sign Up" flow, a Firebase Console step to enable Email/Password sign-in) to replace the old "Guest" placeholder and fix cross-tab syncing. **That's not what got built** — kept here for history, not as an active plan.

## What actually happened instead

Auth is handled by **Cloudflare Access** (Google SSO, gated to `@revitalproductions.com` accounts) at the edge, not by a Firebase Email/Password login modal in the app. `_worker.js` reads the `Cf-Access-Authenticated-User-Email` header Cloudflare Access verifies on every request, and `/api/mint-firebase-token` exchanges that verified email for a Firebase custom auth token (a hand-signed RS256 JWT, since Workers can't run the Node-based `firebase-admin` SDK) so the Hub can also authenticate against Firestore using the same identity. There's no separate login screen, password, or "Guest" state to fix — anyone signed into a company Google account is already authenticated before the Hub's own code runs.

The cross-tab syncing problem this doc was also trying to solve got fixed as part of that same work: real-time Firestore listeners (`onSnapshot`) now drive the UI directly, so a change in one tab/incognito window propagates to others through normal Firestore sync, not through the `hasPendingWrites`/`JSON.stringify` workaround proposed here.

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** (the "Auth" section under "The core platform") for the accurate, current description of how this works.
