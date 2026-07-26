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

  await env.CONTRACTS_BUCKET.delete(key);
  return jsonResponse({ success: true }, 200, { "Cache-Control": "no-store" });
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders }
  });
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

  const encoder = new TextEncoder();

  const base64url = (bytes) => {
    let binary = "";
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const base64urlStr = (str) => base64url(encoder.encode(str));

  const unsigned = `${base64urlStr(JSON.stringify(header))}.${base64urlStr(JSON.stringify(payload))}`;

  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    encoder.encode(unsigned)
  );

  return `${unsigned}.${base64url(signature)}`;
}

async function importPrivateKey(pem) {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}
