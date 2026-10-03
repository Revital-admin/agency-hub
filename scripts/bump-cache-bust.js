#!/usr/bin/env node
/* ============================================================
   scripts/bump-cache-bust.js
   ============================================================
   Every <script src="...?v=N"> / <link href="...?v=N"> in the Hub needs
   its version bumped by hand whenever the underlying file changes -
   skip that step and the browser keeps serving the old cached file even
   though the fix is live on the server. That's an easy step to forget
   (it's happened more than once in this project's history), so this
   script does it automatically.

   Usage:
     node scripts/bump-cache-bust.js
       Finds every changed .js/.css file (via `git diff` against HEAD,
       plus untracked new files) and bumps its cache-bust version
       everywhere it's referenced across every .html file in the repo.

     node scripts/bump-cache-bust.js app.js shared/pdf-report.js
       Bumps only the files you name, ignoring git status. Useful for a
       shared file like shared/pdf-report.js that's referenced by ~35
       different tool folders - this updates every one of them in a
       single run instead of a manual grep+sed across the whole repo.

   How it decides the new version number: for a given file (matched by
   its basename, e.g. "pdf-report.js"), it scans every .html file for
   references to it, finds the HIGHEST ?v=N currently in use anywhere
   (they're sometimes already out of sync across files), and sets every
   reference to that file to max+1. That keeps every page that loads a
   shared file in lockstep on one version, the same convention used
   everywhere else in the Hub.

   Safe to run with nothing changed - it just reports nothing to do.
   Run `node scripts/verify-hub.js` afterward (it already checks cache-
   bust coverage) to confirm nothing was missed.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function getChangedFiles() {
  const explicit = process.argv.slice(2);
  if (explicit.length) {
    return explicit.map(f => path.resolve(ROOT, f)).filter(f => {
      if (!fs.existsSync(f)) {
        console.log(`(skip) ${f} - file not found`);
        return false;
      }
      return true;
    });
  }

  let diffOutput = '';
  let untrackedOutput = '';
  try {
    diffOutput = execSync('git diff --name-only HEAD', { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    console.error('Could not run `git diff` - is this a git repo? (' + e.message + ')');
    process.exit(1);
  }
  try {
    untrackedOutput = execSync('git ls-files --others --exclude-standard', { cwd: ROOT, encoding: 'utf8' });
  } catch (e) { /* non-fatal - just skip untracked detection */ }

  const files = new Set();
  diffOutput.split('\n').forEach(f => { if (f.trim()) files.add(f.trim()); });
  untrackedOutput.split('\n').forEach(f => { if (f.trim()) files.add(f.trim()); });
  return Array.from(files)
    .map(f => path.resolve(ROOT, f))
    .filter(f => fs.existsSync(f));
}

function findAllHtmlFiles() {
  const results = [];
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) results.push(full);
    }
  })(ROOT);
  return results;
}

// Finds every reference to `targetFile` (matched by basename) across every
// html file, moves them all to one shared next version number (current
// max + 1), and writes the files back. Returns null if the file isn't
// referenced with a ?v= cache-bust anywhere (e.g. a .js file that's never
// included directly, like a helper required by another script).
function bumpReferencesTo(targetFile, htmlFiles) {
  const basename = path.basename(targetFile);
  const escaped = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`((?:src|href)=["'][^"']*${escaped})\\?v=(\\d+)(["'])`, 'g');

  let maxVersion = 0;
  let matchCount = 0;
  htmlFiles.forEach(htmlFile => {
    const content = fs.readFileSync(htmlFile, 'utf8');
    let m;
    const localRe = new RegExp(re.source, 'g');
    while ((m = localRe.exec(content))) {
      maxVersion = Math.max(maxVersion, parseInt(m[2], 10));
      matchCount++;
    }
  });

  if (matchCount === 0) return null;

  const nextVersion = maxVersion + 1;

  htmlFiles.forEach(htmlFile => {
    const content = fs.readFileSync(htmlFile, 'utf8');
    const localRe = new RegExp(re.source, 'g');
    const updated = content.replace(localRe, (match, prefix, version, quote) => `${prefix}?v=${nextVersion}${quote}`);
    if (updated !== content) fs.writeFileSync(htmlFile, updated);
  });

  return { basename, matchCount, newVersion: nextVersion };
}

function main() {
  const changedFiles = getChangedFiles().filter(f => /\.(js|css)$/.test(f));

  if (!changedFiles.length) {
    console.log('No changed .js/.css files found (via `git diff` + untracked files).');
    console.log('Tip: pass file paths explicitly to bump specific files regardless of git status, e.g.:');
    console.log('  node scripts/bump-cache-bust.js app.js shared/pdf-report.js');
    process.exit(0);
  }

  const htmlFiles = findAllHtmlFiles();
  const bumped = [];
  const skipped = [];

  changedFiles.forEach(f => {
    const rel = path.relative(ROOT, f);
    const result = bumpReferencesTo(f, htmlFiles);
    if (result) bumped.push({ rel, ...result });
    else skipped.push(rel);
  });

  if (bumped.length) {
    console.log('Bumped cache-bust versions:');
    bumped.forEach(r => console.log(`  ${r.rel}  ->  v=${r.newVersion}  (${r.matchCount} reference(s) updated)`));
  }
  if (skipped.length) {
    console.log((bumped.length ? '\n' : '') + 'No ?v= references found for (nothing to bump):');
    skipped.forEach(rel => console.log(`  ${rel}`));
  }
  if (!bumped.length && !skipped.length) {
    console.log('Nothing to do.');
  }

  console.log('\nRun `node scripts/verify-hub.js` to confirm full cache-bust coverage.');
}

main();
