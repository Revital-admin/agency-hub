#!/usr/bin/env node
/* ============================================================
   scripts/smoke-test.js
   ============================================================
   verify-hub.js checks that everything is WIRED correctly (syntax, nav
   registration, cache-bust coverage) - all static analysis, none of it
   actually runs the code. This script is the missing piece: it loads
   every tool's index.html for real, in a real browser (headless
   Chrome via Puppeteer), and watches for anything that would only show
   up at runtime - a thrown JS error, an id a tool expects that isn't on
   the page, a 404 on a local script/stylesheet/image.

   It deliberately does NOT need the live Hub or Firebase to run - every
   tool already has a documented "standalone mode" fallback for when
   `window.parent.getActiveClient` (or similar) isn't available, since
   that's also what runs if you open a tool's index.html directly. This
   script leans on exactly that fallback path rather than mocking the
   parent Hub, so it's a true "does this tool at least boot cleanly on
   its own" check.

   Setup (one-time, needs network access to download Chrome itself -
   this couldn't be run inside the sandboxed environment Claude authored
   this in, only on a real machine with internet access):
     npm install --no-save puppeteer
     npx puppeteer browsers install chrome

   Usage:
     node scripts/smoke-test.js
       Boots every tool folder's index.html and every top-level page
       (index.html, portal/index.html, etc.), reports any console
       errors, uncaught exceptions, or failed local resource loads.

     node scripts/smoke-test.js shot-list-builder call-sheet-builder
       Check only the named tool folders - much faster while iterating
       on one tool.

   Exit code is 0 if every page loaded clean, 1 if anything failed -
   same convention as verify-hub.js, so this can slot into the same
   pre-deploy routine (`node scripts/verify-hub.js && node scripts/smoke-test.js`).
   ============================================================ */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');

// Tools that are known to require the parent Hub to do anything meaningful
// (e.g. they redirect or render nothing standalone) - skipped rather than
// reported as false failures. Mirrors the spirit of verify-hub.js's
// KNOWN_NON_TAB_TOOLS exception list.
const SKIP_TOOLS = new Set([
  // Add a tool name here with a one-line reason if it's a confirmed, expected
  // standalone failure rather than a real bug - keep this list short and
  // justified, same convention as verify-hub.js's KNOWN_NON_TAB_TOOLS.
]);

function findToolPages() {
  const explicit = process.argv.slice(2);
  if (explicit.length) {
    return explicit
      .map(name => ({ name, relPath: path.join(name, 'index.html') }))
      .filter(t => {
        const full = path.join(ROOT, t.relPath);
        if (!fs.existsSync(full)) {
          console.log(`(skip) ${t.name} - no index.html found at ${t.relPath}`);
          return false;
        }
        return true;
      });
  }

  const toolFolders = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(name => !name.startsWith('.') && name !== 'node_modules' && name !== 'scripts' && name !== 'shared')
    .filter(name => fs.existsSync(path.join(ROOT, name, 'index.html')))
    .filter(name => !SKIP_TOOLS.has(name));

  return toolFolders.map(name => ({ name, relPath: path.join(name, 'index.html') }));
}

// Minimal static file server - no dependency on a global `serve`/`http-server`
// install. Serving over http:// (rather than opening file:// paths directly)
// matters here: file:// blocks some fetch()/XHR calls under Chrome's CORS
// rules in ways real deployment (served over https from Cloudflare) never
// hits, which would produce false-positive failures unrelated to the tool's
// actual code.
function startServer() {
  const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  };
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function checkPage(browser, baseUrl, tool) {
  const page = await browser.newPage();
  const issues = [];

  page.on('pageerror', err => issues.push(`Uncaught exception: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') issues.push(`Console error: ${msg.text()}`);
  });
  page.on('requestfailed', req => {
    // CDN requests (fonts, jsPDF, etc.) can legitimately fail in a sandboxed
    // CI environment with no outbound internet - only flag same-origin
    // (local) resources, since those are the ones this repo controls.
    if (req.url().startsWith(baseUrl)) {
      issues.push(`Failed to load local resource: ${req.url().replace(baseUrl, '')} (${req.failure() ? req.failure().errorText : 'unknown error'})`);
    }
  });
  page.on('response', res => {
    if (res.url().startsWith(baseUrl) && res.status() >= 400) {
      issues.push(`HTTP ${res.status()}: ${res.url().replace(baseUrl, '')}`);
    }
  });

  try {
    await page.goto(baseUrl + '/' + tool.relPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 15000 });
    // Most tools' init code runs on DOMContentLoaded synchronously, but a
    // few do a short setTimeout/poll loop (e.g. waiting for getAllClients())
    // - give those a moment to either finish or throw before closing.
    await new Promise(r => setTimeout(r, 500));
  } catch (e) {
    issues.push(`Failed to load page: ${e.message}`);
  }

  await page.close();
  return issues;
}

async function main() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    console.error('puppeteer is not installed. Run:\n  npm install --no-save puppeteer\n  npx puppeteer browsers install chrome');
    process.exit(1);
  }

  const tools = findToolPages();
  if (!tools.length) {
    console.log('No tool pages found to check.');
    process.exit(0);
  }

  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;

  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  } catch (e) {
    console.error('Could not launch Chrome: ' + e.message);
    console.error('Run `npx puppeteer browsers install chrome` once, then retry.');
    server.close();
    process.exit(1);
  }

  console.log(`Checking ${tools.length} tool page(s)...\n`);
  let failCount = 0;
  for (const tool of tools) {
    const issues = await checkPage(browser, baseUrl, tool);
    if (issues.length) {
      failCount++;
      console.log(`✗ ${tool.name}`);
      issues.forEach(issue => console.log(`    ${issue}`));
    } else {
      console.log(`✓ ${tool.name}`);
    }
  }

  await browser.close();
  server.close();

  console.log('\n' + '─'.repeat(50));
  if (failCount === 0) {
    console.log(`0 failure(s) across ${tools.length} tool page(s). PASSED.`);
    process.exit(0);
  } else {
    console.log(`${failCount} tool page(s) had issues - see above.`);
    process.exit(1);
  }
}

main();
