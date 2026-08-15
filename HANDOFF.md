# Goal Setter — session handoff

Paste this into a new chat to pick up where we left off.

---

## What this is

**Goal Setter** — a weighted goal/checklist tracker. Electron desktop app (Windows +
macOS) that is also a PWA for phones, with optional live sync via Supabase.

- **Project folder:** `C:\Users\ru55i\Documents\Claude Files\Goal Setter`
- **GitHub:** https://github.com/ru55i4nblue/Josefs-goal-setter (public)
  - ⚠️ The repo was **renamed** from `goal-setter`; old URLs still redirect.
- **Current version:** 2.7.1 (tag `v2.7.1`) · **save format v4**
- **Stack:** vanilla HTML/CSS/JS — no framework, no build step — wrapped in Electron.

## The idea

Work is weighted **1–5** rather than counted, so one big task moves the bar more than
five trivial ones. **Routine** is deliberately weightless — chores shouldn't inflate
progress.

**Progress is driven by dates, not by category.** This is the single most important
thing to understand: `progressForRange()` / `progressUpTo()` / `overdueTasks()` all
iterate `state.tasks` and key off `deliverBy`. Nothing keys off category type any more.
That is what allows every category — including Daily and Weekly — to be deleted.

## Three levels of work

```
Project            grouping, no weight of its own          state.projects[]
└── Task           weight + optional deliver-by            state.tasks[] with parentId
    └── Step       plain checklist, NO weight, NO date     task.steps[]
```

- A **sub-task is an ordinary task** carrying `parentId`. That's deliberate: it means
  sub-tasks feed the weekly bar, milestones and the overdue indicator for free. The
  project isn't a task, so it can't double-count.
- The cost is the inverse and it's the quiet one: anything listing *top-level* work must
  filter sub-tasks out. `topLevelTasks()` is applied at `catBoxTasks()`,
  `renderGroupedView()`, `buildIcs()` and — covering the calendar, day modal and daily
  log in one — `catTasksFor()`. **A miss shows sub-tasks twice rather than throwing**, so
  it fails silently. Assert each surface rather than assuming.
- **Steps carry no weight and no date on purpose** — the task above holds both, and
  giving a step either would count the same work twice. `migrate()` strips any that
  arrive. They live on the task, not in `state.tasks`, because they aren't tasks.
- Ticking every step deliberately does **not** complete the task.

## Files

| File | Role |
| --- | --- |
| `main.js` | Electron main: windows, IPC, **both** sticky widgets, log/ics writing, autostart |
| `preload.js` / `widget-preload.js` | contextBridge APIs (`window.goalAPI`, `window.widgetAPI`) |
| `model.js` | **Data model**: state shape, migration, dates, recurrence, progress math, themes |
| `renderer.js` | Core: load/save, rollover, task + project CRUD, category boxes, Big Picture, bars, modals, boot |
| `pages.js` | Secondary pages, day modal, log, `.ics`, Supabase sync, **all event wiring** |
| `store.js` | Swappable storage layer (local by default) |
| `supabase-backend.js` / `supabase-config.js` | Cloud sync layer + keys |
| `index.html`, `styles.css` | UI |
| `widget.html/js/css` | "All goals" sticky widget |
| `objective.html/js/css` | "Current objective" sticky widget (rides on `widget.css`) |
| `sw.js`, `manifest.webmanifest` | PWA |
| `build-icon.js`, `build-ico.js`, `build-web.js` | Icon generation + assembling `www/` |
| `scripts/release-notes.js` | Extracts a version's CHANGELOG section for GitHub release notes |

**Script load order matters:** `model.js` → `pages.js` → `renderer.js` (renderer's boot
code calls `wire()`, which lives in pages.js).

## Data model (v4)

```js
state = {
  version: 4,
  categories: [ {id, name, type, color, widget, expanded, sort, limit} ],
  projects:   [ {id, name, categoryId, deliverBy, note, order} ],
  tasks: [ {id, title, weight:1-5, note, categoryId, parentId,
            recurring, cadence:'daily'|'weekly', days:[],
            deliverBy: 'YYYY-MM-DD' | null,        // OPTIONAL
            steps: [ {id, title, done} ],           // no weight, no date
            done, completedAt, completedOn, order, createdAt} ],
  archive: [], deleted: [], dailyArchive: [], weeklyArchive: [],
  dayOrders: { 'YYYY-MM-DD': { taskId: index } },
  settings: { showImport, showWeightNotes, dateFormat, dueDisplay,
              widgetMode, widgetCategory, widgetTop,
              weekStart: 0-6, milestones: [{id,name,date}],
              objectiveProject, objectiveCount },
  taskmasterView: 'categories' | 'grouped',
  lastDay, lastWeek, loggedDays, logTime,
  widgetOpen, objectiveOpen, theme
}
```

