// _worker.js
//
// Cloudflare Workers entry point (this project deploys as a Worker with
// static assets via git-connected auto-deploy, not Cloudflare Pages - so
// the functions/api/*.js "Pages Functions" convention that used to live
// here never actually ran). This single script now handles the two API
// routes directly and falls back to serving the static site for
// everything else via the ASSETS binding configured in wrangler.toml.

// Any Google account on this company domain is treated as authorized -
// previously this was a single hardcoded email, which silently locked out
// every employee except that one account.
const ADMIN_EMAIL_DOMAIN = "revitalproductions.com";

export default {
  // Cron Trigger (see [triggers] in wrangler.toml) - runs the Weekly
  // Agency Health Digest on a schedule with no request/user involved, so
  // it's a separate entry point from fetch() above. Deploys automatically
  // alongside the rest of this Worker; see runWeeklyHealthDigest below for
  // what it actually does.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runWeeklyHealthDigest(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/user") {
      return handleUser(request);
    }

    if (url.pathname === "/api/mint-firebase-token") {
      return handleMintFirebaseToken(request, env);
    }

    if (url.pathname === "/api/send-email") {
      return handleSendEmail(request, env);
    }

    if (url.pathname === "/api/contracts" && request.method === "POST") {
      return handleContractUpload(request, env);
    }

    if (url.pathname.startsWith("/api/contracts/")) {
      if (request.method === "GET") return handleContractGet(request, env);
      if (request.method === "DELETE") return handleContractDelete(request, env);
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // R2-backed image storage for tools that were previously embedding
    // images as base64 directly in Firestore (see the big comment above
    // handleMediaUpload below for why). Mood Board Builder is the first
    // caller; deliberately generic (not "mood-board-*") so Case Study
    // Builder and Brand Guidelines Builder can move onto the same route
    // later instead of each growing their own copy of this.
    if (url.pathname === "/api/media" && request.method === "POST") {
      return handleMediaUpload(request, env);
    }
    if (url.pathname.startsWith("/api/media/")) {
      if (request.method === "GET") return handleMediaGet(request, env);
      if (request.method === "DELETE") return handleMediaDelete(request, env);
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Restore UI for the copy-on-delete backup (see CONTRACTS_BACKUP_BUCKET
    // in wrangler.toml and handleContractDelete below) - lets the Contract
    // Template Library show what's been deleted and bring a file back.
    if (url.pathname === "/api/contracts-backup" && request.method === "GET") {
      return handleContractsBackupList(request, env);
    }
    if (url.pathname === "/api/contracts-backup/restore" && request.method === "POST") {
      return handleContractsBackupRestore(request, env);
    }

    if (url.pathname === "/api/docusign/send-envelope") {
      return handleDocusignSendEnvelope(request, env);
    }

    if (url.pathname === "/api/marketing-news") {
      return handleMarketingNews(request, env, ctx);
    }

    // Real, per-section-filtered clientsDb access for restricted Team
    // Access users - see the big comment above CLIENT_FIELD_SECTIONS
    // below for why this exists and how it relates to firestore.rules'
    // own (coarser, all-or-nothing) gate on clientsDb.
    if (url.pathname === "/api/restricted-client-data") {
      if (request.method === "GET") return handleRestrictedClientData(request, env);
      if (request.method === "POST") return handleRestrictedClientDataWrite(request, env);
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // ── Prospect Booking (book.revitalproductions.com, see /booking/) ──
    // Deliberately no Cf-Access-Authenticated-User-Email check on these
    // three - unlike every other /api/* route above, this one has to work
    // for anonymous prospects who aren't @revitalproductions.com at all.
    // That's safe because the booking subdomain isn't covered by the
    // Cloudflare Access application protecting the rest of this Worker
    // (Access apps are matched by hostname), so these routes are only
    // ever reachable via book.revitalproductions.com in the first place.
    if (url.pathname === "/api/booking/roster") {
      return handleBookingRoster(request, env);
    }
    if (url.pathname === "/api/booking/availability") {
      return handleBookingAvailability(request, env);
    }
    if (url.pathname === "/api/booking/book" && request.method === "POST") {
      return handleBookingCreate(request, env);
    }

    if (url.pathname === "/api/team-roster/sync-time-off" && request.method === "POST") {
      return handleTeamRosterTimeOffSync(request, env);
    }

    if (url.pathname === "/api/resource-booking/sync-calendar" && request.method === "POST") {
      return handleResourceBookingCalendarSync(request, env);
    }

    // Auto-builds a new client's Google Drive folder tree, matching the
    // "_CLIENT TEMPLATE (duplicate for new clients)" folder's layout in the
    // "Clients Assets" Shared Drive - fired from createNewClient() in app.js
    // the same way generateNewClientOnboardingEmails already is (fire-and-
    // forget, non-fatal if it fails). See handleCreateClientDriveFolder
    // below for the required Workspace Admin prerequisite (Drive scope
    // domain-wide delegation) this depends on.
    if (url.pathname === "/api/create-client-drive-folder" && request.method === "POST") {
      return handleCreateClientDriveFolder(request, env);
    }

    // Auto-builds a new client's ClickUp folder inside the "Delivery" space,
    // matching the 8-list layout every existing client folder there already
    // uses (Evry Intention LLC, Reginald White, the Demo Client folder) -
    // fired from createNewClient() in app.js the same fire-and-forget,
    // non-fatal way createClientDriveFolder already is. See
    // handleCreateClientClickUpFolder below.
    if (url.pathname === "/api/create-client-clickup-folder" && request.method === "POST") {
      return handleCreateClientClickUpFolder(request, env);
    }

    // Contractor Portal - deliberately no Cf-Access check, since this has
    // to work for someone with no revitalproductions.com account at all,
    // holding only their own magic-link token. Unlike /api/booking/* above,
    // this lives on the SAME hostname as the rest of the Hub (hub.*), which
    // Cloudflare Access protects wholesale - so both /contractor-portal/*
    // (the static page) and /api/contractor-portal/* (these routes) need a
    // manual "Bypass" policy added in the Cloudflare Access dashboard, the
    // same way /portal/* already has one. Without that, Access will block
    // the request before it ever reaches this Worker code. See
    // handleContractorPortal* below for how the token itself is verified.
    if (url.pathname === "/api/contractor-portal/data" && request.method === "GET") {
      return handleContractorPortalData(request, env);
    }
    if (url.pathname === "/api/contractor-portal/time-off" && request.method === "POST") {
      return handleContractorPortalTimeOff(request, env);
    }
    if (url.pathname === "/api/contractor-portal/hours" && request.method === "POST") {
      return handleContractorPortalHours(request, env);
    }

    if (url.pathname === "/api/pipeline/sync-clickup" && request.method === "POST") {
      return handlePipelineSyncClickUp(request, env);
    }

    if (url.pathname === "/api/pipeline/sync-onboarding-handoff-assignee" && request.method === "POST") {
      return handleOnboardingHandoffAssigneeSync(request, env);
    }

    if (url.pathname === "/api/idle-lock/status" && request.method === "GET") {
      return handleIdleLockStatus(request, env);
    }

    if (url.pathname === "/api/idle-lock/people" && request.method === "GET") {
      return handleIdleLockListPeople(request, env);
    }

    if (url.pathname === "/api/idle-lock/generate-pin" && request.method === "POST") {
      return handleIdleLockGeneratePin(request, env);
    }

    if (url.pathname === "/api/idle-lock/remove-pin" && request.method === "POST") {
      return handleIdleLockRemovePin(request, env);
    }

    if (url.pathname === "/api/idle-lock/verify-pin" && request.method === "POST") {
      return handleIdleLockVerifyPin(request, env);
    }

    if (url.pathname === "/api/idle-lock/engage" && request.method === "POST") {
      return handleIdleLockEngage(request, env);
    }

    if (url.pathname === "/api/billing/create-subscription-checkout" && request.method === "POST") {
      return handleCreateSubscriptionCheckout(request, env);
    }

    // No Cf-Access-Authenticated-User-Email check here (deliberately,
    // like /api/booking/* above) - Stripe calls this directly from its
    // own servers, not through a browser that's been through Cloudflare
    // Access. Trust here comes entirely from the Stripe-Signature
    // verification inside the handler (STRIPE_WEBHOOK_SECRET), not from
    // Access. IMPORTANT: this route must be registered in Stripe as
    // https://book.revitalproductions.com/api/stripe/webhook, NOT the
    // hub.revitalproductions.com one - Cloudflare Access protects the
    // whole hub.* hostname (including every /api/* path on it), so a
    // request from Stripe's servers would get stopped at the Access
    // layer before ever reaching this handler. book.* is bound to this
    // same Worker but sits outside that Access application (see
    // booking/index.html's header comment for the original reasoning),
    // so the path resolves the same way there without an Access wall
    // in front of it.
    if (url.pathname === "/api/stripe/webhook" && request.method === "POST") {
      return handleStripeWebhook(request, env);
    }

    // ── QuickBooks Online (Financial Center) ──
    // oauth-start/oauth-callback are visited directly by the browser (not
    // fetch()), so they read/redirect rather than return JSON - see the
    // handlers below for why. Both still sit behind Cloudflare Access
    // like every other hub.* path, so only someone already signed into
    // the Hub can reach them.
    if (url.pathname === "/api/quickbooks/oauth-start" && request.method === "GET") {
      return handleQuickBooksOAuthStart(request, env);
    }
    if (url.pathname === "/api/quickbooks/oauth-callback" && request.method === "GET") {
      return handleQuickBooksOAuthCallback(request, env);
    }
    if (url.pathname === "/api/quickbooks/status" && request.method === "GET") {
      return handleQuickBooksStatus(request, env);
    }
    if (url.pathname === "/api/quickbooks/snapshot" && request.method === "POST") {
      return handleQuickBooksSnapshot(request, env);
    }

    // Everything else: serve the static site as before.
    return env.ASSETS.fetch(request);
  }
};

// ── /api/user ──
// Reads the Cloudflare Access header for the authenticated user's email.
async function handleUser(request) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email") || "Guest";
  return new Response(JSON.stringify({ email }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0"
    }
  });
}

// ── /api/mint-firebase-token ──
// Bridges Cloudflare Access to Firebase Auth so the admin hub can sign in
// silently. Verifies the Access-authenticated email against the admin
// allowlist, then mints a Firebase custom token by hand-signing the JWT
// with the service account's private key via Web Crypto (RS256) - not the
// firebase-admin SDK, since that needs Node/gRPC and doesn't run in the
// Workers runtime.
//
// Requires a secret named FIREBASE_SERVICE_ACCOUNT_KEY (the full contents
// of a Firebase service account JSON key) set via:
//   wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY
// or Cloudflare dashboard -> Workers & Pages -> this Worker -> Settings ->
// Variables and Secrets (only available once this Worker has a script
// attached, which this file provides).
async function handleMintFirebaseToken(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");

  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  // Idle-lock check (Aug 2026) - the real barrier now lives in
  // firestore.rules (isIdleLocked(), checked on every read/write
  // regardless of how a Firebase token was obtained), but refusing to
  // even mint a token while locked is a cheap, clean fail-fast: without
  // this, a locked-out reload would silently get a technically-valid
  // token and then hit a wall of permission-denied errors from Firestore
  // instead of a clean "enter your PIN" screen. See handleIdleLockEngage
  // for what sets this, handleIdleLockVerifyPin for what clears it.
  try {
    const { accessToken: lockAccessToken, projectId: lockProjectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const lockDoc = await firestoreGetDoc(lockAccessToken, lockProjectId, "agency/idleLockPins");
    const lockEntry = lockDoc ? lockDoc[accessEmail.toLowerCase()] : null;
    if (lockEntry && lockEntry.lockedAt) {
      return jsonResponse({ error: "locked" }, 423);
    }
  } catch (e) {
    // Fail OPEN here deliberately, not closed - this is a UX fast-fail,
    // not the security boundary (that's firestore.rules). A transient
    // Firestore/auth hiccup on this check shouldn't lock someone out who
    // was never actually idle-locked in the first place.
    console.error("Idle-lock check failed during token mint (proceeding anyway):", e);
  }

  const keyJson = env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    return jsonResponse({ error: "Server missing FIREBASE_SERVICE_ACCOUNT_KEY secret" }, 500);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(keyJson);
  } catch (e) {
    return jsonResponse({ error: "FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON" }, 500);
  }

  try {
    const token = await createFirebaseCustomToken(serviceAccount, accessEmail);
    // email is included alongside the token (not just implied by it) so the
    // client can cheaply compare "who does Access say is here right now"
    // against whatever Firebase identity it already has cached, without
    // needing to decode the JWT itself - see the identity-recheck logic in
    // initAdminAuthGate in app.js.
    return jsonResponse({ token, email: accessEmail }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    console.error("Custom token mint failed:", e);
    return jsonResponse({ error: "Token mint failed: " + e.message }, 500);
  }
}

// ── /api/send-email ──
// Sends a real email through Resend (https://resend.com), server-side, so
// the API key never touches the browser. Called from the Hub's admin JS
// (the "Send" button on a notification's draft-email panel - see
// buildDraftEmailPanel() in app.js). Auto-send integration, per
// "Auto-Send Email Integration Plan.md": start with the stale-client
// nudge flow first, wire more flows in later one at a time.
//
// Requires a secret named RESEND_API_KEY, set via:
//   wrangler secret put RESEND_API_KEY
// or Cloudflare dashboard -> Workers & Pages -> agency-hub -> Settings ->
// Variables and Secrets.
//
// Gated the same way as /api/mint-firebase-token: only requests carrying a
// Cloudflare-Access-authenticated @revitalproductions.com email are
// allowed through. This endpoint is reachable at hub.revitalproductions.com
// which already sits behind Cloudflare Access, so this is a defense-in-depth
// check, not the only thing standing between this route and the internet.
const SEND_EMAIL_DOMAIN = "revitalproductions.com";

async function handleSendEmail(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: "Server missing RESEND_API_KEY secret" }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { to, subject, body, from, replyTo, attachments } = payload || {};

  if (!to || !subject || !body) {
    return jsonResponse({ error: "Missing required field: to, subject, and body are all required" }, 400);
  }

  // Optional PDF attachments (Welcome Guide / Intake Form emails) -
  // [{filename, content}] where content is a base64 string with no
  // "data:...;base64," prefix (the caller strips that before sending).
  // Resend's attachments field takes exactly this shape, so this is just
  // validation + pass-through, not any real transformation. Capped at a
  // handful of small attachments - these are one-to-two-page PDFs, not
  // arbitrary uploads, so a generous but real ceiling (10MB combined,
  // base64-encoded) is here to stop a malformed/huge payload from being
  // silently forwarded to Resend.
  let validatedAttachments;
  if (attachments !== undefined) {
    if (!Array.isArray(attachments)) {
      return jsonResponse({ error: '"attachments" must be an array' }, 400);
    }
    let totalBase64Length = 0;
    for (const a of attachments) {
      if (!a || typeof a.filename !== "string" || typeof a.content !== "string" || !a.filename || !a.content) {
        return jsonResponse({ error: "Each attachment needs a non-empty filename and content (base64 string)" }, 400);
      }
      totalBase64Length += a.content.length;
    }
    if (totalBase64Length > 10 * 1024 * 1024) {
      return jsonResponse({ error: "Attachments too large (10MB combined limit)" }, 400);
    }
    validatedAttachments = attachments.map(a => ({ filename: a.filename, content: a.content }));
  }

  // The "from" address is caller-supplied (e.g. the account manager's own
  // @revitalproductions.com address, so replies land in their real inbox
  // without a separate Reply-To) - but only ever for this verified root
  // domain. This stops the route being used to spoof arbitrary senders,
  // even though it's already gated behind Cloudflare Access above.
  const fromAddress = from || `Revital Productions <hello@${SEND_EMAIL_DOMAIN}>`;
  const fromEmailMatch = fromAddress.match(/<([^>]+)>/);
  const fromEmail = (fromEmailMatch ? fromEmailMatch[1] : fromAddress).toLowerCase();
  if (!fromEmail.endsWith("@" + SEND_EMAIL_DOMAIN)) {
    return jsonResponse({ error: `"from" must be an @${SEND_EMAIL_DOMAIN} address` }, 400);
  }

  const resendBody = {
    from: fromAddress,
    to: Array.isArray(to) ? to : [to],
    subject,
    text: body
  };
  if (replyTo) resendBody.reply_to = replyTo;
  if (validatedAttachments) resendBody.attachments = validatedAttachments;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(resendBody)
    });

    const resendData = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      console.error("Resend send failed:", resendRes.status, resendData);
      return jsonResponse({ error: resendData.message || "Resend API error", status: resendRes.status }, 502);
    }

    return jsonResponse({ success: true, id: resendData.id || null }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    console.error("Send-email request failed:", e);
    return jsonResponse({ error: "Request to Resend failed: " + e.message }, 500);
  }
}

// ── /api/contracts (upload) + /api/contracts/:key (fetch/delete) ──
// Backs the Contract Template Library in the Contract & Invoice Tracker
// (see contract-invoice-tracker/js/app.js) - lets contracts be added or
// replaced from the Hub UI without a code change + redeploy, unlike the
// original 6 templates which still live as static files under
// /contracts/. Stored in an R2 bucket (binding: CONTRACTS_BUCKET, see
// wrangler.toml) since these PDFs are too large to comfortably live as
// base64 inside a Firestore document (Firestore's ~1MB doc ceiling) -
// only small JSON metadata (label, which R2 key it maps to) lives in
// Firestore, at agency/contractTemplates.
//
// Gated the same way as /api/send-email: only requests carrying a
// Cloudflare-Access-authenticated @revitalproductions.com email are
// allowed through. Defense-in-depth, not the only thing standing between
// this route and the internet - hub.revitalproductions.com already sits
// behind Cloudflare Access.
const CONTRACTS_MAX_BYTES = 20 * 1024 * 1024; // generous ceiling for a handful-of-pages legal PDF

function isContractRequestAuthorized(request) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  return !!accessEmail && accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN);
}

// ── /api/marketing-news ──
// Pulls recent headlines from a curated list of marketing/industry RSS
// feeds server-side and returns them as one merged, sorted JSON list -
// the Marketing News tool (marketing-news-feed/) just renders this, it
// never talks to the outside publications directly (avoids CORS entirely,
// since almost none of these sites send an Access-Control-Allow-Origin
// header for cross-origin browser fetches).
//
// NOTE: these feed URLs were picked from each publication's documented
// RSS endpoint, but couldn't be live-verified from the environment this
// was written in (no outbound network access there) - if a source shows
// up empty or missing after deploy, its URL is the first thing to check
// and fix in this array. A broken/renamed URL for one feed only drops
// that one source (see Promise.allSettled below) - it doesn't take the
// whole feature down.
const MARKETING_NEWS_FEEDS = [
  { name: "Marketing Dive", url: "https://www.marketingdive.com/feeds/news/" },
  { name: "Social Media Today", url: "https://www.socialmediatoday.com/feeds/news" },
  { name: "Search Engine Land", url: "https://searchengineland.com/feed" },
  // Confirmed via the failedSources error detail (added separately) that
  // this one fails with a hard HTTP 403 - not a dead URL, a bot-protection
  // block on martech.org's side that a browser-like User-Agent alone
  // wasn't enough to get past. Routed through a public CORS/passthrough
  // proxy (allorigins.win) instead of fetching directly, so the request
  // originates from the proxy's IP rather than this Worker's - same raw
  // XML comes back either way, so parseFeedItems doesn't need to change.
  // If the proxy itself is ever down, this just fails like any other
  // source (see Promise.allSettled below) - it doesn't take anything else
  // with it.
  { name: "MarTech", url: "https://martech.org/feed/", viaProxy: true },
  { name: "HubSpot Marketing Blog", url: "https://blog.hubspot.com/marketing/rss.xml" }
];

const RSS_CORS_PROXY = "https://api.allorigins.win/raw?url=";

const MARKETING_NEWS_CACHE_SECONDS = 1800; // 30 min - see handleMarketingNews

function decodeXmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

function stripHtmlTags(str) {
  return (str || "").replace(/<[^>]*>/g, "").trim();
}

function extractXmlTag(block, tag) {
  // [\s\S] instead of . so a description/summary spanning multiple lines
  // (common with CDATA-wrapped HTML) still matches - a plain . in JS regex
  // doesn't match newlines without the /s flag, which isn't available in
  // every engine this could run under.
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeXmlEntities(m[1]).trim() : "";
}

// RSS 2.0 uses a plain <link>URL</link> text node. Atom uses
// <link href="URL" rel="alternate"/> (rel is sometimes omitted, in which
// case "alternate" - the actual article - is the correct default per the
// Atom spec, not a fallback guess). Tries RSS's plain form first since
// that's the more common feed format among these sources.
function extractXmlLink(block) {
  const rssMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
  if (rssMatch && rssMatch[1].trim()) return decodeXmlEntities(rssMatch[1]).trim();

  const atomLinkTags = block.match(/<link\b[^>]*\/?>/gi) || [];
  for (const tag of atomLinkTags) {
    const relMatch = tag.match(/rel="([^"]*)"/i);
    if (relMatch && relMatch[1] !== "alternate") continue;
    const hrefMatch = tag.match(/href="([^"]*)"/i);
    if (hrefMatch) return decodeXmlEntities(hrefMatch[1]).trim();
  }
  return "";
}

function parseFeedItems(xmlText, sourceName) {
  const blocks = xmlText.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map(block => {
    const title = stripHtmlTags(extractXmlTag(block, "title"));
    const link = extractXmlLink(block);
    const dateStr = extractXmlTag(block, "pubDate") || extractXmlTag(block, "updated")
      || extractXmlTag(block, "published") || extractXmlTag(block, "dc:date");
    const date = dateStr ? new Date(dateStr) : null;
    const rawSummary = extractXmlTag(block, "description") || extractXmlTag(block, "summary")
      || extractXmlTag(block, "content");
    const description = stripHtmlTags(rawSummary).slice(0, 220);
    return {
      title,
      link,
      source: sourceName,
      date: (date && !isNaN(date.getTime())) ? date.toISOString() : null,
      description
    };
  }).filter(item => item.title && item.link);
}

function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    // A custom User-Agent (the original "RevitalHubMarketingNews/1.0")
    // is exactly the kind of signal bot-protection on the source site
    // (many of these publications sit behind Cloudflare themselves) uses
    // to block non-browser requests - MarTech's feed failed in production
    // with this in place even though the URL itself is correct. A
    // standard browser UA string sails through the same protection a
    // real visitor's browser would.
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "application/rss+xml, application/xml, text/xml, */*"
    },
    signal: controller.signal
  }).finally(() => clearTimeout(timer));
}

async function handleMarketingNews(request, env, ctx) {
  if (!isContractRequestAuthorized(request)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  // Cache across every teammate's request, not per-user - these headlines
  // are the same for everyone and refetching all 5 feeds on every single
  // page load would be slow and needlessly hammer the source sites. Keyed
  // on a fixed URL (query string stripped) so cache hits work regardless
  // of the ?refresh=1 bypass below - otherwise ?refresh=1 requests would
  // each get their own permanent cache slot instead of ever hitting the
  // one everyone else shares.
  const cache = caches.default;
  const cacheKey = new Request("https://hub.revitalproductions.com/api/marketing-news");

  // The Marketing News tool's "Refresh" button sends ?refresh=1 to force a
  // real re-check instead of just re-asking for the same cached response -
  // without this, "Refresh" was pure theater: a code fix (like the
  // User-Agent change above) or a source coming back online wouldn't
  // actually show up until the cache's 30-minute window happened to
  // expire on its own, no matter how many times someone clicked it.
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
  if (!forceRefresh) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const results = await Promise.allSettled(
    MARKETING_NEWS_FEEDS.map(async feed => {
      const fetchUrl = feed.viaProxy ? (RSS_CORS_PROXY + encodeURIComponent(feed.url)) : feed.url;
      const res = await fetchWithTimeout(fetchUrl, 8000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return parseFeedItems(text, feed.name);
    })
  );

  let items = [];
  // failedSources used to be just an array of names ("MarTech") with no way
  // to tell WHY a source failed short of digging through `wrangler tail`
  // logs - which meant every retry was a guess (wrong UA? dead URL? bot
  // block?). Now each entry carries the actual error/status so the reason
  // is visible right in the API response and in the tool's own UI.
  const failedSources = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      items = items.concat(result.value);
    } else {
      const reason = result.reason;
      const errorMessage = (reason && reason.name === "AbortError")
        ? "Timed out"
        : (reason && reason.message) ? reason.message : String(reason);
      failedSources.push({ name: MARKETING_NEWS_FEEDS[i].name, error: errorMessage });
      console.error(`Marketing news feed failed (${MARKETING_NEWS_FEEDS[i].name}):`, reason);
    }
  });

  items.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date) - new Date(a.date);
  });
  items = items.slice(0, 40);

  const response = jsonResponse(
    { items, failedSources, fetchedAt: new Date().toISOString() },
    200,
    { "Cache-Control": `public, max-age=${MARKETING_NEWS_CACHE_SECONDS}` }
  );

  // Store in the background rather than awaiting it, so the teammate who
  // triggers a cache-miss fetch doesn't wait any longer for a response
  // than they would have anyway.
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function handleContractUpload(request, env) {
  if (!isContractRequestAuthorized(request)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  if (!env.CONTRACTS_BUCKET) {
    return jsonResponse({ error: "Server missing CONTRACTS_BUCKET R2 binding - create the bucket (wrangler r2 bucket create revital-contracts) and redeploy" }, 500);
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return jsonResponse({ error: "Expected multipart/form-data body with a 'file' field" }, 400);
  }

  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return jsonResponse({ error: "Missing file" }, 400);
  }
  if (file.size > CONTRACTS_MAX_BYTES) {
    return jsonResponse({ error: `File too large (${CONTRACTS_MAX_BYTES / (1024 * 1024)}MB limit)` }, 400);
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 5));
  // Verify the actual file content is a PDF (magic bytes "%PDF-") rather
  // than trusting the client-supplied MIME type, which is trivially
  // spoofable from the browser.
  const header = String.fromCharCode(...bytes);
  if (header !== "%PDF-") {
    return jsonResponse({ error: "File does not look like a valid PDF" }, 400);
  }

  // Keys are always generated server-side (never client-supplied) so an
  // upload can never target/overwrite an arbitrary existing key.
  const key = `uploaded/${Date.now()}-${crypto.randomUUID()}.pdf`;
  await env.CONTRACTS_BUCKET.put(key, buffer, {
    httpMetadata: { contentType: "application/pdf" }
  });

  return jsonResponse({ success: true, key }, 200, { "Cache-Control": "no-store" });
}

function getContractKeyFromPath(request) {
  const key = decodeURIComponent(new URL(request.url).pathname.slice("/api/contracts/".length));
  if (!key || key.includes("..")) return null;
  return key;
}

