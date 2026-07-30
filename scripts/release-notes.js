/* Extracts one version's section out of CHANGELOG.md so a GitHub Release can
 * show exactly what changed since the previous release, rather than a generic
 * blurb repeated on every tag.
 *
 *   node scripts/release-notes.js v2.2.0   -> prints that release's notes
 *   node scripts/release-notes.js          -> prints the newest released section
 */
const fs = require('fs');
const path = require('path');

const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const lines = changelog.split(/\r?\n/);

// every "## [x.y.z] — date" heading, with the line it starts on
const heads = [];
lines.forEach((line, i) => {
  const m = line.match(/^##\s*\[([^\]]+)\]/);
  if (m) heads.push({ version: m[1], line: i });
});

const wanted = (process.argv[2] || '').replace(/^v/, '');
let idx = wanted
  ? heads.findIndex((h) => h.version === wanted)
  : heads.findIndex((h) => h.version.toLowerCase() !== 'unreleased');

if (idx === -1) {
  // unknown tag: fall back to the newest released section so the release still
  // gets useful notes instead of failing the build
  idx = heads.findIndex((h) => h.version.toLowerCase() !== 'unreleased');
}
if (idx === -1) {
  console.log('See CHANGELOG.md for details.');
  process.exit(0);
}

const start = heads[idx].line + 1;
const end = idx + 1 < heads.length ? heads[idx + 1].line : lines.length;
// drop the link-reference block at the bottom of the file
const body = lines.slice(start, end)
  .filter((l) => !/^\[[^\]]+\]:\s*https?:/.test(l))
  .join('\n')
  .trim();

const version = heads[idx].version;
console.log(`## What changed in ${version}\n`);
console.log(body || '_See CHANGELOG.md._');
console.log(`
---

### Downloads

| Platform | File |
| --- | --- |
| Windows | \`Goal Setter Setup ${version}.exe\` — SmartScreen may warn (unsigned build): **More info → Run anyway** |
| macOS (Apple Silicon) | \`Goal Setter-${version}-arm64.dmg\` |
| macOS (Intel) | \`Goal Setter-${version}-x64.dmg\` |

On macOS the build is ad-hoc signed but not notarised, so you'll get one
"unidentified developer" prompt. On macOS 15 and later allow it via
**System Settings → Privacy & Security → Open Anyway**; on macOS 14 and earlier
right-click the app → **Open**.

Full history: [CHANGELOG.md](CHANGELOG.md)`);
