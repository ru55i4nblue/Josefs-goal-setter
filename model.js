/* ============================================================
   Goal Setter — data model
   ------------------------------------------------------------
   One flat `tasks` array + a `categories` list. Every task carries a
   categoryId, a deliverBy date and a weight (1-5) with an optional note.
   Category types:
     weekly  — lives in the week of its deliverBy date
     daily   — appears on its deliverBy date (or per weekday if recurring)
     routine — like daily but lowest priority; tasks can't move in/out
     custom  — persists until completed or deleted, then goes to its archive
   ============================================================ */

/* ---------- date helpers ---------- */
const pad = (n) => String(n).padStart(2, '0');
const todayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (date.getUTCDay() + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((date - firstThursday) / (7 * 864e5));
  return `${date.getUTCFullYear()}-W${pad(week)}`;
}
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
const prettyDate = (key) => dateFormat().full(dateParts(key));
const shortDate = (key) => dateFormat().short(dateParts(key));
// sample renderings for the settings picker
const formatSample = (id) => {
  const f = DATE_FORMATS.find((x) => x.id === id) || DATE_FORMATS[0];
  return f.full(dateParts('2026-07-25'));
};
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
// Monday of the week containing `key`
function mondayOf(key) { return addDays(key, -((weekdayOf(key) + 6) % 7)); }
function weekDays(mondayKey) { return Array.from({ length: 7 }, (_, i) => addDays(mondayKey, i)); }

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
    version: 2,
    categories: BUILTIN_CATEGORIES.map((c) => ({ ...c })),
    tasks: [],
    archive: [],        // completed tasks from custom categories
    dailyArchive: [],   // [{date, tasks:[snapshot]}]
    weeklyArchive: [],  // [{week, tasks:[snapshot]}]
    dayOrders: {},      // { 'YYYY-MM-DD': { taskId: index } } — per-day manual order
    settings: { showImport: true, showWeightNotes: true, dateFormat: DEFAULT_DATE_FORMAT },
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
  if (!Array.isArray(s.categories) || !s.categories.length) s.categories = BUILTIN_CATEGORIES.map((c) => ({ ...c }));
  // make sure the three built-ins always exist and keep their type
  BUILTIN_CATEGORIES.forEach((b) => {
    const found = s.categories.find((c) => c.id === b.id);
    if (!found) s.categories.push({ ...b });
    else Object.assign(found, { builtin: true, type: b.type, color: found.color || b.color });
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
  if (!s.dayOrders || typeof s.dayOrders !== 'object') s.dayOrders = {};
  if (!s.settings) s.settings = { showImport: true, showWeightNotes: true };
  if (typeof s.settings.showImport !== 'boolean') s.settings.showImport = true;
  if (typeof s.settings.showWeightNotes !== 'boolean') s.settings.showWeightNotes = true;
  if (!DATE_FORMATS.some((f) => f.id === s.settings.dateFormat)) s.settings.dateFormat = DEFAULT_DATE_FORMAT;
  if (s.taskmasterView !== 'grouped') s.taskmasterView = 'categories';

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

  // normalise every task
  s.tasks.forEach((t, i) => {
    t.weight = Math.max(1, Math.min(5, Number(t.weight) || 1));
    if (typeof t.note !== 'string') t.note = '';
    if (!t.categoryId || !s.categories.some((c) => c.id === t.categoryId)) t.categoryId = 'daily';
    if (!Array.isArray(t.days)) t.days = [];
    if (!t.deliverBy) t.deliverBy = today;
    if (t.recurring && !t.cadence) t.cadence = t.categoryId === 'weekly' ? 'weekly' : 'daily';
    if (typeof t.order !== 'number') t.order = i;
  });
  s.archive.forEach((t) => { t.weight = Math.max(1, Math.min(5, Number(t.weight) || 1)); });
  s.version = 2;
  return s;
}

/* ---------- category + task queries ---------- */
function getCat(id) { return state.categories.find((c) => c.id === id); }
function catType(id) { const c = getCat(id); return c ? c.type : 'custom'; }
function tasksOf(catId) { return state.tasks.filter((t) => t.categoryId === catId); }

// Is a task active (visible) on a given date?
function activeOn(t, dateKey) {
  const type = catType(t.categoryId);
  if (type === 'custom') return true;            // persists until completed/deleted
  if (t.recurring) {
    if (t.cadence === 'weekly') return true;     // present every week
    return !t.days.length || t.days.includes(weekdayOf(dateKey));
  }
  if (type === 'weekly') return weekKeyFromKey(t.deliverBy) === weekKeyFromKey(dateKey);
  return t.deliverBy === dateKey;
}

// Tasks of a category shown for a given date.
function catTasksFor(catId, dateKey = todayKey()) {
  return tasksOf(catId).filter((t) => activeOn(t, dateKey));
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
function dailyProgress() {
  const l = scoredDailyTasks();
  const total = sumWeight(l);
  return { total, done: sumDone(l), pct: total ? (sumDone(l) / total) * 100 : 0 };
}
function weeklyProgress() {
  const l = weeklyTasksNow();
  const total = sumWeight(l);
  return { total, done: sumDone(l), pct: total ? (sumDone(l) / total) * 100 : 0 };
}

/* ---------- taskmaster helpers ---------- */
// For recurring tasks show only the NEXT uncompleted instance date.
function nextInstance(t) {
  const tk = todayKey();
  if (!t.recurring) return t.deliverBy;
  if (t.cadence === 'weekly') {
    if (!t.done) return t.deliverBy > tk ? t.deliverBy : tk;
    return addDays(tk, 7 - ((weekdayOf(tk) + 6) % 7)); // next Monday
  }
  for (let i = 0; i < 366; i++) {
    const k = addDays(tk, i);
    if (!activeOn(t, k)) continue;
    if (i === 0 && t.done) continue;               // already done today
    return k;
  }
  return tk;
}
function dueDateOf(t) { return t.recurring ? nextInstance(t) : t.deliverBy; }
