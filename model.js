/* ============================================================
   Goal Setter — data model
   ------------------------------------------------------------
   One flat `tasks` array + a `categories` list. Every task carries a
   categoryId, a weight (1-5), an optional note and an OPTIONAL deliverBy date.
   Undated tasks are a someday pile: visible in their category, never overdue,
   and excluded from every date-scoped progress bar.

   Categories are grouping only — progress is driven by dates, not by category
   type — so every category can be renamed and deleted, including the starters.
   Category types:
     weekly  — lives in the week of its deliverBy date
     daily   — appears on its deliverBy date (or per weekday if recurring)
     routine — a standing list; carries NO date and can't move in/out
     custom  — persists until completed or deleted, then goes to its archive
   ============================================================ */

/* ---------- date helpers ---------- */
const pad = (n) => String(n).padStart(2, '0');
const todayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// A week is identified by the date it starts on, which follows the user's chosen
// start day. Keying it this way makes the progress bar, the weekly archive and
// the recurring-task reset agree on where the week breaks — an ISO week number
// would have pinned them to Monday no matter what the user picked. It also
// compares correctly across a year boundary, which "2026-W01" does not.
function weekKey(d = new Date()) { return weekRangeOf(todayKey(d)).from; }
const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/* ---------- date formatting (user-selectable) ---------- */
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function dateParts(key) {
  const [y, m, d] = key.split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  return {
    y, m, d, key,
    dd: pad(d), mm: pad(m),
    MS: MONTHS_SHORT[m - 1], ML: MONTHS_LONG[m - 1],
    DS: DAYS_SHORT[wd], DL: DAYS_LONG[wd],
    ord: ordinal(d)
  };
}

// `full` is used for headings and day titles; `short` for tight spots like the
// deliver-by badge on a task row.
const DATE_FORMATS = [
  { id: 'wd-mon-d',    full: (p) => `${p.DS}, ${p.MS} ${p.d}`,        short: (p) => `${p.MS} ${p.d}` },
  { id: 'wdl-mon-d',   full: (p) => `${p.DL}, ${p.MS} ${p.d}`,        short: (p) => `${p.MS} ${p.d}` },
  { id: 'wdl-ord-mon', full: (p) => `${p.DL}, ${p.ord} ${p.ML}`,      short: (p) => `${p.ord} ${p.MS}` },
  { id: 'wd-d-mon',    full: (p) => `${p.DS} ${p.d} ${p.MS}`,         short: (p) => `${p.d} ${p.MS}` },
  { id: 'ord-mon',     full: (p) => `${p.ord} ${p.ML}`,               short: (p) => `${p.ord} ${p.MS}` },
  { id: 'd-mon-y',     full: (p) => `${p.d} ${p.ML} ${p.y}`,          short: (p) => `${p.d} ${p.MS}` },
  { id: 'mon-d-y',     full: (p) => `${p.ML} ${p.d}, ${p.y}`,         short: (p) => `${p.MS} ${p.d}` },
  { id: 'mon-d',       full: (p) => `${p.MS} ${p.d}`,                 short: (p) => `${p.MS} ${p.d}` },
  { id: 'dmy-slash',   full: (p) => `${p.dd}/${p.mm}/${p.y}`,         short: (p) => `${p.dd}/${p.mm}` },
  { id: 'mdy-slash',   full: (p) => `${p.mm}/${p.dd}/${p.y}`,         short: (p) => `${p.mm}/${p.dd}` },
  { id: 'iso',         full: (p) => p.key,                            short: (p) => `${p.mm}-${p.dd}` }
];
const DEFAULT_DATE_FORMAT = 'wd-mon-d';   // Sat, Jul 25

function dateFormat() {
  const id = (typeof state !== 'undefined' && state.settings && state.settings.dateFormat) || DEFAULT_DATE_FORMAT;
  return DATE_FORMATS.find((f) => f.id === id) || DATE_FORMATS[0];
}
// A task can carry no deliver-by date at all; every formatter has to survive it.
const NO_DATE_LABEL = 'No date';
const prettyDate = (key) => (key ? dateFormat().full(dateParts(key)) : NO_DATE_LABEL);
const shortDate = (key) => (key ? dateFormat().short(dateParts(key)) : NO_DATE_LABEL);
// sample renderings for the settings picker
const formatSample = (id) => {
  const f = DATE_FORMATS.find((x) => x.id === id) || DATE_FORMATS[0];
  return f.full(dateParts('2026-07-25'));
};

