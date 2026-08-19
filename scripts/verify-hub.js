#!/usr/bin/env node
/* ============================================================
   VERIFY HUB — static-analysis smoke test
   ============================================================
   Run before every deploy: `node scripts/verify-hub.js`

   Why this exists: the Hub is ~40k lines of hand-maintained
   JavaScript across 60+ tool folders, with no automated tests and no
   CI. A headless-browser smoke test (load every tool, watch for
   console errors) isn't possible in this sandbox - no sudo/apt
   access, so Playwright/Puppeteer can't install their system
   dependencies. This is the next best thing: a static analysis that
   catches the failure modes that have actually happened in this
   codebase before, without needing a browser:

     1. SYNTAX ERRORS       - every .js file must parse.
     2. UNWIRED TOOLS       - every tool folder (has an index.html)
                              must be registered in app.js's iframe
                              wiring, or be on the known-exception
                              list (e.g. the client-facing portal,
                              which isn't an admin nav tab at all).
                              This is exactly the bug class fixed in
                              the "6 tools with hardcoded iframe src"
                              commit - a tool that's never wired in
                              silently never refreshes on client
                              switch.
     3. DEAD REFERENCES     - every setIframeAbsoluteSrc(...) call in
                              app.js must point at a folder that
                              actually exists on disk.
     4. DISPATCH COVERAGE   - every <section id="tab-X"> in index.html
                              that contains an <iframe> must have a
                              matching `case "tab-X":` in
                              refreshIframeTab()'s switch statement in
                              app.js, and vice versa. This is the exact
                              bug class from the "6 tools with hardcoded
                              iframe src" fix, checked directly instead
                              of relying on a manual audit next time: a
                              section can exist with no case (found
                              exactly this way originally), or a case
                              can reference a section id that doesn't
                              exist (typo/renamed tab, dead code).
     5. UNGUARDED WRITES    - (advisory only) tools that call a raw
                              Firestore setDoc-style write without
                              going through saveVersionedAgencyDoc.
                              Some of these are legitimate (sharded
                              docs like sop-wiki/clientsDb do their
                              own inline version-guard), so this is a
                              list to review, not a hard failure.
     6. UNKNOWN ELEMENT IDS - (advisory only) a tool's js calling
                              el('someId')/getElementById('someId')
                              for an id that doesn't exist anywhere in
                              that tool's own index.html. Can false-
                              positive on dynamically-created ids, so
                              also advisory.
     7. UNVERSIONED ASSETS  - every local <script src> and <link
                              rel="stylesheet" href> across every tool
                              must carry a ?v=N query string. This
                              stopped being just a style convention in
                              Aug 2026, when _headers switched local
                              .js/.css files to
                              "Cache-Control: public, max-age=31536000,
                              immutable" specifically because every
                              reference was (at the time) confirmed
                              versioned - an un-versioned reference
                              under that policy means a future fix to
                              that file can get stuck cached in a
                              returning admin's browser indefinitely,
                              which is exactly the silent-staleness bug
                              class the ?v=N convention exists to
                              prevent. Real failure, not advisory.

   Exit code is non-zero only for categories 1-4 and 7 (real bugs). 5
   and 6 print but never fail the run.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Folders that legitimately have an index.html but are NOT admin nav
// tabs wired through app.js's setIframeAbsoluteSrc/switch-case system,
// so they're expected to be "unwired" by design - add to this list
// (with a reason) rather than letting them silently fail the check.
const KNOWN_NON_TAB_TOOLS = {
  'portal': 'The client-facing public portal itself (served directly to clients, not an admin nav tab).',
  'booking': 'Public prospect booking page, reached at book.<domain> (outside Cloudflare Access), not an admin nav tab.',
  'billing-success': 'Stripe Checkout success_url redirect target, reached at book.<domain>/billing-success/ (outside Cloudflare Access), not an admin nav tab.',
  'billing-canceled': 'Stripe Checkout cancel_url redirect target, reached at book.<domain>/billing-canceled/ (outside Cloudflare Access), not an admin nav tab.',
  'contractor-portal': 'Contractor-facing magic-link portal (served directly to contractors via /contractor-portal/?t=<token>, outside Cloudflare Access), not an admin nav tab.',
  'privacy-policy': 'Public Privacy Policy page for the Financial Center QuickBooks integration, reached at book.<domain>/privacy-policy/ (outside Cloudflare Access) so Intuit can verify it, not an admin nav tab.',
  'eula': 'Public End-User License Agreement page for the Financial Center QuickBooks integration, reached at book.<domain>/eula/ (outside Cloudflare Access) so Intuit can verify it, not an admin nav tab.',
};

let failures = 0;
let advisories = 0;

function fail(msg) {
  console.error('✗ ' + msg);
  failures++;
}
function warn(msg) {
  console.warn('⚠ ' + msg);
  advisories++;
}
function ok(msg) {
  console.log('✓ ' + msg);
}

function walkJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'scripts') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(full, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

// ── 1. Syntax check every JS file ──
function checkSyntax() {
  console.log('\n── Syntax check ──');
  const files = walkJsFiles(ROOT);
  let bad = 0;
  files.forEach(f => {
    try {
      execFileSync('node', ['--check', f], { stdio: 'pipe' });
    } catch (e) {
      fail(`Syntax error in ${path.relative(ROOT, f)}:\n${e.stderr.toString().trim()}`);
      bad++;
    }
  });
  if (bad === 0) ok(`${files.length} JS files parsed cleanly.`);
}

// ── 2 & 3. Tool wiring: every tool folder registered, every reference resolves ──
function checkToolWiring() {
  console.log('\n── Tool wiring (nav + iframe reload) ──');
  const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

  // Every top-level folder with an index.html is a candidate "tool".
  const toolFolders = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(name => fs.existsSync(path.join(ROOT, name, 'index.html')));

  // Every setIframeAbsoluteSrc(..., "path...") reference in app.js. Most
  // point at "folder/index.html" (optionally with a ?v= query string),
  // but a few (competitor-analysis) point directly at a named .html file
  // instead of a folder's index.html - so this keeps both the raw path
  // (for existence checks) and just the leading folder segment (for the
  // "is this tool folder wired at all" check) rather than assuming every
  // reference follows the folder/index.html convention.
  const rawRefs = [...appJs.matchAll(/setIframeAbsoluteSrc\([^,]+,\s*"([^"]+)"/g)].map(m => m[1]);
  const wiredFolders = new Set(rawRefs.map(r => r.split('/')[0]));

  let unwired = 0;
  toolFolders.forEach(name => {
    if (wiredFolders.has(name)) return;
    if (KNOWN_NON_TAB_TOOLS[name]) return;
    fail(`"${name}" has an index.html but isn't wired via setIframeAbsoluteSrc in app.js, and isn't on the known-exception list. If this is intentional, add it to KNOWN_NON_TAB_TOOLS with a reason; otherwise it will never refresh on client switch.`);
    unwired++;
  });
  if (unwired === 0) ok(`All ${toolFolders.length} tool folders are either wired in or explicitly exempted.`);

  // Dead references: the exact wired path (query string stripped) must
  // exist on disk, whatever form it takes.
  let dead = 0;
  [...new Set(rawRefs)].forEach(raw => {
    const withoutQuery = raw.split('?')[0];
    if (!fs.existsSync(path.join(ROOT, withoutQuery))) {
      fail(`app.js wires "${raw}" via setIframeAbsoluteSrc, but "${withoutQuery}" doesn't exist on disk.`);
      dead++;
    }
  });
  if (dead === 0) ok(`All ${new Set(rawRefs).size} setIframeAbsoluteSrc references resolve to a real file.`);
}

// ── 4. Iframe dispatch coverage ──
function checkIframeDispatchCoverage() {
  console.log('\n── Iframe dispatch coverage ──');
  const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  // Scope the case-label scan to refreshIframeTab() specifically, not the
  // whole file, in case some other switch statement elsewhere ever uses a
  // "tab-..." string as a case value for an unrelated reason.
  const dispatchFnMatch = appJs.match(/function refreshIframeTab\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  const dispatchBody = dispatchFnMatch ? dispatchFnMatch[1] : '';
  if (!dispatchFnMatch) {
    warn('Could not locate function refreshIframeTab() in app.js to check dispatch coverage - skipping this check (app.js may have been restructured; update the regex in verify-hub.js if so).');
    return;
  }
  const dispatchedTabs = new Set([...dispatchBody.matchAll(/case\s+"(tab-[\w-]+)"\s*:/g)].map(m => m[1]));

  // Every <section id="tab-X" ...> ... </section> block that contains an
  // <iframe> anywhere inside it - non-greedy per-section, then check for
  // "<iframe" within that slice only.
  const sectionBlocks = [...indexHtml.matchAll(/<section\s+id="(tab-[\w-]+)"[^>]*>([\s\S]*?)<\/section>/g)];
  const iframeSections = sectionBlocks.filter(([, , body]) => /<iframe/.test(body)).map(([, id]) => id);

  let missingCase = 0;
  iframeSections.forEach(id => {
    if (!dispatchedTabs.has(id)) {
      fail(`<section id="${id}"> in index.html contains an <iframe> but has no matching case "${id}": in refreshIframeTab()'s switch statement - it will never refresh when the active client changes. (This is exactly the bug fixed for 6 tools earlier - add a case + render function using setIframeAbsoluteSrc, same pattern as its neighbors.)`);
      missingCase++;
    }
  });
  if (missingCase === 0) ok(`All ${iframeSections.length} iframe-based tab-sections have a matching dispatch case.`);

  // Reverse direction: a case that dispatches a tab id with no matching
  // section in index.html is dead code (renamed/removed tab, leftover).
  const sectionIds = new Set(sectionBlocks.map(([, id]) => id));
  let deadCase = 0;
  dispatchedTabs.forEach(id => {
    if (!sectionIds.has(id)) {
      warn(`refreshIframeTab() has a case for "${id}" but no <section id="${id}"> exists in index.html - likely dead code from a renamed or removed tab.`);
      deadCase++;
    }
  });
  if (deadCase === 0) ok(`All ${dispatchedTabs.size} dispatch cases correspond to a real section.`);
}

// ── 5. Advisory: unguarded direct Firestore writes ──
function checkUnguardedWrites() {
  console.log('\n── Unguarded writes (advisory) ──');
  const jsFiles = walkJsFiles(ROOT).filter(f => f.includes(`${path.sep}js${path.sep}app.js`));
  let flagged = 0;
  // Investigated Aug 2026 (hours-tracker and resource-booking-calendar
  // were the only two flagging at the time): both write to a PER-ENTITY
  // Firestore doc built from a get*DocRef(id)-style helper (one doc per
  // hours-log entry / per booking, e.g. getEntryDocRef(id),
  // getBookingDocRef(booking.id)) rather than one shared doc the whole
  // tool overwrites - the same inherently-safe pattern
  // contractInvoiceRecords already uses (confirmed safe elsewhere in this
  // codebase without needing saveVersionedAgencyDoc's optimistic-
  // concurrency check, since two saves can only ever race on the exact
  // same entity's own doc, not clobber unrelated entities the way a
  // whole-doc overwrite could). Recognize that pattern here too so this
  // advisory stops re-flagging an already-confirmed-safe design on every
  // run - a file with a *DocRef(id) helper feeding the write call is
  // exempted; anything else still gets flagged for a human to check.
  const perEntityDocRefPattern = /firebaseSetDocFromJSON\s*\(\s*get\w*DocRef\s*\(\s*\w/;
  jsFiles.forEach(f => {
    const src = fs.readFileSync(f, 'utf8');
    const usesVersionedHelper = /saveVersionedAgencyDoc/.test(src);
    const hasDirectWrite = /firebaseSetDocFromJSON\s*\(|\bsetDoc\s*\(/.test(src);
    const usesPerEntityDocRef = perEntityDocRefPattern.test(src);
    if (hasDirectWrite && !usesVersionedHelper && !usesPerEntityDocRef) {
      warn(`${path.relative(ROOT, f)} calls a direct Firestore write but never calls saveVersionedAgencyDoc - confirm it has its own version-guard (e.g. a sharded doc) or is otherwise safe.`);
      flagged++;
    }
  });
  if (flagged === 0) ok('No tool js/app.js files write directly without going through the shared version-guard helper.');
}

// ── 6. Advisory: element ids referenced in JS but missing from that tool's HTML ──
function checkElementIds() {
  console.log('\n── Element ID sanity (advisory) ──');
  const jsFiles = walkJsFiles(ROOT).filter(f => f.includes(`${path.sep}js${path.sep}app.js`));
  let flaggedFiles = 0;
  jsFiles.forEach(f => {
    const toolDir = path.dirname(path.dirname(f)); // .../<tool>/js/app.js -> .../<tool>
    const htmlPath = path.join(toolDir, 'index.html');
    if (!fs.existsSync(htmlPath)) return;
    const js = fs.readFileSync(f, 'utf8');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const htmlIds = new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map(m => m[1]));
    // Confirmed by hand across every tool this flagged (team-roster,
    // testimonial-tracker, timeline-scheduler, email-template-library,
    // sop-wiki): all were false positives, not dead code - a real, common
    // pattern in this codebase is building markup dynamically
    // (container.innerHTML = `...id="x"...`) and wiring listeners
    // immediately after inserting it, so the id only ever exists in the
    // JS file's own template literals, never in the static index.html.
    // Also covers the ensureToastContainer() idiom (container.id = 'x'
    // as a property assignment rather than an HTML attribute string).
    // Scanning the JS file's own source for both forms means an id that's
    // only ever defined dynamically no longer gets flagged as missing.
    const jsDefinedIds = new Set([
      ...[...js.matchAll(/\bid=["']([\w-]+)["']/g)].map(m => m[1]),
      ...[...js.matchAll(/\.id\s*=\s*["']([\w-]+)["']/g)].map(m => m[1]),
    ]);
    const knownIds = new Set([...htmlIds, ...jsDefinedIds]);
    const referenced = new Set([
      ...[...js.matchAll(/\bel\(\s*['"]([\w-]+)['"]\s*\)/g)].map(m => m[1]),
      ...[...js.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)].map(m => m[1]),
    ]);
    const missing = [...referenced].filter(id => !knownIds.has(id));
    if (missing.length) {
      warn(`${path.relative(ROOT, f)} references id(s) not found in its own index.html or its own dynamically-built markup: ${missing.join(', ')} (may still be a false positive if read from a shared/parent page).`);
      flaggedFiles++;
    }
  });
  if (flaggedFiles === 0) ok('Every el()/getElementById() reference resolves to an id in the same tool\'s HTML.');
}

// ── 7. Every local script/stylesheet reference must carry a ?v=N ──
function checkVersionTags() {
  console.log('\n── Static asset cache-bust coverage ──');
  const htmlFiles = [];
  (function walkHtml(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'scripts') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkHtml(full);
      else if (entry.name.endsWith('.html')) htmlFiles.push(full);
    }
  })(ROOT);

  let missing = 0;
  htmlFiles.forEach(f => {
    const html = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f);

    [...html.matchAll(/<script[^>]*?\ssrc=["']([^"']+)["']/g)].forEach(m => {
      const src = m[1];
      if (src.startsWith('http')) return; // external CDN scripts aren't ours to cache-bust
      if (!src.includes('?v=')) {
        fail(`${rel} loads "${src}" with no ?v=N cache-bust query string - under the current immutable-caching policy for .js/.css (see _headers), this file can get stuck cached forever in a returning admin's browser after a future fix. Add ?v=1 (or bump if this is a re-add).`);
        missing++;
      }
    });

    [...html.matchAll(/<link\b[^>]*>/g)].forEach(m => {
      const tag = m[0];
      if (!/rel=["']stylesheet["']/.test(tag)) return;
      const hrefMatch = tag.match(/href=["']([^"']+)["']/);
      if (!hrefMatch) return;
      const href = hrefMatch[1];
      if (href.startsWith('http')) return;
      if (!href.includes('?v=')) {
        fail(`${rel} loads stylesheet "${href}" with no ?v=N cache-bust query string - same staleness risk as the script case above. Add ?v=1 (or bump if this is a re-add).`);
        missing++;
      }
    });
  });
  if (missing === 0) ok(`Every local <script src> and <link rel="stylesheet"> across ${htmlFiles.length} HTML files carries a ?v=N cache-bust query string.`);
}

checkSyntax();
checkToolWiring();
checkIframeDispatchCoverage();
checkUnguardedWrites();
checkElementIds();
checkVersionTags();

console.log(`\n${'─'.repeat(50)}`);
console.log(`${failures} failure(s), ${advisories} advisory warning(s).`);
if (failures > 0) {
  console.log('FAILED - fix the ✗ items above before deploying.');
  process.exit(1);
} else {
  console.log('PASSED - safe to deploy (review any ⚠ advisories at your convenience).');
  process.exit(0);
}