async function handleContractGet(request, env) {
  if (!isContractRequestAuthorized(request)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  if (!env.CONTRACTS_BUCKET) {
    return jsonResponse({ error: "Server missing CONTRACTS_BUCKET R2 binding" }, 500);
  }
  const key = getContractKeyFromPath(request);
  if (!key) return jsonResponse({ error: "Invalid key" }, 400);

  const obj = await env.CONTRACTS_BUCKET.get(key);
  if (!obj) return jsonResponse({ error: "Not found" }, 404);

  return new Response(obj.body, {
    headers: {
      "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/pdf",
      "Cache-Control": "private, max-age=300"
    }
  });
}

async function handleContractDelete(request, env) {
  if (!isContractRequestAuthorized(request)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  if (!env.CONTRACTS_BUCKET) {
    return jsonResponse({ error: "Server missing CONTRACTS_BUCKET R2 binding" }, 500);
  }
  const key = getContractKeyFromPath(request);
  if (!key) return jsonResponse({ error: "Invalid key" }, 400);
  // Optional, best-effort human-readable label (the caller's Firestore
  // entry for this file - see deleteR2Object's label param in
  // shared-contract-pdf-tools.js), so the Recently Deleted list can show
  // "Master Service Agreement" instead of a raw R2 key. Never required -
  // an empty label just falls back to showing the key in the restore UI.
  const label = new URL(request.url).searchParams.get("label") || "";

  // Copy-on-delete backup (see CONTRACTS_BACKUP_BUCKET in wrangler.toml) -
  // R2 has no native object versioning, so this is what stands in for it.
  // Runs for both a direct Delete click and the delete-old-file step of a
  // Replace (deleteR2Object in shared-contract-pdf-tools.js hits this same
  // endpoint either way). If the backup bucket isn't configured yet (not
  // created, or binding missing), this is a no-op and delete proceeds
  // exactly as it did before this existed - it never blocks a delete just
  // because backups aren't set up. If the bucket IS configured but the
  // backup write itself fails, the delete is cancelled rather than risking
  // an unrecoverable loss - better to ask the admin to retry than to
  // silently delete something with no copy anywhere.
  if (env.CONTRACTS_BACKUP_BUCKET) {
    const existing = await env.CONTRACTS_BUCKET.get(key);
    if (existing) {
      // Random key rather than one derived from the original - the
      // original key/label are preserved properly via customMetadata
      // instead (read back by handleContractsBackupList/Restore below),
      // so nothing needs to be reconstructed by parsing the backup key.
      const backupKey = `deleted/${Date.now()}-${crypto.randomUUID()}.pdf`;
      try {
        await env.CONTRACTS_BACKUP_BUCKET.put(backupKey, existing.body, {
          httpMetadata: existing.httpMetadata,
          customMetadata: { originalKey: key, originalLabel: label }
        });
      } catch (e) {
        console.error("Backup copy before contract delete failed:", e);
        return jsonResponse({ error: "Couldn't back up the file before deleting, so the delete was cancelled - try again in a moment." }, 500);
      }
    }
  }

  await env.CONTRACTS_BUCKET.delete(key);
  return jsonResponse({ success: true }, 200, { "Cache-Control": "no-store" });
}

// ── /api/media (upload) + /api/media/:key (fetch/delete) ──
// General-purpose R2-backed image storage. Written for Mood Board
// Builder, whose reference images were being stored as base64 data URLs
// directly inline in the client's clientsDb Firestore document (see
// shared-dropzone.js's processImageFile) - fine for one or two images,
// but the whole clientsDb document gets rewritten on every save, and
// Firestore caps a single document around ~1MB. A client with several
// mood boards' worth of images could push their own record close to
// that ceiling and start failing saves outright, not just look bloated
// (see the client-size warnings in mood-board-builder/js/app.js).
//
// Deliberately named /api/media rather than /api/mood-board-images -
// Case Study Builder and Brand Guidelines Builder both call the exact
// same processImageFile() helper and have the exact same inline-base64
// problem waiting to happen; this route is written so either can switch
// to it later without a new endpoint.
//
// Stored in an R2 bucket (binding: MEDIA_BUCKET, see wrangler.toml) -
// only a small JSON reference (the R2 key/URL) needs to live in
// Firestore now instead of the image bytes themselves.
//
// Auth is asymmetric, unlike the contracts routes: upload/delete are
// gated the same way (Cloudflare-Access-authenticated
// @revitalproductions.com requests only), but GET is deliberately
// public. Mood boards can be marked "shared with client" and rendered
// in the public Client Portal (portal/js/app.js), which is unauthenticated
// magic-link access, not Cloudflare Access - the same reason
// firestore.rules' clients/{clientId} collection is "allow get: if
// true" (see the Public Client Portal boundary section of
// ARCHITECTURE.md: holding the link *is* the access control). Requiring
// staff auth on GET here would have broken every shared mood board image
// for the client viewing their own portal. Keys are server-generated
// crypto.randomUUID() values, unguessable and never reused, so an
// unauthenticated-but-unguessable URL is the same security model the
// portal itself already runs on, not a weaker one.
const MEDIA_MAX_BYTES = 30 * 1024 * 1024; // generous for client-compressed images; covers the 25MB raw-file cap mood-board-builder's handleDroppedVideo passes to processVideoFile, plus headroom for multipart overhead

const MEDIA_IMAGE_SIGNATURES = [
  { type: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  // WEBP: "RIFF" .... "WEBP" - two separate byte runs, not one contiguous
  // signature (bytes 4-7 are a file-length field that varies per file).
  { type: "image/webp", ext: "webp", bytes: [0x52, 0x49, 0x46, 0x46], extra: { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 } }
];

function detectMediaImageType(bytes) {
  for (const sig of MEDIA_IMAGE_SIGNATURES) {
    let matches = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (bytes[i] !== sig.bytes[i]) { matches = false; break; }
    }
    if (matches && sig.extra) {
      for (let i = 0; i < sig.extra.bytes.length; i++) {
        if (bytes[sig.extra.offset + i] !== sig.extra.bytes[i]) { matches = false; break; }
      }
    }
    if (matches) return sig;
  }
  return null;
}

// Video support (Aug 2026): mood-board-builder's video drop path
// (handleDroppedVideo) used to have no upload step at all - unlike
// images, it just kept the full raw video as a base64 data URL inline
// in the client's Firestore doc forever. Firestore caps any single
// string field at ~1,048,487 bytes; a 3MB raw video (the client-side
// cap in processVideoFile) becomes a ~4MB base64 string once encoded,
// so any video attached this way was guaranteed to blow that per-field
// limit - Firestore reports this failure as "Property X contains an
// invalid nested entity" rather than a clearer size error once the
// oversized string is nested inside embedLinks/moodBoards, which is
// what actually surfaced for Evry Intention LLC. Detecting real video
// signatures here (mirroring shared-dropzone.js's
// _sharedDetectVideoType) lets /api/media accept video the same way it
// already accepts images, so only a short R2 reference needs to live
// in Firestore.
function detectMediaVideoType(bytes) {
  // MP4 and MOV (QuickTime) are both ISO base media containers - the
  // file type box ("ftyp") sits at byte offset 4 in either one.
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return { type: "video/mp4", ext: "mp4" };
  }
  // WEBM (Matroska/EBML) - fixed 4-byte magic number at the very start.
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { type: "video/webm", ext: "webm" };
  }
  return null;
}

async function handleMediaUpload(request, env) {
  if (!isContractRequestAuthorized(request)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  if (!env.MEDIA_BUCKET) {
    return jsonResponse({ error: "Server missing MEDIA_BUCKET R2 binding - create the bucket (wrangler r2 bucket create revital-media) and redeploy" }, 500);
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return jsonResponse({ error: "Expected multipart/form-data body with a 'file' field" }, 400);
  }

  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return jsonResponse({ error: "Missing file" }, 400);
  }
  if (file.size > MEDIA_MAX_BYTES) {
    return jsonResponse({ error: `File too large (${MEDIA_MAX_BYTES / (1024 * 1024)}MB limit)` }, 400);
  }

  const buffer = await file.arrayBuffer();
  // Verify the actual file content (magic bytes), rather than trusting
  // the client-supplied MIME type, which is trivially spoofable. Tries
  // image signatures first (the common case), then video.
  const bytes = new Uint8Array(buffer.slice(0, 16));
  const sig = detectMediaImageType(bytes) || detectMediaVideoType(bytes);
  if (!sig) {
    return jsonResponse({ error: "File does not look like a valid PNG, JPEG, WEBP image, or MP4/WEBM/MOV video" }, 400);
  }

  // Keys are always generated server-side (never client-supplied) so an
  // upload can never target/overwrite an arbitrary existing key. Prefixed
  // by caller-provided context (e.g. "mood-board") purely for readability
  // when browsing the bucket - not used for access control.
  const rawContext = (form.get("context") || "misc").toString();
  const context = rawContext.replace(/[^a-z0-9-]/gi, "-").slice(0, 40) || "misc";
  const key = `${context}/${Date.now()}-${crypto.randomUUID()}.${sig.ext}`;

  await env.MEDIA_BUCKET.put(key, buffer, {
    httpMetadata: { contentType: sig.type }
  });

  return jsonResponse({ success: true, key, url: `/api/media/${encodeURIComponent(key)}` }, 200, { "Cache-Control": "no-store" });
}

function getMediaKeyFromPath(request) {
  const key = decodeURIComponent(new URL(request.url).pathname.slice("/api/media/".length));
  if (!key || key.includes("..")) return null;
  return key;
}

async function handleMediaGet(request, env) {
  // Deliberately no isContractRequestAuthorized() check here - see the
  // big comment above MEDIA_MAX_BYTES for why GET is public while
  // upload/delete are not (mood board images render in the unauthenticated
  // Client Portal). Keys are unguessable crypto.randomUUID() values, which
  // is the access control.
  if (!env.MEDIA_BUCKET) {
    return jsonResponse({ error: "Server missing MEDIA_BUCKET R2 binding" }, 500);
  }
  const key = getMediaKeyFromPath(request);
  if (!key) return jsonResponse({ error: "Invalid key" }, 400);

  const obj = await env.MEDIA_BUCKET.get(key);
  if (!obj) return jsonResponse({ error: "Not found" }, 404);

  return new Response(obj.body, {
    headers: {
      "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
      // Long-lived and public (not "private" like the old copy of this
      // header on handleContractGet) - portal visitors need to load these
      // directly, and there's no per-user variation to worry about since
      // the content behind a given key never changes.
      "Cache-Control": "public, max-age=86400"
    }
  });
}

async function handleMediaDelete(request, env) {
  if (!isContractRequestAuthorized(request)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  if (!env.MEDIA_BUCKET) {
    return jsonResponse({ error: "Server missing MEDIA_BUCKET R2 binding" }, 500);
  }
  const key = getMediaKeyFromPath(request);
  if (!key) return jsonResponse({ error: "Invalid key" }, 400);

  // No copy-on-delete backup here unlike contracts - these are reference
  // images someone dragged in for inspiration, not signed legal
  // documents, so the recoverability bar is intentionally lower.
  await env.MEDIA_BUCKET.delete(key);
  return jsonResponse({ success: true }, 200, { "Cache-Control": "no-store" });
}

// ── /api/contracts-backup (list) + /api/contracts-backup/restore ──
// Restore side of the copy-on-delete backup above. Lists what's sitting
// in CONTRACTS_BACKUP_BUCKET (everything under the deleted/ prefix) and
// lets a file be copied back into the live CONTRACTS_BUCKET on demand -
// see the Recently Deleted panel in the Contract & Invoice Tracker's
// Contract Template Library.
async function handleContractsBackupList(request, env) {
  if (!isContractRequestAuthorized(request)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  if (!env.CONTRACTS_BACKUP_BUCKET) {
    // Not configured yet (bucket not created) - empty list rather than an
    // error, since "nothing's been backed up" is the correct state before
    // the one-time bucket-creation step happens.
    return jsonResponse({ items: [] }, 200, { "Cache-Control": "no-store" });
  }

  const listed = await env.CONTRACTS_BACKUP_BUCKET.list({
    prefix: "deleted/",
    include: ["customMetadata"],
    limit: 200
  });

  const items = listed.objects.map(obj => ({
    key: obj.key,
    size: obj.size,
    deletedAt: obj.uploaded ? obj.uploaded.toISOString() : null,
    originalLabel: (obj.customMetadata && obj.customMetadata.originalLabel) || "",
    originalKey: (obj.customMetadata && obj.customMetadata.originalKey) || ""
  })).sort((a, b) => (b.deletedAt || "").localeCompare(a.deletedAt || ""));

  return jsonResponse({ items }, 200, { "Cache-Control": "no-store" });
}

async function handleContractsBackupRestore(request, env) {
  if (!isContractRequestAuthorized(request)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  if (!env.CONTRACTS_BACKUP_BUCKET || !env.CONTRACTS_BUCKET) {
    return jsonResponse({ error: "R2 backup/primary bucket not configured" }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const backupKey = payload && payload.key;
  if (!backupKey || typeof backupKey !== "string" || backupKey.includes("..") || !backupKey.startsWith("deleted/")) {
    return jsonResponse({ error: "Invalid key" }, 400);
  }

  const obj = await env.CONTRACTS_BACKUP_BUCKET.get(backupKey);
  if (!obj) {
    return jsonResponse({ error: "Backup file not found - it may already have been restored, or the backup itself was removed" }, 404);
  }

  // Always restores to a brand-new key rather than the original one - by
  // the time a file is deleted, the Firestore entry that pointed at its
  // original key is already gone (removed client-side before the delete
  // request even fires), so nothing depends on reusing that exact key.
  // A fresh key also sidesteps any (extremely unlikely, since keys are
  // random UUIDs) collision with something uploaded since the delete.
  const restoredKey = `uploaded/${Date.now()}-${crypto.randomUUID()}.pdf`;
  await env.CONTRACTS_BUCKET.put(restoredKey, obj.body, {
    httpMetadata: obj.httpMetadata
  });

  const originalLabel = (obj.customMetadata && obj.customMetadata.originalLabel) || "";
  return jsonResponse({ success: true, key: restoredKey, label: originalLabel }, 200, { "Cache-Control": "no-store" });
}

// ── /api/docusign/send-envelope ──
// Creates and sends a Docusign envelope from a pre-built Template (see
// the Contract & Invoice Tracker's DocuSign send option) instead of
// emailing a flat PDF attachment - the signer gets Docusign's real
// signing experience and a legally-binding e-signature, rather than a
// print/sign/scan round trip.
//
// Auth: Docusign JWT Grant (server-to-server, no per-send login) - the
// same RS256-signed-JWT approach as /api/mint-firebase-token above, just
// pointed at Docusign's token endpoint instead of Google's. One-time
// setup required in the Docusign account before this works:
//   1. Create an Integration Key (Admin -> Apps and Keys -> Add App),
//      generate an RSA keypair for it (Service Integration section).
//   2. Grant consent once by visiting, in a browser:
//      https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=YOUR_INTEGRATION_KEY&redirect_uri=YOUR_REGISTERED_REDIRECT_URI
//      (swap account-d.docusign.com for account.docusign.com to grant consent
//      against the production account once Go-Live is approved.)
//      and clicking Allow.
//   3. Test-mode secrets (sandbox - already set, points at demo.docusign.net):
//        wrangler secret put DOCUSIGN_INTEGRATION_KEY
//        wrangler secret put DOCUSIGN_USER_ID          (API Username GUID, not the Account ID)
//        wrangler secret put DOCUSIGN_ACCOUNT_ID
//        wrangler secret put DOCUSIGN_PRIVATE_KEY      (the RSA private key from step 1, full PEM)
//   4. Live-mode secrets (production account, only exist once Go-Live is
//      approved - same four values, from the production Apps and Keys page,
//      under the _LIVE names):
//        wrangler secret put DOCUSIGN_INTEGRATION_KEY_LIVE
//        wrangler secret put DOCUSIGN_USER_ID_LIVE
//        wrangler secret put DOCUSIGN_ACCOUNT_ID_LIVE
//        wrangler secret put DOCUSIGN_PRIVATE_KEY_LIVE
//
// Test/live split mirrors the Stripe pattern elsewhere in this file
// (STRIPE_SECRET_KEY vs STRIPE_SECRET_KEY_LIVE, gated by a `mode` the
// frontend sends): `docusignMode` below is "test" unless the request
// explicitly says "live", so a missing/blank mode always falls back to
// the safe sandbox path. Test mode stays hardcoded to the fixed demo
// host/API base below. Live mode can't be hardcoded the same way -
// production accounts live on different regional data centers (na1,
// na2, na3, eu, ...) - so getDocusignAccessToken looks it up once per
// request via account.docusign.com/oauth/userinfo, per Docusign's own
// Go-Live docs (https://developers.docusign.com/docs/esign-rest-api/go-live/).
const DOCUSIGN_TEST_AUTH_HOST = "account-d.docusign.com";
const DOCUSIGN_TEST_API_BASE = "https://demo.docusign.net/restapi/v2.1";
const DOCUSIGN_LIVE_AUTH_HOST = "account.docusign.com";

function docusignSecretsFor(env, mode) {
  if (mode === "live") {
    return {
      integrationKey: env.DOCUSIGN_INTEGRATION_KEY_LIVE,
      userId: env.DOCUSIGN_USER_ID_LIVE,
      accountId: env.DOCUSIGN_ACCOUNT_ID_LIVE,
      privateKey: env.DOCUSIGN_PRIVATE_KEY_LIVE
    };
  }
  return {
    integrationKey: env.DOCUSIGN_INTEGRATION_KEY,
    userId: env.DOCUSIGN_USER_ID,
    accountId: env.DOCUSIGN_ACCOUNT_ID,
    privateKey: env.DOCUSIGN_PRIVATE_KEY
  };
}

async function createDocusignJWT(env, mode) {
  const authHost = mode === "live" ? DOCUSIGN_LIVE_AUTH_HOST : DOCUSIGN_TEST_AUTH_HOST;
  const secrets = docusignSecretsFor(env, mode);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: secrets.integrationKey,
    sub: secrets.userId,
    aud: authHost,
    iat: now,
    exp: now + 3600,
    scope: "signature impersonation"
  };

  const unsigned = `${base64urlStr(JSON.stringify(header))}.${base64urlStr(JSON.stringify(payload))}`;
  const key = await importPrivateKeyFlexible(secrets.privateKey);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64url(signature)}`;
}

// Returns { accessToken, apiBase }. Test mode's apiBase is the fixed demo
// host. Live mode calls /oauth/userinfo once to find this account's actual
// base_uri (its regional data center) and derives apiBase from that -
// Docusign explicitly warns against assuming a fixed production host.
async function getDocusignAccessToken(env, mode) {
  const authHost = mode === "live" ? DOCUSIGN_LIVE_AUTH_HOST : DOCUSIGN_TEST_AUTH_HOST;
  const assertion = await createDocusignJWT(env, mode);
  const res = await fetch(`https://${authHost}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = data.error_description || data.error || `Docusign auth failed (${res.status})`;
    if (data.error === "consent_required") {
      msg += ` - consent hasn't been granted yet for ${mode} mode; see the one-time consent URL in this file's header comment.`;
    }
    throw new Error(msg);
  }

  if (mode !== "live") {
    return { accessToken: data.access_token, apiBase: DOCUSIGN_TEST_API_BASE };
  }

  const accountId = docusignSecretsFor(env, mode).accountId;
  const userInfoRes = await fetch(`https://${authHost}/oauth/userinfo`, {
    headers: { "Authorization": `Bearer ${data.access_token}` }
  });
  const userInfo = await userInfoRes.json().catch(() => ({}));
  if (!userInfoRes.ok) {
    throw new Error(userInfo.error_description || userInfo.error || `Docusign userinfo lookup failed (${userInfoRes.status})`);
  }
  const account = (userInfo.accounts || []).find(a => a.account_id === accountId) || (userInfo.accounts || [])[0];
  if (!account || !account.base_uri) {
    throw new Error("Docusign userinfo response didn't include a base_uri for the live account");
  }
  return { accessToken: data.access_token, apiBase: `${account.base_uri}/restapi/v2.1` };
}

async function handleDocusignSendEnvelope(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!isContractRequestAuthorized(request)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // Same safe-by-default pattern as Stripe's billingMode: anything other
  // than an explicit "live" falls back to the sandbox.
  const docusignMode = payload && payload.docusignMode === "live" ? "live" : "test";
  const requiredSecrets = docusignSecretsFor(env, docusignMode);
  if (!requiredSecrets.integrationKey || !requiredSecrets.userId || !requiredSecrets.privateKey || !requiredSecrets.accountId) {
    const suffix = docusignMode === "live" ? "_LIVE" : "";
    return jsonResponse({ error: `Server missing Docusign ${docusignMode}-mode secrets - set DOCUSIGN_INTEGRATION_KEY${suffix}, DOCUSIGN_USER_ID${suffix}, DOCUSIGN_ACCOUNT_ID${suffix}, and DOCUSIGN_PRIVATE_KEY${suffix}` }, 500);
  }

  const { templateId, templateRoleName, signerName, signerEmail, emailSubject, documents, fieldValues, blankFields, blankCheckboxFields } = payload || {};
  if (!signerName || !signerEmail) {
    return jsonResponse({ error: "signerName and signerEmail are required" }, 400);
  }

  // Optional per-contract data fields (Client Name, Effective Date, Project
  // Fee, etc), admin-supplied and LOCKED (the signer can't edit them).
  // Each of the 6 built-in contract PDFs has an invisible "[[TOKEN_NAME]]"
  // anchor baked in next to its fill-in-the-blank lines (same technique as
  // the [[SIG_CLIENT]]/[[DATE_CLIENT]] anchors below). fieldValues is a
  // flat { TOKEN_NAME: "value" } map from the Contract & Invoice Tracker's
  // "Fill Contract Details" step - anchorIgnoreIfNotPresent means a token
  // that isn't in whichever document(s) are actually in this envelope is
  // silently skipped, so one fieldValues object can cover a combined send
  // of several different contract types at once. See blankTextTabs below
  // for the opposite case - fields the *signer* fills in themselves.
  const textTabs = [];
  if (fieldValues && typeof fieldValues === "object") {
    for (const [token, value] of Object.entries(fieldValues)) {
      if (typeof value !== "string" || !value.trim()) continue;
      if (!/^[A-Z0-9_]+$/.test(token)) continue;
      textTabs.push({
        anchorString: `[[${token}]]`,
        anchorUnits: "pixels",
        anchorXOffset: "2",
        anchorYOffset: "-9",
        anchorIgnoreIfNotPresent: "true",
        value: value.slice(0, 500),
        locked: "true",
        font: "Helvetica",
        fontSize: "Size9"
      });
    }
  }

  // Signer-fillable fields (e.g. a contractor's own contact details on the
  // Vendor Information Sheet) - unlike fieldValues above, these are never
  // admin-supplied or pre-filled. They're just an anchor string with no
  // "value" and no "locked" flag, so DocuSign renders them as a blank
  // box the recipient types into during their own signing session, in
  // the same signing pass as the actual signature. This is what lets a
  // document like a bank-details form go out and come back complete
  // without anyone printing, signing, or scanning anything.
  const blankTextTabs = [];
  if (Array.isArray(blankFields)) {
    for (const token of blankFields) {
      if (typeof token !== "string" || !/^[A-Z0-9_]+$/.test(token)) continue;
      blankTextTabs.push({
        anchorString: `[[${token}]]`,
        anchorUnits: "pixels",
        anchorXOffset: "2",
        anchorYOffset: "-9",
        anchorIgnoreIfNotPresent: "true",
        font: "Helvetica",
        fontSize: "Size9"
      });
    }
  }

  // Same idea as blankTextTabs but for checkbox-style choices (e.g.
  // Checking vs. Savings) - present, unchecked, and left for the signer
  // to click during signing.
  const blankCheckboxTabs = [];
  if (Array.isArray(blankCheckboxFields)) {
    for (const token of blankCheckboxFields) {
      if (typeof token !== "string" || !/^[A-Z0-9_]+$/.test(token)) continue;
      blankCheckboxTabs.push({
        anchorString: `[[${token}]]`,
        anchorUnits: "pixels",
        anchorXOffset: "2",
        anchorYOffset: "-2",
        anchorIgnoreIfNotPresent: "true"
      });
    }
  }

  let accessToken, docusignApiBase;
  try {
    const tokenResult = await getDocusignAccessToken(env, docusignMode);
    accessToken = tokenResult.accessToken;
    docusignApiBase = tokenResult.apiBase;
  } catch (e) {
    console.error(`Docusign authentication failed (${docusignMode} mode):`, e);
    return jsonResponse({ error: "Docusign authentication failed: " + e.message }, 502);
  }

  let envelopeBody;

  // Combined-envelope mode: two or more documents (or a single non-template
  // document) go out for signature in one envelope/one signing session.
  // Each of the 6 built-in contracts (and the SOW Generator's output) has
  // an invisible "[[SIG_CLIENT]]" / "[[DATE_CLIENT]]" anchor string baked
  // into its Client signature block (see contracts/*.pdf and the SOW
  // Generator's PDF post-processing step) - DocuSign finds every
  // occurrence of an anchor string across *all* documents in the envelope
  // for a given tab definition when no documentId/pageNumber scopes it, so
  // one signHereTabs + one dateSignedTabs entry covers any number of
  // combined documents without per-document coordinates.
  if (Array.isArray(documents)) {
    if (!documents.length) {
      return jsonResponse({ error: "documents must contain at least one document" }, 400);
    }
    let totalBase64Length = 0;
    for (const d of documents) {
      if (!d || typeof d.name !== "string" || typeof d.base64 !== "string" || !d.name || !d.base64) {
        return jsonResponse({ error: "Each document needs a non-empty name and base64 content" }, 400);
      }
      totalBase64Length += d.base64.length;
    }
    if (totalBase64Length > 25 * 1024 * 1024) {
      return jsonResponse({ error: "Combined documents too large (25MB combined limit)" }, 400);
    }

    envelopeBody = {
      emailSubject: emailSubject || "Please sign: your contract with Revital Productions",
      documents: documents.map((d, i) => ({
        documentId: String(i + 1),
        name: d.name,
        fileExtension: "pdf",
        documentBase64: d.base64
      })),
      recipients: {
        signers: [{
          recipientId: "1",
          routingOrder: "1",
          name: signerName,
          email: signerEmail,
          tabs: {
            signHereTabs: [{ anchorString: "[[SIG_CLIENT]]", anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "-6", anchorIgnoreIfNotPresent: "true" }],
            dateSignedTabs: [{ anchorString: "[[DATE_CLIENT]]", anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "-6", anchorIgnoreIfNotPresent: "true" }],
            ...((textTabs.length || blankTextTabs.length) ? { textTabs: [...textTabs, ...blankTextTabs] } : {}),
            ...(blankCheckboxTabs.length ? { checkboxTabs: blankCheckboxTabs } : {})
          }
        }]
      },
      status: "sent"
    };
  } else {
    // Solo Docusign-Template send (currently just the MSA) - unchanged
    // from the original single-document implementation.
    if (!templateId || !templateRoleName) {
      return jsonResponse({ error: "templateId and templateRoleName are required when not sending combined documents" }, 400);
    }
    envelopeBody = {
      templateId,
      templateRoles: [{ roleName: templateRoleName, name: signerName, email: signerEmail }],
      status: "sent",
      emailSubject: emailSubject || "Please sign: your contract with Revital Productions"
    };
  }

  try {
    const dsRes = await fetch(`${docusignApiBase}/accounts/${requiredSecrets.accountId}/envelopes`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(envelopeBody)
    });
    const dsData = await dsRes.json().catch(() => ({}));

    if (!dsRes.ok) {
      console.error(`Docusign envelope creation failed (${docusignMode} mode):`, dsRes.status, dsData);
      return jsonResponse({ error: dsData.message || "Docusign API error", details: dsData }, 502);
    }

    return jsonResponse({ success: true, envelopeId: dsData.envelopeId, status: dsData.status, mode: docusignMode }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    console.error(`Docusign envelope request failed (${docusignMode} mode):`, e);
    return jsonResponse({ error: "Request to Docusign failed: " + e.message }, 500);
  }
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders }
  });
}