/* ---------- how far away a deliver-by date is ---------- */
// Compared at local midnight so a task due "today" reads as 0 regardless of clock
// time, and DST shifts can't push a count off by one.
function daysUntil(key) {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  const [ty, tm, td] = todayKey().split('-').map(Number);
  return Math.round((new Date(y, m - 1, d) - new Date(ty, tm - 1, td)) / 864e5);
}
function relativeDue(key) {
  const n = daysUntil(key);
  if (n === null) return NO_DATE_LABEL;
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday · overdue';
  if (n < 0) return `${-n} days overdue`;
  return `in ${n} days`;
}
// Compact form for the sticky widget, which has very little room.
function relativeDueShort(key) {
  const n = daysUntil(key);
  if (n === null) return '';                    // widget has no room for "no date"
  if (n === 0) return 'today';
  return n < 0 ? `${-n}d over` : `${n}d`;
}

const DUE_DISPLAYS = [
  ['both', 'Date and days remaining'],
  ['date', 'Date only'],
  ['days', 'Days remaining only']
];
function dueLabel(key) {
  if (!key) return NO_DATE_LABEL;               // both halves would read the same
  const mode = (state.settings && state.settings.dueDisplay) || 'both';
  if (mode === 'date') return prettyDate(key);
  if (mode === 'days') return relativeDue(key);
  return `${prettyDate(key)} · ${relativeDue(key)}`;
}
/* ---------- themes ---------- */
const THEMES = [['light', 'Light'], ['dark', 'Dark'], ['pond', 'Pond'], ['space', 'Outer space']];
const THEME_ICONS = { light: '☀️', dark: '🌙', pond: '🪷', space: '✦' };
// Themes in the dark family wear `dark` as well as their own class, so every
// existing body.dark rule applies and they only override what differs.
const DARK_FAMILY = ['dark', 'space'];
const themeId = (t) => (THEMES.some(([id]) => id === t) ? t : 'light');
const themeLabel = (t) => (THEMES.find(([id]) => id === themeId(t)) || THEMES[0])[1];

/* ---------- how the sticky widget condenses itself ---------- */
// A stack of category boxes gets unwieldy once there are more than two or three,
// so the widget can also show one category, or a single merged shortlist.
const WIDGET_MODES = [
  ['categories', 'A section per category'],
  ['single', 'One category only'],
  ['top', 'Top tasks across categories']
];
const WIDGET_TOP_MIN = 1;
const WIDGET_TOP_MAX = 12;

function weekKeyFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return weekKey(new Date(y, m - 1, d));
}
function weekdayOf(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}
function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d + n));
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
// First day of the week containing `key`, per the user's chosen start day.
function mondayOf(key) { return weekRangeOf(key).from; }
function weekDays(startKey) { return Array.from({ length: 7 }, (_, i) => addDays(startKey, i)); }
// "3 – 9 Aug", for labelling a week without spelling both dates out in full.
function weekRangeLabel(startKey) {
  return `${shortDate(startKey)} – ${shortDate(addDays(startKey, 6))}`;
}

/* ---------- defaults ---------- */
// Selectable category colours (id -> label). Also used for swatches in the UI.
const CAT_COLORS = [
  ['purple', 'Purple'], ['neon', 'Green'], ['blue', 'Blue'], ['amber', 'Amber'],
  ['pink', 'Pink'], ['teal', 'Teal'], ['red', 'Red'], ['gray', 'Grey']
];

const BUILTIN_CATEGORIES = [
  { id: 'weekly',  name: 'Weekly',  builtin: true, type: 'weekly',  color: 'neon',   widget: true, expanded: false, sort: 'manual', limit: 2 },
  { id: 'daily',   name: 'Daily',   builtin: true, type: 'daily',   color: 'purple', widget: true, expanded: false, sort: 'manual', limit: 3 },
  { id: 'routine', name: 'Routine', builtin: true, type: 'routine', color: 'gray',   widget: true, expanded: false, sort: 'manual', limit: 2 }
];

