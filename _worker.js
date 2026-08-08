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

    if (url.pathname === "/api/pipeline/sync-clickup" && request.method === "POST") {
      return handlePipelineSyncClickUp(request, env);
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
    return jsonResponse({ token }, 200, { "Cache-Control": "no-store" });
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
//      and clicking Allow.
//   3. Set four secrets:
//        wrangler secret put DOCUSIGN_INTEGRATION_KEY
//        wrangler secret put DOCUSIGN_USER_ID          (API Username GUID, not the Account ID)
//        wrangler secret put DOCUSIGN_ACCOUNT_ID
//        wrangler secret put DOCUSIGN_PRIVATE_KEY      (the RSA private key from step 1, full PEM)
//
// NOTE: hardcoded to the sandbox/demo endpoints (account-d.docusign.com /
// demo.docusign.net). Going to production means switching both hosts to
// account.docusign.com and fetching the real per-account base_uri from
// account.docusign.com/oauth/userinfo instead of assuming demo.docusign.net -
// production accounts live on different regional hosts.
const DOCUSIGN_AUTH_HOST = "account-d.docusign.com";
const DOCUSIGN_API_BASE = "https://demo.docusign.net/restapi/v2.1";

async function createDocusignJWT(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: env.DOCUSIGN_INTEGRATION_KEY,
    sub: env.DOCUSIGN_USER_ID,
    aud: DOCUSIGN_AUTH_HOST,
    iat: now,
    exp: now + 3600,
    scope: "signature impersonation"
  };

  const unsigned = `${base64urlStr(JSON.stringify(header))}.${base64urlStr(JSON.stringify(payload))}`;
  const key = await importPrivateKeyFlexible(env.DOCUSIGN_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64url(signature)}`;
}

async function getDocusignAccessToken(env) {
  const assertion = await createDocusignJWT(env);
  const res = await fetch(`https://${DOCUSIGN_AUTH_HOST}/oauth/token`, {
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
      msg += " - consent hasn't been granted yet; see the one-time consent URL in this file's header comment.";
    }
    throw new Error(msg);
  }
  return data.access_token;
}