// ── Weekly Agency Health Digest (Cron Trigger, see scheduled() above) ──
//
// Server-side reimplementation of agency-health-dashboard/js/app.js's
// buildRows() - same fields, same thresholds, same needsAttention logic -
// so the emailed digest never disagrees with what the dashboard shows
// live in the Hub. Kept as an intentional duplicate rather than a shared
// import: the dashboard's version reads clientsDb via
// window.parent.getAllClients() in a browser tab, this version has to
// read Firestore directly over the REST API since a Cron Trigger has no
// browser, no window.parent, and no active Hub session at all.
//
// Auth: reuses the same FIREBASE_SERVICE_ACCOUNT_KEY secret already set
// for /api/mint-firebase-token, just exchanged for a Google OAuth2 access
// token (scope: https://www.googleapis.com/auth/datastore) instead of a
// Firebase custom token - same RS256-JWT-signing approach as that route
// and the Docusign JWT Grant, pointed at Google's own token endpoint.
// This is a direct Firestore REST read that bypasses client-side security
// rules entirely (as a trusted server), the same trust level the Hub's
// browser-side Firebase SDK already has once signed in via that route.
//
// Recipients: comma-separated list in the optional HEALTH_DIGEST_RECIPIENTS
// secret/var; defaults to admin@revitalproductions.com if unset:
//   wrangler secret put HEALTH_DIGEST_RECIPIENTS
// (or Cloudflare dashboard -> Workers & Pages -> this Worker -> Settings ->
// Variables and Secrets - can be a plain Variable instead of a Secret
// since it's not sensitive, just easier to set via the same `secret put`
// flow already used for everything else in this file.)
const HEALTH_DIGEST_SANDBOX_NAME = "Quick Sandbox (One-Offs)";
const HEALTH_DIGEST_STALE_APPROVAL_DAYS = 5;
const HEALTH_DIGEST_STALE_CONTACT_DAYS = 30;
const HEALTH_DIGEST_HEAVY_OPEN_ACTION_ITEMS = 3;

async function getGoogleAccessToken(env, scope) {
  const keyJson = env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error("Server missing FIREBASE_SERVICE_ACCOUNT_KEY secret");
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(keyJson);
  } catch (e) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${base64urlStr(JSON.stringify(header))}.${base64urlStr(JSON.stringify(payload))}`;
  const key = await importPrivateKeyFlexible(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned)
  );
  const assertion = `${unsigned}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Google OAuth token exchange failed (${res.status})`);
  }
  return { accessToken: data.access_token, projectId: serviceAccount.project_id };
}

// ── Prospect Booking (book.revitalproductions.com) ──
//
// Bookable team members now come from agency/teamRoster (Team Roster &
// Capacity's own doc - see its "Bookable for prospect discovery calls"
// checkbox, Aug 2026) rather than a hardcoded list - one admin UI, one
// source of truth, no redeploy needed to add or remove someone. id is
// the roster member's own id, name/title are shown to the prospect
// (title falls back to their Role if Booking Page Title was left blank),
// email is the real Google Workspace mailbox the hub-calendar-booking
// service account impersonates (via domain-wide delegation - see
// getGoogleAccessTokenForUser below) to check availability and create
// the event.
//
// FALLBACK_BOOKING_ROSTER only kicks in if nobody has been checked
// bookable yet (fresh install, or everyone got unchecked by mistake) -
// keeps the public booking page from silently showing zero options
// instead of failing loudly or routing to nobody.
const FALLBACK_BOOKING_ROSTER = [
  { id: "ronald", name: "Ronald", title: "Founder", email: "admin@revitalproductions.com" }
];

async function getBookableTeamRosterMembers(accessToken, projectId) {
  try {
    const rosterDoc = await firestoreGetDoc(accessToken, projectId, "agency/teamRoster");
    const members = (rosterDoc && Array.isArray(rosterDoc.list)) ? rosterDoc.list : [];
    const bookable = members
      .filter(m => m && m.bookableForCalls && m.email)
      .map(m => ({
        id: m.id,
        name: m.memberName || m.email,
        title: (m.bookingTitle && m.bookingTitle.trim()) || m.role || "",
        email: m.email,
        // Raw comma-separated string as entered in Team Roster - kept
        // here (not pre-split) so FALLBACK_BOOKING_ROSTER entries, which
        // have no keywords field at all, still shape-match cleanly.
        specialtyKeywords: m.specialtyKeywords || ""
      }));
    return bookable.length > 0 ? bookable : FALLBACK_BOOKING_ROSTER;
  } catch (e) {
    console.error("Couldn't load bookable roster from agency/teamRoster, using fallback:", e);
    return FALLBACK_BOOKING_ROSTER;
  }
}

// ── Auto-routing: specialist keyword match, else round robin (Aug 2026) ──
// Used by the public booking page's default flow (no personId/amEmail in
// the request) - the prospect never picks a person; this decides for
// them. Two-step:
//   1. Specialist match: does the prospect's notes/description contain
//      any bookable person's comma-separated Specialty Keywords (Team
//      Roster)? If exactly one OR multiple people match, round-robin
//      *within just the matches* rather than picking the first match
//      blindly - keeps it fair if two people share an overlapping
//      keyword (e.g. both list "video").
//   2. No match (or nobody has keywords set at all): round-robin across
//      the FULL bookable pool.
// Round robin itself is a single rotating pointer (agency/
// bookingRoundRobin.lastAssignedId) - finds that id's position in the
// current pool and returns the next one, wrapping around. Not
// transactionally locked (a second request landing in the same instant
// could read the same pointer) - acceptable at this call volume, same
// "best effort, not a hard lock" tolerance as the booking slot
// double-check right before event creation. The pointer is only
// persisted by the caller AFTER a booking actually completes (see
// handleBookingBook), not at preview/availability-check time, so an
// abandoned booking flow never "uses up" someone's turn for nothing.
function matchSpecialistPool(roster, notes) {
  const text = (notes || "").toLowerCase();
  if (!text) return [];
  return roster.filter(m => {
    const keywords = (m.specialtyKeywords || "")
      .split(",")
      .map(k => k.trim().toLowerCase())
      .filter(Boolean);
    return keywords.some(k => text.includes(k));
  });
}

function pickRoundRobin(pool, lastAssignedId) {
  if (pool.length === 0) return null;
  const lastIdx = pool.findIndex(p => p.id === lastAssignedId);
  const nextIdx = lastIdx === -1 ? 0 : (lastIdx + 1) % pool.length;
  return pool[nextIdx];
}

async function resolveAutoRoutedAssignment(accessToken, projectId, notes) {
  const roster = await getBookableTeamRosterMembers(accessToken, projectId);
  const specialists = matchSpecialistPool(roster, notes);
  const pool = specialists.length > 0 ? specialists : roster;

  let lastAssignedId = null;
  try {
    const rrDoc = await firestoreGetDoc(accessToken, projectId, "agency/bookingRoundRobin");
    lastAssignedId = rrDoc ? rrDoc.lastAssignedId : null;
  } catch (e) {
    console.error("Couldn't read agency/bookingRoundRobin, defaulting to pool[0]:", e);
  }

  const assigned = pickRoundRobin(pool, lastAssignedId);
  return { assigned, viaSpecialistMatch: specialists.length > 0 };
}

// Persists the round-robin pointer - called only after a booking actually
// completes (see handleBookingBook), never at availability-check/preview
// time. Best-effort: a failure here shouldn't fail the booking itself,
// since the calendar event (source of truth) already exists by the time
// this runs.
async function advanceBookingRoundRobin(accessToken, projectId, assignedId) {
  try {
    await firestoreSetDoc(accessToken, projectId, "agency/bookingRoundRobin", { lastAssignedId: assignedId, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error("Couldn't persist agency/bookingRoundRobin pointer (booking itself still succeeded):", e);
  }
}

const BOOKING_TIMEZONE = "America/Chicago"; // Central - Revital's actual business hours (confirmed Aug 2026; was incorrectly hardcoded to America/New_York before)
const BOOKING_DAY_START_HOUR = 9;  // 9am local, 24h clock
const BOOKING_DAY_END_HOUR = 17;   // 5pm local
const BOOKING_SLOT_MINUTES = 30;
const BOOKING_LOOKAHEAD_DAYS = 14;   // how many calendar days out to search for open slots
const BOOKING_MIN_NOTICE_HOURS = 12; // don't offer a slot starting sooner than this from "now"

// Same RS256-JWT-signing approach as getGoogleAccessToken above, but
// against the separate hub-calendar-booking service account
// (GOOGLE_SERVICE_ACCOUNT_KEY secret) with domain-wide delegation: the
// `sub` claim tells Google which Workspace mailbox to impersonate, so the
// resulting access token can read/write that specific person's calendar
// even though the service account itself has no calendar of its own.
async function getGoogleAccessTokenForUser(env, scope, impersonateEmail) {
  const keyJson = env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error("Server missing GOOGLE_SERVICE_ACCOUNT_KEY secret");
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(keyJson);
  } catch (e) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    sub: impersonateEmail,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${base64urlStr(JSON.stringify(header))}.${base64urlStr(JSON.stringify(payload))}`;
  const key = await importPrivateKeyFlexible(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned)
  );
  const assertion = `${unsigned}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Google OAuth token exchange failed (${res.status})`);
  }
  return data.access_token;
}

// ── Timezone helpers for the availability calculation ──
// The Workers runtime has no environment-local timezone (Date is always
// UTC), so "9am Eastern" has to be computed explicitly via
// Intl.DateTimeFormat's timeZone option rather than a system offset.
function getZonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23", weekday: "short"
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return parts;
}
function getDayOfWeekInTimeZone(date, timeZone) {
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return weekdayMap[getZonedParts(date, timeZone).weekday];
}
function getDateKeyInTimeZone(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}
// Converts a "YYYY-MM-DD" date (interpreted in timeZone) plus an
// hour/minute in that same zone into the correct UTC instant, DST-aware.
// Works by taking a naive UTC guess, checking what that guess actually
// renders as in the target zone, and correcting for the difference.
function zonedTimeToUtc(dateKey, hour, minute, timeZone) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const naiveUtcGuess = new Date(Date.UTC(y, m - 1, d, hour, minute, 0));
  const p = getZonedParts(naiveUtcGuess, timeZone);
  const renderedAsUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  const diff = naiveUtcGuess.getTime() - renderedAsUtc;
  return new Date(naiveUtcGuess.getTime() + diff);
}

// ── GET /api/booking/roster ──
// Public. Only exposes id/name/title, never the underlying mailbox
// address, since this is reachable by anyone on the internet. Sourced
// live from agency/teamRoster (see getBookableTeamRosterMembers) so
// checking/unchecking someone in Team Roster takes effect immediately -
// no redeploy needed.
async function handleBookingRoster(request, env) {
  try {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const roster = await getBookableTeamRosterMembers(accessToken, projectId);
    return jsonResponse({ roster: roster.map(({ id, name, title }) => ({ id, name, title })) });
  } catch (e) {
    return jsonResponse({ roster: FALLBACK_BOOKING_ROSTER.map(({ id, name, title }) => ({ id, name, title })) });
  }
}

// ── Account manager lookup for client bookings ──
// Clients book with their OWN assigned account manager, not a pick-from-
// a-list roster, and that roster shouldn't need a manual code edit every
// time someone becomes (or stops being) an AM. Instead of a hardcoded
// list, this treats "currently assigned as at least one client's account
// manager in Client Portal Manager" (client.portalConfig.accountManagerName
// / accountManagerEmail, already set via that tool's own UI) as the
// source of truth - whoever that points to is automatically bookable,
// no _worker.js edit required when the roster changes. Public callers
// can only resolve an email that's actually assigned to a real client
// this way (not an arbitrary address), which is what keeps this safe to
// expose without auth.
async function findAccountManagerByEmail(env, rawEmail) {
  const email = (rawEmail || "").trim().toLowerCase();
  if (!email) return null;
  try {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const clients = await fetchAllClientsFromFirestore(accessToken, projectId);
    for (const name of Object.keys(clients)) {
      const cfg = clients[name] && clients[name].portalConfig;
      const amEmail = cfg && cfg.accountManagerEmail ? String(cfg.accountManagerEmail).trim().toLowerCase() : "";
      if (amEmail && amEmail === email) {
        return { email, name: (cfg.accountManagerName || "").trim() || email };
      }
    }
  } catch (e) {
    console.error("findAccountManagerByEmail lookup failed:", e);
  }
  return null;
}

// Resolves "who is this booking for" from either the bookable prospect
// roster (?personId=, now sourced from agency/teamRoster) or a
// live-verified account manager (?amEmail=), used by both the
// availability and create handlers below so the two entry points
// (public prospect booking vs. client-portal AM booking) stay in sync.
async function resolveBookingTarget(env, { personId, amEmail }) {
  if (personId) {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const roster = await getBookableTeamRosterMembers(accessToken, projectId);
    const person = roster.find(p => p.id === personId);
    return person ? { id: person.id, email: person.email, name: person.name, title: person.title } : null;
  }
  if (amEmail) {
    return await findAccountManagerByEmail(env, amEmail);
  }
  return null;
}

// ── GET /api/booking/availability?personId=...  or  ?amEmail=...  or  ?notes=... ──
// Public. Queries that person's real Google Calendar via freeBusy.query
// (impersonated through domain-wide delegation) and returns open
// BOOKING_SLOT_MINUTES-long slots across the next BOOKING_LOOKAHEAD_DAYS
// days, business hours only, weekends excluded.
//
// Auto-routing (Aug 2026): when neither personId nor amEmail is given -
// the default for the public prospect flow, which no longer shows a
// "who would you like to talk to" picker - this resolves who via
// resolveAutoRoutedAssignment (specialist keyword match, else round
// robin) using whatever notes/description text came along. The response
// includes assignedPersonId so the frontend can pass it straight back to
// /api/booking/book as personId - the round-robin pointer only actually
// advances there, once a booking is confirmed, not here at preview time.
async function handleBookingAvailability(request, env) {
  const url = new URL(request.url);
  const personId = url.searchParams.get("personId");
  const amEmail = url.searchParams.get("amEmail");
  let person;
  let assignedPersonId = null;
  let viaSpecialistMatch = false;

  if (personId || amEmail) {
    person = await resolveBookingTarget(env, { personId, amEmail });
  } else {
    const notes = url.searchParams.get("notes") || "";
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const routing = await resolveAutoRoutedAssignment(accessToken, projectId, notes);
    if (routing.assigned) {
      person = { id: routing.assigned.id, email: routing.assigned.email, name: routing.assigned.name, title: routing.assigned.title };
      assignedPersonId = routing.assigned.id;
      viaSpecialistMatch = routing.viaSpecialistMatch;
    }
  }
  if (!person) return jsonResponse({ error: "Unknown person" }, 400);

  let accessToken;
  try {
    accessToken = await getGoogleAccessTokenForUser(env, "https://www.googleapis.com/auth/calendar", person.email);
  } catch (e) {
    return jsonResponse({ error: `Calendar auth failed: ${e.message}` }, 500);
  }

  const now = new Date();
  const rangeStart = now;
  const rangeEnd = new Date(now.getTime() + BOOKING_LOOKAHEAD_DAYS * 86400000);

  let busy;
  try {
    const fbRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: rangeStart.toISOString(),
        timeMax: rangeEnd.toISOString(),
        timeZone: BOOKING_TIMEZONE,
        items: [{ id: person.email }]
      })
    });
    const fbData = await fbRes.json();
    if (!fbRes.ok) throw new Error((fbData.error && fbData.error.message) || `freeBusy query failed (${fbRes.status})`);
    busy = (fbData.calendars && fbData.calendars[person.email] && fbData.calendars[person.email].busy) || [];
  } catch (e) {
    return jsonResponse({ error: `Calendar availability check failed: ${e.message}` }, 500);
  }

  const busyRanges = busy.map(b => ({ start: new Date(b.start), end: new Date(b.end) }));
  const earliestBookable = new Date(now.getTime() + BOOKING_MIN_NOTICE_HOURS * 3600000);

  const slotsByDay = {};
  for (let d = 0; d < BOOKING_LOOKAHEAD_DAYS; d++) {
    const day = new Date(rangeStart.getTime() + d * 86400000);
    const dow = getDayOfWeekInTimeZone(day, BOOKING_TIMEZONE);
    if (dow === 0 || dow === 6) continue; // skip Sat/Sun

    const dateKey = getDateKeyInTimeZone(day, BOOKING_TIMEZONE);
    const dayStartUtc = zonedTimeToUtc(dateKey, BOOKING_DAY_START_HOUR, 0, BOOKING_TIMEZONE);
    const dayEndUtc = zonedTimeToUtc(dateKey, BOOKING_DAY_END_HOUR, 0, BOOKING_TIMEZONE);

    const slots = [];
    for (let t = dayStartUtc.getTime(); t + BOOKING_SLOT_MINUTES * 60000 <= dayEndUtc.getTime(); t += BOOKING_SLOT_MINUTES * 60000) {
      const slotStart = new Date(t);
      const slotEnd = new Date(t + BOOKING_SLOT_MINUTES * 60000);
      if (slotStart < earliestBookable) continue;
      if (busyRanges.some(b => slotStart < b.end && slotEnd > b.start)) continue;
      slots.push(slotStart.toISOString());
    }
    if (slots.length) slotsByDay[dateKey] = slots;
  }

  return jsonResponse({
    personName: person.name,
    personTitle: person.title || "",
    assignedPersonId,
    viaSpecialistMatch,
    timezone: BOOKING_TIMEZONE,
    slotMinutes: BOOKING_SLOT_MINUTES,
    slotsByDay
  });
}

// ── POST /api/booking/book ──
// Public. Creates the actual calendar event once a prospect picks a
// slot. The Calendar invite (sendUpdates=all, prospect added as an
// attendee) is what notifies both sides by email - no separate
// confirmation-email step needed.
async function handleBookingCreate(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { personId, amEmail, startISO, name, email, company, notes, autoRouted } = payload || {};
  const person = await resolveBookingTarget(env, { personId, amEmail });
  if (!person) return jsonResponse({ error: "Unknown person" }, 400);
  if (!startISO || isNaN(new Date(startISO).getTime())) {
    return jsonResponse({ error: "Invalid or missing time slot" }, 400);
  }
  if (!name || !email) {
    return jsonResponse({ error: "Name and email are required" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: "Invalid email address" }, 400);
  }

  const start = new Date(startISO);
  const end = new Date(start.getTime() + BOOKING_SLOT_MINUTES * 60000);

  let accessToken;
  try {
    accessToken = await getGoogleAccessTokenForUser(env, "https://www.googleapis.com/auth/calendar", person.email);
  } catch (e) {
    return jsonResponse({ error: `Calendar auth failed: ${e.message}` }, 500);
  }

  // Re-check the specific slot is still free right before booking, to
  // close the race window between the prospect loading availability and
  // clicking Confirm.
  try {
    const fbRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: start.toISOString(), timeMax: end.toISOString(), items: [{ id: person.email }] })
    });
    const fbData = await fbRes.json();
    const busy = (fbData.calendars && fbData.calendars[person.email] && fbData.calendars[person.email].busy) || [];
    if (busy.length > 0) {
      return jsonResponse({ error: "That time was just booked by someone else - please pick another slot." }, 409);
    }
  } catch (e) {
    // If the re-check itself fails, fall through and let events.insert be
    // the source of truth rather than blocking a legitimate booking over
    // a transient error here.
  }

  // Client-portal bookings (amEmail) are an existing client meeting with
  // their own account manager, not a first-touch sales call - label and
  // source note differ accordingly, everything else about the booking
  // (calendar write, notification email) is identical either way.
  const isClientBooking = !!amEmail;
  const eventBody = {
    summary: isClientBooking
      ? `Client Meeting: ${name}${company ? " (" + company + ")" : ""}`
      : `Discovery Call: ${name}${company ? " (" + company + ")" : ""}`,
    description: notes
      ? `Booked via ${isClientBooking ? "the client portal" : "the Revital Productions booking page"}.\n\nNotes from ${name}:\n${notes}`
      : `Booked via ${isClientBooking ? "the client portal" : "the Revital Productions booking page"}.`,
    start: { dateTime: start.toISOString(), timeZone: BOOKING_TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: BOOKING_TIMEZONE },
    attendees: [{ email: person.email }, { email, displayName: name }],
    reminders: { useDefault: true }
  };

  try {
    const evRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(person.email)}/events?sendUpdates=all`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(eventBody) }
    );
    const evData = await evRes.json();
    if (!evRes.ok) throw new Error((evData.error && evData.error.message) || `Event creation failed (${evRes.status})`);

    // Direct "you got a new booking" alert - the calendar invite alone
    // isn't a reliable notification (Google doesn't always email an
    // organizer about their own event), so send an explicit one via the
    // same Resend setup the Weekly Agency Health Digest already uses.
    // Best-effort: a failure here shouldn't undo or fail the booking
    // itself, since the calendar event (the source of truth) already
    // exists at this point.
    try {
      const recipients = Array.from(new Set([person.email, "admin@revitalproductions.com"]));
      const humanTime = new Intl.DateTimeFormat("en-US", {
        timeZone: BOOKING_TIMEZONE, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"
      }).format(start);
      const subject = `New ${isClientBooking ? "client meeting" : "booking"}: ${name}${company ? " (" + company + ")" : ""} - ${humanTime}`;
      const html = `
        <div style="font-family: sans-serif; max-width: 560px;">
          <h2 style="margin:0 0 12px;">New ${isClientBooking ? "Client Meeting" : "Discovery Call"} Booked</h2>
          <p><strong>${escapeHtmlServer(name)}</strong> booked a call with <strong>${escapeHtmlServer(person.name)}</strong> for <strong>${humanTime}</strong>.</p>
          <table style="font-size:14px; margin:16px 0;">
            <tr><td style="color:#64748b; padding-right:12px;">Email</td><td>${escapeHtmlServer(email)}</td></tr>
            ${company ? `<tr><td style="color:#64748b; padding-right:12px;">Company</td><td>${escapeHtmlServer(company)}</td></tr>` : ""}
            ${notes ? `<tr><td style="color:#64748b; padding-right:12px; vertical-align:top;">Notes</td><td>${escapeHtmlServer(notes)}</td></tr>` : ""}
          </table>
          ${evData.htmlLink ? `<p><a href="${evData.htmlLink}">View on Google Calendar</a></p>` : ""}
          <p style="font-size:12px; color:#94a3b8; margin-top:24px;">Booked via ${isClientBooking ? "the client portal" : "book.revitalproductions.com"}.</p>
        </div>
      `;
      const text = `New booking: ${name}${company ? " (" + company + ")" : ""}\nWith: ${person.name}\nWhen: ${humanTime}\nEmail: ${email}\n${notes ? "Notes: " + notes + "\n" : ""}${evData.htmlLink ? "\n" + evData.htmlLink : ""}`;
      await sendHealthDigestEmail(env, recipients, subject, html, text);
    } catch (notifyErr) {
      console.error("Booking notification email failed (booking itself still succeeded):", notifyErr);
    }

    // Only advance the round-robin pointer for bookings that actually
    // went through auto-routing (frontend sets autoRouted:true when it
    // got here via the notes-based flow, not a direct personId link or
    // a client-portal amEmail booking) - see resolveAutoRoutedAssignment.
    // Best-effort, same reasoning as the notification email above.
    if (autoRouted && person.id) {
      try {
        const { accessToken: rrToken, projectId: rrProjectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
        await advanceBookingRoundRobin(rrToken, rrProjectId, person.id);
      } catch (rrErr) {
        console.error("Couldn't advance booking round robin (booking itself still succeeded):", rrErr);
      }
    }

    return jsonResponse({ ok: true, eventId: evData.id, htmlLink: evData.htmlLink });
  } catch (e) {
    return jsonResponse({ error: `Could not create the calendar event: ${e.message}` }, 500);
  }
}

// Minimal HTML-escaping for values interpolated into the booking
// notification email above - this runs server-side (no DOM available),
// unlike the client-side escapeHtml() in booking/index.html.
function escapeHtmlServer(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Team Roster Time Off -> Google Calendar sync ──
//
// Team Roster's Time Off entries (see team-roster/js/app.js) already show
// who's out inside the Hub, but that's only visible to someone who
// actually opens the tool. This mirrors every add/remove out to Google
// Calendar so it shows up where the team already looks day to day:
//   1. A shared "Revital Team Out" calendar (one event per time-off
//      entry, all-day, visible to the whole domain) - the single place
//      anyone can see who's out without opening the Hub at all.
//   2. A "Busy" all-day block on that person's OWN calendar, so nobody
//      accidentally gets a meeting invite scheduled against them while
//      they're out.
// Both use the same hub-calendar-booking service account (domain-wide
// delegation, GOOGLE_SERVICE_ACCOUNT_KEY) already granted the
// https://www.googleapis.com/auth/calendar scope for prospect booking
// above - no separate Workspace admin setup needed for #2. #1 needs the
// shared calendar to exist first; getOrCreateTeamCalendar below creates
// it once (impersonating TEAM_CALENDAR_OWNER_EMAIL) and shares it
// domain-wide via the Calendar ACL API, then caches the resulting
// calendar ID in Firestore so every later sync is a single write, not a
// search-then-write. NOTE: sharing via the ACL API makes the calendar
// joinable, but each person still has to add it once from their own
// Google Calendar (Other calendars -> Subscribe -> search "Revital Team
// Out") - there's no API-only way to force it into everyone's calendar
// list without full Workspace-admin console access, which this service
// account doesn't have.
const TEAM_CALENDAR_OWNER_EMAIL = "admin@revitalproductions.com";
const TEAM_CALENDAR_SUMMARY = "Revital Team Out";
const TEAM_CALENDAR_TIMEZONE = "America/Chicago"; // Central - matches the calendar's own Calendar Settings timezone (fixed Aug 2026; was America/New_York)

// Google Calendar all-day events use an EXCLUSIVE end date (a single-day
// event's end.date is the day AFTER it, not the day itself) - this
// converts our inclusive startDate/endDate (same as Team Roster's own
// timeOff entries) into that shape.
function addOneDayToDateKey(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

// Cached in Firestore (agency/teamCalendarConfig.calendarId) after first
// creation so later syncs don't need to search for it. Doesn't re-verify
// the calendar still exists on every call - if it was deleted out from
// under this, the event-insert call below will fail with a clear 404
// rather than silently doing nothing.
async function getOrCreateTeamCalendar(env) {
  const { accessToken: fsToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
  const cached = await firestoreGetDoc(fsToken, projectId, "agency/teamCalendarConfig");
  if (cached && cached.calendarId) return cached.calendarId;

  const calToken = await getGoogleAccessTokenForUser(env, "https://www.googleapis.com/auth/calendar", TEAM_CALENDAR_OWNER_EMAIL);

  const createRes = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    headers: { Authorization: `Bearer ${calToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: TEAM_CALENDAR_SUMMARY,
      description: "Who's out - synced automatically from the Client Onboarding & Audit Hub's Team Roster & Capacity tool. Subscribe once (Other calendars -> Subscribe to calendar) to see it going forward.",
      timeZone: TEAM_CALENDAR_TIMEZONE
    })
  });
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok) throw new Error((createData.error && createData.error.message) || `Couldn't create the team calendar (${createRes.status})`);
  const calendarId = createData.id;

  // Share domain-wide (read access to see events, not edit) so anyone
  // who looks for it by name can subscribe - see the file-level comment
  // above for why this still requires one manual Subscribe per person.
  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/acl`, {
      method: "POST",
      headers: { Authorization: `Bearer ${calToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", scope: { type: "domain", value: ADMIN_EMAIL_DOMAIN } })
    });
  } catch (e) {
    // Non-fatal: the calendar still exists and events will still sync,
    // it just won't be auto-discoverable domain-wide until this is set
    // by hand in Google Calendar's own sharing settings.
    console.error("Couldn't set domain-wide sharing on the team calendar (calendar still created):", e);
  }

  await firestoreSetDoc(fsToken, projectId, "agency/teamCalendarConfig", { calendarId, createdAt: new Date().toISOString() });
  return calendarId;
}