function defaultState() {
  return {
    version: 4,
    categories: BUILTIN_CATEGORIES.map((c) => ({ ...c })),
    projects: [],       // big picture projects; their sub-tasks live in `tasks`
    tasks: [],
    archive: [],        // completed tasks from custom categories
    deleted: [],        // recently deleted tasks, newest first (pruned after 30 days)
    dailyArchive: [],   // [{date, tasks:[snapshot]}]
    weeklyArchive: [],  // [{week, tasks:[snapshot]}]
    dayOrders: {},      // { 'YYYY-MM-DD': { taskId: index } } — per-day manual order
    settings: {
      showImport: true, showWeightNotes: true,
      dateFormat: DEFAULT_DATE_FORMAT, dueDisplay: 'both',
      widgetMode: 'categories', widgetCategory: 'daily', widgetTop: 5,
      weekStart: 1, milestones: []
    },
    taskmasterView: 'categories',   // 'categories' (per-category boxes) | 'grouped' (one due-today box)
    lastDay: todayKey(),
    lastWeek: weekKey(),
    loggedDays: [],
    logTime: '22:00',
    widgetOpen: false,
    theme: 'light'
  };
}

/* ---------- migration from the v1 shape ---------- */
function migrate(s) {
  // Categories are now just grouping — progress is driven by dates, so none of
  // them is load-bearing and any can be deleted. We only seed the starter set
  // when there are no categories at all; we no longer resurrect them, which is
  // what used to make Daily and Weekly undeletable.
  if (!Array.isArray(s.categories) || !s.categories.length) s.categories = BUILTIN_CATEGORIES.map((c) => ({ ...c }));
  BUILTIN_CATEGORIES.forEach((b) => {
    const found = s.categories.find((c) => c.id === b.id);
    if (found) Object.assign(found, { type: found.type || b.type, color: found.color || b.color });
  });
  s.categories.forEach((c) => {
    if (typeof c.widget !== 'boolean') c.widget = true;
    if (typeof c.expanded !== 'boolean') c.expanded = false;
    if (!c.sort) c.sort = 'manual';
    if (typeof c.limit !== 'number') c.limit = 3;
    if (!c.type) c.type = 'custom';
  });
  if (!Array.isArray(s.tasks)) s.tasks = [];
  if (!Array.isArray(s.archive)) s.archive = [];
  if (!Array.isArray(s.deleted)) s.deleted = [];
  // recently-deleted is a safety net, not storage — drop anything over 30 days old
  const cutoff = addDays(todayKey(), -30);
  s.deleted = s.deleted.filter((t) => (t.deletedAt || '9999') >= cutoff).slice(0, 200);
  if (!s.dayOrders || typeof s.dayOrders !== 'object') s.dayOrders = {};
  if (!s.settings) s.settings = { showImport: true, showWeightNotes: true };
  if (typeof s.settings.showImport !== 'boolean') s.settings.showImport = true;
  if (typeof s.settings.showWeightNotes !== 'boolean') s.settings.showWeightNotes = true;
  if (!DATE_FORMATS.some((f) => f.id === s.settings.dateFormat)) s.settings.dateFormat = DEFAULT_DATE_FORMAT;
  if (!DUE_DISPLAYS.some(([id]) => id === s.settings.dueDisplay)) s.settings.dueDisplay = 'both';
  // existing saves keep the stacked layout they already have
  if (!WIDGET_MODES.some(([id]) => id === s.settings.widgetMode)) s.settings.widgetMode = 'categories';
  if (typeof s.settings.widgetCategory !== 'string') s.settings.widgetCategory = 'daily';
  s.settings.widgetTop = Math.max(WIDGET_TOP_MIN,
    Math.min(WIDGET_TOP_MAX, Math.round(Number(s.settings.widgetTop)) || 5));
  if (!WEEK_STARTS.some(([d]) => d === s.settings.weekStart)) s.settings.weekStart = 1;
  // Milestones: user-defined "everything due by this date" bars. Anything without
  // a usable date is dropped rather than allowed to break the bars column.
  if (!Array.isArray(s.settings.milestones)) s.settings.milestones = [];
  s.settings.milestones = s.settings.milestones
    .filter((m) => m && /^\d{4}-\d{2}-\d{2}$/.test(m.date))
    .map((m) => ({ id: m.id || uid(), name: String(m.name || 'Milestone').slice(0, 40), date: m.date }))
    .slice(0, MILESTONE_MAX);
  // lastWeek used to be an ISO week number ("2026-W32"). Rewrite it to the new
  // start-date form for the CURRENT week, so upgrading doesn't look like a week
  // boundary and fire a spurious archive + recurring reset.
  if (/^\d{4}-W\d{2}$/.test(s.lastWeek || '')) {
    // NB: use todayKey() directly — `today` is declared further down, so reading
    // it here threw a TDZ ReferenceError, which load()'s catch turned into a
    // silent reset to defaultState().
    const now = todayKey();
    const back = (weekdayOf(now) - s.settings.weekStart + 7) % 7;
    s.lastWeek = addDays(now, -back);
  }
  if (s.taskmasterView !== 'grouped') s.taskmasterView = 'categories';
  s.theme = themeId(s.theme);

  // --- fold the old v1 arrays into the unified task list (once) ---
  const today = s.lastDay || todayKey();
  const adopt = (t, categoryId, extra = {}) => ({
    id: t.id || uid(),
    title: t.title,
    weight: Math.max(1, Math.min(5, t.weight || 1)),
    note: t.note || '',
    categoryId,
    recurring: !!t.recurring,
    cadence: extra.cadence || (t.recurring ? (categoryId === 'weekly' ? 'weekly' : 'daily') : null),
    days: Array.isArray(t.days) ? t.days : [],
    deliverBy: extra.deliverBy || t.date || t.deliverBy || today,
    done: !!t.done,
    completedAt: t.completedAt || null,
    order: typeof t.order === 'number' ? t.order : 0,
    createdAt: t.createdAt || null
  });

  if (Array.isArray(s.dailyTasks)) {
    s.dailyTasks.forEach((t) => {
      if (!t || !t.title) return;
      s.tasks.push(adopt(t, t.routine ? 'routine' : 'daily', { cadence: 'daily' }));
    });
    delete s.dailyTasks;
  }
  if (Array.isArray(s.scheduled)) {
    s.scheduled.forEach((t) => { if (t && t.title) s.tasks.push(adopt(t, 'daily')); });
    delete s.scheduled;
  }
  if (Array.isArray(s.weeklyTasks)) {
    s.weeklyTasks.forEach((t) => {
      if (!t || !t.title) return;
      s.tasks.push(adopt(t, 'weekly', { cadence: 'weekly', deliverBy: t.date || today }));
    });
    delete s.weeklyTasks;
  }
  if (Array.isArray(s.scheduledWeekly)) {
    s.scheduledWeekly.forEach((t) => { if (t && t.title) s.tasks.push(adopt(t, 'weekly')); });
    delete s.scheduledWeekly;
  }
  delete s.dailySplit;

  // Big picture projects. Anything without a usable name or a category that
  // still exists is dropped rather than left dangling in the UI.
  if (!Array.isArray(s.projects)) s.projects = [];
  s.projects = s.projects
    .filter((p) => p && p.id)
    .map((p, i) => ({
      id: p.id,
      name: String(p.name || 'Project').slice(0, 60),
      categoryId: s.categories.some((c) => c.id === p.categoryId)
        ? p.categoryId
        : (s.categories[0] ? s.categories[0].id : 'daily'),
      deliverBy: /^\d{4}-\d{2}-\d{2}$/.test(p.deliverBy || '') ? p.deliverBy : null,
      note: typeof p.note === 'string' ? p.note : '',
      order: typeof p.order === 'number' ? p.order : i
    }));

  // normalise every task
  const fallbackCat = s.categories[0] ? s.categories[0].id : 'daily';
  const typeOfCat = (id) => { const c = s.categories.find((x) => x.id === id); return c ? c.type : 'custom'; };
  s.tasks.forEach((t, i) => {
    t.weight = Math.max(1, Math.min(5, Number(t.weight) || 1));
    if (typeof t.note !== 'string') t.note = '';
    // the task's category may since have been deleted — rehome rather than orphan
    if (!t.categoryId || !s.categories.some((c) => c.id === t.categoryId)) t.categoryId = fallbackCat;
    if (!Array.isArray(t.days)) t.days = [];
    // A deliver-by date is optional now; only routine is forced to have none,
    // since a chore recurs rather than falling due on a particular day.
    if (typeOfCat(t.categoryId) === 'routine') t.deliverBy = null;
    else if (!t.deliverBy) t.deliverBy = null;
    if (t.recurring && !t.cadence) t.cadence = typeOfCat(t.categoryId) === 'weekly' ? 'weekly' : 'daily';
    // completedAt is a clock time; recurrence needs the DATE it was completed on
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.completedOn || '')) t.completedOn = t.done ? (s.lastDay || null) : null;
    // a sub-task whose project is gone becomes an ordinary task again rather
    // than an invisible orphan nothing renders
    if (t.parentId && !s.projects.some((p) => p.id === t.parentId)) t.parentId = null;
    if (!t.parentId) t.parentId = null;
    // a sub-task always belongs to its project's category
    if (t.parentId) {
      const owner = s.projects.find((p) => p.id === t.parentId);
      if (owner) t.categoryId = owner.categoryId;
    }
    if (typeof t.order !== 'number') t.order = i;
  });
  s.archive.forEach((t) => { t.weight = Math.max(1, Math.min(5, Number(t.weight) || 1)); });
  s.version = 4;
  return s;
}

