# Changelog

All notable changes to Goal Setter are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [2.1.0] — 2026-07-25

### Added

- **Recently deleted** tab in the archives. Deleted tasks are kept for 30 days with
  their category, weight and deletion time, and can be restored or purged
  individually — or all at once, with undo.

### Changed

- Routine tasks no longer offer a **Restore** button in the archives: they're a
  fixed everyday list, so restoring one would only duplicate the recurring task
  that already exists.

### Fixed

- **macOS builds now launch.** The app was published with no code signature at
  all, and macOS refuses to run an unsigned Apple Silicon binary — it reported the
  app as untrusted or damaged, and clearing the quarantine flag with `xattr -cr`
  couldn't help because the signature was missing rather than blocked. Builds are
  now **ad-hoc signed**. You'll still get one "unidentified developer" prompt
  (the build isn't notarised); on macOS 15 and later, allow it via
  **System Settings → Privacy & Security → Open Anyway**.
- **The floating widget listed tasks in a different order from the app.** Both now
  share one ordering — due today first, then by deliver-by date — and the widget
  shows each task's due date.
- **Deliver-by dates on task rows ignored the chosen date format**, showing a
  shortened form instead. They now use the format you picked. (The widget still
  uses a compact form, since it's only a couple of hundred pixels wide.)
- **A device still running 1.x could wipe 2.x data.** The two versions store tasks
  in incompatible shapes, so an old client would push its own empty-looking state
  over your tasks. 2.x now rejects outdated payloads and republishes its own state
  instead.

## [2.0.0] — 2026-07-25

A large restructure around user-defined categories. **Existing saves migrate
automatically** — daily, scheduled, weekly and routine tasks are moved into the
matching categories with their recurrence and dates intact.

### Added

- **Taskmaster is now the main screen**, with a toggle between two layouts:
  **Categories** (a box per category, each with its due-today tasks called out in a
  highlighted panel) and **Due date** (everything pooled into one due-today box,
  then grouped by date).
- **Deliver-by dates shown on every task row**, beside the weight, with today and
  overdue called out.
- **Selectable date format** (Settings → Interface) with eleven options, from
  `Sat, Jul 25` to fully written-out `Saturday, 25th July`, plus day/month/year,
  slash and ISO styles. Applies everywhere dates appear, with a live preview.
- **Weekly calendar** that opens on the current week, with previous / next / Today
  navigation, replacing the three-month grid.
- **Category reordering** (↑ ↓ in the category manager) — the order there is the
  order of the boxes on Taskmaster. Each row in the manager is tinted with its
  category's colour, so a reorder is obvious at a glance.
- **Category colour coding** from an eight-colour palette, applied to the category
  dot, its checkboxes, the manager row and the widget.
- **Custom categories.** Create your own task groups alongside Weekly, Daily and
  Routine. Their tasks persist until completed or deleted (they don't expire at
  the end of a day), and completing one files it into that category's **own
  archive**, from which it can be restored.
- **Deliver-by dates** on every task, defaulting to today and settable when the
  task is created.
- **Taskmaster page** — everything ahead of you in one list, sorted by deliver-by
  date, with anything **due today grouped at the top**. Recurring tasks show only
  their next uncompleted instance.
- **Create page** — a dedicated task-creation form plus the category manager
  (rename, reorder limits, widget visibility, delete).
- **Settings page** — hide the import button, toggle inline weight notes, set the
  daily log time, choose which categories appear on the widget, and manage
  launch-at-startup.
- **Weight notes** — free text alongside each weight to record why a task matters
  and what happens if it slips. Shown under the task and included in the daily log.
- **Expand / collapse per category**, with a configurable number of tasks shown
  while collapsed.
- **Sort by weight** (lowest → highest) per category, toggleable from its header.
- **Archive shortcut** in every category header.
- **Show-on-widget toggle** per category, so the floating widget shows exactly the
  groups you care about.
- **Per-day task ordering.** Arrange a specific day's tasks without affecting how
  they're ordered on any other day; the arrangement carries forward until changed.
- **Recategorising** tasks from the edit modal.
- Recurring tasks inside custom categories, with a **daily or weekly cadence
  chosen per task**.

### Changed

- **Weights now run 1–5** (previously 1–3), giving finer control over how much a
  task moves the bar.
- **Routine tasks are no longer weighted.** They're tracked and tickable, but carry
  no score and don't affect the daily bar, so everyday chores can't dilute it.
- The separate **Today / Daily tab has been removed** — its category view now lives
  inside Taskmaster.
- The main screen renders **one box per category** instead of fixed Weekly and
  Daily sections.
- **Restore buttons in the archives** are now labelled and always visible rather
  than an icon that appeared on hover.
- The daily markdown log is grouped by category and includes weight notes.
- Internals split into `model.js` (data), `pages.js` (secondary pages) and
  `renderer.js` (core rendering).

### Fixed

- **Routine tasks no longer scramble when the day rolls over.** Reordering used to
  renumber only the tasks visible that day into a shared order field, so on days
  when a different subset was active those numbers collided and the sort tie-broke
  arbitrarily. Day-scoped lists now store their order per date.

### Removed

- Notion note creation (the per-task button and the task-creator checkbox) was
  dropped before release. Pasting a checklist to import tasks remains, and can be
  hidden from Settings.

## [1.0.0] — 2026-07-17

First public release. Windows installer and macOS disk images published from CI.

### Added

- **Weighted progress tracking.** Tasks are weighted rather than merely counted, so
  finishing one substantial task moves the day more than several trivial ones.
- **Daily and weekly progress bars** — a purple vertical daily bar with 25% tick
  marks whose container grows as you plan more (up to a threshold that scales with
  the window), and a neon-green weekly bar shown both across the top and beside the
  daily bar.
- **Recurring tasks**, daily or weekly, with optional specific weekdays.
- **Routine tier** for trivial everyday chores, ranked below scheduled and
  recurring work so what matters stays visible.
- **Calendar** covering last, current and next month. Click a day to view, add,
  edit, reorder or delete everything on it, including scheduling weekly tasks for
  future weeks.
- **Archives** for the last 7 days and 4 weeks, with completion bars and one-click
  re-adding.
- **Always-on-top widget** — a compact sticky note floating above other windows
  (including full-screen apps on macOS) showing top tasks, with checkboxes.
- **Live sync** across devices via Supabase, with offline support and per-account
  row-level isolation. Sync is optional; without an account everything stays local.
- **Progressive Web App** build for phones and tablets, installable to the home
  screen and usable offline.
- **Daily markdown log** compiled automatically at a configurable time.
- **Google Calendar export** (`.ics`) of weight-2-and-above tasks.
- **Import** tasks by pasting a Notion or markdown checklist.
- Drag-to-reorder, quick add, undo on delete, dark and light themes, and a
  launch-at-startup toggle.

### Fixed

- Random UI refreshes caused by a no-op save firing every minute and by sync echoes
  being misidentified as remote changes.
- The widget not appearing above full-screen apps on macOS.
- Recurring tasks showing as already completed when viewing a future day.
- macOS CI builds failing while attempting to publish a release.

[Unreleased]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/releases/tag/v1.0.0