**Category types:** `weekly` · `daily` · `routine` (weightless, **never carries a date**) ·
`custom` (persists until completed, then archives). Every category is renameable and
deletable; only the last one is protected.

**Undated tasks are a someday pile** — visible in their category under a "No date"
heading, never overdue, excluded from every date-scoped bar.

**Ordering is per-day** (`dayOrders`), not global — reordering used to renumber a shared
`order` field and scramble Routine after rollover.

## Behaviour worth knowing before you change it

- **Unfinished work carries forward.** Rollover used to delete past-dated one-offs, so
  nothing could ever *stay* overdue. Only completed ones are cleared, after archiving.
- **Recurrence** goes through one predicate, `recursOn()`. A weekly task is anchored to
  the weekday of its `deliverBy`; a daily one to its `days`. `resetDueOn()` clears a
  completed instance at **the earlier of the next week boundary or its next recurrence**,
  measured from `completedOn` (a date — `completedAt` is only a clock time).
- **The week's start day is configurable.** `weekKey()` returns the week's *start date*,
  so the progress bar, the weekly archive, the calendar week and the recurring reset all
  agree. Changing the setting resets `state.lastWeek` so it doesn't look like a new week.
- **The main bar is the week and carries the whole overdue backlog**, so it can't read
  100% while last week's misses are open.

## Themes

Four: **light**, **dark**, **pond** (lily pads), **space** (jet black, sparkles).
`applyTheme()` sets `body.dataset.theme` plus mutually exclusive classes. Space is in the
**dark family** — it also wears `dark`, so all existing `body.dark` rules apply and
`body.space` only overrides what differs. Its block must stay *after* `body.dark`: equal
specificity, so source order decides.

**There is a contrast standard here, and it is enforced by measurement.** Text ≥ 4.5:1,
non-text indicators ≥ 3:1, in every theme. Nearly every visual bug found in this project
has been "a fill colour used as text" — the raw palette is for fills; text reads from the
`--chip-text` / `--accent-text` / `--danger-text` / `--ok-text` tokens, which have
per-theme values. Category colours use `--c` via `tint-*`, with darkened variants in the
light-family themes.

## Sync

Supabase, one JSON row per user in `user_state`, protected by row-level security.

- URL `https://jbrlyvpfornjbkbksbwd.supabase.co`, anon key in `supabase-config.js`
  (safe to publish — RLS is what protects data). Schema in `supabase/schema.sql`.
- **`isStaleSchema()` refuses v1, v2 and v3 payloads** when local holds tasks, and
  republishes ours. Each older version would mangle something the newer one added
  (v2 re-dates undated tasks; v3 turns sub-tasks into loose tasks).
- **An empty remote payload is refused whatever version it claims**, if local has tasks.

### The data-loss incident — read this before touching `migrate()`

A TDZ `ReferenceError` in `migrate()` (reading a `const` declared further down) fired for
every existing save. `load()` caught it, returned an empty `defaultState()`, the next
`save()` wrote that over 18 real tasks, and sync pushed the blank to every device.

Three guards now exist. **Don't remove them:**

1. `load()` records the failure, stashes the raw payload on `window.__goalRawBackup`, and
   **blocks both `save()` and every cloud push** until the data is understood.
2. Empty remote payloads can't replace local work (above).
3. `migrate()` is checked against a battery of save shapes — v1 arrays, v2 with an ISO
   `lastWeek`, v3, current v4, garbage settings, orphaned `parentId`, steps carrying
   weights, an empty object. Re-run that whenever you touch it.

Recovery, if it happens again: the pre-wipe value survives in an uncompacted leveldb
sstable. Copy `%APPDATA%\Goal Setter\Local Storage`, delete the newest `.log` from the
copy, and open it with a throwaway Electron script pointed at that userData.

## Build & deploy

```powershell
npm start                 # dev
update.bat                # rebuild + reinstall the local Windows app (run after code changes)
deploy-mobile.bat         # build www/ and deploy the PWA to Netlify
npm run build:web         # just assemble www/
node scripts/release-notes.js v2.7.0   # preview a release's notes
```

**Two different packagers, and the difference bites.** `update.bat` runs
`npm run package` (**electron-packager**), which ships the whole folder minus an ignore
list. Releases run `npm run dist` / `dist:mac` (**electron-builder**), governed by the
`build.files` **whitelist** in `package.json`. A file missing from that whitelist is
absent from the release installer while working perfectly in every local build — which
is how 2.7.0 shipped without `objective.*` and nobody noticed. `npm run check:files`
([scripts/check-package-files.js](scripts/check-package-files.js)) walks every
`<script src>`/`<link href>` in the packaged HTML, the manifest's icons and main.js's
`loadFile`/preload paths, and fails the build if any of them is off the list. It runs
automatically as part of `dist` and `dist:mac`. **Add new runtime files to `build.files`.**

