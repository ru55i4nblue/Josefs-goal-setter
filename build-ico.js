// Wraps build/icon.png into build/icon.ico (PNG-in-ICO, supported on Vista+).
const fs = require('fs');
const path = require('path');
const png = fs.readFileSync(path.join(__dirname, 'build', 'icon.png'));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);      // reserved
header.writeUInt16LE(1, 2);      // type 1 = icon
header.writeUInt16LE(1, 4);      // image count

const entry = Buffer.alloc(16);
entry[0] = 0;                    // width 0 => 256
entry[1] = 0;                    // height 0 => 256
entry[2] = 0;                    // palette
entry[3] = 0;                    // reserved
entry.writeUInt16LE(1, 4);       // color planes
entry.writeUInt16LE(32, 6);      // bits per pixel
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(6 + 16, 12); // offset to image data

fs.writeFileSync(path.join(__dirname, 'build', 'icon.ico'), Buffer.concat([header, entry, png]));
console.log('Wrote build/icon.ico');
