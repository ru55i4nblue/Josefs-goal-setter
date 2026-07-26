# Goal Setter

A weighted goal & checklist tracker for **Windows and macOS**, with satisfying
progress bars, your own task categories, a floating always-on-top widget, and
**live sync across your devices**. Notion-inspired UI with light and dark mode.

Instead of counting tasks, Goal Setter counts **weight** — every task is rated 1–5,
so finishing one big thing moves your day more than five trivial ones. Your day
fills a purple bar; your week fills a neon-green one. Filling them feels good.

## Download & install

Grab the installer from the **latest** entry on the
**[Releases](../../releases/latest)** page:

| Platform | File | Notes |
| --- | --- | --- |
| **Windows** | `Goal Setter Setup <version>.exe` | Run the installer. SmartScreen may warn (the build is unsigned) — click **More info → Run anyway**. |
| **macOS (Apple Silicon)** | `Goal Setter-<version>-arm64.dmg` | Open the DMG, drag **Goal Setter** into **Applications**. |
| **macOS (Intel)** | `Goal Setter-<version>-x64.dmg` | Same as above. |

**First launch on macOS:** the app is unsigned, so right-click it in Applications →
**Open** → **Open** (one time only). If macOS claims the app is "damaged", run
`xattr -cr "/Applications/Goal Setter.app"` in Terminal once, then open it normally.

Want it to start with your computer? Turn on **Launch at startup** in **Settings**.

> **Upgrading?** Uninstall any previous copy first (Windows Settings → Apps), and
> launch from the shortcut the new installer creates — an old shortcut left over
> from a previous install will keep opening the old version.

## Features

### Progress that motivates
- **Weighted tasks (1–5)** — heavier tasks move the bar more. Each weight can carry
  a **note explaining why it matters and what happens if it slips**, so the number
  has a reason behind it.
- **Daily bar** (purple, 25% tick marks) whose container **grows as you plan more**,
  up to a threshold that scales with your window — then the stakes per task shrink.
- **Weekly bar** (neon green) always visible along the top, plus a vertical twin
  beside the daily bar.
- Snappy spring animations, sparks on every completion, and a celebration burst
  when you hit 100% for the day.

### Taskmaster — your main screen
Everything you're working on, in one of two layouts you can switch between:

- **Categories** — a box per category, each showing its **due-today tasks in a
  highlighted panel** with everything upcoming beneath.
- **Due date** — every task pooled together: due today at the top, then grouped by
  date.

Every task carries a **deliver-by date** (today by default), shown beside its
weight and flagged when it's due today or overdue. Recurring tasks display only
their **next uncompleted instance**, so the list never fills with repeats.

### Categories, including your own
- Ships with **Weekly**, **Daily** and **Routine**, and you can **create your own**.
- **Custom categories persist** — their tasks stay until you complete or delete
  them, rather than expiring at the end of a day. Completing one files it into that
  category's **own archive**, where it can be restored.
- **Routine** is for everyday chores: it's deliberately **weightless**, so ticking
  off "make bed" never inflates your progress.
- Per category: **expand / collapse**, **sort by weight**, a **colour** from an
  eight-colour palette, how many tasks show while collapsed, a jump to its archive,
  and whether it appears on the widget. **Reorder categories** to control the order
  of the boxes.
- Move a task between categories at any time (Routine membership is fixed).

### Creating and scheduling
- **Create page** — a full form for title, category, weight, note, deliver-by date
  and recurrence, plus the category manager.
- **Recurring tasks** repeat **daily** (optionally only on chosen weekdays, e.g.
  Mon/Wed/Fri) or **weekly**; custom categories pick either per task.
- **Quick add** — type and press Enter; append `(4)` to set the weight.
- **Drag to reorder** with per-day ordering, completed tasks sink to the bottom,
  and deleting has **Undo**.

### Plan ahead
- **Weekly calendar** opening on the current week, with previous / next / Today
  navigation. Click any day to view, add, edit, reorder or delete everything on it —
  including scheduling **weekly tasks for future weeks** (they activate
  automatically when the week arrives).
- **Archives** — the last 7 days and 4 weeks with per-day completion bars, an
  archive per custom category, and a **Recently deleted** tab keeping deleted tasks
  for 30 days so you can put them back.

### Always-on-top widget
A compact **sticky-note widget** floats above every window (including full-screen
apps on macOS), showing your top tasks per category with their due dates and live
progress — in the **same order as the app**. Tick tasks off right on the widget,
and choose which categories appear.

### Sync everywhere
- **Live sync** — sign in with the same account on any number of computers and
  changes appear on the others within a second. Works offline; syncs when back.
- **Phone support** — the app doubles as an installable PWA (see below).

### Settings
Choose your **date format** (eleven options, from `Sat, Jul 25` to
`Saturday, 25th July`), set when the daily log is written, pick which categories
reach the widget, show or hide weight notes and the import button, and toggle
launch-at-startup.

### In & out
- **Import a checklist** — paste from Notion or any markdown list
  (`- [ ] Task (4)`) and it becomes weighted tasks.
- **Daily markdown log** — everything you set and completed (with times and weight
  notes, grouped by category) written to a file each evening at a time you choose —
  ideal for a journal, Notion, or an AI assistant. Desktop only.
- **Google Calendar export** — one click writes an `.ics` of your weight-2+ tasks
  (recurring ones become repeating events) ready to import.

What's new in each version is listed in [CHANGELOG.md](CHANGELOG.md).

## Your data & privacy

- Signing in is optional on desktop — without an account everything stays on your
  machine.
- With an account, your tasks are stored in a cloud database where **each account
  can only ever read and write its own row** (enforced by Postgres row-level
  security, not just app code).
- Deleting a task doesn't destroy it immediately — it waits 30 days in **Recently
  deleted**, and you can purge it sooner from there.
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