// Creates the two calendar events (shared team calendar + the person's
// own Busy block) for one Time Off entry. Each half is independent and
// best-effort - e.g. a person whose email isn't on file (or isn't a real
// mailbox) simply doesn't get the personal Busy block, but still shows
// up on the shared team calendar. Returns whichever event IDs were
// actually created so the caller can store them for later deletion, plus
// any non-fatal warnings to surface to the person who triggered this.
async function upsertTimeOffCalendarEvents(env, { memberName, memberEmail, startDate, endDate, note }) {
  const result = { teamEventId: null, personalEventId: null, warnings: [] };
  const endExclusive = addOneDayToDateKey(endDate || startDate);
  const summary = `${memberName} - Out`;

  try {
    const calendarId = await getOrCreateTeamCalendar(env);
    const calToken = await getGoogleAccessTokenForUser(env, "https://www.googleapis.com/auth/calendar", TEAM_CALENDAR_OWNER_EMAIL);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${calToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary,
        description: note || undefined,
        start: { date: startDate },
        end: { date: endExclusive },
        transparency: "transparent" // doesn't block availability lookups against the shared calendar itself
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || `Team calendar event failed (${res.status})`);
    result.teamEventId = data.id;
  } catch (e) {
    result.warnings.push(`Shared team calendar: ${e.message}`);
  }

  if (memberEmail && memberEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    try {
      const personalToken = await getGoogleAccessTokenForUser(env, "https://www.googleapis.com/auth/calendar", memberEmail);
      const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${personalToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: "Out (Revital)",
          start: { date: startDate },
          end: { date: endExclusive },
          transparency: "opaque", // shows as Busy so nobody double-books this person
          visibility: "private"
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error && data.error.message) || `Personal calendar event failed (${res.status})`);
      result.personalEventId = data.id;
    } catch (e) {
      result.warnings.push(`Personal calendar: ${e.message}`);
    }
  }

  return result;
}

// Best-effort deletes for both halves of a Time Off entry - a 404/410
// (already gone, e.g. someone deleted it by hand in Google Calendar)
// is treated as success rather than surfaced as an error, since the end
// state either way is "the event doesn't exist," which is what a delete
// is trying to achieve.
async function deleteTimeOffCalendarEvents(env, { teamEventId, personalEventId, memberEmail }) {
  const warnings = [];
  if (teamEventId) {
    try {
      const calendarId = await getOrCreateTeamCalendar(env);
      const calToken = await getGoogleAccessTokenForUser(env, "https://www.googleapis.com/auth/calendar", TEAM_CALENDAR_OWNER_EMAIL);
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(teamEventId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${calToken}` }
      });
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data.error && data.error.message) || `Team calendar delete failed (${res.status})`);
      }
    } catch (e) {
      warnings.push(`Shared team calendar: ${e.message}`);
    }
  }
  if (personalEventId && memberEmail) {
    try {
      const personalToken = await getGoogleAccessTokenForUser(env, "https://www.googleapis.com/auth/calendar", memberEmail);
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(personalEventId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${personalToken}` }
      });
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data.error && data.error.message) || `Personal calendar delete failed (${res.status})`);
      }
    } catch (e) {
      warnings.push(`Personal calendar: ${e.message}`);
    }
  }
  return { warnings };
}

// ── Resource Booking calendar sync ──
// A separate shared calendar from "Revital Team Out" - a booking is a
// planned work assignment, not an absence, so it doesn't get a personal
// Busy block on anyone's own calendar the way Time Off does (that would
// clutter personal calendars and read as "unavailable" for real
// meetings, which isn't what a booking means). This is visibility-only:
// Resource Booking Calendar's own grid inside the Hub is the actual
// source of truth for capacity math - see resource-booking-calendar/
// js/app.js's getWeekLoad. The calendar event just lets anyone glance
// at Google Calendar and see who's booked where, same caching pattern
// as getOrCreateTeamCalendar above (own config doc so this only
// searches/creates once).
const TEAM_BOOKINGS_CALENDAR_SUMMARY = "Revital Team Bookings";

async function getOrCreateTeamBookingsCalendar(env) {
  const { accessToken: fsToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
  const cached = await firestoreGetDoc(fsToken, projectId, "agency/teamBookingsCalendarConfig");
  if (cached && cached.calendarId) return cached.calendarId;

  const calToken = await getGoogleAccessTokenForUser(env, "https://www.googleapis.com/auth/calendar", TEAM_CALENDAR_OWNER_EMAIL);

  const createRes = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    headers: { Authorization: `Bearer ${calToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: TEAM_BOOKINGS_CALENDAR_SUMMARY,
      description: "Who's booked on which client this week - synced automatically from the Client Onboarding & Audit Hub's Booking Calendar tool. Subscribe once (Other calendars -> Subscribe to calendar) to see it going forward.",
      timeZone: TEAM_CALENDAR_TIMEZONE
    })
  });
  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok) throw new Error((createData.error && createData.error.message) || `Couldn't create the team bookings calendar (${createRes.status})`);
  const calendarId = createData.id;

  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/acl`, {
      method: "POST",
      headers: { Authorization: `Bearer ${calToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", scope: { type: "domain", value: ADMIN_EMAIL_DOMAIN } })
    });
  } catch (e) {
    console.error("Couldn't set domain-wide sharing on the team bookings calendar (calendar still created):", e);
  }

  await firestoreSetDoc(fsToken, projectId, "agency/teamBookingsCalendarConfig", { calendarId, createdAt: new Date().toISOString() });
  return calendarId;
}

// Creates or updates (delete-then-recreate, simpler than PATCH given how
// few fields change) the one calendar event for a booking. Returns the
// event id so the caller can store it on the booking for later
// updates/deletes.
async function upsertBookingCalendarEvent(env, { calendarEventId, memberName, clientName, startDate, endDate, hoursPerWeek, notes }) {
  const calendarId = await getOrCreateTeamBookingsCalendar(env);
  const calToken = await getGoogleAccessTokenForUser(env, "https://www.googleapis.com/auth/calendar", TEAM_CALENDAR_OWNER_EMAIL);

  if (calendarEventId) {
    try {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(calendarEventId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${calToken}` }
      });
    } catch (e) {
      // Non-fatal - if the old event is already gone this is a no-op
      // anyway, and the insert below still creates a fresh one.
    }
  }

  const endExclusive = addOneDayToDateKey(endDate || startDate);
  const summary = `${memberName} — ${clientName} (${hoursPerWeek} hrs/wk)`;
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${calToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary,
      description: notes || undefined,
      start: { date: startDate },
      end: { date: endExclusive },
      transparency: "transparent"
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || `Booking calendar event failed (${res.status})`);
  return data.id;
}

async function deleteBookingCalendarEvent(env, { calendarEventId }) {
  if (!calendarEventId) return;
  const calendarId = await getOrCreateTeamBookingsCalendar(env);
  const calToken = await getGoogleAccessTokenForUser(env, "https://www.googleapis.com/auth/calendar", TEAM_CALENDAR_OWNER_EMAIL);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(calendarEventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${calToken}` }
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data.error && data.error.message) || `Booking calendar delete failed (${res.status})`);
  }
}

// ── POST /api/create-client-drive-folder ──
// Auto-builds a new client's Google Drive folder structure inside the
// "Clients Assets" Shared Drive. Two paths, same shape as the ClickUp
// folder route above:
//
// 1. Preferred: recursively clone the real live "_CLIENT TEMPLATE
//    (duplicate for new clients)" folder via the Drive API (files.list to
//    walk its tree, files.create for each subfolder, files.copy for any
//    files found inside it). The Drive API has no single "duplicate this
//    folder" call the way ClickUp does for Folder Templates, but the
//    recursive list+create+copy pattern is a well-established substitute
//    - see findClientDriveTemplateFolderId/cloneDriveFolderTree below.
//    Confirmed live (Sept 2026) this actually matters: the hardcoded
//    snapshot below was already stale - the real template's folders all
//    carry emoji prefixes ("📄 Contracts & Onboarding", "📜 Signed
//    Contracts", etc.) that the hardcoded names never had.
// 2. Fallback: the original hardcoded structure (no emojis), used only if
//    the template folder can't be found live for any reason - keeps
//    client creation from breaking even if the template gets renamed,
//    moved, or the lookup call fails.
//
// PREREQUISITE (not yet done as of Sept 2026): the GOOGLE_SERVICE_ACCOUNT_KEY
// service account (same one used for calendar impersonation - see
// getGoogleAccessTokenForUser) needs the Drive scope added to its
// domain-wide delegation in Google Workspace Admin Console -> Security ->
// API Controls -> Domain-wide Delegation. Add this scope to the existing
// client ID entry (alongside the datastore/calendar scopes already there):
//   https://www.googleapis.com/auth/drive
// Only a Workspace Super Admin can do this - it can't be done from code.
// Confirmed live (Sept 2026) this route currently fails even earlier than
// that - the Drive API itself isn't enabled yet in the Google Cloud
// project (a 403 "Google Drive API has not been used in project ... or is
// disabled" error), which is a prerequisite to the domain-wide-delegation
// scope even mattering. Either failure is caught below and returned as a
// normal error response (non-fatal to client creation either way - see
// createClientDriveFolder in app.js).
const CLIENTS_ASSETS_SHARED_DRIVE_ID = "0AJh-IlwVqRlzUk9PVA";

// Case-insensitive substring match against folder names in the Shared
// Drive - "_CLIENT TEMPLATE" is the stable part of the real folder's name
// ("🧩 _CLIENT TEMPLATE (duplicate for new clients)", confirmed live via
// Drive search), robust to the emoji or the parenthetical changing.
const CLIENT_DRIVE_TEMPLATE_NAME_HINT = "_client template";

// Fallback only - mirrors "_CLIENT TEMPLATE (duplicate for new clients)"
// as it was mapped by hand in Aug 2026, since confirmed stale (no
// emojis) but still a reasonable shape if the live template can't be
// found at all.
const CLIENT_DRIVE_FOLDER_TEMPLATE = [
  { name: "Contracts & Onboarding", children: ["Signed Contracts", "Proposals", "Intake Form", "Renewals & Amendments"] },
  { name: "Client-Submitted Files", children: [] },
  { name: "Client Brand Assets", children: ["Logos", "Brand Guidelines", "Fonts", "Reference & Past Campaigns"] },
  { name: "Final Deliverables", children: ["Ad Creative", "Videos", "Graphics", "Edited Photos"] },
  { name: "Monthly Reports", children: [] }
];

async function createDriveFolder(accessToken, name, parentId) {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || `Drive folder create failed (${res.status}) for "${name}"`);
  }
  return data; // { id, webViewLink }
}

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

// Best-effort - not required, see the fallback path in
// handleCreateClientDriveFolder. Searches the whole Clients Assets Shared
// Drive (not just its top level) in case the template ever gets nested
// or moved, and returns the first match's id.
async function findClientDriveTemplateFolderId(accessToken) {
  try {
    const q = encodeURIComponent(`mimeType = '${DRIVE_FOLDER_MIME}' and name contains '_CLIENT TEMPLATE' and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&corpora=drive&driveId=${CLIENTS_ASSETS_SHARED_DRIVE_ID}&includeItemsFromAllDrives=true&supportsAllDrives=true&fields=files(id,name)`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.files)) return null;
    const match = data.files.find(f => (f.name || "").toLowerCase().includes(CLIENT_DRIVE_TEMPLATE_NAME_HINT));
    return match ? match.id : null;
  } catch (e) {
    console.warn("Drive template folder lookup failed:", e);
    return null;
  }
}

// Lists the direct children of a Drive folder, handling pagination (the
// template only has a handful of items today, but this doesn't assume
// that stays true).
async function listDriveChildren(accessToken, folderId) {
  const children = [];
  let pageToken = "";
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&includeItemsFromAllDrives=true&supportsAllDrives=true&fields=nextPageToken,files(id,name,mimeType)${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || `Drive list children failed (${res.status})`);
    if (Array.isArray(data.files)) children.push(...data.files);
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return children;
}

async function copyDriveFile(accessToken, fileId, name, parentId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy?supportsAllDrives=true&fields=id,webViewLink`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, parents: [parentId] })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || `Drive file copy failed (${res.status}) for "${name}"`);
  }
  return data;
}

// Recursively mirrors sourceFolderId's contents into destParentId -
// subfolders become new folders (recursing into each), files get copied
// in place. This is the substitute for Drive's lack of a "duplicate this
// folder tree" API call.
async function cloneDriveFolderTree(accessToken, sourceFolderId, destParentId) {
  const children = await listDriveChildren(accessToken, sourceFolderId);
  for (const child of children) {
    if (child.mimeType === DRIVE_FOLDER_MIME) {
      const newFolder = await createDriveFolder(accessToken, child.name, destParentId);
      await cloneDriveFolderTree(accessToken, child.id, newFolder.id);
    } else {
      await copyDriveFile(accessToken, child.id, child.name, destParentId);
    }
  }
}

async function handleCreateClientDriveFolder(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const clientName = (payload && payload.clientName || "").trim();
  if (!clientName) {
    return jsonResponse({ error: "clientName is required" }, 400);
  }

  try {
    // Impersonates the same Workspace account already used for calendar
    // booking (TEAM_CALENDAR_OWNER_EMAIL) - that account has access to
    // the Clients Assets Shared Drive, so its identity is what the
    // created folders' Drive activity log will show as the creator.
    const accessToken = await getGoogleAccessTokenForUser(env, "https://www.googleapis.com/auth/drive", TEAM_CALENDAR_OWNER_EMAIL);

    const clientFolder = await createDriveFolder(accessToken, clientName, CLIENTS_ASSETS_SHARED_DRIVE_ID);

    // Path 1: clone the real live template, if it can be found.
    let clonedFromTemplate = false;
    try {
      const templateFolderId = await findClientDriveTemplateFolderId(accessToken);
      if (templateFolderId) {
        await cloneDriveFolderTree(accessToken, templateFolderId, clientFolder.id);
        clonedFromTemplate = true;
      }
    } catch (e) {
      console.warn("Drive template clone failed, falling back to hardcoded structure:", e);
    }

    // Path 2: fallback - hardcoded structure, used only if the template
    // couldn't be found/cloned above (client folder itself already
    // exists either way, so this never leaves it half-built).
    if (!clonedFromTemplate) {
      for (const section of CLIENT_DRIVE_FOLDER_TEMPLATE) {
        const sectionFolder = await createDriveFolder(accessToken, section.name, clientFolder.id);
        for (const childName of section.children) {
          await createDriveFolder(accessToken, childName, sectionFolder.id);
        }
      }
    }

    return jsonResponse({
      ok: true,
      folderId: clientFolder.id,
      folderUrl: clientFolder.webViewLink || `https://drive.google.com/drive/folders/${clientFolder.id}`,
      fromTemplate: clonedFromTemplate
    }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    console.error("Create client Drive folder failed:", e);
    return jsonResponse({ error: e.message }, 500);
  }
}

// ── POST /api/create-client-clickup-folder ──
// Auto-builds a new client's ClickUp folder inside the "Delivery" space
// (id below). Two paths:
//
// 1. Preferred: ClickUp's real Folder Template API (GET .../folder_template
//    to discover a saved template's id, POST .../folder_template/{id} to
//    clone it) - this is the only way to actually carry over a template's
//    full configuration (the "Client Portal Template" folder in Guides &
//    Templates has a real custom status workflow per list - brief
//    received -> in production -> internal review -> client review ->
//    revision requested -> approved -> published -> complete, confirmed
//    live via clickup_get_list - plus each list's description/content).
//    Only works if that folder (or another one) has actually been saved
//    as a Folder Template in ClickUp (right-click a folder -> Save as
//    template, or Space Settings -> Templates) - there's no API to check
//    that ahead of time other than the lookup below.
// 2. Fallback: bare folder + the same 8 list names, no statuses/content -
//    what this route did before. Used automatically if no matching
//    template is found (or the template create call fails for any
//    reason), so client creation never breaks even if nothing's been
//    saved as a template yet.
//
// Requires the same CLICKUP_API_TOKEN secret already used by the
// Sales Pipeline / Onboarding Handoff sync routes above.
const CLICKUP_DELIVERY_SPACE_ID = "901313679401";
const CLICKUP_WORKSPACE_ID = "9013958594"; // confirmed via clickup_get_workspace_hierarchy

// Case-insensitive substring match against saved Folder Template names.
// The actual saved template is named "Client Portal" (confirmed Sept
// 2026 - not "Client Portal Template", which is just the example folder
// it was saved from, living in Guides & Templates). Matching on the
// shorter "client portal" catches both names plus minor future renames,
// since .includes() only needs the template's name to CONTAIN this hint.
const CLIENT_CLICKUP_TEMPLATE_NAME_HINT = "client portal";

const CLIENT_CLICKUP_LIST_TEMPLATE = [
  "📋 Campaign Briefs",
  "📅 Content Calendar",
  "🔄 Recurring Deliverables",
  "💬 Client Feedback & Revisions",
  "📁 Assets & Brand Files",
  "📊 Reports & Analytics",
  "🚀 Active Projects & Tasks",
  "✅ Completed Work"
];