/* ---------- big picture projects ----------
   A project is a named container inside a category. Its sub-tasks are ORDINARY
   tasks carrying `parentId`, so they live in state.tasks and count towards the
   weekly bar, milestones and the overdue indicator exactly like anything else.
   The project itself holds no weight, so nothing is counted twice.

   The inverse is the cost: anything listing top-level work has to filter
   sub-tasks out, which is what topLevelTasks() is for. */
const isSubtask = (t) => !!t.parentId;
const topLevelTasks = (list = state.tasks) => list.filter((t) => !isSubtask(t));

function getProject(id) { return (state.projects || []).find((p) => p.id === id); }
function projectsOf(catId) {
  return (state.projects || []).filter((p) => p.categoryId === catId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}
function subtasksOf(projectId) {
  return state.tasks.filter((t) => t.parentId === projectId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

// Weighted, like every other bar in the app.
function projectProgress(p) { return asProgress(subtasksOf(p.id)); }

// The project's own deadline; falls back to the last thing inside it.
function projectDue(p) {
  if (p.deliverBy) return p.deliverBy;
  const dates = subtasksOf(p.id).map(dueDateOf).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}
// The next thing actually needing doing inside the project.
function projectNextDue(p) {
  const dates = subtasksOf(p.id).filter((t) => !t.done).map(dueDateOf).filter(Boolean).sort();
  return dates.length ? dates[0] : null;
}
const projectDone = (p) => {
  const subs = subtasksOf(p.id);
  return subs.length > 0 && subs.every((t) => t.done);
};

/* ---------- category + task queries ---------- */
function getCat(id) { return state.categories.find((c) => c.id === id); }
function catType(id) { const c = getCat(id); return c ? c.type : 'custom'; }
// Any category can be deleted now, so nothing may assume 'daily' exists. Prefer a
// dated, weighted category to land new work in; fall back to whatever is left.
function defaultCatId() {
  const pick = state.categories.find((c) => c.type === 'daily')
    || state.categories.find((c) => c.type !== 'routine')
    || state.categories[0];
  return pick ? pick.id : null;
}
function tasksOf(catId) { return state.tasks.filter((t) => t.categoryId === catId); }

// Is a task active (visible) on a given date?
function activeOn(t, dateKey) {
  const type = catType(t.categoryId);
  // Routine is a standing list: it recurs by its nature and carries no date at
  // all, so it's active every day unless pinned to particular weekdays.
  if (type === 'routine') return !t.days.length || t.days.includes(weekdayOf(dateKey));
  if (type === 'custom') return true;            // persists until completed/deleted
  if (t.recurring) {
    if (t.cadence === 'weekly') return true;     // present every week
    return !t.days.length || t.days.includes(weekdayOf(dateKey));
  }
  // Undated work is a someday pile — real, but it doesn't land on any given day.
  if (!t.deliverBy) return false;
  if (type === 'weekly') return weekKeyFromKey(t.deliverBy) === weekKeyFromKey(dateKey);
  return t.deliverBy === dateKey;
}

// Tasks of a category shown for a given date. Sub-tasks are excluded: they're
// represented by their project everywhere outside the project itself, which
// keeps the calendar, the day modal and the daily log from being swamped by one
// large project. This is the single choke point for all of those.
function catTasksFor(catId, dateKey = todayKey()) {
  return topLevelTasks(tasksOf(catId)).filter((t) => activeOn(t, dateKey));
}

/* ---------- ordering (per-day, collision free) ----------
   Reordering a day-scoped list writes ONLY into dayOrders[date]. The old code
   renumbered the visible subset into the shared `order` field, so on days when a
   different subset was active the numbers collided and the sort tie-broke
   arbitrarily — that's what scrambled Routine after a day rollover. */
function orderOf(t, dateKey) {
  const m = state.dayOrders[dateKey];
  if (m && typeof m[t.id] === 'number') return m[t.id];
  return typeof t.order === 'number' ? t.order : 0;
}
function setDayOrder(tasksInOrder, dateKey) {
  const m = state.dayOrders[dateKey] = state.dayOrders[dateKey] || {};
  tasksInOrder.forEach((t, i) => { m[t.id] = i; });
}
// Permute only the slots the given tasks already occupy (used for non-dated lists).
function setGlobalOrder(tasksInOrder) {
  const slots = tasksInOrder.map((t) => (typeof t.order === 'number' ? t.order : 0)).sort((a, b) => a - b);
  tasksInOrder.forEach((t, i) => { t.order = slots[i]; });
}
// Keep dayOrders bounded, and carry the latest arrangement into the new day so a
// routine order you set once keeps applying until you change it again.
function rollDayOrders(fromKey, toKey) {
  if (state.dayOrders[fromKey] && !state.dayOrders[toKey]) {
    state.dayOrders[toKey] = { ...state.dayOrders[fromKey] };
  }
  const cutoff = addDays(toKey, -14);
  Object.keys(state.dayOrders).forEach((k) => { if (k < cutoff) delete state.dayOrders[k]; });
}

function sortInCat(list, cat, dateKey) {
  const byWeight = cat && cat.sort === 'weight';
  return list.slice().sort((a, b) =>
    (a.done ? 1 : 0) - (b.done ? 1 : 0)
    || (byWeight ? a.weight - b.weight : 0)
    || orderOf(a, dateKey) - orderOf(b, dateKey));
}

/* ---------- progress ---------- */
const sumWeight = (l) => l.reduce((a, t) => a + t.weight, 0);
const sumDone = (l) => l.reduce((a, t) => a + (t.done ? t.weight : 0), 0);

// Routine is deliberately weightless — those chores are tracked but never scored,
// so they can't dilute the daily bar.
function catHasWeight(catId) { return catType(catId) !== 'routine'; }

function dailyTasksToday(dateKey = todayKey()) {
  return state.categories
    .filter((c) => c.type === 'daily' || c.type === 'routine')
    .flatMap((c) => catTasksFor(c.id, dateKey));
}
// only weighted categories drive the bar
function scoredDailyTasks(dateKey = todayKey()) {
  return dailyTasksToday(dateKey).filter((t) => catHasWeight(t.categoryId));
}
function weeklyTasksNow(dateKey = todayKey()) {
  return state.categories.filter((c) => c.type === 'weekly').flatMap((c) => catTasksFor(c.id, dateKey));
}
/* ---------- date-driven progress ----------
   Progress keys off deliver-by dates, not category type. That's what lets Daily
   and Weekly be deleted like any other category, and it's why an undated task
   counts towards nothing: it has no date to fall inside a range. */

// Which weekday the week turns over on. 0 = Sunday … 6 = Saturday.
const WEEK_STARTS = [
  [1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'],
  [5, 'Friday'], [6, 'Saturday'], [0, 'Sunday']
];
function weekStartDay() {
  // defaultState() and the calendar's initial week both run while `state` is
  // still in its temporal dead zone, so this has to survive being asked early.
  // `typeof` doesn't help — it throws on a TDZ binding — hence the try.
  let n = 1;
  try { if (state && state.settings) n = Number(state.settings.weekStart); } catch { n = 1; }
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : 1;
}
function weekRangeOf(dateKey = todayKey()) {
  const back = (weekdayOf(dateKey) - weekStartDay() + 7) % 7;
  const from = addDays(dateKey, -back);
  return { from, to: addDays(from, 6) };
}

// Incomplete, dated and weighted work whose deliver-by has already passed.
function overdueTasks(dateKey = todayKey()) {
  return state.tasks.filter((t) => !t.done && hasDate(t)
    && catHasWeight(t.categoryId) && dueDateOf(t) < dateKey);
}

const asProgress = (l) => {
  const total = sumWeight(l);
  return { total, done: sumDone(l), pct: total ? (sumDone(l) / total) * 100 : 0, count: l.length };
};

// Weighted progress over dated tasks falling in [fromKey..toKey]. With
// includeOverdue, anything still outstanding from before the range is counted
// too — a backlog you're carrying is part of where you actually stand.
function progressForRange(fromKey, toKey, includeOverdue) {
  const tk = todayKey();
  const pool = state.tasks.filter((t) => {
    if (!catHasWeight(t.categoryId) || !hasDate(t)) return false;
    const d = dueDateOf(t);
    if (d >= fromKey && d <= toKey) return true;
    return !!includeOverdue && !t.done && d < tk && d < fromKey;
  });
  return asProgress(pool);
}
function progressForDate(dateKey = todayKey()) { return progressForRange(dateKey, dateKey, false); }

// Everything dated on or before `dateKey`, however far back — "how much of the
// work due by my deadline is actually done".
const EPOCH_KEY = '0000-01-01';
const MILESTONE_MAX = 4;
function progressUpTo(dateKey) { return progressForRange(EPOCH_KEY, dateKey, false); }

// Kept as named wrappers so existing callers (the widget sections) keep reading
// naturally; both are now date-scoped rather than category-scoped.
function dailyProgress() { return progressForDate(todayKey()); }
function weeklyProgress() {
  const w = weekRangeOf();
  return progressForRange(w.from, w.to, true);
}

/* ---------- taskmaster helpers ---------- */
// For recurring tasks show only the NEXT uncompleted instance date.
/* ---------- recurrence ----------
   `recursOn` is the single answer to "does this land on that date?", used both
   for the deliver-by badge and for deciding when a completed instance clears.
   A weekly task is anchored to the weekday of its deliver-by; without one it
   falls on the first day of the week. */
function recurAnchorWeekday(t) {
  if (t.deliverBy) return weekdayOf(t.deliverBy);
  return weekStartDay();
}
function recursOn(t, dateKey) {
  if (!t.recurring && catType(t.categoryId) !== 'routine') return false;
  if (t.cadence === 'weekly') return weekdayOf(dateKey) === recurAnchorWeekday(t);
  return !t.days || !t.days.length || t.days.includes(weekdayOf(dateKey));
}

// The date this next actually falls due. Previously a weekly task simply
// reported today, whatever weekday it was set to recur on.
function nextInstance(t) {
  const tk = todayKey();
  if (!t.recurring) return t.deliverBy || null;
  // a completed instance points at the following one, not the one just finished
  for (let i = t.done ? 1 : 0; i < 400; i++) {
    const k = addDays(tk, i);
    if (recursOn(t, k)) return k;
  }
  return tk;
}

// When a completed recurring task should clear: the earlier of the next week
// boundary and its own next recurrence. A Mon/Wed/Fri task done on Wednesday
// comes back on Friday; a weekly one done on Tuesday comes back when the week
// turns over, not seven days later.
function resetDueOn(t) {
  const repeats = t.recurring || catType(t.categoryId) === 'routine';
  if (!repeats || !t.done) return null;
  const from = t.completedOn || todayKey();
  const weekReset = addDays(weekRangeOf(from).from, 7);
  for (let i = 1; i < 400; i++) {
    const k = addDays(from, i);
    if (recursOn(t, k)) return k < weekReset ? k : weekReset;
  }
  return weekReset;
}
// null when a task carries no deliver-by date at all. Every caller must cope —
// use hasDate()/compareDue() rather than comparing the result directly.
function dueDateOf(t) {
  // Routine is a standing list — it recurs rather than falling due, so it never
  // reports a date even though it is technically recurring.
  if (catType(t.categoryId) === 'routine') return null;
  return t.recurring ? nextInstance(t) : (t.deliverBy || null);
}
const hasDate = (t) => !!dueDateOf(t);
// Sort helper: dated work first, oldest first; undated sinks to the bottom.
function compareDue(a, b) {
  const da = dueDateOf(a), db = dueDateOf(b);
  if (da && db) return da.localeCompare(db);
  if (da) return -1;
  if (db) return 1;
  return 0;
}
