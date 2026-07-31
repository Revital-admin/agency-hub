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
     4. UNGUARDED WRITES    - (advisory only) tools that call a raw
                              Firestore setDoc-style write without
                              going through saveVersionedAgencyDoc.
                              Some of these are legitimate (sharded
                              docs like sop-wiki/clientsDb do their
                              own inline version-guard), so this is a
                              list to review, not a hard failure.
     5. UNKNOWN ELEMENT IDS - (advisory only) a tool's js calling
                              el('someId')/getElementById('someId')
                              for an id that doesn't exist anywhere in
                              that tool's own index.html. Can false-
                              positive on dynamically-created ids, so
                              also advisory.

   Exit code is non-zero only for categories 1-3 (real bugs). 4 and 5
   print but never fail the run.
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

// ── 4. Advisory: unguarded direct Firestore writes ──
function checkUnguardedWrites() {
  console.log('\n── Unguarded writes (advisory) ──');
  const jsFiles = walkJsFiles(ROOT).filter(f => f.includes(`${path.sep}js${path.sep}app.js`));
  let flagged = 0;
  jsFiles.forEach(f => {
    const src = fs.readFileSync(f, 'utf8');
    const usesVersionedHelper = /saveVersionedAgencyDoc/.test(src);
    const hasDirectWrite = /firebaseSetDocFromJSON\s*\(|\bsetDoc\s*\(/.test(src);
    if (hasDirectWrite && !usesVersionedHelper) {
      warn(`${path.relative(ROOT, f)} calls a direct Firestore write but never calls saveVersionedAgencyDoc - confirm it has its own version-guard (e.g. a sharded doc) or is otherwise safe.`);
      flagged++;
    }
  });
  if (flagged === 0) ok('No tool js/app.js files write directly without going through the shared version-guard helper.');
}

// ── 5. Advisory: element ids referenced in JS but missing from that tool's HTML ──
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
    const referenced = new Set([
      ...[...js.matchAll(/\bel\(\s*['"]([\w-]+)['"]\s*\)/g)].map(m => m[1]),
      ...[...js.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)].map(m => m[1]),
    ]);
    const missing = [...referenced].filter(id => !htmlIds.has(id));
    if (missing.length) {
      warn(`${path.relative(ROOT, f)} references id(s) not found in its own index.html: ${missing.join(', ')} (may be a false positive if built dynamically or read from a shared/parent page).`);
      flaggedFiles++;
    }
  });
  if (flaggedFiles === 0) ok('Every el()/getElementById() reference resolves to an id in the same tool\'s HTML.');
}

checkSyntax();
checkToolWiring();
checkUnguardedWrites();
checkElementIds();

console.log(`\n${'─'.repeat(50)}`);
console.log(`${failures} failure(s), ${advisories} advisory warning(s).`);
if (failures > 0) {
  console.log('FAILED - fix the ✗ items above before deploying.');
  process.exit(1);
} else {
  console.log('PASSED - safe to deploy (review any ⚠ advisories at your convenience).');
  process.exit(0);
}
