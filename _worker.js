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

    if (url.pathname === "/api/docusign/send-envelope") {
      return handleDocusignSendEnvelope(request, env);
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

  const { templateId, templateRoleName, signerName, signerEmail, emailSubject, documents } = payload || {};
  if (!signerName || !signerEmail) {
    return jsonResponse({ error: "signerName and signerEmail are required" }, 400);
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
            dateSignedTabs: [{ anchorString: "[[DATE_CLIENT]]", anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "-6", anchorIgnoreIfNotPresent: "true" }]
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

// ── Shared RS256 JWT-signing helpers (used by both the Firebase custom
// token minter above and the Docusign JWT Grant above) ──
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