// Best-effort lookup, not required for the route to work - see the fallback
// path above. Response shape isn't fully documented publicly, so this
// checks the couple of key names ClickUp's other list-style endpoints use
// rather than assuming one.
async function findClickUpFolderTemplateId(apiToken) {
  try {
    const res = await fetch(`https://api.clickup.com/api/v2/team/${CLICKUP_WORKSPACE_ID}/folder_template`, {
      headers: { Authorization: apiToken }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const templates = data.templates || data.folder_templates || (Array.isArray(data) ? data : []);
    if (!Array.isArray(templates)) return null;
    const match = templates.find(t => (t && t.name || "").trim().toLowerCase().includes(CLIENT_CLICKUP_TEMPLATE_NAME_HINT));
    return match ? match.id : null;
  } catch (e) {
    console.warn("ClickUp folder template lookup failed:", e);
    return null;
  }
}

async function handleCreateClientClickUpFolder(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const clientName = (payload && payload.clientName || "").trim();
  if (!clientName) {
    return jsonResponse({ error: "clientName is required" }, 400);
  }

  const apiToken = env.CLICKUP_API_TOKEN;
  if (!apiToken) return jsonResponse({ error: "Server missing CLICKUP_API_TOKEN secret" }, 500);

  // Path 1: real Folder Template, if one's been saved.
  try {
    const templateId = await findClickUpFolderTemplateId(apiToken);
    if (templateId) {
      const tplRes = await fetch(`https://api.clickup.com/api/v2/space/${CLICKUP_DELIVERY_SPACE_ID}/folder_template/${templateId}`, {
        method: "POST",
        headers: { Authorization: apiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ name: clientName })
      });
      const tplData = await tplRes.json().catch(() => ({}));
      if (tplRes.ok && tplData && tplData.id) {
        const folderUrl = `https://app.clickup.com/${CLICKUP_WORKSPACE_ID}/v/f/${tplData.id}`;
        return jsonResponse({ ok: true, folderId: tplData.id, folderUrl, fromTemplate: true }, 200, { "Cache-Control": "no-store" });
      }
      console.warn("ClickUp create-folder-from-template failed, falling back to bare list build:", tplData.err || tplRes.status);
    }
  } catch (e) {
    console.warn("ClickUp folder-template path threw, falling back to bare list build:", e);
  }

  // Path 2: fallback - bare folder + matching list names, no statuses/content.
  try {
    const folderRes = await fetch(`https://api.clickup.com/api/v2/space/${CLICKUP_DELIVERY_SPACE_ID}/folder`, {
      method: "POST",
      headers: { Authorization: apiToken, "Content-Type": "application/json" },
      body: JSON.stringify({ name: clientName })
    });
    const folder = await folderRes.json().catch(() => ({}));
    if (!folderRes.ok || !folder.id) {
      throw new Error((folder.err) || `ClickUp folder create failed (${folderRes.status}) for "${clientName}"`);
    }

    for (const listName of CLIENT_CLICKUP_LIST_TEMPLATE) {
      const listRes = await fetch(`https://api.clickup.com/api/v2/folder/${folder.id}/list`, {
        method: "POST",
        headers: { Authorization: apiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ name: listName })
      });
      const listData = await listRes.json().catch(() => ({}));
      if (!listRes.ok) {
        // Non-fatal per list - the folder itself already exists and is
        // usable, so a single list failing (rare) shouldn't blow up the
        // whole call. Logged server-side for follow-up.
        console.error(`ClickUp list create failed for "${listName}" in folder ${folder.id}:`, listData.err || listRes.status);
      }
    }

    const folderUrl = `https://app.clickup.com/${CLICKUP_WORKSPACE_ID}/v/f/${folder.id}`;
    return jsonResponse({ ok: true, folderId: folder.id, folderUrl, fromTemplate: false }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    console.error("Create client ClickUp folder failed:", e);
    return jsonResponse({ error: e.message }, 500);
  }
}

// ── POST /api/resource-booking/sync-calendar ──
// Admin-domain-only, same gate/reasoning as
// /api/team-roster/sync-time-off - Booking Calendar calls this right
// after its own Firestore save already succeeded, so any failure here
// is non-fatal to that save (see syncBookingToCalendar in
// resource-booking-calendar/js/app.js, which just banners a warning).
async function handleResourceBookingCalendarSync(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { action } = payload || {};

  if (action === "upsert") {
    const { calendarEventId, memberName, clientName, startDate, endDate, hoursPerWeek, notes } = payload;
    if (!memberName || !clientName || !startDate || !hoursPerWeek) {
      return jsonResponse({ error: "memberName, clientName, startDate, and hoursPerWeek are required" }, 400);
    }
    try {
      const newEventId = await upsertBookingCalendarEvent(env, { calendarEventId, memberName, clientName, startDate, endDate, hoursPerWeek, notes });
      return jsonResponse({ ok: true, calendarEventId: newEventId });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (action === "delete") {
    const { calendarEventId } = payload;
    try {
      await deleteBookingCalendarEvent(env, { calendarEventId });
      return jsonResponse({ ok: true });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  return jsonResponse({ error: "action must be 'upsert' or 'delete'" }, 400);
}

// ── POST /api/team-roster/sync-time-off ──
// Admin-domain-only (same gate as handleRestrictedClientDataWrite) -
// this isn't public like the booking routes above. Team Roster calls
// this right after its own Firestore save already succeeded, so a
// failure here is deliberately non-fatal to that save - see the
// warnings array, which the client surfaces as a soft banner rather
// than rolling back the (already-persisted) time-off entry.
async function handleTeamRosterTimeOffSync(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { action } = payload || {};

  if (action === "upsert") {
    const { memberName, memberEmail, startDate, endDate, note } = payload;
    if (!memberName || !startDate) {
      return jsonResponse({ error: "memberName and startDate are required" }, 400);
    }
    try {
      const result = await upsertTimeOffCalendarEvents(env, { memberName, memberEmail, startDate, endDate, note });
      return jsonResponse({ ok: true, ...result });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  if (action === "delete") {
    const { teamEventId, personalEventId, memberEmail } = payload;
    try {
      const result = await deleteTimeOffCalendarEvents(env, { teamEventId, personalEventId, memberEmail });
      return jsonResponse({ ok: true, ...result });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  return jsonResponse({ error: "action must be 'upsert' or 'delete'" }, 400);
}

// ── Contractor Portal ──
// A lightweight, no-login access tier for contractors/freelancers who
// don't have a revitalproductions.com account - same magic-token model as
// the client-facing Portal (see firestore.rules' contractorPortal/{token}
// comment), but for a couple of reasons that model alone isn't enough
// here: time off and hours both live in SHARED documents
// (agency/teamRoster, agency/hoursLog) covering every teammate at once,
// not a one-doc-per-person collection like clients/{clientId}. Opening
// Firestore rules to let an anonymous token-holder write into either of
// those shared docs directly would mean trusting the browser not to
// corrupt or leak everyone else's entries, not just their own. So instead
// these three routes do the read-modify-write themselves, server-side,
// using the worker's own privileged Firestore access (getGoogleAccessToken
// + firestoreGetDoc/firestoreSetDoc, same helpers getOrCreateTeamCalendar
// already uses) - the contractor's browser never touches teamRoster or
// hoursLog directly, only ever contractorPortal/{token} (read-only, via
// the Firestore client SDK) and these three API routes.
async function getContractorProjection(env, token) {
  if (!token || typeof token !== "string" || token.length < 16) return null;
  const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
  const projection = await firestoreGetDoc(accessToken, projectId, `contractorPortal/${token}`);
  if (!projection || projection.revoked) return null;
  return { projection, accessToken, projectId };
}

// Mirrors pushAdminNotification's client-side shape (root app.js) exactly,
// minus the in-memory dedupe/read-state that only makes sense browser-side
// - written directly since a Worker request has no window.parent to call
// the real client-side helper through.
async function pushAdminNotificationServerSide(accessToken, projectId, message) {
  try {
    const doc = await firestoreGetDoc(accessToken, projectId, "agency/adminNotifications");
    const list = (doc && Array.isArray(doc.list)) ? doc.list : [];
    list.unshift({
      id: "an_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      type: "contractor_portal",
      message,
      clientName: null,
      draftEmail: null,
      createdAt: new Date().toISOString(),
      read: false,
      sent: false
    });
    if (list.length > 30) list.length = 30;
    await firestoreSetDoc(accessToken, projectId, "agency/adminNotifications", { list });
  } catch (e) {
    // Best-effort only - never let a notification failure block the
    // actual time-off/hours write, which has already succeeded by the
    // time this is called.
    console.error("Couldn't push admin notification from Contractor Portal:", e);
  }
}

// ── GET /api/contractor-portal/data?t=<token> ──
// Single combined read: this contractor's own roster info, their own
// time off (approved + pending + recently-declined), and their own hours
// log entries. Everything scoped server-side to the ONE member the token
// resolves to - the response never includes any other teammate's data.
async function handleContractorPortalData(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t") || "";

  let resolved;
  try {
    resolved = await getContractorProjection(env, token);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
  if (!resolved) return jsonResponse({ error: "Invalid or revoked link" }, 403);
  const { projection, accessToken, projectId } = resolved;

  try {
    const rosterDoc = await firestoreGetDoc(accessToken, projectId, "agency/teamRoster");
    const members = (rosterDoc && Array.isArray(rosterDoc.list)) ? rosterDoc.list : [];
    const member = members.find(m => m.id === projection.memberId);

    await migrateHoursLogIfNeeded(accessToken, projectId);
    const allHours = await firestoreListCollection(accessToken, projectId, "hoursLogEntries");
    const myHours = allHours.filter(h => (h.memberName || "") === projection.memberName);

    // "See assigned client work" (Phase 2) - member.assignedClients (set by
    // an admin in Team Roster, see renderAssignedClientsSection in
    // team-roster/js/app.js) is an array of client NAMES, since clientsDb
    // is itself keyed by name. Deliberately a narrow, hand-picked field
    // projection rather than the raw client object - clientsDb-shard-N
    // packs nearly every admin tool's per-client data (invoicing,
    // proposals, audits, portal config) into one object, and a contractor
    // should only ever see the three things they actually need: the
    // client's name, their brand basics (same fields the client Portal's
    // own renderBrandKit already exposes to an even less-trusted
    // audience), and their creative brief - which already includes a
    // "deliverables" field (see creative-brief-generator/js/app.js), so
    // that single object covers both "brief" and "specific deliverable
    // info" without a separate task-tracking system. Nothing else on the
    // client object is included.
    let clientWork = [];
    if (member && Array.isArray(member.assignedClients) && member.assignedClients.length) {
      const allClients = await fetchAllClientsFromFirestore(accessToken, projectId);
      clientWork = member.assignedClients
        .filter(name => allClients[name])
        .map(name => {
          const c = allClients[name];
          const kit = c.brandKit || {};
          const brief = c.creativeBrief || {};
          return {
            name,
            brandKit: {
              primaryColor: kit.primaryColor || null,
              secondaryColor: kit.secondaryColor || null,
              accentColor: kit.accentColor || null,
              fontPrimary: kit.fontPrimary || null,
              fontSecondary: kit.fontSecondary || null,
              toneOfVoice: kit.toneOfVoice || null,
              logoUrl: kit.logoUrl || null
            },
            creativeBrief: {
              campaignName: brief.campaignName || null,
              objective: brief.objective || null,
              targetAudience: brief.targetAudience || null,
              keyMessage: brief.keyMessage || null,
              toneOfVoice: brief.toneOfVoice || null,
              deliverables: brief.deliverables || null,
              references: brief.references || null
            }
          };
        });
    }

    return jsonResponse({
      ok: true,
      memberName: projection.memberName,
      role: member ? member.role : projection.role,
      employmentType: member ? member.employmentType : projection.employmentType,
      startDate: member ? member.startDate : projection.startDate,
      agreementStatus: member && member.agreementStatus === "Sent" ? "Sent" : "Not Sent",
      agreementSentDate: member ? (member.agreementSentDate || null) : null,
      timeOff: member && Array.isArray(member.timeOff) ? member.timeOff : [],
      pendingTimeOff: member && Array.isArray(member.pendingTimeOff) ? member.pendingTimeOff : [],
      hours: myHours,
      clientWork
    });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

// ── POST /api/contractor-portal/time-off ──
// body: { t: token, action: 'request'|'cancel', startDate, endDate, note, reqId }
async function handleContractorPortalTimeOff(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { t: token, action } = payload || {};

  let resolved;
  try {
    resolved = await getContractorProjection(env, token);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
  if (!resolved) return jsonResponse({ error: "Invalid or revoked link" }, 403);
  const { projection, accessToken, projectId } = resolved;

  try {
    const rosterDoc = await firestoreGetDoc(accessToken, projectId, "agency/teamRoster");
    const members = (rosterDoc && Array.isArray(rosterDoc.list)) ? rosterDoc.list : [];
    const member = members.find(m => m.id === projection.memberId);
    if (!member) return jsonResponse({ error: "Roster entry not found - contact an admin." }, 404);
    if (!Array.isArray(member.pendingTimeOff)) member.pendingTimeOff = [];

    if (action === "request") {
      const { startDate, endDate, note } = payload;
      if (!startDate) return jsonResponse({ error: "startDate is required" }, 400);
      member.pendingTimeOff.push({
        id: "cp-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        startDate,
        endDate: endDate || startDate,
        note: note || "",
        status: "pending",
        requestedByEmail: null,
        requestedVia: "contractor-portal",
        requestedAt: new Date().toISOString()
      });
    } else if (action === "cancel") {
      const { reqId } = payload;
      const before = member.pendingTimeOff.length;
      member.pendingTimeOff = member.pendingTimeOff.filter(r => !(r.id === reqId && r.status === "pending"));
      if (member.pendingTimeOff.length === before) {
        return jsonResponse({ error: "Request not found or already decided" }, 404);
      }
    } else {
      return jsonResponse({ error: "action must be 'request' or 'cancel'" }, 400);
    }

    const nextVersion = (rosterDoc && rosterDoc.version || 0) + 1;
    await firestoreSetDoc(accessToken, projectId, "agency/teamRoster", { list: members, version: nextVersion });

    if (action === "request") {
      await pushAdminNotificationServerSide(accessToken, projectId,
        `${projection.memberName} requested time off via Contractor Portal (${payload.startDate}${payload.endDate && payload.endDate !== payload.startDate ? ` – ${payload.endDate}` : ""}) - approve/decline in Team Roster.`);
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

// ── POST /api/contractor-portal/hours ──
// body: { t: token, date, clientName, hours, billable, notes }
async function handleContractorPortalHours(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { t: token, date, clientName, hours, billable, notes } = payload || {};
  if (!date || !hours) return jsonResponse({ error: "date and hours are required" }, 400);

  let resolved;
  try {
    resolved = await getContractorProjection(env, token);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
  if (!resolved) return jsonResponse({ error: "Invalid or revoked link" }, 403);
  const { projection, accessToken, projectId } = resolved;

  try {
    await migrateHoursLogIfNeeded(accessToken, projectId);
    const id = "hrs-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await firestoreSetDoc(accessToken, projectId, `hoursLogEntries/${id}`, {
      date,
      memberName: projection.memberName,
      clientName: clientName || "",
      hours: Math.max(0, parseFloat(hours) || 0),
      billable: !!billable,
      notes: notes || ""
    });
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

// ── Sales Pipeline Board -> ClickUp sync ──
//
// Sales Pipeline Board (sales-pipeline-board/) is the Hub's own source
// of truth for leads; this mirrors every create/stage-change one-way
// into ClickUp's "Growth > Pipeline Management > Sales Pipeline" list
// (id below) so the board that was already well-designed there but
// sitting empty actually reflects live pipeline state, without asking
// anyone to keep two boards in sync by hand. One-way only (ClickUp
// edits don't flow back) - the Hub board is authoritative.
//
// Requires a secret named CLICKUP_API_TOKEN, set via:
//   wrangler secret put CLICKUP_API_TOKEN
// (ClickUp -> Settings -> Apps -> generate a personal API token, starts
// with "pk_" - passed as-is in the Authorization header, no "Bearer"
// prefix, unlike most other APIs this Hub talks to.)
const CLICKUP_SALES_PIPELINE_LIST_ID = "901327581862";

// ClickUp "Growth > Closing & Onboarding Handoff > Onboarding Handoff"
// list (id confirmed via the list's own hierarchy/v1/subcategory network
// call while inspecting it, not guessed from a view URL - view URLs on a
// list with multiple custom views encode a view id there, not the list
// id). One task per client, columns include Assignee and "Client /
// Company Name" - no clickupTaskId is tracked anywhere in the Hub for
// this list (unlike Sales Pipeline), so handleOnboardingHandoffAssigneeSync
// below has to search for the matching task by client name each time.
const CLICKUP_ONBOARDING_HANDOFF_LIST_ID = "1000460000002186";

// Resolves an @revitalproductions.com email to the ClickUp numeric user id
// the assignees field actually needs (ClickUp has no "assign by email"
// option - the task update/create endpoints only take ids). Looks across
// every workspace ("team" in ClickUp's still-v2-era naming) the API token
// can see, since a token isn't scoped to just one. No caching - this only
// ever fires on a Sales -> Delivery Handoff completion (Kickoff Prep &
// Deck), which is rare enough that a live lookup each time is fine.
async function findClickUpUserIdByEmail(apiToken, email) {
  const target = (email || "").trim().toLowerCase();
  if (!target) return null;
  try {
    const res = await fetch("https://api.clickup.com/api/v2/team", {
      headers: { Authorization: apiToken }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.teams)) return null;
    for (const team of data.teams) {
      const members = Array.isArray(team.members) ? team.members : [];
      for (const m of members) {
        const u = (m && m.user) || m;
        if (u && u.email && String(u.email).trim().toLowerCase() === target) return u.id;
      }
    }
    return null;
  } catch (e) {
    console.warn("ClickUp member lookup by email failed:", e);
    return null;
  }
}

// Looks up a custom field's id by name on a given List (the API has no
// "set by name" option, only by id - see developer.clickup.com/docs/
// customfields). "Account Manager" already exists as a workspace-level
// Person field; confirmed via the ClickUp UI that it needed to be
// explicitly added to the Sales Pipeline list before it'd show up there,
// which it now is. No caching, same reasoning as findClickUpUserIdByEmail.
async function findClickUpFieldIdByName(apiToken, listId, fieldName) {
  const target = (fieldName || "").trim().toLowerCase();
  if (!target) return null;
  try {
    const res = await fetch(`https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/field`, {
      headers: { Authorization: apiToken }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.fields)) return null;
    const match = data.fields.find(f => (f.name || "").trim().toLowerCase() === target);
    return match ? { id: match.id, type: match.type } : null;
  } catch (e) {
    console.warn("ClickUp custom field lookup failed:", e);
    return null;
  }
}

// ── Section gate for ClickUp sync routes (Team Access enforcement) ──
// Everything routed through the client-side Firestore SDK (Sales Pipeline
// Board's own saves, Access & Login Log, Ad Account Log, etc.) is already
// gated per-section by firestore.rules (see docSectionMap there). These two
// routes are the exception: they run on the Worker's own privileged
// service-account Firestore access, which bypasses those rules entirely -
// so without a check here, a teammate restricted out of Sales Pipeline
// could still reassign a ClickUp task's owner by calling this endpoint
// directly, even though they can't see agency/salesPipeline itself.
// Mirrors resolveRestrictionForEmail's effectiveSections logic (same
// helper handleRestrictedClientData below already uses). Fails OPEN only
// if the check itself can't run (e.g. a transient Firestore read error) -
// this is a best-effort sync on top of data that's separately protected,
// not the sole barrier, so a hiccup here shouldn't lock out an
// unrestricted admin's normal handoff flow.
async function requireSection(env, accessEmail, sectionName) {
  try {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const { isRestricted, sections } = await resolveRestrictionForEmail(accessToken, projectId, accessEmail);
    return !isRestricted || (sections || []).includes(sectionName);
  } catch (e) {
    console.warn("requireSection check failed - failing open:", e);
    return true;
  }
}

async function handlePipelineSyncClickUp(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  if (!(await requireSection(env, accessEmail, "sales-pipeline"))) {
    return jsonResponse({ error: "Not authorized for Sales Pipeline" }, 403);
  }

  const apiToken = env.CLICKUP_API_TOKEN;
  if (!apiToken) return jsonResponse({ error: "Server missing CLICKUP_API_TOKEN secret" }, 500);

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { taskId, name, stage, contactEmail, source, notes, assigneeEmail } = payload || {};
  if (!name || !stage) return jsonResponse({ error: "name and stage are required" }, 400);

  const descriptionParts = [];
  if (contactEmail) descriptionParts.push(`**Contact:** ${contactEmail}`);
  if (source) descriptionParts.push(`**Source:** ${source}`);
  if (notes) descriptionParts.push(`**Notes:**\n${notes}`);
  descriptionParts.push(`_Synced from the Hub's Sales Pipeline Board - edits here won't flow back._`);
  const markdown_description = descriptionParts.join("\n\n");

  // Only looked up when the caller actually asked to set an assignee
  // (Kickoff Prep & Deck's handoff completion is the one caller that
  // passes this today) - every other sync-clickup call (Sales Pipeline
  // Board's own saves, the referral/cold-outreach auto-create hooks)
  // passes no assigneeEmail and this stays a no-op, unchanged from before.
  let assigneeUserId = null;
  if (assigneeEmail) {
    assigneeUserId = await findClickUpUserIdByEmail(apiToken, assigneeEmail);
  }

  try {
    if (taskId) {
      const body = { name, status: stage, markdown_description };
      if (assigneeUserId) body.assignees = { add: [assigneeUserId] };
      const res = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`, {
        method: "PUT",
        headers: { Authorization: apiToken, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.err || `ClickUp update failed (${res.status})`);

      // Also stamp the "Account Manager" Person custom field to match, on
      // top of setting the native Assignee above - Ronald's team uses
      // Assignee as the working-ownership signal, but wants this labeled
      // custom field kept in sync too, visible wherever assignee isn't
      // shown. Best-effort: doesn't affect the assignee/status update
      // above, which already succeeded by this point.
      let accountManagerFieldSet;
      if (assigneeUserId) {
        accountManagerFieldSet = false;
        try {
          const field = await findClickUpFieldIdByName(apiToken, CLICKUP_SALES_PIPELINE_LIST_ID, "Account Manager");
          if (field && field.type === "users") {
            const fieldRes = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/field/${field.id}`, {
              method: "POST",
              headers: { Authorization: apiToken, "Content-Type": "application/json" },
              body: JSON.stringify({ value: { add: [assigneeUserId], rem: [] } })
            });
            accountManagerFieldSet = fieldRes.ok;
          }
        } catch (e) {
          console.warn("Setting Account Manager custom field failed:", e);
        }
      }

      return jsonResponse({ ok: true, taskId: data.id || taskId, assigneeMatched: assigneeEmail ? !!assigneeUserId : undefined, accountManagerFieldSet });
    } else {
      const body = { name, status: stage, markdown_description };
      if (assigneeUserId) body.assignees = [assigneeUserId];
      const res = await fetch(`https://api.clickup.com/api/v2/list/${CLICKUP_SALES_PIPELINE_LIST_ID}/task`, {
        method: "POST",
        headers: { Authorization: apiToken, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.err || `ClickUp create failed (${res.status})`);
      return jsonResponse({ ok: true, taskId: data.id, assigneeMatched: assigneeEmail ? !!assigneeUserId : undefined });
    }
  } catch (e) {
    return jsonResponse({ error: `ClickUp sync failed: ${e.message}` }, 500);
  }
}

// ── QuickBooks Online (Financial Center) ──
//
// Unlike every other integration in this file (ClickUp's static token,
// Stripe's key pair, Docusign's JWT-bearer grant), QuickBooks requires an
// interactive OAuth2 Authorization Code flow - a human (Ronald) has to
// consent once per QuickBooks company via Intuit's own consent screen.
// That means, unlike a static secret, the resulting refresh token has to
// be persisted somewhere this Worker can read/write at request time -
// there's no KV binding in this project, so it's stored the same place
// every other piece of agency-wide state already lives: Firestore, at
// agency/quickbooksAuth, via the same firestoreGetDoc/firestoreSetDoc
// REST helpers the health digest and Stripe webhook already use.
//
// Setup (one-time, done by Ronald - see the setup instructions given
// alongside this code, never done by pasting secrets into chat):
//   1. Create an app at https://developer.intuit.com (platform:
//      "QuickBooks Online and Payments", scope: com.intuit.quickbooks.accounting)
//   2. Register redirect URI: https://hub.revitalproductions.com/api/quickbooks/oauth-callback
//   3. wrangler secret put QB_CLIENT_ID
//      wrangler secret put QB_CLIENT_SECRET
//   4. Open Financial Center in the Hub and click "Connect QuickBooks"
//
// QB_API_BASE_URL is optional - defaults to the production API. Only set
// it (to https://sandbox-quickbooks.api.intuit.com) if the connected app
// is ever pointed at an Intuit sandbox company instead of the real one.
const QUICKBOOKS_AUTH_DOC_PATH = "agency/quickbooksAuth";
const QUICKBOOKS_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QUICKBOOKS_SCOPE = "com.intuit.quickbooks.accounting";

function quickBooksApiBase(env) {
  return env.QB_API_BASE_URL || "https://quickbooks.api.intuit.com";
}

function quickBooksRedirectUri(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/quickbooks/oauth-callback`;
}

// Intuit's own support team asks app developers to capture this header
// (see the "Error Handling" section of their app-review questionnaire) -
// it lets them look up exactly what happened server-side on a specific
// failed call, without us having to hand over any request/response
// bodies. Present on every QuickBooks API response, success or failure;
// only worth reading (and logging) on failures, since that's the only
// time anyone would ever need to hand it to Intuit support.
function quickBooksTid(res) {
  return (res && res.headers && res.headers.get("intuit_tid")) || null;
}
function quickBooksErrorSuffix(res) {
  const tid = quickBooksTid(res);
  return tid ? ` (intuit_tid: ${tid})` : "";
}

// Full admin access OR the "finance" Team Access section (added Aug 2026
// alongside the FINANCE sidebar group - see index.html/team-access-manager)
// may call these endpoints. Just delegates to requireSection - kept as its
// own named function since it's called from three places below and reads
// clearer at each call site than a bare requireSection(..., "finance").
async function requireFinancialCenterAccess(env, accessEmail) {
  return requireSection(env, accessEmail, "finance");
}

function quickBooksHtmlResponse(message, ok) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QuickBooks</title>
    <style>body{font-family:-apple-system,sans-serif;background:#0b0d12;color:#e6e8ee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}
    div{max-width:360px;padding:24px;} h1{font-size:18px;color:${ok ? '#22c55e' : '#ef4444'};}</style>
    </head><body><div><h1>${ok ? 'QuickBooks Connected' : 'QuickBooks Connection Failed'}</h1><p>${message}</p><p>You can close this tab.</p></div>
    <script>try{ if(window.opener){ window.opener.postMessage('quickbooks-connected', '*'); } }catch(e){} setTimeout(()=>window.close(), 4000);</script>
    </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

// ── /api/quickbooks/oauth-start ──
// Visited directly by the browser (Financial Center opens it with
// window.open, not fetch) - redirects straight to Intuit's consent
// screen. A random state is stashed in the same Firestore doc and
// checked back on the way in at oauth-callback, as basic CSRF
// protection since Workers have no server-side session to hold it in
// memory between these two requests.
async function handleQuickBooksOAuthStart(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  if (!(await requireFinancialCenterAccess(env, accessEmail))) {
    return jsonResponse({ error: "Not authorized for Financial Center" }, 403);
  }
  if (!env.QB_CLIENT_ID) {
    return jsonResponse({ error: "Server missing QB_CLIENT_ID secret - see Financial Center setup instructions" }, 500);
  }

  const state = crypto.randomUUID();
  try {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const existing = (await firestoreGetDoc(accessToken, projectId, QUICKBOOKS_AUTH_DOC_PATH)) || {};
    await firestoreSetDoc(accessToken, projectId, QUICKBOOKS_AUTH_DOC_PATH, { ...existing, pendingState: state, pendingStateCreatedAt: new Date().toISOString() });
  } catch (e) {
    return jsonResponse({ error: `Couldn't start QuickBooks connection: ${e.message}` }, 500);
  }

  const authUrl = new URL("https://appcenter.intuit.com/connect/oauth2");
  authUrl.searchParams.set("client_id", env.QB_CLIENT_ID);
  authUrl.searchParams.set("scope", QUICKBOOKS_SCOPE);
  authUrl.searchParams.set("redirect_uri", quickBooksRedirectUri(request));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);
  return Response.redirect(authUrl.toString(), 302);
}

// ── /api/quickbooks/oauth-callback ──
// Where Intuit redirects the browser back to after Ronald consents.
// Exchanges the one-time code for an access+refresh token pair, looks
// up the company name for display, and persists everything needed for
// future syncs to agency/quickbooksAuth.
async function handleQuickBooksOAuthCallback(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return quickBooksHtmlResponse(`Intuit reported: ${error}`, false);
  }
  if (!code || !realmId || !state) {
    return quickBooksHtmlResponse("Missing code, realmId, or state in the callback - try connecting again.", false);
  }
  if (!env.QB_CLIENT_ID || !env.QB_CLIENT_SECRET) {
    return quickBooksHtmlResponse("Server missing QB_CLIENT_ID/QB_CLIENT_SECRET secrets - see Financial Center setup instructions.", false);
  }

  try {
    const { accessToken: gAccessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const existing = (await firestoreGetDoc(gAccessToken, projectId, QUICKBOOKS_AUTH_DOC_PATH)) || {};
    if (!existing.pendingState || existing.pendingState !== state) {
      return quickBooksHtmlResponse("This connection link expired or was already used - click Connect QuickBooks again to get a fresh one.", false);
    }

    const tokenRes = await fetch(QUICKBOOKS_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${env.QB_CLIENT_ID}:${env.QB_CLIENT_SECRET}`)}`
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: quickBooksRedirectUri(request)
      })
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      throw new Error((tokenData.error_description || tokenData.error || `Token exchange failed (${tokenRes.status})`) + quickBooksErrorSuffix(tokenRes));
    }

    let companyName = "";
    try {
      const infoRes = await fetch(`${quickBooksApiBase(env)}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" }
      });
      const infoData = await infoRes.json().catch(() => ({}));
      if (!infoRes.ok) {
        console.warn(`Couldn't fetch QuickBooks company name (non-fatal): ${infoRes.status}${quickBooksErrorSuffix(infoRes)}`);
      }
      companyName = (infoData.CompanyInfo && infoData.CompanyInfo.CompanyName) || "";
    } catch (e) {
      console.warn("Couldn't fetch QuickBooks company name (non-fatal):", e);
    }

    const accessTokenExpiresAt = new Date(Date.now() + (Number(tokenData.expires_in) || 3600) * 1000).toISOString();
    await firestoreSetDoc(gAccessToken, projectId, QUICKBOOKS_AUTH_DOC_PATH, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      accessTokenExpiresAt,
      realmId,
      companyName,
      connectedAt: existing.connectedAt || new Date().toISOString(),
      connectedBy: accessEmail,
      pendingState: null,
      pendingStateCreatedAt: null
    });

    return quickBooksHtmlResponse(`Connected to ${companyName || 'your QuickBooks company'}.`, true);
  } catch (e) {
    return quickBooksHtmlResponse(`Couldn't finish connecting: ${e.message}`, false);
  }
}

// ── /api/quickbooks/status ──
async function handleQuickBooksStatus(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  if (!(await requireFinancialCenterAccess(env, accessEmail))) {
    return jsonResponse({ error: "Not authorized for Financial Center" }, 403);
  }
  try {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const doc = await firestoreGetDoc(accessToken, projectId, QUICKBOOKS_AUTH_DOC_PATH);
    const connected = !!(doc && doc.refreshToken && doc.realmId);
    return jsonResponse({ connected, companyName: doc && doc.companyName, connectedAt: doc && doc.connectedAt });
  } catch (e) {
    return jsonResponse({ connected: false, error: e.message });
  }
}

// Returns a live QuickBooks access token, refreshing it first if it's
// expired or close to it (QBO access tokens last 60 minutes). Refresh
// tokens rotate on every use per Intuit's own docs, so the new one is
// always written back - reusing a stale refresh token would eventually
// break the connection.
async function getValidQuickBooksAccessToken(env) {
  const { accessToken: gAccessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
  const doc = await firestoreGetDoc(gAccessToken, projectId, QUICKBOOKS_AUTH_DOC_PATH);
  if (!doc || !doc.refreshToken || !doc.realmId) {
    throw new Error("QuickBooks isn't connected yet - click Connect QuickBooks in Financial Center first.");
  }

  const expiresAt = doc.accessTokenExpiresAt ? new Date(doc.accessTokenExpiresAt).getTime() : 0;
  const needsRefresh = !doc.accessToken || Date.now() > (expiresAt - 5 * 60 * 1000);
  if (!needsRefresh) {
    return { qbAccessToken: doc.accessToken, realmId: doc.realmId };
  }

  if (!env.QB_CLIENT_ID || !env.QB_CLIENT_SECRET) {
    throw new Error("Server missing QB_CLIENT_ID/QB_CLIENT_SECRET secrets");
  }
  const refreshRes = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${env.QB_CLIENT_ID}:${env.QB_CLIENT_SECRET}`)}`
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: doc.refreshToken })
  });
  const refreshData = await refreshRes.json().catch(() => ({}));
  if (!refreshRes.ok) {
    throw new Error((refreshData.error_description || refreshData.error || `QuickBooks token refresh failed (${refreshRes.status})`) + " - may need to reconnect in Financial Center" + quickBooksErrorSuffix(refreshRes));
  }

  const accessTokenExpiresAt = new Date(Date.now() + (Number(refreshData.expires_in) || 3600) * 1000).toISOString();
  await firestoreSetDoc(gAccessToken, projectId, QUICKBOOKS_AUTH_DOC_PATH, {
    ...doc,
    accessToken: refreshData.access_token,
    refreshToken: refreshData.refresh_token || doc.refreshToken,
    accessTokenExpiresAt
  });
  return { qbAccessToken: refreshData.access_token, realmId: doc.realmId };
}

// Walks a QuickBooks report's Rows tree (ProfitAndLoss, BalanceSheet,
// etc.) looking for a summary row whose group matches groupName (e.g.
// "Income", "Expenses", "TotalCOGS") and returns its total as a number.
// Reports nest sections arbitrarily deep (Income > sub-categories, for
// example), so this recurses rather than assuming a fixed depth.
function findQuickBooksReportGroupTotal(rows, groupName) {
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    if (row.group === groupName && row.Summary && Array.isArray(row.Summary.ColData)) {
      const last = row.Summary.ColData[row.Summary.ColData.length - 1];
      const n = parseFloat(last && last.value);
      if (!isNaN(n)) return n;
    }
    if (row.Rows && row.Rows.Row) {
      const found = findQuickBooksReportGroupTotal(row.Rows.Row, groupName);
      if (found !== null) return found;
    }
  }
  return null;
}

// ── /api/quickbooks/snapshot ──
// Pulls the current numbers Financial Center's manual fields can be
// auto-filled from: cash (sum of Bank accounts), credit card balance
// (sum of Credit Card accounts), revenue/expenses this month (from the
// Profit & Loss report), and tax reserve/owner funding (best-effort
// match on Equity account names containing "tax" / "owner" - QuickBooks
// has no standardized field for either, so this is a heuristic Ronald
// may need to adjust chart-of-account names to match, or just keep
// editing those two manually). "Available Credit" is deliberately never
// returned here - QuickBooks' API doesn't expose credit limits at all,
// so that field stays manual regardless of connection state.
async function handleQuickBooksSnapshot(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  if (!(await requireFinancialCenterAccess(env, accessEmail))) {
    return jsonResponse({ error: "Not authorized for Financial Center" }, 403);
  }

  try {
    const { qbAccessToken, realmId } = await getValidQuickBooksAccessToken(env);
    const apiBase = quickBooksApiBase(env);
    const qbHeaders = { Authorization: `Bearer ${qbAccessToken}`, Accept: "application/json" };
    const result = {};

    // Cash + credit card balances, from the Account entity list.
    try {
      const query = encodeURIComponent("SELECT Name, AccountType, CurrentBalance FROM Account WHERE Active = true MAXRESULTS 1000");
      const acctRes = await fetch(`${apiBase}/v3/company/${realmId}/query?query=${query}&minorversion=65`, { headers: qbHeaders });
      const acctData = await acctRes.json().catch(() => ({}));
      if (!acctRes.ok) {
        throw new Error(`Account query failed (${acctRes.status})${quickBooksErrorSuffix(acctRes)}`);
      }
      const accounts = (acctData.QueryResponse && acctData.QueryResponse.Account) || [];

      const bankTotal = accounts.filter(a => a.AccountType === "Bank").reduce((sum, a) => sum + (Number(a.CurrentBalance) || 0), 0);
      const ccTotal = accounts.filter(a => a.AccountType === "Credit Card").reduce((sum, a) => sum + Math.abs(Number(a.CurrentBalance) || 0), 0);
      result.cashAvailable = bankTotal;
      result.creditCardBalance = ccTotal;

      const equityAccounts = accounts.filter(a => a.AccountType === "Equity");
      const taxAcct = equityAccounts.find(a => /tax/i.test(a.Name || ""));
      const ownerAcct = equityAccounts.find(a => /owner/i.test(a.Name || ""));
      if (taxAcct) result.taxReserve = Math.abs(Number(taxAcct.CurrentBalance) || 0);
      if (ownerAcct) result.ownerFunding = Math.abs(Number(ownerAcct.CurrentBalance) || 0);
    } catch (e) {
      console.warn("QuickBooks account balances fetch failed (non-fatal):", e);
    }

    // Revenue/expenses this month, from the Profit & Loss report.
    try {
      const now = new Date();
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
      const today = now.toISOString().slice(0, 10);
      const plRes = await fetch(`${apiBase}/v3/company/${realmId}/reports/ProfitAndLoss?start_date=${startOfMonth}&end_date=${today}&minorversion=65`, { headers: qbHeaders });
      const plData = await plRes.json().catch(() => ({}));
      if (!plRes.ok) {
        throw new Error(`Profit & Loss report fetch failed (${plRes.status})${quickBooksErrorSuffix(plRes)}`);
      }
      const rows = plData.Rows && plData.Rows.Row;
      const income = findQuickBooksReportGroupTotal(rows, "Income");
      const expenses = findQuickBooksReportGroupTotal(rows, "Expenses");
      if (income !== null) result.revenueThisMonth = income;
      if (expenses !== null) result.expensesThisMonth = expenses;
    } catch (e) {
      console.warn("QuickBooks P&L fetch failed (non-fatal):", e);
    }

    return jsonResponse(result);
  } catch (e) {
    return jsonResponse({ error: `QuickBooks sync failed: ${e.message}` }, 500);
  }
}

// Finds the Onboarding Handoff task for a client - no clickupTaskId is
// tracked anywhere in the Hub for this list (it's populated by a ClickUp
// Form, not by any Hub-side create call), so this searches by name each
// time rather than looking one up by id. Matches on either the task's own
// name or its "Client / Company Name" custom field, case-insensitively -
// whichever convention ends up being used, this catches it. include_closed
// so a handoff that's already been marked done still gets found.
async function findOnboardingHandoffTaskByClientName(apiToken, clientName) {
  const target = (clientName || "").trim().toLowerCase();
  if (!target) return null;
  try {
    const res = await fetch(`https://api.clickup.com/api/v2/list/${CLICKUP_ONBOARDING_HANDOFF_LIST_ID}/task?include_closed=true`, {
      headers: { Authorization: apiToken }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.tasks)) return null;
    for (const task of data.tasks) {
      if ((task.name || "").toLowerCase().includes(target)) return task.id;
      const fields = Array.isArray(task.custom_fields) ? task.custom_fields : [];
      const match = fields.find(f =>
        /client|company/i.test(f.name || "") &&
        typeof f.value === "string" &&
        f.value.trim().toLowerCase() === target
      );
      if (match) return task.id;
    }
    return null;
  } catch (e) {
    console.warn("Onboarding Handoff task lookup failed:", e);
    return null;
  }
}

async function handleOnboardingHandoffAssigneeSync(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  if (!(await requireSection(env, accessEmail, "sales-pipeline"))) {
    return jsonResponse({ error: "Not authorized for Sales Pipeline" }, 403);
  }

  const apiToken = env.CLICKUP_API_TOKEN;
  if (!apiToken) return jsonResponse({ error: "Server missing CLICKUP_API_TOKEN secret" }, 500);

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { clientName, assigneeEmail } = payload || {};
  if (!clientName || !assigneeEmail) return jsonResponse({ error: "clientName and assigneeEmail are required" }, 400);

  const assigneeUserId = await findClickUpUserIdByEmail(apiToken, assigneeEmail);
  if (!assigneeUserId) return jsonResponse({ ok: true, reason: "no_am_match" });

  const taskId = await findOnboardingHandoffTaskByClientName(apiToken, clientName);
  if (!taskId) return jsonResponse({ ok: true, reason: "no_task" });

  try {
    const res = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`, {
      method: "PUT",
      headers: { Authorization: apiToken, "Content-Type": "application/json" },
      body: JSON.stringify({ assignees: { add: [assigneeUserId] } })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.err || `ClickUp update failed (${res.status})`);
    return jsonResponse({ ok: true, taskId: data.id || taskId, assigneeMatched: true });
  } catch (e) {
    return jsonResponse({ error: `ClickUp sync failed: ${e.message}` }, 500);
  }
}

// ── Recurring Billing (Stripe Subscriptions) ──
//
// Contract & Invoice Tracker's only prior billing mechanism was a
// manually-pasted Stripe Payment Link (one-time charges) plus a manual
// "Invoice Paid" toggle - nothing actually pulled a card automatically
// each month. This adds real Stripe Billing: an admin enters a monthly
// amount in the Tracker, which creates a Stripe Checkout Session
// (subscription mode) server-side and returns a link to send the
// client: they enter their card once on Stripe's own hosted page (this
// Worker never touches card data), and Stripe charges it automatically
// every month after that. A webhook keeps each record's billing status
// in sync with what Stripe actually did (paid/failed/canceled) without
// anyone checking back manually.
//
// Test and live mode run side by side rather than one replacing the
// other: STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET are the test-mode pair
// (sk_test_.../whsec_... from the test-mode webhook), and
// STRIPE_SECRET_KEY_LIVE/STRIPE_WEBHOOK_SECRET_LIVE are the live-mode
// pair (sk_live_.../whsec_... from a SECOND webhook endpoint created in
// live mode, pointed at the same URL). The Tracker's "Send Billing
// Link" UI has a Live checkbox (defaults off) that decides which pair a
// given checkout session is created with; the webhook side can't know
// in advance which mode an incoming event is, so it tries both signing
// secrets and uses whichever one actually verifies (see
// verifyStripeWebhookSignature below).
//   wrangler secret put STRIPE_SECRET_KEY            (sk_test_...)
//   wrangler secret put STRIPE_WEBHOOK_SECRET        (whsec_..., test-mode endpoint)
//   wrangler secret put STRIPE_SECRET_KEY_LIVE       (sk_live_...)
//   wrangler secret put STRIPE_WEBHOOK_SECRET_LIVE   (whsec_..., live-mode endpoint)

async function stripeApiRequest(env, path, formParams, billingMode) {
  const secretKey = billingMode === "live" ? env.STRIPE_SECRET_KEY_LIVE : env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(`Server missing ${billingMode === "live" ? "STRIPE_SECRET_KEY_LIVE" : "STRIPE_SECRET_KEY"} secret`);
  }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: formParams.toString()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || `Stripe API error (${res.status})`);
  return data;
}

// ── POST /api/billing/create-subscription-checkout ──
// Admin-gated (called from inside the Hub, same as the other write
// routes). Creates a Stripe Checkout Session with an inline dynamic
// price (price_data) rather than requiring a pre-created Stripe Price
// object per possible dollar amount - agency retainers/project fees are
// bespoke per client, so a fixed catalog of Prices doesn't fit. Returns
// the hosted checkout URL to send the client.
//
// billingType (Aug 2026, added alongside Proposal Calculator's own
// "Generate Payment Link" button - see generateProposalPaymentLink in
// root app.js; the route name is unchanged for backward compatibility
// with Contract & Invoice Tracker's existing "Send Billing Link", which
// never sends billingType and so keeps getting the original behavior):
//   - "recurring" (default) - a monthly subscription, mode: subscription,
//     one recurring line item off monthlyAmount.
//   - "one_time" - a single charge off setupAmount, mode: payment, one
//     non-recurring line item. No subscription is created, so this
//     record never receives invoice.paid/invoice.payment_failed events
//     later - see applyStripeEventToContractInvoices, which marks it
//     "paid" directly off checkout.session.completed instead of "active".
//   - "combined" - a one-time setup fee billed alongside an ongoing
//     monthly retainer, mode: subscription with TWO line items (one
//     recurring off monthlyAmount, one not off setupAmount) - Stripe
//     bills both together on the first invoice, then just the recurring
//     amount every month after.
// ── Idle Lock PIN (Aug 2026, per-person as of the second pass) ──
// The 30-minute idle-lock overlay (see initIdleSessionLock in app.js)
// used to unlock with a single click, which only re-confirmed the
// browser's existing Cloudflare Access cookie was still valid - it
// didn't actually challenge the person standing at the keyboard. Anyone
// with physical access to an already-signed-in, unlocked computer could
// click through it.
//
// First version used one PIN shared by the whole team. Switched to
// per-person: each teammate gets their own PIN, generated (not
// self-chosen) by a Hub Admin and handed to them directly as part of
// onboarding - see handleIdleLockGeneratePin. All stored in a single
// agency/idleLockPins doc, keyed by lowercased email:
//   { "juan@revitalproductions.com": { salt, hash, updatedAt, updatedBy, failedAttempts, lockedUntil }, ... }
// Hashes only, salted SHA-256, never plaintext at rest - the generated
// PIN is returned in the API response exactly once, at creation time,
// for the admin to copy and share.
async function sha256Hex(text) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function idleLockRequireAccess(request) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) return null;
  return accessEmail;
}

// Same agency/teamAccess.hubAdmins list Team Access Manager and Team
// Roster already gate Contractor Documents / "Signed Into the Hub" on
// (see team-roster/js/app.js) - reused here so "who can generate PINs
// for other people" is the same small, deliberate list rather than a
// new one to keep in sync. Defaults to just the founder account if the
// doc has never been saved with a hubAdmins field, so a fresh install
// never locks everyone out of generating the first PIN.
async function isHubAdminEmail(accessToken, projectId, email) {
  const doc = await firestoreGetDoc(accessToken, projectId, "agency/teamAccess");
  const hubAdmins = (doc && Array.isArray(doc.hubAdmins)) ? doc.hubAdmins : ["admin@revitalproductions.com"];
  return hubAdmins.map(e => (e || "").toLowerCase()).includes(email.toLowerCase());
}

function generateRandomPin(digits) {
  const bytes = crypto.getRandomValues(new Uint32Array(digits));
  return Array.from(bytes).map(b => String(b % 10)).join("");
}

// ── GET /api/idle-lock/status ──
// Tells the client whether THE CALLER (not the team as a whole) has
// their own PIN set up yet, so the lock overlay knows whether to show
// the PIN-entry form or a "no PIN yet, ask an admin" message. Also
// returns `locked` (real, server-side idle-lock state - see
// handleIdleLockEngage) and `isHubAdmin`, both added Aug 2026 alongside
// the hardened idle lock: this single call has to work even when the
// caller has no live Firestore session of their own (locked, or hasn't
// signed into Firebase yet on a fresh page load), so it's the one place
// the client can cheaply ask "am I locked" / "can I self-serve a PIN"
// using the Worker's own privileged Firestore access instead of a
// client-side Firestore read that idleLockPins' rules would deny anyway.
async function handleIdleLockStatus(request, env) {
  const accessEmail = idleLockRequireAccess(request);
  if (!accessEmail) return jsonResponse({ error: "Not authorized" }, 403);

  try {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const doc = await firestoreGetDoc(accessToken, projectId, "agency/idleLockPins");
    const entry = doc ? doc[accessEmail.toLowerCase()] : null;
    const isHubAdmin = await isHubAdminEmail(accessToken, projectId, accessEmail);
    return jsonResponse({
      hasPin: !!(entry && entry.hash),
      locked: !!(entry && entry.lockedAt),
      isHubAdmin
    });
  } catch (e) {
    return jsonResponse({ error: "Request failed: " + e.message }, 500);
  }
}

// ── POST /api/idle-lock/engage ──
// Called by the client the instant idle timeout fires (or on a fresh
// page load that discovers it's still locked from before - see
// showIdleLockOverlay in app.js), NOT by a timer running here - the
// Worker has no way to know when a browser tab goes idle on its own.
// Stamps lockedAt for THE CALLER (never a client-supplied email - same
// idleLockRequireAccess pattern as the rest of this section), which is
// what firestore.rules' isIdleLocked() actually checks on every single
// Firestore read/write, and what handleMintFirebaseToken below refuses
// against. This is the real barrier - the client also signs itself out
// of Firebase Auth at the same moment (see app.js), but a client-side
// sign-out alone is just as bypassable by reload as the old overlay-only
// lock was. This server-side flag is what a reload can't erase.
async function handleIdleLockEngage(request, env) {
  const accessEmail = idleLockRequireAccess(request);
  if (!accessEmail) return jsonResponse({ error: "Not authorized" }, 403);
  const emailKey = accessEmail.toLowerCase();

  try {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const doc = (await firestoreGetDoc(accessToken, projectId, "agency/idleLockPins")) || {};
    const entry = doc[emailKey] || {};
    doc[emailKey] = { ...entry, lockedAt: new Date().toISOString() };
    await firestoreSetDoc(accessToken, projectId, "agency/idleLockPins", doc);
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: "Request failed: " + e.message }, 500);
  }
}

// ── GET /api/idle-lock/people ──
// Hub-Admin only. Lists everyone worth showing in the PIN generator
// panel: every email in agency/teamActivity.users (anyone who's ever
// actually signed into the Hub) UNIONED with every email already in
// agency/idleLockPins (covers someone pre-provisioned with a PIN before
// their first login - see handleIdleLockGeneratePin's newEmail path).
async function handleIdleLockListPeople(request, env) {
  const accessEmail = idleLockRequireAccess(request);
  if (!accessEmail) return jsonResponse({ error: "Not authorized" }, 403);

  try {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    if (!(await isHubAdminEmail(accessToken, projectId, accessEmail))) {
      return jsonResponse({ error: "Only Hub Admins can view this" }, 403);
    }
    const [activityDoc, pinsDoc] = await Promise.all([
      firestoreGetDoc(accessToken, projectId, "agency/teamActivity"),
      firestoreGetDoc(accessToken, projectId, "agency/idleLockPins")
    ]);
    const activityUsers = (activityDoc && activityDoc.users) || {};
    const pins = pinsDoc || {};
    const allEmails = new Set([...Object.keys(activityUsers), ...Object.keys(pins)]);
    const people = [...allEmails].map(email => ({
      email,
      lastSeen: (activityUsers[email] && activityUsers[email].lastSeen) || null,
      hasPin: !!(pins[email] && pins[email].hash),
      pinUpdatedAt: (pins[email] && pins[email].updatedAt) || null
    })).sort((a, b) => a.email.localeCompare(b.email));
    return jsonResponse({ people });
  } catch (e) {
    return jsonResponse({ error: "Request failed: " + e.message }, 500);
  }
}

// Minimal, self-contained Resend call for server-to-server use (i.e.
// called directly from another handler, not over HTTP to /api/send-email
// itself) - mirrors handleSendEmail's actual Resend request exactly, just
// without that route's attachments/reply-to/multi-recipient handling,
// which nothing here needs. Kept as its own function rather than
// refactoring handleSendEmail to share it, so this addition can't
// regress the existing, already-in-production send-email route.
async function sendResendEmailDirect(env, { to, subject, body, from }) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "Server missing RESEND_API_KEY secret" };
  const fromAddress = from || `Revital Productions <hello@${SEND_EMAIL_DOMAIN}>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddress, to: [to], subject, text: body })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.message || "Resend API error" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── POST /api/idle-lock/generate-pin ──
// Body: { email: "juan@revitalproductions.com" }. Hub-Admin only.
// Generates a random 6-digit PIN server-side (never admin-typed - the
// whole point is a code nobody chose and nobody but this one response
// ever sees in plaintext), stores its salted hash, emails it directly to
// that person (see sendResendEmailDirect above - same Resend service
// every other Hub email already goes through), and ALSO returns the
// plaintext PIN in the response so the admin can see/copy it themselves
// if the email fails or they want it immediately. Regenerating for
// someone who already has a PIN silently replaces it.
async function handleIdleLockGeneratePin(request, env) {
  const accessEmail = idleLockRequireAccess(request);
  if (!accessEmail) return jsonResponse({ error: "Not authorized" }, 403);

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const targetEmail = ((payload && payload.email) || "").toString().trim().toLowerCase();
  if (!targetEmail || !targetEmail.includes("@")) {
    return jsonResponse({ error: "A valid email is required" }, 400);
  }

  try {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    if (!(await isHubAdminEmail(accessToken, projectId, accessEmail))) {
      return jsonResponse({ error: "Only Hub Admins can generate PINs" }, 403);
    }

    const pin = generateRandomPin(6);
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, "0")).join("");
    const hash = await sha256Hex(salt + pin);

    const existing = (await firestoreGetDoc(accessToken, projectId, "agency/idleLockPins")) || {};
    existing[targetEmail] = {
      salt, hash,
      updatedAt: new Date().toISOString(),
      updatedBy: accessEmail,
      failedAttempts: 0,
      lockedUntil: null,
      // A fresh PIN also lifts any active server-side idle lock (Aug
      // 2026 - see isIdleLocked() in firestore.rules) - most relevant
      // for the self-serve path (generateOwnPinAndUnlock in app.js),
      // where generating a PIN and unlocking are the same action with no
      // separate verify-pin step to clear it otherwise. Harmless no-op
      // if targetEmail wasn't locked.
      lockedAt: null
    };
    await firestoreSetDoc(accessToken, projectId, "agency/idleLockPins", existing);

    const emailResult = await sendResendEmailDirect(env, {
      to: targetEmail,
      subject: "Your Revital Hub idle-lock PIN",
      body: `Hi,\n\nA Hub Admin generated a new idle-lock PIN for your account on the Client Onboarding & Audit Hub (hub.revitalproductions.com).\n\nYour PIN: ${pin}\n\nYou'll be asked for this after being idle for 30 minutes, to confirm it's really you before the Hub shows client data again. Keep it private - don't share it with anyone else, including coworkers.\n\nIf you didn't expect this, let ${accessEmail} know.\n\n- Revital Productions Hub`
    });

    return jsonResponse({ ok: true, pin, emailSent: emailResult.ok, emailError: emailResult.ok ? null : emailResult.error });
  } catch (e) {
    return jsonResponse({ error: "Request failed: " + e.message }, 500);
  }
}

// ── POST /api/idle-lock/remove-pin ──
// Body: { email }. Hub-Admin only - for offboarding, or just revoking
// someone's ability to unlock without deleting anything else about them.
async function handleIdleLockRemovePin(request, env) {
  const accessEmail = idleLockRequireAccess(request);
  if (!accessEmail) return jsonResponse({ error: "Not authorized" }, 403);

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const targetEmail = ((payload && payload.email) || "").toString().trim().toLowerCase();
  if (!targetEmail) return jsonResponse({ error: "A valid email is required" }, 400);

  try {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    if (!(await isHubAdminEmail(accessToken, projectId, accessEmail))) {
      return jsonResponse({ error: "Only Hub Admins can remove PINs" }, 403);
    }
    const existing = (await firestoreGetDoc(accessToken, projectId, "agency/idleLockPins")) || {};
    delete existing[targetEmail];
    await firestoreSetDoc(accessToken, projectId, "agency/idleLockPins", existing);
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: "Request failed: " + e.message }, 500);
  }
}

// ── POST /api/idle-lock/verify-pin ──
// Body: { pin: "483920" }. Checks against THE CALLER's own PIN only
// (looked up by their Cf-Access-Authenticated-User-Email, not something
// the client can spoof - that header comes from Cloudflare Access
// itself). Simple brute-force guard - 5 wrong guesses in a row locks
// further attempts out for 60 seconds.
async function handleIdleLockVerifyPin(request, env) {
  const accessEmail = idleLockRequireAccess(request);
  if (!accessEmail) return jsonResponse({ error: "Not authorized" }, 403);
  const emailKey = accessEmail.toLowerCase();

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const pin = ((payload && payload.pin) || "").toString().trim();

  try {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const doc = (await firestoreGetDoc(accessToken, projectId, "agency/idleLockPins")) || {};
    const entry = doc[emailKey];
    if (!entry || !entry.hash) {
      return jsonResponse({ error: "You don't have a PIN yet - ask a Hub Admin to generate one for you" }, 400);
    }

    if (entry.lockedUntil && new Date(entry.lockedUntil).getTime() > Date.now()) {
      const waitSec = Math.ceil((new Date(entry.lockedUntil).getTime() - Date.now()) / 1000);
      return jsonResponse({ ok: false, error: `Too many attempts - try again in ${waitSec}s` }, 429);
    }

    const candidateHash = await sha256Hex(entry.salt + pin);
    if (candidateHash === entry.hash) {
      // Always clear lockedAt on a correct PIN, not just failedAttempts/
      // lockedUntil - this is the one place that actually lifts the
      // real, server-side idle lock (see handleIdleLockEngage). Written
      // unconditionally (not just "if it was set") since a no-op write
      // when already unset is harmless and simpler than tracking a third
      // "did anything change" condition.
      doc[emailKey] = { ...entry, failedAttempts: 0, lockedUntil: null, lockedAt: null };
      await firestoreSetDoc(accessToken, projectId, "agency/idleLockPins", doc);
      return jsonResponse({ ok: true });
    }

    const failedAttempts = (entry.failedAttempts || 0) + 1;
    const lockedUntil = failedAttempts >= 5 ? new Date(Date.now() + 60000).toISOString() : null;
    doc[emailKey] = { ...entry, failedAttempts: lockedUntil ? 0 : failedAttempts, lockedUntil };
    await firestoreSetDoc(accessToken, projectId, "agency/idleLockPins", doc);
    return jsonResponse({
      ok: false,
      error: lockedUntil ? "Too many attempts - try again in 60s" : "Wrong PIN"
    }, 401);
  } catch (e) {
    return jsonResponse({ error: "Request failed: " + e.message }, 500);
  }
}

async function handleCreateSubscriptionCheckout(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { recordId, clientName, monthlyAmount, setupAmount, clientEmail, mode, serviceLabel } = payload || {};
  const billingType = ["one_time", "combined"].includes(payload && payload.billingType) ? payload.billingType : "recurring";
  const billingMode = mode === "live" ? "live" : "test";
  if (!recordId || !clientName) {
    return jsonResponse({ error: "recordId and clientName are required" }, 400);
  }

  const needsMonthly = billingType === "recurring" || billingType === "combined";
  const needsSetup = billingType === "one_time" || billingType === "combined";
  const monthlyCents = Math.round(Number(monthlyAmount) * 100);
  const setupCents = Math.round(Number(setupAmount) * 100);
  if (needsMonthly && (!Number.isFinite(monthlyCents) || monthlyCents <= 0)) {
    return jsonResponse({ error: "monthlyAmount must be a positive number" }, 400);
  }
  if (needsSetup && (!Number.isFinite(setupCents) || setupCents <= 0)) {
    return jsonResponse({ error: "setupAmount must be a positive number" }, 400);
  }

  const label = (serviceLabel || "").trim();
  const recurringName = `${clientName} - ${label || "Monthly Retainer"}`;
  const oneTimeName = billingType === "combined"
    ? `${clientName} - ${label ? label + " Setup Fee" : "One-Time Setup Fee"}`
    : `${clientName} - ${label || "One-Time Project Fee"}`;

  const params = new URLSearchParams();
  params.append("mode", billingType === "one_time" ? "payment" : "subscription");

  let lineIndex = 0;
  if (needsMonthly) {
    params.append(`line_items[${lineIndex}][price_data][currency]`, "usd");
    params.append(`line_items[${lineIndex}][price_data][product_data][name]`, recurringName);
    params.append(`line_items[${lineIndex}][price_data][recurring][interval]`, "month");
    params.append(`line_items[${lineIndex}][price_data][unit_amount]`, String(monthlyCents));
    params.append(`line_items[${lineIndex}][quantity]`, "1");
    lineIndex++;
  }
  if (needsSetup) {
    params.append(`line_items[${lineIndex}][price_data][currency]`, "usd");
    params.append(`line_items[${lineIndex}][price_data][product_data][name]`, oneTimeName);
    params.append(`line_items[${lineIndex}][price_data][unit_amount]`, String(setupCents));
    params.append(`line_items[${lineIndex}][quantity]`, "1");
    lineIndex++;
  }

  // Real invoice document, not just a bare payment receipt (Aug 2026).
  // For mode:"subscription" (recurring/combined) Stripe always generates
  // a proper invoice per billing cycle on its own - no param needed here.
  // For mode:"payment" (one_time) that's opt-in, so turn it on explicitly
  // or a one-time charge would only produce a plain receipt. Whether
  // Stripe actually EMAILS the invoice to the client is a Stripe Dashboard
  // setting (Settings -> Billing -> Invoice/Emails -> "Email customers
  // about finalized invoices"), not something this route controls -
  // confirm that's on for both the test and live Stripe accounts.
  if (billingType === "one_time") {
    params.append("invoice_creation[enabled]", "true");
  }

  params.append("success_url", "https://book.revitalproductions.com/billing-success/");
  params.append("cancel_url", "https://book.revitalproductions.com/billing-canceled/");
  params.append("metadata[hubRecordId]", recordId);
  params.append("metadata[hubClientName]", clientName);
  params.append("metadata[hubMode]", billingMode);
  params.append("metadata[hubBillingType]", billingType);
  if (clientEmail) params.append("customer_email", clientEmail);

  try {
    const session = await stripeApiRequest(env, "checkout/sessions", params, billingMode);
    return jsonResponse({ ok: true, checkoutUrl: session.url, sessionId: session.id, mode: billingMode });
  } catch (e) {
    return jsonResponse({ error: `Stripe request failed: ${e.message}` }, 500);
  }
}

// Verifies Stripe's webhook signature by hand (HMAC-SHA256 over
// "{timestamp}.{rawBody}", per Stripe's documented scheme) rather than
// using their Node SDK, which doesn't run in the Workers runtime - same
// reasoning as every other from-scratch crypto in this file. Rejects
// anything older than 5 minutes as a basic replay guard.
async function verifyStripeWebhookSignatureWithSecret(secret, rawBody, sigHeader) {
  if (!secret) throw new Error("No signing secret configured");
  if (!sigHeader) throw new Error("Missing Stripe-Signature header");

  const parts = {};
  sigHeader.split(",").forEach(p => {
    const [k, v] = p.split("=");
    if (k && v) parts[k] = v;
  });
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error("Malformed Stripe-Signature header");

  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expectedHex = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

  if (expectedHex !== signature) throw new Error("Signature mismatch");

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (ageSeconds > 300) throw new Error("Webhook timestamp too old (possible replay)");

  return JSON.parse(rawBody);
}

// Test-mode and live-mode webhook endpoints both point at this same
// URL (Stripe requires separate endpoints - and separate signing
// secrets - per mode), so an incoming request doesn't say up front
// which one it is. Try the test secret first, then live, and use
// whichever one actually verifies. Returns which mode matched so the
// caller can tag the record accordingly.
async function verifyStripeWebhookSignature(env, rawBody, sigHeader) {
  const candidates = [
    { mode: "test", secret: env.STRIPE_WEBHOOK_SECRET },
    { mode: "live", secret: env.STRIPE_WEBHOOK_SECRET_LIVE }
  ].filter(c => c.secret);
  if (!candidates.length) throw new Error("Server missing STRIPE_WEBHOOK_SECRET/STRIPE_WEBHOOK_SECRET_LIVE secret");

  let lastErr;
  for (const { mode, secret } of candidates) {
    try {
      const event = await verifyStripeWebhookSignatureWithSecret(secret, rawBody, sigHeader);
      return { event, mode };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Signature verification failed");
}

// Applies one Stripe event to the matching Contract & Invoice Tracker
// record's recurringBilling sub-object. Reads the whole
// contractInvoiceRecords collection (list-and-filter, since we only
// know which record to update by matching a Stripe id against a field,
// not by document id - see migrateContractInvoicesIfNeeded above for
// why this is a collection now, not a single agency/contractInvoices
// doc), then writes back ONLY the one changed record - actually cheaper
// than the old whole-list-rewrite-per-webhook-event this replaced, and
// with the added benefit that it can never conflict with a human
// editing a DIFFERENT record in the Tracker at the same moment. Editing
// the exact same record at once is still last-write-wins, same
// tradeoff as Resource Bookings/Hours Log's per-document saves.
async function applyStripeEventToContractInvoices(env, event, billingMode) {
  const relevantTypes = ["checkout.session.completed", "invoice.paid", "invoice.payment_failed", "customer.subscription.deleted"];
  if (!relevantTypes.includes(event.type)) return;

  const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
  await migrateContractInvoicesIfNeeded(accessToken, projectId);
  const list = await firestoreListCollection(accessToken, projectId, "contractInvoiceRecords");

  const obj = event.data.object;
  let record = null;

  if (event.type === "checkout.session.completed") {
    const recordId = obj.metadata && obj.metadata.hubRecordId;
    // "one_time" checkouts (mode: payment) never create a subscription,
    // so this is the only event they'll ever get - land straight on
    // "paid" rather than "active", since there's no ongoing billing to
    // track. "recurring"/"combined" checkouts do create a subscription
    // (obj.subscription is set), so "active" is correct for those - see
    // handleCreateSubscriptionCheckout's billingType comment above.
    const billingType = (obj.metadata && obj.metadata.hubBillingType) || "recurring";
    record = list.find(r => r.id === recordId);
    if (record) {
      record.recurringBilling = record.recurringBilling || {};
      record.recurringBilling.stripeCustomerId = obj.customer || null;
      record.recurringBilling.stripeSubscriptionId = obj.subscription || null;
      record.recurringBilling.status = billingType === "one_time" ? "paid" : "active";
      record.recurringBilling.mode = billingMode;
      record.recurringBilling.billingType = billingType;
    }
  } else {
    // invoice.* events reference the subscription id via obj.subscription;
    // customer.subscription.deleted's object IS the subscription, so its
    // own id is what we matched at checkout time.
    const subId = obj.subscription || obj.id;
    record = list.find(r => r.recurringBilling && r.recurringBilling.stripeSubscriptionId === subId);
    if (record) {
      record.recurringBilling = record.recurringBilling || {};
      if (event.type === "invoice.paid") {
        record.recurringBilling.status = "active";
        record.recurringBilling.lastPaymentDate = new Date().toISOString().slice(0, 10);
        record.recurringBilling.lastPaymentStatus = "paid";
      } else if (event.type === "invoice.payment_failed") {
        record.recurringBilling.status = "past_due";
        record.recurringBilling.lastPaymentStatus = "failed";
      } else if (event.type === "customer.subscription.deleted") {
        record.recurringBilling.status = "canceled";
      }
    }
  }

  if (!record) {
    console.warn(`Stripe webhook ${event.type}: no matching contract/invoice record found (subscription/record id not on file yet)`);
    return;
  }

  const { id: recordId, ...recordRest } = record;
  await firestoreSetDoc(accessToken, projectId, `contractInvoiceRecords/${recordId}`, recordRest);

  // Failed-payment alert - without this, a declined card only shows up as
  // a status change in the Tracker (same "Payment Failed" badge
  // billingCellHtml already renders), which nobody sees unless they
  // happen to check that page. Same best-effort pattern as the booking
  // notification: a failed alert send shouldn't undo the status update
  // above, since Firestore is already the source of truth by this point.
  if (event.type === "invoice.payment_failed") {
    try {
      const amount = typeof obj.amount_due === "number" ? (obj.amount_due / 100).toFixed(2) : null;
      const currency = (obj.currency || "usd").toUpperCase();
      const attemptCount = obj.attempt_count || null;
      const modeTag = billingMode === "live" ? "" : "[TEST] ";
      const subject = `${modeTag}Payment failed: ${record.clientName}${amount ? ` ($${amount})` : ""}`;
      const html = `
        <div style="font-family: sans-serif; max-width: 560px;">
          <h2 style="margin:0 0 12px; color:#dc2626;">Recurring Payment Failed</h2>
          <p><strong>${escapeHtmlServer(record.clientName)}</strong>'s card was declined${attemptCount ? ` (attempt ${attemptCount})` : ""}.</p>
          <table style="font-size:14px; margin:16px 0;">
            ${amount ? `<tr><td style="color:#64748b; padding-right:12px;">Amount</td><td>$${amount} ${currency}</td></tr>` : ""}
            <tr><td style="color:#64748b; padding-right:12px;">Mode</td><td>${billingMode === "live" ? "Live" : "Test"}</td></tr>
          </table>
          ${obj.hosted_invoice_url ? `<p><a href="${obj.hosted_invoice_url}">View invoice in Stripe</a></p>` : ""}
          <p style="font-size:12px; color:#94a3b8; margin-top:24px;">Status is now "Payment Failed" in Contract & Invoice Tracker's Recurring Billing column. Stripe will automatically retry the charge per its default retry schedule.</p>
        </div>
      `;
      const text = `Payment failed: ${record.clientName}${amount ? ` ($${amount} ${currency})` : ""}\nMode: ${billingMode === "live" ? "Live" : "Test"}${attemptCount ? `\nAttempt: ${attemptCount}` : ""}${obj.hosted_invoice_url ? `\n${obj.hosted_invoice_url}` : ""}\n\nStatus is now "Payment Failed" in Contract & Invoice Tracker.`;
      // Sent to the invoices@ alias (forwards to admin@'s inbox) rather than
      // admin@ directly, so billing failure alerts land under a
      // filterable/labelable "to" address instead of mixing into the
      // general admin inbox undifferentiated.
      await sendHealthDigestEmail(env, ["invoices@revitalproductions.com"], subject, html, text);
    } catch (notifyErr) {
      console.error("Failed-payment alert email failed (billing status update itself still succeeded):", notifyErr);
    }
  }

  // Subscription canceled (all Stripe retries exhausted, or manually
  // canceled in the Stripe dashboard) - the doc's Payment Flow calls for
  // "services suspended | Account manager notified" at this point, but
  // until now nothing fired here at all beyond the status flip above. This
  // goes to the specific client's account manager (not the shared
  // invoices@ alias the first-failure alert above uses), since by this
  // point it's an account-specific call on whether/how to pause work -
  // same "notify the AM directly" pattern as the low-pulse and deal-won
  // alerts. Best-effort: a failed send here shouldn't undo the status
  // update above, same reasoning as the block it follows.
  if (event.type === "customer.subscription.deleted") {
    try {
      const clients = await fetchAllClientsFromFirestore(accessToken, projectId);
      const clientObj = clients[record.clientName] || null;
      const config = (clientObj && clientObj.portalConfig) || {};
      const amEmail = config.accountManagerEmail || "invoices@revitalproductions.com";
      const amFirstName = config.accountManagerName ? String(config.accountManagerName).split(' ')[0] : "there";
      const modeTag = billingMode === "live" ? "" : "[TEST] ";
      const subject = `${modeTag}Subscription canceled: ${record.clientName}`;
      const html = `
        <div style="font-family: sans-serif; max-width: 560px;">
          <h2 style="margin:0 0 12px; color:#dc2626;">Recurring Billing Canceled</h2>
          <p>Hi ${escapeHtmlServer(amFirstName)},</p>
          <p><strong>${escapeHtmlServer(record.clientName)}</strong>'s recurring subscription in Stripe was just canceled${config.accountManagerEmail ? "" : " (no account manager on file for this client - defaulting to this alias)"}.</p>
          <p style="font-size:14px; color:#64748b;">This usually means all automatic retries on a failed card were exhausted. Per the documented process, services should be paused until this is resolved with the client. Status is now "Canceled" in Contract & Invoice Tracker's Recurring Billing column.</p>
        </div>
      `;
      const text = `Subscription canceled: ${record.clientName}\nMode: ${billingMode === "live" ? "Live" : "Test"}\n\nAll Stripe retries were likely exhausted. Per the documented process, pause services until resolved. Status is now "Canceled" in Contract & Invoice Tracker.`;
      await sendHealthDigestEmail(env, [amEmail], subject, html, text);
    } catch (notifyErr) {
      console.error("Subscription-canceled alert email failed (billing status update itself still succeeded):", notifyErr);
    }
  }
}

async function handleStripeWebhook(request, env) {
  const sigHeader = request.headers.get("Stripe-Signature");
  const rawBody = await request.text();

  let event, billingMode;
  try {
    const verified = await verifyStripeWebhookSignature(env, rawBody, sigHeader);
    event = verified.event;
    billingMode = verified.mode;
  } catch (e) {
    return jsonResponse({ error: `Webhook signature verification failed: ${e.message}` }, 400);
  }

  try {
    await applyStripeEventToContractInvoices(env, event, billingMode);
  } catch (e) {
    // Still acknowledge with 200 below - a bug in our own processing
    // shouldn't make Stripe retry-storm this event. Logged here for
    // manual follow-up. Error objects don't serialize cleanly through
    // console.error in Workers Logs (message/stack aren't own-enumerable
    // properties), so pull them out explicitly.
    console.error("Stripe webhook processing failed. type=" + event.type + " message=" + (e && e.message) + " name=" + (e && e.name) + " stack=" + (e && e.stack));
  }

  return jsonResponse({ received: true });
}

// Converts Firestore REST API's typed-value JSON shape ({fields: {name:
// {stringValue: "..."}}}) into a plain JS object/array - the REST API
// never returns plain JSON, everything is wrapped like this.
function firestoreValueToJs(v) {
  if (!v) return null;
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(firestoreValueToJs);
  if ("mapValue" in v) return firestoreFieldsToJs((v.mapValue && v.mapValue.fields) || {});
  return null;
}
function firestoreFieldsToJs(fields) {
  const out = {};
  for (const key of Object.keys(fields || {})) out[key] = firestoreValueToJs(fields[key]);
  return out;
}

// Fetches one document by its path relative to /documents/ (e.g.
// "agency/clientsDbShardMeta"). Returns null on a 404 (doc doesn't exist)
// rather than throwing, since several callers below treat "not there yet"
// as a normal, expected case.
async function firestoreGetDoc(accessToken, projectId, relativePath) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${relativePath}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || `Firestore read failed (${res.status}) for ${relativePath}`;
    throw new Error(msg);
  }
  return firestoreDocToJs(data);
}
function firestoreDocToJs(doc) {
  if (!doc || !doc.fields) return null;
  return firestoreFieldsToJs(doc.fields);
}

// ── Firestore REST write path (jsToFirestoreValue etc.) ──
// Everything above this point in the file only ever READS Firestore
// (health digest, account-manager lookup) - the Stripe webhook handler
// is the first thing that needs the Worker to write back, so this is
// the inverse of firestoreValueToJs/firestoreFieldsToJs above: plain JS
// -> Firestore's typed-value wire format.
function jsToFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(jsToFirestoreValue) } };
  if (typeof v === "object") return { mapValue: { fields: jsToFirestoreFields(v) } };
  return { stringValue: String(v) };
}
function jsToFirestoreFields(obj) {
  const out = {};
  for (const key of Object.keys(obj || {})) out[key] = jsToFirestoreValue(obj[key]);
  return out;
}

