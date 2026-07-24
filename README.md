# Goal Setter

A weighted goal & checklist tracker for **Windows and macOS**, with satisfying
progress bars, daily / weekly / recurring tasks, a floating always-on-top widget,
and **live sync across your devices**. Notion-inspired UI with light and dark mode.

Instead of counting tasks, Goal Setter counts **weight** — every task is rated 1–3,
so finishing one big thing moves your day more than three trivial ones. Your day
fills a purple bar; your week fills a neon-green one. Filling them feels good.

## Download & install

Grab the latest installer from **[Releases](../../releases)**:

| Platform | File | Notes |
| --- | --- | --- |
| **Windows** | `Goal Setter Setup <version>.exe` | Run the installer. SmartScreen may warn (the build is unsigned) — click **More info → Run anyway**. |
| **macOS (Apple Silicon)** | `Goal Setter-<version>-arm64.dmg` | Open the DMG, drag **Goal Setter** into **Applications**. |
| **macOS (Intel)** | `Goal Setter-<version>-x64.dmg` | Same as above. |

**First launch on macOS:** the app is unsigned, so right-click it in Applications →
**Open** → **Open** (one time only). If macOS claims the app is "damaged", run
`xattr -cr "/Applications/Goal Setter.app"` in Terminal once, then open it normally.

Want it to start with your computer? Flip **"Launch at startup"** in the sidebar.

## Features

### Progress that motivates
- **Weighted tasks (1–3)** — heavier tasks move the bar more.
- **Daily bar** (purple, 25% tick marks) whose container **grows as you plan more**,
  up to a threshold that scales with your window — then the stakes per task shrink.
- **Weekly bar** (neon green) always visible along the top, plus a vertical twin
  beside the daily bar.
- Snappy spring animations, sparks on every completion, and a celebration burst
  when you hit 100% for the day.

### Organize your day
- **Three task tiers, in priority order:** tasks **scheduled for today** →
  **recurring** tasks → **routine** chores (the everyday trivia), so what matters
  stays on top. Toggle a split view to see the groups separately.
- **Quick add** — type and press Enter; append `(2)` or `(3)` to set the weight.
- **Drag to reorder**, completed tasks sink to the bottom, delete has **Undo**.
- **Recurring manager** — one page to edit every recurring task: weekdays it
  repeats (e.g. Mon/Wed/Fri), weight, and whether it counts as routine.

### Plan ahead
- **Calendar** spanning last / current / next month. Click any day to view, add,
  edit, reorder, or delete everything on it — including scheduling **weekly tasks
  for future weeks** (they activate automatically when the week arrives).
- **Archives** — the last 7 days and 4 weeks, with per-day completion bars, and
  one-click re-adding of any archived task.

### Always-on-top widget
A compact **sticky-note widget** floats above every window (including fullscreen
apps on macOS) showing your top weekly, today, recurring, and routine tasks with
live progress — and you can **check tasks off right on the widget**.

### Sync everywhere
- **Live sync** — sign in with the same account on any number of computers and
  changes appear on the others within a second. Works offline; syncs when back.
- **Phone support** — the app doubles as an installable PWA (see below).

### In & out
- **Import from Notion** — paste any checklist (`- [ ] Task (2)`) and it becomes
  weighted tasks.
- **Daily markdown log** — the app compiles everything you set and completed
  (with times) into a markdown file each evening (time configurable) — ideal for
  feeding a journal, Notion, or an AI assistant. Desktop only.
- **Google Calendar export** — one click writes an `.ics` of your weight-2+ tasks
  (recurring ones become repeating events) ready to import.

What's new in each version is listed in [CHANGELOG.md](CHANGELOG.md).

## Your data & privacy

- Signing in is optional on desktop — without an account everything stays on your
  machine.
- With an account, your tasks are stored in a cloud database where **each account
  can only ever read and write its own row** (enforced by Postgres row-level
  security, not just app code).
- The daily logs and calendar exports are written to
  `Documents/Goal Setter/` on your machine.

## Phone (PWA)

Goal Setter's UI is responsive and installs as a Progressive Web App: host the
`www/` folder on any HTTPS static host (Netlify, Cloudflare Pages, GitHub Pages),
open it in Safari/Chrome on your phone → **Add to Home Screen**, and sign in.
It runs full-screen, caches itself for offline use, and syncs with your desktops.

## Building from source

```bash
npm install
npm start            # run the desktop app in development
npm run dist         # Windows installer (NSIS)  -> dist/
npm run dist:mac     # macOS DMGs (on a Mac)     -> dist/   (see MAC-BUILD.md)
npm run build:web    # assemble the PWA          -> www/
```

Releases are built automatically: pushing a `v*` tag runs a GitHub Actions
workflow that produces the Windows installer and both macOS DMGs and attaches
them to a GitHub Release.

### Self-hosting the sync backend

Sync runs on [Supabase](https://supabase.com) (free tier is plenty). To point the
app at your own project: create one, run `supabase/schema.sql` in its SQL editor
(creates the `user_state` table, row-level security, and realtime), then put your
Project URL and anon key in `supabase-config.js` and rebuild. Leave the config
blank for a fully local, offline-only build.

## Tech

Plain **HTML/CSS/JavaScript** — no framework, no build step — wrapped in
**Electron** for desktop (with a second always-on-top window for the widget) and
a **service worker + manifest** for the PWA. Persistence goes through a small
swappable storage layer: local-only by default, or a **Supabase** (Postgres +
Realtime) backend layered over the local cache for instant, offline-tolerant,
last-write-wins sync.
