#!/usr/bin/env node
/* electron-builder's "files" list is a whitelist, and a runtime asset left off it
   fails silently: the file is simply absent from the installed app, loadFile finds
   nothing and the window opens blank. objective.html/js/css shipped that way in
   2.7.0 — the source was correct, the manifest wasn't, and nothing complained.

   This walks what the app actually loads (every <script src>/<link href> in the
   packaged HTML, plus main.js's loadFile and preload paths) and asserts each one
   is both on disk and covered by the whitelist. Run before packaging. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const patterns = (pkg.build && pkg.build.files) || [];

// The whitelist holds plain filenames and directory globs ("vendor/**"); that's
// all this project uses, so match those two shapes rather than pulling in a
// glob library for a check that must never itself be a reason the build fails.
function covered(rel) {
  const p = rel.split(path.sep).join('/');
  return patterns.some((pat) => {
    if (pat === p) return true;
    const star = pat.indexOf('**');
    return star !== -1 && p.startsWith(pat.slice(0, star));
  });
}

const refs = new Map();                     // relative path -> what referenced it
const add = (file, from) => {
  const rel = file.replace(/^\.\//, '').split('?')[0];
  if (/^(https?:)?\/\//.test(rel) || rel.startsWith('data:')) return;   // remote, not ours
  if (!refs.has(rel)) refs.set(rel, from);
};

// HTML entry points that ship, and everything they pull in
const html = patterns.filter((p) => p.endsWith('.html'));
for (const page of html) {
  const full = path.join(root, page);
  if (!fs.existsSync(full)) { add(page, 'package.json build.files'); continue; }
  const src = fs.readFileSync(full, 'utf8');
  for (const m of src.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) add(m[1], page);
  for (const m of src.matchAll(/<link[^>]+href=["']([^"']+)["']/g)) add(m[1], page);
}

// The manifest ships too, and names icons of its own
if (patterns.includes('manifest.webmanifest')) {
  const mf = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  (mf.icons || []).forEach((i) => { if (i.src) add(i.src, 'manifest.webmanifest'); });
}

// Windows the main process opens, and the preloads it hands them
const mainSrc = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
for (const m of mainSrc.matchAll(/loadFile\(\s*['"]([^'"]+)['"]/g)) add(m[1], 'main.js loadFile');
for (const m of mainSrc.matchAll(/file:\s*['"]([^'"]+\.html)['"]/g)) add(m[1], 'main.js WIDGETS');
for (const m of mainSrc.matchAll(/__dirname,\s*['"]([^'"]+)['"]/g)) add(m[1], 'main.js preload');

const missingFromList = [];
const missingOnDisk = [];
for (const [rel, from] of refs) {
  if (!fs.existsSync(path.join(root, rel))) missingOnDisk.push(`${rel}  (referenced by ${from})`);
  else if (!covered(rel)) missingFromList.push(`${rel}  (referenced by ${from})`);
}

if (missingOnDisk.length) {
  console.error('Referenced but not on disk:');
  missingOnDisk.forEach((l) => console.error('  ' + l));
}
if (missingFromList.length) {
  console.error('Referenced but missing from package.json build.files —');
  console.error('these would be absent from the installed app, with no error at build time:');
  missingFromList.forEach((l) => console.error('  ' + l));
}
if (missingOnDisk.length || missingFromList.length) process.exit(1);

console.log(`build.files covers all ${refs.size} referenced runtime assets.`);
