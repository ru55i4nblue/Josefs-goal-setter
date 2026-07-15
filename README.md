# Goal Setter

A weighted to-do / goal tracker desktop app (Electron) with satisfying progress bars,
daily + weekly recurring tasks, archives, and an automatic nightly markdown log.

## Run (development)

```
npm install
npm start
```

## Standalone app (installed)

Goal Setter is installed as a real Windows app at
`%LOCALAPPDATA%\Programs\Goal Setter\Goal Setter.exe` with Desktop + Start Menu shortcuts —
just double-click, no terminal needed. It's also set to **launch at startup** (toggle this any
time from the sidebar: "Launch at startup: on/off").

### Update the app after code changes

**Just double-click `update.bat`.** It closes the running app, rebuilds from source, reinstalls
to `%LOCALAPPDATA%\Programs\Goal Setter`, and offers to relaunch. (Equivalent to `npm run package`
followed by copying `dist\Goal Setter-win32-x64\` over the installed folder.)

### Uninstall

```
powershell -ExecutionPolicy Bypass -File uninstall.ps1
```

## What it does

- **Top weekly indicator** — a separate horizontal neon-green bar across the top, always present.
- **Side progress bars** — two **vertical** bars stacked in the right third:
  **weekly** (neon green, ~⅓ the size) on top, **daily** (purple) below. Both fill from the bottom up.
  - The daily bar has 25% tick marks and its container **grows in height** as you add tasks,
    capping out at a **dynamic** total-weight threshold (~10, scales with window size).
    Past the cap the fill scales down as more weight is added.
- **Completed tasks sink** to the bottom of each list so outstanding work stays prominent.
- **Calendar** (sidebar → Calendar) — last month, this month, next month. Each day shows its tasks;
  click any current/future day to **schedule a task** for it. Weight-2 tasks are highlighted.
- **Google Calendar export** — on the Calendar page, "Export to Google Calendar" writes an **.ics**
  file (in `Documents/Goal Setter/exports/`) containing every task of **weight ≥ 2** with its date
  (recurring tasks become repeating events). Import that .ics into Google Calendar.
- **Task weighting** — every task is weighted 1–3.
- **Recurring tasks** — mark a task recurring daily or weekly; it auto-resets on rollover.
  Daily recurring tasks can also be set to **specific weekdays** (e.g. Mon/Wed/Fri) — they only
  appear and count on those days.
- **Lists** — weekly tasks sit atop daily tasks; the daily list shows ~3 at a time and scrolls.
- **Archives** (sidebar → Archives) — daily archive keeps the last **7 days**, weekly the last **4 weeks**.
- **Nightly log** — at **10pm** the app auto-compiles a markdown log of every task set/completed
  and the times, saved to `Documents/Goal Setter/logs/goal-log-YYYY-MM-DD.md`.
  Hand that file to Claude to push into Notion. (Sidebar → "Export log" to do it on demand.)
- **Dark / light mode** — toggle in the sidebar. Notion-style UI.

## Importing from Notion

Click the **⇪** button on the Daily tasks section and paste a Notion checklist (or any markdown
list). Lines like `- [ ] Task`, `• Task`, or `1. Task` become tasks. Add a weight with `(2)` or
`!2` at the end of a line.

> Full Notion API/OAuth sync isn't wired up yet — paste-import covers it for now and the
> code is structured so a live Notion connector can be added later.

## Data & file locations

- **Tasks & settings** — stored in the app's `localStorage` (under `%APPDATA%\Goal Setter`).
- **Daily logs** — `Documents\Goal Setter\logs\goal-log-YYYY-MM-DD.md` (auto at 10pm, or on demand).
- **Calendar exports** — `Documents\Goal Setter\exports\goal-setter-YYYY-MM-DD.ics`.

## Cloud sync (optional — required for mobile)

The app persists through a swappable storage layer (`store.js`). By default it's **local only**
(no account, no network). To sync the same tasks across desktop and (future) mobile in real time,
turn on the Supabase backend:

1. Create a free project at <https://supabase.com>.
2. **Settings → API**: copy the **Project URL** and the **anon public** key.
3. Paste both into `supabase-config.js`.
4. **SQL Editor → New query**: paste and run `supabase/schema.sql` (creates the table, row-level
   security, and realtime).
5. Rebuild with `update.bat`.

Now the app shows a sign-in screen. Use the **same email/password on every device** and your tasks
stay in sync live (changes appear on the other device within a second). It still works offline —
the local cache is the fast path, the cloud is the sync layer (last-write-wins).

How it's wired: `store.js` (abstraction) → `supabase-backend.js` (cloud layer over the local cache)
→ one JSON row per user in the `user_state` table, kept live via Supabase Realtime. Leaving
`supabase-config.js` blank keeps everything local with zero behavior change.

## Mobile (PWA — install on any phone, no Mac, no app store)

The app is a **PWA**: hosted on HTTPS, it installs to the iPhone home screen and runs full-screen
with the same Supabase sync. It caches its shell (via `sw.js`) so it opens offline. Desktop-only
features (write log to disk, .ics export, launch-at-startup) auto-hide on mobile.
(It also installs on Android via the browser's "Add to Home screen" if you ever want it.)

### Host it

The deployable folder is **`www/`** (run `npm run build:web` to refresh it). It must be served over
HTTPS (a PWA requires HTTPS for the service worker).

**Updating the phone is NOT automatic** — the desktop app is updated locally by `update.bat`, but the
mobile PWA loads from your hosted site, which must be re-uploaded after any change.

- **One-click (recommended): `deploy-mobile.bat`** — builds `www/` and deploys to Netlify via the
  Netlify CLI. First run walks you through a browser login + linking your site; after that it's a
  double-click. Then fully close and reopen the app on the phone.
- **Manual: Netlify Drop** — drag the `www` folder onto <https://app.netlify.com/drop> (drag it onto
  your existing site to update in place, or you'll get a new URL each time).
- **Cloudflare Pages / Vercel / GitHub Pages** — point them at `www/`.

> Set up Supabase first (keys in `supabase-config.js`) and rebuild `www/`, otherwise the hosted
> app will be local-only and each phone keeps its own data.

### Install on the phone

- **iPhone:** open the URL in **Safari** → Share → **Add to Home Screen**.
- (Android, if ever needed: open in Chrome → menu → **Install app**.)

Launch it from the home-screen icon, sign in with your account, and it syncs with the desktop app.

## Things to know

- **The installed app is a *copy* of the source.** Code edits don't affect it until you rebuild —
  run **`update.bat`** (or `npm run package` + copy). The dev version (`npm start`) and the installed
  app share the same saved data, since they use the same app name.
- **Launch at startup** is controlled by the sidebar toggle ("Launch at startup: on/off"), which
  manages a Windows startup (Run) entry. It's currently **on**.
- **No NSIS installer on this machine.** `npm run dist` (the full `Goal Setter Setup.exe` installer)
  fails here because electron-builder's signing toolkit must create symlinks, which needs Admin or
  Windows **Developer Mode** (Settings → Privacy & security → For developers). The app was instead
  packaged directly and "installed" via copy + shortcuts + startup entry — same end result.
- **Notion import is paste-based**, not a live OAuth sync — paste a checklist via the **⇪** button.
- **Google Calendar export is file-based (.ics)**, not a live sync. It includes only **weight ≥ 2**
  tasks; import the `.ics` into Google Calendar. Recurring tasks become repeating events.
- **Editing a daily task onto specific weekdays that aren't today** removes it from today's list —
  it now belongs to those days (you'll see it on the Calendar and on its matching days).
- **Completed tasks sink** to the bottom of each list; drag the **⠿** handle to reorder the rest.
- **Uninstall** with `uninstall.ps1` (keeps saved data unless you also delete `%APPDATA%\Goal Setter`).
