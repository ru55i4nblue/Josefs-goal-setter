# Maintainer notes

Day-to-day workflow for developing and shipping Goal Setter from this machine.

## Local update loop (Windows dev box)

- **`update.bat`** — closes the running app, rebuilds from source
  (`npm run package`), reinstalls to `%LOCALAPPDATA%\Programs\Goal Setter`,
  offers to relaunch. The installed app is a *copy*; code edits do nothing
  until this runs.
- **`uninstall.ps1`** — removes the installed copy, shortcuts, and the
  startup entry (saved data in `%APPDATA%\Goal Setter` is left alone).

## Phone (PWA)

- **`deploy-mobile.bat`** — rebuilds `www/` and deploys it to Netlify
  (first run: browser login + link the site). The phone picks the update up
  on next full close/reopen. The hosted site does NOT update itself when
  local code changes — this script is the publish step.

## Releases (all platforms)

Tag and push — CI does the rest:

```powershell
git tag -a v1.x.x -m "notes"
git push origin v1.x.x
```

`.github/workflows/release.yml` builds the Windows NSIS installer and both
macOS DMGs and attaches them to a GitHub Release. (`build-mac.yml` also builds
DMG artifacts on every push to main, without publishing a release.)

## Standalone laptop installs (no GitHub)

Zip `dist/Goal Setter-win32-x64/` together with `install.bat` / `install.ps1` /
`uninstall.bat` / `READ ME FIRST.txt` (re-add them after packaging — packaging
wipes the folder). The zip installs per-user with no admin rights.

## Gotchas

- `npm run dist` (NSIS) fails on THIS machine (electron-builder's signing
  toolkit needs symlink privileges — enable Windows Developer Mode to fix);
  it works fine on GitHub's Windows runners, hence CI builds the installer.
- The dev app (`npm start`) and the installed app share saved data (same
  app name → same `%APPDATA%` folder).
- Supabase free tier throttles signup *emails* to a few per hour; sign-ins
  are unaffected.