// PATCH without an updateMask replaces the whole document - same
// full-overwrite semantics the client-side saveVersionedAgencyDoc uses,
// kept consistent deliberately so a doc looks the same shape regardless
// of whether a human or this Worker wrote it last.
async function firestoreSetDoc(accessToken, projectId, relativePath, dataObj) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${relativePath}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: jsToFirestoreFields(dataObj) })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || `Firestore write failed (${res.status}) for ${relativePath}`;
    throw new Error(msg);
  }
  return data;
}

// Lists every document directly under a collection (relativePath e.g.
// "hoursLogEntries") - the REST API's collection-list endpoint, distinct
// from firestoreGetDoc above which only ever fetches one named document.
// pageSize=1000 covers this Hub's actual scale comfortably (a growing
// internal tool for a small agency, not a high-volume consumer app) -
// worth revisiting with real pagination (using the response's
// nextPageToken) if any collection here ever approaches that many
// documents, which isn't expected for years given current usage.
async function firestoreListCollection(accessToken, projectId, relativePath) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${relativePath}?pageSize=1000`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || `Firestore list failed (${res.status}) for ${relativePath}`;
    throw new Error(msg);
  }
  const docs = data.documents || [];
  return docs.map(doc => {
    const id = doc.name.split('/').pop();
    return Object.assign({ id }, firestoreDocToJs(doc));
  });
}

// 404 on delete (already gone) is treated as success, not an error - the
// end state either way is "the document doesn't exist," same reasoning
// as deleteTimeOffCalendarEvents' calendar-side deletes above.
async function firestoreDeleteDoc(accessToken, projectId, relativePath) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${relativePath}`;
  const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));
    const msg = (data.error && data.error.message) || `Firestore delete failed (${res.status}) for ${relativePath}`;
    throw new Error(msg);
  }
}

