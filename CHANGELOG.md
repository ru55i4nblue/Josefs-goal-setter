# Changelog

All notable changes to Goal Setter are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Sync tells you what it's doing.** The account area now shows "Synced just
  now", "Reconnecting…" or the actual error, and there's a **↻ Sync now** button
  to check the cloud on demand.

### Fixed

- **Sync could stop silently and stay stopped until a restart.** Live updates
  ride a websocket; if it dropped — a laptop sleeping, a network change — nothing
  noticed, nothing reconnected, and nothing said so. The connection is now
  watched and rebuilt with a backoff, and the app re-checks the cloud when it
  regains focus, when the network returns, and every few minutes regardless.
- **Sync failures were invisible.** A rejected save to the cloud, a failed read
  and a dead connection were all discarded without a message, so a broken sync
  looked exactly like a working one. All three now surface.
- **An update arriving mid-edit was thrown away.** If another device's change
  landed within two seconds of you typing, it was dropped and lost until the next
  restart; it's now re-fetched once your edit settles.
- The signed-in email failed the contrast floor in every theme (2.72:1 in light,
  needs 4.5); it now reads 7.42:1.

## [2.9.0] — 2026-08-16

### Added

- **Order the Big Picture's projects.** A switch beside ＋ New project sorts the
  cards **Manual** (the order you added them), **Date** or **Category**. Date
  uses each project's own deadline, falling back to its last sub-task, with
  undated projects last — the same way undated work sinks everywhere else.
  Category follows your category column order. The choice sticks, and the
  widget's project picker and the Settings dropdown follow the same order.

### Fixed

- **A corrupted `settings` value could lock the app read-only.** If `settings`
  arrived as something other than an object — from a damaged save or an odd sync
  payload — loading threw, which by design blocks every write to protect your
  data. It's now replaced with defaults instead.
- The idle label on the Taskmaster and Big Picture view switches was below the
  contrast floor in the light theme (3.68:1, needs 4.5); it now reads 6.32:1.

## [2.8.0] — 2026-08-15

### Added

- **Switch project from the Current objective widget.** Click the project name
  for a list of your projects, each with its category's colour, and pick one.
  The choice goes straight back to the app and Settings follows it. With only
  one project the name stays inert rather than offering a menu of one.
- **The widget is colour-coded to its project's category** — the card's left
  edge and the progress fill both take the category colour, the way a Big
  Picture card does.
- **The Current objective widget lists each task's steps beneath it**, always and
  in full, as an indented checklist matching the one inside a project. Ticked
  steps show struck through. They're read-only here — a step carries no weight,
  so ticking one from the widget would move no bar; the task above it is what you
  check off. The widget grows to fit and is now bounded by the height of the
  screen rather than a flat 600px, so a long checklist isn't clipped.

### Fixed

- **"A JavaScript error occurred in the main process" when closing a widget
  after closing the app.** Closing the main window doesn't quit while a widget
  is still up, but the app kept pointing at the closed window and tried to
  notify it, throwing `Object has been destroyed`. Closing either widget in that
  state is now silent, and the widget's ⇱ button reopens the app instead of
  doing nothing.

## [2.7.1] — 2026-08-15

### Fixed

- **The Current objective widget stayed empty.** Settings showed a project as
  chosen while the setting behind it was still unset, so the widget was told
  there was no project and rendered its empty state. Because the dropdown
  already looked right, picking that project changed nothing — there was no
  change to make. It now adopts the project it displays, and the widget falls
  back to your first project rather than blanking if the chosen one is deleted
  or Settings was never opened.

- **The Current objective widget was missing entirely from the installers.** The
  2.7.0 downloads were built without `objective.html`, `objective.js` and
  `objective.css`, so on a released build the widget had nothing to load and
  opened as an empty window. Only builds made locally from source were complete.
  The packaging list now includes them, along with the app icons the page and
  manifest reference, and `npm run dist` refuses to build if anything the app
  loads has been left off the list again.

- **The phone no longer shows an empty "Daily log" card.** Its controls were all
  hidden individually, leaving a heading with nothing beneath it; the whole card
  now hides, like the other desktop-only ones.

