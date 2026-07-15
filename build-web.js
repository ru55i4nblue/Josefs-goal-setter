// Assembles the web assets into www/ — the deployable folder for the mobile PWA.
// The same files power the Electron desktop app from the project root.
const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const files = [
  'index.html',
  'styles.css',
  'renderer.js',
  'store.js',
  'supabase-config.js',
  'supabase-backend.js',
  'manifest.webmanifest',
  'sw.js'
];
for (const f of files) fs.copyFileSync(path.join(root, f), path.join(out, f));

// vendor dir (supabase client)
fs.cpSync(path.join(root, 'vendor'), path.join(out, 'vendor'), { recursive: true });

// icons (used by the manifest + apple-touch-icon)
fs.mkdirSync(path.join(out, 'build'), { recursive: true });
for (const ic of ['icon.png', 'icon-180.png', 'icon-192.png', 'icon-512.png']) {
  fs.copyFileSync(path.join(root, 'build', ic), path.join(out, 'build', ic));
}

console.log('Assembled www/ (PWA build).');