// One-time, idempotent backfill from the old "one doc holding a growing
// list" shape (agency/hoursLog, {list: [...]}) into the new one-
// document-per-entry collection (hoursLogEntries/{entryId}) - see the
// Aug 2026 storage-scaling work (same reasoning as Resource Bookings'
// migration, documented in resource-booking-calendar/js/app.js's header
// comment).
//
// Gated on an agency/hoursLogMigrationDone marker doc, not on "is
// hoursLogEntries currently empty" (the original version of this
// function) - that check re-passed, and this whole backfill silently
// re-ran, the moment every entry in the new collection got deleted, and
// the old agency/hoursLog doc is deliberately left untouched as a
// passive backup, so previously-deleted entries (test data included)
// resurrected right along with it. Confirmed Aug 2026 via a "Jake Smith"
// test entry that kept reappearing after being deleted. Must match the
// client-side twin in root app.js exactly (same marker doc) since either
// side can be the one that actually runs the migration - see that
// function's comment for the full story. The marker means this never
// touches hoursLogEntries again once set, no matter how empty that
// collection later becomes, and both this Worker path and the browser-
// side tool can still independently call this without coordinating who
// goes first (whichever gets there first sets the marker; Firestore
// document writes are atomic, so no risk of a double-migration race).
async function migrateHoursLogIfNeeded(accessToken, projectId) {
  try {
    const marker = await firestoreGetDoc(accessToken, projectId, "agency/hoursLogMigrationDone");
    if (marker) return; // already migrated
    const oldDoc = await firestoreGetDoc(accessToken, projectId, "agency/hoursLog");
    const oldEntries = (oldDoc && Array.isArray(oldDoc.list)) ? oldDoc.list : [];
    if (oldEntries.length) {
      for (const entry of oldEntries) {
        if (!entry.id) continue; // shouldn't happen, but skip anything unkeyable rather than throw
        const { id, ...rest } = entry;
        await firestoreSetDoc(accessToken, projectId, `hoursLogEntries/${id}`, rest);
      }
    }
    await firestoreSetDoc(accessToken, projectId, "agency/hoursLogMigrationDone", { done: true, migratedAt: new Date().toISOString() });
  } catch (e) {
    // Best-effort - if this fails, the caller's own subsequent read of
    // hoursLogEntries just comes back empty/incomplete rather than
    // blocking whatever the caller actually wanted to do. Logged for
    // follow-up, not surfaced to whoever's request triggered this.
    console.error("Hours log migration to per-document storage failed:", e);
  }
}

// Same idempotent one-time backfill as migrateHoursLogIfNeeded above,
// but for agency/contractInvoices -> contractInvoiceRecords/{recordId}
// (Aug 2026 storage-scaling work, applied last since this collection's
// growth is bounded by client/contract count rather than activity
// volume - lower urgency than Hours Log or Resource Bookings, but same
// underlying risk). Called from applyStripeEventToContractInvoices
// below (the only Worker-side touchpoint) and from the client-side twin
// in root app.js's getContractInvoiceRecords/migrateContractInvoicesIfNeeded.
//
// Gated on an agency/contractInvoicesMigrationDone marker doc, not on
// "is the collection currently empty" - see migrateHoursLogIfNeeded's
// comment above for why that check let deleted records silently
// resurrect themselves. Must match the client-side twin's marker doc
// name exactly.
async function migrateContractInvoicesIfNeeded(accessToken, projectId) {
  try {
    const marker = await firestoreGetDoc(accessToken, projectId, "agency/contractInvoicesMigrationDone");
    if (marker) return;
    const oldDoc = await firestoreGetDoc(accessToken, projectId, "agency/contractInvoices");
    const oldRecords = (oldDoc && Array.isArray(oldDoc.list)) ? oldDoc.list : [];
    if (oldRecords.length) {
      for (const record of oldRecords) {
        if (!record.id) continue;
        const { id, ...rest } = record;
        await firestoreSetDoc(accessToken, projectId, `contractInvoiceRecords/${id}`, rest);
      }
    }
    await firestoreSetDoc(accessToken, projectId, "agency/contractInvoicesMigrationDone", { done: true, migratedAt: new Date().toISOString() });
  } catch (e) {
    console.error("Contract/invoice migration to per-document storage failed:", e);
  }
}

// Mirrors app.js's rebuildClientsDbFromShards: clientsDb is bin-packed
// across agency/clientsDb-shard-0, -1, ... (however many
// agency/clientsDbShardMeta's count says exist) to stay under Firestore's
// per-document size limit. Falls back to the pre-sharding single
// agency/clientsDb document if the meta doc doesn't exist yet (shouldn't
// happen given the migration already ran client-side, but this endpoint
// has no way to trigger that migration itself, so staying defensive here
// costs nothing).
async function fetchAllClientsFromFirestore(accessToken, projectId) {
  const meta = await firestoreGetDoc(accessToken, projectId, "agency/clientsDbShardMeta");
  if (!meta) {
    const legacy = await firestoreGetDoc(accessToken, projectId, "agency/clientsDb");
    return legacy || {};
  }
  const shardCount = typeof meta.count === "number" ? meta.count : 0;
  const merged = {};
  for (let i = 0; i < shardCount; i++) {
    const shard = await firestoreGetDoc(accessToken, projectId, `agency/clientsDb-shard-${i}`);
    if (shard) Object.assign(merged, shard);
  }
  return merged;
}

// ── Restricted Client Data (Team Access real section-level enforcement) ──
//
// firestore.rules' gate on clientsDb is all-or-nothing: a restricted user
// either has SOME reason to be in account/client data (any non-Agency-
// Globals section) and gets the WHOLE bundled document, or has none and
// is blocked entirely - because clientsDb-shard-N packs nearly every
// tool's per-client fields into one object per client, and Firestore
// rules can only grant or deny a whole document, never individual fields
// within one. These two endpoints are the actual per-section slice: once
// app.js routes restricted users through them instead of talking to
// Firestore directly (separate change, tested independently first - see
// the Aug 2026 Team Access audit), a restricted teammate only ever sees
// or touches the fields their granted sections cover.
//
// CLIENT_FIELD_SECTIONS is a third copy of the same section
// classification as SECTION_DEFS (team-access-manager/js/app.js) and
// nonGlobalsSections (firestore.rules) - keep all three in sync if a
// tool's data moves sections or a new top-level client field is added.
// Built by hand by matching every field in createClientBlankState and
// every field syncPublicPortalDocs projects to the client-facing doc
// (both in app.js) against which <li class="nav-section"
// data-section="..."> its owning tool sits under in index.html. A field
// left off this map is simply never shown to (or writable by) a
// restricted user - fails closed, not open - until it's added here.
const ALWAYS_VISIBLE_CLIENT_FIELDS = ["name", "createdDate", "targetUrl", "clickupUrl", "onboardingDate"];

const CLIENT_FIELD_SECTIONS = {
  onboardingChecklist: "core",
  clientChecklist: "core",
  brandVault: "core",
  portalConfig: "core",
  pendingApprovals: "core",
  approvalHistory: "core",
  notifications: "core",
  lastVisitedAt: "core",
  portalLastVisitedAt: "core",
  lastEditedBy: "core",
  lastEditedByEmail: "core",
  lastEditedAt: "core",

  paidAdsTracker: "ad-accounts-access",

  reportArchive: "reporting-health",
  report: "reporting-health",

  brandKit: "content-creation",
  moodBoards: "content-creation",
  productionBoard: "content-creation",
  productionBoardCompleted: "content-creation",
  qcQueue: "content-creation",
  moodBoardViews: "content-creation",
  moodBoardStyleFeedback: "content-creation",
  moodBoardAnnotations: "content-creation",
  brandRoadmap: "content-creation",
  copywriting: "content-creation",
  creativeBrief: "content-creation",
  contentStrategy: "content-creation",
  creativeStrategy: "content-creation",

  campaignLaunch: "account-ops",
  meetingNotes: "account-ops",

  uxuiAudit: "audits",
  seoAudit: "audits",
  paidAdsAudit: "audits",
  emailAudit: "audits",
  socialAudit: "audits",
  contentAudit: "audits",
  emailStrategy: "audits",

  competitorAnalysis: "strategy-competition",
  strategyBuilder: "strategy-competition",
  webComp: "strategy-competition",
  socialComp: "strategy-competition",

  proposal: "sales-pipeline",
  roi: "sales-pipeline",
  signature: "sales-pipeline",
  billingSummary: "sales-pipeline",

  testimonialSubmission: "retention-social-proof",
  referralSummary: "retention-social-proof"
};

// Mirrors effectiveSections() in team-access-manager/js/app.js and
// firestore.rules' own copy of the same logic - see the comment on
// agency/teamAccess there for the shape of the doc this reads.
async function resolveRestrictionForEmail(accessToken, projectId, email) {
  const teamAccess = await firestoreGetDoc(accessToken, projectId, "agency/teamAccess");
  const normalizedEmail = (email || "").toLowerCase();
  const users = (teamAccess && teamAccess.users) || {};
  if (!Object.prototype.hasOwnProperty.call(users, normalizedEmail)) {
    return { isRestricted: false, sections: null };
  }
  const entry = users[normalizedEmail] || {};
  const roleTiers = (teamAccess && teamAccess.roleTiers) || {};
  const sections = (entry.role && roleTiers[entry.role])
    ? (roleTiers[entry.role].sections || [])
    : (Array.isArray(entry.sections) ? entry.sections : []);
  return { isRestricted: true, sections };
}

// Keeps only the fields a restricted user's granted sections cover (plus
// the always-visible identity fields), for one client object.
function filterClientBySections(client, sections) {
  const sectionSet = new Set(sections || []);
  const out = {};
  ALWAYS_VISIBLE_CLIENT_FIELDS.forEach(key => {
    if (client[key] !== undefined) out[key] = client[key];
  });
  Object.keys(client).forEach(key => {
    if (out[key] !== undefined) return; // already included above
    const section = CLIENT_FIELD_SECTIONS[key];
    if (section && sectionSet.has(section)) out[key] = client[key];
  });
  return out;
}