async function handleDocusignSendEnvelope(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!isContractRequestAuthorized(request)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  if (!env.DOCUSIGN_INTEGRATION_KEY || !env.DOCUSIGN_USER_ID || !env.DOCUSIGN_PRIVATE_KEY || !env.DOCUSIGN_ACCOUNT_ID) {
    return jsonResponse({ error: "Server missing Docusign secrets - set DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID, and DOCUSIGN_PRIVATE_KEY" }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
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

  let accessToken;
  try {
    accessToken = await getDocusignAccessToken(env);
  } catch (e) {
    console.error("Docusign authentication failed:", e);
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
    const dsRes = await fetch(`${DOCUSIGN_API_BASE}/accounts/${env.DOCUSIGN_ACCOUNT_ID}/envelopes`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(envelopeBody)
    });
    const dsData = await dsRes.json().catch(() => ({}));

    if (!dsRes.ok) {
      console.error("Docusign envelope creation failed:", dsRes.status, dsData);
      return jsonResponse({ error: dsData.message || "Docusign API error", details: dsData }, 502);
    }

    return jsonResponse({ success: true, envelopeId: dsData.envelopeId, status: dsData.status }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    console.error("Docusign envelope request failed:", e);
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
// Bookable team members. id is used internally by the API/page, name and
// title are shown to the prospect, email is the real Google Workspace
// mailbox the hub-calendar-booking service account impersonates (via
// domain-wide delegation - see getGoogleAccessTokenForUser below) to
// check availability and create the event. There's no admin UI for this
// list yet - add a person here and redeploy when the roster changes.
const BOOKING_ROSTER = [
  { id: "ronald", name: "Ronald", title: "Founder", email: "admin@revitalproductions.com" }
];

const BOOKING_TIMEZONE = "America/New_York"; // business hours below are in this zone; change if the team isn't Eastern
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
// address, since this is reachable by anyone on the internet.
async function handleBookingRoster(request, env) {
  return jsonResponse({ roster: BOOKING_ROSTER.map(({ id, name, title }) => ({ id, name, title })) });
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

// Resolves "who is this booking for" from either the static prospect
// roster (?personId=) or a live-verified account manager (?amEmail=),
// used by both the availability and create handlers below so the two
// entry points (public prospect booking vs. client-portal AM booking)
// stay in sync.
async function resolveBookingTarget(env, { personId, amEmail }) {
  if (personId) {
    const person = BOOKING_ROSTER.find(p => p.id === personId);
    return person ? { email: person.email, name: person.name } : null;
  }
  if (amEmail) {
    return await findAccountManagerByEmail(env, amEmail);
  }
  return null;
}

// ── GET /api/booking/availability?personId=...  or  ?amEmail=... ──
// Public. Queries that person's real Google Calendar via freeBusy.query
// (impersonated through domain-wide delegation) and returns open
// BOOKING_SLOT_MINUTES-long slots across the next BOOKING_LOOKAHEAD_DAYS
// days, business hours only, weekends excluded.
async function handleBookingAvailability(request, env) {
  const url = new URL(request.url);
  const person = await resolveBookingTarget(env, {
    personId: url.searchParams.get("personId"),
    amEmail: url.searchParams.get("amEmail")
  });
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

  return jsonResponse({ personName: person.name, timezone: BOOKING_TIMEZONE, slotMinutes: BOOKING_SLOT_MINUTES, slotsByDay });
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

  const { personId, amEmail, startISO, name, email, company, notes } = payload || {};
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

async function handlePipelineSyncClickUp(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!accessEmail || !accessEmail.toLowerCase().endsWith("@" + ADMIN_EMAIL_DOMAIN)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  const apiToken = env.CLICKUP_API_TOKEN;
  if (!apiToken) return jsonResponse({ error: "Server missing CLICKUP_API_TOKEN secret" }, 500);

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { taskId, name, stage, contactEmail, source, notes } = payload || {};
  if (!name || !stage) return jsonResponse({ error: "name and stage are required" }, 400);

  const descriptionParts = [];
  if (contactEmail) descriptionParts.push(`**Contact:** ${contactEmail}`);
  if (source) descriptionParts.push(`**Source:** ${source}`);
  if (notes) descriptionParts.push(`**Notes:**\n${notes}`);
  descriptionParts.push(`_Synced from the Hub's Sales Pipeline Board - edits here won't flow back._`);
  const markdown_description = descriptionParts.join("\n\n");

  try {
    if (taskId) {
      const res = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`, {
        method: "PUT",
        headers: { Authorization: apiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ name, status: stage, markdown_description })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.err || `ClickUp update failed (${res.status})`);
      return jsonResponse({ ok: true, taskId: data.id || taskId });
    } else {
      const res = await fetch(`https://api.clickup.com/api/v2/list/${CLICKUP_SALES_PIPELINE_LIST_ID}/task`, {
        method: "POST",
        headers: { Authorization: apiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ name, status: stage, markdown_description })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.err || `ClickUp create failed (${res.status})`);
      return jsonResponse({ ok: true, taskId: data.id });
    }
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
// routes). Creates a Stripe Checkout Session in subscription mode with
// an inline dynamic price (price_data) rather than requiring a
// pre-created Stripe Price object per possible dollar amount - agency
// retainers are bespoke per client, so a fixed catalog of Prices
// doesn't fit. Returns the hosted checkout URL to send the client.
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
  const { recordId, clientName, monthlyAmount, clientEmail, mode } = payload || {};
  const billingMode = mode === "live" ? "live" : "test";
  if (!recordId || !clientName || !monthlyAmount) {
    return jsonResponse({ error: "recordId, clientName, and monthlyAmount are required" }, 400);
  }
  const amountCents = Math.round(Number(monthlyAmount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return jsonResponse({ error: "monthlyAmount must be a positive number" }, 400);
  }

  const params = new URLSearchParams();
  params.append("mode", "subscription");
  params.append("line_items[0][price_data][currency]", "usd");
  params.append("line_items[0][price_data][product_data][name]", `${clientName} - Monthly Retainer`);
  params.append("line_items[0][price_data][recurring][interval]", "month");
  params.append("line_items[0][price_data][unit_amount]", String(amountCents));
  params.append("line_items[0][quantity]", "1");
  params.append("success_url", "https://book.revitalproductions.com/billing-success/");
  params.append("cancel_url", "https://book.revitalproductions.com/billing-canceled/");
  params.append("metadata[hubRecordId]", recordId);
  params.append("metadata[hubClientName]", clientName);
  params.append("metadata[hubMode]", billingMode);
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
// record's recurringBilling sub-object. Reads the whole agency/
// contractInvoices doc, mutates just the one matching record, writes
// the whole list back - same overwrite shape the Tracker's own
// saveVersionedAgencyDoc uses, but without that same optimistic-
// concurrency retry (a genuine small race window against a human
// editing the Tracker at the exact same instant a webhook lands, judged
// acceptable given how infrequent both events are - flagging here
// rather than pretending it's impossible).
async function applyStripeEventToContractInvoices(env, event, billingMode) {
  const relevantTypes = ["checkout.session.completed", "invoice.paid", "invoice.payment_failed", "customer.subscription.deleted"];
  if (!relevantTypes.includes(event.type)) return;

  const { accessToken, projectId } = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
  const doc = await firestoreGetDoc(accessToken, projectId, "agency/contractInvoices");
  const list = (doc && doc.list) || [];
  const version = (doc && doc.version) || 0;

  const obj = event.data.object;
  let record = null;

  if (event.type === "checkout.session.completed") {
    const recordId = obj.metadata && obj.metadata.hubRecordId;
    record = list.find(r => r.id === recordId);
    if (record) {
      record.recurringBilling = record.recurringBilling || {};
      record.recurringBilling.stripeCustomerId = obj.customer || null;
      record.recurringBilling.stripeSubscriptionId = obj.subscription || null;
      record.recurringBilling.status = "active";
      record.recurringBilling.mode = billingMode;
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

  await firestoreSetDoc(accessToken, projectId, "agency/contractInvoices", { list, version: version + 1 });

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
      // Sent to the invoice@ alias (forwards to admin@'s inbox) rather than
      // admin@ directly, so billing failure alerts land under a
      // filterable/labelable "to" address instead of mixing into the
      // general admin inbox undifferentiated.
      await sendHealthDigestEmail(env, ["invoice@revitalproductions.com"], subject, html, text);
    } catch (notifyErr) {
      console.error("Failed-payment alert email failed (billing status update itself still succeeded):", notifyErr);
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

async function fetchRevisionRecords(accessToken, projectId) {
  const doc = await firestoreGetDoc(accessToken, projectId, "agency/revisionFeedbackLog");
  return doc && Array.isArray(doc.list) ? doc.list : [];
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

// Faithful port of agency-health-dashboard/js/app.js's buildRows() - see
// that file for the fuller reasoning behind each threshold/signal. Any
// change to what counts as "needs attention" there should be mirrored
// here (and vice versa) so the two never quietly disagree.
function buildHealthDigestRows(clients, revisionRecords) {
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

      const openRevisions = (revisionRecords || []).filter(r =>
        (r.clientName || "").toLowerCase() === name.toLowerCase() && !r.dateResolved
      ).length;
      const heavyRevisions = openRevisions >= 3;

      const budgetPace = healthDigestBudgetPaceClass(client.budgetPacing);
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

      const needsAttention = healthRating === "Red" || renewalDueSoon || heavyRevisions
        || overspending || staleApproval || heavyOpenActionItems || staleContact;

      return {
        name, healthRating, lastCheckinDate, daysSinceCheckin,
        renewalDate, renewalDays, renewalDueSoon, openRevisions, heavyRevisions,
        overspending, upsellOpportunity,
        oldestPendingApprovalDays, staleApproval,
        lastMeetingDate, daysSinceMeeting, staleContact,
        openActionItems, heavyOpenActionItems, needsAttention
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
    const [clients, revisionRecords] = await Promise.all([
      fetchAllClientsFromFirestore(accessToken, projectId),
      fetchRevisionRecords(accessToken, projectId)
    ]);
    const rows = buildHealthDigestRows(clients, revisionRecords);
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