Note the local `electron-builder` run can't finish NSIS packaging on this machine —
extracting winCodeSign needs symlink privileges — but it writes `app.asar` first, so
`npx electron-builder --win --dir` plus an asar read is still a valid way to check what
would ship. CI runners are unaffected.

**Releases:** push a `v*` tag → `.github/workflows/release.yml` builds the Windows
installer + macOS artifacts and publishes a GitHub Release whose body comes from that
version's CHANGELOG section. `build-mac.yml` is manual-only.

**macOS packaging:** arm64 ships as `.dmg`, Intel as `.zip` — electron-builder's DMG step
fails cross-building x64 on Apple Silicon runners. `build/afterPack.js` ad-hoc signs the
bundle. This has now built cleanly for 2.3.0 through 2.7.1; treat it as solved.

## Open items

1. **Older releases** (v1.0.0, v2.0.0, v2.1.0) still have generic notes. Backfill with
   `node scripts/release-notes.js v2.1.0` and paste into each release's Edit box.
2. **`gh` is not installed**, so releases can't be watched or PRs opened from the CLI.
   The GitHub REST API over `Invoke-RestMethod` works fine unauthenticated for reads.
3. A **"Blocked" view** (weight-sized tetris blocks) was built, reviewed and **scrapped**.
   Don't reintroduce unless asked.

**Desktop-only settings** are hidden by one list in `applyPlatformUI()`
([renderer.js](renderer.js)), keyed off `window.goalAPI` being absent — which is exactly
the PWA condition, so loading `index.html` in a plain browser *is* the mobile case. Hide a
whole card (`#objectiveCard`, `#widgetCard`, `#dailyLogCard`) rather than its controls one
by one — doing the latter leaves an empty heading behind — and tag it with
`<span class="desktop-only-tag">desktop only</span>`. `sw.js` is network-first, so a UI
change needs no `CACHE` bump to reach phones.

**A UI control must never display a value the state doesn't hold.** `renderSettings()` used
to set the objective project dropdown's `value` to a fallback without writing it back, so
the select showed a project that `settings.objectiveProject` didn't hold — and since the
option already looked chosen, no `change` event was ever fired to correct it and the widget
stayed empty for good. If you catch yourself writing `el.value = state.x || fallback`, write
the fallback into the state too.

**Testing the widgets end-to-end** is worth the trouble, since neither the static preview
nor Electron alone covers the IPC seam. A throwaway entry script at the project root that
does `require('./main.js')`, waits for `app.whenReady()`, then drives
`mainWindow.webContents.executeJavaScript()` to seed state and
`BrowserWindow.getAllWindows()` to find the widget window and read its DOM back, works
well. Run it with `--user-data-dir` pointed somewhere disposable so it can't touch the real
save. Keep it at the root — `loadFile()` resolves against the app path, so a harness under
`scripts/` breaks it.

## Environment gotchas (learned the hard way)

- **PowerShell mangles git here-strings** → write the message to a file, `git commit -F`.
- **Never rewrite source files through PowerShell.** `Get-Content`/`Set-Content` round-trip
  UTF-8 through the ANSI codepage and destroy every em-dash, smart quote and symbol
  (`＋ ✎ ✕ ⠿ ↻`), and PS 5.1 adds a BOM that becomes a stray `?` on line 1. Use the editor
  tools. If it happens, `node --check` every file to find it.
- **git writes progress to stderr**, so PowerShell reports a scary exit code even on
  success. Read the output lines, not the code.
- The packaged `.exe` file date is Electron's binary date, not your build date. To verify
  what shipped, read `resources/app.asar` and grep for a known symbol.
- **`codesign` writes its report to stderr** — use `spawnSync` and concatenate both streams.
- Browser-pane **screenshots need the pane visible**. When it isn't, the page also stops
  compositing, which **freezes CSS transitions at their start value** — so `body`'s
  background/colour read as the *previous* theme. Inject
  `*{transition:none!important}` before measuring anything themed.
- When measuring an element's own fill (a dot, a checkbox), composite from its **parent** —
  including its own background gives a ratio of exactly 1.0.

## Working style that fit this project

Make the change; verify it in the static preview with **real assertions, not assumptions**
— seed state via `javascript_tool`, then read back computed styles, geometry and DOM;
run the contrast sweep across all four themes; boot Electron headlessly for console
errors; run `update.bat`; then commit. Keep `CHANGELOG.md` current — release notes are
generated from it. Flag trade-offs plainly rather than silently choosing, and say what was
verified versus assumed.
