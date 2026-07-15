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

The build is **unsigned** (no paid Apple Developer account), so macOS Gatekeeper
will warn the first time. To open it:

- **Right-click** the app in Applications → **Open** → **Open** in the dialog.
  *(Only needed once; after that it launches normally.)*
- If macOS says the app "is damaged and can't be opened," run this once in Terminal:
  ```bash
  xattr -cr "/Applications/Goal Setter.app"
  ```
  then open it normally. (This just clears the download-quarantine flag.)

To make it launch on login, use the **"Launch at startup"** toggle inside the app —
it works the same on macOS as on Windows.
