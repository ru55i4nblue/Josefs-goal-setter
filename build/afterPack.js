/* electron-builder afterPack hook — ad-hoc sign the macOS app.
 *
 * We ship unsigned (no paid Apple Developer certificate), but macOS refuses to
 * run an arm64 binary that carries NO signature at all — it reports the app as
 * damaged or untrusted, and `xattr -cr` can't fix that because the problem isn't
 * quarantine, it's the missing signature. An ad-hoc signature ("-") costs
 * nothing, needs no certificate, and satisfies that requirement. Users still see
 * the "unidentified developer" prompt once, which is expected.
 *
 * --deep is deprecated for *distribution* signing, but it is the correct tool
 * here: an Electron bundle nests frameworks, helper apps and dylibs several
 * levels down, and every one of them must be signed or the outer signature is
 * invalid. Signing them piecemeal is what broke the previous attempt.
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  if (!fs.existsSync(appPath)) {
    throw new Error(`[afterPack] expected app at ${appPath} but it does not exist`);
  }

  console.log(`[afterPack] ad-hoc signing ${appName} …`);
  run('codesign', ['--force', '--deep', '--sign', '-', appPath]);

  // Report on the result, but don't fail the build over it. `--strict`
  // verification is known to reject legitimately ad-hoc-signed Electron
  // bundles, and a diagnostic shouldn't be able to block a good release.
  const verify = capture('codesign', ['--verify', '--deep', '--verbose=2', appPath]);
  const info = capture('codesign', ['-dv', '--verbose=4', appPath]);
  console.log(`[afterPack] verify: ${verify.trim() || '(no output)'}`);
  console.log(`[afterPack] adhoc signature: ${/Signature=adhoc/.test(info)}`);
  if (!/Signature=adhoc/.test(info)) {
    console.warn('[afterPack] WARNING: bundle does not report an ad-hoc signature');
  }
  console.log(`[afterPack] ${appName} done`);
};

function run(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: 'inherit' });
  } catch (e) {
    throw new Error(`[afterPack] ${cmd} ${args.join(' ')} failed: ${e.message}`);
  }
}
// codesign -dv writes to stderr, so capture both streams
function capture(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) || '';
  } catch (e) {
    return `${e.stdout || ''}${e.stderr || ''}`;
  }
}