- **The phone no longer offers Widget settings it can't use.** The Widget card —
  layout picker, category selector and shortlist length — configures a sticky
  widget that only exists on the desktop app, so it now hides on the PWA
  alongside the Current objective card, and carries the same "desktop only" tag
  on the desktop.

## [2.7.0] — 2026-08-13

### Added

- **Big Picture projects.** A project groups sub-tasks that each carry their own
  weight, deliver-by date and context, and sits pinned at the top of its
  category with a progress bar, the next sub-task's date and the project's own.
- **A Big Picture tab**, showing every project as a card in a grid. Clicking one
  opens it out to fill the pane with its sub-tasks; clicking a pinned project in
  Taskmaster lands in the same place.
- Sub-tasks are **ordinary work**: they count toward the weekly bar, milestones
  and the overdue indicator like anything else. The project itself carries no
  weight, so nothing is counted twice. They appear only inside their project,
  which keeps the Due date view, Calendar and calendar export uncluttered.
- Deleting a project takes its sub-tasks with it, with an Undo restoring both.
- **Steps: a third level.** A task can hold a plain checklist of steps, which
  carry no weight and no date — the task above already holds both, and giving a
  step either would count it twice against the bars. Steps are edited in the task
  dialog, shown indented beneath their task inside a project, and summarised as a
  `☑ 2/3` chip wherever the task appears. Ticking every step doesn't complete the
  task; that stays your call.
- **Every project also gets a bar in the progress column**, beside the milestones
  and wearing its category's colour. Clicking one opens it.
- **A Current objective widget** — a second sticky widget, independent of the
  all-goals one, showing the next few outstanding sub-tasks from a project you
  choose, with its name and progress. Completed sub-tasks drop off rather than
  linger struck through, and a "+N more" line shows what's been trimmed. The
  project and the number shown are set in Settings; both widgets toggle
  separately from the sidebar.
- **An Outer space theme** — jet black, as an ultra-dark mode, with four-pointed
  sparkles and a drift of distant dust behind the app. Nebula violet marks today,
  starlight cyan the week. Surfaces are lifted by a hairline and the faintest
  gradient rather than a shadow, which is invisible on black.

### Fixed

- Sidebar navigation and buttons measured 4.32:1 in light mode, just under the
  minimum. They read from the chip token now, like the rest of the secondary text.
- The progress bars hard-coded the deep end of their gradient, so a bar kept a
  green or violet the rest of a theme had moved away from. Both ends are themed.
- Form labels measured 2.81:1, modal hints 4.48:1, empty-state hints 2.81:1, the
  "optional" field note 2.81:1 and the widget header 4.48:1 — all under the
  minimum, in every theme. They read from the chip token now.

### Internal

- Save format is **v4**. A v3 client is refused as a sync source, as v2 already
  was: v3 has no concept of a sub-task and would present them as loose tasks,
  free to be reordered or deleted out of their project.

## [2.6.0] — 2026-08-09

### Removed

- **The "today" progress bar.** With the main bar covering the week and the
  up-to-date indicator calling out anything overdue, it was saying nothing the
  rest of the column wasn't.

### Fixed

- **Dialogs rendered below the page in the pond theme instead of over it.**
  Lifting the app above the lily pads gave `.modal-overlay` `position: relative`,
  which dropped it out of the viewport and into normal document flow. Only
  elements that are `static` by default are lifted now.

- **A recurring task shows the date it actually next falls due.** A weekly task
  reported today regardless of the day it was set to recur on, because the
  deliver-by simply clamped to the current date. Recurrence is now worked out
  from a single rule — a weekly task is anchored to the weekday of its
  deliver-by, a daily one to the weekdays it repeats on — and a completed
  instance points at the following one rather than the one just finished.

### Changed

- **A completed recurring task clears at the earlier of the next week boundary
  and its own next recurrence.** A Mon/Wed/Fri task ticked on Wednesday returns
  on Friday; a weekly one ticked on Wednesday returns when the week turns over,
  not seven days later. This replaces the old rules, which reset every routine
  and daily-recurring task at midnight and every weekly one at the week turn,
  ignoring the days it was set to repeat on.
- **Routine tasks can move to any category and back.** Membership used to be
  fixed in both directions. Moving into Routine drops the deliver-by date, since
  a chore recurs rather than falling due; moving out lets it take one again.
