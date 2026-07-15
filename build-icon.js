// Generates the app icons (pure Node + zlib, no deps):
//   build/icon.png      (256)  - Electron / source-of-truth
//   build/icon-180.png  (180)  - iOS apple-touch-icon
//   build/icon-192.png  (192)  - PWA home-screen icon
//   build/icon-512.png  (512)  - PWA home-screen icon (also maskable)
// Run: `node build-icon.js`
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function insideRound(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
  const nx = x < x0 + rad ? x0 + rad : (x > x1 - 1 - rad ? x1 - 1 - rad : x);
  const ny = y < y0 + rad ? y0 + rad : (y > y1 - 1 - rad ? y1 - 1 - rad : y);
  const dx = x - nx, dy = y - ny;
  return dx * dx + dy * dy <= rad * rad;
}
const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function render(size) {
  const S = size;
  const k = S / 256; // scale factor from the 256px reference design
  const buf = Buffer.alloc(S * S * 4);
  const set = (x, y, r, g, b, a) => { const i = (y * S + x) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a; };
  const r = (n) => Math.round(n * k);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (insideRound(x, y, 0, 0, S, S, r(54))) {
        const t = y / (S - 1);
        set(x, y, lerp(124, 167, t), lerp(58, 139, t), lerp(237, 250, t), 255);
      }
    }
  }
  const bar = (x0, y0, x1, y1, cr, cg, cb) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        if (insideRound(x, y, x0, y0, x1, y1, r(18))) set(x, y, cr, cg, cb, 255);
  };
  bar(r(80), r(120), r(120), r(192), 43, 255, 136);    // green, shorter
  bar(r(140), r(70), r(180), r(192), 237, 233, 254);   // light, taller
  return { S, buf };
}

// ---- PNG encode ----
const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function toPng({ S, buf }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const dir = path.join(__dirname, 'build');
fs.mkdirSync(dir, { recursive: true });
// icon-1024 is used by electron-builder to make the macOS .icns
const sizes = { 'icon.png': 256, 'icon-180.png': 180, 'icon-192.png': 192, 'icon-512.png': 512, 'icon-1024.png': 1024 };
for (const [name, size] of Object.entries(sizes)) {
  fs.writeFileSync(path.join(dir, name), toPng(render(size)));
}
console.log('Wrote icons: ' + Object.keys(sizes).join(', '));