// ── GET /api/restricted-client-data ──
// Returns every client, filtered to the caller's granted sections. An
// unrestricted admin gets the full, unfiltered roster back (harmless -
// they already have direct Firestore access to all of it today), so this
// endpoint behaves consistently no matter who calls it.
async function handleRestrictedClientData(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  try {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const { isRestricted, sections } = await resolveRestrictionForEmail(accessToken, projectId, accessEmail);
    const allClients = await fetchAllClientsFromFirestore(accessToken, projectId);

    if (!isRestricted) {
      return jsonResponse({ restricted: false, sections: null, clients: allClients }, 200, { "Cache-Control": "no-store" });
    }

    const filtered = {};
    Object.keys(allClients).forEach(name => {
      filtered[name] = filterClientBySections(allClients[name], sections);
    });
    return jsonResponse({ restricted: true, sections, clients: filtered }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    console.error("restricted-client-data read failed:", e);
    return jsonResponse({ error: "Request failed: " + e.message }, 500);
  }
}

// ── Portal fold-in helpers (server-side port of app.js's client-side
// versions - foldInOnboardingChecked, foldInNotificationReadState,
// foldInApprovalDecisions) ──
// Needed so handleRestrictedClientDataWrite below can safely project
// onboardingChecklist/notifications/pendingApprovals/approvalHistory into
// the public clients/{token} doc, the same way syncPublicPortalDocs
// (app.js) does for an unrestricted admin's own save. Each of these
// fields can be changed by the CLIENT directly on their own portal (a
// checked onboarding item, a read notification, an approval decision),
// so a plain overwrite here - like the one reportArchive already safely
// gets, since clients never write that field - would risk clobbering
// whatever the client just did if their change hasn't reached this
// caller's copy of clientsDb yet. Operates on cloned data, never mutates
// the caller's actual write payload or the internal clientsDb shard
// already persisted above - this is purely about what gets projected
// into the separate public doc. Keep in sync with the app.js originals
// if that fold-in logic ever changes.
function foldInOnboardingCheckedServer(targetCategories, existingCategories) {
  const cloned = JSON.parse(JSON.stringify(Array.isArray(targetCategories) ? targetCategories : []));
  if (!Array.isArray(existingCategories)) return cloned;
  const checkedIds = new Set();
  existingCategories.forEach(cat => (cat && cat.items || []).forEach(item => {
    if (item && item.checked) checkedIds.add(item.id);
  }));
  cloned.forEach(cat => (cat.items || []).forEach(item => {
    if (checkedIds.has(item.id) && !item.checked) item.checked = true;
  }));
  return cloned;
}

function foldInNotificationReadStateServer(targetNotifications, existingNotifications) {
  const cloned = JSON.parse(JSON.stringify(Array.isArray(targetNotifications) ? targetNotifications : []));
  if (!Array.isArray(existingNotifications)) return cloned;
  const readIds = new Set(existingNotifications.filter(n => n && n.read).map(n => n.id));
  cloned.forEach(n => {
    if (readIds.has(n.id) && !n.read) n.read = true;
  });
  return cloned;
}

// Mirrors foldInApprovalDecisions' signature loosely - takes the caller's
// current pendingApprovals/approvalHistory (from the just-saved internal
// clientsDb record, which reflects this write) and folds in any
// approvalHistory entry the existing public doc already has that this
// copy doesn't, moving the matching pendingApprovals entry (if any) out
// to mirror it - same "a client decision always wins" reasoning as the
// client-side version.
function foldInApprovalDecisionsServer(pendingApprovals, approvalHistory, existingApprovalHistory) {
  const result = {
    pendingApprovals: JSON.parse(JSON.stringify(Array.isArray(pendingApprovals) ? pendingApprovals : [])),
    approvalHistory: JSON.parse(JSON.stringify(Array.isArray(approvalHistory) ? approvalHistory : []))
  };
  if (!Array.isArray(existingApprovalHistory)) return result;
  const knownIds = new Set(result.approvalHistory.map(a => a.id));
  existingApprovalHistory.forEach(entry => {
    if (!knownIds.has(entry.id)) {
      result.approvalHistory = result.approvalHistory.concat([entry]);
      result.pendingApprovals = result.pendingApprovals.filter(p => p.id !== entry.id);
    }
  });
  return result;
}

// Which written fields should trigger a public-portal re-project, and
// how to fold each one - mirrors syncPublicPortalDocs' field list
// (app.js) for the subset that's actually safe to project this way today
// (see the long comment inside handleRestrictedClientDataWrite below for
// which ones aren't yet, and why).
const PORTAL_SYNCED_FIELDS = ["reportArchive", "onboardingChecklist", "clientChecklist", "notifications", "pendingApprovals", "approvalHistory"];

// ── POST /api/restricted-client-data ──
// Body: { clientName: string, fields: { fieldName: value, ... } }
// Validates every key in `fields` is one this caller's granted sections
// are allowed to touch, then merges just those fields into that client's
// real record server-side - the caller never needs (and for a restricted
// user, never has) the rest of that client's document in memory to save
// safely. Rejects the whole request if ANY field falls outside what's
// allowed, rather than silently dropping just the bad ones - a partial
// silent drop would look like a successful save while quietly losing
// data.
async function handleRestrictedClientDataWrite(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { clientName, fields } = payload || {};
  if (!clientName || !fields || typeof fields !== "object" || Array.isArray(fields)) {
    return jsonResponse({ error: "clientName and fields (object) are required" }, 400);
  }

  try {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const { isRestricted, sections } = await resolveRestrictionForEmail(accessToken, projectId, accessEmail);
    const sectionSet = new Set(sections || []);

    const requestedKeys = Object.keys(fields);

    // Identity fields (name, createdDate, etc.) are never writable through
    // this endpoint at all, restricted or not - renaming a client or
    // changing its creation date isn't a per-section action, and a merge-
    // into-shard endpoint like this one is the wrong tool for it.
    const identityFieldsRequested = requestedKeys.filter(key => ALWAYS_VISIBLE_CLIENT_FIELDS.includes(key));
    if (identityFieldsRequested.length) {
      return jsonResponse({ error: "These fields can't be changed through this endpoint: " + identityFieldsRequested.join(", ") }, 403);
    }

    const disallowed = requestedKeys.filter(key => {
      const section = CLIENT_FIELD_SECTIONS[key];
      if (!section) return true; // unclassified field - fail closed
      if (!isRestricted) return false; // unrestricted admin: any classified field is fine
      return !sectionSet.has(section);
    });
    if (disallowed.length) {
      return jsonResponse({ error: "Not permitted to write: " + disallowed.join(", ") }, 403);
    }

    // Locate which shard this client lives in, read that ONE shard fresh,
    // merge in just the permitted fields for this one client, write the
    // whole shard back - the same full-shard-overwrite semantics
    // commitDatabaseToCloud already uses client-side (see app.js), just
    // scoped to one shard instead of all of them, and without needing
    // this caller to have had the rest of the shard's other clients in
    // memory at all. There's still a small unguarded race window between
    // this read and the write below if two saves land on THIS SAME shard
    // at nearly the same instant - acceptable for this team's size and
    // write frequency today, same as before.
    const meta = await firestoreGetDoc(accessToken, projectId, "agency/clientsDbShardMeta");
    const shardCount = meta && typeof meta.count === "number" ? meta.count : 0;

    let targetShardIndex = -1;
    let targetShardData = null;
    for (let i = 0; i < shardCount; i++) {
      const shard = await firestoreGetDoc(accessToken, projectId, `agency/clientsDb-shard-${i}`);
      if (shard && Object.prototype.hasOwnProperty.call(shard, clientName)) {
        targetShardIndex = i;
        targetShardData = shard;
        break;
      }
    }
    if (targetShardIndex === -1) {
      return jsonResponse({ error: `Client "${clientName}" not found` }, 404);
    }

    targetShardData[clientName] = Object.assign({}, targetShardData[clientName], fields);
    await firestoreSetDoc(accessToken, projectId, `agency/clientsDb-shard-${targetShardIndex}`, targetShardData);

    // Bump the shared version counter (agency/clientsDbShardMeta.version)
    // that commitDatabaseToCloud's optimistic-concurrency check reads (see
    // its own comment in app.js) - closing the gap where this endpoint's
    // writes were completely invisible to that check. Every unrestricted
    // admin tab holds a LIVE onSnapshot listener on this same meta doc
    // (startUnrestrictedClientsDbSync in app.js), so bumping it here
    // updates their cached clientsDbDocVersion in real time too - this
    // isn't just "the next save gets rejected," it's "every open admin
    // tab immediately knows a restricted teammate just wrote something."
    // Without this, an admin's next full-shard save (which re-serializes
    // ALL clients from whatever it already had in memory) could silently
    // clobber a restricted teammate's just-saved fields with no conflict
    // ever surfacing, since the version it was comparing against never
    // moved. Re-fetches the meta doc fresh right before writing it
    // (instead of reusing the `meta` read above) so a write that landed on
    // a DIFFERENT shard while this one was in flight still gets its bump
    // counted, not silently overwritten.
    const freshMeta = await firestoreGetDoc(accessToken, projectId, "agency/clientsDbShardMeta");
    const currentVersion = freshMeta && typeof freshMeta.version === "number" ? freshMeta.version : 0;
    const currentCount = freshMeta && typeof freshMeta.count === "number" ? freshMeta.count : shardCount;
    await firestoreSetDoc(accessToken, projectId, "agency/clientsDbShardMeta", {
      count: currentCount,
      version: currentVersion + 1
    });

    // Bug fix (Aug 2026 - "Monthly Reports aren't reaching the Client
    // Portal", later widened to cover onboardingChecklist/clientChecklist/
    // notifications/pendingApprovals/approvalHistory too): the internal
    // clientsDb write above is the whole story for an UNRESTRICTED admin
    // save - commitDatabaseToCloud (app.js) follows it up with
    // syncPublicPortalDocs, which projects all of these into the public
    // clients/{token} doc the portal actually reads from. THIS endpoint is
    // the other save path - every Team-Access-restricted teammate, and
    // also any account that's been assigned a Team Access role at all
    // regardless of how broad (confirmed to include Ronald's own account -
    // see applyRestrictedClientsDbSnapshot's comment in app.js) - and it
    // never called anything equivalent, so these fields saved fine into
    // clientsDb but silently never reached the portal.
    //
    // reportArchive/clientChecklist get a plain overwrite (admin-only-
    // create, or "admin's in-memory copy always wins" respectively - see
    // syncPublicPortalDocs' own comments for why each is safe as-is).
    // onboardingChecklist/notifications/pendingApprovals+approvalHistory
    // can each be changed by the CLIENT directly on their own portal, so
    // those go through the same fold-in logic syncPublicPortalDocs uses
    // client-side (ported above as foldInOnboardingCheckedServer/
    // foldInNotificationReadStateServer/foldInApprovalDecisionsServer)
    // before being projected, so this save can't clobber a client
    // decision/read-state/checked-item that hasn't reached this caller's
    // copy of clientsDb yet.
    //
    // Still NOT ported: testimonialSubmission, moodBoardStyleFeedback,
    // moodBoardAnnotations, clientPulseFeedback, lastVisitedAt - each has
    // its own more involved item-by-item fold-in client-side and isn't
    // part of what was actually reported broken. Left as a further
    // follow-up rather than porting untested logic in this same pass.
    const touchedPortalFields = PORTAL_SYNCED_FIELDS.filter(key => Object.prototype.hasOwnProperty.call(fields, key));
    if (touchedPortalFields.length) {
      const savedClient = targetShardData[clientName];
      const token = savedClient && savedClient.portalConfig && savedClient.portalConfig.magicToken;
      if (token) {
        try {
          const existingPublicDoc = await firestoreGetDoc(accessToken, projectId, `clients/${token}`);
          // Only patch an ALREADY-EXISTING public doc - it's created with
          // its full correct shape (portalConfig, checklists, etc.) by the
          // first real unrestricted admin save (syncPublicPortalDocs), and
          // this endpoint has no business bootstrapping a partial one from
          // scratch. If it doesn't exist yet, the next unrestricted save
          // will create it with all of this already included anyway
          // (it's already sitting in clientsDb by this point).
          if (existingPublicDoc) {
            const patch = {};
            if (touchedPortalFields.includes("reportArchive")) {
              patch.reportArchive = savedClient.reportArchive || [];
            }
            if (touchedPortalFields.includes("clientChecklist")) {
              patch.clientChecklist = savedClient.clientChecklist || [];
            }
            if (touchedPortalFields.includes("onboardingChecklist")) {
              patch.onboardingChecklist = foldInOnboardingCheckedServer(savedClient.onboardingChecklist, existingPublicDoc.onboardingChecklist);
            }
            if (touchedPortalFields.includes("notifications")) {
              patch.notifications = foldInNotificationReadStateServer(savedClient.notifications, existingPublicDoc.notifications);
            }
            if (touchedPortalFields.includes("pendingApprovals") || touchedPortalFields.includes("approvalHistory")) {
              const folded = foldInApprovalDecisionsServer(savedClient.pendingApprovals, savedClient.approvalHistory, existingPublicDoc.approvalHistory);
              patch.pendingApprovals = folded.pendingApprovals;
              patch.approvalHistory = folded.approvalHistory;
            }
            await firestoreSetDoc(accessToken, projectId, `clients/${token}`, Object.assign({}, existingPublicDoc, patch));
          }
        } catch (e) {
          // Don't fail the whole save over this - the internal clientsDb
          // write above already succeeded and is the source of truth;
          // worst case the portal is stale until the next unrestricted
          // admin save picks it up via syncPublicPortalDocs instead.
          console.error("Restricted-path portal sync failed:", e);
        }
      }
    }

    return jsonResponse({ success: true }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    console.error("restricted-client-data write failed:", e);
    return jsonResponse({ error: "Request failed: " + e.message }, 500);
  }
}

async function fetchRevisionRecords(accessToken, projectId) {
  const doc = await firestoreGetDoc(accessToken, projectId, "agency/revisionFeedbackLog");
  return doc && Array.isArray(doc.list) ? doc.list : [];
}

// Most recent "QBR PDF generated" entry per client, from the same
// agency/adminActivityLog every admin action writes to (see
// logAdminActivity in the root app.js and generateQbrPdf in
// qbr-generator/js/app.js). Mirrors agency-health-dashboard/js/app.js's
// listenToAdminActivityLog exactly - same 300-entry-cap caveat applies
// (a genuinely old QBR can fall off the log; treated as "no QBR on
// record", not "never had one" - see healthDigestReasons below).
async function fetchLastQbrDatesByClient(accessToken, projectId) {
  const doc = await firestoreGetDoc(accessToken, projectId, "agency/adminActivityLog");
  const list = doc && Array.isArray(doc.list) ? doc.list : [];
  const byClient = {};
  list.forEach(entry => {
    if (entry.action !== "QBR PDF generated" || !entry.details) return;
    if (!byClient[entry.details]) byClient[entry.details] = entry.createdAt;
  });
  return byClient;
}

function healthDigestTodayStr() {
  const dt = new Date();
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}
// Accepts either a "YYYY-MM-DD" date or a full ISO timestamp (only the
// first 10 characters are used either way) and returns days between two
// such values, calendar-date-only (no time-of-day component) - same
// rounding behavior as the dashboard's own daysBetween.
function healthDigestDaysBetween(fromStr, toStr) {
  const from = new Date((fromStr || "").slice(0, 10) + "T00:00:00Z");
  const to = new Date((toStr || "").slice(0, 10) + "T00:00:00Z");
  return Math.round((to - from) / 86400000);
}

// Exact port of budget-pacing-tracker's getPacingClass() / the
// dashboard's own local copy of it - see agency-health-dashboard/js/app.js
// for the client-side original. Kept byte-for-byte equivalent in intent
// so this digest's "Overspending" count never disagrees with the live
// dashboard.
function healthDigestBudgetPaceClass(p) {
  if (!p || !p.totalBudget || p.totalBudget <= 0) return null;
  const start = new Date(p.startDate);
  const end = new Date(p.endDate);
  const now = new Date();
  if (now > end) return "pace-danger";
  if (now < start) return "pace-good";
  const totalDays = (end - start) / (1000 * 60 * 60 * 24);
  const daysPassed = (now - start) / (1000 * 60 * 60 * 24);
  const expectedPacingRatio = totalDays > 0 ? daysPassed / totalDays : 1;
  const actualPacingRatio = p.spentToDate / p.totalBudget;
  if (actualPacingRatio > expectedPacingRatio * 1.15) return "pace-danger";
  if (actualPacingRatio < expectedPacingRatio * 0.85) return "pace-warn";
  return "pace-good";
}

// Reads client.budgetPacingList defensively without migrating it - same
// convention as the identical helper in app.js/agency-health-dashboard/
// qbr-generator. A client can have more than one tracked project now
// (Budget Pacing Tracker, Aug 2026), so the digest flags "Overspending"
// if ANY of them is over pace, matching worstBudgetPaceClass's dashboard
// behavior.
function healthDigestBudgetPacingList(client) {
  if (!client) return [];
  if (Array.isArray(client.budgetPacingList)) return client.budgetPacingList;
  return client.budgetPacing ? [client.budgetPacing] : [];
}

// Faithful port of agency-health-dashboard/js/app.js's buildRows() - see
// that file for the fuller reasoning behind each threshold/signal. Any
// change to what counts as "needs attention" there should be mirrored
// here (and vice versa) so the two never quietly disagree.
function buildHealthDigestRows(clients, revisionRecords, contractInvoiceRecords, lastQbrDatesByClient) {
  const today = healthDigestTodayStr();
  return Object.keys(clients || {})
    .filter(name => name !== HEALTH_DIGEST_SANDBOX_NAME)
    .map(name => {
      const client = clients[name] || {};
      const checkins = Array.isArray(client.weeklyCheckins) ? client.weeklyCheckins : [];
      const latestCheckin = checkins.length ? checkins[0] : null;
      const healthRating = latestCheckin ? latestCheckin.healthRating : null;
      const lastCheckinDate = latestCheckin ? latestCheckin.date : null;
      const daysSinceCheckin = lastCheckinDate ? healthDigestDaysBetween(lastCheckinDate, today) : null;

      const renewalRec = client.renewal;
      const renewalIsOpen = renewalRec && (renewalRec.status === "On Track" || renewalRec.status === "At Risk");
      const renewalDate = renewalIsOpen ? renewalRec.renewalDate : null;
      const renewalDays = renewalDate ? healthDigestDaysBetween(today, renewalDate) : null;
      const renewalDueSoon = renewalDays !== null && renewalDays <= 30;

      // Renewal-without-a-recent-QBR - see agency-health-dashboard/js/app.js's
      // identical renewalNeedsQbr for the full reasoning (60-day lookahead,
      // 90-day QBR-staleness threshold).
      const lastQbrDate = (lastQbrDatesByClient && lastQbrDatesByClient[name]) ? lastQbrDatesByClient[name].slice(0, 10) : null;
      const daysSinceQbr = lastQbrDate ? healthDigestDaysBetween(lastQbrDate, today) : null;
      const renewalNeedsQbr = renewalIsOpen && renewalDays !== null && renewalDays <= 60
        && (lastQbrDate === null || daysSinceQbr > 90);

      const openRevisions = (revisionRecords || []).filter(r =>
        (r.clientName || "").toLowerCase() === name.toLowerCase() && !r.dateResolved
      ).length;
      const heavyRevisions = openRevisions >= 3;

      const budgetPaceClasses = healthDigestBudgetPacingList(client).map(p => healthDigestBudgetPaceClass(p)).filter(Boolean);
      const budgetPace = budgetPaceClasses.includes("pace-danger") ? "pace-danger"
        : budgetPaceClasses.includes("pace-warn") ? "pace-warn"
        : budgetPaceClasses.includes("pace-good") ? "pace-good" : null;
      const overspending = budgetPace === "pace-danger";
      const upsellOpportunity = overspending && healthRating !== "Red";

      const pendingApprovals = Array.isArray(client.pendingApprovals) ? client.pendingApprovals : [];
      const approvalAges = pendingApprovals
        .filter(a => a && a.createdAt)
        .map(a => healthDigestDaysBetween(a.createdAt, today));
      const oldestPendingApprovalDays = approvalAges.length ? Math.max(...approvalAges) : null;
      const staleApproval = oldestPendingApprovalDays !== null && oldestPendingApprovalDays >= HEALTH_DIGEST_STALE_APPROVAL_DAYS;

      const meetingNotes = Array.isArray(client.meetingNotes) ? client.meetingNotes : [];
      const lastMeetingDate = meetingNotes.length
        ? meetingNotes.map(m => m.date).filter(Boolean).sort().slice(-1)[0]
        : null;
      const daysSinceMeeting = lastMeetingDate ? healthDigestDaysBetween(lastMeetingDate, today) : null;
      const staleContact = daysSinceMeeting !== null && daysSinceMeeting >= HEALTH_DIGEST_STALE_CONTACT_DAYS;
      const openActionItems = meetingNotes.reduce((sum, m) =>
        sum + (Array.isArray(m.actionItems) ? m.actionItems.filter(ai => !ai.completed).length : 0), 0);
      const heavyOpenActionItems = openActionItems >= HEALTH_DIGEST_HEAVY_OPEN_ACTION_ITEMS;

      // Overdue invoices - see agency-health-dashboard/js/app.js's
      // identical getOverdueInvoiceInfo.
      const overdueRecords = (contractInvoiceRecords || []).filter(r =>
        (r.clientName || "") === name && r.invoiceStatus === "Overdue"
      );
      const overdueInvoice = overdueRecords.length ? {
        count: overdueRecords.length,
        amount: overdueRecords.reduce((sum, r) => sum + (parseFloat((r.invoiceAmount || "").toString().replace(/[^0-9.-]/g, "")) || 0), 0),
        days: overdueRecords.map(r => r.invoiceDueDate ? healthDigestDaysBetween(r.invoiceDueDate, today) : 0).reduce((max, d) => Math.max(max, d), 0)
      } : null;

      // Client-submitted satisfaction pulse - see agency-health-dashboard/
      // js/app.js's identical lowPulse.
      const pulseHistory = Array.isArray(client.clientPulseFeedback) ? client.clientPulseFeedback : [];
      const latestPulse = pulseHistory.length
        ? pulseHistory.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]
        : null;
      const lowPulse = latestPulse && latestPulse.rating <= 2 && healthDigestDaysBetween(latestPulse.date, today) <= 30;

      // Monthly report staleness - see app.js's identical
      // runReportOverdueNudgeCheck for the full reasoning (only flags
      // clients with at least one prior report on file, to avoid false
      // positives on brand-new clients who haven't hit their first cycle).
      const reportArchive = Array.isArray(client.reportArchive) ? client.reportArchive : [];
      const lastReportDate = reportArchive.length
        ? reportArchive.map(r => r.dateAdded).filter(Boolean).sort().slice(-1)[0]
        : null;
      const daysSinceReport = lastReportDate ? healthDigestDaysBetween(lastReportDate.slice(0, 10), today) : null;
      const reportOverdue = reportArchive.length > 0 && daysSinceReport !== null && daysSinceReport >= 35;

      const needsAttention = healthRating === "Red" || renewalDueSoon || heavyRevisions
        || overspending || staleApproval || heavyOpenActionItems || staleContact
        || !!overdueInvoice || renewalNeedsQbr || !!lowPulse || reportOverdue;

      return {
        name, healthRating, lastCheckinDate, daysSinceCheckin,
        renewalDate, renewalDays, renewalDueSoon, openRevisions, heavyRevisions,
        overspending, upsellOpportunity,
        oldestPendingApprovalDays, staleApproval,
        lastMeetingDate, daysSinceMeeting, staleContact,
        openActionItems, heavyOpenActionItems, needsAttention,
        overdueInvoice, lastQbrDate, daysSinceQbr, renewalNeedsQbr,
        latestPulse, lowPulse, daysSinceReport, reportOverdue
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function healthDigestReasons(row) {
  const reasons = [];
  if (row.healthRating === "Red") reasons.push("Health check-in is Red");
  if (row.renewalDueSoon) reasons.push(`Renewal due in ${row.renewalDays}d (${row.renewalDate})`);
  if (row.heavyRevisions) reasons.push(`${row.openRevisions} open revisions`);
  if (row.overspending) reasons.push("Overspending budget pace");
  if (row.staleApproval) reasons.push(`Approval awaiting response ${row.oldestPendingApprovalDays}d`);
  if (row.heavyOpenActionItems) reasons.push(`${row.openActionItems} open meeting action items`);
  if (row.staleContact) reasons.push(`No contact logged in ${row.daysSinceMeeting}d`);
  if (row.overdueInvoice) reasons.push(`Invoice ${row.overdueInvoice.days}d overdue ($${Math.round(row.overdueInvoice.amount).toLocaleString()})`);
  if (row.renewalNeedsQbr) reasons.push(`Renewal in ${row.renewalDays}d with ${row.lastQbrDate ? `last QBR ${row.daysSinceQbr}d ago` : "no QBR on record"}`);
  if (row.lowPulse) reasons.push(`Low satisfaction rating (${row.latestPulse.rating}/5)`);
  if (row.reportOverdue) reasons.push(`No monthly report added in ${row.daysSinceReport}d`);
  return reasons;
}

function escapeHtmlForDigest(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildHealthDigestEmail(rows) {
  const attention = rows.filter(r => r.needsAttention);
  const upsell = rows.filter(r => r.upsellOpportunity);
  const totalClients = rows.length;

  const subject = attention.length
    ? `Weekly Agency Health Digest — ${attention.length} client${attention.length === 1 ? "" : "s"} need attention`
    : "Weekly Agency Health Digest — all clients on track";

  const summaryLine = totalClients === 0
    ? "No clients in the Hub yet."
    : `${attention.length} of ${totalClients} client${totalClients === 1 ? "" : "s"} need attention this week.`;

  const listItemsHtml = attention.length
    ? attention.map(r => `<li style="margin-bottom:10px;"><strong>${escapeHtmlForDigest(r.name)}</strong> — ${healthDigestReasons(r).map(escapeHtmlForDigest).join("; ")}</li>`).join("")
    : "<li>Nothing flagged this week — every client is on track.</li>";

  const upsellHtml = upsell.length
    ? `<p><strong>💡 Upsell opportunities (overspending, health not Red):</strong> ${upsell.map(r => escapeHtmlForDigest(r.name)).join(", ")}</p>`
    : "";

  const html = `
    <div style="font-family: Arial, sans-serif; color:#1e293b; max-width:600px;">
      <h2 style="margin-bottom:4px;">Weekly Agency Health Digest</h2>
      <p style="color:#64748b; margin-top:0;">${escapeHtmlForDigest(summaryLine)}</p>
      <ul style="padding-left:20px;">${listItemsHtml}</ul>
      ${upsellHtml}
      <p style="font-size:12px; color:#94a3b8; margin-top:24px;">Generated automatically from the same data as Agency Health Dashboard in the Hub. Open the Hub → Agency Health Dashboard for the full live view and to filter/search.</p>
    </div>
  `;

  const textLines = ["WEEKLY AGENCY HEALTH DIGEST", summaryLine, ""];
  if (attention.length) {
    attention.forEach(r => textLines.push(`- ${r.name}: ${healthDigestReasons(r).join("; ")}`));
  } else {
    textLines.push("Nothing flagged this week - every client is on track.");
  }
  if (upsell.length) {
    textLines.push("");
    textLines.push("Upsell opportunities (overspending, health not Red): " + upsell.map(r => r.name).join(", "));
  }
  textLines.push("", "Open the Hub -> Agency Health Dashboard for the full live view.");

  return { subject, html, text: textLines.join("\n") };
}

async function sendHealthDigestEmail(env, recipients, subject, html, text) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Server missing RESEND_API_KEY secret");
  const body = {
    from: `Revital Productions <hello@${SEND_EMAIL_DOMAIN}>`,
    to: recipients,
    subject,
    text
  };
  if (html) body.html = html;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Resend API error (${res.status})`);
  return data;
}

async function runWeeklyHealthDigest(env) {
  const recipients = (env.HEALTH_DIGEST_RECIPIENTS || "admin@revitalproductions.com")
    .split(",").map(s => s.trim()).filter(Boolean);

  try {
    const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
    const [clients, revisionRecords, contractInvoiceRecords, lastQbrDatesByClient] = await Promise.all([
      fetchAllClientsFromFirestore(accessToken, projectId),
      fetchRevisionRecords(accessToken, projectId),
      firestoreListCollection(accessToken, projectId, "contractInvoiceRecords").catch(e => {
        console.warn("Digest: couldn't load contractInvoiceRecords, skipping overdue-invoice signal:", e);
        return [];
      }),
      fetchLastQbrDatesByClient(accessToken, projectId).catch(e => {
        console.warn("Digest: couldn't load adminActivityLog, skipping QBR-due signal:", e);
        return {};
      })
    ]);
    const rows = buildHealthDigestRows(clients, revisionRecords, contractInvoiceRecords, lastQbrDatesByClient);
    const { subject, html, text } = buildHealthDigestEmail(rows);
    await sendHealthDigestEmail(env, recipients, subject, html, text);
  } catch (e) {
    console.error("Weekly health digest failed:", e);
    // Best-effort failure alert, so a broken digest doesn't just go quiet
    // forever with nobody noticing - if this second send also fails
    // (e.g. RESEND_API_KEY itself is the problem), give up silently;
    // it's already in the Worker's own logs via the console.error above.
    try {
      await sendHealthDigestEmail(
        env, recipients,
        "Weekly Agency Health Digest failed to generate",
        undefined,
        `The weekly Agency Health Digest failed to run: ${e.message}\n\nCheck the Worker's logs (wrangler tail, or Cloudflare dashboard -> Workers & Pages -> this Worker -> Logs) for the full error.`
      );
    } catch (e2) {
      console.error("Also failed to send the digest-failure alert:", e2);
    }
  }
}

// ── Shared RS256 JWT-signing helpers (used by the Firebase custom token
// minter, the Docusign JWT Grant, and the Weekly Agency Health Digest
// above) ──
function base64url(bytes) {
  let binary = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64urlStr(str) {
  return base64url(new TextEncoder().encode(str));
}

async function createFirebaseCustomToken(serviceAccount, email) {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid: "admin",
    claims: { email, admin: true }
  };

  const unsigned = `${base64urlStr(JSON.stringify(header))}.${base64urlStr(JSON.stringify(payload))}`;

  const key = await importPrivateKeyFlexible(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned)
  );

  return `${unsigned}.${base64url(signature)}`;
}

// Imports a PEM RSA private key for RS256 signing. Accepts either PKCS8
// ("-----BEGIN PRIVATE KEY-----", what Firebase service account keys use)
// or traditional PKCS1 ("-----BEGIN RSA PRIVATE KEY-----", the format
// Docusign's "Generate RSA" button produces) - Web Crypto's importKey
// only understands PKCS8, so a PKCS1 key gets wrapped in the small fixed
// DER header that turns it into a valid PKCS8 PrivateKeyInfo first.
// (Verified against OpenSSL's own `pkcs8 -topk8` conversion - byte-for-byte
// identical DER output.)
async function importPrivateKeyFlexible(pem) {
  const isPkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");
  const label = isPkcs1 ? "RSA PRIVATE KEY" : "PRIVATE KEY";
  const pemBody = pem
    .replace(`-----BEGIN ${label}-----`, "")
    .replace(`-----END ${label}-----`, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const pkcs8Der = isPkcs1 ? pkcs1ToPkcs8Der(der) : der;

  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8Der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function derLengthBytes(len) {
  if (len < 128) return new Uint8Array([len]);
  const bytes = [];
  let n = len;
  while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}
function concatBytes(...arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}
function derSeq(tag, contentBuf) {
  return concatBytes(new Uint8Array([tag]), derLengthBytes(contentBuf.length), contentBuf);
}
// Wraps a raw PKCS1 RSAPrivateKey DER blob in the minimal PKCS8
// PrivateKeyInfo structure (version 0 + rsaEncryption AlgorithmIdentifier
// + the PKCS1 bytes as an OCTET STRING) so Web Crypto's PKCS8-only
// importKey can load it.
function pkcs1ToPkcs8Der(pkcs1Der) {
  const version = new Uint8Array([0x02, 0x01, 0x00]); // INTEGER 0
  const algIdContent = concatBytes(
    new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]), // OID 1.2.840.113549.1.1.1 (rsaEncryption)
    new Uint8Array([0x05, 0x00]) // NULL params
  );
  const algId = derSeq(0x30, algIdContent);
  const privateKeyOctetString = derSeq(0x04, pkcs1Der);
  const inner = concatBytes(version, algId, privateKeyOctetString);
  return derSeq(0x30, inner);
}
