/* ============================================================
   app.js
   Application state controller, Event Handlers & View Renderer
   ============================================================ */


// ── Cryptographically secure token generator ──
// (replaces the old Math.random-based generator; used for magic link tokens)
function generateSecureToken(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// ── Firebase Auth gate (admin) ──
// Cloudflare Access already verifies who reaches this page, but Firestore
// has no knowledge of that identity on its own. Rather than making you log
// in twice, this silently exchanges the Access-verified identity for a
// Firebase session: _worker.js's /api/mint-firebase-token route reads the
// already-verified Cf-Access-Authenticated-User-Email header and mints a
// Firebase custom token, which we redeem here with no popup. A manual
// Google sign-in is kept as a fallback (e.g. local dev without Access
// in front, or if the token-minting function isn't configured yet).
// Any Google account on this company domain is authorized - previously
// this was a single hardcoded email, which silently locked out everyone
// except that one account.
const ADMIN_EMAIL_DOMAIN = "revitalproductions.com";
let firebaseAuthReady = false;

function initAdminAuthGate() {
  if (!window.firebase || !firebase.auth) {
    console.warn("Firebase Auth SDK not loaded; skipping auth gate.");
    firebaseAuthReady = true;
    boot();
    return;
  }

  const gate = document.getElementById("authGate");
  const signInBtn = document.getElementById("authGateSignInBtn");
  const statusEl = document.getElementById("authGateStatus");
  const errorEl = document.getElementById("authGateError");

  function showManualSignIn(message) {
    if (statusEl) statusEl.style.display = "none";
    if (signInBtn) signInBtn.style.display = "inline-block";
    if (errorEl) {
      if (message) {
        errorEl.textContent = message;
        errorEl.style.display = "block";
      } else {
        errorEl.style.display = "none";
      }
    }
    if (gate) gate.style.display = "flex";
  }

  if (signInBtn) {
    signInBtn.addEventListener("click", () => {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ hd: ADMIN_EMAIL_DOMAIN });
      firebase.auth().signInWithPopup(provider).catch(err => {
        console.error("Manual sign-in failed:", err);
        showManualSignIn("Sign-in failed: " + err.message);
      });
    });
  }

  // Reconciles whatever Firebase identity this browser already has cached
  // (if any) against who Cloudflare Access says is ACTUALLY here right now,
  // by hitting /api/mint-firebase-token - which always reads the live
  // Cf-Access-Authenticated-User-Email header fresh on every call, not a
  // cached value.
  //
  // BUG this replaces: the old version only ever called this exchange when
  // Firebase had no cached user at all - a returning visit with an existing
  // session skipped it entirely and trusted the cached identity forever.
  // Firebase Auth's own session persistence has no way to know when the
  // separate Cloudflare Access layer changes identity underneath it, so
  // logging out via the Log Out link (which only clears the Access-layer
  // session - see the /cdn-cgi/access/logout link in index.html) and back
  // in as a DIFFERENT teammate on the same browser left the Hub silently
  // still signed in, and still booting, as whoever the STALE cached
  // Firebase session belonged to - including that stale identity's Team
  // Access permissions, not the new visitor's. Now this check (and the
  // re-sign-in it triggers when the two disagree) runs on every load,
  // returning visit or not.
  let identityCheckDone = false;
  async function ensureCorrectFirebaseIdentity(currentUser) {
    if (identityCheckDone) {
      // Second time through in this same page load - this is the
      // onAuthStateChanged re-fire from our own signInWithCustomToken call
      // below, already resolved, just proceed with whatever we now have.
      return currentUser;
    }
    identityCheckDone = true;

    try {
      const res = await fetch("/api/mint-firebase-token");
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.token) {
        // Idle-locked from a previous session on this browser (Aug
        // 2026) - a fresh page load still finds the server-side lock in
        // place (see handleMintFirebaseToken in _worker.js), since that
        // lives in Firestore, not this tab's now-gone JS state. Show the
        // PIN overlay, not the "Sign in with Google" manual gate - that
        // button performs an independent Firebase sign-in Cloudflare
        // Access has nothing to do with, which would otherwise let
        // someone skip the PIN entirely (firestore.rules' isIdleLocked()
        // still blocks any actual data either way, but the PIN overlay
        // is the intended path, not a permission-denied wall of errors).
        if (res.status === 423) {
          try { showIdleLockOverlay(); } catch (e) { console.error("IdleSessionLock Error:", e); }
          return currentUser;
        }
        console.log("Silent sign-in unavailable:", data.error || res.status);
        if (!currentUser) showManualSignIn();
        // Fail safe to whatever cached identity we already had (if any)
        // rather than locking someone out over a transient Access/network
        // hiccup - same fail-open reasoning the rest of this gate uses.
        return currentUser;
      }

      const alreadyCorrect = !!(currentUser && currentUser.email &&
        currentUser.email.toLowerCase() === (data.email || "").toLowerCase());
      if (alreadyCorrect) return currentUser;

      // Either no cached Firebase session yet (first visit / just cleared),
      // or a stale one for someone OTHER than who Access says is here now -
      // sign out any stale session first so the custom-token sign-in below
      // isn't fighting an existing session for a different user.
      if (currentUser) await firebase.auth().signOut();
      try {
        await firebase.auth().signInWithCustomToken(data.token);
      } catch (signInErr) {
        console.error("Custom token sign-in failed:", signInErr);
        showManualSignIn("Sign-in failed: " + signInErr.message);
      }
      // onAuthStateChanged fires again with the corrected (or still absent,
      // if the sign-in above failed) user - nothing more to do on this pass.
      return null;
    } catch (e) {
      console.log("Silent sign-in failed (likely running locally without Access):", e);
      if (!currentUser) showManualSignIn();
      return currentUser;
    }
  }

  // Show a lightweight "checking access" state immediately while the
  // silent exchange runs, so the page isn't just blank.
  if (gate) gate.style.display = "flex";

  firebase.auth().onAuthStateChanged(async (user) => {
    const isAuthorizedAdmin = !!(user && user.email && user.email.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN));

    if (!isAuthorizedAdmin && user) {
      // Signed into Firebase with the wrong account - sign back out.
      firebase.auth().signOut();
      showManualSignIn("That account isn't authorized for this hub.");
      return;
    }

    const verifiedUser = await ensureCorrectFirebaseIdentity(isAuthorizedAdmin ? user : null);
    if (!verifiedUser) return; // no session yet, or mid re-sign-in - wait for the next onAuthStateChanged fire

    if (gate) gate.style.display = "none";
    firebaseAuthReady = true;
    window.currentAdminEmail = verifiedUser.email.toLowerCase();
    recordLastSeen(window.currentAdminEmail);
    boot();
  });
}

// ── Idle Session Lock ──
// Applies to every teammate, no exceptions - after IDLE_TIMEOUT_MS of no
// mouse/keyboard/scroll activity ANYWHERE in the Hub (including inside
// tool iframes, since those are same-origin), a full-screen overlay hides
// all client data. Unlocking pings /api/user - the cheap Cloudflare Access
// whoami already used elsewhere - to silently confirm the person's Access
// session is still the same signed-in teammate. If it isn't (session
// expired, different account, etc.) we force a full reload so Cloudflare
// Access's own login flow takes over, rather than trying to fake a
// re-auth client-side.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const IDLE_ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];
let idleTimer = null;
let idleLocked = false;

function resetIdleTimer() {
  if (idleLocked) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(showIdleLockOverlay, IDLE_TIMEOUT_MS);
}

// Attaches the idle-reset listeners to a given document. Safe to call
// repeatedly - each tool iframe gets a brand-new `document` object every
// time its src is reloaded (see setIframeAbsoluteSrc), so there's no
// stale-listener buildup to guard against here.
function attachIdleListeners(doc) {
  if (!doc) return;
  try {
    IDLE_ACTIVITY_EVENTS.forEach((evt) => {
      doc.addEventListener(evt, resetIdleTimer, { passive: true, capture: true });
    });
  } catch (e) {
    // Shouldn't happen (tools are same-origin), but never let this block boot.
    console.warn("IdleSessionLock: couldn't attach listeners to iframe doc", e);
  }
}

// Fires whenever this tab goes from hidden back to visible - covers both
// "switched away and back" and, more importantly, "left this tab
// backgrounded for a long stretch" (lunch, overnight, a long meeting).
// Neither Firebase's ID-token auto-refresh nor Firestore's onSnapshot
// listeners are guaranteed to keep running on their normal schedule while
// a tab is backgrounded - browsers throttle/suspend timers and can drop
// the underlying network connection to save resources - and neither one
// reliably self-heals the instant the tab is visible again. Two symptoms
// this was causing before this fix, both only after a long idle stretch:
//   1. The silent background sign-in (ensureCorrectFirebaseIdentity) would
//      find Firebase's cached auth in a bad state and fall back to the
//      manual "Sign in with Google" button - the popup someone would see
//      say "Authorizing" and often stall, since that path was really only
//      ever meant for a genuinely fresh, first-time visitor, not recovery
//      from a stale session.
//   2. clientsDb could keep showing whatever it last had before the tab
//      went stale - including a client that was added by someone else
//      while this tab was backgrounded - until a full manual page reload
//      forced a fresh fetch. This is a read-side version of the same
//      "shard listener silently stalled" issue documented on
//      commitDatabaseToCloud's stale-tab guard, just showing up as a
//      display gap instead of a save that clobbers something.
// Fix: proactively force a fresh ID token and a fresh read of every
// clientsDb shard the instant the tab becomes visible again, rather than
// trusting whatever state things happened to be left in.
async function handleTabBecameVisible() {
  if (document.visibilityState !== "visible") return;
  if (idleLocked) return; // the idle-lock overlay's own flow handles this case
  if (!firebaseAuthReady) return; // still mid-initial-boot, nothing to refresh yet

  // Force a real token refresh (not just whatever's cached) - if the
  // cached session is actually no longer valid, this throws, and signing
  // out lets onAuthStateChanged's own silent re-sign-in (the same path a
  // normal fresh load uses) recover it quietly instead of falling through
  // to the manual popup.
  try {
    const user = window.firebase && firebase.auth && firebase.auth().currentUser;
    if (user) await user.getIdToken(true);
  } catch (e) {
    console.warn("Tab-visible: forced token refresh failed, signing out to let silent re-auth recover:", e);
    try { await firebase.auth().signOut(); } catch (e2) {}
  }

  // Re-fetch every currently-expected shard fresh (not waiting on a live
  // listener that may have silently stopped delivering updates) and fold
  // the result straight into clientsDbShardData, same shape the real
  // listener writes - rebuildClientsDbFromShards below doesn't care which
  // one populated it.
  if (window.firebaseGetDoc && lastKnownClientsDbShardCount > 0) {
    try {
      const freshSnaps = await Promise.all(
        Array.from({ length: lastKnownClientsDbShardCount }, (_, i) => window.firebaseGetDoc(getClientsDbShardDocRef(i)))
      );
      freshSnaps.forEach((snap, i) => {
        clientsDbShardData[i] = snap.exists ? snap.data() : {};
        clientsDbShardsLoadedIndices.add(i);
      });
      clientsDbAllShardsLoaded = clientsDbShardsLoadedIndices.size >= lastKnownClientsDbShardCount;
      rebuildClientsDbFromShards();
    } catch (e) {
      console.warn("Tab-visible: forced clientsDb shard refresh failed:", e);
    }
  }
}
document.addEventListener("visibilitychange", handleTabBecameVisible);

// Shared by the sidebar PIN button (hide it for non-admins) and the
// idle-lock overlay's self-serve path. Used to go straight to Firestore
// (agency/teamAccess.hubAdmins) - broken as of the Aug 2026 idle-lock
// hardening, since that read now requires a live, unlocked Firebase Auth
// session (see isAdmin()/isIdleLocked() in firestore.rules), which is
// exactly NOT guaranteed here: this needs to work while idle-locked, or
// on a fresh page load before Firebase sign-in has completed at all -
// both cases where a client-side Firestore read would just 403. Routed
// through /api/idle-lock/status instead, which answers the same question
// using the Worker's own privileged Firestore access (see
// handleIdleLockStatus in _worker.js) - works regardless of the caller's
// own Firebase Auth state, only needs the Cloudflare Access header.
function checkIsHubAdmin() {
  return fetch("/api/idle-lock/status", { credentials: "include" })
    .then((res) => res.json())
    .then((data) => !!(data && data.isHubAdmin))
    .catch((e) => {
      console.warn("Couldn't determine Hub Admin status:", e);
      return false;
    });
}

// Shows the lock overlay and checks whether THE CALLER (not the team as
// a whole - PINs are per-person now) has their own PIN set up yet (see
// handleIdleLockStatus in _worker.js). If not, there's no self-serve
// path anymore - PINs are generated for people by a Hub Admin (see
// Team PINs panel below), never typed in by the person themselves - so
// this just explains what to do instead.
//
// Hardened Aug 2026 - this used to be a purely visual overlay: the
// underlying Firebase Auth session (and every Firestore read it
// authorizes) was untouched, so a plain page reload silently dropped the
// whole lock. Two things now make it real:
//   1. Signs out of Firebase Auth immediately, right here - Firestore
//      denies everything to a signed-out session regardless of any CSS.
//   2. Calls /api/idle-lock/engage, which stamps a server-side lockedAt
//      for this person (see handleIdleLockEngage in _worker.js). That's
//      what a reload can't erase: firestore.rules' isIdleLocked() checks
//      it on every single read/write, and handleMintFirebaseToken
//      refuses to even re-mint a token while it's set. A correct PIN is
//      the only thing that clears it (handleIdleLockVerifyPin).
// Called two ways: normally, from the idle timer firing (idleLocked was
// false); also from ensureCorrectFirebaseIdentity when a fresh page load
// discovers via a 423 from /api/mint-firebase-token that this account is
// STILL locked from before (idleLocked was already false in that case
// too, since this is a brand new page load with fresh JS state - the
// server-side flag is what remembers, not this variable).
async function showIdleLockOverlay() {
  idleLocked = true;
  const overlay = document.getElementById("idleLockOverlay");
  const errorEl = document.getElementById("idleLockError");
  const statusEl = document.getElementById("idleLockStatus");
  const pinForm = document.getElementById("idleLockPinForm");
  const selfServeEl = document.getElementById("idleLockAdminSelfServe");
  if (errorEl) errorEl.style.display = "none";
  if (selfServeEl) selfServeEl.style.display = "none";
  if (statusEl) statusEl.textContent = "You've been idle for a while. Client data is hidden until you unlock.";
  if (overlay) overlay.style.display = "flex";

  // window.currentAdminEmail is normally set inside onAuthStateChanged
  // (initAdminAuthGate) AFTER a successful sign-in - on a fresh page
  // load that's still locked from before, that never runs (see the 423
  // branch in ensureCorrectFirebaseIdentity), so it'd still be unset
  // here otherwise. generateOwnPinAndUnlock below needs a real value to
  // self-serve correctly, so backfill it from the cheap Access whoami
  // (no Firebase session required) if nothing's set it yet.
  if (!window.currentAdminEmail) {
    try {
      const whoamiRes = await fetch("/api/user", { credentials: "include" });
      const whoamiData = await whoamiRes.json();
      if (whoamiData && whoamiData.email && whoamiData.email !== "Guest") {
        window.currentAdminEmail = whoamiData.email.toLowerCase();
      }
    } catch (e) {
      console.warn("IdleSessionLock: couldn't backfill currentAdminEmail", e);
    }
  }

  // Best-effort, non-blocking - a failure here shouldn't prevent showing
  // the PIN form itself (see the status-check fail-open reasoning
  // below). Safe to call even if this browser never had a live Firebase
  // session (fresh-load-while-still-locked case) - signOut() on no user
  // is a harmless no-op, and engage() re-stamping an already-set lockedAt
  // just refreshes the timestamp.
  try {
    if (window.firebase && firebase.auth && firebase.auth().currentUser) {
      await firebase.auth().signOut();
    }
  } catch (e) {
    console.warn("IdleSessionLock: sign-out failed", e);
  }
  fetch("/api/idle-lock/engage", { method: "POST", credentials: "include" }).catch((e) => {
    console.warn("IdleSessionLock: engage call failed (client-side sign-out above still applies)", e);
  });

  let hasPin = true;
  let isHubAdmin = false;
  try {
    const res = await fetch("/api/idle-lock/status", { credentials: "include" });
    const data = await res.json();
    hasPin = !!(data && data.hasPin);
    isHubAdmin = !!(data && data.isHubAdmin);
  } catch (e) {
    hasPin = true;
  }

  if (!hasPin) {
    if (pinForm) pinForm.style.display = "none";
    // A Hub Admin with no PIN yet has nobody to "ask" - they're the
    // admin, and the Team PINs panel that would fix this lives in the
    // sidebar, which this overlay is covering. So let them generate
    // their own PIN for themselves right here, one time, without needing
    // to reach the panel (which they now truly can't, since the real
    // lock means the sidebar underneath isn't reachable either way).
    if (isHubAdmin) {
      if (statusEl) statusEl.textContent = "You don't have a PIN yet. As a Hub Admin, you can generate your own right here:";
      showAdminSelfServePin();
    } else {
      if (statusEl) statusEl.textContent = "You don't have a PIN yet. Ask a Hub Admin to generate one for you from the Team PINs panel (key icon in the sidebar), then come back to unlock.";
    }
    return;
  }

  if (pinForm) pinForm.style.display = "flex";
  const focusInput = document.getElementById("idleLockPinInput");
  if (focusInput) focusInput.focus();
}

// Runs after the PIN itself checks out - re-confirms the browser's
// Cloudflare Access session is still the same signed-in teammate, same
// as the original click-to-unlock behavior. The PIN stops a random
// person from getting past the overlay; this second check still catches
// a genuinely expired/switched Access session.
function showAdminSelfServePin() {
  const el = document.getElementById("idleLockAdminSelfServe");
  if (el) el.style.display = "flex";
}

// The admin-self-serve escape hatch itself - generates a PIN for the
// CURRENT signed-in admin's own email (never anyone else's, unlike the
// full Team PINs panel) and unlocks immediately, same as entering a PIN
// normally would. Shows the new PIN briefly first so it isn't generated
// and thrown away silently - the admin still needs to know it for next
// time.
async function generateOwnPinAndUnlock() {
  const btn = document.getElementById("idleLockAdminSelfServeBtn");
  const statusEl = document.getElementById("idleLockStatus");
  const errorEl = document.getElementById("idleLockError");
  if (errorEl) errorEl.style.display = "none";
  if (btn) { btn.disabled = true; btn.textContent = "Generating..."; }

  try {
    const res = await fetch("/api/idle-lock/generate-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: window.currentAdminEmail })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error((data && data.error) || "Couldn't generate a PIN");

    const emailNote = data.emailSent ? " (also emailed to you)" : "";
    if (statusEl) statusEl.innerHTML = `Your new PIN is <strong style="letter-spacing:3px; color:#10b981;">${data.pin}</strong>${emailNote} - remember it, it won't be shown again. Unlocking now...`;
    setTimeout(() => { finishIdleUnlockAfterPin(); }, 2500);
  } catch (e) {
    if (errorEl) { errorEl.textContent = e.message; errorEl.style.display = "block"; }
    if (btn) { btn.disabled = false; btn.textContent = "Generate My PIN"; }
  }
}

// Runs after a correct PIN clears the server-side lock (verify-pin) or a
// self-serve PIN generation does the same (generateOwnPinAndUnlock).
// Rewritten Aug 2026: the old version only re-checked /api/user, because
// back then unlocking just meant hiding an overlay over a Firebase
// session that had never actually been touched. Now that showIdleLockOverlay
// really signs out of Firebase Auth, this has to do a real sign-in again -
// mint a fresh custom token (works now, since the server-side lock this
// call is downstream of just got cleared) and redeem it. onAuthStateChanged
// (initAdminAuthGate, above) fires in response and either no-ops (if the
// Hub was already booted before idle) or - on a fresh page load that
// started out locked - completes the sign-in flow and calls boot() for
// the first time.
async function finishIdleUnlockAfterPin() {
  const statusEl = document.getElementById("idleLockStatus");
  const errorEl = document.getElementById("idleLockError");
  if (statusEl) statusEl.textContent = "Signing you back in...";
  try {
    const res = await fetch("/api/mint-firebase-token", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) {
      throw new Error((data && data.error) || "Could not sign you back in");
    }
    await firebase.auth().signInWithCustomToken(data.token);

    idleLocked = false;
    const overlay = document.getElementById("idleLockOverlay");
    if (overlay) overlay.style.display = "none";
    resetIdleTimer();
    return true;
  } catch (e) {
    if (statusEl) statusEl.textContent = "Could not sign you back in.";
    if (errorEl) {
      errorEl.textContent = e.message || "Check your connection and try again.";
      errorEl.style.display = "block";
    }
    return false;
  }
}

async function attemptIdleUnlock(pin) {
  const errorEl = document.getElementById("idleLockError");
  const unlockBtn = document.getElementById("idleLockUnlockBtn");
  if (errorEl) errorEl.style.display = "none";
  if (unlockBtn) unlockBtn.disabled = true;

  try {
    const res = await fetch("/api/idle-lock/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      if (errorEl) {
        errorEl.textContent = (data && data.error) || "Wrong PIN.";
        errorEl.style.display = "block";
      }
      const input = document.getElementById("idleLockPinInput");
      if (input) { input.value = ""; input.focus(); }
      return;
    }
    await finishIdleUnlockAfterPin();
  } catch (e) {
    if (errorEl) {
      errorEl.textContent = "Check your connection and try again.";
      errorEl.style.display = "block";
    }
  } finally {
    if (unlockBtn) unlockBtn.disabled = false;
  }
}

// ── Team PINs panel ── (Hub-Admin only, reachable any time via the
// sidebar key icon - see teamPinsBtn in index.html.) Lists everyone from
// agency/teamActivity (anyone who's ever signed in) plus anyone
// pre-added by email, each with a Generate/Regenerate button. A
// generated PIN is shown once, inline in that person's row, right after
// creation - see handleIdleLockGeneratePin in _worker.js.
let teamPinsPeople = [];

function openTeamPinsModal() {
  const modal = document.getElementById("teamPinsModal");
  const errorEl = document.getElementById("teamPinsError");
  const newEmailInput = document.getElementById("teamPinsNewEmail");
  if (!modal) return;
  if (errorEl) errorEl.style.display = "none";
  if (newEmailInput) newEmailInput.value = "";
  modal.style.display = "flex";
  loadTeamPinsList();
}

function closeTeamPinsModal() {
  const modal = document.getElementById("teamPinsModal");
  if (modal) modal.style.display = "none";
}

async function loadTeamPinsList() {
  const listEl = document.getElementById("teamPinsList");
  const errorEl = document.getElementById("teamPinsError");
  if (listEl) listEl.innerHTML = `<p style="margin:0; font-size:13px; color:#9ca3af;">Loading...</p>`;
  try {
    const res = await fetch("/api/idle-lock/people", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) throw new Error((data && data.error) || "Couldn't load the list");
    teamPinsPeople = data.people || [];
    renderTeamPinsList();
  } catch (e) {
    if (errorEl) { errorEl.textContent = e.message; errorEl.style.display = "block"; }
    if (listEl) listEl.innerHTML = "";
  }
}

function renderTeamPinsList() {
  const listEl = document.getElementById("teamPinsList");
  if (!listEl) return;
  if (!teamPinsPeople.length) {
    listEl.innerHTML = `<p style="margin:0; font-size:13px; color:#9ca3af;">Nobody yet - add a teammate's email above, or wait for them to sign in once.</p>`;
    return;
  }
  listEl.innerHTML = teamPinsPeople.map(p => `
    <div class="team-pins-row" style="display:flex; align-items:center; gap:8px; padding:8px; border:1px solid #374151; border-radius:8px;">
      <div style="flex:1; min-width:0;">
        <div style="font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtmlForPins(p.email)}</div>
        <div style="font-size:11px; color:${p.hasPin ? '#10b981' : '#9ca3af'};">${p.hasPin ? 'PIN set' : 'No PIN yet'}</div>
      </div>
      <button type="button" class="team-pins-generate-btn" data-email="${escapeHtmlForPins(p.email)}" style="padding:6px 10px; border-radius:6px; border:none; background:#10b981; color:#04120c; font-weight:600; font-size:12px; cursor:pointer; white-space:nowrap;">${p.hasPin ? 'Regenerate' : 'Generate'}</button>
      ${p.hasPin ? `<button type="button" class="team-pins-remove-btn" data-email="${escapeHtmlForPins(p.email)}" style="padding:6px 10px; border-radius:6px; border:1px solid #374151; background:transparent; color:#e5e7eb; font-size:12px; cursor:pointer; white-space:nowrap;">Remove</button>` : ''}
    </div>
  `).join("");

  listEl.querySelectorAll(".team-pins-generate-btn").forEach(btn => {
    btn.addEventListener("click", () => generateTeamPin(btn.getAttribute("data-email"), btn));
  });
  listEl.querySelectorAll(".team-pins-remove-btn").forEach(btn => {
    btn.addEventListener("click", () => removeTeamPin(btn.getAttribute("data-email")));
  });
}

function escapeHtmlForPins(s) {
  return (s || "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function generateTeamPin(email, btn) {
  const errorEl = document.getElementById("teamPinsError");
  if (errorEl) errorEl.style.display = "none";
  if (btn) { btn.disabled = true; btn.textContent = "..."; }
  try {
    const res = await fetch("/api/idle-lock/generate-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error((data && data.error) || "Couldn't generate a PIN");

    // Update local state so the list is accurate next time it re-renders,
    // but DON'T re-render right now - the PIN display below needs to stay
    // on screen until the admin dismisses it, not get wiped out by a
    // refresh a moment later.
    const existing = teamPinsPeople.find(p => p.email === email);
    if (existing) existing.hasPin = true;
    else teamPinsPeople = [...teamPinsPeople, { email, lastSeen: null, hasPin: true }];

    // Show the plaintext PIN once, inline, right in that person's row -
    // it's never retrievable again after this. Also reports whether the
    // auto-email actually went out (see sendResendEmailDirect in
    // _worker.js) so a failed send doesn't just silently lose the PIN.
    const row = btn ? btn.closest(".team-pins-row") : null;
    if (row) {
      const emailNote = data.emailSent
        ? `Emailed to ${escapeHtmlForPins(email)}. Also shown here once:`
        : `Couldn't email it automatically${data.emailError ? ' (' + escapeHtmlForPins(data.emailError) + ')' : ''} - copy and share this now:`;
      row.innerHTML = `
        <div style="flex:1; font-size:13px;">
          <strong>${escapeHtmlForPins(email)}</strong><br>
          <span style="font-size:11px; color:${data.emailSent ? '#10b981' : '#f59e0b'};">${emailNote}</span><br>
          <span style="font-size:20px; letter-spacing:3px; color:#10b981; font-weight:700;">${escapeHtmlForPins(data.pin)}</span>
        </div>
        <button type="button" class="team-pins-done-btn" style="padding:6px 10px; border-radius:6px; border:1px solid #374151; background:transparent; color:#e5e7eb; font-size:12px; cursor:pointer; white-space:nowrap;">Done</button>
      `;
      const doneBtn = row.querySelector(".team-pins-done-btn");
      if (doneBtn) doneBtn.addEventListener("click", renderTeamPinsList);
    }
    if (typeof showBanner === "function") showBanner("success", data.emailSent ? `PIN generated and emailed to ${email}.` : `PIN generated for ${email}.`);
  } catch (e) {
    if (errorEl) { errorEl.textContent = e.message; errorEl.style.display = "block"; }
    if (btn) { btn.disabled = false; btn.textContent = "Generate"; }
  }
}

async function removeTeamPin(email) {
  if (!confirm(`Remove ${email}'s PIN? They won't be able to unlock until an admin generates them a new one.`)) return;
  const errorEl = document.getElementById("teamPinsError");
  if (errorEl) errorEl.style.display = "none";
  try {
    const res = await fetch("/api/idle-lock/remove-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error((data && data.error) || "Couldn't remove PIN");
    await loadTeamPinsList();
  } catch (e) {
    if (errorEl) { errorEl.textContent = e.message; errorEl.style.display = "block"; }
  }
}

function addTeamPinsPerson() {
  const input = document.getElementById("teamPinsNewEmail");
  const errorEl = document.getElementById("teamPinsError");
  const email = (input && input.value || "").trim().toLowerCase();
  if (errorEl) errorEl.style.display = "none";
  if (!email || !email.includes("@")) {
    if (errorEl) { errorEl.textContent = "Enter a valid email first."; errorEl.style.display = "block"; }
    return;
  }
  if (teamPinsPeople.some(p => p.email === email)) {
    if (input) input.value = "";
    return;
  }
  teamPinsPeople = [...teamPinsPeople, { email, lastSeen: null, hasPin: false }].sort((a, b) => a.email.localeCompare(b.email));
  renderTeamPinsList();
  if (input) input.value = "";
}

function initIdleSessionLock() {
  attachIdleListeners(document);
  resetIdleTimer();

  const pinForm = document.getElementById("idleLockPinForm");
  if (pinForm) {
    pinForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("idleLockPinInput");
      attemptIdleUnlock(input ? input.value : "");
    });
  }

  const selfServeBtn = document.getElementById("idleLockAdminSelfServeBtn");
  if (selfServeBtn) selfServeBtn.addEventListener("click", generateOwnPinAndUnlock);

  const pinsBtn = document.getElementById("teamPinsBtn");
  if (pinsBtn) {
    pinsBtn.addEventListener("click", openTeamPinsModal);
    pinsBtn.style.display = "none"; // hidden until checkIsHubAdmin confirms admin status
    checkIsHubAdmin().then((isAdmin) => { pinsBtn.style.display = isAdmin ? "" : "none"; });
  }
  const closeBtn = document.getElementById("teamPinsCloseBtn");
  if (closeBtn) closeBtn.addEventListener("click", closeTeamPinsModal);
  const addBtn = document.getElementById("teamPinsAddBtn");
  if (addBtn) addBtn.addEventListener("click", addTeamPinsPerson);
}

// Records a lightweight "last seen in the Hub" timestamp per teammate,
// in agency/teamActivity: { users: { "email": { lastSeen: isoString } } }.
// Written with merge:true so each login only touches that one person's
// key rather than overwriting everyone else's last-seen data at once.
// Purely informational (shown in Team Access Manager) - never gates access.
// Every agency-wide Firestore doc referenced anywhere in the Hub, outside
// of clientsDb's own (sharded) storage - kept as an explicit list rather
// than discovered dynamically since Firestore has no "list all docs in a
// collection" from client-side security rules here. Add new tools' agency
// docs to this list so Export Full Backup actually captures them.
const AGENCY_BACKUP_DOC_NAMES = [
  "accessLoginLog", "activityLog", "adAccountLog", "adminActivityLog",
  "adminNotifications", "callSheets", "changeOrders",
  // "contractInvoiceLog" removed - it was never a real doc anything writes
  // to (see agency-health-dashboard/js/app.js fix, same date); the actual
  // one every tool reads/writes is "contractInvoices" below.
  "contractInvoices", "emailTemplates", "proposalFollowUps", "rawFootageLog",
  "referrals", "releaseForms", "revisionFeedbackLog", "runOfShow",
  "servicePricing", "sops", "subscriptionTracker", "teamAccess",
  "teamActivity", "teamRoster", "vendorRentalTracker", "venueTechSpecs"
];

async function fetchAllAgencyDocsForBackup() {
  const result = {};
  if (!window.firebaseDb || !window.firebaseDb.collection) return result;

  await Promise.all(AGENCY_BACKUP_DOC_NAMES.map(async (docName) => {
    try {
      const snap = await window.firebaseDb.collection("agency").doc(docName).get();
      if (snap.exists) result[docName] = snap.data();
    } catch (e) {
      console.warn(`Could not read agency/${docName} for backup:`, e);
    }
  }));

  return result;
}

// Agency-wide "who did what and when" log, lives in agency/adminActivityLog
// as { list: [...] } - same flat-doc pattern as adminNotifications, but
// re-reads the doc fresh on every call instead of keeping an in-memory
// copy, since (unlike the notification bell) nothing in the parent Hub
// renders this list - it's only viewed from the separate Activity Log
// tool - so there's no local state to keep in sync, and re-reading avoids
// clobbering entries logged from another open tab/session in between
// calls. Callable from any iframe tool via window.parent.logAdminActivity.
async function logAdminActivity(action, details) {
  if (!window.firebaseDb || !window.firebaseDb.collection) return;
  try {
    const ref = window.firebaseDb.collection("agency").doc("adminActivityLog");
    const snap = await ref.get();
    const list = (snap.exists && snap.data().list) || [];
    list.unshift({
      id: 'act_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      action: action,
      details: details || "",
      by: window.currentAdminEmail || "unknown",
      createdAt: new Date().toISOString()
    });
    if (list.length > 300) list.length = 300;
    await ref.set({ list: list });
  } catch (e) {
    console.warn("Could not log admin activity:", e);
  }
}

function recordLastSeen(email) {
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseSetDoc || !email) return;
  try {
    const ref = window.firebaseDoc(window.firebaseDb, "agency", "teamActivity");
    window.firebaseSetDoc(ref, { users: { [email]: { lastSeen: new Date().toISOString() } } }, { merge: true })
      .catch(err => console.warn("Couldn't record last-seen:", err));
  } catch (e) {
    console.warn("Couldn't record last-seen:", e);
  }
}

// ── Team Access restrictions (sidebar-level) ──
// By default every @revitalproductions.com Google account gets full
// access to every section of the Hub - unchanged from before. The
// Team Access panel (tab-teamaccess) lets Ronald optionally restrict
// specific teammates to only certain sections; anyone not explicitly
// listed in agency/teamAccess keeps full access. This only hides
// sidebar sections client-side - it is not a data-security boundary,
// by design (see Team Access panel copy), so it's meant for trusted
// internal teammates rather than outside parties.
// Whether the currently logged-in teammate has a restricted (non-full)
// agency/teamAccess entry - set by applyTeamAccessRestrictions below.
// Defaults to false (full access) until the teamAccess snapshot resolves,
// same "visible until proven otherwise" default the footer buttons
// themselves use. Read by renderAdminNotifications to hold back
// admin-only notification types (see ADMIN_ONLY_NOTIF_TYPES) from
// restricted teammates, since the shared adminNotifications doc is one
// list every logged-in teammate reads - the gating has to happen at
// render time, per viewer, not at write time.
let isRestrictedTeamMember = false;

function applyTeamAccessRestrictions(allowedSections) {
  isRestrictedTeamMember = !!allowedSections;
  // Notifications may already be rendered from before this resolved (or
  // this may re-fire later if teamAccess changes) - re-filter now either way.
  try { renderAdminNotifications(); } catch (e) {}

  const navSections = document.querySelectorAll('.nav-section[data-section]');
  let activeItemHidden = false;

  navSections.forEach(sectionEl => {
    const key = sectionEl.getAttribute('data-section');
    const allowed = !allowedSections || allowedSections.indexOf(key) !== -1;
    sectionEl.style.display = allowed ? '' : 'none';
    if (!allowed && sectionEl.querySelector('.nav-item-btn.active')) {
      activeItemHidden = true;
    }
  });

  // The Team Access panel itself is only for full-access (unrestricted)
  // accounts - a restricted teammate should never see the tool that
  // controls everyone's restrictions. It lives in the sidebar footer
  // (with Export/Import/Delete), not inside a nav-section, so hide the
  // button directly rather than looking for a wrapping <li>.
  const teamAccessBtn = document.getElementById('teamAccessFooterBtn');
  if (teamAccessBtn) {
    teamAccessBtn.style.display = allowedSections ? 'none' : '';
  }

  // Service Pricing Admin controls default pricing for every proposal -
  // same admin/leadership-only visibility rule as Team Access above, and
  // lives right next to it in the footer for the same reason (only
  // full-access/unrestricted accounts see either one). Export All Data /
  // Import Backups / Delete Client stay visible to everyone, unchanged -
  // deliberately not gated (every employee should have these regardless
  // of Team Access restriction).
  const servicePricingBtn = document.getElementById('servicePricingFooterBtn');
  if (servicePricingBtn) {
    servicePricingBtn.style.display = allowedSections ? 'none' : '';
  }

  // Subscription & Tool Cost Tracker is financial info too - same
  // admin/leadership-only footer gating as Team Access and Service
  // Pricing Admin right next to it.
  const subscriptionTrackerBtn = document.getElementById('subscriptionTrackerFooterBtn');
  if (subscriptionTrackerBtn) {
    subscriptionTrackerBtn.style.display = allowedSections ? 'none' : '';
  }

  // Business Insurance Tracker (Revital's own GL/E&O/Equipment/Cyber
  // policies) is financial info too - same admin/leadership-only footer
  // gating as Subscription Tracker right next to it.
  const businessInsuranceBtn = document.getElementById('businessInsuranceFooterBtn');
  if (businessInsuranceBtn) {
    businessInsuranceBtn.style.display = allowedSections ? 'none' : '';
  }

  // Activity Log shows who did what across every client - same
  // admin/leadership-only gating as the rest of the footer tools.
  const activityLogBtn = document.getElementById('activityLogFooterBtn');
  if (activityLogBtn) {
    activityLogBtn.style.display = allowedSections ? 'none' : '';
  }

  // Business Roadmap is a leadership status view, not client-work
  // tooling - same admin/leadership-only footer gating as the rest of
  // this list.
  const businessRoadmapBtn = document.getElementById('businessRoadmapFooterBtn');
  if (businessRoadmapBtn) {
    businessRoadmapBtn.style.display = allowedSections ? 'none' : '';
  }

  // If restrictions just hid whatever tab the user was looking at,
  // land them on the first tab they're still allowed to see instead
  // of leaving them on a now-hidden section.
  if (allowedSections && activeItemHidden) {
    const firstVisibleBtn = document.querySelector('.nav-section[data-section]:not([style*="display: none"]) .nav-item-btn');
    if (firstVisibleBtn) firstVisibleBtn.click();
  }
}

// Resolves what a restricted teammate's stored agency/teamAccess entry
// actually grants, regardless of which shape it was saved in - the
// legacy flat array (every entry before roles existed), the current
// role-based shape ({role: "Name"} - sections come from roleTiers,
// live), or the current custom shape ({role: null, sections: [...]}).
// Mirrored from team-access-manager/js/app.js's effectiveSections/
// normalizeUserEntry - this is the copy that actually enforces it, that
// one is just for rendering its own admin UI accurately. If a role was
// deleted while someone was still assigned it, this falls back to no
// sections (fully restricted) rather than silently granting full access.
function resolveAllowedSections(entry, roleTiers) {
  if (Array.isArray(entry)) return entry;
  if (entry && typeof entry === "object") {
    if (entry.role) {
      const role = (roleTiers || {})[entry.role];
      return role ? (role.sections || []) : [];
    }
    if (Array.isArray(entry.sections)) return entry.sections;
  }
  return [];
}

function initTeamAccessGate() {
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseOnSnapshot) return;
  const ref = window.firebaseDoc(window.firebaseDb, "agency", "teamAccess");
  window.firebaseOnSnapshot(ref, (docSnap) => {
    const data = docSnap.exists ? docSnap.data() : null;
    const users = (data && data.users) ? data.users : {};
    const roleTiers = (data && data.roleTiers) ? data.roleTiers : {};
    const email = (window.currentAdminEmail || "").toLowerCase();
    const allowedSections = Object.prototype.hasOwnProperty.call(users, email)
      ? resolveAllowedSections(users[email], roleTiers)
      : null;
    applyTeamAccessRestrictions(allowedSections);
  }, (err) => {
    console.error("Team access gate listener error:", err);
  });
}

// boot() runs the rest of app init, but only once, and only after the
// admin auth gate above has confirmed identity.
let hasBooted = false;
function boot() {
  if (hasBooted) return;
  hasBooted = true;
  fetchCloudflareProfile();
  try { initTabNavigation(); } catch(e) { console.error("TabNav Error:", e); }
  try { initNavSectionToggles(); } catch(e) { console.error("NavSectionToggles Error:", e); }
  try { initSidebarFooterToggle(); } catch(e) { console.error("SidebarFooterToggle Error:", e); }
  try { initMobileNavigation(); } catch(e) { console.error("MobileNav Error:", e); }
  try { initParentEventListeners(); } catch(e) { console.error("ParentListeners Error:", e); }
  try { initAdminNotifBell(); } catch(e) { console.error("AdminNotifBell Error:", e); }
  try { loadAdminNotifications(); } catch(e) { console.error("AdminNotifications Error:", e); }
  try { initTeamAccessGate(); } catch(e) { console.error("TeamAccessGate Error:", e); }
  try { refreshAllViews(); } catch(e) { console.error("Refresh Error:", e); }
  // Overview Dashboard (tab-dashboard) is active by default at boot, so
  // no tab-click fires to trigger this the way it does for every other
  // tab - needs its own explicit first call here.
  renderSalesPipelineValue().catch(e => console.error("SalesPipelineValue Error:", e));
  renderWhosOutToday().catch(e => console.error("WhosOutToday Error:", e));
  try { renderMoodBoardsAwaitingFeedback(); } catch (e) { console.error("MoodBoardsAwaitingFeedback Error:", e); }
  renderNeedsAttention().catch(e => console.error("NeedsAttention Error:", e));
  renderLeadSourceRoi().catch(e => console.error("LeadSourceRoi Error:", e));
  // renderPhaseProgress() no longer needs a boot-time call here - it
  // moved off the (default-active-at-boot) dashboard onto its own
  // tab-businessroadmap page, which renders lazily like every other
  // non-default tab (see the tab-click handler in initTabNavigation).

  const resetSandboxBtn = document.getElementById("resetSandboxBtn");
  if (resetSandboxBtn) {
    resetSandboxBtn.addEventListener("click", () => {
      const sandboxName = "Quick Sandbox (One-Offs)";
      if (!confirm("Are you sure you want to clear all data in the Quick Sandbox? This will reset all checklist audits and competitor sheets back to blank templates.")) return;
      clientsDb[sandboxName] = createClientBlankState(sandboxName);
      saveDatabase();
      refreshAllViews();
      showBanner("success", "Quick Sandbox data cleared and reset successfully!");
    });
  }

  loadDatabase();
}

// ── PDF Generation ──
async function generateClientPDF() {
  const btn = document.getElementById('exportPdfBtn');
  if (!activeClientName || !clientsDb[activeClientName]) {
    alert("Please select a client first!");
    return;
  }
  
  const client = clientsDb[activeClientName];
  const oldText = btn.innerHTML;
  btn.innerHTML = '<span class="icon">⏳</span> Generating...';
  btn.disabled = true;

  try {
    const el = document.createElement('div');
    el.style.padding = '40px';
    el.style.fontFamily = 'sans-serif';
    el.style.color = '#000';
    el.style.background = '#fff';
    
    // Build HTML content
    let html = `<h1 style="font-size:24px; border-bottom: 2px solid #000; padding-bottom:10px; margin-bottom:20px;">Monthly Report: ${activeClientName}</h1>`;
    
    // SWOT
    if (client.swot) {
      html += `<h2>SWOT Analysis</h2><ul>`;
      ['strengths', 'weaknesses', 'opportunities', 'threats'].forEach(k => {
        if (client.swot[k] && client.swot[k].length > 0) {
          html += `<li><strong>${k.toUpperCase()}:</strong> ${client.swot[k].join(', ')}</li>`;
        }
      });
      html += `</ul><br>`;
    }

    // Brand Vault
    if (client.brandVault && client.brandVault.brandName) {
      html += `<h2>Brand Identity</h2>`;
      html += `<p><strong>Name:</strong> ${client.brandVault.brandName}</p>`;
      html += `<p><strong>Tagline:</strong> ${client.brandVault.tagline || 'N/A'}</p>`;
      html += `<br>`;
    }

    // Append to hidden element
    el.innerHTML = html;
    
    const opt = {
      margin:       0.5,
      filename:     `${activeClientName.replace(/\s+/g, '_')}_Report.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    if (typeof html2pdf !== 'undefined') {
      await html2pdf().set(opt).from(el).save();
    } else {
      alert("PDF library failed to load.");
    }
  } catch(e) {
    console.error("PDF Error:", e);
    alert("An error occurred generating the PDF.");
  }
  
  btn.innerHTML = oldText;
  btn.disabled = false;
}

// ── Global Variables ──
let clientsDb = {};
let activeClientName = "";
let iframeNeedsReload = {
  "tab-adaccountsetup": true,
  "tab-teamaccess": true,
  "tab-uxui": true,
  "tab-seo": true,
  "tab-strategy": true,
  "tab-strategybuilder": true,
  "tab-personalbrand": true,
  "tab-socialaudit": true,
  "tab-webcomp": true,
  "tab-socialcomp": true,
  "tab-report": true,
  "tab-copywriting": true,
  "tab-meetingnotes": true,
  "tab-reportarchive": true,
  "tab-brandassetkit": true,
  "tab-budgetpacing": true,
  // These two were never even added to this map, on top of never getting
  // a switch-case/render function below - so unlike the pair above (which
  // at least got flagged true and then silently no-op'd), these hardcoded-
  // src iframes never got touched by the reload system in any way, not
  // even a wasted attempt. Found via a static-analysis pass cross-
  // referencing every tool folder against its wiring in this file - see
  // the same pass's summary for the other 4 already-flagged-but-unwired
  // tabs fixed alongside these two.
  "tab-brandguidelines": true,
  "tab-moodboard": true,
  "tab-contentcalendar": true,
  "tab-brandroadmap": true,

  // These tool tabs previously had a hardcoded iframe src in index.html and
  // were never wired into the reload system at all, so switching client
  // workspaces never refreshed them - they kept showing whichever client
  // was active when the page first loaded until a full page refresh.
  "tab-portal": true,
  "tab-intakerequest": true,
  "tab-welcomeguide": true,
  "tab-emailsig": true,
  "tab-creativebrief": true,
  "tab-adcampaignbrief": true,
  "tab-creativestrategy": true,
  "tab-contentaudit": true,
  "tab-paidads": true,
  "tab-emailstrategy": true,
  "tab-campaignlaunch": true,
  "tab-timeline": true,
  "tab-roiprojector": true,
  "tab-budgetcalculator": true,
  "tab-paybackperiod": true,
  "tab-sopwiki": true,
  "tab-tasknamegen": true,
  "tab-marketingnews": true,
  "tab-proposal": true,
  "tab-kickoffprep": true,
  "tab-servicepricing": true,
  "tab-redflag": true,
  "tab-healthdashboard": true,
  "tab-changeorder": true,
  "tab-qbr": true,
  "tab-casestudy": true,
  "tab-portfolioshowcase": true,
  "tab-emailtemplates": true,
  "tab-subscriptiontracker": true,
  "tab-businessinsurance": true,
  "tab-activitylog": true,
  "tab-teamroster": true,
  "tab-mytimeoff": true,
  "tab-hourslog": true,
  "tab-resourcebooking": true,
  "tab-testimonialtracker": true,
  "tab-reviewtracker": true,
  "tab-intakequalifier": true,
  "tab-discoverycall": true,
  "tab-packagerecommend": true,
  "tab-followuptracker": true,
  "tab-pipelineboard": true,
  "tab-coldoutreach": true,
  "tab-contractinvoice": true,
  "tab-referraltracker": true,
  "tab-renewaltracker": true,
  "tab-offboarding": true,
  "tab-qc": true,
  "tab-weeklycheckin": true,
  "tab-accesslog": true,
  "tab-adaccountlog": true,
  "tab-revisionfeedback": true,
  "tab-callsheet": true,
  "tab-rawfootage": true,
  "tab-releaseforms": true,
  "tab-runofshow": true,
  "tab-venuespecs": true,
  "tab-vendorrental": true
};

// ── Initial State Blueprint ──
function createClientBlankState(name) {
  const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
  const today = new Date().toLocaleDateString('en-CA', dateOptions); // yyyy-mm-dd format

  // Clone onboarding checklist
  const onboarding = DEFAULT_ONBOARDING_CHECKLIST.map(cat => ({
    category: cat.category,
    items: cat.items.map(item => ({
      id: item.id,
      label: item.label,
      checked: false,
      notes: "", // local note for this task
      // Explicit opt-in flag for whether this task shows on the client
      // portal's onboarding checklist. Defaults to false (internal-only)
      // unless the template item was already marked visible - nothing is
      // shown to the client unless someone deliberately flags it.
      clientVisible: item.clientVisible || false
    }))
  }));

  // Separate, client-facing checklist - fully independent of the internal
  // onboarding tracker above. Managed per-client in the Client Portal
  // Manager tool and shown as-is on the client's own portal.
  const clientChecklist = DEFAULT_CLIENT_CHECKLIST.map(item => ({
    id: item.id,
    label: item.label,
    checked: false
  }));

  // Clone SEO audit steps
  const seoAudit = {
    checked: {},
    notes: {},
    targetUrl: ""
  };

  // Clone UXUI audit
  const uxuiAudit = {
    checked: {},
    notes: {},
    targetUrl: ""
  };

  // Clone Content Strategy steps
  const contentStrategy = {
    checked: {},
    notes: {},
    targetUrl: ""
  };

  // Initialize Content Strategy Builder
  const strategyBuilder = {
    targetUrl: "",
    data: {
      platforms: [
        { id: 'instagram', name: 'Instagram', purpose: '', contentTypes: [], frequency: '' },
        { id: 'tiktok', name: 'TikTok', purpose: '', contentTypes: [], frequency: '' },
        { id: 'youtube', name: 'YouTube', purpose: '', contentTypes: [], frequency: '' },
        { id: 'linkedin', name: 'LinkedIn', purpose: '', contentTypes: [], frequency: '' }
      ]
    }
  };

  // Clone Social Media Audit steps
  const socialAudit = {
    checked: {},
    notes: {},
    targetUrl: ""
  };

  // Initialize Website Competitors
  const webCompRows = {};
  WEBSITE_COMPETITOR_ROWS.forEach(row => {
    webCompRows[row.key] = ["", "", ""]; // Top, Mid, Low values
  });

  // Initialize Social Competitors
  const socialCompRows = {};
  SOCIAL_COMPETITOR_ROWS.forEach(row => {
    socialCompRows[row.key] = ["", "", ""]; // Top, Mid, Low values
  });
  
  // Clone Paid Ads Audit
  const paidAdsAudit = {
    checked: {},
    notes: {},
    targetUrl: "",
    textInputs: { adSpend: "", roas: "", vulnerabilities: "", actions: "" }
  };
  
  // Clone Email Marketing Audit
  const emailAudit = {
    checked: {},
    notes: {},
    targetUrl: "",
    textInputs: { listSize: "", openRate: "", opportunities: "", actions: "" }
  };

  return {
    name: name,
    createdDate: today,
    targetUrl: "",
    clickupUrl: "",
    onboardingDate: today,
    onboardingChecklist: onboarding,
    clientChecklist: clientChecklist,
    reportArchive: [], // published monthly reports shown on the client portal
    uxuiAudit: uxuiAudit,
    seoAudit: seoAudit,
    paidAdsAudit: paidAdsAudit,
    emailAudit: emailAudit,
    competitorAnalysis: [],
    contentStrategy: contentStrategy,
    strategyBuilder: strategyBuilder,
    socialAudit: socialAudit,
    brandVault: {
      assets: {
        logoUrl: "",
        driveLink: "",
        canvaLink: ""
      },
      colors: [
        { hex: "#000000", name: "Primary" },
        { hex: "#000000", name: "Secondary" },
        { hex: "#000000", name: "Accent 1" },
        { hex: "#000000", name: "Accent 2" },
        { hex: "#000000", name: "Background" }
      ],
      typography: {
        primaryFont: "",
        secondaryFont: ""
      },
      brandVoice: {
        adjectives: "",
        missionStatement: ""
      },
      targetAudience: {
        demographic: "",
        painPoints: ""
      }
    },
    paidAdsTracker: {},
    emailStrategy: {},
    contentAudit: {},
    webComp: {
      market: "",
      date: today,
      names: ["Competitor A", "Competitor B", "Competitor C"],
      rows: webCompRows,
      swot: { s: "", w: "", o: "", t: "" },
      insight: "",
      stars: [0, 0, 0]
    },
    socialComp: {
      niche: "",
      date: today,
      names: ["Competitor A", "Competitor B", "Competitor C"],
      rows: socialCompRows,
      swot: { s: "", w: "", o: "", t: "" },
      insight: "",
      stars: [0, 0, 0]
    },
    report: {
      preparedBy: "",
      date: today,
      focus: "",
      wins: "",
      platforms: DEFAULT_REPORT_PLATFORMS.map(p => ({ ...p })),
      cellData: {} // metricKey -> array of platform values
    },
    campaignLaunch: { checked: {}, notes: {}, data: {} },
copywriting: {
      activeFramework: "aida",
      notes: "",
      inputs: { product: "", audience: "", benefit: "", cta: "", tone: "persuasive" },
      targetUrl: ""
    },
    proposal: {},
    roi: {},
    signature: {},
    creativeBrief: {},
    portalConfig: {
      accountManagerName: "",
      accountManagerEmail: "",
      accountManagerPhone: "",
      calendlyLink: "",
      projectsEmbedUrl: "",
      calendarEmbedUrl: "",
      campaignBriefUrl: "",
      completedWorkUrl: "",
      feedbackFormUrl: "",
      revisionFormUrl: "",
      contentRequestFormUrl: "",
      brandAssetsUrl: "",
      liveAnalyticsUrl: "",
      clientLogoUrl: "",
      clientContactName: "",
      clientContactEmail: "",
      primaryColor: "#10b981",
      secondaryColor: "#6366f1",
      magicToken: generateSecureToken()
    },
    // Content Approvals - deliverables awaiting a client decision
    // (pendingApprovals) and ones they've already decided on
    // (approvalHistory). Client-side decisions write straight to the
    // public clients/{token} doc, same as clientChecklist - synced back
    // into this real object by ensureClientPortalListeners below.
    pendingApprovals: [],
    approvalHistory: []
  };
}

// ── Local Storage Management ──
// ── Database Management (Firebase + Local Storage) ──
let isFirestoreLoaded = false;

function migrateSchemaAndDefaults() {
  // If database is empty, seed a default client workspace
  if (Object.keys(clientsDb).length === 0) {
    const defaultName = "Nexus Productions";
    clientsDb[defaultName] = createClientBlankState(defaultName);
  }

  // Ensure Quick Sandbox workspace is seeded
  const sandboxName = "Quick Sandbox (One-Offs)";
  if (!clientsDb[sandboxName]) {
    clientsDb[sandboxName] = createClientBlankState(sandboxName);
  }

  // Schema migration and verification loop to protect against legacy data
  Object.keys(clientsDb).forEach(name => {
    const client = clientsDb[name];
    const blank = createClientBlankState(name);

    // Verify top-level keys
    Object.keys(blank).forEach(key => {
      if (client[key] === undefined) {
        client[key] = blank[key];
      }
    });

    if (client.clickupUrl === undefined) client.clickupUrl = "";

    // Migrate onboarding list format (backward compat)
    if (client.onboarding && client.onboarding.length > 0 && !client.onboarding[0].category) {
      client.onboarding = blank.onboarding;
    }

    // Migrate or verify copywriting object structure
    if (!client.copywriting || Array.isArray(client.copywriting) || typeof client.copywriting !== 'object') {
      client.copywriting = {
        activeFramework: "aida",
        notes: "",
        inputs: { product: "", audience: "", benefit: "", cta: "", tone: "persuasive" },
        targetUrl: ""
      };
    } else {
      if (!client.copywriting.inputs) {
        client.copywriting.inputs = { product: "", audience: "", benefit: "", cta: "", tone: "persuasive" };
      }
      if (client.copywriting.activeFramework === undefined) client.copywriting.activeFramework = "aida";
      if (client.copywriting.notes === undefined) client.copywriting.notes = "";
      if (client.copywriting.targetUrl === undefined) client.copywriting.targetUrl = "";
    }
  });
}

function getActiveClient() {
  return clientsDb[activeClientName];
}

// Friendly-name fallback for the "who last edited this client" ambient
// note (see renderClientLastEditedNote below) - there's no existing
// login-email -> display-name mapping anywhere in the Hub (Team Roster's
// names aren't keyed by login email), so rather than add a new async
// lookup into the hot saveDatabase() path, this just derives something
// readable from the email's own local part. "sarah.jones@..." -> "Sarah
// Jones". Good enough for an ambient hint, not meant to be authoritative.
function friendlyNameFromEmail(email) {
  if (!email) return "Someone";
  const local = String(email).split("@")[0] || "";
  const parts = local.split(/[._]+/).filter(Boolean);
  if (!parts.length) return "Someone";
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

// How recent a DIFFERENT teammate's edit has to be before the ambient
// note below escalates from a quiet "last edited by" line into a warning.
// Deliberately NOT a popup, and deliberately not the same mechanism as
// commitDatabaseToCloud's hard-block-and-ask (see its own comment) - that
// one already guarantees no save can silently overwrite another admin's
// work, it just only speaks up AFTER a save gets rejected. This is
// earlier, ambient awareness so a teammate notices BEFORE they start
// editing on top of a very recent change in the first place.
const RECENT_EDIT_WARNING_WINDOW_MS = 20 * 60 * 1000;

// Reads the active client's lastEditedBy/lastEditedByEmail/lastEditedAt
// (stamped in saveDatabase() below) and updates the quiet note under the
// sidebar's client switcher. Called on client switch (refreshAllViews)
// and right after every save, not on any kind of polling/interval - so
// it reflects what's true as of the last time YOU touched or loaded this
// client, same "no live polling" scope as the rest of the Hub's per-
// client UI.
function renderClientLastEditedNote() {
  const noteEl = document.getElementById("clientLastEditedNote");
  if (!noteEl) return;
  const client = getActiveClient();

  if (!client || !client.lastEditedAt) {
    noteEl.style.display = "none";
    noteEl.classList.remove("warning");
    return;
  }

  const isOwnEdit = !!(client.lastEditedByEmail && window.currentAdminEmail &&
    client.lastEditedByEmail === window.currentAdminEmail);
  const ageMs = Date.now() - new Date(client.lastEditedAt).getTime();
  const isRecentOther = !isOwnEdit && ageMs >= 0 && ageMs < RECENT_EDIT_WARNING_WINDOW_MS;
  const timeAgo = adminNotifTimeAgo(client.lastEditedAt);
  const who = isOwnEdit ? "you" : (client.lastEditedBy || "someone");

  noteEl.style.display = "block";
  noteEl.classList.toggle("warning", isRecentOther);
  noteEl.textContent = isRecentOther
    ? `⚠ Edited by ${who} ${timeAgo} — check before you save over it`
    : `Last edited by ${who} ${timeAgo}`;
}

// Cross-client accessor for tools that need to see every client at once
// (e.g. the Proposal Follow-Up Tracker), rather than just the active one.
function getAllClients() {
  return clientsDb;
}

// Shared helper so embedded iframe tools can jump the user to another tab
// (e.g. "Open Proposal Calculator" buttons) by clicking the real sidebar
// button, which keeps all the existing tab-switch/reload logic intact.
function navigateToTab(tabId) {
  const btn = document.querySelector(`.nav-item-btn[data-tab="${tabId}"]`);
  if (btn) btn.click();
}

// ── Workspace Switching & View Management ──
function switchClient(clientName) {
  if (clientsDb[clientName]) {
    activeClientName = clientName;
    localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);
    showBanner("success", `Switched to workspace "${clientName}"`);
    refreshAllViews();
  }
}

function createNewClient() {
  const clientNameInput = prompt("Enter a unique name for the new client:");
  if (!clientNameInput) return;
  const name = clientNameInput.trim();
  if (name === "") return;

  if (clientsDb[name]) {
    showBanner("error", `A client workspace named "${name}" already exists.`);
    return;
  }

  clientsDb[name] = createClientBlankState(name);
  saveDatabase();
  activeClientName = name;
  localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);
  buildClientDropdown();
  refreshAllViews();
  showBanner("success", `Client workspace "${name}" initialized successfully!`);
  logAdminActivity("Client created", name);
  generateNewClientOnboardingEmails(clientsDb[name], name).catch(e => console.warn("Could not draft onboarding emails:", e));
}

function renameActiveClient() {
  const sandboxName = "Quick Sandbox (One-Offs)";
  if (activeClientName === sandboxName) {
    showBanner("error", "Cannot rename the Quick Sandbox workspace.");
    return;
  }
  if (!activeClientName || !clientsDb[activeClientName]) {
    showBanner("error", "No active client workspace to rename.");
    return;
  }

  const oldName = activeClientName;
  const newNameInput = prompt(`Rename "${oldName}" to:`, oldName);
  if (!newNameInput) return;
  const newName = newNameInput.trim();
  if (newName === "" || newName === oldName) return;

  if (clientsDb[newName]) {
    showBanner("error", `A client workspace named "${newName}" already exists.`);
    return;
  }

  // Move the client's full state to the new key and update its internal
  // `name` field to match (kept in sync since createClientBlankState()
  // stores name on the object itself). Client portal links are unaffected
  // - the portal resolves clients by a separate Firestore token, not by
  // this name/key, so nothing on the client-facing side breaks.
  const clientState = clientsDb[oldName];
  clientState.name = newName;
  clientsDb[newName] = clientState;
  delete clientsDb[oldName];
  // See intentionallyRemovedClientNames above commitDatabaseToCloud's
  // stale-tab content check - this key genuinely leaving clientsDb here is
  // a deliberate, in-this-tab rename, not a sign of stale data.
  intentionallyRemovedClientNames.add(oldName);

  activeClientName = newName;
  localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);

  saveDatabase();
  buildClientDropdown();
  refreshAllViews();
  showBanner("success", `Renamed "${oldName}" to "${newName}".`);
}

function deleteActiveClient() {
  const sandboxName = "Quick Sandbox (One-Offs)";
  if (activeClientName === sandboxName) {
    showBanner("error", "Cannot delete the Quick Sandbox workspace.");
    return;
  }

  const clientNames = Object.keys(clientsDb);
  if (clientNames.length <= 1) {
    showBanner("error", "Cannot delete the only remaining client workspace.");
    return;
  }

  const confirmDelete = confirm(`Are you sure you want to permanently delete client profile "${activeClientName}"? All audits, checklists, and reports will be lost.`);
  if (!confirmDelete) return;

  const deletedName = activeClientName;
  delete clientsDb[activeClientName];
  // See intentionallyRemovedClientNames above commitDatabaseToCloud's
  // stale-tab content check - this key genuinely leaving clientsDb here is
  // a deliberate, in-this-tab delete, not a sign of stale data.
  intentionallyRemovedClientNames.add(deletedName);
  saveDatabase();

  // Switch to first remaining client
  activeClientName = Object.keys(clientsDb)[0];
  localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);

  buildClientDropdown();
  refreshAllViews();
  showBanner("success", "Client profile removed.");
  logAdminActivity("Client deleted", deletedName);
}

function buildClientDropdown() {
  const select = document.getElementById("clientSelect");
  if (!select) return;
  select.innerHTML = "";

  const sandboxName = "Quick Sandbox (One-Offs)";
  const sortedNames = Object.keys(clientsDb).filter(n => n !== sandboxName).sort();
  if (clientsDb[sandboxName]) {
    sortedNames.unshift(sandboxName);
  }

  sortedNames.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    if (name === activeClientName) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  // Native tooltip fallback so the full name is always reachable even when
  // the styled dropdown truncates a long client name with an ellipsis.
  select.title = activeClientName;
}

// ── Helper to reload iframe if needed ──
function refreshIframeTab(tabId) {
  switch (tabId) {
    case "tab-uxui":
      renderUxuiAudit();
      break;
    case "tab-seo":
      renderSeoAudit();
      break;
    case "tab-portal":
      renderClientPortalManagerTab();
      break;
    case "tab-intakerequest":
      renderIntakeRequest();
      break;
    case "tab-welcomeguide":
      renderWelcomeGuide();
      break;
      case "tab-adaccountsetup":
      renderAdAccountSetup();
      break;
    case "tab-teamaccess":
      renderTeamAccess();
      break;
    case "tab-emailsig":
      renderEmailSigGenerator();
      break;
    case "tab-creativebrief":
      renderCreativeBrief();
      break;
    case "tab-adcampaignbrief":
      renderAdCampaignBrief();
      break;
    case "tab-creativestrategy":
      renderCreativeStrategyBuilder();
      break;
    case "tab-contentaudit":
      renderContentAudit();
      break;
    case "tab-paidads":
      renderPaidAdsAudit();
      break;
    case "tab-emailstrategy":
      renderEmailStrategyAudit();
      break;
    case "tab-campaignlaunch":
      renderCampaignLaunchChecklist();
      break;
    case "tab-timeline":
      renderTimelineScheduler();
      break;
    case "tab-intakequalifier":
      renderIntakeQualifier();
      break;
    case "tab-discoverycall":
      renderDiscoveryCallScript();
      break;
    case "tab-packagerecommend":
      renderPackageRecommendationEngine();
      break;
    case "tab-followuptracker":
      renderFollowUpTracker();
      break;
    case "tab-pipelineboard":
      renderPipelineBoard();
      break;
    case "tab-coldoutreach":
      renderColdOutreachSequencer();
      break;
    case "tab-roiprojector":
      renderRoiProjector();
      break;
    case "tab-budgetcalculator":
      renderBudgetCalculator();
      break;
    case "tab-paybackperiod":
      renderPaybackPeriodCalculator();
      break;
    case "tab-contractinvoice":
      renderContractInvoiceTracker();
      break;
    case "tab-referraltracker":
      renderReferralTracker();
      break;
    case "tab-renewaltracker":
      renderRenewalTracker();
      break;
    case "tab-offboarding":
      renderOffboardingChecklistTab();
      break;
    case "tab-qc":
      renderQcChecklistTab();
      break;
    case "tab-weeklycheckin":
      renderWeeklyCheckinTab();
      break;
    case "tab-accesslog":
      renderAccessLoginLogTab();
      break;
    case "tab-adaccountlog":
      renderAdAccountLogTab();
      break;
    case "tab-revisionfeedback":
      renderRevisionFeedbackTab();
      break;
    case "tab-callsheet":
      renderCallSheetTab();
      break;
    case "tab-rawfootage":
      renderRawFootageTab();
      break;
    case "tab-releaseforms":
      renderReleaseFormsTab();
      break;
    case "tab-runofshow":
      renderRunOfShowTab();
      break;
    case "tab-venuespecs":
      renderVenueTechSpecsTab();
      break;
    case "tab-vendorrental":
      renderVendorRentalTab();
      break;
    case "tab-sopwiki":
      renderSopWiki();
      break;
    case "tab-tasknamegen":
      renderTaskNameGenerator();
      break;
    case "tab-marketingnews":
      renderMarketingNews();
      break;
    case "tab-proposal":
      renderProposalCalculator();
      break;
    case "tab-servicepricing":
      renderServicePricingAdmin();
      break;
    case "tab-redflag":
      renderRedFlagChecklist();
      break;
    case "tab-healthdashboard":
      renderHealthDashboard();
      break;
    case "tab-changeorder":
      renderChangeOrderGenerator();
      break;
    case "tab-qbr":
      renderQbrGenerator();
      break;
    case "tab-kickoffprep":
      renderKickoffPrep();
      break;
    case "tab-casestudy":
      renderCaseStudyBuilder();
      break;
    case "tab-portfolioshowcase":
      renderPortfolioShowcase();
      break;
    case "tab-emailtemplates":
      renderEmailTemplateLibrary();
      break;
    case "tab-subscriptiontracker":
      renderSubscriptionTracker();
      break;
    case "tab-businessinsurance":
      renderBusinessInsuranceTracker();
      break;
    case "tab-activitylog":
      renderActivityLogTab();
      break;
    case "tab-teamroster":
      renderTeamRoster();
      break;
    case "tab-mytimeoff":
      renderMyTimeOff();
      break;
    case "tab-hourslog":
      renderHoursLog();
      break;
    case "tab-resourcebooking":
      renderResourceBooking();
      break;
    case "tab-testimonialtracker":
      renderTestimonialTracker();
      break;
    case "tab-reviewtracker":
      renderReviewTracker();
      break;
    case "tab-strategy":
      renderContentStrategy();
      break;
    case "tab-strategybuilder":
      renderStrategyBuilder();
      break;
    case "tab-personalbrand":
      renderPersonalBranding();
      break;
    case "tab-socialaudit":
      renderSocialAudit();
      break;
    case "tab-webcomp":
      renderWebCompetitors();
      break;
    case "tab-socialcomp":
      renderSocialCompetitors();
      break;
    case "tab-report":
      renderReportForm();
      break;
    case "tab-copywriting":
      renderCopywriting();
      break;
    // Found via a static-analysis pass: these 6 had a hardcoded iframe
    // src baked directly into index.html and were never wired into this
    // switch statement at all, so switching client workspaces never
    // refreshed them - same bug class (and same fix) as the batch this
    // file's iframeNeedsReload comment already documents fixing earlier.
    // brandguidelines/moodboard weren't even in the iframeNeedsReload map
    // above; the other 4 were flagged true but had no case here, so
    // refreshIframeTab() silently did nothing for them.
    case "tab-brandassetkit":
      renderBrandAssetKit();
      break;
    case "tab-brandguidelines":
      renderBrandGuidelines();
      break;
    case "tab-budgetpacing":
      renderBudgetPacing();
      break;
    case "tab-meetingnotes":
      renderMeetingNotes();
      break;
    case "tab-moodboard":
      renderMoodBoard();
      break;
    case "tab-brandroadmap":
      renderBrandRoadmap();
      break;
    case "tab-contentcalendar":
      renderContentCalendar();
      break;
    case "tab-reportarchive":
      renderReportArchive();
      break;
  }
  iframeNeedsReload[tabId] = false;
}

// ── Tab Navigation routing ──
function initTabNavigation() {
  const navButtons = document.querySelectorAll(".nav-item-btn");
  const sections = document.querySelectorAll(".tab-section");

  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      
      navButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // If this button lives inside a collapsed section (e.g. activated
      // programmatically via a dashboard quick link), expand it so the
      // user can see where they landed.
      const parentSection = btn.closest(".nav-section");
      if (parentSection && parentSection.classList.contains("collapsed")) {
        parentSection.classList.remove("collapsed");
        const toggleBtn = parentSection.querySelector(".nav-section-toggle");
        if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
        const slug = parentSection.getAttribute("data-section");
        if (slug) {
          const current = new Set(getCollapsedNavSections());
          current.delete(slug);
          saveCollapsedNavSections(Array.from(current));
        }
      }

      // Same idea for the Admin panel (Team Access, Service Pricing,
      // Subscription Tracker, Activity Log) - it's a separate collapsible
      // block, not a .nav-section, since it's exempt from the section-
      // level Team Access restriction logic (see applyTeamAccessRestrictions).
      const parentFooter = btn.closest(".sidebar-footer");
      if (parentFooter && parentFooter.classList.contains("collapsed")) {
        parentFooter.classList.remove("collapsed");
        const footerToggleBtn = parentFooter.querySelector(".sidebar-footer-toggle");
        if (footerToggleBtn) footerToggleBtn.setAttribute("aria-expanded", "true");
        saveSidebarFooterCollapsed(false);
      }

      sections.forEach(sec => {
        sec.classList.remove("active");
        if (sec.id === targetTab) {
          sec.classList.add("active");
        }
      });

      // Lazy-load iframe if needed
      if (iframeNeedsReload[targetTab] === true) {
        refreshIframeTab(targetTab);
      }

      // Quick visual updates when entering tabs
      if (targetTab === "tab-report") {
        updateReportPreview();
      }
      // Refreshed on open rather than on every clientsDb change (like
      // renderDashboard/renderOnboardingChecklist above) - it reads an
      // extra doc (contractInvoices) for renewal dates, and My Clients
      // isn't the active-client view those others are, so there's no
      // reason to pay that cost on every save across the whole Hub.
      if (targetTab === "tab-myclients") {
        renderMyClients().catch(e => console.error("Error in renderMyClients:", e));
      }
      // Same reasoning as My Clients above - reads contractInvoices too,
      // agency-wide rather than active-client, so refreshed on open
      // rather than on every save.
      if (targetTab === "tab-dashboard") {
        renderSalesPipelineValue().catch(e => console.error("Error in renderSalesPipelineValue:", e));
        renderWhosOutToday().catch(e => console.error("Error in renderWhosOutToday:", e));
        try { renderMoodBoardsAwaitingFeedback(); } catch (e) { console.error("Error in renderMoodBoardsAwaitingFeedback:", e); }
        renderNeedsAttention().catch(e => console.error("Error in renderNeedsAttention:", e));
        renderLeadSourceRoi().catch(e => console.error("Error in renderLeadSourceRoi:", e));
      }
      // Moved off the dashboard onto its own admin-only page (see
      // tab-businessroadmap in index.html) - rendered on open rather than
      // as part of every dashboard save, same reasoning as My Clients/
      // Activity Log above.
      if (targetTab === "tab-businessroadmap") {
        renderPhaseProgress().catch(e => console.error("Error in renderPhaseProgress:", e));
        renderPhase2Preview().catch(e => console.error("Error in renderPhase2Preview:", e));
      }
    });
  });

  // Enable dashboard quick links (data-go)
  document.querySelectorAll("[data-go]").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-go");
      const sidebarNavBtn = document.querySelector(`.nav-item-btn[data-tab="${targetTab}"]`);
      if (sidebarNavBtn) {
        sidebarNavBtn.click();
      }
    });
  });
}

// ── Collapsible Nav Sections ──
const NAV_COLLAPSED_SECTIONS_KEY = "REVITAL_HUB_NAV_COLLAPSED_SECTIONS";

function getCollapsedNavSections() {
  try {
    const stored = localStorage.getItem(NAV_COLLAPSED_SECTIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
}

function saveCollapsedNavSections(collapsedSlugs) {
  try {
    localStorage.setItem(NAV_COLLAPSED_SECTIONS_KEY, JSON.stringify(collapsedSlugs));
  } catch (e) {}
}

function initNavSectionToggles() {
  const sections = document.querySelectorAll(".nav-section");
  if (!sections.length) return;

  const collapsedSlugs = new Set(getCollapsedNavSections());

  // Don't collapse the section that contains the currently active tab,
  // so the user always lands on a page that shows where they are.
  const activeBtn = document.querySelector(".nav-item-btn.active");
  const activeSection = activeBtn ? activeBtn.closest(".nav-section") : null;
  const activeSlug = activeSection ? activeSection.getAttribute("data-section") : null;

  sections.forEach(section => {
    const slug = section.getAttribute("data-section");
    const toggleBtn = section.querySelector(".nav-section-toggle");
    if (!toggleBtn || !slug) return;

    if (collapsedSlugs.has(slug) && slug !== activeSlug) {
      section.classList.add("collapsed");
      toggleBtn.setAttribute("aria-expanded", "false");
    }

    toggleBtn.addEventListener("click", () => {
      const isCollapsed = section.classList.toggle("collapsed");
      toggleBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");

      const current = new Set(getCollapsedNavSections());
      if (isCollapsed) {
        current.add(slug);
      } else {
        current.delete(slug);
      }
      saveCollapsedNavSections(Array.from(current));
    });
  });
}

// ── Collapsible Admin Panel (sidebar footer) ──
// Same pattern as the nav sections above, but tracked separately since
// the Admin panel isn't a .nav-section (it's deliberately exempt from
// applyTeamAccessRestrictions' section-hiding loop - see that function's
// comments - so reusing .nav-section here would risk hiding Export/
// Import/Delete Client for restricted teammates, which must always stay
// visible to everyone).
const SIDEBAR_FOOTER_COLLAPSED_KEY = "REVITAL_HUB_ADMIN_PANEL_COLLAPSED";

function getSidebarFooterCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_FOOTER_COLLAPSED_KEY) === "true";
  } catch (e) {
    return false;
  }
}

function saveSidebarFooterCollapsed(isCollapsed) {
  try {
    localStorage.setItem(SIDEBAR_FOOTER_COLLAPSED_KEY, isCollapsed ? "true" : "false");
  } catch (e) {}
}

function initSidebarFooterToggle() {
  const footer = document.getElementById("sidebarFooterSection");
  const toggleBtn = document.getElementById("sidebarFooterToggle");
  if (!footer || !toggleBtn) return;

  // Don't collapse it if the user is currently on one of its own tabs
  // (Team Access, Service Pricing, Subscription Tracker, Activity Log),
  // same reasoning as the nav sections - never hide where they already are.
  const activeBtn = document.querySelector(".nav-item-btn.active");
  const activeIsInFooter = !!(activeBtn && activeBtn.closest(".sidebar-footer"));

  if (getSidebarFooterCollapsed() && !activeIsInFooter) {
    footer.classList.add("collapsed");
    toggleBtn.setAttribute("aria-expanded", "false");
  }

  toggleBtn.addEventListener("click", () => {
    const isCollapsed = footer.classList.toggle("collapsed");
    toggleBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    saveSidebarFooterCollapsed(isCollapsed);
  });
}

// ── View Refresh Controllers ──
function refreshAllViews() {
  // Keep one live listener per client with a magic link so client-driven
  // checklist changes reach the agency side immediately, not just as a
  // side effect of the admin happening to save something.
  try { ensureClientPortalListeners(); } catch (e) {}
  try { runStaleClientNudgeCheck(); } catch (e) {}
  try { runReportOverdueNudgeCheck(); } catch (e) { console.error("Error in runReportOverdueNudgeCheck:", e); }
  try { runReengagementNudgeCheck(); } catch (e) { console.error("Error in runReengagementNudgeCheck:", e); }
  runRenewalNudgeCheck().catch(e => console.error("Error in runRenewalNudgeCheck:", e));
  runUpsellNudgeCheck().catch(e => console.error("Error in runUpsellNudgeCheck:", e));
  runProposalFollowupNudgeCheck().catch(e => console.error("Error in runProposalFollowupNudgeCheck:", e));
  runInsuranceRenewalNudgeCheck().catch(e => console.error("Error in runInsuranceRenewalNudgeCheck:", e));
  runSubscriptionRenewalNudgeCheck().catch(e => console.error("Error in runSubscriptionRenewalNudgeCheck:", e));
  runScopeCreepNudgeCheck().catch(e => console.error("Error in runScopeCreepNudgeCheck:", e));
  try { runStaleApprovalNudgeCheck(); } catch (e) { console.error("Error in runStaleApprovalNudgeCheck:", e); }
  try { runHeavyActionItemsNudgeCheck(); } catch (e) { console.error("Error in runHeavyActionItemsNudgeCheck:", e); }
  try { runStaleContactNudgeCheck(); } catch (e) { console.error("Error in runStaleContactNudgeCheck:", e); }

  // Toggle Sandbox Banner
  const sandboxName = "Quick Sandbox (One-Offs)";
  const banner = document.getElementById("sandboxBanner");
  if (banner) {
    if (activeClientName === sandboxName) {
      banner.style.display = "flex";
    } else {
      banner.style.display = "none";
    }
  }

  try {
    buildClientDropdown();
  } catch(e) { const hero = document.getElementById("dashHeroClientName"); if (hero) hero.textContent = "Error in buildClientDropdown: " + e.message; }
  
  try {
    renderDashboard();
  } catch(e) { const hero = document.getElementById("dashHeroClientName"); if (hero) hero.textContent = "Error in renderDashboard: " + e.message; }
  
  try {
    renderOnboardingChecklist();
  } catch(e) { const hero = document.getElementById("dashHeroClientName"); if (hero) hero.textContent = "Error in renderOnboardingChecklist: " + e.message; }
  
  try {
    renderBrandVault();
  } catch(e) { const hero = document.getElementById("dashHeroClientName"); if (hero) hero.textContent = "Error in renderBrandVault: " + e.message; }

  try { renderClientLastEditedNote(); } catch (e) {}

  // Mark all iframes as needing reload
  Object.keys(iframeNeedsReload).forEach(key => {
    iframeNeedsReload[key] = true;
  });

  // Get currently active tab
  const activeTabBtn = document.querySelector(".nav-item-btn.active");
  const activeTab = activeTabBtn ? activeTabBtn.getAttribute("data-tab") : "tab-dashboard";

  // Reload only if the active tab is an iframe-based tab
  if (iframeNeedsReload[activeTab] !== undefined) {
    refreshIframeTab(activeTab);
  }
}

// Generic HTML-escaping helper for core-level innerHTML templates (My
// Clients, the command palette, etc.) - root app.js didn't have one of
// its own before (every tool file has its own local copy; this is that
// same pattern's first use directly in the core).
function escapeHtmlCore(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ── Dashboard Overview Renderer ──

// "My Clients" - a filtered, cross-client view for whoever's logged in,
// instead of paging through the workspace switcher one client at a time.
// Matches clientsDb entries against window.currentAdminEmail via the same
// portalConfig.accountManagerEmail field Team Roster & Capacity's live
// caseload and Client Portal Manager's capacity warning already use (see
// getAccountManagerCapacitySnapshot) - no new data to maintain, just
// another view onto it. Lives directly in the core (like Overview
// Dashboard) rather than as an iframe tool, since it needs to scan every
// client in clientsDb at once, not just the active one.
//
// Returns the set of client names with a signed (active) contract in
// Contract & Invoice Tracker's agency/contractInvoices - used below to
// exclude already-signed clients from Sales Pipeline Value, since a
// proposal only counts as open pipeline if the deal hasn't closed yet.
//
// Renewal date lookups used to live in a sibling function here
// (fetchContractRenewalsByClientName) but were removed - Renewal
// Tracker's own client.renewal is the source of truth for "when does
// this client renew" (see runRenewalNudgeCheck and renderMyClients'
// renewalNote), not Contract & Invoice Tracker's contractRenewalDate,
// which was a second, independent field that wasn't guaranteed to agree
// with it.
async function fetchSignedClientNameSet() {
  const signed = new Set();
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseGetDoc) return signed;
  try {
    const ref = window.firebaseDoc(window.firebaseDb, "agency", "contractInvoices");
    const snap = await window.firebaseGetDoc(ref);
    const list = (snap.exists && snap.data().list) || [];
    list.forEach(r => { if (r.clientName && r.contractStatus === "Signed") signed.add(r.clientName); });
  } catch (e) {
    console.warn("Couldn't load signed-client list for Sales Pipeline Value:", e);
  }
  return signed;
}

// Agency-wide (unlike every other Overview Dashboard card, which is
// scoped to the active client): sums Proposal Calculator's
// computedMonthly across every client that isn't yet a signed contract.
// There was previously no way to see total open-proposal value without
// opening each client's Proposal Calculator one at a time and reading
// the on-screen total.
async function renderSalesPipelineValue() {
  const valueEl = document.getElementById("dashPipelineValue");
  const countEl = document.getElementById("dashPipelineCount");
  if (!valueEl) return;

  const signedNames = await fetchSignedClientNameSet();
  const sandboxName = "Quick Sandbox (One-Offs)";

  let total = 0, count = 0;
  Object.keys(clientsDb).forEach(name => {
    if (name === sandboxName || signedNames.has(name)) return;
    const proposal = clientsDb[name].proposal;
    const monthly = proposal && typeof proposal.computedMonthly === "number" ? proposal.computedMonthly : 0;
    if (monthly > 0) {
      total += monthly;
      count++;
    }
  });

  valueEl.textContent = "$" + Math.round(total).toLocaleString("en-US");
  if (countEl) countEl.textContent = count + (count === 1 ? " open proposal" : " open proposals");
}

// Same "days since" cadence as STALE_NUDGE_DAYS_THRESHOLD above - a board
// shared this recently isn't worth flagging as slow yet, clients don't
// always open a portal link the same day it's shared.
const MOODBOARD_AWAITING_DAYS_THRESHOLD = 7;

// Agency-wide, same reasoning as Sales Pipeline Value above: scans every
// client's shared mood boards for ones with no entry yet in
// moodBoardStyleFeedback (see mood-board-builder/js/app.js's saveBoard/
// toggleShare for how boards get shared, and portal/js/app.js's
// saveMoodBoardStyleFeedback for how a rating arrives). board.sharedAt is
// only set going forward (added alongside this card) - a board shared
// before that change has no sharedAt and so never counts toward the
// "waiting Nd" figure, only toward the plain awaiting-count.
function renderMoodBoardsAwaitingFeedback() {
  const valueEl = document.getElementById("dashMoodBoardsAwaitingVal");
  const descEl = document.getElementById("dashMoodBoardsAwaitingDesc");
  if (!valueEl) return;

  let awaitingCount = 0;
  let staleCount = 0;
  Object.values(clientsDb).forEach(client => {
    if (!client || !Array.isArray(client.moodBoards)) return;
    const feedbackMap = client.moodBoardStyleFeedback || {};
    client.moodBoards.forEach(board => {
      if (!board.sharedWithClient || feedbackMap[board.id]) return;
      awaitingCount++;
      const days = board.sharedAt ? Math.floor((Date.now() - new Date(board.sharedAt).getTime()) / 86400000) : null;
      if (days !== null && days >= MOODBOARD_AWAITING_DAYS_THRESHOLD) staleCount++;
    });
  });

  valueEl.textContent = String(awaitingCount);
  if (descEl) {
    if (awaitingCount === 0) {
      descEl.textContent = "all shared boards rated";
    } else if (staleCount > 0) {
      descEl.textContent = `${staleCount} waiting ${MOODBOARD_AWAITING_DAYS_THRESHOLD}+ days`;
    } else {
      descEl.textContent = awaitingCount === 1 ? "board shared, no rating yet" : "boards shared, no rating yet";
    }
  }
}

// Matches Client Intake Pre-Qualifier's leadSource <select> options
// (intake-prequalifier/index.html) - kept here rather than imported
// across the iframe boundary, same "each caller stays self-contained"
// convention as parsePhaseAmountToNumber above.
const LEAD_SOURCE_LABELS = {
  referral: "Referral",
  cold_outreach: "Cold Outreach",
  website: "Website",
  social_media: "Social Media",
  networking: "Networking",
  partner: "Partner",
  other: "Other"
};

// Lead Source ROI: closes a loop nothing previously connected. Client
// Intake Pre-Qualifier already captures leadSource per client
// (client.intakeQualifier.data.leadSource - only set for clients who
// actually went through that tool, so clients onboarded without it
// simply don't contribute a source rather than counting as
// unattributed noise), and Contract & Invoice Tracker already knows
// who's Signed with a real invoiceAmount (same "paying, not just
// signed at $0" filter as renderPhase2Preview's parsePhaseAmountToNumber
// use). Shows win rate + attributed MRR per source so it's visible
// which channels are actually worth the effort.
async function renderLeadSourceRoi() {
  const el = document.getElementById("leadSourceRoiList");
  if (!el) return;

  const sandboxName = "Quick Sandbox (One-Offs)";
  const bySource = {};
  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client || name === sandboxName) return;
    const source = client.intakeQualifier && client.intakeQualifier.data && client.intakeQualifier.data.leadSource;
    if (!source) return;
    if (!bySource[source]) bySource[source] = { total: 0, names: [] };
    bySource[source].total++;
    bySource[source].names.push(name);
  });

  if (Object.keys(bySource).length === 0) {
    el.innerHTML = `<div style="color: var(--color-text-muted);">No lead source data yet - run new prospects through the Client Intake Pre-Qualifier to start tracking this.</div>`;
    return;
  }

  let revenueByName = {};
  if (window.firebaseDb && window.firebaseDb.collection) {
    try {
      const snap = await window.firebaseDb.collection("agency").doc("contractInvoices").get();
      const list = (snap.exists && snap.data().list) || [];
      list.forEach(r => {
        if (r.contractStatus !== 'Signed') return;
        const amt = parsePhaseAmountToNumber(r.invoiceAmount);
        if (amt > 0) revenueByName[r.clientName] = amt;
      });
    } catch (e) {
      console.warn("Couldn't load contract data for Lead Source ROI:", e);
    }
  }

  const rows = Object.entries(bySource).map(([source, data]) => {
    const won = data.names.filter(name => Object.prototype.hasOwnProperty.call(revenueByName, name));
    const revenue = won.reduce((sum, name) => sum + revenueByName[name], 0);
    return { label: LEAD_SOURCE_LABELS[source] || source, total: data.total, wonCount: won.length, revenue };
  }).sort((a, b) => b.revenue - a.revenue || b.wonCount - a.wonCount);

  el.innerHTML = rows.map(r => {
    const pct = r.total > 0 ? Math.round((r.wonCount / r.total) * 100) : 0;
    return `
      <div style="padding:4px 0; display:flex; justify-content:space-between; gap:10px; align-items:baseline; border-bottom:1px solid var(--border-color, rgba(255,255,255,0.06));">
        <span><strong>${escapeHtmlCore(r.label)}</strong> &middot; ${r.wonCount}/${r.total} signed (${pct}%)</span>
        <span style="color:var(--color-text-muted); font-size:0.78rem; white-space:nowrap;">${r.revenue > 0 ? '$' + r.revenue.toLocaleString() + '/mo' : '--'}</span>
      </div>
    `;
  }).join("");
}

// Needs Attention: consolidates three signals that already exist as
// separate mechanisms elsewhere - runStaleClientNudgeCheck's stale-portal
// check, runRenewalNudgeCheck's upcoming-renewal check, and
// renderMoodBoardsAwaitingFeedback's per-board threshold - into one
// glanceable agency-wide list instead of three separate places to check.
// Deliberately reads clientsDb directly rather than adminNotifications:
// the bell's nudge history is cooldown-gated (STALE_NUDGE_COOLDOWN_MS /
// RENEWAL_NUDGE_COOLDOWN_MS - so it won't re-show something you were
// already pinged about recently), but this card answers "what's
// outstanding right now", so it should always reflect current state
// regardless of nudge cooldowns. Thresholds/constants (STALE_NUDGE_
// DAYS_THRESHOLD, RENEWAL_NUDGE_DAYS_THRESHOLD, MOODBOARD_AWAITING_
// DAYS_THRESHOLD) are shared with those existing checks further down
// this file - referencing them here rather than duplicating the numbers
// keeps this card in lockstep with whatever those nudges consider
// "worth flagging".
async function renderNeedsAttention() {
  const el = document.getElementById("needsAttentionList");
  if (!el) return;

  const now = Date.now();
  const sandboxName = "Quick Sandbox (One-Offs)";
  const items = [];

  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client || name === sandboxName) return;

    if (client.portalConfig && client.portalConfig.magicToken) {
      // Same signal as runStaleClientNudgeCheck.
      const pendingCount = Array.isArray(client.pendingApprovals) ? client.pendingApprovals.length : 0;
      if (pendingCount > 0) {
        const lastVisited = client.portalLastVisitedAt ? new Date(client.portalLastVisitedAt).getTime() : null;
        const daysSinceVisit = lastVisited ? Math.floor((now - lastVisited) / 86400000) : null;
        if (daysSinceVisit === null || daysSinceVisit >= STALE_NUDGE_DAYS_THRESHOLD) {
          const visitPhrase = daysSinceVisit === null ? "never opened portal" : `no portal visit in ${daysSinceVisit}d`;
          const approvalPhrase = pendingCount === 1 ? "1 approval" : `${pendingCount} approvals`;
          items.push({ name, urgency: daysSinceVisit === null ? 9999 : 1000 + daysSinceVisit, message: `${approvalPhrase} waiting, ${visitPhrase}` });
        }
      }

      // Same signal as runRenewalNudgeCheck.
      const rec = client.renewal;
      if (rec && rec.renewalDate && (rec.status === 'On Track' || rec.status === 'At Risk')) {
        const days = Math.round((new Date(rec.renewalDate) - new Date(new Date().toDateString())) / 86400000);
        if (!Number.isNaN(days) && days <= RENEWAL_NUDGE_DAYS_THRESHOLD) {
          const phrase = days < 0 ? `renewal overdue by ${Math.abs(days)}d` : days === 0 ? "renews today" : `renews in ${days}d`;
          items.push({ name, urgency: days < 0 ? 2000 + Math.abs(days) : (RENEWAL_NUDGE_DAYS_THRESHOLD - days), message: phrase });
        }
      }

      // Same signal as runStaleApprovalNudgeCheck - distinct from the
      // portal-visit-based check above, this keys off the approval's own
      // age (a client can visit regularly and still leave one sitting).
      const pendingApprovals = Array.isArray(client.pendingApprovals) ? client.pendingApprovals : [];
      const approvalAges = pendingApprovals.filter(a => a && a.createdAt).map(a => Math.floor((now - new Date(a.createdAt).getTime()) / 86400000));
      const oldestApprovalDays = approvalAges.length ? Math.max(...approvalAges) : null;
      if (oldestApprovalDays !== null && oldestApprovalDays >= STALE_APPROVAL_NUDGE_DAYS_THRESHOLD) {
        items.push({ name, urgency: 600 + oldestApprovalDays, message: `an approval has been sitting for ${oldestApprovalDays}d` });
      }
    }

    // Same per-board threshold as renderMoodBoardsAwaitingFeedback, rolled
    // up per client here instead of as a single agency-wide count.
    if (Array.isArray(client.moodBoards)) {
      const feedbackMap = client.moodBoardStyleFeedback || {};
      let staleBoards = 0;
      let oldestDays = 0;
      client.moodBoards.forEach(board => {
        if (!board.sharedWithClient || feedbackMap[board.id]) return;
        const days = board.sharedAt ? Math.floor((now - new Date(board.sharedAt).getTime()) / 86400000) : null;
        if (days !== null && days >= MOODBOARD_AWAITING_DAYS_THRESHOLD) {
          staleBoards++;
          oldestDays = Math.max(oldestDays, days);
        }
      });
      if (staleBoards > 0) {
        const boardPhrase = staleBoards === 1 ? "1 mood board" : `${staleBoards} mood boards`;
        items.push({ name, urgency: oldestDays, message: `${boardPhrase} awaiting feedback ${oldestDays}+ days` });
      }
    }

    // Latest health rating, shared by the Red-health row and the upsell
    // check right below - same "checkins[0] is most recent" convention as
    // Agency Health Dashboard's buildRows.
    const checkins = Array.isArray(client.weeklyCheckins) ? client.weeklyCheckins : [];
    const healthRating = checkins.length ? checkins[0].healthRating : null;

    // Same current-state signal as Agency Health Dashboard's needsAttention
    // (healthRating === 'Red' is the first condition there) and the
    // health_red_flip nudge in weekly-account-checkin - but this is a
    // persistent "is it Red right now" check rather than a one-time flip
    // event, so a lingering Red client keeps showing here even if the flip
    // itself happened days ago and its nudge already cooled down.
    if (healthRating === 'Red') {
      items.push({ name, urgency: 700, message: "health check-in is Red", goTab: 'tab-weeklycheckin' });
    }

    // Same overspending+healthy signal as Agency Health Dashboard's
    // upsellOpportunity / runUpsellNudgeCheck - not a risk to flag urgently,
    // just a heads-up worth a bigger-retainer conversation, so a flat
    // mid-range urgency rather than a days-based one.
    if (isOverBudgetPace(client.budgetPacing) && healthRating !== 'Red') {
      items.push({ name, urgency: 40, message: "pacing over budget - possible upsell opportunity" });
    }

    // Same two signals as runHeavyActionItemsNudgeCheck / runStaleContactNudgeCheck
    // below, and Agency Health Dashboard's heavyOpenActionItems/staleContact
    // badges - both read client.meetingNotes directly, not gated by
    // portalConfig since Meeting Notes Logger isn't portal-dependent.
    const meetingNotes = Array.isArray(client.meetingNotes) ? client.meetingNotes : [];
    const openActionItems = meetingNotes.reduce((sum, m) =>
      sum + (Array.isArray(m.actionItems) ? m.actionItems.filter(ai => !ai.completed).length : 0), 0);
    if (openActionItems >= HEAVY_ACTION_ITEMS_THRESHOLD) {
      items.push({ name, urgency: 500 + openActionItems, message: `${openActionItems} open action items across meeting notes`, goTab: 'tab-meetingnotes' });
    }

    // A client with zero meeting notes ever logged is deliberately NOT
    // flagged here - same reasoning as Agency Health Dashboard's own
    // staleContact (a quiet, report-only retainer might genuinely have
    // none and be perfectly healthy). Only a client who WAS being logged
    // and then went quiet counts.
    if (meetingNotes.length > 0) {
      const lastMeetingDate = meetingNotes.map(m => m.date).filter(Boolean).sort().slice(-1)[0];
      if (lastMeetingDate) {
        const daysSinceMeeting = Math.floor((now - new Date(lastMeetingDate).getTime()) / 86400000);
        if (daysSinceMeeting >= STALE_CONTACT_NUDGE_DAYS_THRESHOLD) {
          items.push({ name, urgency: 300 + daysSinceMeeting, message: `no meeting logged in ${daysSinceMeeting}d`, goTab: 'tab-meetingnotes' });
        }
      }
    }
  });

  // Overdue proposal follow-ups: same signal as
  // runProposalFollowupNudgeCheck. A separate agency doc (not on
  // clientsDb), so fetched here rather than inside the loop above -
  // matches renderPhase2Preview's contractInvoices fetch pattern.
  if (window.firebaseDb && window.firebaseDb.collection) {
    try {
      const snap = await window.firebaseDb.collection("agency").doc("proposalFollowUps").get();
      const list = (snap.exists && snap.data().list) || [];
      const today = new Date().toDateString();
      list.forEach(p => {
        if (p.status !== 'open' || !p.nextFollowUpDate || !p.prospectName) return;
        const daysOverdue = Math.round((new Date(today) - new Date(p.nextFollowUpDate)) / 86400000);
        if (daysOverdue < 1) return;
        items.push({ name: p.prospectName, urgency: 1800 + daysOverdue, message: `proposal follow-up ${daysOverdue}d overdue (${p.followUpStage || 'no stage set'})` });
      });
    } catch (e) {
      console.warn("Couldn't load proposal follow-ups for Needs Attention:", e);
    }
  }

  // Scope creep: same signal as runScopeCreepNudgeCheck - a client with
  // SCOPE_CREEP_OPEN_REVISIONS_THRESHOLD+ open revisions (matching Agency
  // Health Dashboard's heavyRevisions bar) and no Pending/Approved change
  // order already covering them. goTab sends this row straight to Change
  // Order Generator instead of the dashboard, since that's the actual next
  // action - see the goTab handling in the click wiring below.
  if (window.firebaseDb && window.firebaseDb.collection) {
    try {
      const [revSnap, coSnap] = await Promise.all([
        window.firebaseDb.collection("agency").doc("revisionFeedbackLog").get(),
        window.firebaseDb.collection("agency").doc("changeOrders").get()
      ]);
      const revisions = (revSnap.exists && revSnap.data().list) || [];
      const changeOrders = (coSnap.exists && coSnap.data().list) || [];

      const openByClient = {};
      revisions.forEach(r => {
        if (!r.clientName || r.dateResolved) return;
        if (!openByClient[r.clientName]) openByClient[r.clientName] = [];
        openByClient[r.clientName].push(r);
      });

      Object.entries(openByClient).forEach(([clientName, openRows]) => {
        if (openRows.length < SCOPE_CREEP_OPEN_REVISIONS_THRESHOLD) return;

        const oldestRequestDate = openRows.map(r => r.dateRequested).filter(Boolean).sort()[0];
        const alreadyCovered = changeOrders.some(co =>
          co.clientName === clientName &&
          (co.status === 'Pending' || co.status === 'Approved') &&
          (!oldestRequestDate || !co.dateCreated || co.dateCreated >= oldestRequestDate)
        );
        if (alreadyCovered) return;

        items.push({
          name: clientName,
          urgency: 900 + openRows.length,
          message: `${openRows.length} open revisions, no change order in motion`,
          goTab: 'tab-changeorder'
        });
      });
    } catch (e) {
      console.warn("Couldn't load revisions/change orders for Needs Attention:", e);
    }
  }

  if (items.length === 0) {
    el.innerHTML = `<div style="color: var(--color-text-muted);">Nothing needs attention right now.</div>`;
    return;
  }

  items.sort((a, b) => b.urgency - a.urgency);

  el.innerHTML = items.map(item => `
    <div class="needs-attention-row" data-client="${escapeHtmlCore(item.name)}" data-go-tab="${escapeHtmlCore(item.goTab || 'tab-dashboard')}" style="padding:5px 0; cursor:pointer; display:flex; justify-content:space-between; gap:10px; align-items:baseline; border-bottom:1px solid var(--border-color, rgba(255,255,255,0.06));">
      <span><strong>${escapeHtmlCore(item.name)}</strong> &middot; ${escapeHtmlCore(item.message)}</span>
      <span style="color:var(--color-text-muted); font-size:0.72rem; white-space:nowrap;">Open &rarr;</span>
    </div>
  `).join("");

  el.querySelectorAll(".needs-attention-row").forEach(row => {
    row.addEventListener("click", () => {
      switchClient(row.getAttribute("data-client"));
      navigateToTab(row.getAttribute("data-go-tab") || "tab-dashboard");
    });
  });
}

// Tracks Phase 1 ("Prove It") of reference-docs/business_phase_roadmap.pdf
// against its own exit trigger wording: "1-2 polished case studies with
// testimonials, plus a real Portfolio Showcase PDF ready to hand to a
// prospect." Deliberately NOT a literal checklist of that doc's numbered
// tasks (those name specific clients by name and will drift as the roadmap
// gets updated) - this tracks the same underlying signal in a way that
// keeps working regardless of which clients are active. Re-check this
// card's target/copy once the agency is actually through Phase 1; it's
// written for where the business is today, not built to auto-advance
// itself into Phase 2/3/4.
const PHASE1_CASE_STUDY_TARGET = 2;

// "Polished" mirrors the roadmap's own phrasing - not just cs.featured
// (Portfolio Showcase's own "include in PDF" flag, a separate concern),
// but actually having challenge/solution/results/testimonial content
// filled in, since a case study flagged featured with empty fields isn't
// what the roadmap means by done.
function isPolishedCaseStudy(cs) {
  return !!(cs && cs.challenge && cs.solution && cs.results && cs.testimonial);
}

async function renderPhaseProgress() {
  const valueEl = document.getElementById("dashPhaseVal");
  const descEl = document.getElementById("dashPhaseDesc");
  const fillEl = document.getElementById("dashPhaseProgressFill");
  const breakdownEl = document.getElementById("dashPhaseBreakdown");
  if (!valueEl) return;

  let polishedCount = 0;
  let testimonialCount = 0;
  Object.values(clientsDb).forEach(client => {
    if (!client) return;
    (client.caseStudies || []).forEach(cs => {
      if (isPolishedCaseStudy(cs)) polishedCount++;
    });
    if (client.testimonialSubmission && client.testimonialSubmission.quote) testimonialCount++;
  });

  let servicesPricedCount = 0;
  let portfolioInfo = null;
  if (window.firebaseDb && window.firebaseDb.collection) {
    try {
      const pricingSnap = await window.firebaseDb.collection("agency").doc("servicePricing").get();
      const prices = (pricingSnap.exists && pricingSnap.data().prices) || {};
      servicesPricedCount = Object.keys(prices).length;
    } catch (e) {
      console.warn("Couldn't load service pricing for Phase 1 Progress:", e);
    }
    try {
      const portfolioSnap = await window.firebaseDb.collection("agency").doc("portfolioShowcase").get();
      portfolioInfo = portfolioSnap.exists ? portfolioSnap.data() : null;
    } catch (e) {
      console.warn("Couldn't load portfolio showcase status for Phase 1 Progress:", e);
    }
  }

  valueEl.textContent = `${Math.min(polishedCount, PHASE1_CASE_STUDY_TARGET)}/${PHASE1_CASE_STUDY_TARGET}`;
  if (descEl) {
    descEl.textContent = polishedCount >= PHASE1_CASE_STUDY_TARGET
      ? "polished case studies ready"
      : "polished case studies (challenge/solution/results/testimonial all filled in)";
  }
  if (fillEl) {
    fillEl.style.width = `${Math.min(100, Math.round((polishedCount / PHASE1_CASE_STUDY_TARGET) * 100))}%`;
  }

  if (breakdownEl) {
    const pdfLine = portfolioInfo && portfolioInfo.lastGeneratedAt
      ? `Portfolio Showcase PDF generated ${new Date(portfolioInfo.lastGeneratedAt).toLocaleDateString()}`
      : "Portfolio Showcase PDF not generated yet";
    breakdownEl.innerHTML = `
      <div>${testimonialCount} client${testimonialCount === 1 ? "" : "s"} with a submitted testimonial</div>
      <div>${pdfLine}</div>
      <div>${servicesPricedCount} service${servicesPricedCount === 1 ? "" : "s"} priced in Service Pricing Admin</div>
    `;
  }
}

// Phase 2 ("First Paid Clients") exit trigger is "first 2-3 paying
// marketing clients signed" - upper bound (3) used as the target, same
// convention as Phase 1's target using the upper bound of "1-2". This is
// a PREVIEW shown alongside Phase 1 Progress, not an active tracker -
// Phase 2 doesn't start until Phase 1's exit trigger is actually met, but
// showing it early means a heads-up before you're already there instead
// of only describing where you are once it's true.
const PHASE2_SIGNED_CLIENT_TARGET = 3;

// Local copy of contract-invoice-tracker/js/app.js's parseAmountToNumber -
// each tool's js/app.js stays self-contained in this codebase (nothing
// shared/imported between them), so this is duplicated rather than
// referenced across the iframe boundary.
function parsePhaseAmountToNumber(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

async function renderPhase2Preview() {
  const valueEl = document.getElementById("dashPhase2Val");
  const descEl = document.getElementById("dashPhase2Desc");
  const fillEl = document.getElementById("dashPhase2ProgressFill");
  if (!valueEl) return;

  let payingCount = 0;
  if (window.firebaseDb && window.firebaseDb.collection) {
    try {
      const snap = await window.firebaseDb.collection("agency").doc("contractInvoices").get();
      const list = (snap.exists && snap.data().list) || [];
      const sandboxName = "Quick Sandbox (One-Offs)";
      const payingClientNames = new Set();
      list.forEach(r => {
        if (!r.clientName || r.clientName === sandboxName) return;
        // Signed alone isn't enough - a contract can be signed at $0 for
        // free/portfolio-building work (exactly what Phase 1 itself is),
        // and that's not what Phase 2's "paying" clients means.
        if (r.contractStatus !== "Signed") return;
        if (parsePhaseAmountToNumber(r.invoiceAmount) <= 0) return;
        payingClientNames.add(r.clientName);
      });
      payingCount = payingClientNames.size;
    } catch (e) {
      console.warn("Couldn't load contract data for Phase 2 preview:", e);
    }
  }

  valueEl.textContent = `${Math.min(payingCount, PHASE2_SIGNED_CLIENT_TARGET)}/${PHASE2_SIGNED_CLIENT_TARGET}`;
  if (descEl) {
    descEl.textContent = payingCount >= PHASE2_SIGNED_CLIENT_TARGET
      ? "paying clients signed"
      : "paying clients signed (Signed status + a real invoice amount)";
  }
  if (fillEl) {
    fillEl.style.width = `${Math.min(100, Math.round((payingCount / PHASE2_SIGNED_CLIENT_TARGET) * 100))}%`;
  }
}

// Same doc as fetchContractRenewalsByClientName, different signal: which
// clients currently have an overdue invoice. Kept separate rather than
// merged into that function's return shape, since runRenewalNudgeCheck
// already depends on that one's exact shape and this is a distinct,
// independent use (My Clients' "needs attention" signals below).
async function fetchOverdueInvoiceAmountsByClientName() {
  const byName = {};
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseGetDoc) return byName;
  try {
    const ref = window.firebaseDoc(window.firebaseDb, "agency", "contractInvoices");
    const snap = await window.firebaseGetDoc(ref);
    const list = (snap.exists && snap.data().list) || [];
    list.forEach(r => {
      if (r.clientName && r.invoiceStatus === "Overdue") {
        byName[r.clientName] = r.invoiceAmount || "";
      }
    });
  } catch (e) {
    console.warn("Couldn't load overdue invoice info for My Clients:", e);
  }
  return byName;
}

async function renderMyClients() {
  const listEl = document.getElementById("myClientsList");
  const emptyEl = document.getElementById("myClientsEmpty");
  if (!listEl) return;

  const myEmail = (window.currentAdminEmail || "").trim().toLowerCase();
  const sandboxName = "Quick Sandbox (One-Offs)";

  const mine = Object.keys(clientsDb)
    .filter(name => name !== sandboxName)
    .map(name => clientsDb[name])
    .filter(c => c && myEmail && c.portalConfig && (c.portalConfig.accountManagerEmail || "").trim().toLowerCase() === myEmail)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  if (emptyEl) emptyEl.style.display = mine.length === 0 ? "block" : "none";
  if (mine.length === 0) {
    listEl.innerHTML = "";
    return;
  }

  const overdueByName = await fetchOverdueInvoiceAmountsByClientName();

  listEl.innerHTML = mine.map(c => {
    const checklist = Array.isArray(c.onboardingChecklist) ? c.onboardingChecklist : [];
    let total = 0, checked = 0;
    checklist.forEach(cat => (cat.items || []).forEach(item => {
      total++;
      if (item.checked) checked++;
    }));
    const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
    const pendingApprovals = Array.isArray(c.pendingApprovals) ? c.pendingApprovals.length : 0;
    const stage = (c.portalConfig && c.portalConfig.engagementStage) || "onboarding";

    // Renewal Tracker (client.renewal) is the source of truth for "when
    // does this client renew" - not Contract & Invoice Tracker's
    // contractRenewalDate, which used to drive this note and could
    // silently disagree with whatever Renewal Tracker's own status/date
    // said. Only an open (On Track/At Risk) tracked renewal counts here.
    let renewalNote = "";
    const renewalRec = c.renewal;
    if (renewalRec && renewalRec.renewalDate && (renewalRec.status === 'On Track' || renewalRec.status === 'At Risk')) {
      const days = Math.round((new Date(renewalRec.renewalDate) - new Date(new Date().toDateString())) / 86400000);
      if (!Number.isNaN(days) && days <= 30) {
        renewalNote = days < 0
          ? ` &middot; <span style="color:#ef4444;">renewal overdue</span>`
          : ` &middot; <span style="color:#f68d5f;">renews in ${days}d</span>`;
      }
    }

    let overdueNote = "";
    if (Object.prototype.hasOwnProperty.call(overdueByName, c.name)) {
      const amt = overdueByName[c.name];
      overdueNote = ` &middot; <span style="color:#ef4444;">invoice overdue${amt ? ` (${escapeHtmlCore(String(amt))})` : ''}</span>`;
    }

    return `
      <div class="step-card" style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; padding:16px 20px;">
        <div>
          <div style="font-weight:600; font-size:1rem;">${escapeHtmlCore(c.name)}</div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">
            Onboarding ${pct}% complete${pendingApprovals > 0 ? ` &middot; <span style="color:#f68d5f;">${pendingApprovals} approval${pendingApprovals === 1 ? '' : 's'} waiting</span>` : ''}${renewalNote}${overdueNote}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:0.72rem; text-transform:capitalize; background:rgba(99,102,241,0.15); color:#6366f1; padding:3px 10px; border-radius:20px; white-space:nowrap;">${escapeHtmlCore(stage)}</span>
          <button type="button" class="btn btn-secondary my-clients-open-btn" data-client="${escapeHtmlCore(c.name)}" style="padding:6px 14px; font-size:0.8rem;">Open</button>
        </div>
      </div>`;
  }).join("");

  listEl.querySelectorAll(".my-clients-open-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      switchClient(btn.getAttribute("data-client"));
      navigateToTab("tab-dashboard");
    });
  });
}

function renderDashboard() {
  const client = getActiveClient();
  if (!client) return;

  // Active client summary details
  const hero = document.getElementById("dashHeroClientName"); if (hero) hero.textContent = client.name;
  const heroUrl = document.getElementById("dashHeroTargetUrl"); if (heroUrl) heroUrl.textContent = client.targetUrl || "No website logged yet";
  const heroDate = document.getElementById("dashHeroCreatedDate"); if (heroDate) heroDate.textContent = client.createdDate || "N/A";

  const dashClickupUrl = document.getElementById("dashClickupUrl");
  const dashClickupBtn = document.getElementById("dashClickupBtn");
  if (dashClickupUrl && dashClickupBtn) {
    dashClickupUrl.value = client.clickupUrl || "";
    if (client.clickupUrl) {
      dashClickupBtn.href = client.clickupUrl;
      dashClickupBtn.style.display = "flex";
    } else {
      dashClickupBtn.style.display = "none";
    }
  }

  // Client Health — pulled from the latest Weekly Account Check-In, if any
  const healthVal = document.getElementById("dashHealthVal");
  const healthDesc = document.getElementById("dashHealthDesc");
  const healthProgress = document.getElementById("dashHealthProgress");
  if (healthVal && healthDesc && healthProgress) {
    const checkins = Array.isArray(client.weeklyCheckins) ? client.weeklyCheckins : [];
    const latest = checkins.length ? checkins[0] : null; // already kept newest-first
    if (latest && latest.healthRating) {
      const colors = { Green: "#22c55e", Yellow: "#eab308", Red: "#ef4444" };
      const color = colors[latest.healthRating] || "var(--color-text-secondary)";
      healthVal.textContent = latest.healthRating;
      healthVal.style.color = color;
      healthDesc.textContent = `Week of ${latest.date}${latest.q1_responsive ? ' — client ' + latest.q1_responsive.toLowerCase() : ''}`;
      healthProgress.style.width = "100%";
      healthProgress.style.background = color;
    } else {
      healthVal.textContent = "No check-in yet";
      healthVal.style.color = "";
      healthDesc.textContent = "Run a Weekly Account Check-In to populate this";
      healthProgress.style.width = "0%";
      healthProgress.style.background = "";
    }
  }

  // Calculate Onboarding completion %
  let totalOb = 0;
  let checkedOb = 0;
  if (client.onboardingChecklist && Array.isArray(client.onboardingChecklist)) {
    client.onboardingChecklist.forEach(cat => {
      if (cat.items && Array.isArray(cat.items)) {
        cat.items.forEach(item => {
          totalOb++;
          if (item.checked) checkedOb++;
        });
      }
    });
  }
  const obPct = totalOb > 0 ? Math.round((checkedOb / totalOb) * 100) : 0;
  document.getElementById("dashOnboardingVal").textContent = `${obPct}%`;
  document.getElementById("dashOnboardingProgress").style.width = `${obPct}%`;

  // Calculate UX/UI Checklist progress (40 items total)
  let totalUx = 40;
  let checkedUx = 0;
  if (client.uxuiAudit && client.uxuiAudit.checked) {
    Object.keys(client.uxuiAudit.checked).forEach(k => {
      if (client.uxuiAudit.checked[k]) {
        checkedUx++;
      }
    });
  }
  const uxPct = Math.round((checkedUx / totalUx) * 100);
  const uxGrade = calculateUxuiLetterGrade(uxPct);
  document.getElementById("dashUxuiVal").textContent = `${uxPct}% (${uxGrade})`;
  document.getElementById("dashUxuiProgress").style.width = `${uxPct}%`;

  // Calculate SEO checklist checked % (23 items total)
  const seoTotal = 23;
  let seoFilled = 0;
  if (client.seoAudit && client.seoAudit.checked) {
    Object.keys(client.seoAudit.checked).forEach(k => {
      if (client.seoAudit.checked[k]) {
        seoFilled++;
      }
    });
  }
  const seoPct = seoTotal > 0 ? Math.round((seoFilled / seoTotal) * 100) : 0;
  document.getElementById("dashSeoVal").textContent = `${seoPct}%`;
  document.getElementById("dashSeoProgress").style.width = `${seoPct}%`;
  

  // Calculate Campaign Launch Checklist
  let totalCampaignLaunch = 23; // 23 items total
  let checkedCampaignLaunch = 0;
  if (client.campaignLaunch && client.campaignLaunch.checked) {
    Object.keys(client.campaignLaunch.checked).forEach(k => {
      if (client.campaignLaunch.checked[k]) {
        checkedCampaignLaunch++;
      }
    });
  }
  const campaignLaunchPct = Math.round((checkedCampaignLaunch / totalCampaignLaunch) * 100);
  document.getElementById("dashCampaignLaunchVal").textContent = `${campaignLaunchPct}%`;
  document.getElementById("dashCampaignLaunchProgress").style.width = `${campaignLaunchPct}%`;

  // Calculate Paid Ads Audit (16 items total)
  const paTotal = 16;
  let paFilled = 0;
  if (client.paidAdsAudit && client.paidAdsAudit.checked) {
    Object.keys(client.paidAdsAudit.checked).forEach(k => {
      if (client.paidAdsAudit.checked[k]) {
        paFilled++;
      }
    });
  }
  const dashPaAuditFill = document.getElementById('dashPaidAdsProgress');
  const dashPaidAdsVal = document.getElementById('dashPaidAdsVal');
  if (dashPaAuditFill && dashPaidAdsVal) {
    const paPct = paTotal > 0 ? Math.round((paFilled / paTotal) * 100) : 0;
    dashPaAuditFill.style.width = paPct + '%';
    dashPaidAdsVal.textContent = paPct + '%';
  }

  // Calculate Email Audit (16 items total)
  const emTotal = 16;
  let emFilled = 0;
  if (client.emailAudit && client.emailAudit.checked) {
    Object.keys(client.emailAudit.checked).forEach(k => {
      if (client.emailAudit.checked[k]) {
        emFilled++;
      }
    });
  }
  const dashEmailAuditFill = document.getElementById('dashEmailStrategyProgress');
  const dashEmailAuditVal = document.getElementById('dashEmailStrategyVal');
  if (dashEmailAuditFill && dashEmailAuditVal) {
    const emPct = emTotal > 0 ? Math.round((emFilled / emTotal) * 100) : 0;
    dashEmailAuditFill.style.width = emPct + '%';
    dashEmailAuditVal.textContent = emPct + '%';
  }
  // Calculate Content Audit (42 items total)
  const caTotal = 42;
  let caFilled = 0;
  if (client.contentAudit && client.contentAudit.checked) {
    Object.keys(client.contentAudit.checked).forEach(k => {
      if (client.contentAudit.checked[k]) {
        caFilled++;
      }
    });
  }
  const dashContentAuditFill = document.getElementById('dashContentAuditProgress');
  const dashContentAuditVal = document.getElementById('dashContentAuditVal');
  if (dashContentAuditFill && dashContentAuditVal) {
    const caPct = caTotal > 0 ? Math.round((caFilled / caTotal) * 100) : 0;
    dashContentAuditFill.style.width = caPct + '%';
    dashContentAuditVal.textContent = caPct + '%';
  }


  // Calculate Content Strategy checklist progress (40 items total)
  let totalStrategy = 40;
  let checkedStrategy = 0;
  if (client.contentStrategy && client.contentStrategy.checked) {
    Object.keys(client.contentStrategy.checked).forEach(k => {
      if (client.contentStrategy.checked[k]) {
        checkedStrategy++;
      }
    });
  }
  const strategyPct = Math.round((checkedStrategy / totalStrategy) * 100);
  document.getElementById("dashStrategyVal").textContent = `${strategyPct}%`;
  document.getElementById("dashStrategyProgress").style.width = `${strategyPct}%`;

  // Calculate Strategy Builder progress (56 + 3 * N fields total)
  let strategyBuilderPct = 0;
  if (client.strategyBuilder && client.strategyBuilder.data) {
    const data = client.strategyBuilder.data;
    const platforms = Array.isArray(data.platforms) ? data.platforms : [];
    let totalFields = 56 + (platforms.length * 3);
    let filledFields = 0;

    const textKeys = [
      'businessName', 'industry', 'primaryServices', 'brandMission', 'brandVision', 'coreValues', 'usp',
      'goalsShortTerm', 'goalsLongTerm', 'marketingChallenges',
      'audienceAge', 'audienceLocation', 'audienceIndustry', 'audienceIncome', 'audiencePainPoints', 'audienceDesires', 'audienceBuyingBehavior',
      'brandVoice', 'brandColors', 'brandVisuals',
      'mainCompetitors', 'competitorStrengths', 'competitorDifferentiate', 'brandsAdmire',
      'pillar1Name', 'pillar1Topics', 'pillar2Name', 'pillar2Topics', 'pillar3Name', 'pillar3Topics', 'pillar4Name', 'pillar4Topics',
      'ideasEducational', 'ideasPromotional', 'ideasSocialProof', 'ideasViral', 'ideasBehindScenes',
      'kpisBenchmarks', 'commContact', 'commRevisions', 'commTimeline',
      'finalFocus', 'notesSection'
    ];
    const checkboxKeys = [
      'primaryGoals', 'brandPersonality', 'existingAssets', 'primaryContentGoals',
      'workflowPre', 'workflowProd', 'workflowPost', 'workflowPub',
      'kpisMetrics', 'kpisFrequency', 'commMethods', 'nextSteps'
    ];

    textKeys.forEach(key => {
      const val = data[key];
      if (val && typeof val === 'string' && val.trim() !== '') filledFields++;
    });

    checkboxKeys.forEach(key => {
      const arr = data[key];
      if (arr && Array.isArray(arr) && arr.length > 0) filledFields++;
    });

    const a1 = data['action1'] || '';
    const a2 = data['action2'] || '';
    const a3 = data['action3'] || '';
    const a4 = data['action4'] || '';
    if (a1.trim() !== '' || a2.trim() !== '' || a3.trim() !== '' || a4.trim() !== '') {
      filledFields++;
    }

    // Dynamic platforms check (3 fields per platform)
    platforms.forEach(p => {
      if (p.purpose && p.purpose.trim() !== '') filledFields++;
      if (p.frequency && p.frequency.trim() !== '') filledFields++;
      if (p.contentTypes && Array.isArray(p.contentTypes) && p.contentTypes.length > 0) filledFields++;
    });

    strategyBuilderPct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
  }
  document.getElementById("dashStrategyBuilderVal").textContent = `${strategyBuilderPct}%`;
  document.getElementById("dashStrategyBuilderProgress").style.width = `${strategyBuilderPct}%`;


  // Calculate Personal Branding Builder progress (approx 29 fields total)
  let personalBrandPct = 0;
  if (client.personalBranding && client.personalBranding.data) {
    let filledPbFields = 0;
    let totalPbFields = 0;
    
    // Simplistic check: count all string properties that are not empty.
    // "platforms" is deliberately skipped here and counted separately below,
    // because the builder auto-seeds a default (empty) LinkedIn platform row
    // the moment the tab is opened -- counting the array itself as "filled"
    // just because it's non-empty produced a false-positive percentage even
    // when the user hadn't entered anything.
    const countFields = (obj) => {
      if (typeof obj === 'string') {
        totalPbFields++;
        if (obj.trim() !== '') filledPbFields++;
      } else if (Array.isArray(obj)) {
        totalPbFields++;
        if (obj.length > 0) filledPbFields++;
      } else if (typeof obj === 'object' && obj !== null) {
        Object.entries(obj).forEach(([key, val]) => {
          if (key === 'platforms') return;
          countFields(val);
        });
      }
    };
    countFields(client.personalBranding.data);
    
    // Also add platforms manually like strategy builder
    const pbPlatforms = client.personalBranding.data.platforms || [];
    pbPlatforms.forEach(p => {
      if (p.purpose && p.purpose.trim() !== '') filledPbFields++;
      if (p.contentTypes && Array.isArray(p.contentTypes) && p.contentTypes.length > 0) filledPbFields++;
    });
    totalPbFields += pbPlatforms.length * 2;
    
    // In the actual builder it's out of ~29
    personalBrandPct = totalPbFields > 0 ? Math.min(100, Math.round((filledPbFields / 29) * 100)) : 0;
  }
  document.getElementById("dashPersonalBrandVal").textContent = `${personalBrandPct}%`;
  document.getElementById("dashPersonalBrandProgress").style.width = `${personalBrandPct}%`;

  // Calculate Social Media Audit checklist progress (40 items total)
  let totalSocialAudit = 40;
  let checkedSocialAudit = 0;
  if (client.socialAudit && client.socialAudit.checked) {
    Object.keys(client.socialAudit.checked).forEach(k => {
      if (client.socialAudit.checked[k]) {
        checkedSocialAudit++;
      }
    });
  }
  const socialAuditPct = Math.round((checkedSocialAudit / totalSocialAudit) * 100);
  document.getElementById("dashSocialAuditVal").textContent = `${socialAuditPct}%`;
  document.getElementById("dashSocialAuditProgress").style.width = `${socialAuditPct}%`;

  // Logged Website Competitors count
  // client.webComp may be entirely absent for restricted Team Access users
  // whose filtered clientsDb data omits the strategy-competition section -
  // guard instead of assuming it's always present (was crashing the whole
  // sync/render cycle for those users, see "Couldn't sync with the cloud
  // database" banner bug).
  let loggedWebComps = 0;
  (client.webComp && Array.isArray(client.webComp.names) ? client.webComp.names : []).forEach(name => {
    if (name && name !== "Competitor A" && name !== "Competitor B" && name !== "Competitor C" && name.trim() !== "") {
      loggedWebComps++;
    }
  });
  document.getElementById("dashWebCompetitorVal").textContent = `${loggedWebComps} / 3`;
  document.getElementById("dashWebCompetitorProgress").style.width = `${(loggedWebComps / 3) * 100}%`;

  let loggedSocialComps = 0;
  (client.socialComp && Array.isArray(client.socialComp.names) ? client.socialComp.names : []).forEach(name => {
    if (name && name !== "Competitor A" && name !== "Competitor B" && name !== "Competitor C" && name.trim() !== "") {
      loggedSocialComps++;
    }
  });
  document.getElementById("dashSocialCompetitorVal").textContent = `${loggedSocialComps} / 3`;
  document.getElementById("dashSocialCompetitorProgress").style.width = `${(loggedSocialComps / 3) * 100}%`;

  // Calculate Copywriting Assistant stats
  let copyWords = 0;
  if (client.copywriting && client.copywriting.notes) {
    const text = client.copywriting.notes.trim();
    copyWords = text === "" ? 0 : text.split(/\s+/).length;
  }
  document.getElementById("dashCopywritingVal").textContent = `${copyWords} words`;
  
  // Calculate Brand Vault completion
  let bvTotal = 14; // 3 assets, 2 typo, 2 voice, 2 audience, 5 colors
  let bvFilled = 0;
  if (client.brandVault) {
    const bv = client.brandVault;
    if (bv.assets) {
      if (bv.assets.logoUrl?.trim()) bvFilled++;
      if (bv.assets.driveLink?.trim()) bvFilled++;
      if (bv.assets.canvaLink?.trim()) bvFilled++;
    }
    if (bv.typography) {
      if (bv.typography.primaryFont?.trim()) bvFilled++;
      if (bv.typography.secondaryFont?.trim()) bvFilled++;
    }
    if (bv.brandVoice) {
      if (bv.brandVoice.adjectives?.trim()) bvFilled++;
      if (bv.brandVoice.missionStatement?.trim()) bvFilled++;
    }
    if (bv.targetAudience) {
      if (bv.targetAudience.demographic?.trim()) bvFilled++;
      if (bv.targetAudience.painPoints?.trim()) bvFilled++;
    }
    if (bv.colors && Array.isArray(bv.colors)) {
      bv.colors.forEach(c => {
        // Count a color as filled if it's not default black and has a name
        if (c.hex && c.hex !== "#000000") bvFilled++;
      });
    }
  }
  const bvPct = Math.round((bvFilled / bvTotal) * 100);
  document.getElementById("dashBrandVaultVal").textContent = `${bvPct}%`;
  document.getElementById("dashBrandVaultProgress").style.width = `${bvPct > 100 ? 100 : bvPct}%`;
  }

// Helper to determine letter grade
function calculateLetterGrade(score) {
  const val = parseFloat(score);
  if (val >= 9.0) return "A";
  if (val >= 8.0) return "B";
  if (val >= 7.0) return "C";
  if (val >= 6.0) return "D";
  if (val >= 5.0) return "E";
  return "F";
}

// Helper to determine letter grade for UX/UI checklist percentage
function calculateUxuiLetterGrade(pct) {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  if (pct >= 50) return "E";
  return "F";
}

// ── Onboarding Checklist Controller ──
let onboardingFilter = "all";

function renderOnboardingChecklist() {
  const client = getActiveClient();
  const container = document.getElementById("onboardingChecklistList");
  if (!client || !container) return;

  container.innerHTML = "";

  // Bind values to details inputs
  const obTargetUrl = document.getElementById("obTargetUrl");
  const obTargetDate = document.getElementById("obTargetDate");
  
  // Detach listeners first to avoid loop alerts
  obTargetUrl.value = client.targetUrl || "";
  obTargetDate.value = client.onboardingDate || "";

  // Compute scorecard values
  let totalTasks = 0;
  let checkedTasks = 0;
  let totalCats = client.onboardingChecklist.length;
  let completedCats = 0;

  client.onboardingChecklist.forEach(cat => {
    let catTotal = 0;
    let catChecked = 0;

    // Filter items according to buttons
    const filteredItems = cat.items.filter(item => {
      if (onboardingFilter === "complete") return item.checked;
      if (onboardingFilter === "incomplete") return !item.checked;
      return true;
    });

    totalTasks += cat.items.length;
    cat.items.forEach(i => {
      catTotal++;
      if (i.checked) {
        checkedTasks++;
        catChecked++;
      }
    });

    if (catTotal > 0 && catChecked === catTotal) {
      completedCats++;
    }

    if (filteredItems.length === 0 && onboardingFilter !== "all") {
      return; // Skip rendering empty filtered groups
    }

    // Render Category Title
    const catHeader = document.createElement("div");
    catHeader.className = "checklist-category-title";
    catHeader.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>${cat.category}</span>
      <span style="font-size:0.75rem; font-weight:400; color:var(--text-muted); margin-left:auto;">(${catChecked}/${catTotal})</span>
    `;
    container.appendChild(catHeader);

    // Render stack of cards
    const stack = document.createElement("div");
    stack.className = "checklist-items-stack";

    filteredItems.forEach(item => {
      const card = document.createElement("div");
      card.className = `checklist-item-card ${item.checked ? "completed" : ""}`;

      card.innerHTML = `
        <label class="checkbox-container">
          <input type="checkbox" ${item.checked ? "checked" : ""}>
          <span class="checkbox-custom"></span>
        </label>
        <div class="checklist-item-content">
          <div class="checklist-item-label">${item.label}</div>
        </div>
      `;

      // Event listener for checkbox
      const chk = card.querySelector("input");
      chk.addEventListener("change", () => {
        item.checked = chk.checked;
        // Update local class visually without tearing the whole DOM down
        if (item.checked) {
          card.classList.add("completed");
        } else {
          card.classList.remove("completed");
        }
        saveDatabase();
        
        // Defer the full re-render so the native checkbox click finishes cleanly
        setTimeout(() => {
          renderOnboardingChecklist();
          renderDashboard();
        }, 50);
      });

      stack.appendChild(card);
    });

    container.appendChild(stack);
  });

  // Score Calculations
  const obPct = totalTasks > 0 ? Math.round((checkedTasks / totalTasks) * 100) : 0;
  
  // Update scorecard DOM
  document.getElementById("onboardingCardCats").textContent = `${completedCats}/${totalCats}`;
  document.getElementById("onboardingCardTasks").textContent = checkedTasks;
  document.getElementById("onboardingCardRemaining").textContent = totalTasks - checkedTasks;
  
  const remainingEl = document.getElementById("onboardingCardRemaining");
  if (totalTasks - checkedTasks === 0) {
    remainingEl.classList.remove("warning");
    remainingEl.classList.add("success");
  } else {
    remainingEl.classList.remove("success");
    remainingEl.classList.add("warning");
  }

  document.getElementById("onboardingCardPct").textContent = `${obPct}%`;
  
  // Progress Bar
  const fill = document.getElementById("onboardingProgressFill");
  fill.style.width = `${obPct}%`;
  document.getElementById("onboardingProgressText").textContent = `${checkedTasks} of ${totalTasks} tasks complete`;
  document.getElementById("onboardingProgressPct").textContent = `${obPct}%`;
}

// Onboarding listeners moved to initParentEventListeners

function setIframeAbsoluteSrc(iframeSelector, relativeFallbackPath) {
  const iframe = document.querySelector(iframeSelector);
  if (iframe) {
    const newSrc = new URL(relativeFallbackPath, window.location.href).href;
    // Force an actual reload every time this is called (called only when a
    // tab is freshly navigated to, or right after switching the active
    // client) so the tool inside always re-reads getActiveClient() fresh.
    // Re-assigning the exact same src string is a no-op in browsers, so
    // clear it first.
    iframe.src = "about:blank";
    iframe.src = newSrc;
    // Idle Session Lock: re-wire activity listeners into this tool on every
    // (re)load, so mouse/keyboard activity inside a tool counts as activity
    // and doesn't lock the Hub out from under someone mid-task. One `load`
    // listener per iframe element, added once - attachIdleListeners() itself
    // is what needs to run on every load, since each reload is a brand-new
    // `document` object.
    if (!iframe.dataset.idleListenerAttached) {
      iframe.dataset.idleListenerAttached = "1";
      iframe.addEventListener("load", () => {
        if (typeof attachIdleListeners === "function") attachIdleListeners(iframe.contentDocument);
      });
    }
  }
}

// ── UX/UI Audit Suite Controller ──
function renderUxuiAudit() {
  setIframeAbsoluteSrc('#tab-uxui iframe', "ux-ui-audit-checklist/index.html");
}

// ── SEO Audit Suite Controller ──
function renderSeoAudit() {
  setIframeAbsoluteSrc('#tab-seo iframe', "seo-audit-checklist/index.html");
}

// ── Client Portal Manager Controller ──
function renderClientPortalManagerTab() {
  setIframeAbsoluteSrc('#tab-portal iframe', "client-portal-manager/index.html");
}

// ── Intake Request Controller ──
function renderIntakeRequest() {
  setIframeAbsoluteSrc('#tab-intakerequest iframe', "intake-request/index.html");
}

// ── Client Welcome Guide Controller ──
function renderWelcomeGuide() {
  setIframeAbsoluteSrc('#tab-welcomeguide iframe', "client-welcome-guide/index.html");
}

// ── Email Signature Generator Controller ──
function renderEmailSigGenerator() {
  setIframeAbsoluteSrc('#tab-emailsig iframe', "email-signature-generator/index.html");
}

// ── Creative Brief Generator Controller ──
function renderCreativeBrief() {
  setIframeAbsoluteSrc('#tab-creativebrief iframe', "creative-brief-generator/index.html");
}

// ── Ad Campaign Brief Generator Controller ──
function renderAdCampaignBrief() {
  setIframeAbsoluteSrc('#tab-adcampaignbrief iframe', "ad-campaign-brief/index.html");
}

// ── Creative Strategy Builder Controller ──
function renderCreativeStrategyBuilder() {
  setIframeAbsoluteSrc('#tab-creativestrategy iframe', "creative-strategy-builder/index.html");
}

// ── Content Audit Controller ──
function renderContentAudit() {
  setIframeAbsoluteSrc('#tab-contentaudit iframe', "content-audit/index.html");
}

// ── Paid Ads Audit Controller ──
function renderPaidAdsAudit() {
  setIframeAbsoluteSrc('#tab-paidads iframe', "paid-ads-audit/index.html");
}

// ── Email Marketing Audit Controller ──
function renderEmailStrategyAudit() {
  setIframeAbsoluteSrc('#tab-emailstrategy iframe', "email-marketing-audit/index.html?v=1.0");
}

// ── Campaign Launch Checklist Controller ──
function renderCampaignLaunchChecklist() {
  setIframeAbsoluteSrc('#tab-campaignlaunch iframe', "campaign-launch-checklist/index.html");
}

// ── Timeline Scheduler Controller ──
function renderTimelineScheduler() {
  setIframeAbsoluteSrc('#tab-timeline iframe', "timeline-scheduler/index.html");
}

// ── Client Intake Pre-Qualifier Controller ──
function renderIntakeQualifier() {
  setIframeAbsoluteSrc('#tab-intakequalifier iframe', "intake-prequalifier/index.html");
}

// ── Discovery Call Script Controller ──
function renderDiscoveryCallScript() {
  setIframeAbsoluteSrc('#tab-discoverycall iframe', "discovery-call-script/index.html");
}

// ── Ad Account Setup Controller ──
function renderAdAccountSetup() {
  setIframeAbsoluteSrc('#tab-adaccountsetup iframe', "ad-account-setup/index.html");
}

// ── Team Access Controller ──
function renderTeamAccess() {
  setIframeAbsoluteSrc('#tab-teamaccess iframe', "team-access-manager/index.html");
}

// ── Package Recommendation Engine Controller ──
function renderPackageRecommendationEngine() {
  setIframeAbsoluteSrc('#tab-packagerecommend iframe', "package-recommendation-engine/index.html");
}

// ── Proposal Follow-Up Sequence Tracker Controller ──
function renderColdOutreachSequencer() {
  setIframeAbsoluteSrc('#tab-coldoutreach iframe', "cold-outreach-sequencer/index.html");
}

// ── Sales Pipeline Board Controller ──
function renderPipelineBoard() {
  setIframeAbsoluteSrc('#tab-pipelineboard iframe', "sales-pipeline-board/index.html");
}

function renderFollowUpTracker() {
  setIframeAbsoluteSrc('#tab-followuptracker iframe', "proposal-followup-tracker/index.html");
}

// ── ROI Projector Controller ──
function renderRoiProjector() {
  setIframeAbsoluteSrc('#tab-roiprojector iframe', "roi-projector/index.html");
}

// ── Marketing Budget Calculator Controller ──
function renderBudgetCalculator() {
  setIframeAbsoluteSrc('#tab-budgetcalculator iframe', "marketing-budget-calculator/index.html");
}

// ── Payback Period Calculator Controller ──
function renderPaybackPeriodCalculator() {
  setIframeAbsoluteSrc('#tab-paybackperiod iframe', "payback-period-calculator/index.html");
}

// ── Contract & Invoice Status Tracker Controller ──
function renderContractInvoiceTracker() {
  setIframeAbsoluteSrc('#tab-contractinvoice iframe', "contract-invoice-tracker/index.html");
}

// ── Referral Tracker Controller ──
function renderReferralTracker() {
  setIframeAbsoluteSrc('#tab-referraltracker iframe', "referral-tracker/index.html");
}

// ── Client Renewal Tracker Controller ──
function renderRenewalTracker() {
  setIframeAbsoluteSrc('#tab-renewaltracker iframe', "renewal-tracker/index.html");
}

// ── Client Offboarding Checklist Controller ──
function renderOffboardingChecklistTab() {
  setIframeAbsoluteSrc('#tab-offboarding iframe', "client-offboarding-checklist/index.html");
}

// ── QC Checklist Controller ──
function renderQcChecklistTab() {
  setIframeAbsoluteSrc('#tab-qc iframe', "qc-checklist/index.html");
}

// ── Weekly Account Check-In Controller ──
function renderWeeklyCheckinTab() {
  setIframeAbsoluteSrc('#tab-weeklycheckin iframe', "weekly-account-checkin/index.html");
}

// ── Access & Login Log Controller ──
function renderAccessLoginLogTab() {
  setIframeAbsoluteSrc('#tab-accesslog iframe', "access-login-log/index.html");
}

// ── Client Ad Account Log Controller ──
function renderAdAccountLogTab() {
  setIframeAbsoluteSrc('#tab-adaccountlog iframe', "ad-account-log/index.html");
}

// ── Revision & Feedback Tracker Controller ──
function renderRevisionFeedbackTab() {
  setIframeAbsoluteSrc('#tab-revisionfeedback iframe', "revision-feedback-tracker/index.html");
}

// ── Call Sheet Builder Controller ──
function renderCallSheetTab() {
  setIframeAbsoluteSrc('#tab-callsheet iframe', "call-sheet-builder/index.html");
}

// ── Raw Footage & Delivery Tracker Controller ──
function renderRawFootageTab() {
  setIframeAbsoluteSrc('#tab-rawfootage iframe', "raw-footage-tracker/index.html");
}

// ── Release Forms Tracker Controller ──
function renderReleaseFormsTab() {
  setIframeAbsoluteSrc('#tab-releaseforms iframe', "release-forms-tracker/index.html");
}

// ── Run of Show Tracker Controller ──
function renderRunOfShowTab() {
  setIframeAbsoluteSrc('#tab-runofshow iframe', "run-of-show-tracker/index.html");
}

// ── Venue Tech-Spec Library Controller ──
function renderVenueTechSpecsTab() {
  setIframeAbsoluteSrc('#tab-venuespecs iframe', "venue-tech-spec-library/index.html");
}

// ── Vendor / Rental & COI Tracker Controller ──
function renderVendorRentalTab() {
  setIframeAbsoluteSrc('#tab-vendorrental iframe', "vendor-rental-tracker/index.html");
}

// ── SOP Wiki Controller ──
function renderSopWiki() {
  setIframeAbsoluteSrc('#tab-sopwiki iframe', "sop-wiki/index.html?v=1.7");
}

// ── Task Name Generator Controller ──
function renderTaskNameGenerator() {
  setIframeAbsoluteSrc('#tab-tasknamegen iframe', "task-name-generator/index.html");
}

function renderMarketingNews() {
  setIframeAbsoluteSrc('#tab-marketingnews iframe', "marketing-news-feed/index.html");
}

// ── Proposal Calculator Controller ──
function renderProposalCalculator() {
  setIframeAbsoluteSrc('#tab-proposal iframe', "proposal-calculator/index.html?v=12");
}

// ── Service Pricing Admin Controller ──
function renderServicePricingAdmin() {
  setIframeAbsoluteSrc('#tab-servicepricing iframe', "service-pricing-admin/index.html?v=3");
}

// ── Red Flag Checklist Controller ──
function renderRedFlagChecklist() {
  setIframeAbsoluteSrc('#tab-redflag iframe', "red-flag-checklist/index.html");
}

// ── Agency Health Dashboard Controller ──
function renderHealthDashboard() {
  setIframeAbsoluteSrc('#tab-healthdashboard iframe', "agency-health-dashboard/index.html");
}

// ── Change Order Generator Controller ──
function renderChangeOrderGenerator() {
  setIframeAbsoluteSrc('#tab-changeorder iframe', "change-order-generator/index.html");
}

// ── QBR Generator Controller ──
function renderQbrGenerator() {
  setIframeAbsoluteSrc('#tab-qbr iframe', "qbr-generator/index.html");
}

// ── Kickoff Prep & Deck Controller ──
function renderKickoffPrep() {
  setIframeAbsoluteSrc('#tab-kickoffprep iframe', "kickoff-prep/index.html");
}

// ── Case Study Builder Controller ──
function renderCaseStudyBuilder() {
  setIframeAbsoluteSrc('#tab-casestudy iframe', "case-study-builder/index.html");
}

// ── Portfolio Showcase Controller ──
function renderPortfolioShowcase() {
  setIframeAbsoluteSrc('#tab-portfolioshowcase iframe', "portfolio-showcase/index.html");
}

// ── Email Template Library Controller ──
function renderEmailTemplateLibrary() {
  setIframeAbsoluteSrc('#tab-emailtemplates iframe', "email-template-library/index.html");
}

// ── Subscription & Tool Cost Tracker Controller ──
function renderSubscriptionTracker() {
  setIframeAbsoluteSrc('#tab-subscriptiontracker iframe', "subscription-tracker/index.html");
}

// ── Business Insurance Tracker Controller ──
function renderBusinessInsuranceTracker() {
  setIframeAbsoluteSrc('#tab-businessinsurance iframe', "business-insurance-tracker/index.html");
}

// ── Activity Log Controller ──
function renderActivityLogTab() {
  setIframeAbsoluteSrc('#tab-activitylog iframe', "admin-activity-log/index.html");
}

// ── Team Roster & Capacity Controller ──
function renderTeamRoster() {
  setIframeAbsoluteSrc('#tab-teamroster iframe', "team-roster/index.html");
}

// ── My Time Off Controller ──
function renderMyTimeOff() {
  setIframeAbsoluteSrc('#tab-mytimeoff iframe', "my-time-off/index.html");
}

function renderHoursLog() {
  setIframeAbsoluteSrc('#tab-hourslog iframe', "hours-tracker/index.html");
}

function renderResourceBooking() {
  setIframeAbsoluteSrc('#tab-resourcebooking iframe', "resource-booking-calendar/index.html");
}

// ── Newly-wired iframe reload fixes (see the switch-case comment above) ──
function renderBrandAssetKit() {
  setIframeAbsoluteSrc('#tab-brandassetkit iframe', "brand-asset-kit/index.html?v=2");
}
function renderBrandGuidelines() {
  setIframeAbsoluteSrc('#tab-brandguidelines iframe', "brand-guidelines-builder/index.html");
}
function renderBudgetPacing() {
  setIframeAbsoluteSrc('#tab-budgetpacing iframe', "budget-pacing-tracker/index.html");
}
function renderMeetingNotes() {
  setIframeAbsoluteSrc('#tab-meetingnotes iframe', "meeting-notes-logger/index.html");
}
function renderMoodBoard() {
  setIframeAbsoluteSrc('#tab-moodboard iframe', "mood-board-builder/index.html");
}
function renderBrandRoadmap() {
  setIframeAbsoluteSrc('#tab-brandroadmap iframe', "brand-roadmap/index.html");
}
function renderContentCalendar() {
  setIframeAbsoluteSrc('#tab-contentcalendar iframe', "content-calendar/index.html");
}
function renderReportArchive() {
  setIframeAbsoluteSrc('#tab-reportarchive iframe', "monthly-report-archive/index.html");
}

// ── Testimonial & Review Requests Controller ──
function renderTestimonialTracker() {
  setIframeAbsoluteSrc('#tab-testimonialtracker iframe', "testimonial-tracker/index.html");
}

// ── Review & Reputation Tracker Controller ──
function renderReviewTracker() {
  setIframeAbsoluteSrc('#tab-reviewtracker iframe', "review-reputation-tracker/index.html");
}

// ── Content Strategy Guide Controller ──
function renderContentStrategy() {
  setIframeAbsoluteSrc('#tab-strategy iframe', "content-strategy-guide/index.html");
}

// ── Content Strategy Builder Controller ──
function renderStrategyBuilder() {
  setIframeAbsoluteSrc('#tab-strategybuilder iframe', "content-strategy-builder/index.html");
}

// ── Personal Branding Strategy Builder Controller ──
function renderPersonalBranding() {
  setIframeAbsoluteSrc('#tab-personalbrand iframe', "personal-branding-builder/index.html");
}

// ── Social Media Audit Controller ──
function renderSocialAudit() {
  setIframeAbsoluteSrc('#tab-socialaudit iframe', "social-media-audit/index.html");
}

// ── Competitor Analysis Matricies (Website & Social) ──
function renderWebCompetitors() {
  setIframeAbsoluteSrc('#tab-webcomp iframe', "competitor-analysis/Website Competitor Analysis Form.html");
}

function renderSocialCompetitors() {
  setIframeAbsoluteSrc('#tab-socialcomp iframe', "competitor-analysis/Competiteor Analysis Form.html");
}

// SWOT grid rendering helper with interactive prompt buttons
function renderSwotGrid(prefix, swotState, promptsDefs) {
  const container = document.getElementById(`${prefix}SwotGrid`);
  if (!container) return;

  container.innerHTML = "";

  promptsDefs.forEach(quad => {
    const card = document.createElement("div");
    card.className = "swot-card";
    card.style.borderTopColor = quad.borderColor;

    // Build prompt pills
    let pillsMarkup = "";
    quad.prompts.forEach(p => {
      pillsMarkup += `<span class="swot-prompt-chip" title="Click to insert prompt text">${p}</span>`;
    });

    card.innerHTML = `
      <div class="swot-card-header">
        <span class="swot-card-title">${quad.label}</span>
        <span class="swot-card-subtitle"> (${quad.sub})</span>
      </div>
      <div class="swot-prompts-scroller">
        ${pillsMarkup}
      </div>
      <textarea class="swot-textarea" placeholder="${quad.placeholder}">${swotState[quad.key] || ""}</textarea>
    `;

    // Listeners for prompt insert clicks
    card.querySelectorAll(".swot-prompt-chip").forEach(pill => {
      pill.addEventListener("click", () => {
        const ta = card.querySelector("textarea");
        const currentText = ta.value.trim();
        const promptText = pill.textContent.replace("___", "");
        
        if (currentText === "") {
          ta.value = promptText;
        } else {
          ta.value = currentText + "\n" + promptText;
        }
        
        // Trigger manual change events
        ta.dispatchEvent(new Event("input"));
        showBanner("success", "Inserted template prompt text!");
      });
    });

    // Listeners for SWOT text edits
    const ta = card.querySelector("textarea");
    ta.addEventListener("input", () => {
      swotState[quad.key] = ta.value;
      saveDatabase();
    });

    container.appendChild(card);
  });
}

// Website Competitor inputs are now handled inside its embedded iframe

// Social Competitor inputs are now handled inside its embedded iframe

  // Website competitor clear actions are handled inside the iframe document

  // Social competitor clear actions are handled inside the iframe document

// ── Monthly Report Form & Live Preview Controller ──
function renderReportForm() {
  setIframeAbsoluteSrc('#tab-report iframe', "competitor-analysis/revital-monthly-report-styled.html");
}

function renderCopywriting() {
  setIframeAbsoluteSrc('#tab-copywriting iframe', "copywriting-assistant/index.html");
}

function updateReportPreview() {
  // Preview is now handled inside the iframe
}

// Print, export/import, and client dropdown/button listeners moved to initParentEventListeners

// ── Notification Banner Alerts ──
function showBanner(type, message) {
  const activeBanner = type === "success" ? document.getElementById("successBanner") : document.getElementById("errorBanner");
  const msgSpan = type === "success" ? document.getElementById("successBannerMsg") : document.getElementById("errorBannerMsg");

  if (!activeBanner || !msgSpan) return;

  // Close other banners
  document.getElementById("successBanner").style.display = "none";
  document.getElementById("errorBanner").style.display = "none";
  // Also hide the save-conflict banner's own action row (see
  // showSaveConflictBanner below) - it shares this same errorBanner
  // element, and an ordinary showBanner("error", ...) call elsewhere
  // shouldn't leave a stale "Reload Now" button showing from an earlier
  // conflict.
  const errorActions = document.getElementById("errorBannerActions");
  if (errorActions) errorActions.style.display = "none";
  if (_conflictBannerHideTimer) { clearTimeout(_conflictBannerHideTimer); _conflictBannerHideTimer = null; }

  msgSpan.textContent = message;
  activeBanner.style.display = "flex";

  setTimeout(() => {
    activeBanner.style.display = "none";
  }, 4000);
}

// Same errorBanner element as showBanner("error", ...) above, but for the
// one case where the standard 4-second auto-vanish is actively harmful:
// commitDatabaseToCloud's save-conflict rejection (see its own comment
// for why this is a hard-block-and-ask, not a silent auto-merge - that's
// deliberate and stays as-is here). Missing that banner used to mean the
// person just kept editing into a save that would silently keep failing
// until they thought to reload themselves, then had to remember exactly
// what they'd just typed to redo it. This version stays on screen until
// they actually act on it, and "Reload Now" does the recovery step for
// them instead of just telling them to go do it.
let _conflictBannerHideTimer = null;
function showSaveConflictBanner(message) {
  const banner = document.getElementById("errorBanner");
  const msgSpan = document.getElementById("errorBannerMsg");
  const actions = document.getElementById("errorBannerActions");
  if (!banner || !msgSpan) return;

  const successBanner = document.getElementById("successBanner");
  if (successBanner) successBanner.style.display = "none";
  if (_conflictBannerHideTimer) { clearTimeout(_conflictBannerHideTimer); _conflictBannerHideTimer = null; }

  msgSpan.textContent = message;
  banner.style.display = "flex";
  if (actions) actions.style.display = "flex";
}

function hideSaveConflictBanner() {
  const banner = document.getElementById("errorBanner");
  const actions = document.getElementById("errorBannerActions");
  if (banner) banner.style.display = "none";
  if (actions) actions.style.display = "none";
}

// ── Shared optimistic-concurrency save for agency-wide list/library docs ──
// Used by every tool that keeps one shared (non-per-client) doc in
// Firestore under agency/* with its own version counter - Access & Login
// Log, Ad Account Log, the Contract Template Library, Email Template
// Library, Service Pricing, and over a dozen others each had a
// byte-for-byte copy of this exact read-compare-write guard before it was
// consolidated here (each one's own "someone else updated this while you
// had it open" bug class, now fixed in one place instead of ~18).
//
// Deliberately returns a plain result object rather than showing a
// banner itself - some callers show the parent's banner, others (like
// Email Template Library) surface their own toast/rollback UI instead,
// so presentation stays the caller's call.
//
// docRef: a Firestore doc ref (from window.parent.firebaseDoc(...) -
//   already a parent-realm object regardless of which tool constructed
//   it, so no cross-realm issue there).
// currentVersion: the version number the caller last loaded/saved.
// buildPayload(nextVersion): returns the full object to write (e.g.
//   {list: entries, version: nextVersion} or {prices: overrides, version:
//   nextVersion}) - built in the CALLER's realm, which is fine because
//   it's immediately JSON.stringify'd below (a generic property walk,
//   unlike an SDK's instanceof-style type check, works the same
//   regardless of which realm constructed the object).
//
// Resolves to {ok:true, version} on success, or {ok:false, reason:
// 'conflict'|'error', error?} - callers should store `version` back into
// their own version variable on success.
async function saveVersionedAgencyDoc({ docRef, currentVersion, buildPayload }) {
  try {
    const freshSnap = await window.firebaseGetDoc(docRef);
    const freshData = freshSnap && freshSnap.exists ? freshSnap.data() : null;
    const freshVersion = (freshData && freshData.version) || 0;

    if (freshVersion !== currentVersion) {
      return { ok: false, reason: "conflict", freshVersion };
    }

    const nextVersion = freshVersion + 1;
    // buildPayload runs in whichever tool's iframe defined it, so the
    // object it returns is realm-foreign here - route through
    // firebaseSetDocFromJSON (stringify -> parse back in THIS realm)
    // rather than docRef.set() directly, same reasoning as every existing
    // cross-iframe Firestore write in the Hub.
    const payload = buildPayload(nextVersion);
    await window.firebaseSetDocFromJSON(docRef, JSON.stringify(payload));

    // Safety-net backup - same "always-recent full copy" pattern as
    // clientsDb's own backup shards (see commitDatabaseToCloud/the Aug
    // 2026 data-loss-prevention work), just unsharded: every doc that
    // goes through this shared helper (Team Roster, Hours & Time Log,
    // Resource Bookings, Contract & Invoice Tracker, template libraries,
    // and everything else listed in this function's header comment) is
    // small enough to stay under Firestore's ~1MB document limit -
    // clientsDb is the one exception with its own bespoke sharded
    // backup. Adding this here, once, gives every one of those tools a
    // recovery copy for free instead of copy-pasting a backup write into
    // each tool's own persist() function. Written AFTER the real save
    // above succeeds (so a rejected/conflicting save - see the version
    // check above - can never overwrite the backup with stale data,
    // same ordering bug already fixed once for clientsDb) and is
    // fire-and-forget: a backup failure should never block or alarm the
    // user about the real save, which already succeeded.
    try {
      const backupRef = window.firebaseDoc(window.firebaseDb, "agency", docRef.id + "Backup");
      window.firebaseSetDocFromJSON(backupRef, JSON.stringify(Object.assign({}, payload, { backedUpAt: new Date().toISOString() })))
        .catch(err => console.error(`Safety-net backup write failed for agency/${docRef.id}:`, err));
    } catch (err) {
      console.error(`Couldn't kick off safety-net backup for agency/${docRef.id}:`, err);
    }

    return { ok: true, version: nextVersion };
  } catch (e) {
    return { ok: false, reason: "error", error: e };
  }
}

// Cross-tool bridge (Aug 2026): Cold Outreach Sequencer's "Booked" button
// and Referral Tracker's "Convert to Pipeline Lead" button both call this
// instead of just telling the human to go retype the lead into Sales
// Pipeline Board themselves (which is what used to happen - see the old
// showBanner copy in cold-outreach-sequencer/js/app.js's closeLead,
// "move them into the Sales Pipeline"). Writes straight to
// agency/salesPipeline through the same saveVersionedAgencyDoc guard
// Sales Pipeline Board's own persist() uses, so a lead added from
// either tool can never silently clobber a concurrent edit made directly
// in Sales Pipeline Board. Source gets set automatically (rather than
// left for someone to type later) specifically so the win-rate-by-source
// view in Sales Pipeline Board is accurate from the moment a lead is
// created, not dependent on someone remembering to fill in a free-text
// field consistently.
async function addLeadToSalesPipeline({ name, source, notes, stage }) {
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseGetDoc) {
    return { ok: false, reason: "not_ready" };
  }
  const trimmedName = (name || "").trim();
  if (!trimmedName) return { ok: false, reason: "no_name" };

  const docRef = window.firebaseDoc(window.firebaseDb, "agency", "salesPipeline");
  const snap = await window.firebaseGetDoc(docRef);
  const data = snap && snap.exists ? snap.data() : null;
  const list = (data && data.list) || [];
  const version = (data && data.version) || 0;

  // Don't create a second pipeline entry for someone who's already in
  // there (e.g. this cold-outreach contact was also referred by someone,
  // or "Booked" got clicked twice) - hand back the existing one instead.
  const existing = list.find(l => (l.name || "").trim().toLowerCase() === trimmedName.toLowerCase());
  if (existing) return { ok: true, alreadyExisted: true, lead: existing };

  const newLead = {
    id: "lead_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    name: trimmedName,
    contactEmail: "",
    source: source || "",
    notes: notes || "",
    stage: stage || "🆕 new lead",
    clickupTaskId: null,
    createdDate: new Date().toISOString().slice(0, 10),
    updatedDate: new Date().toISOString().slice(0, 10)
  };

  const result = await saveVersionedAgencyDoc({
    docRef,
    currentVersion: version,
    buildPayload: (v) => ({ list: [...list, newLead], version: v })
  });
  if (!result.ok) return { ok: false, reason: result.reason, error: result.error };

  // Same fire-and-forget ClickUp sync Sales Pipeline Board's own save
  // handler kicks off on a new lead - a failure here never blocks the
  // Hub-side save above (already succeeded); the card just shows
  // "Syncing..." until the next edit retries it, same as that tool's
  // own syncToClickUp.
  fetch("/api/pipeline/sync-clickup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId: null, name: newLead.name, stage: newLead.stage, contactEmail: "", source: newLead.source, notes: newLead.notes })
  }).catch(err => console.error("ClickUp sync failed for auto-created pipeline lead:", err));

  return { ok: true, lead: newLead };
}

// Sets the ClickUp assignee on a client's deal task to match whoever just
// got assigned as account manager in the Sales -> Delivery Handoff
// (Kickoff Prep & Deck) - Ronald's team uses ClickUp's native Assignee
// field as the real record of who owns a task, so the handoff needs to
// reach that, not just the Hub's own portalConfig.accountManagerEmail.
// Looks up the existing lead in agency/salesPipeline purely to find its
// clickupTaskId - re-sends its current name/stage/etc unchanged so this
// call doesn't clobber anything, same reasoning addLeadToSalesPipeline's
// own sync call follows. If the client was never logged in Sales Pipeline
// Board (or hasn't synced to ClickUp yet), there's no task to attach an
// assignee to - reason: 'no_task' surfaces that distinctly from an actual
// ClickUp API failure so Kickoff Prep can explain it instead of just
// saying "failed".
async function syncAccountManagerToClickUpAssignee(clientName, amEmail) {
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseGetDoc) {
    return { ok: false, reason: "not_ready" };
  }
  const trimmedName = (clientName || "").trim();
  if (!trimmedName || !amEmail) return { ok: false, reason: "missing_input" };

  let lead;
  try {
    const docRef = window.firebaseDoc(window.firebaseDb, "agency", "salesPipeline");
    const snap = await window.firebaseGetDoc(docRef);
    const data = snap && snap.exists ? snap.data() : null;
    const list = (data && data.list) || [];
    lead = list.find(l => (l.name || "").trim().toLowerCase() === trimmedName.toLowerCase());
  } catch (e) {
    return { ok: false, reason: "error", error: e };
  }

  if (!lead || !lead.clickupTaskId) return { ok: false, reason: "no_task" };

  try {
    const res = await fetch("/api/pipeline/sync-clickup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: lead.clickupTaskId, name: lead.name, stage: lead.stage,
        contactEmail: lead.contactEmail, source: lead.source, notes: lead.notes,
        assigneeEmail: amEmail
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, reason: "error", error: new Error(data.error || `Request failed (${res.status})`) };
    return { ok: true, assigneeMatched: !!data.assigneeMatched, accountManagerFieldSet: !!data.accountManagerFieldSet };
  } catch (e) {
    return { ok: false, reason: "error", error: e };
  }
}

// Companion to the function above, for the "Growth > Closing & Onboarding
// Handoff > Onboarding Handoff" list - a separate list with no tracked
// task id anywhere in the Hub, so the Worker searches for the matching
// task by client name each time rather than looking one up by id (see
// findOnboardingHandoffTaskByClientName in _worker.js). Sets Assignee
// only, no custom field - that list was deliberately kept to just
// Assignee (the "Account Manager" Person field was removed from it,
// staying only on the CRM > Deals list where it sits next to other
// account-level context).
async function syncAccountManagerToOnboardingHandoff(clientName, amEmail) {
  const trimmedName = (clientName || "").trim();
  if (!trimmedName || !amEmail) return { ok: false, reason: "missing_input" };
  try {
    const res = await fetch("/api/pipeline/sync-onboarding-handoff-assignee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientName: trimmedName, assigneeEmail: amEmail })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, reason: "error", error: new Error(data.error || `Request failed (${res.status})`) };
    if (data.reason) return { ok: true, reason: data.reason };
    return { ok: true, assigneeMatched: !!data.assigneeMatched };
  } catch (e) {
    return { ok: false, reason: "error", error: e };
  }
}

// ── Account Manager Capacity Snapshot ──
// Team Roster & Capacity used to rely entirely on a manually-typed
// "current client count" per person, which drifts stale the moment
// someone's caseload actually changes. Every client already carries a
// real assignment though - portalConfig.accountManagerEmail (set in
// Client Portal Manager, used to sign welcome/portal emails) - so for
// anyone whose role is literally "Account Manager" we can compute their
// real live caseload instead of trusting a stale number. Non-AM roles
// (Video Editor, Designer, etc.) have no equivalent per-client
// assignment field in this data model, so they still fall back to the
// manual count in Team Roster's own render logic.
//
// Returns a map keyed by lowercased AM email -> { member, clientNames }.
// Used by both Team Roster (to render live load + the expandable client
// list) and Client Portal Manager (to warn if the AM you just typed in
// is already stretched thin) - built once, shared, rather than
// duplicating the match-by-email loop in both tools.
async function getAccountManagerCapacitySnapshot() {
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseGetDoc) return {};
  try {
    const ref = window.firebaseDoc(window.firebaseDb, "agency", "teamRoster");
    const snap = await window.firebaseGetDoc(ref);
    const data = snap && snap.exists ? snap.data() : null;
    const members = (data && data.list) || [];
    const clients = getAllClients() || {};

    const byEmail = {};
    members.forEach(m => {
      if (m.role !== "Account Manager") return;
      const email = (m.email || "").trim().toLowerCase();
      if (!email) return;
      byEmail[email] = { member: m, clientNames: [] };
    });

    Object.keys(clients).forEach(clientName => {
      const client = clients[clientName];
      const amEmail = ((client.portalConfig && client.portalConfig.accountManagerEmail) || "").trim().toLowerCase();
      if (amEmail && byEmail[amEmail]) byEmail[amEmail].clientNames.push(clientName);
    });

    return byEmail;
  } catch (e) {
    console.warn("Couldn't build the account-manager capacity snapshot:", e);
    return {};
  }
}

// Live hours-based load for every non-Account-Manager role, mirroring
// getAccountManagerCapacitySnapshot() above but sourced from actual
// logged hours (agency/hoursLog) instead of client assignments - AMs
// don't have a comparable "hours this week" signal, so this only ever
// applies to production/creative roles (see getEffectiveLoad in
// team-roster/js/app.js). memberName in Hours & Time Log is free text
// matched via a <datalist>, not a strict foreign key, so this keys by
// lowercased/trimmed name rather than id.
//
// Returns a map keyed by lowercased member name -> { hours, clientNames },
// hours logged so far this week (Sunday start, same boundary as Hours &
// Time Log's own isThisWeek helper) and the distinct clients that time
// was logged against (mirrors clientNames on the AM snapshot above, so
// Team Roster's expand-to-see-clients affordance works the same way for
// both live-data branches).
async function getTeamHoursCapacitySnapshot() {
  try {
    // Shared read (and shared one-time migration check) with
    // getHoursLogEntries below, rather than this function keeping its
    // own separate copy of the same Firestore read.
    const entries = await getHoursLogEntries();

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday start
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const byName = {};
    entries.forEach(e => {
      const d = new Date((e.date || '') + 'T00:00:00');
      if (isNaN(d.getTime()) || d < startOfWeek || d >= endOfWeek) return;
      const key = (e.memberName || "").trim().toLowerCase();
      if (!key) return;
      if (!byName[key]) byName[key] = { hours: 0, clientNames: new Set() };
      byName[key].hours += (parseFloat(e.hours) || 0);
      if (e.clientName) byName[key].clientNames.add(e.clientName);
    });

    const result = {};
    Object.keys(byName).forEach(key => {
      result[key] = { hours: byName[key].hours, clientNames: Array.from(byName[key].clientNames).sort() };
    });
    return result;
  } catch (e) {
    console.warn("Couldn't build the team hours capacity snapshot:", e);
    return {};
  }
}

// Raw agency/teamRoster member list, unfiltered - for tools outside
// Team Roster itself that need per-person data (e.g. Budget Pacing
// Tracker joining hoursLog entries against each member's hourlyRate to
// compute labor cost). Deliberately returns everything on each member
// record, including hourlyRate - callers are trusted admin-only iframes
// (same trust level as getAllClients()), not the Contractor Portal,
// which gets its own narrow server-side projection instead (see
// handleContractorPortalData in _worker.js) and never sees this.
async function getTeamRosterMembers() {
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseGetDoc) return [];
  try {
    const ref = window.firebaseDoc(window.firebaseDb, "agency", "teamRoster");
    const snap = await window.firebaseGetDoc(ref);
    const data = snap && snap.exists ? snap.data() : null;
    return (data && data.list) || [];
  } catch (e) {
    console.warn("Couldn't load team roster members:", e);
    return [];
  }
}

// Raw agency/hoursLog entries, unfiltered (every member, every client,
// every date) - callers filter/aggregate for their own purpose (Budget
// Pacing Tracker filters by client name + date range for retainer
// utilization and labor cost; Team Roster's own
// getTeamHoursCapacitySnapshot above filters to this week only). Kept
// separate from that function rather than generalizing it, since its
// "this week, grouped by person" shape is specific to the capacity
// view and callers here want raw entries to group however they need.
// One-time, idempotent backfill from the old agency/hoursLog
// {list: [...]} document into the new one-document-per-entry
// hoursLogEntries collection (Aug 2026 storage-scaling work - see
// resource-booking-calendar/js/app.js's header comment for the full
// reasoning, and _worker.js's migrateHoursLogIfNeeded for the
// server-side twin of this exact function, used by the Contractor
// Portal's own hours read/write path). Safe to call from anywhere,
// anytime: it only ever does real work the first time (new collection
// still empty + old doc has data), and re-running it writes the same
// documents at the same ids again, which Firestore treats as a no-op
// overwrite rather than a duplicate.
async function migrateHoursLogIfNeeded() {
  if (!window.firebaseDb || !window.firebaseCollection || !window.firebaseGetDocs || !window.firebaseDoc || !window.firebaseGetDoc || !window.firebaseSetDoc) return;
  try {
    const existing = await window.firebaseGetDocs(window.firebaseCollection(window.firebaseDb, "hoursLogEntries"));
    if (existing.length > 0) return;
    const oldRef = window.firebaseDoc(window.firebaseDb, "agency", "hoursLog");
    const oldSnap = await window.firebaseGetDoc(oldRef);
    const oldData = oldSnap && oldSnap.exists ? oldSnap.data() : null;
    const oldEntries = (oldData && Array.isArray(oldData.list)) ? oldData.list : [];
    if (!oldEntries.length) return;
    await Promise.all(oldEntries.filter(e => e.id).map(entry => {
      const { id, ...rest } = entry;
      return window.firebaseSetDoc(window.firebaseDoc(window.firebaseDb, "hoursLogEntries", id), rest);
    }));
  } catch (e) {
    console.error("Hours log migration to per-document storage failed:", e);
  }
}

async function getHoursLogEntries() {
  if (!window.firebaseDb || !window.firebaseCollection || !window.firebaseGetDocs) return [];
  try {
    await migrateHoursLogIfNeeded();
    return await window.firebaseGetDocs(window.firebaseCollection(window.firebaseDb, "hoursLogEntries"));
  } catch (e) {
    console.warn("Couldn't load hours log entries:", e);
    return [];
  }
}

// One-time, idempotent backfill from the old agency/contractInvoices
// {list: [...]} document into the new one-document-per-record
// contractInvoiceRecords collection (Aug 2026 storage-scaling work -
// same pattern as migrateHoursLogIfNeeded above, and _worker.js's own
// twin of this function, used by the Stripe webhook handler). Safe to
// call from anywhere, anytime - only does real work the first time.
async function migrateContractInvoicesIfNeeded() {
  if (!window.firebaseDb || !window.firebaseCollection || !window.firebaseGetDocs || !window.firebaseDoc || !window.firebaseGetDoc || !window.firebaseSetDoc) return;
  try {
    const existing = await window.firebaseGetDocs(window.firebaseCollection(window.firebaseDb, "contractInvoiceRecords"));
    if (existing.length > 0) return;
    const oldRef = window.firebaseDoc(window.firebaseDb, "agency", "contractInvoices");
    const oldSnap = await window.firebaseGetDoc(oldRef);
    const oldData = oldSnap && oldSnap.exists ? oldSnap.data() : null;
    const oldRecords = (oldData && Array.isArray(oldData.list)) ? oldData.list : [];
    if (!oldRecords.length) return;
    await Promise.all(oldRecords.filter(r => r.id).map(record => {
      const { id, ...rest } = record;
      return window.firebaseSetDoc(window.firebaseDoc(window.firebaseDb, "contractInvoiceRecords", id), rest);
    }));
  } catch (e) {
    console.error("Contract/invoice migration to per-document storage failed:", e);
  }
}

// Raw contractInvoiceRecords - Budget Pacing Tracker uses this to look
// up a client's recurringBilling.monthlyAmount (Stripe subscription
// revenue) for margin math, without duplicating Contract & Invoice
// Tracker's own read logic. See getRecordsCollectionRef/loadRecords in
// contract-invoice-tracker/js/app.js for the canonical version of this
// same read.
async function getContractInvoiceRecords() {
  if (!window.firebaseDb || !window.firebaseCollection || !window.firebaseGetDocs) return [];
  try {
    await migrateContractInvoicesIfNeeded();
    return await window.firebaseGetDocs(window.firebaseCollection(window.firebaseDb, "contractInvoiceRecords"));
  } catch (e) {
    console.warn("Couldn't load contract/invoice records:", e);
    return [];
  }
}

// Called from Proposal Calculator's "Generate Payment Link" button (Aug
// 2026) so a proposal's own totals can turn into a real, sendable Stripe
// Checkout link without a trip through Contract & Invoice Tracker first.
// Finds-or-creates the matching contractInvoiceRecords doc (same shape
// as Tracker's own addTrackedClient, so the client shows up there
// normally afterward), then calls the same
// /api/billing/create-subscription-checkout route Tracker's "Send
// Billing Link" button uses (see handleCreateSubscriptionCheckout in
// _worker.js) and saves the resulting recurringBilling sub-object onto
// the record. Throws on any failure - the caller (proposal-calculator)
// is responsible for showing the error to the user.
//
// billingType mirrors what the Worker route now supports:
//   - "recurring" (default) - monthlyAmount only, ongoing subscription.
//   - "one_time" - setupAmount only, single charge, no subscription.
//   - "combined" - both amounts, billed together in one checkout (the
//     setup fee once, then the recurring amount every month after).
async function generateProposalPaymentLink({ clientName, monthlyAmount, setupAmount, billingType, serviceLabel, mode }) {
  const name = (clientName || '').trim();
  const type = ['one_time', 'combined'].includes(billingType) ? billingType : 'recurring';
  const monthly = Number(monthlyAmount) || 0;
  const setup = Number(setupAmount) || 0;
  const needsMonthly = type === 'recurring' || type === 'combined';
  const needsSetup = type === 'one_time' || type === 'combined';
  if (!name) throw new Error("A client name is required.");
  if (needsMonthly && monthly <= 0) throw new Error("A monthly amount greater than zero is required.");
  if (needsSetup && setup <= 0) throw new Error("A one-time amount greater than zero is required.");
  if (!window.firebaseSetDocFromJSON || !window.firebaseDoc || !window.firebaseDb) {
    throw new Error("Can't reach the database right now.");
  }

  const billingMode = mode === 'live' ? 'live' : 'test';
  const existing = await getContractInvoiceRecords();
  let record = existing.find(r => (r.clientName || '').trim().toLowerCase() === name.toLowerCase());
  const isNewRecord = !record;
  if (!record) {
    record = {
      id: 'ci-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      clientName: name,
      contractStatus: 'Not Sent',
      contractSentDate: '',
      contractSignedDate: '',
      contractRenewalDate: '',
      invoiceStatus: 'Not Sent',
      invoiceSentDate: '',
      invoiceDueDate: '',
      invoicePaidDate: '',
      invoiceAmount: '',
      notes: ''
    };
  }

  const clients = getAllClients() || {};
  const clientKey = Object.keys(clients).find(k => k.trim().toLowerCase() === name.toLowerCase());
  const clientRecord = clientKey ? clients[clientKey] : null;
  const clientEmail = (clientRecord && clientRecord.portalConfig && clientRecord.portalConfig.clientContactEmail) || '';

  const res = await fetch('/api/billing/create-subscription-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recordId: record.id,
      clientName: name,
      mode: billingMode,
      clientEmail,
      billingType: type,
      monthlyAmount: needsMonthly ? monthly : undefined,
      setupAmount: needsSetup ? setup : undefined,
      serviceLabel: serviceLabel || ''
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');

  record.recurringBilling = {
    status: 'pending_checkout',
    billingType: type,
    monthlyAmount: needsMonthly ? monthly : null,
    setupAmount: needsSetup ? setup : null,
    checkoutUrl: data.checkoutUrl,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    mode: billingMode
  };

  const { id, ...rest } = record;
  await window.firebaseSetDocFromJSON(window.firebaseDoc(window.firebaseDb, "contractInvoiceRecords", id), JSON.stringify(rest));

  return { checkoutUrl: data.checkoutUrl, isNewRecord };
}

// Same underlying timeOff data as Team Roster's Calendar view (see
// team-roster/js/app.js's renderTimeline) - just "today's column" of
// that same data, surfaced on the dashboard so checking who's out
// doesn't require a click into Team Roster first. Local calendar day,
// not UTC, so this doesn't flip over an hour early/late depending on
// timezone.
function todayIsoLocalForDashboard() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function renderWhosOutToday() {
  const el = document.getElementById('whosOutTodayList');
  if (!el) return;
  if (!window.firebaseDb || !window.firebaseDoc || !window.firebaseGetDoc) return;
  try {
    const ref = window.firebaseDoc(window.firebaseDb, "agency", "teamRoster");
    const snap = await window.firebaseGetDoc(ref);
    const data = snap && snap.exists ? snap.data() : null;
    const members = (data && data.list) || [];
    const today = todayIsoLocalForDashboard();

    const outToday = members.filter(m => {
      const timeOff = Array.isArray(m.timeOff) ? m.timeOff : [];
      return timeOff.some(t => t.startDate <= today && today <= (t.endDate || t.startDate));
    });

    el.innerHTML = outToday.length
      ? outToday.map(m => `<div style="padding:3px 0;">${escapeHtmlCore(m.memberName)}</div>`).join('')
      : `<div style="color: var(--color-text-muted);">Everyone's in today.</div>`;
  } catch (e) {
    console.warn("Couldn't load who's out today:", e);
    el.innerHTML = `<div style="color: var(--color-text-muted);">Couldn't load.</div>`;
  }
}

// ── Mobile Drawer Navigation ──
function initMobileNavigation() {
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const mobileCloseBtn = document.getElementById("mobileCloseBtn");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  const sidebar = document.getElementById("sidebar");

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove("open");
    if (sidebarOverlay) sidebarOverlay.classList.remove("active");
  }

  function openSidebar() {
    if (sidebar) sidebar.classList.add("open");
    if (sidebarOverlay) sidebarOverlay.classList.add("active");
  }

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener("click", openSidebar);
  }
  if (mobileCloseBtn) {
    mobileCloseBtn.addEventListener("click", closeSidebar);
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
  }

  // Close sidebar on navigation selection (mobile only)
  const navButtons = document.querySelectorAll(".nav-item-btn");
  navButtons.forEach(btn => {
    btn.addEventListener("click", closeSidebar);
  });
}

// ── Parent Event Listeners Initialization ──
function initParentEventListeners() {
  // Onboarding inputs sync
  const obTargetUrl = document.getElementById("obTargetUrl");
  if (obTargetUrl) {
    obTargetUrl.addEventListener("input", (e) => {
      const client = getActiveClient();
      client.targetUrl = e.target.value;
      saveDatabase();
      // Keep dashboard hero in sync
      const heroUrl = document.getElementById("dashHeroTargetUrl");
      if (heroUrl) heroUrl.textContent = e.target.value || "No website logged yet";
    });
  }

  // ── Try the desktop app first, fall back to the web ──
  // There's no reliable way for a webpage to ask a browser "is app X
  // installed?" directly - openAppOrWeb uses the standard workaround
  // instead: attempt navigation to a matching custom URL scheme
  // (clickup://...) in a hidden iframe, and watch whether the window
  // loses focus shortly after (a strong signal the OS actually handed
  // off to an installed app taking over the screen). If it doesn't lose
  // focus within the timeout, nothing caught the custom scheme, so fall
  // back to opening the normal web URL in a new tab - exactly what
  // happened before this existed.
  //
  // clickupAppUrlFor is a best-effort guess, not a guarantee: ClickUp's
  // clickup:// scheme is unofficial and doesn't cover every link shape
  // (per ClickUp's own feature-request tracker, it works for regular
  // task-ID links but not custom IDs, and share links like
  // sharing.clickup.com aren't confirmed supported at all). Worst case,
  // the app doesn't catch it and this just falls through to the web
  // link exactly as before - it never gets stuck.
  function openAppOrWeb(webUrl, appUrl) {
    if (!webUrl) return;
    if (!appUrl) { window.open(webUrl, '_blank', 'noopener'); return; }

    let handedOff = false;
    const onBlur = () => { handedOff = true; };
    window.addEventListener('blur', onBlur, { once: true });

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    try {
      iframe.contentWindow.location.href = appUrl;
    } catch (err) {
      // Some browsers throw synchronously for an unregistered custom
      // scheme instead of just failing silently - either way, fall
      // through to the web link below.
    }

    setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      if (!handedOff) {
        window.open(webUrl, '_blank', 'noopener');
      }
    }, 800);
  }

  function clickupAppUrlFor(webUrl) {
    if (!webUrl) return null;
    if (!/^https?:\/\/([a-z0-9-]+\.)?clickup\.com\//i.test(webUrl)) return null;
    return webUrl.replace(/^https?:\/\//i, 'clickup://');
  }

  const dashClickupUrl = document.getElementById("dashClickupUrl");
  if (dashClickupUrl) {
    dashClickupUrl.addEventListener("input", (e) => {
      const client = getActiveClient();
      client.clickupUrl = e.target.value;
      saveDatabase();
      const btn = document.getElementById("dashClickupBtn");
      if (btn) {
        if (client.clickupUrl) {
          btn.href = client.clickupUrl;
          btn.style.display = "flex";
        } else {
          btn.style.display = "none";
        }
      }
    });
  }

  // Open button tries the ClickUp desktop app first (if installed), and
  // falls back to opening the web link in a new tab if not - see
  // openAppOrWeb() for how. href stays set to the plain web URL so the
  // button still behaves like a normal link (right-click > copy link,
  // middle-click to open in a new tab, etc.) for anyone not using a plain
  // left-click.
  const dashClickupBtn = document.getElementById("dashClickupBtn");
  if (dashClickupBtn) {
    dashClickupBtn.addEventListener("click", (e) => {
      const webUrl = dashClickupBtn.getAttribute("href");
      if (!webUrl || webUrl === "#") return;
      e.preventDefault();
      openAppOrWeb(webUrl, clickupAppUrlFor(webUrl));
    });
  }

  const obTargetDate = document.getElementById("obTargetDate");
  if (obTargetDate) {
    obTargetDate.addEventListener("input", (e) => {
      const client = getActiveClient();
      client.onboardingDate = e.target.value;
      saveDatabase();
    });
  }

  // Onboarding checklist All/Incomplete/Complete filter buttons. These
  // read onboardingFilter (declared just above renderOnboardingChecklist)
  // to decide which items to show, but nothing ever set that variable or
  // called renderOnboardingChecklist() on click - the buttons existed in
  // the HTML with .active styling but had no listener at all, so clicking
  // them visibly did nothing.
  const onboardingFilterBtns = document.querySelectorAll(".filter-group .filter-btn");
  if (onboardingFilterBtns.length) {
    onboardingFilterBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        onboardingFilterBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        onboardingFilter = btn.getAttribute("data-filter") || "all";
        renderOnboardingChecklist();
      });
    });
  }

  // Add custom onboarding item
  const addCustomObBtn = document.getElementById("addCustomObBtn");
  if (addCustomObBtn) {
    addCustomObBtn.addEventListener("click", () => {
      const client = getActiveClient();
      const labelInput = document.getElementById("customObLabel");
      const categorySelect = document.getElementById("customObCategory");

      if (!labelInput || !categorySelect) return;
      const label = labelInput.value.trim();
      if (label === "") return;

      const targetCategory = categorySelect.value;
      const categoryObj = client.onboardingChecklist.find(cat => cat.category === targetCategory);

      if (categoryObj) {
        const newId = `ob_custom_${Date.now()}`;
        categoryObj.items.push({
          id: newId,
          label: label,
          checked: false,
          notes: "",
          clientVisible: false
        });
        saveDatabase();
        labelInput.value = "";
        renderOnboardingChecklist();
        renderDashboard();
        showBanner("success", "Added custom onboarding checklist item!");
      }
    });
  }

  // Reset Onboarding Checklist
  const resetOnboardingBtn = document.getElementById("resetOnboardingBtn");
  if (resetOnboardingBtn) {
    resetOnboardingBtn.addEventListener("click", () => {
      const confirmReset = confirm("Reset all onboarding items back to blank templates? Custom added tasks will be deleted.");
      if (!confirmReset) return;

      const client = getActiveClient();
      const blueprints = DEFAULT_ONBOARDING_CHECKLIST.map(cat => ({
        category: cat.category,
        items: cat.items.map(item => ({
          id: item.id,
          label: item.label,
          checked: false,
          notes: "",
          clientVisible: item.clientVisible || false
        }))
      }));

      client.onboardingChecklist = blueprints;
      saveDatabase();
      renderOnboardingChecklist();
      renderDashboard();
      showBanner("success", "Onboarding checklist reset to template.");
    });
  }

  // Save-conflict banner actions (see showSaveConflictBanner/
  // hideSaveConflictBanner) - a real page reload rather than trying to
  // programmatically resync in place, since that's the one guaranteed
  // way every open tool's own local form state ends up consistent with
  // the fresh clientsDb, not just the top-level object itself.
  const errorBannerReloadBtn = document.getElementById("errorBannerReloadBtn");
  if (errorBannerReloadBtn) {
    errorBannerReloadBtn.addEventListener("click", () => window.location.reload());
  }
  const errorBannerDismissBtn = document.getElementById("errorBannerDismissBtn");
  if (errorBannerDismissBtn) {
    errorBannerDismissBtn.addEventListener("click", hideSaveConflictBanner);
  }

  // Print Buttons
  const printOnboardingBtn = document.getElementById("printOnboardingBtn");
  if (printOnboardingBtn) {
    printOnboardingBtn.addEventListener("click", () => window.print());
  }

  // Sidebar Utilities: Export / Import JSON
  const exportDataBtn = document.getElementById("exportDataBtn");
  if (exportDataBtn) {
    exportDataBtn.addEventListener("click", async () => {
      const originalLabel = exportDataBtn.innerHTML;
      exportDataBtn.disabled = true;
      exportDataBtn.textContent = "Exporting...";
      try {
        const agencyDocs = await fetchAllAgencyDocsForBackup();
        const backup = {
          exportedAt: new Date().toISOString(),
          clientsDb: clientsDb,
          agencyDocs: agencyDocs
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", dataStr);
        const dateStamp = new Date().toISOString().slice(0, 10);
        downloadAnchor.setAttribute("download", `Revital_Productions_Full_Backup_${dateStamp}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showBanner("success", "Full backup exported (all clients + agency-wide data)!");
        logAdminActivity("Full backup exported", `${Object.keys(clientsDb).length} clients, ${Object.keys(agencyDocs).length} agency docs`);
      } catch (e) {
        console.error("Backup export failed:", e);
        showBanner("error", "Backup export failed - check the console for details.");
      } finally {
        exportDataBtn.disabled = false;
        exportDataBtn.innerHTML = originalLabel;
      }
    });
  }

  const importDataBtn = document.getElementById("importDataBtn");
  if (importDataBtn) {
    importDataBtn.addEventListener("click", () => {
      const fileInput = document.getElementById("importFileInput");
      if (fileInput) fileInput.click();
    });
  }

  
  const exportDossierBtn = document.getElementById("exportDossierBtn");
  if (exportDossierBtn) {
    exportDossierBtn.addEventListener("click", async () => {
      if (typeof JSZip === 'undefined') {
        alert("JSZip library failed to load. Please check your connection.");
        return;
      }
      
      const client = clientsDb[activeClientName];
      if (!client) {
        alert("No active client found.");
        return;
      }

      const origText = exportDossierBtn.innerHTML;
      exportDossierBtn.innerHTML = "⏳ Zipping Dossier...";
      exportDossierBtn.disabled = true;

      try {
        const zip = new JSZip();
        
        // 1. Raw JSON Backup
        zip.file(`Raw_Data_${activeClientName.replace(/\s+/g, '_')}.json`, JSON.stringify(client, null, 2));

        // 2. Comprehensive Text Dossier (Markdown)
        let md = `# Client Dossier: ${client.name}\n\n`;
        md += `**Created Date:** ${client.createdDate || 'N/A'}\n`;
        md += `**Target URL:** ${client.targetUrl || 'N/A'}\n\n`;
        
        // Onboarding
        if (client.onboardingChecklist) {
          md += `## Onboarding Checklist\n`;
          client.onboardingChecklist.forEach(cat => {
            md += `### ${cat.category}\n`;
            cat.items.forEach(item => {
              md += `- [${item.checked ? 'X' : ' '}] ${item.label}\n`;
              if (item.notes) md += `  - *Notes: ${item.notes}*\n`;
            });
          });
          md += `\n`;
        }

        // Add to ZIP
        zip.file(`Dossier_${activeClientName.replace(/\s+/g, '_')}.md`, md);

        // Generate Zip
        const content = await zip.generateAsync({type: "blob"});
        
        // Trigger Download
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Revital_Dossier_${activeClientName.replace(/\s+/g, '_')}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showBanner("success", "Client Dossier (ZIP) exported successfully!");
      } catch (err) {
        console.error(err);
        alert("Failed to generate ZIP dossier.");
      } finally {
        exportDossierBtn.innerHTML = origText;
        exportDossierBtn.disabled = false;
      }
    });
  }


  const importFileInput = document.getElementById("importFileInput");
  if (importFileInput) {
    importFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async function(evt) {
        try {
          const imported = JSON.parse(evt.target.result);

          if (typeof imported !== 'object' || Array.isArray(imported)) {
            throw new Error("Invalid file structure. Must be a JSON object.");
          }

          // Export Full Backup (see exportDataBtn above) wraps client data
          // as {exportedAt, clientsDb, agencyDocs} instead of the old flat
          // {clientName: {...}} shape - detect which one this file is so
          // older exported backups still import exactly as before.
          const isFullBackupFormat = imported && typeof imported.clientsDb === 'object' && !Array.isArray(imported.clientsDb);
          const importedClients = isFullBackupFormat ? imported.clientsDb : imported;

          // SAFEGUARD (Aug 2026, added after a real incident): this merge
          // is `{...clientsDb, ...importedClients}` - any client key already
          // present in importedClients silently OVERWRITES the live client
          // with whatever this file has for them, even if the file is an
          // old backup and the live version has since gained days of real
          // edits (that's exactly how "Evry Intention LLC" briefly vanished
          // - an older backup was imported and its narrower client list won
          // the merge for every key it happened to include). Brand-new
          // clients that don't exist live yet are always safe to add - only
          // OVERLAPPING keys need a heads-up, so warn specifically about
          // those instead of blocking every import.
          const overlapping = Object.keys(importedClients).filter(name => clientsDb[name]);
          if (overlapping.length > 0) {
            const proceed = confirm(
              `This backup (from ${imported.exportedAt || "an unknown date"}) will OVERWRITE ${overlapping.length} client workspace(s) that already exist here with this file's older version, discarding any edits made since:\n\n` +
              overlapping.map(name => `- ${name}`).join("\n") +
              `\n\nAny other clients in this file that don't already exist will be added either way. Continue with the overwrite?`
            );
            if (!proceed) {
              showBanner("error", "Import cancelled - no changes were made.");
              return;
            }
          }

          clientsDb = { ...clientsDb, ...importedClients };
          saveDatabase();

          activeClientName = Object.keys(importedClients)[0];
          localStorage.setItem("REVITAL_HUB_ACTIVE_CLIENT", activeClientName);

          buildClientDropdown();
          refreshAllViews();
          showBanner("success", "Client workspaces merged and imported successfully!");
          logAdminActivity("Backup imported", `${Object.keys(importedClients).length} client(s)`);

          if (isFullBackupFormat && imported.agencyDocs && Object.keys(imported.agencyDocs).length > 0) {
            const restoreAgencyData = confirm(
              `This backup also includes agency-wide data (${Object.keys(imported.agencyDocs).length} docs - notifications, trackers, activity log, etc.) from ${imported.exportedAt || "an earlier export"}.\n\n` +
              `Restore that too? This OVERWRITES the current live versions of each doc it includes. Choose Cancel to just keep the client workspaces you already imported above.`
            );
            if (restoreAgencyData && window.firebaseDb && window.firebaseDb.collection) {
              try {
                await Promise.all(Object.entries(imported.agencyDocs).map(([docName, data]) =>
                  window.firebaseDb.collection("agency").doc(docName).set(data)
                ));
                showBanner("success", "Agency-wide data restored from backup.");
                logAdminActivity("Agency data restored from backup", `${Object.keys(imported.agencyDocs).length} docs`);
              } catch (restoreErr) {
                console.error("Agency data restore failed:", restoreErr);
                showBanner("error", "Client workspaces imported, but agency-wide data restore failed - check the console.");
              }
            }
          }
        } catch (err) {
          console.error("Import failed:", err);
          showBanner("error", "Failed to parse backup JSON. Verify file format.");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
  }

  // Delete Client Button
  const deleteClientBtn = document.getElementById("deleteClientBtn");
  if (deleteClientBtn) {
    deleteClientBtn.addEventListener("click", deleteActiveClient);
  }

  // Edit (rename) Client Button
  const editClientBtn = document.getElementById("editClientBtn");
  if (editClientBtn) {
    editClientBtn.addEventListener("click", renameActiveClient);
  }

  // Add Client button dropdown
  const addClientBtn = document.getElementById("addClientBtn");
  if (addClientBtn) {
    addClientBtn.addEventListener("click", createNewClient);
  }

  // Dropdown change listener
  const clientSelect = document.getElementById("clientSelect");
  if (clientSelect) {
    clientSelect.addEventListener("change", (e) => {
      e.target.title = e.target.value;
      switchClient(e.target.value);
    });
  }
}

// ── Application Bootstrapper ──
window.onerror = function(msg, url, line) {
  if (msg === "Script error.") return false;
  const el = document.getElementById("dashHeroClientName");
  if (el) el.textContent = "Global Error: " + msg + " at line " + line;
};

function fetchCloudflareProfile() {
  fetch('/api/user')
    .then(res => res.json())
    .then(data => {
      if (data && data.email && data.email !== 'Guest') {
        const userEmailEl = document.getElementById('userEmail');
        const userAvatarEl = document.getElementById('userAvatar');

        // Extract username from email
        let displayName = data.email;
        if (data.email.includes('@')) {
          const username = data.email.split('@')[0];
          // Capitalize first letter
          displayName = username.charAt(0).toUpperCase() + username.slice(1);

          // Force 'Ronald' to show as 'Admin'
          if (displayName.toLowerCase() === 'ronald') {
            displayName = 'Admin';
          }
        }

        if (userEmailEl) userEmailEl.textContent = displayName;
        if (userAvatarEl) {
          userAvatarEl.textContent = displayName.charAt(0).toUpperCase();
        }
      }
    })
    .catch(err => console.log('Running locally or no Cloudflare Access headers present.', err));
}

document.addEventListener("DOMContentLoaded", () => {
  // Idle-lock UI wiring (PIN form, self-serve button, Team PINs panel)
  // now runs unconditionally and BEFORE sign-in, not inside boot() (Aug
  // 2026) - it has to work on a fresh page load that's still idle-locked
  // from before, where boot() never runs at all because
  // ensureCorrectFirebaseIdentity shows the idle-lock overlay instead of
  // completing sign-in (see the 423 branch there). Every DOM element and
  // function this touches already tolerates being called pre-sign-in
  // (see checkIsHubAdmin, rewritten the same day to not require one).
  try { initIdleSessionLock(); } catch(e) { console.error("IdleSessionLock Error:", e); }

  // Require Firebase sign-in as the admin account before booting the hub
  // (checkIdentity/boot logic lives in initAdminAuthGate() -> boot()).
  initAdminAuthGate();
});

// ── Brand Vault Controllers ──
function renderBrandVault() {
  const client = getActiveClient();
  if (!client || !client.brandVault) return;

  const bv = client.brandVault;
  
  // Backwards compatibility for old clients without full structure
  if (!bv.assets) bv.assets = { logoUrl: "", driveLink: "", canvaLink: "" };
  if (!bv.colors) bv.colors = [
    { hex: "#000000", name: "Primary" }, { hex: "#000000", name: "Secondary" },
    { hex: "#000000", name: "Accent 1" }, { hex: "#000000", name: "Accent 2" }, { hex: "#000000", name: "Background" }
  ];
  if (!bv.typography) bv.typography = { primaryFont: "", secondaryFont: "" };
  if (!bv.brandVoice) bv.brandVoice = { adjectives: "", missionStatement: "" };
  if (!bv.targetAudience) bv.targetAudience = { demographic: "", painPoints: "" };

  // Assets
  document.getElementById("bvLogoUrl").value = bv.assets.logoUrl || "";
  document.getElementById("bvDriveLink").value = bv.assets.driveLink || "";
  document.getElementById("bvCanvaLink").value = bv.assets.canvaLink || "";

  // Typography
  document.getElementById("bvPrimaryFont").value = bv.typography.primaryFont || "";
  document.getElementById("bvSecondaryFont").value = bv.typography.secondaryFont || "";
  
  // Voice
  document.getElementById("bvAdjectives").value = bv.brandVoice.adjectives || "";
  document.getElementById("bvMission").value = bv.brandVoice.missionStatement || "";

  // Audience
  document.getElementById("bvDemographic").value = bv.targetAudience.demographic || "";
  document.getElementById("bvPainPoints").value = bv.targetAudience.painPoints || "";

  // Colors
  const colorsContainer = document.getElementById("bvColorsContainer");
  if (colorsContainer) {
    colorsContainer.innerHTML = "";
    bv.colors.forEach((color, index) => {
      const item = document.createElement("div");
      item.className = "bv-color-item";
      item.innerHTML = `
        <input type="color" class="bv-color-picker" id="bvColorHex_${index}" value="${color.hex || '#000000'}" onchange="saveBrandVault()">
        <div class="bv-color-inputs">
          <input type="text" class="bv-input" style="padding: 4px 8px; font-size: 0.8rem;" id="bvColorName_${index}" value="${color.name || ''}" placeholder="Color Name" onchange="saveBrandVault()">
          <input type="text" class="bv-input" style="padding: 4px 8px; font-size: 0.8rem;" id="bvColorText_${index}" value="${color.hex || '#000000'}" placeholder="#HEX" onchange="document.getElementById('bvColorHex_${index}').value = this.value; saveBrandVault()">
        </div>
      `;
      colorsContainer.appendChild(item);
    });
  }

  // Update Scorecards
  updateBrandVaultScorecards();
}

function updateBrandVaultScorecards() {
  const client = getActiveClient();
  if (!client || !client.brandVault) return;
  const bv = client.brandVault;

  const totalFields = 9; 
  let filledFields = 0;
  
  if (bv.assets && bv.assets.logoUrl) filledFields++;
  if (bv.assets && bv.assets.driveLink) filledFields++;
  if (bv.assets && bv.assets.canvaLink) filledFields++;
  if (bv.typography && bv.typography.primaryFont) filledFields++;
  if (bv.typography && bv.typography.secondaryFont) filledFields++;
  if (bv.brandVoice && bv.brandVoice.adjectives) filledFields++;
  if (bv.brandVoice && bv.brandVoice.missionStatement) filledFields++;
  if (bv.targetAudience && bv.targetAudience.demographic) filledFields++;
  if (bv.targetAudience && bv.targetAudience.painPoints) filledFields++;
  
  const pct = Math.round((filledFields / totalFields) * 100);
  
  const elTotal = document.getElementById("bvCardTotal");
  const elFilled = document.getElementById("bvCardFilled");
  const elRemaining = document.getElementById("bvCardRemaining");
  const elPct = document.getElementById("bvCardPct");
  const progressFill = document.getElementById("bvProgressFill");
  const progressText = document.getElementById("bvProgressText");
  const progressPctText = document.getElementById("bvProgressPct");
  
  if (elFilled) {
    elTotal.textContent = totalFields;
    elFilled.textContent = filledFields;
    elRemaining.textContent = totalFields - filledFields;
    if (filledFields === totalFields) {
      elRemaining.classList.remove('warning');
    } else {
      elRemaining.classList.add('warning');
    }
    elPct.textContent = pct + "%";
    progressFill.style.width = pct + "%";
    progressText.textContent = `${filledFields} of ${totalFields} fields complete`;
    progressPctText.textContent = pct + "%";
  }
}

function saveBrandVault() {
  const client = getActiveClient();
  if (!client) return;
  if (!client.brandVault) client.brandVault = {};
  
  const bv = client.brandVault;
  
  // Assets
  if (!bv.assets) bv.assets = {};
  bv.assets.logoUrl = document.getElementById("bvLogoUrl").value;
  bv.assets.driveLink = document.getElementById("bvDriveLink").value;
  bv.assets.canvaLink = document.getElementById("bvCanvaLink").value;

  // Typography
  if (!bv.typography) bv.typography = {};
  bv.typography.primaryFont = document.getElementById("bvPrimaryFont").value;
  bv.typography.secondaryFont = document.getElementById("bvSecondaryFont").value;

  // Voice
  if (!bv.brandVoice) bv.brandVoice = {};
  bv.brandVoice.adjectives = document.getElementById("bvAdjectives").value;
  bv.brandVoice.missionStatement = document.getElementById("bvMission").value;

  // Audience
  if (!bv.targetAudience) bv.targetAudience = {};
  bv.targetAudience.demographic = document.getElementById("bvDemographic").value;
  bv.targetAudience.painPoints = document.getElementById("bvPainPoints")?.value || "";

  // Colors
  if (!bv.colors) bv.colors = [];
  for (let i = 0; i < 5; i++) {
    const hexInput = document.getElementById(`bvColorHex_${i}`);
    const nameInput = document.getElementById(`bvColorName_${i}`);
    if (hexInput && nameInput) {
      if (!bv.colors[i]) bv.colors[i] = {};
      bv.colors[i].hex = hexInput.value;
      bv.colors[i].name = nameInput.value;
    }
  }

  // Update UI scorecards instantly without redrawing the whole form
  updateBrandVaultScorecards();

  // ── Keep client.brandKit in sync ──
  // The Client Portal's brand section (portal/js/app.js renderBrandKit())
  // reads client.brandKit, not client.brandVault - but this Vault is the
  // one this SOP-driven workflow actually points staff to fill in. Before
  // this sync, saving here had zero effect on what the client ever saw:
  // Vault could be perfectly filled out and the portal would still show an
  // empty brand section, because nothing kept the two in sync. Deriving
  // brandKit from brandVault on every save means Vault is now the single
  // real data-entry point - Brand Asset Kit (Lite) is a read-only display
  // of this same derived data (see brand-asset-kit/js/app.js).
  if (!client.brandKit) client.brandKit = {};
  client.brandKit.primaryColor = (bv.colors[0] && bv.colors[0].hex) || client.brandKit.primaryColor || '';
  client.brandKit.secondaryColor = (bv.colors[1] && bv.colors[1].hex) || client.brandKit.secondaryColor || '';
  client.brandKit.accentColor = (bv.colors[2] && bv.colors[2].hex) || client.brandKit.accentColor || '';
  client.brandKit.fontPrimary = bv.typography.primaryFont || client.brandKit.fontPrimary || '';
  client.brandKit.fontSecondary = bv.typography.secondaryFont || client.brandKit.fontSecondary || '';
  client.brandKit.toneOfVoice = bv.brandVoice.adjectives || client.brandKit.toneOfVoice || '';
  client.brandKit.logoUrl = bv.assets.logoUrl || client.brandKit.logoUrl || '';

  saveDatabase();
  renderDashboard();

  // ── Force Brand Asset Kit (Lite) to pick up this change ──
  // iframeNeedsReload["tab-brandassetkit"] only flips back to true when the
  // active CLIENT changes (see refreshAllViews) - saving the Vault for the
  // client that's already active never touched that flag. So once someone
  // opened Brand Asset Kit (Lite) even once this session, it kept showing
  // whatever the Vault looked like at that first visit - every Vault edit
  // after that was invisible there until switching clients and back (which
  // resets every tab's flag) or a full page reload. Same fix already used
  // for tab-portal below (see the portal listener further down): flag it
  // for reload next time, and if it's the tab on screen right now, refresh
  // it immediately instead of making the user click away and back.
  if (typeof iframeNeedsReload !== "undefined" && iframeNeedsReload["tab-brandassetkit"] !== undefined) {
    iframeNeedsReload["tab-brandassetkit"] = true;
    const activeTabBtn = document.querySelector(".nav-item-btn.active");
    const activeTab = activeTabBtn ? activeTabBtn.getAttribute("data-tab") : "";
    if (activeTab === "tab-brandassetkit") {
      refreshIframeTab("tab-brandassetkit");
    }
  }
}



// ── Firebase Cloud Sync ──
let isInitialLoad = true;

function backfillMissingClientChecklists() {
  // Clients created before the client-facing checklist feature shipped
  // never got a clientChecklist array. Client Portal Manager backfills it,
  // but only for a client the admin has actually opened that tool for -
  // any client that hasn't been visited there yet silently syncs an empty
  // checklist to its portal, which just looks blank to the client with no
  // explanation. Backfill here so every client gets the starter checklist
  // regardless of whether Client Portal Manager has been opened for them.
  let changed = false;
  Object.values(clientsDb).forEach(client => {
    if (client && !Array.isArray(client.clientChecklist)) {
      client.clientChecklist = DEFAULT_CLIENT_CHECKLIST.map(item => ({
        id: item.id,
        label: item.label,
        checked: false
      }));
      changed = true;
    }
  });
  return changed;
}

let _cloudSaveDebounceTimer = null;

function saveDatabase() {
  // 1. Save locally as fallback - always instant, never debounced, so nothing
  // is lost even if the tab closes before the debounced cloud write below
  // fires.
  backfillMissingClientChecklists();

  // Attribution stamp for the ambient "who last edited this client" note
  // (see renderClientLastEditedNote) - travels with the client's own
  // record through the same versioned shard save/load path as everything
  // else in clientsDb, no separate doc or write needed. Only the
  // currently active client gets stamped: virtually every tool that ends
  // up calling saveDatabase() got here by mutating getActiveClient()'s own
  // fields, so this is accurate for the case that actually matters (a
  // teammate about to edit the same client someone else just touched).
  const activeClientForEditStamp = getActiveClient();
  if (activeClientForEditStamp) {
    activeClientForEditStamp.lastEditedBy = friendlyNameFromEmail(window.currentAdminEmail);
    activeClientForEditStamp.lastEditedByEmail = window.currentAdminEmail || "";
    activeClientForEditStamp.lastEditedAt = new Date().toISOString();
    try { renderClientLastEditedNote(); } catch (e) {}
  }
  // See pendingLocalClientEdits above rebuildClientsDbFromShards - protect
  // the client actually being edited from getting clobbered by an
  // unrelated shard update while this save is still in flight.
  if (activeClientName) pendingLocalClientEdits.add(activeClientName);
  // Second line of defense (see rebuildClientsDbFromShards): never let
  // this overwrite the local cache with a clientsDb we know is still
  // mid-sync. In the normal case clientsDb is never in that state by
  // the time anything can call saveDatabase(), but a cross-client tool
  // acting the instant its iframe loads is exactly the edge case that
  // exposed this, so it's worth checking here too rather than trusting
  // a single guard.
  if (!lastKnownClientsDbShardCount || clientsDbAllShardsLoaded) {
    localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));
  } else {
    console.warn("saveDatabase: skipping localStorage write - clientsDb shards still loading.");
  }

  // 2. Trigger Autosave UI indicator
  const indicator = document.getElementById("autosaveIndicator");
  if (indicator) {
    indicator.innerHTML = "Syncing... 🔄";
    indicator.style.opacity = "1";
  }

  // 3. Debounce the actual cloud write (see comment above this function).
  if (_cloudSaveDebounceTimer) clearTimeout(_cloudSaveDebounceTimer);
  _cloudSaveDebounceTimer = setTimeout(() => {
    _cloudSaveDebounceTimer = null;
    commitDatabaseToCloud();
  }, 500);
}

// ── clientsDb Firestore storage (sharded) ──
//
// HISTORY: clientsDb lived in a single agency/clientsDb document holding
// every client's full state (onboarding, audits, competitor grids,
// proposals, etc.) keyed by client name. That's the same single-document
// pattern that caused the SOP & Wiki Library to hit Firestore's
// 1,048,576-byte per-document hard limit once its combined content grew
// past it - every save AND every load started failing, invisibly, until
// someone happened to notice. clientsDb is well under that limit today
// (roughly 15% as of this writing), but the failure mode when it
// eventually crosses it is identical.
//
// FIX: the same sharding approach used for the SOP wiki. clientsDb is
// bin-packed by client key across as many agency/clientsDb-shard-N
// documents as needed to keep each one safely under a byte threshold,
// plus one tiny agency/clientsDbShardMeta document ({ count: N })
// tracking how many shards currently exist. Every shard is still a single
// document directly under /agency/, so this needs no Firestore rules
// changes. Everything else - loadDatabase(), saveDatabase(), every screen
// that reads or writes clientsDb - keeps working against the same
// in-memory `clientsDb` object as before and doesn't need to know shards
// exist at all.
const CLIENTS_DB_SHARD_PREFIX = "clientsDb-shard-";
const CLIENTS_DB_MAX_SHARD_BYTES = 700000;

let clientsDbShardData = {};          // { [shardIndex]: { clientName: state, ... } }
let clientsDbShardUnsubscribers = [];
let lastKnownClientsDbShardCount = 0;

// SAFETY GUARD (see commitDatabaseToCloud below): tracks which shard
// indices have received at least one real snapshot since the listener
// count was last (re)set, and whether that adds up to every shard we
// expect. Prevents writing a partial in-memory clientsDb - built from
// only some shards having loaded yet - back over the full set in
// Firestore, which would silently delete whichever clients only lived
// in a shard that hadn't arrived yet.
let clientsDbShardsLoadedIndices = new Set();
let clientsDbAllShardsLoaded = false;

// Optimistic-concurrency guard for clientsDb itself (see
// commitDatabaseToCloud below) - kept fresh by loadDatabase's meta-doc
// listener, same version-field pattern every other agency/* doc in the
// Hub now uses (see saveVersionedAgencyDoc). clientsDb was the one doc
// left without this protection after this session's sweep - the exact
// "someone else saved while you had it open" bug class that already
// caused a real data-loss incident once (see data-loss-prevention-plan.md),
// just never closed here specifically.
let clientsDbDocVersion = 0;

// Names this tab has itself, deliberately, removed from clientsDb this
// session (via deleteActiveClient or the delete-half of renameActiveClient)
// - see the stale-tab content check in commitDatabaseToCloud below. Only
// ADDED to by those two call sites, never cleared, so a key this tab
// genuinely deleted stays "explained" for the rest of the session even if
// several saves happen afterward.
let intentionallyRemovedClientNames = new Set();

// Which sections a Team-Access-restricted teammate is granted, per the
// last /api/restricted-client-data response (see startRestrictedClientsDbSync
// and commitRestrictedClientEdits below). null for unrestricted admins -
// they never take this path at all.
let restrictedAllowedSections = null;

// Dedicated, save-path-only flag for commitDatabaseToCloud's routing
// decision (restricted REST write vs. normal admin shard write) - kept
// deliberately separate from isRestrictedTeamMember (see that variable's
// own comment above applyTeamAccessRestrictions), which is a sidebar/
// notification DISPLAY flag only. Those two used to be the same variable;
// a live devtools call to applyTeamAccessRestrictions() for testing
// (simulating a restricted teammate's sidebar, in the same real admin tab)
// silently flipped isRestrictedTeamMember to true and then never flipped
// back, which in turn mis-routed every subsequent real save through the
// restricted-write path for the rest of that tab's session - a save
// routing bug, not just a display glitch, since it meant edits could go
// through commitRestrictedClientEditsNow's section-filtered diff instead
// of a real admin write. Only startRestrictedClientsDbSync and
// applyRestrictedClientsDbSnapshot below (the actual clientsDb-sync
// decision path, driven by a real /api/restricted-client-data exchange)
// may set this - nothing UI-only should ever be able to change it.
let isRestrictedClientsDbSync = false;

// Set of client names with in-memory changes not yet confirmed as saved
// to the cloud (see saveDatabase, ensureClientPortalListeners' fold-in
// block, and rebuildClientsDbFromShards below). Needed because
// rebuildClientsDbFromShards does a full clientsDb = merged reassignment
// any time ANY shard document changes for ANY reason - including a
// totally unrelated client's edit landing in the same shard doc, since
// multiple clients are bin-packed per shard, or another admin's tab
// saving something else entirely. Without this guard, a fold-in mutation
// sitting in memory waiting on its own 500ms-debounced save could be
// silently clobbered by that unrelated shard update if it arrives first
// - discarding the fold before it's ever written to the cloud. This is
// what made "already seen" client notifications (mood board notes/
// ratings) keep reappearing even after being marked read: the fold that
// was supposed to make the diff-based new-event detection stop firing
// never actually reached the cloud, so it silently reverted on the next
// shard snapshot merge and looked new again - with no error, no
// version-conflict banner, nothing to tip anyone off.
let pendingLocalClientEdits = new Set();

function getClientsDbShardMetaDocRef() {
  if (!window.firebaseDb || !window.firebaseDoc) return null;
  return window.firebaseDoc(window.firebaseDb, "agency", "clientsDbShardMeta");
}

function getClientsDbShardDocRef(shardIndex) {
  if (!window.firebaseDb || !window.firebaseDoc) return null;
  return window.firebaseDoc(window.firebaseDb, "agency", CLIENTS_DB_SHARD_PREFIX + shardIndex);
}

// Legacy pre-sharding location. Only ever read once, during the one-time
// migration in loadDatabase() below - never written to again after that.
function getLegacyClientsDbDocRef() {
  if (!window.firebaseDb || !window.firebaseDoc) return null;
  return window.firebaseDoc(window.firebaseDb, "agency", "clientsDb");
}

// Greedily bin-packs clientsDb's entries into shard-sized chunks, each
// kept under CLIENTS_DB_MAX_SHARD_BYTES when serialized the same way
// it's actually saved.
function packClientsDbIntoShards(fullDb) {
  const entries = Object.entries(fullDb);
  const shards = [];
  let current = {};
  let currentCount = 0;
  for (const [key, value] of entries) {
    const trial = Object.assign({}, current, { [key]: value });
    const size = new Blob([JSON.stringify(trial)]).size;
    if (size > CLIENTS_DB_MAX_SHARD_BYTES && currentCount > 0) {
      shards.push(current);
      current = { [key]: value };
      currentCount = 1;
    } else {
      current = trial;
      currentCount++;
    }
  }
  if (currentCount > 0 || shards.length === 0) shards.push(current);
  return shards;
}

function rebuildClientsDbFromShards() {
  // Don't downgrade the already-loaded clientsDb (booted instantly from
  // localStorage - see loadDatabase()) to a partial state while shards
  // are still trickling in. Each shard's onSnapshot used to rebuild
  // clientsDb from ONLY the shards that had arrived so far, so a
  // complete five-client roster could be briefly - or, if a shard was
  // slow/failed, not-so-briefly - replaced by a two-client partial
  // merge and written straight to localStorage. That's what made
  // clients "disappear": any tool reading clientsDb during that window
  // (e.g. a cross-client tool like Contract & Invoice Tracker) would
  // see, and could persist, the incomplete list. Wait until every
  // expected shard has been seen at least once before promoting the
  // merge.
  if (!clientsDbAllShardsLoaded) return;

  const merged = {};
  for (let i = 0; i < lastKnownClientsDbShardCount; i++) {
    if (clientsDbShardData[i] && typeof clientsDbShardData[i] === 'object') {
      Object.assign(merged, clientsDbShardData[i]);
    }
  }

  // Keep whichever clients have an unconfirmed local edit in flight (see
  // pendingLocalClientEdits above) instead of letting this merge - which
  // fires on ANY shard change, not just ones related to these clients -
  // overwrite them with cloud data that doesn't have that edit yet.
  pendingLocalClientEdits.forEach(name => {
    if (clientsDb[name]) merged[name] = clientsDb[name];
  });

  const cloudStr = JSON.stringify(merged);
  const localStr = JSON.stringify(clientsDb);
  if (cloudStr === localStr) return;

  clientsDb = merged;
  localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));

  if (!clientsDb[activeClientName]) {
    activeClientName = Object.keys(clientsDb)[0] || "";
  }

  buildClientDropdown();
  refreshAllViews();
  renderDashboard();
}

function listenToClientsDbShard(shardIndex) {
  const docRef = getClientsDbShardDocRef(shardIndex);
  if (!docRef || !window.firebaseOnSnapshot) return;
  const unsubscribe = window.firebaseOnSnapshot(docRef, (docSnap) => {
    // Skip echoes of our own unconfirmed writes for this shard - if the
    // admin is actively editing (every keystroke triggers a debounced
    // save), a later keystroke can update clientsDb in memory before an
    // earlier keystroke's echo arrives here, and applying that stale
    // echo would clobber the newer edit.
    if (docSnap.metadata && docSnap.metadata.hasPendingWrites) return;
    clientsDbShardData[shardIndex] = docSnap.exists ? docSnap.data() : {};

    clientsDbShardsLoadedIndices.add(shardIndex);
    clientsDbAllShardsLoaded = clientsDbShardsLoadedIndices.size >= lastKnownClientsDbShardCount;

    rebuildClientsDbFromShards();
  }, (err) => {
    console.error("clientsDb shard listener error:", err);
    showBanner("error", "Couldn't sync with the cloud database: " + err.message);
  });
  clientsDbShardUnsubscribers.push(unsubscribe);
}

function setClientsDbShardListenerCount(count) {
  if (count === lastKnownClientsDbShardCount && clientsDbShardUnsubscribers.length === count) return;
  clientsDbShardUnsubscribers.forEach(unsubscribe => {
    if (typeof unsubscribe === 'function') unsubscribe();
  });
  clientsDbShardUnsubscribers = [];
  clientsDbShardData = {};
  clientsDbShardsLoadedIndices = new Set();
  clientsDbAllShardsLoaded = (count === 0);
  lastKnownClientsDbShardCount = count;
  for (let i = 0; i < count; i++) listenToClientsDbShard(i);
}

// Client-side mirror of _worker.js's CLIENT_FIELD_SECTIONS - see
// commitRestrictedClientEdits below for why this exists. Keep in sync with
// that copy (same "keep both in sync" pattern as effectiveSections()
// already uses between app.js, team-access-manager/js/app.js, and
// firestore.rules).
const CLIENT_FIELD_SECTIONS_MIRROR = {
  onboardingChecklist: "core", clientChecklist: "core", brandVault: "core",
  portalConfig: "core", pendingApprovals: "core", approvalHistory: "core",
  notifications: "core", lastVisitedAt: "core", portalLastVisitedAt: "core",
  lastEditedBy: "core", lastEditedByEmail: "core", lastEditedAt: "core",

  paidAdsTracker: "ad-accounts-access",

  reportArchive: "reporting-health", report: "reporting-health",

  brandKit: "content-creation", moodBoards: "content-creation",
  moodBoardViews: "content-creation", moodBoardStyleFeedback: "content-creation",
  moodBoardAnnotations: "content-creation", brandRoadmap: "content-creation",
  copywriting: "content-creation", creativeBrief: "content-creation",
  contentStrategy: "content-creation",

  campaignLaunch: "account-ops", meetingNotes: "account-ops",

  uxuiAudit: "audits", seoAudit: "audits", paidAdsAudit: "audits",
  emailAudit: "audits", socialAudit: "audits", contentAudit: "audits",
  emailStrategy: "audits",

  competitorAnalysis: "strategy-competition", strategyBuilder: "strategy-competition",
  webComp: "strategy-competition", socialComp: "strategy-competition",

  proposal: "sales-pipeline", roi: "sales-pipeline", signature: "sales-pipeline",
  billingSummary: "sales-pipeline",

  testimonialSubmission: "retention-social-proof", referralSummary: "retention-social-proof"
};
// Never writable through /api/restricted-client-data regardless of
// section - see handleRestrictedClientDataWrite in _worker.js.
const RESTRICTED_WRITE_IDENTITY_FIELDS = ["name", "createdDate", "targetUrl", "clickupUrl", "onboardingDate"];

// Save path for Team-Access-restricted teammates - takes over from
// commitDatabaseToCloud below for that case. Instead of resharding and
// rewriting the ENTIRE clientsDb the way commitDatabaseToCloud does (which
// would need this caller to have every other client's full data in memory
// too, and would round-trip fields outside their granted sections right
// back to Firestore), this POSTs just the edited client(s)' currently-
// in-memory fields to /api/restricted-client-data, which validates every
// field against this caller's granted sections server-side and merges
// them into the right shard - see handleRestrictedClientDataWrite in
// _worker.js.
//
// Fields are filtered client-side against CLIENT_FIELD_SECTIONS_MIRROR
// before sending, rather than trusting that everything currently sitting
// in clientsDb[name] is already safe to send. It usually is - a
// restricted teammate's in-memory copy only ever contains fields their
// GET response included in the first place - but a couple of
// section-blind helpers that run on every save regardless of who's
// editing (saveDatabase's lastEditedBy/lastEditedByEmail/lastEditedAt
// attribution stamp, backfillMissingClientChecklists seeding a missing
// clientChecklist) can add a 'core' field into memory even for someone
// without the 'core' section. Without this filter, that harmless side
// effect would get bundled into the request and the server would reject
// the WHOLE save - handleRestrictedClientDataWrite deliberately rejects
// wholesale rather than silently dropping just the bad field, since a
// partial silent drop would look like a successful save while quietly
// losing data. The server re-validates independently regardless (this
// filter is just to avoid a real edit failing to save over an unrelated
// field neither side actually meant to write).
function commitRestrictedClientEdits() {
  const indicator = document.getElementById("autosaveIndicator");
  if (!pendingLocalClientEdits.size) return;

  if (indicator) {
    indicator.innerHTML = "Syncing... 🔄";
    indicator.style.opacity = "1";
  }

  // Never build a save payload before the first real fetch has told us
  // what the server actually has - see restrictedClientsDbFirstSyncPromise's
  // own comment for the incident this specifically closes. If a save
  // fires before boot's first sync has resolved, wait for it (not just
  // skip and hope another edit triggers a retry later, the way the
  // unrestricted path's analogous shard-count guard does - that's fine
  // there because the debounce is short and edits are frequent, but a
  // restricted teammate's very first interaction on a fresh load
  // shouldn't risk silently going nowhere).
  const ready = restrictedClientsDbFirstSyncPromise || Promise.resolve();
  ready.then(() => commitRestrictedClientEditsNow()).catch(() => commitRestrictedClientEditsNow());
}

function commitRestrictedClientEditsNow() {
  const indicator = document.getElementById("autosaveIndicator");
  const names = Array.from(pendingLocalClientEdits);
  if (!names.length) return;

  const allowedSet = new Set(restrictedAllowedSections || []);

  const writes = names.map(name => {
    const client = clientsDb[name];
    if (!client) return Promise.resolve({ ok: true });
    const serverClient = restrictedLastServerClientState[name] || {};
    const fields = {};
    Object.keys(client).forEach(key => {
      if (RESTRICTED_WRITE_IDENTITY_FIELDS.indexOf(key) !== -1) return;
      const section = CLIENT_FIELD_SECTIONS_MIRROR[key];
      if (!section || !allowedSet.has(section)) return;
      // Only send fields that actually differ from the last
      // server-confirmed state for this client - see
      // restrictedLastServerClientState's own comment above for why this
      // matters more than it might look like it should.
      if (JSON.stringify(client[key]) !== JSON.stringify(serverClient[key])) {
        fields[key] = client[key];
      }
    });
    if (!Object.keys(fields).length) return Promise.resolve({ ok: true });
    return fetch('/api/restricted-client-data', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName: name, fields })
    }).then(res => res.json().catch(() => ({})).then(data => ({ ok: res.ok, data, name })));
  });

  Promise.all(writes).then(results => {
    names.forEach(name => pendingLocalClientEdits.delete(name));
    const failed = results.filter(r => r && r.ok === false);

    if (indicator) {
      indicator.innerHTML = failed.length ? "Save Failed ❌" : "Saved to Cloud ✅";
      setTimeout(() => { indicator.style.opacity = "0"; }, failed.length ? 4000 : 2000);
    }

    if (failed.length) {
      console.error("commitRestrictedClientEdits: server rejected some fields:", failed);
      const firstError = (failed[0].data && failed[0].data.error) || "not permitted.";
      showBanner("error", "Couldn't save some changes: " + firstError);
    } else {
      // Refetch so this restricted view reflects the confirmed cloud
      // state right away, rather than waiting up to a minute for the
      // next poll (see startRestrictedClientsDbSync).
      fetchRestrictedClientsDbSnapshot();
    }
  }).catch(err => {
    console.error("commitRestrictedClientEdits failed:", err);
    if (indicator) {
      indicator.innerHTML = "Cloud Save Error ❌";
      setTimeout(() => { indicator.style.opacity = "0"; }, 4000);
    }
    showBanner("error", "Couldn't save changes to the cloud: " + err.message);
  });
}

function commitDatabaseToCloud() {
  if (isRestrictedClientsDbSync) {
    commitRestrictedClientEdits();
    return;
  }

  const indicator = document.getElementById("autosaveIndicator");

  if (!(window.firebaseSetDoc && window.firebaseDoc && window.firebaseDb)) {
    // Firebase is not loaded!
    if (indicator) {
      indicator.innerHTML = "Firebase Not Loaded ❌";
      setTimeout(() => { indicator.style.opacity = "0"; }, 3000);
    }
    return;
  }

  // SAFETY GUARD: if we're supposed to be listening to cloud shards
  // (lastKnownClientsDbShardCount > 0) but haven't yet received a first
  // snapshot from every one of them, clientsDb in memory is only a
  // partial picture assembled from whichever shards have loaded so far.
  // Writing it back to Firestore now would re-shard that partial picture
  // and blank out whichever clients live in a shard we haven't heard
  // from yet - this is how "Reginald White" and "Evry Intention LLC"
  // silently disappeared. Skip the cloud write until every shard has
  // reported in at least once; the local save above already protects
  // this session's edits in the meantime, and this function gets called
  // again on the next debounced save.
  if (lastKnownClientsDbShardCount > 0 && !clientsDbAllShardsLoaded) {
    console.warn("commitDatabaseToCloud: skipped - not all clientsDb shards have loaded yet (" +
      clientsDbShardsLoadedIndices.size + "/" + lastKnownClientsDbShardCount + ")");
    if (indicator) {
      indicator.innerHTML = "Waiting for cloud sync… ⏳";
      setTimeout(() => { indicator.style.opacity = "0"; }, 3000);
    }
    return;
  }

  const cleanDb = JSON.parse(JSON.stringify(clientsDb));
  const shards = packClientsDbIntoShards(cleanDb);
  // Snapshot which clients are pending as of THIS write (see
  // pendingLocalClientEdits above rebuildClientsDbFromShards) - only these
  // are guaranteed to be included in cleanDb above. Clearing the whole set
  // once this write confirms would incorrectly mark any edit made during
  // the round-trip below as safe, even though it wasn't part of this
  // write (it'll ride along on the next debounced save instead).
  const namesPendingAsOfThisWrite = new Set(pendingLocalClientEdits);

  // Safety-net backup write moved below (see comment there) - it used to
  // fire here, unconditionally, before the version-conflict check further
  // down. That meant a REJECTED save (someone else saved in the meantime)
  // still overwrote the backup docs with this tab's stale/conflicting
  // data, potentially clobbering a newer, correct backup with an older
  // one - undermining the one guarantee the backup exists to provide.
  // Fixed by only firing it once the version check below confirms this
  // tab's data is actually the one being accepted.

  const metaRef = getClientsDbShardMetaDocRef();

  // Add a manual timeout to detect hanging - covers the version check
  // below too, not just the writes, since both are part of one save cycle.
  let resolved = false;
  setTimeout(() => {
    if (!resolved && indicator) {
      indicator.innerHTML = "Cloud Timeout ❌";
      setTimeout(() => { indicator.style.opacity = "0"; }, 3000);
    }
  }, 10000);

  // Optimistic-concurrency guard, same version-field pattern as every
  // other agency/* doc (see saveVersionedAgencyDoc) - re-read the meta
  // doc's version fresh right before writing, and refuse the ENTIRE save
  // (not just the meta doc) if it moved since this tab last synced,
  // rather than silently overwriting whatever another admin just saved
  // elsewhere in the client roster. This is deliberately the same
  // hard-block-and-ask behavior as everywhere else, not a softer
  // auto-merge - clientsDb fires this on nearly every edit across the
  // whole Hub, so a rejected save is expected to be rare in practice for
  // a team this size, and staying consistent with the pattern every other
  // tool already uses (rather than inventing a different, more complex
  // behavior just for this one doc) keeps the "someone else saved, reload
  // and redo" mental model the same everywhere an admin might see it.
  window.firebaseGetDoc(metaRef).then((freshMetaSnap) => {
    const freshVersion = (freshMetaSnap.exists && typeof freshMetaSnap.data().version === "number")
      ? freshMetaSnap.data().version : 0;

    if (freshVersion !== clientsDbDocVersion) {
      resolved = true;
      console.warn("commitDatabaseToCloud: skipped - clientsDb changed elsewhere since this tab last synced (local v" +
        clientsDbDocVersion + " vs cloud v" + freshVersion + ").");
      if (indicator) {
        indicator.innerHTML = "Save Skipped ⚠️";
        // No auto-fade-out here (unlike the normal 2s/3s/5s cases just
        // above/below) - matches showSaveConflictBanner not auto-hiding,
        // so the sidebar's own little status text stays consistent with
        // the banner instead of quietly reverting to normal while the
        // real problem (banner still up, edit still unsaved) persists.
      }
      showSaveConflictBanner("Someone else just saved changes to the client database while you had this open, so your last change wasn't saved - saving it now would have overwritten theirs. Click Reload Now to pick up their update (the Hub already reflects it live in the background), then redo your last edit.");
      return;
    }

    // SECOND SAFETY NET (Aug 2026, after Evry Intention LLC vanished a
    // second time with a matching version number): the check above only
    // catches a STALE VERSION NUMBER, which assumes clientsDbDocVersion
    // and clientsDb's actual CONTENT always move together. They don't
    // always - clientsDbDocVersion is kept fresh by a separate listener on
    // the tiny meta doc (see startUnrestrictedClientsDbSync), while
    // clientsDb's real content comes from the per-shard listeners
    // (listenToClientsDbShard). A backgrounded/throttled tab can keep the
    // cheap meta listener alive (so its version number looks current)
    // while a shard listener silently stalls (so its actual client list is
    // stale) - version match, content mismatch, and the check above waves
    // it through. Catch that here with an actual content comparison: fetch
    // the real shard documents fresh (not just their tiny meta counter)
    // and refuse to save if the cloud currently has ANY client this tab
    // doesn't - that's the fingerprint of a stale tab about to blank out a
    // client it never knew existed, same failure mode that lost Evry
    // Intention LLC. A deliberate deletion never trips this, since
    // deleteActiveClient() runs in a tab that just loaded that client and
    // is removing a key IT knows about, not one it's silently unaware of.
    const freshShardCount = (freshMetaSnap.exists && typeof freshMetaSnap.data().count === "number")
      ? freshMetaSnap.data().count : lastKnownClientsDbShardCount;
    const cloudKeyCheck = Promise.all(
      Array.from({ length: freshShardCount }, (_, i) => window.firebaseGetDoc(getClientsDbShardDocRef(i)))
    ).then((freshShardSnaps) => {
      const cloudKeys = new Set();
      freshShardSnaps.forEach(snap => {
        if (snap.exists) Object.keys(snap.data() || {}).forEach(k => cloudKeys.add(k));
      });
      const localKeys = new Set(Object.keys(cleanDb));
      // Exclude anything this tab itself deliberately deleted/renamed away
      // this session (see intentionallyRemovedClientNames above) - those
      // are legitimate, not a sign of stale data.
      return Array.from(cloudKeys).filter(k => !localKeys.has(k) && !intentionallyRemovedClientNames.has(k));
    });

    return cloudKeyCheck.then((missingLocally) => {
      if (missingLocally.length > 0) {
        resolved = true;
        console.warn("commitDatabaseToCloud: skipped - cloud has client(s) this tab doesn't know about (stale tab guard):", missingLocally);
        if (indicator) {
          indicator.innerHTML = "Save Skipped ⚠️";
        }
        showSaveConflictBanner(
          `This tab's client list is out of date - the cloud currently has a client ("${missingLocally.join('", "')}") this tab never loaded, likely because this tab has been open a while. Saving now would have erased ${missingLocally.length > 1 ? "them" : "it"}, so nothing was saved. Click Reload Now to pick up the current data, then redo your last edit.`
        );
        return;
      }

      // Safety-net backup: a "last known good" full snapshot, written
      // alongside the real shards now that both checks above have
      // confirmed this tab's data is fresh and about to be accepted (moved
      // here, after those checks, so a rejected save never overwrites the
      // backup with stale data - see the comment where this used to live).
      // If the live shards ever get corrupted again for any reason, this is
      // always a recent, complete copy to recover from - see
      // agency/clientsDbBackup-shard-0, -1, etc. and
      // agency/clientsDbBackupShardMeta. Sharded the exact same way as the
      // live data (reusing the `shards` array above) so it can't hit
      // Firestore's ~1MB per-document limit as the client roster grows.
      // Fire-and-forget: a backup failure shouldn't block or alarm the user
      // about the actual save below. (agency/clientsDbBackup, the old
      // single-document location, is no longer written to.)
      const backupMetaRef = window.firebaseDoc(window.firebaseDb, "agency", "clientsDbBackupShardMeta");
      window.firebaseGetDoc(backupMetaRef).then((backupMetaSnap) => {
        const prevBackupShardCount = (backupMetaSnap.exists && typeof backupMetaSnap.data().count === 'number')
          ? backupMetaSnap.data().count : 0;

        const backupWrites = shards.map((shardObj, i) => {
          const ref = window.firebaseDoc(window.firebaseDb, "agency", "clientsDbBackup-shard-" + i);
          return window.firebaseSetDoc(ref, shardObj);
        });
        // Blank out any trailing backup shards left over from a larger
        // previous backup, same reasoning as the live-shard cleanup below.
        for (let i = shards.length; i < prevBackupShardCount; i++) {
          const ref = window.firebaseDoc(window.firebaseDb, "agency", "clientsDbBackup-shard-" + i);
          backupWrites.push(window.firebaseSetDoc(ref, {}));
        }
        backupWrites.push(window.firebaseSetDoc(backupMetaRef, { count: shards.length, savedAt: new Date().toISOString() }));

        return Promise.all(backupWrites);
      }).catch(err => console.error("clientsDb backup write failed:", err));

      const writes = shards.map((shardObj, i) => {
        const docRef = getClientsDbShardDocRef(i);
        return window.firebaseSetDoc(docRef, shardObj);
      });

      // If the client list just got shorter (client deleted) and now needs
      // fewer shards than last time, blank out the now-unused trailing shard
      // documents instead of leaving stale client data sitting in them.
      for (let i = shards.length; i < lastKnownClientsDbShardCount; i++) {
        const docRef = getClientsDbShardDocRef(i);
        writes.push(window.firebaseSetDoc(docRef, {}));
      }

      const nextVersion = freshVersion + 1;
      writes.push(window.firebaseSetDoc(metaRef, { count: shards.length, version: nextVersion }));

      return Promise.all(writes).then(() => {
        resolved = true;
        clientsDbDocVersion = nextVersion;
        namesPendingAsOfThisWrite.forEach(name => pendingLocalClientEdits.delete(name));
        if (indicator) {
          indicator.innerHTML = "Saved to Cloud ✅";
          setTimeout(() => { indicator.style.opacity = "0"; }, 2000);
        }

        // Mirror only the portal-facing subset of each client into its own
        // public document (see syncPublicPortalDocs). The full clientsDb
        // data above is admin-only under Firestore rules; this is what the
        // unauthenticated client portal is allowed to read. Only runs after
        // a confirmed successful save - cleanDb shouldn't be pushed out to
        // the public portal on a skipped/failed save, since it may not
        // reflect the true current state.
        syncPublicPortalDocs(cleanDb).catch(err => {
          console.error("Public portal sync failed:", err);
        });
      });
    });
  }).catch(err => {
    resolved = true;
    console.error("Firebase save failed:", err);
    if (indicator) {
      indicator.innerHTML = "Cloud Error ❌: " + err.message;
      setTimeout(() => { indicator.style.opacity = "0"; }, 5000);
    }
  });
}

// Push the portal-facing subset (branding + checklist) of every client that
// has an active magic link out to clients/{magicToken}. That document's ID
// *is* the capability token: Firestore rules allow anyone to GET a single
// doc by its exact ID but never LIST the collection, so only someone
// holding the actual magic link can read a given client's portal data.
// Non-portal fields (proposals, SEO audits, internal notes, etc.) never
// leave the admin-only agency/clientsDb document.
function foldInOnboardingChecked(targetCategories, existingCategories) {
  if (!Array.isArray(targetCategories) || !Array.isArray(existingCategories)) return false;
  const checkedIds = new Set();
  existingCategories.forEach(cat => (cat.items || []).forEach(item => {
    if (item.checked) checkedIds.add(item.id);
  }));
  let changed = false;
  targetCategories.forEach(cat => (cat.items || []).forEach(item => {
    if (checkedIds.has(item.id) && !item.checked) {
      item.checked = true;
      changed = true;
    }
  }));
  return changed;
}

// Keeps the admin's in-memory clientChecklist in sync with whatever the
// client's own portal doc actually says, in both directions (checked and
// unchecked). Used by ensureClientPortalListeners' onSnapshot handler
// below, which fires because the client's portal doc just changed in
// Firestore - so "existingItems" here is the freshest truth available.
// (There used to also be a one-directional version of this run defensively
// inside syncPublicPortalDocs, at save time, but it only ever pulled a
// checked box IN from the portal, never matched an unchecked one - which
// meant an account manager unchecking a box in Client Portal Manager and
// saving would get silently reverted back to checked. Since this listener
// already keeps clientsDb bidirectionally in sync continuously, that extra
// fold at save time was both redundant and the actual source of that bug,
// so it was removed rather than fixed in place.)
function syncClientChecklistFromPortal(targetItems, existingItems) {
  if (!Array.isArray(targetItems) || !Array.isArray(existingItems)) return false;
  const existingCheckedById = new Map(existingItems.map(item => [item.id, !!item.checked]));
  let changed = false;
  targetItems.forEach(item => {
    if (!existingCheckedById.has(item.id)) return;
    const existingChecked = existingCheckedById.get(item.id);
    if (!!item.checked !== existingChecked) {
      item.checked = existingChecked;
      changed = true;
    }
  });
  return changed;
}

// Pull any approval decisions the client already made (which write
// straight to the public clients/{token} doc, same as the checklist) into
// a target object with .pendingApprovals / .approvalHistory arrays -
// moving the decided item out of pending and into history. Works whether
// "target" is the real live client object (ensureClientPortalListeners)
// or a throwaway wrapper around an outgoing-write clone
// (syncPublicPortalDocs), since both just need their two array
// properties reassigned in place.
// Pull in a client's testimonial submission (written straight to the
// public clients/{token} doc via the portal's Leave a Testimonial view,
// same as checklist/approvals above) into a target object's
// .testimonialSubmission property. Simpler than foldInApprovalDecisions
// since it's a single write-once object, not two arrays to reconcile -
// just copy it over if the target doesn't have it yet or it's changed.
function foldInTestimonialSubmission(target, publicData) {
  if (!target || !publicData || !publicData.testimonialSubmission) return false;
  const incoming = publicData.testimonialSubmission;
  const current = target.testimonialSubmission;
  if (current && current.submittedDate === incoming.submittedDate && current.quote === incoming.quote) {
    return false; // already have this exact submission, nothing changed
  }
  target.testimonialSubmission = incoming;
  return true;
}

// moodBoardViews is a {boardId: firstViewedAt} map the portal writes to
// when the client opens the Mood Boards tab (see recordMoodBoardViews in
// portal/js/app.js). Write-once per boardId on the portal's side, and
// this fold is the same: a key already present here never gets
// overwritten by an incoming value, so re-visiting a board later doesn't
// look like a "change" and doesn't re-trigger anything downstream. The
// caller (ensureClientPortalListeners) is what turns a genuinely NEW key
// into an admin notification, by diffing target.moodBoardViews before vs.
// after calling this.
function foldInMoodBoardViews(target, publicData) {
  if (!target || !publicData || !publicData.moodBoardViews) return false;
  if (!target.moodBoardViews) target.moodBoardViews = {};
  let changed = false;
  Object.keys(publicData.moodBoardViews).forEach(boardId => {
    if (!target.moodBoardViews[boardId]) {
      target.moodBoardViews[boardId] = publicData.moodBoardViews[boardId];
      changed = true;
    }
  });
  return changed;
}

// Same idea as foldInMoodBoardViews just above, for the style-scale
// sliders the client drags in their Portal (see saveMoodBoardStyleFeedback
// in portal/js/app.js). Keyed by boardId same as moodBoardViews, but this
// one isn't strictly write-once - a client can re-rate a board after
// changing their mind, so an incoming entry always overwrites (compared
// by updatedAt, so an older/duplicate snapshot fire doesn't count as a
// "change" and re-trigger a notification).
function foldInMoodBoardStyleFeedback(target, publicData) {
  if (!target || !publicData || !publicData.moodBoardStyleFeedback) return false;
  if (!target.moodBoardStyleFeedback) target.moodBoardStyleFeedback = {};
  let changed = false;
  Object.keys(publicData.moodBoardStyleFeedback).forEach(boardId => {
    const incoming = publicData.moodBoardStyleFeedback[boardId];
    const current = target.moodBoardStyleFeedback[boardId];
    if (!current || current.updatedAt !== incoming.updatedAt) {
      target.moodBoardStyleFeedback[boardId] = incoming;
      changed = true;
    }
  });
  return changed;
}

// Pin/circle annotations on mood board images (see saveAnnotationDraft in
// portal/js/app.js and the admin mirror in mood-board-builder/js/app.js).
// Shaped as moodBoardAnnotations[boardId][imageId] -> array of annotation
// objects, and unlike moodBoardStyleFeedback this array can be appended to
// from BOTH sides (a client dropping their own pin, an admin leaving an
// internal note on the same image) - so this can't just compare a single
// updatedAt stamp and take-all-or-nothing like that fold does. Instead it
// merges item-by-item, keyed by each annotation's own unique id, and only
// ever adds an item in that target doesn't already have - it never removes
// one, same "only ever grows" philosophy as foldInMoodBoardViews above.
// This was the missing piece behind mood board notes appearing to save and
// then vanishing: syncPublicPortalDocs below does a full non-merge .set()
// of the public clients/{token} doc on every single admin save (of
// anything, anywhere in the Hub) - without folding the client's own
// annotations into the admin's in-memory copy first, that overwrite wiped
// out any note a client had added since the admin's clientsDb last knew
// about it.
function foldInMoodBoardAnnotations(target, publicData) {
  if (!target || !publicData || !publicData.moodBoardAnnotations) return false;
  if (!target.moodBoardAnnotations) target.moodBoardAnnotations = {};
  let changed = false;
  Object.keys(publicData.moodBoardAnnotations).forEach(boardId => {
    const incomingBoard = publicData.moodBoardAnnotations[boardId] || {};
    if (!target.moodBoardAnnotations[boardId]) target.moodBoardAnnotations[boardId] = {};
    Object.keys(incomingBoard).forEach(imageId => {
      const incomingList = Array.isArray(incomingBoard[imageId]) ? incomingBoard[imageId] : [];
      const existingList = Array.isArray(target.moodBoardAnnotations[boardId][imageId])
        ? target.moodBoardAnnotations[boardId][imageId] : [];
      const existingIds = new Set(existingList.map(a => a.id));
      const merged = existingList.slice();
      incomingList.forEach(a => {
        if (!existingIds.has(a.id)) {
          merged.push(a);
          changed = true;
        }
      });
      target.moodBoardAnnotations[boardId][imageId] = merged;
    });
  });
  return changed;
}

// Client-submitted satisfaction pulse (see submitPulseFeedback in
// portal/js/app.js - a lightweight "how's it going" rating the client
// can leave from their portal, distinct from the AM's own internal read
// on the account in Weekly Check-In's healthRating/seeingValue fields).
// Same flat "only ever grows, merge by id" shape and reasoning as
// foldInMoodBoardAnnotations just above - required for the exact same
// reason: syncPublicPortalDocs' non-merge .set() would otherwise wipe
// out a client's pulse submission the next time an admin saved anything
// elsewhere in the Hub, if it wasn't folded into clientsDb first.
function foldInClientPulseFeedback(target, publicData) {
  if (!target || !publicData || !Array.isArray(publicData.clientPulseFeedback)) return false;
  if (!Array.isArray(target.clientPulseFeedback)) target.clientPulseFeedback = [];
  const existingIds = new Set(target.clientPulseFeedback.map(p => p.id));
  let changed = false;
  publicData.clientPulseFeedback.forEach(p => {
    if (!existingIds.has(p.id)) {
      target.clientPulseFeedback.push(p);
      changed = true;
    }
  });
  return changed;
}

// Appends one entry to a client's notification feed (the bell icon on
// their portal). Admin-only to create - called from wherever the hub
// pushes something the client needs to know about (a new approval request,
// a newly published report). The client can only ever mark entries read,
// never add their own - see foldInNotificationReadState below and the
// matching Firestore rule. Exposed on window (plain function declarations
// do this automatically in a classic script) so tool iframes like Client
// Portal Manager and Monthly Report Archive can call it via
// window.parent.pushClientNotification(client, type, message).
function pushClientNotification(client, type, message) {
  if (!client) return;
  if (!Array.isArray(client.notifications)) client.notifications = [];
  client.notifications.unshift({
    id: 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    type: type || 'info',
    message: message,
    createdAt: new Date().toISOString(),
    read: false
  });
  // Cap so this doesn't grow unbounded over a long client relationship.
  if (client.notifications.length > 30) client.notifications.length = 30;
}

// Notifications are admin-authored only - the client can never create one,
// only mark an existing one read. So the only thing that needs folding in
// from the existing public doc before every save is which ones the client
// has already read, the same one-directional "only ever flips one way"
// pattern as foldInOnboardingChecked above (never un-reads something).
function foldInNotificationReadState(targetNotifications, existingNotifications) {
  if (!Array.isArray(targetNotifications) || !Array.isArray(existingNotifications)) return false;
  const readIds = new Set(existingNotifications.filter(n => n.read).map(n => n.id));
  let changed = false;
  targetNotifications.forEach(n => {
    if (readIds.has(n.id) && !n.read) {
      n.read = true;
      changed = true;
    }
  });
  return changed;
}

// ── Admin-side notification bell ──
// Mirrors the client portal's bell, but for Ronald: flags when a client
// approves/requests revision on a deliverable, or submits a testimonial,
// so he doesn't have to have that client open in the Hub to notice. Kept
// in its own agency-wide Firestore doc (like the Contract & Invoice
// Tracker's agency/contractInvoices) rather than per-client, since this is
// a single admin-facing feed across every client at once. Loaded once at
// boot and written whenever a new one is pushed - no live listener, since
// this session is always the one generating them (client-driven events
// arrive via ensureClientPortalListeners below, which already runs
// continuously in this same session).
let adminNotifications = [];

async function loadAdminNotifications() {
  if (!window.firebaseDb || !window.firebaseDb.collection) return;
  try {
    const snap = await window.firebaseDb.collection("agency").doc("adminNotifications").get();
    adminNotifications = (snap.exists && snap.data().list) || [];
  } catch (e) {
    console.warn("Could not load admin notifications:", e);
    adminNotifications = [];
  }
  // One-time cleanup for the pile-up bug fixed alongside this (see the
  // saveDatabase() comment in ensureClientPortalListeners): the same
  // client event could get re-notified on every reload for as long as
  // that bug was live, leaving exact-duplicate entries (same type+
  // message+clientName) sitting in this list. Collapse them here so
  // anyone who already hit this doesn't have to manually clear a pile of
  // repeats - keeps the newest occurrence of each (list is newest-first),
  // carrying forward read:true if ANY duplicate of it had been read.
  const seen = new Map();
  const deduped = [];
  let removedAny = false;
  adminNotifications.forEach(n => {
    const key = `${n.type || ""}|${n.message || ""}|${n.clientName || ""}`;
    if (seen.has(key)) {
      if (n.read) seen.get(key).read = true;
      removedAny = true;
      return;
    }
    seen.set(key, n);
    deduped.push(n);
  });
  if (removedAny) {
    adminNotifications = deduped;
    persistAdminNotifications();
  }
  renderAdminNotifications();
}

function persistAdminNotifications() {
  if (!window.firebaseDb || !window.firebaseDb.collection) return;
  window.firebaseDb.collection("agency").doc("adminNotifications").set({ list: adminNotifications }).catch(e => {
    console.error("Could not save admin notifications:", e);
  });
}

function pushAdminNotification(type, message, clientName, draftEmail) {
  // Defense-in-depth against the pile-up bug fixed alongside this (see
  // the saveDatabase() comment in ensureClientPortalListeners): don't add
  // an exact duplicate (same type+message+clientName) of one that's
  // already sitting in the list, read or not. The real fix is making sure
  // the fold that feeds this actually persists to the cloud so the same
  // event can't look "new" again on a later reload, but this guard means
  // even some other future edge case can't spam the same notification
  // over and over.
  // Scoped to unread only: once a matching notification has actually been
  // seen and marked read, a later genuinely-new event with the same
  // generic wording (message text doesn't include a timestamp/note body)
  // should still be allowed through rather than staying suppressed
  // forever.
  const dupeKey = `${type || ""}|${message || ""}|${clientName || ""}`;
  const alreadyExists = adminNotifications.some(n => !n.read && `${n.type || ""}|${n.message || ""}|${n.clientName || ""}` === dupeKey);
  if (alreadyExists) return;

  adminNotifications.unshift({
    id: 'an_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    type: type || 'info',
    message: message,
    clientName: clientName || null,
    // Optional {to, subject, body, from?, sendEnabled?}. Most flows still
    // only produce a pre-filled draft the admin reviews and sends
    // themselves via mailto/copy (see Auto-Send Email Integration Plan.md)
    // - same pattern as buildApprovalEmail in client-portal-manager. Drafts
    // with sendEnabled:true (currently just the stale-client nudge, wired
    // first per the plan's rollout order) also get a real "Send" button
    // that calls /api/send-email server-side via Resend.
    draftEmail: draftEmail || null,
    createdAt: new Date().toISOString(),
    read: false,
    sent: false
  });
  if (adminNotifications.length > 30) adminNotifications.length = 30;
  persistAdminNotifications();
  renderAdminNotifications();
}

// Builds a reminder-email draft for the stale-client nudge. This is the
// first flow wired to real auto-send (see Auto-Send Email Integration
// Plan.md) - sendEnabled:true is what makes buildDraftEmailPanel() show a
// real "Send" button instead of just Copy/mailto. "from" is the account
// manager's own @revitalproductions.com address (root-domain Resend
// verification lets us send as them directly), so replies land straight in
// their inbox with no Reply-To trick needed. Falls back to no send button
// at all if either the account manager's email or the client's contact
// email is missing - Copy/mailto still work either way.
function buildStaleNudgeDraftEmail(client, name, pendingCount) {
  const config = client.portalConfig || {};
  if (!config.clientContactEmail) return null;

  const contactFirstName = (config.clientContactName || name).split(' ')[0];
  const amFirstName = config.accountManagerName ? config.accountManagerName.split(' ')[0] : "our team";
  const magicLink = config.magicToken
    ? `${window.location.origin}/portal/index.html?c=${encodeURIComponent(name)}&t=${config.magicToken}`
    : "";
  const approvalPhrase = pendingCount === 1 ? "an approval" : `${pendingCount} approvals`;

  const subject = `Quick follow-up - ${approvalPhrase} waiting on your review`;
  const body = `Hi ${contactFirstName},\n\nJust a friendly nudge - you have ${approvalPhrase} waiting for your review in your client portal:\n${magicLink}\n\nLet us know if anything's unclear or you'd like to hop on a quick call.\n\nThanks,\n${amFirstName}`;

  const draft = { to: config.clientContactEmail, subject: subject, body: body };
  if (config.accountManagerEmail && config.accountManagerName) {
    draft.from = `${config.accountManagerName} <${config.accountManagerEmail}>`;
    draft.sendEnabled = true;
  }
  return draft;
}

// Builds the testimonial-ask draft email - triggered from
// weekly-account-checkin/js/app.js the moment a client's health rating
// flips to Green, since that's the best moment to ask while they're happy.
// Real auto-send (not a draft-you-click-Send notification like the ones
// below) - straight to /api/send-email, same route and auth the manual
// "Send" button in the notification bell already uses (see that click
// handler further down). This is deliberately different from
// buildTestimonialAskDraftEmail/buildRenewalNudgeDraftEmail's
// draft-review pattern: those are CLIENT-facing emails sent under a
// specific staff member's name, so a human reviews the wording before
// it goes out. This is an INTERNAL alert to the account manager about
// their own client - same trust level as the Weekly Health Digest or
// idle-lock PIN emails, which already send with no click, so there's no
// draft-review step to skip here. Silently does nothing if there's no
// account manager email on file (nobody to alert) - the in-Hub bell
// notification pushed alongside this call still catches it for whoever
// next opens the Hub.
function emailAccountManagerLowPulseAlert(client, name, pulseEntry) {
  const config = client.portalConfig || {};
  if (!config.accountManagerEmail) return;
  if (!window.firebaseAuthReady) return; // no authenticated admin session to send under

  const amFirstName = config.accountManagerName ? config.accountManagerName.split(' ')[0] : "there";
  const subject = `Low satisfaction rating from ${name}`;
  const body = `Hi ${amFirstName},\n\n${name} just left a ${pulseEntry.rating}/5 satisfaction rating from their client portal.${pulseEntry.comment ? `\n\nTheir comment:\n"${pulseEntry.comment}"` : ' (No comment left.)'}\n\nWorth a check-in before this shows up somewhere more public. See Agency Health Dashboard in the Hub for the full picture on this account.\n\n— Revital Hub`;

  fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: config.accountManagerEmail, subject, body })
  }).catch(e => {
    console.warn("Low-pulse alert email failed to send (in-Hub notification still fired):", e);
  });
}

// Sales → Delivery handoff notification - mirrors the documented process's
// Zap 1 ("Action 1: Email notification to account manager with client
// details + next steps"), fired from Kickoff Prep & Deck's handoff step
// instead of a Zapier/Google Forms trigger. Same fire-and-forget pattern as
// emailAccountManagerLowPulseAlert above (internal staff alert, not a
// client-facing send, so no draft-review step).
function emailAccountManagerHandoffNotification(client, notes, clientNameOverride) {
  const config = client.portalConfig || {};
  if (!config.accountManagerEmail) return;
  if (!window.firebaseAuthReady) return; // no authenticated admin session to send under

  const amFirstName = config.accountManagerName ? config.accountManagerName.split(' ')[0] : "there";
  const clientName = clientNameOverride || client.name || "This client";
  const subject = `New account handoff: ${clientName}`;
  const body = `Hi ${amFirstName},\n\n${clientName} just closed and is being handed off to you as account manager.${notes ? `\n\nNotes from sales:\n${notes}` : ''}\n\nNext steps: get the client profile and portal set up in the Hub, work through onboarding, and get the kickoff call on the calendar. Kickoff Prep & Deck in the Hub has the discovery call recap and a client-facing kickoff deck you can build straight from it.\n\n— Revital Hub`;

  fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: config.accountManagerEmail, subject, body })
  }).catch(e => {
    console.warn("Handoff notification email failed to send (handoff still logged):", e);
  });
}

// Exposed on window (implicit for a plain top-level function in a
// non-module script) so that iframe can call
// window.parent.buildTestimonialAskDraftEmail(client, name) the same way
// it already calls window.parent.pushAdminNotification. Same
// sendEnabled/from pattern as the stale-client nudge above - no account
// manager configured means no Send button, Copy/mailto only.
function buildTestimonialAskDraftEmail(client, name) {
  const config = client.portalConfig || {};
  if (!config.clientContactEmail) return null;

  const contactFirstName = (config.clientContactName || name).split(' ')[0];
  const amFirstName = config.accountManagerName ? config.accountManagerName.split(' ')[0] : "our team";
  const magicLink = config.magicToken
    ? `${window.location.origin}/portal/index.html?c=${encodeURIComponent(name)}&t=${config.magicToken}`
    : "";

  const subject = `Quick favor - would you share a testimonial?`;
  const body = `Hi ${contactFirstName},\n\nThings have been going really well lately, and we'd love it if you had a minute to share a quick testimonial about working with us - it really helps other clients get a sense of what to expect.\n\nYou can leave one right from your client portal, under "Leave a Testimonial":\n${magicLink}\n\nNo pressure at all, and thank you either way for being a great client to work with!\n\nThanks,\n${amFirstName}`;

  const draft = { to: config.clientContactEmail, subject: subject, body: body };
  if (config.accountManagerEmail && config.accountManagerName) {
    draft.from = `${config.accountManagerName} <${config.accountManagerEmail}>`;
    draft.sendEnabled = true;
  }
  return draft;
}

// Templates in the Email Template Library are authored as simple <p>/<br>
// HTML (see email-template-library/js/data.js), not full markup - a
// lightweight regex swap to plain text is enough for a mailto body without
// needing a real HTML parser.
function templateHtmlToPlainText(html) {
  return (html || "")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function fillTemplateVars(text, vars) {
  return Object.keys(vars).reduce((acc, key) => acc.split(`{{${key}}}`).join(vars[key] || ""), text);
}

async function fetchEmailTemplateById(templateId) {
  if (!window.firebaseDb || !window.firebaseDb.collection) return null;
  try {
    const snap = await window.firebaseDb.collection("agency").doc("emailTemplates").get();
    const list = (snap.exists && snap.data().list) || [];
    return list.find(t => t.id === templateId) || null;
  } catch (e) {
    console.warn(`Could not fetch email template ${templateId}:`, e);
    return null;
  }
}

// Fires once, right when a new client workspace is created (Day 1 of the
// Client Onboarding SOP) - pulls the real Welcome Email (#8) and Intake
// Form (#17) templates from the Email Template Library and substitutes
// whatever client info exists so far. This is just a reference/reminder
// copy for the notification bell - contact name / account manager name
// are usually still blank at this exact moment (Client Portal Manager
// hasn't been filled in yet for a brand-new client), so it can't be the
// real send. The real send (with the actual PDF attached, via Resend)
// lives inside the Welcome Guide Gen / Intake Request Gen tools
// themselves, as an "Email to Client" button - deliberately manual,
// since whoever fills in those tools (account manager for Welcome, sales
// or account manager for Intake) is the one who knows when it's actually
// ready to go out, not a fixed timing rule.
async function generateNewClientOnboardingEmails(client, name) {
  const config = client.portalConfig || {};
  const contactName = config.clientContactName || name;
  const accountManagerName = config.accountManagerName || "the Revital Productions team";
  const contactEmail = config.clientContactEmail || "";

  const [welcomeTpl, intakeTpl] = await Promise.all([
    fetchEmailTemplateById("tpl-welcome-8"),
    fetchEmailTemplateById("tpl-intake-send-17")
  ]);

  if (welcomeTpl) {
    const filled = fillTemplateVars(welcomeTpl.content, { contactName, clientName: name, accountManagerName });
    const body = templateHtmlToPlainText(filled) + "\n\n[Reference copy only - once this client's Account Manager info is filled in, use the \"Email to Client\" button inside the Welcome Guide Gen tool to send this with the real PDF attached.]";
    pushAdminNotification(
      'client_welcome_email',
      `Welcome email drafted for ${name}.`,
      name,
      { to: contactEmail, subject: welcomeTpl.subjectLine, body: body }
    );
  }

  if (intakeTpl) {
    const filled = fillTemplateVars(intakeTpl.content, { contactName, clientName: name, accountManagerName });
    const body = templateHtmlToPlainText(filled) + "\n\n[Reference copy only - once this client's Account Manager info is filled in, use the \"Email to Client\" button inside the Intake Request Gen tool to send this with the real PDF attached.]";
    pushAdminNotification(
      'client_intake_email',
      `Intake form email drafted for ${name}.`,
      name,
      { to: contactEmail, subject: intakeTpl.subjectLine, body: body }
    );
  }
}

// Slow-moving signal, so this only needs to run occasionally rather than on
// every refreshAllViews() call (which fires on nearly every save). Flags
// clients who have something waiting on them (a pending approval) AND
// haven't opened their portal in a while - the two together are what make
// it worth a nudge, since a stale visit with nothing pending just means
// there's nothing new to look at.
let lastStaleNudgeCheckAt = 0;
const STALE_NUDGE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // re-scan at most hourly
const STALE_NUDGE_DAYS_THRESHOLD = 7;
const STALE_NUDGE_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // don't re-nudge same client within 3 days

// Builds a renewal-reminder email draft - same "who's this for" shape as
// buildStaleNudgeDraftEmail above (sendEnabled:true + a real "from" only
// when the account manager's name/email and the client's contact email
// are both on file). Renewal date comes from Renewal Tracker's own
// client.renewal (see runRenewalNudgeCheck) - the source of truth for
// this, not Contract & Invoice Tracker's contractRenewalDate.
function buildRenewalNudgeDraftEmail(client, name, days) {
  const config = client.portalConfig || {};
  if (!config.clientContactEmail) return null;

  const contactFirstName = (config.clientContactName || name).split(' ')[0];
  const amFirstName = config.accountManagerName ? config.accountManagerName.split(' ')[0] : "our team";
  const whenPhrase = days < 0
    ? `was due to renew ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
    : days === 0
      ? "renews today"
      : `is coming up for renewal in ${days} day${days === 1 ? '' : 's'}`;

  const subject = `Your agreement with Revital Productions — renewal coming up`;
  const body = `Hi ${contactFirstName},\n\nJust a heads-up that your agreement with Revital Productions ${whenPhrase}. Let us know if you'd like to review anything before it renews, or if you have any questions about the next term.\n\nThanks,\n${amFirstName}`;

  const draft = { to: config.clientContactEmail, subject: subject, body: body };
  if (config.accountManagerEmail && config.accountManagerName) {
    draft.from = `${config.accountManagerName} <${config.accountManagerEmail}>`;
    draft.sendEnabled = true;
  }
  return draft;
}

let lastRenewalNudgeCheckAt = 0;
const RENEWAL_NUDGE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // same hourly cadence as the stale-client check
const RENEWAL_NUDGE_DAYS_THRESHOLD = 30; // flag renewals within 30 days (matches My Clients' own renewal note)
const RENEWAL_NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // renewals move slower than portal check-ins, so a longer cooldown than the 3-day stale-client one

// Same notification-bell nudge pattern as runStaleClientNudgeCheck below,
// for contracts coming up (or already overdue) for renewal instead of
// unread portal approvals. Synchronous - Renewal Tracker's own
// client.renewal is the source of truth for this (see renderMyClients'
// renewalNote for the same switch, and why: Contract & Invoice Tracker's
// contractRenewalDate is a second, independent field that isn't
// guaranteed to agree with it), and that's already sitting on clientsDb,
// no extra doc read needed. Called fire-and-forget from refreshAllViews,
// not awaited (still fine to call directly now, but kept as a call site
// rather than inlined so nothing else has to change).
async function runRenewalNudgeCheck() {
  const now = Date.now();
  if (now - lastRenewalNudgeCheckAt < RENEWAL_NUDGE_CHECK_INTERVAL_MS) return;
  lastRenewalNudgeCheckAt = now;

  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client || !client.portalConfig || !client.portalConfig.magicToken) return;
    const rec = client.renewal;
    if (!rec || !rec.renewalDate) return;
    if (rec.status !== 'On Track' && rec.status !== 'At Risk') return; // Renewed/Churned - nothing to nudge about

    const days = Math.round((new Date(rec.renewalDate) - new Date(new Date().toDateString())) / 86400000);
    if (Number.isNaN(days) || days > RENEWAL_NUDGE_DAYS_THRESHOLD) return;

    const alreadyNudged = adminNotifications.some(n =>
      n.type === 'contract_renewal' &&
      n.clientName === name &&
      (now - new Date(n.createdAt).getTime()) < RENEWAL_NUDGE_COOLDOWN_MS
    );
    if (alreadyNudged) return;

    const draftEmail = buildRenewalNudgeDraftEmail(client, name, days);
    const phrase = days < 0 ? `renewal was due ${Math.abs(days)}d ago` : `renews in ${days}d`;
    pushAdminNotification('contract_renewal', `${name}'s contract ${phrase}.`, name, draftEmail);
  });
}

function runStaleClientNudgeCheck() {
  const now = Date.now();
  if (now - lastStaleNudgeCheckAt < STALE_NUDGE_CHECK_INTERVAL_MS) return;
  lastStaleNudgeCheckAt = now;

  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client || !client.portalConfig || !client.portalConfig.magicToken) return;

    const pendingCount = Array.isArray(client.pendingApprovals) ? client.pendingApprovals.length : 0;
    if (pendingCount === 0) return;

    const lastVisited = client.portalLastVisitedAt ? new Date(client.portalLastVisitedAt).getTime() : null;
    const daysSinceVisit = lastVisited ? Math.floor((now - lastVisited) / 86400000) : null;
    const isStale = daysSinceVisit === null || daysSinceVisit >= STALE_NUDGE_DAYS_THRESHOLD;
    if (!isStale) return;

    const alreadyNudged = adminNotifications.some(n =>
      n.type === 'stale_client' &&
      n.clientName === name &&
      (now - new Date(n.createdAt).getTime()) < STALE_NUDGE_COOLDOWN_MS
    );
    if (alreadyNudged) return;

    const visitPhrase = daysSinceVisit === null ? "never opened their portal" : `hasn't opened their portal in ${daysSinceVisit}d`;
    const approvalPhrase = pendingCount === 1 ? "1 pending approval" : `${pendingCount} pending approvals`;
    const draftEmail = buildStaleNudgeDraftEmail(client, name, pendingCount);
    pushAdminNotification('stale_client', `${name} ${visitPhrase} and has ${approvalPhrase} waiting.`, name, draftEmail);
  });
}

// Monthly Reporting Flow (documented process: report delivered by the 5th
// of each month) has never had a safety net in the Hub - Monthly Report
// Archive just stores whatever gets uploaded, nothing flags a client who
// hasn't gotten one lately. Deliberately conservative: only flags clients
// who HAVE at least one prior report on file but it's gone stale, not
// brand-new clients who haven't reached their first report cycle yet -
// there's no "client since" date tracked anywhere to safely tell those two
// cases apart, so a false "overdue" nudge on a two-week-old client would be
// worse than staying silent until their first report actually exists.
// reportArchive entries only have a free-text monthYear (not a structured
// date), so dateAdded (ISO, set at upload time) is what this keys off.
let lastReportOverdueCheckAt = 0;
const REPORT_OVERDUE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // re-scan at most hourly
const REPORT_OVERDUE_DAYS_THRESHOLD = 35; // a few days' grace past the 5th-of-month deadline
const REPORT_OVERDUE_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000; // don't re-nudge same client within 5 days

function runReportOverdueNudgeCheck() {
  const now = Date.now();
  if (now - lastReportOverdueCheckAt < REPORT_OVERDUE_CHECK_INTERVAL_MS) return;
  lastReportOverdueCheckAt = now;

  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client) return;
    const archive = Array.isArray(client.reportArchive) ? client.reportArchive : [];
    if (archive.length === 0) return; // no baseline yet - see comment above

    const latest = archive.reduce((mostRecent, entry) => {
      const t = entry && entry.dateAdded ? new Date(entry.dateAdded).getTime() : 0;
      return t > mostRecent ? t : mostRecent;
    }, 0);
    if (!latest) return;

    const daysSinceReport = Math.floor((now - latest) / 86400000);
    if (daysSinceReport < REPORT_OVERDUE_DAYS_THRESHOLD) return;

    const alreadyNudged = adminNotifications.some(n =>
      n.type === 'report_overdue' &&
      n.clientName === name &&
      (now - new Date(n.createdAt).getTime()) < REPORT_OVERDUE_COOLDOWN_MS
    );
    if (alreadyNudged) return;

    pushAdminNotification('report_overdue', `${name} hasn't had a monthly report added to their archive in ${daysSinceReport}d.`, name);
  });
}

// 90-day re-engagement reminder, per the documented Offboarding Flow's
// "90-day re-engagement reminder set in CRM" step - completedAt is set by
// client-offboarding-checklist/js/app.js's completeOffboarding, the same
// moment the portal gets deactivated, so it doubles as the "offboarded on"
// date this reminder needs (there's no separate field for that anywhere
// else in the client object). Longer cooldown than the other nudges since
// this is a much lower-urgency, periodic "still worth a touch" reminder,
// not something needing daily attention.
let lastReengagementCheckAt = 0;
const REENGAGEMENT_CHECK_INTERVAL_MS = 60 * 60 * 1000; // re-scan at most hourly
const REENGAGEMENT_DAYS_THRESHOLD = 90;
const REENGAGEMENT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // don't re-nudge same client within 30 days

function runReengagementNudgeCheck() {
  const now = Date.now();
  if (now - lastReengagementCheckAt < REENGAGEMENT_CHECK_INTERVAL_MS) return;
  lastReengagementCheckAt = now;

  Object.entries(clientsDb).forEach(([name, client]) => {
    const completedAt = client && client.offboarding && client.offboarding.completedAt;
    if (!completedAt) return;

    const daysSinceOffboarded = Math.floor((now - new Date(completedAt).getTime()) / 86400000);
    if (daysSinceOffboarded < REENGAGEMENT_DAYS_THRESHOLD) return;

    const alreadyNudged = adminNotifications.some(n =>
      n.type === 'reengagement_reminder' &&
      n.clientName === name &&
      (now - new Date(n.createdAt).getTime()) < REENGAGEMENT_COOLDOWN_MS
    );
    if (alreadyNudged) return;

    pushAdminNotification('reengagement_reminder', `${name} was offboarded ${daysSinceOffboarded}d ago - worth a re-engagement outreach?`, name);
  });
}

// Mirrors agency-health-dashboard/js/app.js's getBudgetPaceClass
// (pace-danger branch) - duplicated here rather than reached across the
// iframe boundary, same convention as parsePhaseAmountToNumber above.
function isOverBudgetPace(p) {
  if (!p || !p.totalBudget || p.totalBudget <= 0) return false;
  const start = new Date(p.startDate);
  const end = new Date(p.endDate);
  const now = new Date();
  if (now > end) return true;
  if (now < start) return false;
  const totalDays = (end - start) / 86400000;
  const daysPassed = (now - start) / 86400000;
  const expectedPacingRatio = totalDays > 0 ? daysPassed / totalDays : 1;
  const actualPacingRatio = p.spentToDate / p.totalBudget;
  return actualPacingRatio > expectedPacingRatio * 1.15;
}

const UPSELL_NUDGE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // same hourly cadence as the other nudge checks
const UPSELL_NUDGE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // upsell conversations are infrequent - avoid repeat pings
let lastUpsellNudgeCheckAt = 0;

// Same signal as Agency Health Dashboard's upsellOpportunity: overspending
// (per isOverBudgetPace above) AND not a Red-health client - an
// overspending Red-health client is a churn risk, not someone to pitch a
// bigger retainer to.
async function runUpsellNudgeCheck() {
  const now = Date.now();
  if (now - lastUpsellNudgeCheckAt < UPSELL_NUDGE_CHECK_INTERVAL_MS) return;
  lastUpsellNudgeCheckAt = now;

  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client || !client.portalConfig || !client.portalConfig.magicToken) return;
    if (!isOverBudgetPace(client.budgetPacing)) return;

    const checkins = Array.isArray(client.weeklyCheckins) ? client.weeklyCheckins : [];
    const healthRating = checkins.length ? checkins[0].healthRating : null;
    if (healthRating === 'Red') return;

    const alreadyNudged = adminNotifications.some(n =>
      n.type === 'upsell_opportunity' &&
      n.clientName === name &&
      (now - new Date(n.createdAt).getTime()) < UPSELL_NUDGE_COOLDOWN_MS
    );
    if (alreadyNudged) return;

    pushAdminNotification('upsell_opportunity', `${name} is pacing over budget and healthy - worth a bigger-retainer conversation.`, name, null);
  });
}

const PROPOSAL_FOLLOWUP_NUDGE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const PROPOSAL_FOLLOWUP_NUDGE_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // same cadence as the stale-client nudge
let lastProposalFollowupNudgeCheckAt = 0;

// Proposal Follow-up Tracker's own "overdue" count (summaryOverdue in
// proposal-followup-tracker/js/app.js) was display-only - nothing ever
// nudged about it. Reads agency/proposalFollowUps directly since this
// isn't clientsDb data (these are prospects, not necessarily clients yet).
async function runProposalFollowupNudgeCheck() {
  const now = Date.now();
  if (now - lastProposalFollowupNudgeCheckAt < PROPOSAL_FOLLOWUP_NUDGE_CHECK_INTERVAL_MS) return;
  lastProposalFollowupNudgeCheckAt = now;
  if (!window.firebaseDb || !window.firebaseDb.collection) return;

  let list = [];
  try {
    const snap = await window.firebaseDb.collection("agency").doc("proposalFollowUps").get();
    list = (snap.exists && snap.data().list) || [];
  } catch (e) {
    console.warn("Couldn't load proposal follow-ups for nudge check:", e);
    return;
  }

  const today = new Date().toDateString();
  list.forEach(p => {
    if (p.status !== 'open' || !p.nextFollowUpDate || !p.prospectName) return;
    const daysOverdue = Math.round((new Date(today) - new Date(p.nextFollowUpDate)) / 86400000);
    if (daysOverdue < 1) return;

    const alreadyNudged = adminNotifications.some(n =>
      n.type === 'proposal_followup' &&
      n.clientName === p.prospectName &&
      (now - new Date(n.createdAt).getTime()) < PROPOSAL_FOLLOWUP_NUDGE_COOLDOWN_MS
    );
    if (alreadyNudged) return;

    pushAdminNotification('proposal_followup', `${p.prospectName}'s follow-up is ${daysOverdue}d overdue (stage: ${p.followUpStage || 'not set'}).`, p.prospectName, null);
  });
}

const INSURANCE_RENEWAL_NUDGE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const INSURANCE_RENEWAL_NUDGE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // policies renew slowly - avoid repeat pings
let lastInsuranceRenewalNudgeCheckAt = 0;

// Mirrors business-insurance-tracker/js/app.js's EXPIRING_SOON_DAYS (60)
// and deriveStatus - duplicated here per this codebase's "each caller
// stays self-contained" convention rather than reaching across the
// iframe boundary. ADMIN-ONLY (see ADMIN_ONLY_NOTIF_TYPES near
// renderAdminNotifications): Business Insurance Tracker's own footer
// button is already leadership-gated in applyTeamAccessRestrictions, so
// a nudge about a policy a restricted teammate can't even open would
// leak financial info they're not supposed to see. clientName is
// repurposed here as the policy's own id, purely for dedupe matching -
// renderAdminNotifications never displays it, only compares it.
async function runInsuranceRenewalNudgeCheck() {
  const now = Date.now();
  if (now - lastInsuranceRenewalNudgeCheckAt < INSURANCE_RENEWAL_NUDGE_CHECK_INTERVAL_MS) return;
  lastInsuranceRenewalNudgeCheckAt = now;
  if (!window.firebaseDb || !window.firebaseDb.collection) return;

  let list = [];
  try {
    const snap = await window.firebaseDb.collection("agency").doc("businessInsurance").get();
    list = (snap.exists && snap.data().list) || [];
  } catch (e) {
    console.warn("Couldn't load business insurance for renewal nudge check:", e);
    return;
  }

  const EXPIRING_SOON_DAYS = 60;
  list.forEach(entry => {
    if (!entry.expirationDate || !entry.id) return;
    const days = Math.round((new Date(entry.expirationDate) - new Date(new Date().toDateString())) / 86400000);
    if (Number.isNaN(days) || days > EXPIRING_SOON_DAYS) return;

    const alreadyNudged = adminNotifications.some(n =>
      n.type === 'insurance_renewal' &&
      n.clientName === entry.id &&
      (now - new Date(n.createdAt).getTime()) < INSURANCE_RENEWAL_NUDGE_COOLDOWN_MS
    );
    if (alreadyNudged) return;

    const label = `${entry.coverageType || 'Policy'}${entry.carrier ? ' with ' + entry.carrier : ''}`;
    const phrase = days < 0 ? `expired ${Math.abs(days)}d ago` : days === 0 ? "expires today" : `expires in ${days}d`;
    pushAdminNotification('insurance_renewal', `${label} ${phrase} - renew in Business Insurance Tracker.`, entry.id, null);
  });
}

const SUBSCRIPTION_RENEWAL_NUDGE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const SUBSCRIPTION_RENEWAL_NUDGE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
let lastSubscriptionRenewalNudgeCheckAt = 0;

// Mirrors subscription-tracker/js/app.js's 30-day "renewing soon" window
// (updateSummary's renewingSoon - days between 0 and 30, negative treated
// as stale data rather than urgent, same as that tool's own definition).
// ADMIN-ONLY, same reasoning as the insurance nudge above - Subscription
// Tracker is leadership-gated too.
async function runSubscriptionRenewalNudgeCheck() {
  const now = Date.now();
  if (now - lastSubscriptionRenewalNudgeCheckAt < SUBSCRIPTION_RENEWAL_NUDGE_CHECK_INTERVAL_MS) return;
  lastSubscriptionRenewalNudgeCheckAt = now;
  if (!window.firebaseDb || !window.firebaseDb.collection) return;

  let list = [];
  try {
    const snap = await window.firebaseDb.collection("agency").doc("subscriptionTracker").get();
    list = (snap.exists && snap.data().list) || [];
  } catch (e) {
    console.warn("Couldn't load subscriptions for renewal nudge check:", e);
    return;
  }

  const RENEWING_SOON_DAYS = 30;
  list.forEach(entry => {
    if (!entry.id || entry.status === 'Cancelled' || !entry.renewalDate) return;
    const days = Math.round((new Date(entry.renewalDate) - new Date(new Date().toDateString())) / 86400000);
    if (Number.isNaN(days) || days < 0 || days > RENEWING_SOON_DAYS) return;

    const alreadyNudged = adminNotifications.some(n =>
      n.type === 'subscription_renewal' &&
      n.clientName === entry.id &&
      (now - new Date(n.createdAt).getTime()) < SUBSCRIPTION_RENEWAL_NUDGE_COOLDOWN_MS
    );
    if (alreadyNudged) return;

    const phrase = days === 0 ? "renews today" : `renews in ${days}d`;
    const cost = Math.round(parseFloat(entry.monthlyCost) || 0);
    pushAdminNotification('subscription_renewal', `${entry.toolName || 'Subscription'} ${phrase} ($${cost}/mo) - review in Subscription Tracker.`, entry.id, null);
  });
}

// Matches Agency Health Dashboard's heavyRevisions bar exactly (see
// buildRows there: "const heavyRevisions = openRevisions >= 3").
const SCOPE_CREEP_OPEN_REVISIONS_THRESHOLD = 3;

const SCOPE_CREEP_NUDGE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const SCOPE_CREEP_NUDGE_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000; // shorter than most - active scope disputes move faster than renewals/insurance
let lastScopeCreepNudgeCheckAt = 0;

// Agency Health Dashboard already flags 3+ open revisions as "heavy" (a
// badge in its table), but nothing ever prompted anyone toward the tool
// that actually generates the paperwork for it. Reads
// agency/revisionFeedbackLog (open = !dateResolved, same as that
// dashboard) and agency/changeOrders directly since revisions aren't
// clientsDb data. A client is only flagged if there's no Pending/Approved
// change order already covering the current batch - "covering" means
// created on or after the oldest still-open revision's request date, so
// an old change order from a previous, already-resolved dispute doesn't
// silently suppress a fresh one.
async function runScopeCreepNudgeCheck() {
  const now = Date.now();
  if (now - lastScopeCreepNudgeCheckAt < SCOPE_CREEP_NUDGE_CHECK_INTERVAL_MS) return;
  lastScopeCreepNudgeCheckAt = now;
  if (!window.firebaseDb || !window.firebaseDb.collection) return;

  let revisions = [];
  let changeOrders = [];
  try {
    const [revSnap, coSnap] = await Promise.all([
      window.firebaseDb.collection("agency").doc("revisionFeedbackLog").get(),
      window.firebaseDb.collection("agency").doc("changeOrders").get()
    ]);
    revisions = (revSnap.exists && revSnap.data().list) || [];
    changeOrders = (coSnap.exists && coSnap.data().list) || [];
  } catch (e) {
    console.warn("Couldn't load revisions/change orders for scope-creep nudge check:", e);
    return;
  }

  const openByClient = {};
  revisions.forEach(r => {
    if (!r.clientName || r.dateResolved) return;
    if (!openByClient[r.clientName]) openByClient[r.clientName] = [];
    openByClient[r.clientName].push(r);
  });

  Object.entries(openByClient).forEach(([name, openRows]) => {
    if (openRows.length < SCOPE_CREEP_OPEN_REVISIONS_THRESHOLD) return;

    const oldestRequestDate = openRows.map(r => r.dateRequested).filter(Boolean).sort()[0];
    const alreadyCovered = changeOrders.some(co =>
      co.clientName === name &&
      (co.status === 'Pending' || co.status === 'Approved') &&
      (!oldestRequestDate || !co.dateCreated || co.dateCreated >= oldestRequestDate)
    );
    if (alreadyCovered) return;

    const alreadyNudged = adminNotifications.some(n =>
      n.type === 'scope_creep' &&
      n.clientName === name &&
      (now - new Date(n.createdAt).getTime()) < SCOPE_CREEP_NUDGE_COOLDOWN_MS
    );
    if (alreadyNudged) return;

    pushAdminNotification('scope_creep', `${name} has ${openRows.length} open revisions and no change order in motion - may be worth a scope conversation.`, name, null);
  });
}

// The remaining three of Agency Health Dashboard's seven needsAttention
// conditions that had never been closed the loop on (healthRating ===
// 'Red', renewalDueSoon, heavyRevisions, and overspending already have
// nudges above/elsewhere) - staleApproval, heavyOpenActionItems, and
// staleContact. All three read straight off clientsDb (pendingApprovals,
// meetingNotes) so no extra Firestore doc fetch is needed, unlike most of
// the nudge checks above.

const STALE_APPROVAL_NUDGE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const STALE_APPROVAL_NUDGE_DAYS_THRESHOLD = 5; // matches Agency Health Dashboard's STALE_APPROVAL_DAYS
const STALE_APPROVAL_NUDGE_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // same cadence as the stale-client nudge
let lastStaleApprovalNudgeCheckAt = 0;

// Distinct from runStaleClientNudgeCheck above: that one keys off portal
// visit recency, so a client visiting regularly never triggers it even if
// an approval sits untouched. This one keys off the approval's own age
// directly - Agency Health Dashboard's staleApproval badge, which never
// nudged anyone before this.
function runStaleApprovalNudgeCheck() {
  const now = Date.now();
  if (now - lastStaleApprovalNudgeCheckAt < STALE_APPROVAL_NUDGE_CHECK_INTERVAL_MS) return;
  lastStaleApprovalNudgeCheckAt = now;

  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client || !client.portalConfig || !client.portalConfig.magicToken) return;
    const pendingApprovals = Array.isArray(client.pendingApprovals) ? client.pendingApprovals : [];
    const ages = pendingApprovals.filter(a => a && a.createdAt).map(a => Math.floor((now - new Date(a.createdAt).getTime()) / 86400000));
    const oldest = ages.length ? Math.max(...ages) : null;
    if (oldest === null || oldest < STALE_APPROVAL_NUDGE_DAYS_THRESHOLD) return;

    const alreadyNudged = adminNotifications.some(n =>
      n.type === 'stale_approval' &&
      n.clientName === name &&
      (now - new Date(n.createdAt).getTime()) < STALE_APPROVAL_NUDGE_COOLDOWN_MS
    );
    if (alreadyNudged) return;

    pushAdminNotification('stale_approval', `${name} has an approval that's been sitting for ${oldest}d.`, name, null);
  });
}

const HEAVY_ACTION_ITEMS_NUDGE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const HEAVY_ACTION_ITEMS_THRESHOLD = 3; // matches Agency Health Dashboard's HEAVY_OPEN_ACTION_ITEMS
const HEAVY_ACTION_ITEMS_NUDGE_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000; // same cadence as the scope-creep nudge
let lastHeavyActionItemsNudgeCheckAt = 0;

function runHeavyActionItemsNudgeCheck() {
  const now = Date.now();
  if (now - lastHeavyActionItemsNudgeCheckAt < HEAVY_ACTION_ITEMS_NUDGE_CHECK_INTERVAL_MS) return;
  lastHeavyActionItemsNudgeCheckAt = now;

  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client) return;
    const meetingNotes = Array.isArray(client.meetingNotes) ? client.meetingNotes : [];
    const openActionItems = meetingNotes.reduce((sum, m) =>
      sum + (Array.isArray(m.actionItems) ? m.actionItems.filter(ai => !ai.completed).length : 0), 0);
    if (openActionItems < HEAVY_ACTION_ITEMS_THRESHOLD) return;

    const alreadyNudged = adminNotifications.some(n =>
      n.type === 'heavy_action_items' &&
      n.clientName === name &&
      (now - new Date(n.createdAt).getTime()) < HEAVY_ACTION_ITEMS_NUDGE_COOLDOWN_MS
    );
    if (alreadyNudged) return;

    pushAdminNotification('heavy_action_items', `${name} has ${openActionItems} open action items piling up across meeting notes.`, name, null);
  });
}

const STALE_CONTACT_NUDGE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const STALE_CONTACT_NUDGE_DAYS_THRESHOLD = 30; // matches Agency Health Dashboard's STALE_CONTACT_DAYS
const STALE_CONTACT_NUDGE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // contact cadence is slower than approvals/revisions
let lastStaleContactNudgeCheckAt = 0;

// A client with zero meeting notes ever logged is deliberately NOT
// flagged - same reasoning as Agency Health Dashboard's own staleContact
// (a quiet, report-only retainer might genuinely have none and be
// perfectly healthy). Only a client who WAS being logged and then went
// quiet counts.
function runStaleContactNudgeCheck() {
  const now = Date.now();
  if (now - lastStaleContactNudgeCheckAt < STALE_CONTACT_NUDGE_CHECK_INTERVAL_MS) return;
  lastStaleContactNudgeCheckAt = now;

  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client) return;
    const meetingNotes = Array.isArray(client.meetingNotes) ? client.meetingNotes : [];
    if (meetingNotes.length === 0) return;
    const lastMeetingDate = meetingNotes.map(m => m.date).filter(Boolean).sort().slice(-1)[0];
    if (!lastMeetingDate) return;
    const daysSinceMeeting = Math.floor((now - new Date(lastMeetingDate).getTime()) / 86400000);
    if (daysSinceMeeting < STALE_CONTACT_NUDGE_DAYS_THRESHOLD) return;

    const alreadyNudged = adminNotifications.some(n =>
      n.type === 'stale_contact' &&
      n.clientName === name &&
      (now - new Date(n.createdAt).getTime()) < STALE_CONTACT_NUDGE_COOLDOWN_MS
    );
    if (alreadyNudged) return;

    pushAdminNotification('stale_contact', `${name} hasn't had a meeting logged in ${daysSinceMeeting}d.`, name, null);
  });
}

function adminNotifTimeAgo(isoString) {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

// Notification types that surface financial info gated to full-access/
// unrestricted accounts elsewhere in the Hub (Business Insurance Tracker
// and Subscription Tracker's footer buttons are both hidden from
// restricted teammates - see applyTeamAccessRestrictions). Filtered out
// below for anyone currently restricted, so the shared notification
// stream doesn't leak what those two tools already keep hidden.
const ADMIN_ONLY_NOTIF_TYPES = new Set(['insurance_renewal', 'subscription_renewal']);

// Same "fade then disappear, but never actually delete" pattern as
// recentlyReadNotifIds in portal/js/app.js - see that comment for why
// adminNotifications itself still keeps every entry forever (item.read
// just flips permanently as before) and only the rendered list hides ones
// that have finished their brief read/fade window. No cross-tool sync risk
// here the way there was on the portal side (adminNotifications is a
// single agency-wide doc this session already owns outright), but keeping
// the two bells' behavior identical is the point.
const recentlyReadAdminNotifIds = new Set();
const ADMIN_NOTIF_FADE_MS = 1400;

function renderAdminNotifications() {
  const badge = document.getElementById("adminNotifBellBadge");
  const list = document.getElementById("adminNotifList");
  if (!badge || !list) return;

  const scoped = isRestrictedTeamMember
    ? adminNotifications.filter(n => !ADMIN_ONLY_NOTIF_TYPES.has(n.type))
    : adminNotifications;

  const unreadCount = scoped.filter(n => !n.read).length;
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }

  const visibleNotifications = scoped.filter(n => !n.read || recentlyReadAdminNotifIds.has(n.id));

  list.innerHTML = "";
  if (visibleNotifications.length === 0) {
    const empty = document.createElement("div");
    empty.className = "admin-notif-empty";
    empty.textContent = "Nothing yet - you'll see client activity here as it happens.";
    list.appendChild(empty);
    return;
  }

  visibleNotifications.forEach(item => {
    const row = document.createElement("div");
    row.className = "admin-notif-item" + (item.read ? " read" : "");

    const dot = document.createElement("span");
    dot.className = "admin-notif-item-dot";

    const body = document.createElement("div");
    body.className = "admin-notif-item-body";
    const p = document.createElement("p");
    p.textContent = item.message || "";
    const time = document.createElement("div");
    time.className = "admin-notif-item-time";
    time.textContent = adminNotifTimeAgo(item.createdAt);
    body.appendChild(p);
    body.appendChild(time);

    // Most flows still only reveal a pre-filled draft for the admin to
    // review, edit, and send themselves (mailto/copy) - only drafts with
    // sendEnabled:true (see pushAdminNotification) get a real "Send"
    // button that calls /api/send-email server-side. (Auto-Send Email
    // Integration Plan.md has the full story on what's wired vs. not.)
    if (item.draftEmail) {
      const draftBtn = document.createElement("button");
      draftBtn.type = "button";
      draftBtn.className = "admin-notif-draft-btn";
      draftBtn.textContent = expandedDraftEmailIds.has(item.id) ? "Hide draft email" : "Show draft email";
      draftBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (expandedDraftEmailIds.has(item.id)) expandedDraftEmailIds.delete(item.id);
        else expandedDraftEmailIds.add(item.id);
        renderAdminNotifications();
      });
      body.appendChild(draftBtn);

      if (expandedDraftEmailIds.has(item.id)) {
        body.appendChild(buildDraftEmailPanel(item.draftEmail, item));
      }
    }

    row.appendChild(dot);
    row.appendChild(body);

    row.addEventListener("click", () => {
      if (!item.read) {
        item.read = true;
        recentlyReadAdminNotifIds.add(item.id);
        renderAdminNotifications();
        persistAdminNotifications();
        setTimeout(() => {
          recentlyReadAdminNotifIds.delete(item.id);
          renderAdminNotifications();
        }, ADMIN_NOTIF_FADE_MS);
      }
    });

    list.appendChild(row);
  });
}

// Which stale-nudge notifications currently have their draft-email panel
// expanded - only lives for this page session, doesn't need to persist.
const expandedDraftEmailIds = new Set();

function buildDraftEmailPanel(draftEmail, item) {
  const panel = document.createElement("div");
  panel.className = "admin-notif-draft-panel";
  panel.addEventListener("click", (e) => e.stopPropagation());

  const toRow = document.createElement("div");
  toRow.className = "admin-notif-draft-to";
  toRow.textContent = "To: " + (draftEmail.to || "(no contact email on file)");
  panel.appendChild(toRow);
  if (draftEmail.from) {
    const fromRow = document.createElement("div");
    fromRow.className = "admin-notif-draft-to";
    fromRow.textContent = "From: " + draftEmail.from;
    panel.appendChild(fromRow);
  }

  const subjectInput = document.createElement("input");
  subjectInput.type = "text";
  subjectInput.className = "admin-notif-draft-input";
  subjectInput.value = draftEmail.subject || "";
  panel.appendChild(subjectInput);

  const bodyTextarea = document.createElement("textarea");
  bodyTextarea.className = "admin-notif-draft-textarea";
  bodyTextarea.value = draftEmail.body || "";
  panel.appendChild(bodyTextarea);

  const actions = document.createElement("div");
  actions.className = "admin-notif-draft-actions";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "admin-notif-draft-copy-btn";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", async () => {
    const text = `To: ${draftEmail.to}\nSubject: ${subjectInput.value}\n\n${bodyTextarea.value}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
      }
    } catch (e) { console.error("Copy failed:", e); }
  });
  actions.appendChild(copyBtn);

  const mailtoLink = document.createElement("a");
  mailtoLink.className = "admin-notif-draft-mailto-btn";
  mailtoLink.textContent = "Open in email app";
  mailtoLink.target = "_blank";
  mailtoLink.href = `mailto:${encodeURIComponent(draftEmail.to || "")}?subject=${encodeURIComponent(subjectInput.value)}&body=${encodeURIComponent(bodyTextarea.value)}`;
  actions.appendChild(mailtoLink);

  // Real auto-send, via the Worker's /api/send-email route (Resend) - only
  // shown for drafts explicitly opted in with sendEnabled:true (currently
  // just the stale-client nudge). Every other draft type still falls back
  // to Copy/mailto only, per the plan's one-flow-at-a-time rollout.
  if (draftEmail.sendEnabled && draftEmail.from) {
    const sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.className = "admin-notif-draft-send-btn";
    sendBtn.textContent = item && item.sent ? "Sent ✓" : "Send";
    sendBtn.disabled = !!(item && item.sent);

    const statusEl = document.createElement("div");
    statusEl.className = "admin-notif-draft-status";

    sendBtn.addEventListener("click", async () => {
      sendBtn.disabled = true;
      sendBtn.textContent = "Sending...";
      statusEl.textContent = "";
      try {
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: draftEmail.to,
            subject: subjectInput.value,
            body: bodyTextarea.value,
            from: draftEmail.from
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || `Send failed (${res.status})`);
        }
        sendBtn.textContent = "Sent ✓";
        statusEl.textContent = "Sent successfully.";
        statusEl.classList.add("success");
        if (item) {
          item.sent = true;
          persistAdminNotifications();
        }
      } catch (e) {
        console.error("Send email failed:", e);
        sendBtn.disabled = false;
        sendBtn.textContent = "Send";
        statusEl.textContent = "Couldn't send automatically (" + e.message + ") - use Copy or \"Open in email app\" below instead.";
        statusEl.classList.add("error");
      }
    });

    actions.appendChild(sendBtn);
    panel.appendChild(actions);
    panel.appendChild(statusEl);
    return panel;
  }

  panel.appendChild(actions);
  return panel;
}

function initAdminNotifBell() {
  const bellBtn = document.getElementById("adminNotifBellBtn");
  const dropdown = document.getElementById("adminNotifDropdown");
  const markAllBtn = document.getElementById("adminNotifMarkAllReadBtn");
  if (!bellBtn || !dropdown) return;

  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === "none" ? "flex" : "none";
  });
  document.addEventListener("click", (e) => {
    if (dropdown.style.display !== "none" && !dropdown.contains(e.target) && e.target !== bellBtn) {
      dropdown.style.display = "none";
    }
  });
  if (markAllBtn) {
    markAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      let changed = false;
      const justRead = [];
      adminNotifications.forEach(n => {
        if (!n.read) { n.read = true; justRead.push(n.id); changed = true; }
      });
      if (changed) {
        justRead.forEach(id => recentlyReadAdminNotifIds.add(id));
        renderAdminNotifications();
        persistAdminNotifications();
        setTimeout(() => {
          justRead.forEach(id => recentlyReadAdminNotifIds.delete(id));
          renderAdminNotifications();
        }, ADMIN_NOTIF_FADE_MS);
      }
    });
  }
}

function foldInApprovalDecisions(target, publicData) {
  if (!target || !publicData || !Array.isArray(publicData.approvalHistory)) return false;
  if (!Array.isArray(target.pendingApprovals)) target.pendingApprovals = [];
  if (!Array.isArray(target.approvalHistory)) target.approvalHistory = [];

  const knownIds = new Set(target.approvalHistory.map(a => a.id));
  let changed = false;

  publicData.approvalHistory.forEach(entry => {
    if (!knownIds.has(entry.id)) {
      target.approvalHistory = target.approvalHistory.concat([entry]);
      target.pendingApprovals = target.pendingApprovals.filter(p => p.id !== entry.id);
      changed = true;
    }
  });

  return changed;
}

// Real gap found auditing the mood-board fix's bug class elsewhere: a
// client can leave a comment on an approval (addApprovalComment in
// portal/js/app.js) without deciding yet - that write only ever touches
// pendingApprovals, never approvalHistory, so foldInApprovalDecisions
// above never saw it. Client Portal Manager reads pendingApprovals
// straight out of clientsDb (not a live Firestore fetch), so a mid-
// conversation client comment was invisible to the admin - stale forever
// in the Hub's own copy - until the client eventually made a final
// decision and the whole entry (comments included) got folded in as a
// side effect of that move. This pulls comment updates in continuously
// instead, matching how clientChecklist already works, and returns the
// newly-arrived client comments so the caller can notify on them.
function foldInPendingApprovalComments(target, publicData) {
  if (!target || !publicData || !Array.isArray(publicData.pendingApprovals)) return [];
  if (!Array.isArray(target.pendingApprovals)) target.pendingApprovals = [];

  const newClientComments = [];
  publicData.pendingApprovals.forEach(incomingEntry => {
    const targetEntry = target.pendingApprovals.find(p => p.id === incomingEntry.id);
    if (!targetEntry) return; // already moved to approvalHistory, or doesn't exist here yet

    const knownCommentIds = new Set((targetEntry.comments || []).map(c => c.id));
    const incomingComments = Array.isArray(incomingEntry.comments) ? incomingEntry.comments : [];
    const freshComments = incomingComments.filter(c => !knownCommentIds.has(c.id));
    if (freshComments.length === 0) return;

    targetEntry.comments = incomingComments;
    freshComments
      .filter(c => c.author === 'client')
      .forEach(c => newClientComments.push({ entry: targetEntry, comment: c }));
  });

  return newClientComments;
}

// The Contract & Invoice Status Tracker deliberately keeps its own record
// list at agency/contractInvoices rather than inside clientsDb (a contract
// can exist before someone is a fully onboarded client - see that tool's
// own comment header) - so the only way to surface a read-only billing
// summary on a client's portal is a direct read of that collection here,
// matched back to a client by name. One read per sync rather than a
// standing listener, since this only needs to be current as of the next
// save, not instantaneous.
async function fetchBillingSummaries() {
  const summaries = {};
  try {
    const snap = await window.firebaseDb.collection("agency").doc("contractInvoices").get();
    const list = (snap.exists && snap.data().list) || [];
    list.forEach(rec => {
      if (!rec.clientName) return;
      summaries[rec.clientName.toLowerCase()] = {
        contractStatus: rec.contractStatus || "",
        contractRenewalDate: rec.contractRenewalDate || "",
        invoiceStatus: rec.invoiceStatus || "",
        invoiceAmount: rec.invoiceAmount || "",
        invoiceDueDate: rec.invoiceDueDate || "",
        invoicePaidDate: rec.invoicePaidDate || ""
      };
    });
  } catch (e) {
    console.warn("Could not read contract/invoice records for billing summaries:", e);
  }
  return summaries;
}

// Same pattern as fetchBillingSummaries above, but for the Referral
// Tracker's agency/referrals collection - it too deliberately lives
// outside clientsDb (a referral can come from someone who isn't a client
// yet). Aggregates every entry where referrerName matches this client by
// name into one summary: how many referrals, how many became clients, and
// the individual entries so the portal can list them.
async function fetchReferralSummaries() {
  const summaries = {};
  try {
    const snap = await window.firebaseDb.collection("agency").doc("referrals").get();
    const list = (snap.exists && snap.data().list) || [];
    list.forEach(rec => {
      if (!rec.referrerName) return;
      const key = rec.referrerName.toLowerCase();
      if (!summaries[key]) {
        summaries[key] = { totalReferrals: 0, becameClientCount: 0, entries: [] };
      }
      summaries[key].totalReferrals++;
      if (rec.status === 'Became Client') summaries[key].becameClientCount++;
      summaries[key].entries.push({
        referredName: rec.referredName || "",
        dateReferred: rec.dateReferred || "",
        status: rec.status || "Pending",
        rewardStatus: rec.rewardStatus || "Not Owed",
        rewardAmount: rec.rewardAmount || ""
      });
    });
  } catch (e) {
    console.warn("Could not read referral records for referral summaries:", e);
  }
  return summaries;
}

async function syncPublicPortalDocs(dbSnapshot) {
  if (!window.firebaseDb || !window.firebaseDb.collection) return;

  const entries = Object.entries(dbSnapshot).filter(
    ([, client]) => client && client.portalConfig && client.portalConfig.magicToken
  );

  const billingSummaries = await fetchBillingSummaries();
  const referralSummaries = await fetchReferralSummaries();

  for (const [name, client] of entries) {
    const token = client.portalConfig.magicToken;
    const publicRef = window.firebaseDb.collection("clients").doc(token);
    const localChecklist = client.onboardingChecklist || client.onboarding || [];
    const localClientChecklist = client.clientChecklist || [];
    const localNotifications = client.notifications || [];
    const approvalsWrapper = {
      pendingApprovals: client.pendingApprovals || [],
      approvalHistory: client.approvalHistory || []
    };

    let preservedLastVisitedAt = null;

    try {
      // Fold in onboarding progress and approval decisions the client
      // already made directly on the portal so this save doesn't stomp on
      // them. (Pulling that progress into the real, live clientsDb so the
      // admin side actually SEES it is handled separately and continuously
      // by ensureClientPortalListeners below - not tied to whether the
      // admin happens to save something.)
      //
      // clientChecklist is deliberately NOT folded here (it used to be,
      // one-directionally: only ever pulling a checked box in from the
      // existing portal doc, never a match). That meant an account manager
      // unchecking a box in Client Portal Manager and saving would get
      // silently reverted back to checked right here, since the portal's
      // existing doc still showed it checked from before. clientChecklist
      // is kept in sync continuously and bidirectionally by
      // ensureClientPortalListeners below instead, so by the time a save
      // happens client.clientChecklist already reflects the latest state
      // from both sides - the admin's own edit (made just now, in memory)
      // should simply win here, not get folded against a stale snapshot.
      const existing = await publicRef.get();
      if (existing.exists) {
        const existingData = existing.data();
        foldInOnboardingChecked(localChecklist, existingData.onboardingChecklist);
        foldInApprovalDecisions(approvalsWrapper, existingData);
        foldInTestimonialSubmission(client, existingData);
        // Same story as testimonialSubmission just above: a client's style
        // rating is written straight to this same public doc (see
        // saveMoodBoardStyleFeedback in portal/js/app.js), so fold in
        // anything that arrived there before this non-merge .set() below
        // would otherwise wipe it out. ensureClientPortalListeners also
        // folds this into the live clientsDb continuously (same as
        // moodBoardViews), so by the time a save happens client's own copy
        // usually already has it too - this is the safety net for the case
        // where a rating arrives in the gap between listener ticks.
        foldInMoodBoardStyleFeedback(client, existingData);
        // Same reasoning as moodBoardStyleFeedback just above, but see
        // foldInMoodBoardAnnotations' own comment for why this one needs a
        // real item-by-item merge instead of a single updatedAt comparison
        // - this is the fix for notes appearing to save and then vanishing
        // the next time anything else gets saved in the Hub.
        foldInMoodBoardAnnotations(client, existingData);
        foldInClientPulseFeedback(client, existingData);
        foldInNotificationReadState(localNotifications, existingData.notifications);
        // lastVisitedAt is written directly by the portal on load (see
        // portal/js/app.js) and read back into clientsDb by
        // ensureClientPortalListeners below - the admin never sets this
        // field, so it just needs to be carried forward here rather than
        // silently wiped by this being a full (non-merge) .set() below.
        preservedLastVisitedAt = existingData.lastVisitedAt || null;
      }
    } catch (e) {
      console.warn("Could not read existing public portal doc for", name, e);
    }

    const projection = {
      portalConfig: client.portalConfig,
      onboardingChecklist: localChecklist,
      clientChecklist: localClientChecklist,
      pendingApprovals: approvalsWrapper.pendingApprovals,
      approvalHistory: approvalsWrapper.approvalHistory,
      // The client's own testimonial submission (Leave a Testimonial view)
      // - folded in above from the existing public doc first so this save
      // never stomps on a submission that just came in.
      testimonialSubmission: client.testimonialSubmission || null,
      // Published report snapshots (see competitor-analysis/script.js's
      // publishToClientPortal). Admin-only to create - clients never write
      // this field, so no fold-in-existing-progress step is needed here
      // the way there is for the two checklists above.
      reportArchive: client.reportArchive || [],
      // Bell-icon notification feed (new approval requests, new published
      // reports). Admin-only to create; the client can only mark entries
      // read (folded in above), never add their own.
      notifications: localNotifications,
      // Read-only billing snapshot pulled from the Contract & Invoice
      // Status Tracker (see fetchBillingSummaries above). null if this
      // client isn't tracked there under a matching name. The portal only
      // shows this at all if portalConfig.showBillingInPortal is on.
      billingSummary: billingSummaries[name.toLowerCase()] || null,
      // Read-only referral tracking pulled from the Referral Tracker (see
      // fetchReferralSummaries above). null if this client has never
      // referred anyone under a matching name.
      referralSummary: referralSummaries[name.toLowerCase()] || null,
      // Client-driven, same story as clientChecklist above (not
      // lastVisitedAt's story): ensureClientPortalListeners keeps
      // client.moodBoardViews continuously up to date as views come in, so
      // by the time this save runs it already reflects the latest state
      // from both sides - no separate fold-in-existing-doc step needed
      // here, just carry the current value forward.
      moodBoardViews: client.moodBoardViews || {},
      // The actual mood board content (title, category, reference images/
      // links, sharedWithClient) built in the Mood Board Builder tool.
      // This was missing here entirely until this field was added - shared
      // boards were never actually reaching the client-facing doc the
      // Portal reads from, so the Portal's Mood Boards tab had nothing to
      // show. Admin-only to create/edit, same as reportArchive above, so
      // no fold-in-existing-progress step is needed.
      moodBoards: client.moodBoards || [],
      // The client's style-scale ratings for those boards (see
      // saveMoodBoardStyleFeedback in portal/js/app.js). Folded in from the
      // existing doc above first, so this save doesn't stomp a rating that
      // just came in.
      moodBoardStyleFeedback: client.moodBoardStyleFeedback || {},
      // Pin/circle notes on mood board images (see foldInMoodBoardAnnotations
      // above for the full story on why the fold-in step just above this
      // was the fix that actually mattered here - this projection field was
      // already missing too, a second contributor to the same vanishing-
      // notes bug, since without it the field never reached the public doc
      // in the first place on any save that happened to run before it was
      // added here).
      moodBoardAnnotations: client.moodBoardAnnotations || {},
      // Same missing-field bug as moodBoards above, caught in the same
      // audit pass: the Portal's Brand Kit widget reads clientData.brandKit
      // (see renderBrandKit in portal/js/app.js) and its Action Items
      // widget reads clientData.meetingNotes (renderActionItems) - both
      // admin-authored (brandKit synced from the Brand Identity Vault just
      // above this function; meetingNotes written by Meeting Notes Logger)
      // and both absent from this projection, so neither ever reached the
      // doc the Portal actually loads from. Clients never write either
      // field, so no fold-in-existing-progress step is needed.
      brandKit: client.brandKit || {},
      meetingNotes: client.meetingNotes || [],
      // Brand Roadmap (see brand-roadmap/js/app.js) - admin-only to
      // create/edit, same as moodBoards/brandKit above, so no fold-in-
      // existing-progress step is needed here. The whole object (including
      // visibleToClient) is carried forward as-is; the Portal is what
      // decides whether to actually show it, same "send it all, client
      // hides what isn't shared" pattern already used for moodBoards'
      // per-board sharedWithClient flag.
      brandRoadmap: client.brandRoadmap || null,
      // Carried forward as-is (see preservedLastVisitedAt above) - the
      // admin never writes this, only preserves whatever the portal itself
      // already recorded so a Hub save doesn't erase it.
      lastVisitedAt: preservedLastVisitedAt
    };

    publicRef.set(projection).catch(err => {
      console.error("Public portal doc write failed for", name, err);
    });
  }
}

// ── Live sync: client-side checklist changes -> agency side ──
// The client portal writes checklist checkbox changes directly to its own
// clients/{token} doc (see updateFirebaseChecklist in portal/js/app.js) -
// that write never goes through the admin's saveDatabase()/clientsDb at
// all. Without a listener dedicated to watching for that, the agency side
// only ever found out about it as an incidental side effect of the admin
// happening to save something else - which is why checking a box on the
// client portal didn't reliably (or promptly) show up here. This keeps one
// real-time listener per client with an active magic link, purely to pull
// client-driven checklist progress back into the real clientsDb the
// moment it happens.
const portalListenerUnsubscribers = {};

function ensureClientPortalListeners() {
  if (!window.firebaseDb || !window.firebaseOnSnapshot || !window.firebaseDoc) return;

  const activeTokens = new Set();

  Object.entries(clientsDb).forEach(([name, client]) => {
    if (!client || !client.portalConfig || !client.portalConfig.magicToken) return;
    const token = client.portalConfig.magicToken;
    activeTokens.add(token);

    if (portalListenerUnsubscribers[token]) return; // already listening

    const docRef = window.firebaseDoc(window.firebaseDb, "clients", token);
    const unsubscribe = window.firebaseOnSnapshot(docRef, (docSnap) => {
      if (!docSnap.exists) return;
      // Skip echoes of the admin's own not-yet-confirmed writes to this
      // same doc (from syncPublicPortalDocs above) - only react to changes
      // that actually came from somewhere else (the client's own portal).
      if (docSnap.metadata && docSnap.metadata.hasPendingWrites) return;

      const data = docSnap.data();
      const currentClient = clientsDb[name];
      if (!currentClient) return;

      const changedOnboarding = foldInOnboardingChecked(currentClient.onboardingChecklist, data.onboardingChecklist);
      const changedClientChecklist = syncClientChecklistFromPortal(currentClient.clientChecklist, data.clientChecklist);

      // Capture known approval IDs before folding so any newly-arrived
      // decisions can be identified afterward and turned into an admin
      // notification below - foldInApprovalDecisions itself only reports
      // whether *something* changed, not which entries are new.
      const priorApprovalIds = new Set((currentClient.approvalHistory || []).map(a => a.id));
      const changedApprovals = foldInApprovalDecisions(currentClient, data);
      if (changedApprovals) {
        const decisionLabels = { approved: "Approved", minor: "Approved with Minor Corrections", revision: "Revision Requested" };
        (currentClient.approvalHistory || [])
          .filter(a => !priorApprovalIds.has(a.id))
          .forEach(entry => {
            const label = decisionLabels[entry.decision] || entry.decision || "responded";
            pushAdminNotification("approval", `${name}: "${entry.title}" — ${label}`);
          });
      }

      const changedTestimonial = foldInTestimonialSubmission(currentClient, data);
      if (changedTestimonial) {
        pushAdminNotification("testimonial", `${name} submitted a testimonial.`);
      }

      // A client can comment on a pending approval without deciding yet -
      // foldInApprovalDecisions above only reacts once an item moves to
      // approvalHistory, so a mid-conversation comment needs its own pull-
      // in (see foldInPendingApprovalComments' comment for the full story
      // on why this was invisible to the admin before).
      const newPendingComments = foldInPendingApprovalComments(currentClient, data);
      const changedPendingComments = newPendingComments.length > 0;
      newPendingComments.forEach(({ entry, comment }) => {
        const preview = comment.text.length > 80 ? comment.text.slice(0, 80) + "…" : comment.text;
        pushAdminNotification("approval_comment", `${name} commented on "${entry.title}": "${preview}"`, name);
      });

      // Same before/after-diff approach as approvals above: capture which
      // board IDs were already marked viewed before folding in whatever
      // just arrived, so only genuinely new views become a notification -
      // not every snapshot fire for a board the client already opened
      // days ago.
      const priorViewedBoardIds = new Set(Object.keys(currentClient.moodBoardViews || {}));
      const changedMoodBoardViews = foldInMoodBoardViews(currentClient, data);
      if (changedMoodBoardViews) {
        Object.keys(currentClient.moodBoardViews || {})
          .filter(boardId => !priorViewedBoardIds.has(boardId))
          .forEach(boardId => {
            const board = (currentClient.moodBoards || []).find(b => b.id === boardId);
            pushAdminNotification("moodboard_viewed", `${name} viewed the mood board "${board ? board.title : "Untitled"}".`, name);
          });
      }

      // Same before/after-diff approach, this time capturing each board's
      // updatedAt (not just presence) so a client re-rating a board they'd
      // already rated still counts as new and gets its own notification.
      const priorFeedbackStamps = {};
      Object.entries(currentClient.moodBoardStyleFeedback || {}).forEach(([boardId, fb]) => {
        priorFeedbackStamps[boardId] = fb && fb.updatedAt;
      });
      const changedMoodBoardStyleFeedback = foldInMoodBoardStyleFeedback(currentClient, data);
      if (changedMoodBoardStyleFeedback) {
        Object.entries(currentClient.moodBoardStyleFeedback || {})
          .filter(([boardId, fb]) => priorFeedbackStamps[boardId] !== (fb && fb.updatedAt))
          .forEach(([boardId, fb]) => {
            const board = (currentClient.moodBoards || []).find(b => b.id === boardId);
            const ratingPhrase = fb && fb.overallRating ? ` (rated ${fb.overallRating}/10)` : "";
            pushAdminNotification("moodboard_feedback", `${name} rated the style of "${board ? board.title : "Untitled"}"${ratingPhrase}.`, name);
          });
      }

      // Same before/after-diff approach as the two moodboard blocks above,
      // this time counting existing annotation ids per board/image before
      // folding so only genuinely new pins/circles (from either side, but
      // this listener only ever sees ones that arrived via the client's own
      // portal - admin-added ones are already in currentClient locally the
      // moment they're drawn) turn into an admin notification.
      const priorAnnotationIds = new Set();
      Object.values(currentClient.moodBoardAnnotations || {}).forEach(byImage => {
        Object.values(byImage || {}).forEach(list => (list || []).forEach(a => priorAnnotationIds.add(a.id)));
      });
      const changedMoodBoardAnnotations = foldInMoodBoardAnnotations(currentClient, data);
      if (changedMoodBoardAnnotations) {
        Object.values(currentClient.moodBoardAnnotations || {}).forEach(byImage => {
          Object.values(byImage || {}).forEach(list => (list || []).forEach(a => {
            if (!priorAnnotationIds.has(a.id) && a.author === "client") {
              const board = (currentClient.moodBoards || []).find(b =>
                Object.values(currentClient.moodBoardAnnotations[b.id] || {}).some(l => (l || []).some(x => x.id === a.id))
              );
              pushAdminNotification("moodboard_annotation", `${name} left a note on "${board ? board.title : "a mood board"}".`, name);
            }
          }));
        });
      }

      // Client-submitted satisfaction pulse - see foldInClientPulseFeedback
      // above. A low rating (bottom third of the 1-5 scale) surfaces
      // immediately as an admin notification, the same "don't wait for
      // someone to notice" treatment a Red health check-in already gets in
      // Weekly Check-In - a self-reported low rating is exactly the kind of
      // signal that shouldn't sit unread until the next time someone
      // happens to open the Agency Health Dashboard.
      const priorPulseIds = new Set((currentClient.clientPulseFeedback || []).map(p => p.id));
      const changedPulseFeedback = foldInClientPulseFeedback(currentClient, data);
      if (changedPulseFeedback) {
        (currentClient.clientPulseFeedback || []).forEach(p => {
          if (!priorPulseIds.has(p.id) && p.rating <= 2 && pushAdminNotification) {
            pushAdminNotification("client_pulse_low", `${name} left a low satisfaction rating (${p.rating}/5) from their portal.`, name);
            emailAccountManagerLowPulseAlert(currentClient, name, p);
          }
        });
      }

      // Portal last-visited tracking - the portal writes lastVisitedAt to
      // its own public doc on load (see portal/js/app.js); pull it into
      // clientsDb here the same way everything else client-driven arrives,
      // so admin-facing views (Agency Health Dashboard) can show it
      // without a separate fetch.
      const changedVisit = !!(data.lastVisitedAt && data.lastVisitedAt !== currentClient.portalLastVisitedAt);
      if (changedVisit) {
        currentClient.portalLastVisitedAt = data.lastVisitedAt;
      }

      if (changedOnboarding || changedClientChecklist || changedApprovals || changedTestimonial || changedVisit || changedMoodBoardViews || changedMoodBoardStyleFeedback || changedMoodBoardAnnotations || changedPendingComments) {
        // Bug fix: this used to only call localStorage.setItem, never an
        // actual cloud write - meaning every fold-in above (onboarding,
        // approvals, testimonials, moodBoardViews/StyleFeedback/
        // Annotations) only ever survived in THIS browser tab's local
        // cache, never reached Firestore's real agency/clientsDb-shard-N
        // docs. The instant those docs get re-fetched from the cloud on
        // any fresh page load (loadDatabase()'s shard listener overwrites
        // clientsDb wholesale once the real data arrives, same as it does
        // right after the instant localStorage-cache boot), the fold was
        // silently reverted - so the "already knew about this" state this
        // whole diff-before/after pattern depends on kept resetting to
        // before the fold, and every one of the notifications pushed
        // above would fire again as if brand new on every single reload.
        // saveDatabase() does the same instant localStorage write this
        // used to do AND schedules the debounced real cloud commit, so
        // the fold actually sticks from here on.
        //
        // Second bug fix, found when the first one wasn't enough: `name`
        // here is whichever client's portal just fired, which is very
        // often NOT the admin's currently-active client - saveDatabase()
        // only marks activeClientName as pending (see pendingLocalClientEdits),
        // so without this, a fold for a non-active client had no
        // protection against rebuildClientsDbFromShards clobbering it
        // before the debounced save below reached the cloud. This is
        // what let the notification-pile-up bug survive the first fix.
        pendingLocalClientEdits.add(name);
        saveDatabase();
        try { renderOnboardingChecklist(); } catch (e) {}
        try { renderDashboard(); } catch (e) {}
        if (changedMoodBoardStyleFeedback) {
          try { renderMoodBoardsAwaitingFeedback(); } catch (e) {}
        }
        try {
          if (typeof iframeNeedsReload !== "undefined" && iframeNeedsReload["tab-portal"] !== undefined) {
            iframeNeedsReload["tab-portal"] = true;
            const activeTabBtn = document.querySelector(".nav-item-btn.active");
            const activeTab = activeTabBtn ? activeTabBtn.getAttribute("data-tab") : "";
            if (activeTab === "tab-portal" && activeClientName === name) {
              refreshIframeTab("tab-portal");
            }
          }
        } catch (e) {}
        // A client rating/viewing a board is the one piece of this listener
        // that's specific to the Mood Board Builder tool itself (the admin's
        // read-only feedback summary lives there, see renderStyleScaleMini) -
        // reload it the same way tab-portal gets reloaded above, so a
        // rating that comes in while that tab happens to be open shows up
        // without needing a manual client-switch to force a re-render.
        if (changedMoodBoardViews || changedMoodBoardStyleFeedback || changedMoodBoardAnnotations) {
          try {
            if (typeof iframeNeedsReload !== "undefined" && iframeNeedsReload["tab-moodboard"] !== undefined) {
              iframeNeedsReload["tab-moodboard"] = true;
              const activeTabBtn = document.querySelector(".nav-item-btn.active");
              const activeTab = activeTabBtn ? activeTabBtn.getAttribute("data-tab") : "";
              if (activeTab === "tab-moodboard" && activeClientName === name) {
                refreshIframeTab("tab-moodboard");
              }
            }
          } catch (e) {}
        }
      }
    }, (err) => {
      console.error("Portal listener error for", name, err);
    });

    portalListenerUnsubscribers[token] = unsubscribe;
  });

  // Stop listening for tokens that no longer belong to any client (deleted
  // client, or a regenerated magic link).
  Object.keys(portalListenerUnsubscribers).forEach(token => {
    if (!activeTokens.has(token)) {
      try { portalListenerUnsubscribers[token](); } catch (e) {}
      delete portalListenerUnsubscribers[token];
    }
  });
}

function loadDatabase() {
  // 1. Instant boot from LocalStorage cache (offline support / immediate render)
  const stored = localStorage.getItem("REVITAL_HUB_CLIENTS");
  if (stored) {
    try {
      clientsDb = JSON.parse(stored);
    } catch (e) {
      clientsDb = {};
    }
  }

  // Bug fix (Hub-wide stress test): this schema-migration/defaults pass
  // was defined but never actually called anywhere, so legacy client
  // records missing newer fields (e.g. older copywriting/onboarding
  // formats) were never backfilled. Every write inside it is guarded to
  // only fill in genuinely missing/undefined data, so it's safe to run
  // on every load.
  migrateSchemaAndDefaults();

  // Set active client
  const storedActive = localStorage.getItem("REVITAL_HUB_ACTIVE_CLIENT");
  if (storedActive && clientsDb[storedActive]) {
    activeClientName = storedActive;
  } else if (Object.keys(clientsDb).length > 0) {
    activeClientName = Object.keys(clientsDb)[0];
  } else {
    // Seed default if empty
    const defaultName = "Nexus Productions";
    clientsDb[defaultName] = createClientBlankState(defaultName);
    activeClientName = defaultName;
  }

  // Self-heal any client missing a clientChecklist (see
  // backfillMissingClientChecklists) and push the fix out immediately so
  // it doesn't sit unsynced until the next unrelated edit.
  if (backfillMissingClientChecklists()) {
    saveDatabase();
  }

  // Render immediately with whatever we have (localStorage cache or the
  // seeded default) so the dropdown is never left empty while we wait on
  // the network. The Firestore listener below will re-render again once
  // cloud data arrives, whether or not it differs from this first render.
  buildClientDropdown();
  refreshAllViews();
  renderDashboard();

    // 2. Determine clientsDb sync strategy. Unrestricted admins keep the
  // existing real-time Firestore shard listeners (startUnrestrictedClientsDbSync,
  // unchanged from before). Team-Access-restricted teammates instead go
  // through the filtered REST endpoint (startRestrictedClientsDbSync - see
  // /api/restricted-client-data in _worker.js), because clientsDb's own
  // Firestore rules gate is all-or-nothing per document (see
  // hasAccountDataAccess in firestore.rules) - it can't slice one shard
  // down to just a restricted teammate's granted sections, only the
  // server-side endpoint can. A fresh, one-time read of agency/teamAccess
  // decides which path to take, rather than waiting on
  // initTeamAccessGate's own separate listener to resolve first - that
  // would race with starting the (unfiltered) Firestore shard listeners
  // below, which is exactly the gap this whole change exists to close.
  if (window.firebaseDoc && window.firebaseDb && window.firebaseGetDoc) {
    const teamAccessRef = window.firebaseDoc(window.firebaseDb, "agency", "teamAccess");
    window.firebaseGetDoc(teamAccessRef).then((snap) => {
      const data = snap && snap.exists ? snap.data() : null;
      const users = (data && data.users) || {};
      const email = (window.currentAdminEmail || "").toLowerCase();
      const restricted = Object.prototype.hasOwnProperty.call(users, email);
      if (restricted) {
        startRestrictedClientsDbSync();
      } else {
        startUnrestrictedClientsDbSync();
      }
    }).catch((err) => {
      console.error("Couldn't resolve Team Access restriction status, defaulting to unrestricted sync:", err);
      startUnrestrictedClientsDbSync();
    });
  }
}

// Real-time Firestore shard listeners - the original, unrestricted-only
// clientsDb sync path (unchanged behavior from before Team Access section
// enforcement existed). See loadDatabase() above for how this gets chosen.
function startUnrestrictedClientsDbSync() {
  // Explicit, not just "leave it at its default false" - defensive in case
  // this ever runs more than once in a session (it doesn't today, but
  // costs nothing and matches startRestrictedClientsDbSync setting its own
  // side explicitly too).
  isRestrictedClientsDbSync = false;
  if (!(window.firebaseOnSnapshot && window.firebaseDoc && window.firebaseDb && window.firebaseGetDoc)) return;
  const metaRef = getClientsDbShardMetaDocRef();
  window.firebaseOnSnapshot(metaRef, async (metaSnap) => {
    if (metaSnap.exists && typeof metaSnap.data().count === 'number') {
      clientsDbDocVersion = typeof metaSnap.data().version === 'number' ? metaSnap.data().version : 0;
      setClientsDbShardListenerCount(metaSnap.data().count);
      return;
    }

    // No shard metadata yet - either a brand-new install, or a Hub
    // still on the old single-document format that needs a one-time
    // migration into shards.
    try {
      const legacyRef = getLegacyClientsDbDocRef();
      const legacySnap = legacyRef ? await window.firebaseGetDoc(legacyRef) : null;
      if (legacySnap && legacySnap.exists) {
        clientsDb = legacySnap.data();
        localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));
        if (!clientsDb[activeClientName]) {
          activeClientName = Object.keys(clientsDb)[0] || "";
        }
        buildClientDropdown();
        refreshAllViews();
        renderDashboard();
      }
      // Writes the migrated (or first-ever, brand-new-install) state
      // into shards + shard metadata. The metadata write above will
      // re-trigger this listener with metaSnap.exists === true next
      // time, switching over to the normal per-shard listeners.
      commitDatabaseToCloud();
    } catch (err) {
      console.error("clientsDb migration failed:", err);
      showBanner("error", "Couldn't migrate the client database to the new format: " + err.message);
    }
  }, (err) => {
    console.error("clientsDb shard meta listener error:", err);
    showBanner("error", "Couldn't sync with the cloud database: " + err.message);
  });
}

let restrictedClientsDbPollTimer = null;

// Set once the first /api/restricted-client-data fetch has completed (see
// startRestrictedClientsDbSync) - commitRestrictedClientEdits awaits this
// before sending anything. BUG this closes: without it, a save triggered
// by a user interaction that happens before that first fetch resolves
// would build its payload from clientsDb as it stood straight out of the
// instant localStorage-cache boot (loadDatabase's step 1) - which, for a
// restricted teammate, was never actually filtered to their sections at
// all (it's whatever this browser last had cached, full data included, or
// nothing). That's exactly what happened in production: a save landed
// before the first fetch arrived, its payload's moodBoards field was
// whatever the stale local cache had (empty), and the server dutifully
// merged that empty value over a real, populated moodBoards array. See
// reference-docs/Team_Access_Restricted_Sync_Verification.md.
let restrictedClientsDbFirstSyncPromise = null;

// The last snapshot actually confirmed by the server for each client,
// keyed by name - kept separate from `clientsDb` itself (which may have
// local, not-yet-saved edits layered on top - see the pendingLocalClientEdits
// preservation below). commitRestrictedClientEdits diffs against this
// rather than sending everything currently in clientsDb[name], so a field
// neither the user nor this session actually touched can never be sent
// back and overwrite whatever's really on the server for it - closes the
// same class of bug as the first-sync guard above, but for every save
// after the first one too (e.g. a field that's stale in this browser's
// copy for some other reason still wouldn't get echoed back, because it'd
// never differ from what the last successful fetch already confirmed for
// it... except when it's actually been fetched and genuinely changed by
// this user, which is exactly the case that should be sent).
let restrictedLastServerClientState = {};

// Applies one /api/restricted-client-data response (already filtered to
// the caller's granted sections server-side) as the new clientsDb, same
// end-of-pipeline steps rebuildClientsDbFromShards uses for the
// unrestricted path (re-render, re-cache locally, and - critically -
// protect any client with an edit still in flight from being clobbered by
// this incoming snapshot, the same guard rebuildClientsDbFromShards itself
// needed for the identical reason on the unrestricted path; see
// pendingLocalClientEdits' own comment above rebuildClientsDbFromShards).
function applyRestrictedClientsDbSnapshot(data) {
  isRestrictedClientsDbSync = true;
  isRestrictedTeamMember = true;
  restrictedAllowedSections = data.sections || [];
  const incoming = data.clients || {};

  // Snapshot the server's own copy of each client BEFORE the local-edit
  // preservation below folds in anything - this is the diff baseline
  // commitRestrictedClientEdits uses, so it has to be what the server
  // actually confirmed, not whatever ends up in clientsDb next.
  restrictedLastServerClientState = JSON.parse(JSON.stringify(incoming));

  pendingLocalClientEdits.forEach(name => {
    if (clientsDb[name]) incoming[name] = clientsDb[name];
  });
  clientsDb = incoming;

  // No shard concept on this path - nothing for commitDatabaseToCloud's
  // partial-shard safety guard to wait on.
  lastKnownClientsDbShardCount = 0;
  clientsDbAllShardsLoaded = true;
  localStorage.setItem("REVITAL_HUB_CLIENTS", JSON.stringify(clientsDb));
  if (!clientsDb[activeClientName]) {
    activeClientName = Object.keys(clientsDb)[0] || "";
  }
  buildClientDropdown();
  refreshAllViews();
  renderDashboard();
}

function fetchRestrictedClientsDbSnapshot() {
  return fetch('/api/restricted-client-data', { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      if (data && data.restricted) {
        applyRestrictedClientsDbSnapshot(data);
      } else {
        console.warn("Expected a restricted /api/restricted-client-data response but got:", data);
      }
    })
    .catch(err => {
      console.error("Restricted clientsDb sync failed:", err);
      showBanner("error", "Couldn't sync with the cloud database: " + err.message);
    });
}

// Filtered REST sync path for Team-Access-restricted teammates (see
// /api/restricted-client-data in _worker.js). Not a Firestore listener, so
// there's no real-time push - polls on an interval instead, same tradeoff
// already accepted elsewhere in the Hub for non-realtime data. A
// restricted teammate's own saves also trigger an immediate refetch (see
// commitRestrictedClientEdits) so their own edits reflect right away
// regardless of the poll interval.
function startRestrictedClientsDbSync() {
  // Set immediately (not just inside applyRestrictedClientsDbSnapshot once
  // the first fetch resolves) - this function is only ever called right
  // after loadDatabase's own live read of agency/teamAccess confirmed this
  // account is genuinely restricted, so there's no reason to leave the
  // save-routing decision at its default (false) for the brief window
  // before the first snapshot lands.
  isRestrictedClientsDbSync = true;
  restrictedClientsDbFirstSyncPromise = fetchRestrictedClientsDbSnapshot();
  if (restrictedClientsDbPollTimer) clearInterval(restrictedClientsDbPollTimer);
  restrictedClientsDbPollTimer = setInterval(fetchRestrictedClientsDbSnapshot, 60000);
}

// ── Global Command Palette (Cmd+K) ──
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('cmdkOverlay');
  const input = document.getElementById('cmdkInput');
  const resultsEl = document.getElementById('cmdkResults');
  let selectedIndex = 0;
  let currentResults = [];

  // Read live from the sidebar DOM instead of a hand-maintained list -
  // the old hardcoded list here only covered 17 of 60+ tools and had
  // already drifted (My Clients, added this session, was never going to
  // be in a list someone has to remember to update by hand). .nav-item-btn
  // also matches the Admin footer buttons (Team Access, Service Pricing,
  // etc.), which is desirable - they're just as reachable via the
  // sidebar, so they should be just as searchable here. offsetParent
  // check skips anything currently hidden (a collapsed section still in
  // the DOM, or a Team-Access-restricted section/footer tool) so a
  // restricted teammate can't use the palette to reach something the
  // sidebar is deliberately hiding from them.
  const GENERIC_TOOL_ICON = 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5';
  function getNavTools() {
    return Array.from(document.querySelectorAll('.nav-item-btn[data-tab]'))
      .filter(btn => btn.offsetParent !== null)
      .map(btn => {
        const span = btn.querySelector('span:last-child');
        const pathEl = btn.querySelector('svg path');
        return {
          kind: 'tool',
          id: btn.getAttribute('data-tab'),
          title: (span ? span.textContent : btn.textContent).trim(),
          icon: pathEl ? pathEl.getAttribute('d') : GENERIC_TOOL_ICON
        };
      });
  }

  // Client jump: only searched (not listed by default - a full client
  // roster dumped into the palette on every open would bury the tool
  // list), and only once the query is non-trivial so "a" doesn't match
  // half the roster. Matches My Clients' "Open" behavior exactly -
  // switchClient + land on the dashboard - so Cmd+K becomes a second,
  // faster way to reach the same place, not a different destination.
  const CLIENT_ICON = 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8';
  function getClientMatches(q) {
    if (!q || q.length < 2) return [];
    const sandboxName = "Quick Sandbox (One-Offs)";
    return Object.keys(clientsDb)
      .filter(name => name !== sandboxName && name.toLowerCase().includes(q))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 8)
      .map(name => ({ kind: 'client', id: name, title: name, icon: CLIENT_ICON }));
  }

  function openCmdK() {
    overlay.style.display = 'flex';
    input.value = '';
    renderResults('');
    setTimeout(() => input.focus(), 50);
  }

  function closeCmdK() {
    overlay.style.display = 'none';
  }

  function renderResults(query) {
    const q = query.toLowerCase().trim();
    const toolMatches = getNavTools().filter(t => t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
    // Client matches first when there's a real query - "type a client
    // name" is usually someone who already knows exactly where they want
    // to go, same as picking that client from the workspace switcher.
    currentResults = [...getClientMatches(q), ...toolMatches];
    selectedIndex = 0;

    if (currentResults.length === 0) {
      resultsEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary);">No matches found.</div>';
      return;
    }

    resultsEl.innerHTML = currentResults.map((item, idx) => `
      <div class="cmdk-item ${idx === 0 ? 'active' : ''}" data-index="${idx}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${item.icon}"></path></svg>
        <div>
          <div class="cmdk-item-title">${escapeHtmlCore(item.title)}</div>
          <div class="cmdk-item-subtitle">${item.kind === 'client' ? 'Switch to client' : 'Navigation'}</div>
        </div>
      </div>
    `).join('');

    resultsEl.querySelectorAll('.cmdk-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-index'));
        executeResult(currentResults[idx]);
      });
      el.addEventListener('mouseenter', () => {
        resultsEl.querySelectorAll('.cmdk-item').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        selectedIndex = parseInt(el.getAttribute('data-index'));
      });
    });
  }

  function executeResult(item) {
    if (!item) return;
    closeCmdK();
    if (item.kind === 'client') {
      switchClient(item.id);
      navigateToTab('tab-dashboard');
      return;
    }
    // Simulate clicking the corresponding sidebar button
    const btn = document.querySelector(`.nav-item-btn[data-tab="${item.id}"]`);
    if (btn) btn.click();
  }

  window.addEventListener('keydown', (e) => {
    // Cmd+K or Ctrl+K
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      overlay.style.display === 'flex' ? closeCmdK() : openCmdK();
    }
    
    // Esc
    if (e.key === 'Escape' && overlay.style.display === 'flex') {
      closeCmdK();
    }
    
    // Navigation
    if (overlay.style.display === 'flex') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
        updateSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        updateSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeResult(currentResults[selectedIndex]);
      }
    }
  });

  function updateSelection() {
    const items = resultsEl.querySelectorAll('.cmdk-item');
    items.forEach((item, idx) => {
      if (idx === selectedIndex) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  if(input) {
    input.addEventListener('input', (e) => {
      renderResults(e.target.value);
    });
  }
});

// The dashboard's old "Live Activity Feed" card (and this whole
// agency/activityLog doc + createClientBlankState hook that fed it) was
// removed - it only ever logged one event ("Created new client
// workspace"), and that same event is already captured with more detail
// in agency/adminActivityLog (see logAdminActivity, called from
// createNewClient with the client's name as `details`) and viewable in
// the Activity Log tool. Nothing else in the Hub read agency/activityLog
// or window.agencyActivityLogs, so removing the writer here loses no
// data that wasn't already duplicated elsewhere. The old Firestore
// document itself (agency/activityLog) is simply orphaned now, not
// deleted - harmless, nothing reads or writes it anymore.
