# Building Goal Setter for macOS

The app already runs on macOS (Electron is cross-platform, and the always-on-top
widget uses Mac-compatible APIs). The only thing that can't be done on Windows is
**producing the `.dmg` installer** — that step must run on a Mac, because a macOS
app bundle uses symlinks Windows can't create, and only macOS can build a `.dmg`.

Pick whichever route fits you.

---

## Option A — build on a Mac you have access to (simplest)

On the Mac (needs [Node.js](https://nodejs.org) installed — the LTS version):

```bash
# 1. Copy the source bundle (Goal Setter Mac Source.zip) to the Mac and unzip it
cd "Goal Setter Mac Source"

# 2. Install dependencies and build the installer
npm install
npm run dist:mac
```

The installer appears in `dist/`:
- `Goal Setter-1.0.0-arm64.dmg`  → Apple Silicon Macs (M1/M2/M3/M4)
- `Goal Setter-1.0.0-x64.dmg`    → Intel Macs

Double-click the right one, drag **Goal Setter** into **Applications**, done.

---

## Option B — build in the cloud, no Mac needed (GitHub Actions)

1. Put this project in a GitHub repo (a private repo is fine).
2. Go to the repo's **Actions** tab → **Build macOS app** → **Run workflow**.
3. When it finishes (~5 min), open the run and download the **goal-setter-macos-dmg**
   artifact — it contains both `.dmg` files.

(The workflow file is already included at `.github/workflows/build-mac.yml`.)

---

## First launch on the Mac — Gatekeeper

The build is **ad-hoc signed but not notarised** (notarising needs a paid Apple
Developer account), so Gatekeeper warns the first time.

- **macOS 15 Sequoia and later:** double-click, dismiss the warning, then
  **System Settings → Privacy & Security** → scroll down → **Open Anyway**.
  Sequoia removed the right-click bypass, so this is the only route.
- **macOS 14 and earlier:** **right-click** the app → **Open** → **Open**.

Only needed once; afterwards it launches normally.

### Why ad-hoc signing matters

macOS refuses to run an **arm64** binary carrying *no* signature at all — it reports
the app as damaged or untrusted, and `xattr -cr` cannot fix that, because the
problem isn't quarantine but the missing signature. The build therefore ad-hoc
signs the bundle (`build/afterPack.js`, wired up via the `afterPack` hook). Ad-hoc
signing needs no certificate and costs nothing.

If a build ever slips through unsigned, fix a local copy with:

```bash
xattr -cr "/Applications/Goal Setter.app"
codesign --force --deep --sign - "/Applications/Goal Setter.app"
```

To make it launch on login, use the **"Launch at startup"** toggle inside the app —
it works the same on macOS as on Windows.
