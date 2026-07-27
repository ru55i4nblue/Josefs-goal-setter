/* electron-builder afterPack hook — ad-hoc sign the macOS app.
 *
 * We ship unsigned (no paid Apple Developer certificate), but macOS refuses to
 * run an arm64 binary that carries NO signature at all — it reports the app as
 * damaged or untrusted, and `xattr -cr` can't fix that because the problem isn't
 * quarantine, it's the missing signature. An ad-hoc signature ("-") costs
 * nothing, needs no certificate, and satisfies that requirement. Users still see
 * the "unidentified developer" prompt once, which is expected.
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  if (!fs.existsSync(appPath)) {
    console.warn(`[afterPack] ${appPath} not found, skipping ad-hoc signing`);
    return;
  }

  // Sign nested code first (frameworks, helpers), then the outer bundle.
  const inner = [
    'Contents/Frameworks/*.framework',
    'Contents/Frameworks/*.dylib',
    'Contents/Frameworks/*.app'
  ];
  for (const pattern of inner) {
    const dir = path.join(appPath, path.dirname(pattern));
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const ext = path.extname(entry);
      if (!['.framework', '.dylib', '.app'].includes(ext)) continue;
      sign(path.join(dir, entry));
    }
  }
  sign(appPath);
  console.log(`[afterPack] ad-hoc signed ${appName}`);
};

function sign(target) {
  try {
    execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', target], { stdio: 'pipe' });
  } catch (e) {
    // keep going — the outer bundle signature is the one that matters most
    console.warn(`[afterPack] could not sign ${path.basename(target)}: ${e.message}`);
  }
}
