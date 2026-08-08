# Changelog

All notable changes to Goal Setter are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Deliver-by dates are optional.** A task saved without one becomes a someday
  item: visible in its category under a **No date** heading, never overdue, and
  excluded from progress. The task dialog now opens with the date blank and
  offers **Clear** to remove one.

### Changed

- **Every category can be renamed and deleted, including Daily and Weekly.**
  They were previously resurrected on every load. Deleting one moves its tasks to
  another category — never into Routine, which would strip their dates — with an
  undo. The last remaining category can't be deleted.
- **Routine carries no deliver-by date at all.** A chore recurs rather than
  falling due, so the date field is hidden for Routine and existing routine dates
  are dropped on upgrade. Routine tasks no longer show a date badge.

- **Unfinished work carries forward instead of vanishing at midnight.** Rollover
  used to delete any past-dated one-off task, so a missed task simply disappeared
  and nothing could ever *be* overdue. Incomplete tasks now persist and stay
  overdue; only completed ones are cleared, once archived.
- **Overdue has its own callout**, in the danger colour, above due-today — in the
  category boxes and as its own section in the due-date view. Folding overdue
  into "Due today" would have understated how far behind you were.

### Fixed

- The Taskmaster due-date view no longer silently omits tasks without a date;
  they group under **No date** at the bottom.
- Calendar export skips undated tasks rather than failing on them.
- Ticking an overdue task no longer makes it disappear on the spot; it stays
  until rollover, like anything else completed today.

### Internal

- Save format is now **v3**. A v2 client is refused as a sync source, exactly as
  v1 already was: v2 stamps today's date onto anything undated, which would
  re-date the whole someday pile and give every routine chore a deadline. A fresh
  install with no local tasks still adopts and upgrades cloud data.

## [2.4.0] — 2026-08-07

### Added

- **The sticky widget can condense itself.** A stack of category boxes gets
  unwieldy past two or three, so **Settings → Widget** now offers three layouts:
  a section per category (the existing behaviour, still the default), a single
  category, or one merged shortlist of the top tasks across the ticked
  categories.
- The shortlist is ranked the way the app thinks — unfinished first, then
  overdue, then due today, then heaviest. Routine carries no weight by design,
  so it settles at the bottom of its group rather than crowding out real work.
  Length is adjustable from 1 to 12.
- Every row in the merged list is **colour-coded by category** with a solid dot,
  and names its category on hover — two categories can share a palette colour.
  The checkbox only shows its colour once ticked, so an unticked row needed a
  marker of its own.

### Fixed

- **Category dots are visible in light mode.** The vivid palette all but vanished
  on white — the neon dot measured 1.33:1, far under the 3:1 minimum for a
  non-text indicator, with amber, teal and grey also failing. Light mode now uses
  darkened variants (all eight now clear 3.5:1) while dark mode keeps the vivid
  ones. This also fixes the section-header dots, which shared the same colours.

## [2.3.0] — 2026-07-31

### Changed

- **Deliver-by dates and weights are readable and prominent.** Every one of these
  chips previously failed the WCAG AA contrast minimum in both themes — the plain
  deliver-by badge sat at 2.3:1 in light mode and 2.7:1 in dark, at 10.5px. They now
  measure between 4.8:1 and 9.5:1 across the Taskmaster, Calendar, Archives and the
  sticky widget, at 12px, with the date and the number both bolder.
- **Weight now reads as a ramp you can scan without reading the number:** 1–2 stay
  quiet, 3 is tinted, 4–5 are filled purple. Only 4 and 5 used to be distinguished.
- On phones the weight and deliver-by chips **drop to their own line** beneath the
  task title. They never shrink, so at narrow widths they had been squeezing the
  title down to nothing.

## [2.2.0] — 2026-07-31

### Added

- **Days remaining** shown alongside deliver-by dates, with
  **Settings → Deliver-by dates show** offering date and days, date only, or days
  only. Counts are measured at local midnight, so "today" is always exact.

### Fixed

- **macOS builds are ad-hoc signed correctly, so the app launches.** An earlier
  attempt signed Electron's nested frameworks one at a time, which left their inner
  binaries unsigned and invalidated the signature on the bundle as a whole. The
  bundle is now signed in one pass and the build reports the result.

### Changed

- Release notes on GitHub are now generated from this changelog, so each release
  lists exactly what changed since the previous one instead of repeating a generic
  description.

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

[Unreleased]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.4.0...HEAD
[2.4.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/releases/tag/v1.0.0