- **Quick add is gone** from the category boxes; ＋ on the category header and
  New task remain.
- The pond theme has **lily pads and a water lily** drifting behind the app —
  inline artwork, so nothing is fetched, and it never intercepts a click.

## [2.5.0] — 2026-08-09

### Added

- **Deliver-by dates are optional.** A task saved without one becomes a someday
  item: visible in its category under a **No date** heading, never overdue, and
  excluded from progress. The task dialog now opens with the date blank and
  offers **Clear** to remove one.

- **An up-to-date indicator.** A single pill above the bars: green and "Up to
  date" when nothing is past its deliver-by date, red with the count and weight
  when something is. Undated work is a someday pile and never counts against it.
- **Milestone bars.** Up to four, each showing how much of everything due by a
  chosen date is complete — an exam, a hand-in, the end of term. Added in
  Settings, shown above the weekly bar.
- **A pond theme**, joining Light and Dark. Still water and lily pads: cool pale
  surfaces, green-black text, pad green for the week bar and deep water teal for
  today, with soft gradients on the raised surfaces. The theme is now a Settings
  dropdown, and the sidebar button cycles through all three.

### Changed

- **The main progress bar is now the week, and it carries the overdue backlog.**
  Anything still outstanding from before this week counts towards it, so the bar
  can't read 100% while last week's misses are open. Today gets the smaller bar.
  Progress is computed from deliver-by dates rather than category type, which is
  what allows Daily and Weekly to be deleted at all.
- **The week's start day is yours to choose**, in Settings, and the resulting
  range is printed next to the bar. The whole app now agrees on that boundary —
  the bar, the weekly archive, the calendar week and the recurring-task reset.
- **Categories read as distinct cards.** Each has a solid edge in its own colour,
  a tinted header, a shaded body and a full-strength heading. Previously they were
  bare lists separated only by a gap, headed at 13px in a grey measuring 2.8:1.
- **Checkboxes are visible before you tick them.** They were a 1.8px hairline in
  a border grey at roughly 1.3:1 against the page. They're now larger, thicker,
  and carry their category's colour unticked as well as ticked.

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

- **Data loss on upgrade.** Converting `lastWeek` from the old ISO week format
  read a variable declared later in `migrate()`, throwing a reference error.
  `load()` caught it, returned an empty default, and the next save wrote that over
  the real data — then sync pushed the blank state to every other device. The
  conversion now uses `todayKey()` directly.
- **A failed load can no longer destroy a good save.** `load()` used to swallow
  any error and hand back an empty state, which then looked like legitimate data
  to save and to sync. It now records the failure, keeps the raw payload, and
  blocks both saving and cloud pushes until the data is understood.
- **An empty cloud payload can never replace local work**, whatever schema
  version it claims. One device that failed to load its own save could publish a
  blank state that every other device then faithfully adopted. The blank is now
  refused and the good local state is republished in its place.

- The Taskmaster due-date view no longer silently omits tasks without a date;
  they group under **No date** at the bottom.
- Calendar export skips undated tasks rather than failing on them.
- Ticking an overdue task no longer makes it disappear on the spot; it stays
  until rollover, like anything else completed today.
- **The bars column and category headings are legible in every theme.** A sweep
  of 168 elements across all three found 17 pieces of text and 14 indicators
  below the minimum — the weekly percentage was 1.24:1, category dots as low as
  1.06:1, and the section labels, counts and meta lines all sat around 2.8:1.
  They now read from themed text tokens rather than from fill colours, and the
  lowest measurement across all three themes is 4.59:1.
- The bars column stacked the indicator and milestones beside the bars instead of
  above them; it's a proper column now.
- Category colours are legible on a light background. Neon, amber, teal and grey
  were between 2.1:1 and 2.8:1 as a card edge or checkbox outline, under the 3:1
  minimum for a non-text indicator; light mode now uses darkened variants while
  dark mode keeps the vivid palette.

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

[Unreleased]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.9.0...HEAD
[2.9.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.8.0...v2.9.0
[2.8.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.7.1...v2.8.0
[2.7.1]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.7.0...v2.7.1
[2.7.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.6.0...v2.7.0
[2.6.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.5.0...v2.6.0
[2.5.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/ru55i4nblue/Josefs-goal-setter/releases/tag/v1.0.0
