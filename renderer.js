/* ============================================================
   Goal Setter — renderer
   ============================================================ */

// Total weight at which the daily container stops growing and the fill starts
// scaling down. Dynamic: a bigger window holds more weight before capping.
// Reference: a ~1200px-wide window → cap 10. Clamped to a sane 6–24 range.
function weightCap() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // Height drives it (the daily bar is vertical and grows in height); width nudges it.
  // 1200×800 → ~10. Taller/wider windows allow more weight before capping.
  const cap = (h - 100) / 70 + (w - 1100) / 500;
  return Math.max(6, Math.min(24, Math.round(cap)));
}

/* ---------- date helpers ---------- */
const pad = (n) => String(n).padStart(2, '0');
const todayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function weekKey(d = new Date()) {
  // ISO-ish week key: year + week number (week starts Monday)
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
const prettyDate = (key) => {
  const [y, m, dd] = key.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
};
// week key ('2026-W29') of a YYYY-MM-DD date key
function weekKeyFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return weekKey(new Date(y, m - 1, d));
}

/* ---------- state ---------- */
let state = load();

function defaultState() {
  return {
    dailyTasks: [],   // recurring daily templates only
    scheduled: [],    // one-off dated tasks: {..., date:'YYYY-MM-DD'} (incl. today's quick-adds)
    weeklyTasks: [],  // this week's tasks (recurring templates + one-offs)
    scheduledWeekly: [], // one-off weekly tasks for FUTURE weeks: {..., date:'YYYY-MM-DD'}
    dailyArchive: [], // [{date, tasks:[{title,weight,done,completedAt}]}]
    weeklyArchive: [], // [{week, tasks:[...]}]
    lastDay: todayKey(),
    lastWeek: weekKey(),
    loggedDays: [], // dates already exported
    logTime: '22:00', // when the day's completed tasks are auto-logged (HH:MM)
    dailySplit: false, // split daily list into scheduled-today vs recurring
    widgetOpen: false, // floating always-on-top sticky widget
    theme: 'light'
  };
}

// Migrate older saves: split non-recurring daily tasks into the dated `scheduled` list.
function migrate(s) {
  if (!Array.isArray(s.scheduled)) s.scheduled = [];
  if (!Array.isArray(s.scheduledWeekly)) s.scheduledWeekly = [];
  const keep = [];
  (s.dailyTasks || []).forEach((t) => {
    if (t.recurring) {
      if (!Array.isArray(t.days)) t.days = [];
      keep.push(t);
    } else {
      s.scheduled.push({
        id: t.id || uid(), title: t.title, weight: t.weight, recurring: false,
        date: s.lastDay || todayKey(), done: t.done || false,
        completedAt: t.completedAt || null, createdAt: t.createdAt || null
      });
    }
  });
  s.dailyTasks = keep;
  // backfill an explicit order on any task missing one (preserves current sequence)
  [s.dailyTasks, s.scheduled, s.weeklyTasks].forEach((arr) => {
    arr.forEach((t, i) => { if (typeof t.order !== 'number') t.order = i; });
  });
  // recurring tasks gain a "routine" flag (trivial everyday chores)
  s.dailyTasks.forEach((t) => { if (typeof t.routine !== 'boolean') t.routine = false; });
  return s;
}

function load() {
  try {
    const raw = GoalStore.read();
    if (!raw) return defaultState();
    return migrate(Object.assign(defaultState(), raw));
  } catch {
    return defaultState();
  }
}
let lastLocalEditAt = 0;
function save() {
  // remember when the user last edited locally (not when applying a remote change)
  if (!window.__goalApplyingRemote) lastLocalEditAt = Date.now();
  GoalStore.write(state);
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ============================================================
   Rollover: archive + reset recurring tasks on new day / week
   ============================================================ */
function snapshot(tasks) {
  return tasks.map((t) => ({
    title: t.title, weight: t.weight, done: t.done,
    completedAt: t.completedAt || null
  }));
}

function rolloverIfNeeded() {
  const tk = todayKey();
  const wk = weekKey();

  if (state.lastDay !== tk) {
    // archive only the tasks that were actually active on the day that just ended
    const ended = activeDaily(state.lastDay);
    if (ended.length) {
      state.dailyArchive.unshift({ date: state.lastDay, tasks: snapshot(ended) });
      state.dailyArchive = state.dailyArchive.slice(0, 7);
    }
    // reset recurring templates; drop scheduled one-offs that are now in the past
    state.dailyTasks = state.dailyTasks
      .filter((t) => t.recurring)
      .map((t) => ({ ...t, done: false, completedAt: null }));
    state.scheduled = state.scheduled.filter((t) => t.date >= tk);
    state.lastDay = tk;
  }

  if (state.lastWeek !== wk) {
    if (state.weeklyTasks.length) {
      state.weeklyArchive.unshift({ week: state.lastWeek, tasks: snapshot(state.weeklyTasks) });
      state.weeklyArchive = state.weeklyArchive.slice(0, 4);
    }
    state.weeklyTasks = state.weeklyTasks
      .filter((t) => t.recurring)
      .map((t) => ({ ...t, done: false, completedAt: null }));
    // promote scheduled weekly one-offs whose week has arrived; drop stale past ones
    state.scheduledWeekly.filter((t) => weekKeyFromKey(t.date) === wk).forEach((t) => {
      delete t.date;
      state.weeklyTasks.push(t);
    });
    state.scheduledWeekly = state.scheduledWeekly.filter((t) => t.date && weekKeyFromKey(t.date) > wk);
    state.lastWeek = wk;
  }
  save();
}

/* ============================================================
   Progress math
   ============================================================ */
const sumWeight = (tasks) => tasks.reduce((a, t) => a + t.weight, 0);
const sumDone = (tasks) => tasks.reduce((a, t) => a + (t.done ? t.weight : 0), 0);

// weekday (0=Sun..6=Sat) of a YYYY-MM-DD key
function weekdayOf(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}
// Is a daily task active on a given date? One-offs are always active until rollover.
// Recurring tasks with specific days only appear on those weekdays (empty = every day).
function isActiveOn(task, dateKey) {
  if (!task.recurring) return true;
  if (!task.days || !task.days.length) return true;
  return task.days.includes(weekdayOf(dateKey));
}
function activeDaily(dateKey = todayKey()) {
  const recurring = state.dailyTasks.filter((t) => t.recurring && isActiveOn(t, dateKey));
  const dated = state.scheduled.filter((t) => t.date === dateKey);
  return recurring.concat(dated);
}

// Daily task category & priority: scheduled-today > recurring > routine.
function dailyCat(t) {
  if (!t.recurring) return 'scheduled';
  return t.routine ? 'routine' : 'recurring';
}
const CAT_ORDER = { scheduled: 0, recurring: 1, routine: 2 };
// scheduled tasks for a date (one-offs)
const scheduledFor = (k = todayKey()) => state.scheduled.filter((t) => t.date === k);
// active recurring templates for a date, split by routine flag
const recurringFor = (k = todayKey(), routine = false) =>
  state.dailyTasks.filter((t) => t.recurring && isActiveOn(t, k) && !!t.routine === routine);
// priority-then-drag order for a mixed daily list
function sortDaily(list) {
  return list.slice().sort((a, b) =>
    CAT_ORDER[dailyCat(a)] - CAT_ORDER[dailyCat(b)]
    || (a.done ? 1 : 0) - (b.done ? 1 : 0)
    || (a.order || 0) - (b.order || 0));
}
// What to show on the calendar for a date: archived snapshot for past days, else live.
function tasksForDate(dateKey) {
  const arch = state.dailyArchive.find((a) => a.date === dateKey);
  if (arch) return arch.tasks;
  return activeDaily(dateKey);
}

function dailyProgress() {
  const active = activeDaily();
  const total = sumWeight(active);
  const done = sumDone(active);
  return { total, done, pct: total ? (done / total) * 100 : 0 };
}
function weeklyProgress() {
  const total = sumWeight(state.weeklyTasks);
  const done = sumDone(state.weeklyTasks);
  return { total, done, pct: total ? (done / total) * 100 : 0 };
}

/* ============================================================
   Rendering
   ============================================================ */
const $ = (sel) => document.querySelector(sel);
let lastDailyPct = 0;
let lastWeeklyPct = 0;

function render() {
  renderList('weekly');
  renderList('daily');
  renderBars();
  pushWidget();
}

// send the prioritised task sections to the floating widget (desktop only)
function pushWidget() {
  if (!window.goalAPI || !window.goalAPI.pushWidget) return;
  const map = (list) => list.map((t) => ({ id: t.id, kind: 'daily', title: t.title, weight: t.weight, done: t.done }));
  const mapW = (list) => list.map((t) => ({ id: t.id, kind: 'weekly', title: t.title, weight: t.weight, done: t.done }));
  const sections = [
    { key: 'weekly', label: 'Weekly', color: 'neon', pct: Math.round(weeklyProgress().pct),
      tasks: mapW(sortTasks(state.weeklyTasks).slice(0, 2)) },
    { key: 'daily', label: 'Today', color: 'purple', pct: Math.round(dailyProgress().pct),
      tasks: map(sortTasks(scheduledFor()).slice(0, 2)) },
    { key: 'recurring', label: 'Recurring', color: 'purple',
      tasks: map(sortTasks(recurringFor(todayKey(), false)).slice(0, 1)) },
    { key: 'routine', label: 'Routine', color: 'gray',
      tasks: map(sortTasks(recurringFor(todayKey(), true)).slice(0, 1)) }
  ];
  window.goalAPI.pushWidget({ theme: state.theme, sections });
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function recurLabel(task) {
  if (!task.days || !task.days.length) return '↻ daily';
  const order = [1, 2, 3, 4, 5, 6, 0];
  return '↻ ' + order.filter((d) => task.days.includes(d)).map((d) => DAY_ABBR[d]).join(' ');
}

const sortTasks = (list) => list.slice().sort((a, b) =>
  (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.order || 0) - (b.order || 0));

function makeTaskRow(kind, t, container) {
  const row = document.createElement('div');
  row.className = 'task-row' + (t.done ? ' done' : '') + (t.routine ? ' routine' : '');
  row.draggable = true;
  row.dataset.id = t.id;
  row.ondragstart = (e) => { e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); };
  row.ondragend = () => { row.classList.remove('dragging'); commitOrder(container, kind); };

  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⠿';
  handle.title = 'Drag to reorder';
  row.appendChild(handle);

  const box = document.createElement('div');
  box.className = `checkbox ${kind}` + (t.done ? ' checked' : '');
  box.onclick = () => toggleTask(kind, t.id);

  const name = document.createElement('div');
  name.className = 'task-name';
  name.textContent = t.title;

  const badge = document.createElement('span');
  badge.className = 'weight-badge';
  badge.textContent = '×' + t.weight;

  row.appendChild(box);
  row.appendChild(name);
  if (t.recurring) {
    const r = document.createElement('span');
    r.className = 'recur-badge';
    if (kind === 'weekly') { r.textContent = '↻'; r.title = 'Recurring weekly'; }
    else { r.textContent = recurLabel(t); r.title = 'Recurring'; }
    row.appendChild(r);
  }
  row.appendChild(badge);

  const edit = document.createElement('button');
  edit.className = 'row-edit';
  edit.textContent = '✎';
  edit.title = 'Edit';
  edit.onclick = (e) => { e.stopPropagation(); openEditModal(kind, t.id); };
  row.appendChild(edit);

  const del = document.createElement('button');
  del.className = 'row-del';
  del.textContent = '✕';
  del.title = 'Delete';
  del.onclick = (e) => { e.stopPropagation(); deleteTask(kind, t.id); };
  row.appendChild(del);

  return row;
}

const SUBGROUP_EMPTY = {
  'Scheduled today': 'nothing scheduled for today',
  'Recurring': 'no recurring tasks today',
  'Routine': 'no routine tasks today'
};
function appendSubgroup(el, label, tasks, kind) {
  const head = document.createElement('div');
  head.className = 'task-subgroup';
  head.textContent = `${label} · ${tasks.length}`;
  el.appendChild(head);
  if (!tasks.length) {
    const none = document.createElement('div');
    none.className = 'empty-hint subgroup-empty';
    none.textContent = SUBGROUP_EMPTY[label] || 'none';
    el.appendChild(none);
    return;
  }
  tasks.forEach((t) => el.appendChild(makeTaskRow(kind, t, el)));
}

function renderList(kind) {
  const el = kind === 'weekly' ? $('#weeklyList') : $('#dailyList');
  el.innerHTML = '';

  // Daily split view: scheduled-today / recurring / routine, in that priority
  if (kind === 'daily' && state.dailySplit) {
    const all = activeDaily();
    if (!all.length) {
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = 'No daily tasks yet — add one with ＋ or import from Notion';
      el.appendChild(hint);
    } else {
      appendSubgroup(el, 'Scheduled today', sortTasks(scheduledFor()), 'daily');
      appendSubgroup(el, 'Recurring', sortTasks(recurringFor(todayKey(), false)), 'daily');
      appendSubgroup(el, 'Routine', sortTasks(recurringFor(todayKey(), true)), 'daily');
    }
  } else {
    const source = kind === 'weekly' ? sortTasks(state.weeklyTasks) : sortDaily(activeDaily());
    if (!source.length) {
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = kind === 'weekly'
        ? 'No weekly tasks yet — add one with ＋'
        : 'No daily tasks yet — add one with ＋ or import from Notion';
      el.appendChild(hint);
    } else {
      source.forEach((t) => el.appendChild(makeTaskRow(kind, t, el)));
    }
  }

  // live-reorder rows while dragging
  el.ondragover = (e) => {
    e.preventDefault();
    const dragging = el.querySelector('.task-row.dragging');
    if (!dragging) return;
    const after = dragAfterElement(el, e.clientY);
    if (after == null) el.appendChild(dragging);
    else el.insertBefore(dragging, after);
  };
}

// find the row that the dragged item should be inserted before, based on cursor Y
function dragAfterElement(container, y) {
  const rows = [...container.querySelectorAll('.task-row:not(.dragging)')];
  let closest = { offset: -Infinity, el: null };
  for (const row of rows) {
    const box = row.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, el: row };
  }
  return closest.el;
}

// persist the new visual order back onto the task objects
function commitOrder(container, kind) {
  const ids = [...container.querySelectorAll('.task-row')].map((r) => r.dataset.id);
  ids.forEach((id, i) => { const t = findTask(kind, id); if (t) t.order = i; });
  afterChange();
}

function renderBars() {
  const d = dailyProgress();
  const w = weeklyProgress();

  // responsive track sizing: smaller bars on mobile (they sit in a compact top strip)
  const mobile = window.innerWidth <= 760;
  const maxTrack = mobile ? 150 : Math.max(170, Math.min(window.innerHeight * 0.42, 420));
  const minTrack = mobile ? 84 : Math.max(110, maxTrack * 0.45);

  // ----- top weekly indicator (separate, horizontal) -----
  $('#weeklyTopFill').style.width = w.pct + '%';
  $('#weeklyTopPct').textContent = Math.round(w.pct) + '%';

  // ----- side weekly bar (stacked above daily, ~1/3 the daily bar's size) -----
  const weeklyFill = $('#weeklyBarFill');
  weeklyFill.parentElement.style.height = Math.round(maxTrack / 3) + 'px';
  weeklyFill.style.height = w.pct + '%';
  $('#weeklyPct').textContent = Math.round(w.pct) + '%';
  if (w.pct > lastWeeklyPct + 0.1) {
    weeklyFill.classList.remove('bump'); void weeklyFill.offsetWidth; weeklyFill.classList.add('bump');
  }

  // ----- daily container HEIGHT scales with total weight up to the dynamic cap -----
  const cap = weightCap();
  const grow = Math.min(d.total / cap, 1);                  // 0..1
  const heightPx = minTrack + grow * (maxTrack - minTrack); // short -> full
  const track = $('#dailyTrack');
  track.style.height = heightPx + 'px';

  // ----- daily fill (vertical, accurate; ticks mark 25% increments) -----
  const fill = $('#dailyBarFill');
  fill.style.height = d.pct + '%';

  // satisfying bump + sparks when daily progress increases
  if (d.pct > lastDailyPct + 0.1) {
    fill.classList.remove('bump'); void fill.offsetWidth; fill.classList.add('bump');
    emitSparks(d.pct);
    if (d.pct >= 99.9 && lastDailyPct < 99.9) celebrate(); // day complete!
  }
  lastDailyPct = d.pct;
  lastWeeklyPct = w.pct;

  $('#dailyPct').textContent = Math.round(d.pct) + '%';
  $('#dailyMeta').textContent = d.total
    ? `${d.done}/${d.total} weight · cap ${cap}`
    : 'add tasks to begin';
}

// full-bar spark cascade when the daily bar hits 100%
function celebrate() {
  const burst = $('#dailyBurst');
  for (let wave = 0; wave < 3; wave++) {
    setTimeout(() => {
      for (let i = 0; i < 14; i++) {
        const s = document.createElement('span');
        s.className = 'spark';
        s.style.left = (20 + Math.random() * 60) + '%';
        s.style.top = Math.random() * 100 + '%';
        const ang = Math.random() * Math.PI * 2;
        const dist = 24 + Math.random() * 40;
        s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
        burst.appendChild(s);
        setTimeout(() => s.remove(), 700);
      }
    }, wave * 180);
  }
}

function emitSparks(pct) {
  const burst = $('#dailyBurst');
  const y = Math.min(pct, 100);          // height of fill from the bottom
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    s.style.left = '50%';
    s.style.top = (100 - y) + '%';       // top edge of the fill
    const ang = Math.random() * Math.PI * 2;
    const dist = 18 + Math.random() * 28;
    s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
    burst.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
}

/* ============================================================
   Task actions
   ============================================================ */
function findTask(kind, id) {
  if (kind === 'weekly') {
    return state.weeklyTasks.find((x) => x.id === id) || state.scheduledWeekly.find((x) => x.id === id);
  }
  return state.dailyTasks.find((x) => x.id === id) || state.scheduled.find((x) => x.id === id);
}

function afterChange() {
  save();
  render();
  if (currentPage === 'calendar') renderCalendar();
  if (currentPage === 'recurring') renderRecurring();
}

function toggleTask(kind, id) {
  const t = findTask(kind, id);
  if (!t) return;
  t.done = !t.done;
  t.completedAt = t.done ? nowTime() : null;
  afterChange();
}

function deleteTask(kind, id) {
  const t = findTask(kind, id);
  if (!t) return;
  // remember where it lived so Undo can put it back in the right list
  let origin;
  if (kind === 'weekly') {
    if (state.scheduledWeekly.includes(t)) {
      origin = 'weeklyFuture';
      state.scheduledWeekly = state.scheduledWeekly.filter((x) => x.id !== id);
    } else {
      origin = 'weekly';
      state.weeklyTasks = state.weeklyTasks.filter((x) => x.id !== id);
    }
  } else if (state.dailyTasks.includes(t)) {
    origin = 'template';
    state.dailyTasks = state.dailyTasks.filter((x) => x.id !== id);
  } else {
    origin = 'scheduled';
    state.scheduled = state.scheduled.filter((x) => x.id !== id);
  }
  afterChange();
  toast(`Deleted "${t.title}"`, 'Undo', () => {
    if (origin === 'weekly') state.weeklyTasks.push(t);
    else if (origin === 'weeklyFuture') state.scheduledWeekly.push(t);
    else if (origin === 'template') state.dailyTasks.push(t);
    else state.scheduled.push(t);
    afterChange();
  });
}

function addTask(kind, title, weight, recurring, days = [], date = null, routine = false) {
  const t = title.trim();
  if (!t) return;
  const base = { id: uid(), title: t, weight, order: Date.now(), done: false, completedAt: null, createdAt: nowTime() };
  if (kind === 'weekly') {
    // a non-recurring weekly task dated into a future week is scheduled ahead
    if (!recurring && date && weekKeyFromKey(date) > weekKey()) {
      state.scheduledWeekly.push({ ...base, recurring: false, date });
    } else {
      state.weeklyTasks.push({ ...base, recurring });
    }
  } else if (recurring) {
    state.dailyTasks.push({ ...base, recurring: true, days, routine: !!routine });
  } else {
    // one-off, dated (defaults to today for the main list)
    state.scheduled.push({ ...base, recurring: false, date: date || todayKey() });
  }
  afterChange();
}

/* ============================================================
   Modal (add task)
   ============================================================ */
let modalKind = 'daily';
let modalWeight = 1;
let modalDays = new Set();
let modalDate = null;   // when set, we're scheduling a one-off for a specific date
let modalEditId = null; // when set, we're editing an existing task

function syncDayPick() {
  const daily = modalKind === 'daily';
  const recurring = $('#recurringChk').checked;
  // weekday picker + routine option only apply to recurring DAILY tasks
  const show = daily && !modalDate && recurring;
  $('#dayPickWrap').classList.toggle('hidden', !show);
  $('#routineRow').classList.toggle('hidden', !show);
  // date field: reschedule a one-off daily task, or pick the week of a one-off weekly task
  const showDate = (daily && !!modalEditId && !recurring)
    || (modalKind === 'weekly' && !recurring);
  $('#dateLabel').textContent = modalKind === 'weekly' ? 'Week of (pick any date in that week)' : 'Date';
  $('#dateRow').classList.toggle('hidden', !showDate);
}

function openModal(kind, date = null) {
  modalKind = kind;
  modalWeight = 1;
  modalDays = new Set();
  modalDate = date;
  modalEditId = null;
  $('#modalSave').textContent = date ? 'Schedule' : 'Add task';
  $('#taskTitle').value = '';
  $('#recurringChk').checked = false;
  $('#routineChk').checked = false;
  $('#taskDate').value = date || todayKey();
  $('#modalDelete').classList.add('hidden');
  $('#recurringLabel').textContent = kind === 'weekly' ? 'Recurring every week' : 'Recurring every day';
  document.querySelectorAll('.w-btn').forEach((b) => b.classList.toggle('active', b.dataset.w === '1'));
  document.querySelectorAll('#dayPick button').forEach((b) => b.classList.remove('active'));

  const note = $('#modalDateNote');
  const recurRow = $('#recurringChk').closest('.check-row');
  if (date) {
    // dated one-off scheduling from the calendar: no recurrence options
    note.textContent = '📅 Scheduling for ' + prettyDate(date);
    note.classList.remove('hidden');
    recurRow.classList.add('hidden');
    $('#modalTitle').textContent = 'Schedule task';
  } else {
    note.classList.add('hidden');
    recurRow.classList.remove('hidden');
    $('#modalTitle').textContent = kind === 'weekly' ? 'New weekly task' : 'New daily task';
  }
  syncDayPick();
  $('#modal').classList.remove('hidden');
  setTimeout(() => $('#taskTitle').focus(), 30);
}
function closeModal() { $('#modal').classList.add('hidden'); }

function openEditModal(kind, id) {
  const t = findTask(kind, id);
  if (!t) return;
  modalKind = kind;
  modalEditId = id;
  modalDate = null;
  modalWeight = t.weight;
  modalDays = new Set(t.days || []);
  // for daily tasks, "recurring" means it lives in the templates list
  const isRecurring = kind === 'weekly' ? !!t.recurring : state.dailyTasks.includes(t);

  $('#taskTitle').value = t.title;
  $('#recurringChk').checked = isRecurring;
  $('#routineChk').checked = !!t.routine;
  $('#taskDate').value = t.date || todayKey();
  $('#recurringLabel').textContent = kind === 'weekly' ? 'Recurring every week' : 'Recurring every day';
  document.querySelectorAll('.w-btn').forEach((b) => b.classList.toggle('active', Number(b.dataset.w) === t.weight));
  document.querySelectorAll('#dayPick button').forEach((b) => b.classList.toggle('active', modalDays.has(Number(b.dataset.day))));
  $('#modalDateNote').classList.add('hidden');
  $('#recurringChk').closest('.check-row').classList.remove('hidden');
  $('#modalDelete').classList.remove('hidden');
  $('#modalTitle').textContent = 'Edit task';
  $('#modalSave').textContent = 'Save changes';
  syncDayPick();
  $('#modal').classList.remove('hidden');
  setTimeout(() => $('#taskTitle').focus(), 30);
}

function updateTask(kind, id, { title, weight, recurring, days, routine, date }) {
  title = title.trim();
  if (!title) return;
  const t = findTask(kind, id);
  if (!t) return;
  t.title = title;
  t.weight = weight;

  if (kind === 'weekly') {
    const wasFuture = state.scheduledWeekly.includes(t);
    if (recurring) {
      t.recurring = true;
      delete t.date;
      if (wasFuture) {
        state.scheduledWeekly = state.scheduledWeekly.filter((x) => x.id !== id);
        state.weeklyTasks.push(t);
      }
    } else {
      t.recurring = false;
      const dk = date || t.date || todayKey();
      if (weekKeyFromKey(dk) > weekKey()) {
        // belongs to a future week
        t.date = dk;
        if (!wasFuture) {
          state.weeklyTasks = state.weeklyTasks.filter((x) => x.id !== id);
          state.scheduledWeekly.push(t);
        }
      } else {
        // current (or past → treated as current) week
        delete t.date;
        if (wasFuture) {
          state.scheduledWeekly = state.scheduledWeekly.filter((x) => x.id !== id);
          state.weeklyTasks.push(t);
        }
      }
    }
  } else {
    const wasTemplate = state.dailyTasks.includes(t);
    if (recurring && !wasTemplate) {
      // one-off -> recurring template
      state.scheduled = state.scheduled.filter((x) => x.id !== id);
      delete t.date;
      t.recurring = true; t.days = days; t.routine = !!routine;
      state.dailyTasks.push(t);
    } else if (!recurring && wasTemplate) {
      // recurring template -> one-off on the chosen date
      state.dailyTasks = state.dailyTasks.filter((x) => x.id !== id);
      t.recurring = false; t.days = []; t.routine = false; t.date = date || t.date || todayKey();
      state.scheduled.push(t);
    } else if (recurring) {
      t.days = days; t.routine = !!routine;
    } else {
      // one-off staying one-off: reschedule to the chosen date
      t.date = date || t.date || todayKey();
    }
  }
  afterChange();
}

/* ============================================================
   Import from Notion (paste-based)
   ============================================================ */
function parseImport(text) {
  const out = [];
  text.split('\n').forEach((line) => {
    let s = line.trim();
    if (!s) return;
    s = s.replace(/^[-*•]\s*/, '');          // bullet
    s = s.replace(/^\[[ xX]\]\s*/, '');        // checkbox after bullet removal
    s = s.replace(/^\d+[.)]\s*/, '');          // numbered
    if (!s) return;
    let weight = 1;
    const wMatch = s.match(/(?:\((\d)\)|!\s*(\d))\s*$/);
    if (wMatch) {
      weight = Math.min(3, Math.max(1, Number(wMatch[1] || wMatch[2])));
      s = s.replace(/(?:\(\d\)|!\s*\d)\s*$/, '').trim();
    }
    if (s) out.push({ title: s, weight });
  });
  return out;
}

/* ============================================================
   Archives page
   ============================================================ */
let archiveTab = 'daily';

function renderArchive() {
  const body = $('#archiveBody');
  body.innerHTML = '';
  const data = archiveTab === 'daily' ? state.dailyArchive : state.weeklyArchive;

  if (!data.length) {
    body.innerHTML = `<div class="empty-hint">No archived ${archiveTab} records yet. They appear here automatically after a ${archiveTab === 'daily' ? 'day' : 'week'} rolls over.</div>`;
    return;
  }

  data.forEach((entry) => {
    const total = entry.tasks.reduce((a, t) => a + t.weight, 0);
    const done = entry.tasks.reduce((a, t) => a + (t.done ? t.weight : 0), 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const color = archiveTab === 'daily' ? 'var(--purple)' : 'var(--neon)';

    const card = document.createElement('div');
    card.className = 'archive-card';
    const label = archiveTab === 'daily' ? prettyDate(entry.date) : entry.week;
    card.innerHTML = `
      <h3>${label}</h3>
      <div class="arch-sub">${done}/${total} weight completed · ${pct}%</div>
      <div class="arch-bar"><div style="width:${pct}%;background:${color}"></div></div>
    `;
    entry.tasks.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'arch-task';
      row.innerHTML = `
        <span class="${t.done ? 'ok' : 'no'}">${t.done ? '✓' : '○'}</span>
        <span>${escapeHtml(t.title)}</span>
        <span class="weight-badge">×${t.weight}</span>
        <span class="arch-time">${t.completedAt || '—'}</span>
      `;
      const readd = document.createElement('button');
      readd.className = 'arch-readd';
      readd.textContent = '↩';
      readd.title = archiveTab === 'daily' ? "Re-add to today's tasks" : "Re-add to this week's tasks";
      readd.onclick = () => readdArchivedTask(archiveTab, t);
      row.appendChild(readd);
      card.appendChild(row);
    });
    body.appendChild(card);
  });
}

// Copy an archived task snapshot back into the live lists as a fresh one-off.
function readdArchivedTask(tab, t) {
  if (tab === 'daily') addTask('daily', t.title, t.weight, false, [], null);
  else addTask('weekly', t.title, t.weight, false);
  toast(`Re-added "${t.title}" to ${tab === 'daily' ? "today's" : "this week's"} tasks`);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============================================================
   Recurring tasks management page
   ============================================================ */
const REC_DAYS = [[1, 'M'], [2, 'T'], [3, 'W'], [4, 'T'], [5, 'F'], [6, 'S'], [0, 'S']];

function renderRecurring() {
  const body = $('#recurringBody');
  body.innerHTML = '';
  // stable order (creation/drag order only) — rows must NOT move as you edit them
  const tasks = state.dailyTasks.slice().sort((a, b) => (a.order || 0) - (b.order || 0));

  if (!tasks.length) {
    body.innerHTML = '<div class="empty-hint">No recurring tasks yet. Use “＋ New recurring”, or tick “Recurring” when adding a daily task.</div>';
    return;
  }
  tasks.forEach((t) => body.appendChild(recurringRow(t)));
}

// Persist a change made on the recurring page WITHOUT rebuilding the page —
// rebuilding re-created the row under the cursor and made clicks feel glitchy.
function recSave() {
  save();
  renderList('daily');
  renderBars();
  pushWidget();
}

function recurringRow(t) {
  const row = el('div', 'rec-row' + (t.routine ? ' routine' : ''));

  const title = document.createElement('input');
  title.className = 'rec-title';
  title.value = t.title;
  title.onchange = () => {
    const v = title.value.trim();
    if (v) { t.title = v; recSave(); } else { title.value = t.title; }
  };

  const weight = el('div', 'rec-weight');
  const wBtns = [];
  [1, 2, 3].forEach((w) => {
    const b = document.createElement('button');
    b.textContent = w;
    b.className = 'rw-btn' + (t.weight === w ? ' active' : '');
    b.onclick = () => {
      t.weight = w;
      wBtns.forEach((x, i) => x.classList.toggle('active', i + 1 === w));
      recSave();
    };
    wBtns.push(b);
    weight.appendChild(b);
  });

  const dayHint = el('span', 'rec-dayhint');
  const syncHint = () => { dayHint.textContent = (!t.days || !t.days.length) ? 'every day' : ''; };

  const days = el('div', 'rec-days');
  REC_DAYS.forEach(([d, label]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = 'rd-btn' + (t.days && t.days.includes(d) ? ' active' : '');
    b.title = 'Repeat on this day (none selected = every day)';
    b.onclick = () => {
      const arr = t.days ? t.days.slice() : [];
      const i = arr.indexOf(d);
      if (i >= 0) arr.splice(i, 1); else arr.push(d);
      t.days = arr.sort();
      b.classList.toggle('active', t.days.includes(d));
      syncHint();
      recSave();
    };
    days.appendChild(b);
  });
  syncHint();

  const routine = document.createElement('button');
  routine.className = 'rec-routine' + (t.routine ? ' active' : '');
  routine.textContent = t.routine ? '✓ Routine' : 'Routine';
  routine.title = 'Routine chores sit lowest in priority';
  routine.onclick = () => {
    t.routine = !t.routine;
    routine.classList.toggle('active', t.routine);
    routine.textContent = t.routine ? '✓ Routine' : 'Routine';
    row.classList.toggle('routine', t.routine);
    recSave();
  };

  const del = document.createElement('button');
  del.className = 'rec-del';
  del.textContent = '✕';
  del.title = 'Delete';
  del.onclick = () => deleteTask('daily', t.id);

  row.appendChild(title);
  row.appendChild(weight);
  const dayWrap = el('div', 'rec-daywrap');
  dayWrap.appendChild(days); dayWrap.appendChild(dayHint);
  row.appendChild(dayWrap);
  row.appendChild(routine);
  row.appendChild(del);
  return row;
}

/* ============================================================
   Daily markdown log (auto at 10pm)
   ============================================================ */
function buildLogMarkdown() {
  const date = todayKey();
  const lines = [];
  lines.push(`# Goal Setter log — ${prettyDate(date)}`);
  lines.push('');

  const section = (title, tasks) => {
    lines.push(`## ${title}`);
    if (!tasks.length) { lines.push('_No tasks set._', ''); return; }
    const total = tasks.reduce((a, t) => a + t.weight, 0);
    const done = tasks.reduce((a, t) => a + (t.done ? t.weight : 0), 0);
    lines.push(`Completion: **${done}/${total} weight** (${total ? Math.round(done / total * 100) : 0}%)`);
    lines.push('');
    lines.push('| Task | Weight | Done | Completed at |');
    lines.push('| --- | --- | --- | --- |');
    tasks.forEach((t) => {
      lines.push(`| ${t.title} | ${t.weight} | ${t.done ? '✅' : '⬜'} | ${t.completedAt || '—'} |`);
    });
    lines.push('');
  };

  section('Daily tasks', activeDaily());
  section('Weekly tasks (current week)', state.weeklyTasks);
  return lines.join('\n');
}

async function exportLog(auto = false) {
  const date = todayKey();
  const md = buildLogMarkdown();
  const filename = `goal-log-${date}.md`;
  try {
    const full = await window.goalAPI.writeLog(filename, md);
    if (!state.loggedDays.includes(date)) { state.loggedDays.push(date); save(); }
    toast(auto ? `Auto-saved log → ${filename}` : `Saved ${filename}`);
    return full;
  } catch (e) {
    toast('Could not write log: ' + e.message);
  }
}

// every minute, if it's at/after the chosen log time and today hasn't been
// logged, export. Auto-logging writes to disk, so it's a desktop-only feature.
function scheduleLogCheck() {
  const check = () => {
    if (!window.goalAPI) return; // no file system on mobile/web
    const d = new Date();
    const date = todayKey(d);
    const [h, m] = (state.logTime || '22:00').split(':').map(Number);
    const dueMins = h * 60 + m;
    const nowMins = d.getHours() * 60 + d.getMinutes();
    if (nowMins >= dueMins && !state.loggedDays.includes(date)) {
      exportLog(true);
    }
  };
  check();
  setInterval(check, 60 * 1000);
}

/* ============================================================
   Calendar page (last month, this month, next month)
   ============================================================ */
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d + n));
}

// Weekly tasks belonging to the week containing dateKey.
// mondayOnly: return [] unless dateKey is a Monday (used for calendar pills).
function weeklyForWeekOf(dateKey, mondayOnly = false) {
  if (mondayOnly && weekdayOf(dateKey) !== 1) return [];
  const wkOf = weekKeyFromKey(dateKey);
  const wkNow = weekKey();
  if (wkOf === wkNow) return state.weeklyTasks;
  if (wkOf > wkNow) return state.scheduledWeekly.filter((t) => weekKeyFromKey(t.date) === wkOf);
  const arch = state.weeklyArchive.find((a) => a.week === wkOf);
  return arch ? arch.tasks : [];
}

/* ---------- day view modal: every task on a date, all editable ---------- */
let dayModalKey = null;

function openDayModal(key) {
  dayModalKey = key;
  const tk = todayKey();
  $('#dayModalTitle').textContent = prettyDate(key) + (key < tk ? ' · archived' : '');
  $('#dayModalAdd').classList.toggle('hidden', key < tk);
  renderDayModal();
  $('#dayModal').classList.remove('hidden');
}

function dayModalSection(label) {
  const h = el('div', 'task-subgroup');
  h.textContent = label;
  return h;
}

function dayTaskRow(kind, t, editable) {
  const row = el('div', 'day-task' + (t.done ? ' done' : ''));
  const mark = el('span', t.done ? 'ok' : 'no');
  mark.textContent = t.done ? '✓' : '○';
  const name = el('span', 'day-task-name');
  name.textContent = t.title;
  const badge = el('span', 'weight-badge');
  badge.textContent = '×' + t.weight;
  row.appendChild(mark);
  row.appendChild(name);
  if (t.recurring) {
    const r = el('span', 'recur-badge');
    r.textContent = kind === 'weekly' ? '↻' : recurLabel(t);
    row.appendChild(r);
  }
  row.appendChild(badge);
  if (editable) {
    const edit = document.createElement('button');
    edit.className = 'row-edit';
    edit.textContent = '✎';
    edit.title = 'Edit';
    edit.onclick = () => { $('#dayModal').classList.add('hidden'); openEditModal(kind, t.id); };
    const del = document.createElement('button');
    del.className = 'row-del';
    del.textContent = '✕';
    del.title = 'Delete';
    del.onclick = () => { deleteTask(kind, t.id); renderDayModal(); };
    row.appendChild(edit);
    row.appendChild(del);
  }
  return row;
}

function renderDayModal() {
  const key = dayModalKey;
  const tk = todayKey();
  const body = $('#dayModalBody');
  body.innerHTML = '';
  const editableDay = key >= tk;

  const weekly = weeklyForWeekOf(key);
  if (weekly.length) {
    const wkOf = weekKeyFromKey(key);
    body.appendChild(dayModalSection(wkOf === weekKey() ? 'Weekly · this week' : 'Weekly · ' + wkOf));
    weekly.forEach((t) => body.appendChild(dayTaskRow('weekly', t, editableDay && !!t.id)));
  }

  body.appendChild(dayModalSection('Daily'));
  const daily = tasksForDate(key);
  if (!daily.length) {
    const e = el('div', 'empty-hint subgroup-empty');
    e.textContent = 'no tasks on this day';
    body.appendChild(e);
  } else {
    sortDaily(daily).forEach((t) => body.appendChild(dayTaskRow('daily', t, editableDay && !!t.id)));
  }
}

function renderCalendar() {
  const wrap = $('#calMonths');
  wrap.innerHTML = '';
  const now = new Date();
  [-1, 0, 1].forEach((off) => wrap.appendChild(buildMonth(now.getFullYear(), now.getMonth() + off, off === 0)));
}

function buildMonth(y, mIdx, isCurrent) {
  const first = new Date(y, mIdx, 1);
  const year = first.getFullYear();
  const month = first.getMonth();
  const sec = el('div', 'cal-month' + (isCurrent ? ' current' : ''));
  const h = el('h2');
  h.textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  sec.appendChild(h);

  const grid = el('div', 'cal-grid');
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d) => {
    const dh = el('div', 'cal-dow'); dh.textContent = d; grid.appendChild(dh);
  });

  const startDow = (first.getDay() + 6) % 7; // Mon=0
  for (let i = 0; i < startDow; i++) grid.appendChild(el('div', 'cal-cell empty'));

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const tk = todayKey();
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${pad(month + 1)}-${pad(day)}`;
    const cell = el('div', 'cal-cell');
    if (key === tk) cell.classList.add('today');
    else if (key < tk) cell.classList.add('past');

    const num = el('div', 'cal-daynum'); num.textContent = day; cell.appendChild(num);

    // weekly tasks appear on their week's Monday cell
    const pills = weeklyForWeekOf(key, true).map((t) => ({ t, kind: 'weekly' }))
      .concat(tasksForDate(key).map((t) => ({ t, kind: 'daily' })));
    pills.slice(0, 3).forEach(({ t, kind }) => {
      const p = el('div', 'cal-pill'
        + (kind === 'weekly' ? ' weekly' : (t.weight >= 2 ? ' w-hi' : ''))
        + (t.done ? ' done' : ''));
      p.textContent = t.title;
      p.title = `${t.title} (×${t.weight})` + (kind === 'weekly' ? ' [weekly]' : '');
      // today/future live tasks can be edited or deleted straight from the calendar
      if (key >= tk && t.id) {
        p.classList.add('editable');
        p.onclick = (e) => { e.stopPropagation(); openEditModal(kind, t.id); };
      }
      cell.appendChild(p);
    });
    if (pills.length > 3) {
      const more = el('div', 'cal-more'); more.textContent = `+${pills.length - 3} more`; cell.appendChild(more);
    }

    // click a day to see and edit ALL of its tasks
    cell.onclick = () => openDayModal(key);
    grid.appendChild(cell);
  }
  sec.appendChild(grid);
  return sec;
}

/* ============================================================
   Export weight ≥ 2 tasks to Google Calendar (.ics)
   ============================================================ */
const ICS_BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
function icsEsc(s) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function nextMatchingDay(days) {
  for (let i = 0; i < 14; i++) {
    const k = addDays(todayKey(), i);
    if (days.includes(weekdayOf(k))) return k;
  }
  return todayKey();
}
function mondayOf(dt) {
  const day = (dt.getDay() + 6) % 7;
  return todayKey(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - day));
}

function buildIcs() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Goal Setter//EN', 'CALSCALE:GREGORIAN'];
  let count = 0;
  const addEvent = (uidv, dateKey, title, rrule) => {
    count++;
    const start = dateKey.replace(/-/g, '');
    const end = addDays(dateKey, 1).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${uidv}@goalsetter`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${icsEsc(title)}`);
    if (rrule) lines.push(`RRULE:${rrule}`);
    lines.push('END:VEVENT');
  };

  // dated one-offs
  state.scheduled.filter((t) => t.weight >= 2).forEach((t) =>
    addEvent(t.id, t.date, `${t.title} (×${t.weight})`));

  // recurring daily templates
  state.dailyTasks.filter((t) => t.recurring && t.weight >= 2).forEach((t) => {
    if (!t.days || !t.days.length) addEvent(t.id, todayKey(), `${t.title} (×${t.weight})`, 'FREQ=DAILY');
    else {
      const byday = t.days.map((d) => ICS_BYDAY[d]).join(',');
      addEvent(t.id, nextMatchingDay(t.days), `${t.title} (×${t.weight})`, `FREQ=WEEKLY;BYDAY=${byday}`);
    }
  });

  // weekly tasks (anchored on this week's Monday)
  state.weeklyTasks.filter((t) => t.weight >= 2).forEach((t) =>
    addEvent(t.id, mondayOf(new Date()), `${t.title} (×${t.weight}) [weekly]`, 'FREQ=WEEKLY;BYDAY=MO'));

  lines.push('END:VCALENDAR');
  return { ics: lines.join('\r\n'), count };
}

async function exportToGoogleCalendar() {
  const { ics, count } = buildIcs();
  if (!count) { toast('No weight ≥ 2 tasks to export'); return; }
  try {
    await window.goalAPI.writeIcs(`goal-setter-${todayKey()}.ics`, ics);
    toast(`Exported ${count} task${count > 1 ? 's' : ''} → .ics (import into Google Calendar)`);
  } catch (e) {
    toast('Export failed: ' + e.message);
  }
}

/* ============================================================
   Toast + theme + nav
   ============================================================ */
let toastTimer;
function toast(msg, actionLabel, actionFn) {
  const t = $('#toast');
  t.textContent = msg;
  if (actionLabel && actionFn) {
    const b = document.createElement('button');
    b.className = 'toast-action';
    b.textContent = actionLabel;
    b.onclick = () => { t.classList.add('hidden'); actionFn(); };
    t.appendChild(b);
  }
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), actionLabel ? 6000 : 2600);
}

// Hide desktop-only (Electron) features when running on mobile/web (no preload bridge).
function applyPlatformUI() {
  const isDesktop = !!window.goalAPI;
  if (!isDesktop) {
    ['#startupToggle', '#exportNowBtn', '#exportGcalBtn', '#logTimeRow', '#widgetToggle'].forEach((sel) => {
      const el = $(sel); if (el) el.classList.add('hidden');
    });
  }
}

function updateWidgetToggle() {
  const b = $('#widgetToggle');
  if (b) b.textContent = '📌 Sticky widget: ' + (state.widgetOpen ? 'on' : 'off');
}

function updateSplitToggle() {
  const b = $('#splitToggle');
  if (!b) return;
  b.classList.toggle('active', !!state.dailySplit);
  b.textContent = state.dailySplit ? '☰' : '⊟';
  b.title = state.dailySplit ? 'Combine daily list' : 'Split scheduled vs recurring';
}

function setStartupLabel(on) {
  $('#startupToggle').textContent = '⏻ Launch at startup: ' + (on ? 'on' : 'off');
}
async function initStartupToggle() {
  try { setStartupLabel(await window.goalAPI.getAutostart()); }
  catch { setStartupLabel(false); }
}

function applyTheme() {
  document.body.classList.toggle('dark', state.theme === 'dark');
  $('#themeToggle').textContent = state.theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode';
}

let currentPage = 'today';
function showPage(page) {
  currentPage = page;
  $('#page-today').classList.toggle('hidden', page !== 'today');
  $('#page-calendar').classList.toggle('hidden', page !== 'calendar');
  $('#page-recurring').classList.toggle('hidden', page !== 'recurring');
  $('#page-archives').classList.toggle('hidden', page !== 'archives');
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  if (page === 'archives') renderArchive();
  if (page === 'calendar') renderCalendar();
  if (page === 'recurring') renderRecurring();
}

/* ============================================================
   Wire up events
   ============================================================ */
function wire() {
  // nav (also closes the mobile drawer)
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.onclick = () => { showPage(b.dataset.page); document.body.classList.remove('sidebar-open'); };
  });

  // mobile sidebar drawer
  $('#menuToggle').onclick = () => document.body.classList.toggle('sidebar-open');
  $('#sidebarBackdrop').onclick = () => document.body.classList.remove('sidebar-open');

  // add buttons
  document.querySelectorAll('[data-add]').forEach((b) => {
    b.onclick = () => openModal(b.dataset.add);
  });

  // quick add: type + Enter -> one-off task for today; "(2)"/"!2" suffix sets weight
  $('#quickAdd').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    let s = e.target.value.trim();
    if (!s) return;
    let weight = 1;
    const wMatch = s.match(/(?:\((\d)\)|!\s*(\d))\s*$/);
    if (wMatch) {
      weight = Math.min(3, Math.max(1, Number(wMatch[1] || wMatch[2])));
      s = s.replace(/(?:\(\d\)|!\s*\d)\s*$/, '').trim();
    }
    if (!s) return;
    addTask('daily', s, weight, false, [], null);
    e.target.value = '';
  });

  // new recurring task (opens the modal with recurring pre-selected)
  $('#addRecurringBtn').onclick = () => {
    openModal('daily');
    $('#recurringChk').checked = true;
    syncDayPick();
  };

  // day view modal
  $('#dayModalClose').onclick = () => $('#dayModal').classList.add('hidden');
  $('#dayModalAdd').onclick = () => {
    $('#dayModal').classList.add('hidden');
    openModal('daily', dayModalKey);
  };

  // split daily list (scheduled-today vs recurring)
  updateSplitToggle();
  $('#splitToggle').onclick = () => {
    state.dailySplit = !state.dailySplit;
    save();
    updateSplitToggle();
    renderList('daily');
  };

  // theme
  $('#themeToggle').onclick = () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    save(); applyTheme();
  };

  // export now
  $('#exportNowBtn').onclick = () => exportLog(false);

  // auto-log time setting
  $('#logTimeInput').value = state.logTime || '22:00';
  $('#logTimeInput').onchange = (e) => {
    const v = e.target.value;
    if (!v) return;
    state.logTime = v;
    // changing the time re-arms today's log if the new time is still ahead
    const [h, m] = v.split(':').map(Number);
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) {
      state.loggedDays = state.loggedDays.filter((d) => d !== todayKey());
    }
    save();
    toast('Daily log time set to ' + v);
  };

  // floating sticky widget toggle
  updateWidgetToggle();
  $('#widgetToggle').onclick = async () => {
    state.widgetOpen = !state.widgetOpen;
    save();
    updateWidgetToggle();
    if (window.goalAPI && window.goalAPI.setWidget) {
      await window.goalAPI.setWidget(state.widgetOpen);
      if (state.widgetOpen) pushWidget();
    }
  };
  if (window.goalAPI && window.goalAPI.onWidgetClosed) {
    window.goalAPI.onWidgetClosed(() => {
      state.widgetOpen = false; save(); updateWidgetToggle();
    });
  }
  // check off a task straight from the widget
  if (window.goalAPI && window.goalAPI.onWidgetToggle) {
    window.goalAPI.onWidgetToggle(({ kind, id }) => toggleTask(kind, id));
  }
  // reopen the widget on launch if it was left on
  if (state.widgetOpen && window.goalAPI && window.goalAPI.setWidget) {
    window.goalAPI.setWidget(true).then(() => pushWidget());
  }

  // launch-at-startup toggle (OS login item)
  initStartupToggle();
  $('#startupToggle').onclick = async () => {
    try {
      const current = await window.goalAPI.getAutostart();
      const next = await window.goalAPI.setAutostart(!current);
      setStartupLabel(next);
      toast(next ? 'Goal Setter will launch at startup' : 'Startup launch disabled');
    } catch {
      toast('Startup setting unavailable in this build');
    }
  };

  // export weight >= 2 tasks to Google Calendar
  $('#exportGcalBtn').onclick = exportToGoogleCalendar;

  // modal weight pick
  document.querySelectorAll('.w-btn').forEach((b) => {
    b.onclick = () => {
      modalWeight = Number(b.dataset.w);
      document.querySelectorAll('.w-btn').forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  // recurring toggle reveals the weekday picker (daily tasks only)
  $('#recurringChk').addEventListener('change', syncDayPick);

  // weekday picker
  document.querySelectorAll('#dayPick button').forEach((b) => {
    b.onclick = () => {
      const day = Number(b.dataset.day);
      if (modalDays.has(day)) modalDays.delete(day);
      else modalDays.add(day);
      b.classList.toggle('active', modalDays.has(day));
    };
  });

  $('#modalCancel').onclick = closeModal;
  $('#modalDelete').onclick = () => {
    if (modalEditId) deleteTask(modalKind, modalEditId);
    closeModal();
  };
  $('#modalSave').onclick = () => {
    const recurring = !modalDate && $('#recurringChk').checked;
    const days = (modalKind === 'daily' && recurring) ? [...modalDays].sort() : [];
    const routine = modalKind === 'daily' && recurring && $('#routineChk').checked;
    const dateShown = !$('#dateRow').classList.contains('hidden');
    const dateVal = dateShown ? $('#taskDate').value : modalDate;
    if (modalEditId) {
      updateTask(modalKind, modalEditId, { title: $('#taskTitle').value, weight: modalWeight, recurring, days, routine, date: dateVal });
      if (dateShown && dateVal && dateVal !== todayKey()) {
        toast(modalKind === 'weekly' && weekKeyFromKey(dateVal) > weekKey()
          ? 'Moved to the week of ' + prettyDate(dateVal)
          : 'Rescheduled to ' + prettyDate(dateVal));
      }
      closeModal();
      return;
    }
    addTask(modalKind, $('#taskTitle').value, modalWeight, recurring, days, dateVal, routine);
    if (modalKind === 'weekly' && !recurring && dateVal && weekKeyFromKey(dateVal) > weekKey()) {
      toast('Scheduled for the week of ' + prettyDate(dateVal));
    } else if (modalDate && modalDate !== todayKey()) {
      toast('Scheduled for ' + prettyDate(modalDate));
    } else if (days.length && !days.includes(new Date().getDay())) {
      const order = [1, 2, 3, 4, 5, 6, 0];
      const lbl = order.filter((d) => days.includes(d)).map((d) => DAY_ABBR[d]).join(', ');
      toast(`Added — recurs on ${lbl} (not today)`);
    }
    closeModal();
  };
  $('#taskTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#modalSave').click(); });

  // import modal
  $('[data-import]').onclick = () => {
    $('#importText').value = '';
    $('#importRecurring').checked = false;
    $('#importModal').classList.remove('hidden');
    setTimeout(() => $('#importText').focus(), 30);
  };
  $('#importCancel').onclick = () => $('#importModal').classList.add('hidden');
  $('#importSave').onclick = () => {
    const items = parseImport($('#importText').value);
    const recurring = $('#importRecurring').checked;
    items.forEach((it) => addTask('daily', it.title, it.weight, recurring));
    $('#importModal').classList.add('hidden');
    if (items.length) toast(`Imported ${items.length} task${items.length > 1 ? 's' : ''}`);
  };

  // archive tabs
  document.querySelectorAll('.archive-tab').forEach((b) => {
    b.onclick = () => {
      archiveTab = b.dataset.arch;
      document.querySelectorAll('.archive-tab').forEach((x) => x.classList.toggle('active', x === b));
      renderArchive();
    };
  });

  // close modals on backdrop click / Esc
  document.querySelectorAll('.modal-overlay').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden'));
  });
}

/* ============================================================
   Cloud sync (Supabase) — inert unless configured in supabase-config.js
   ============================================================ */
let authMode = 'signin';
let hydrated = false;       // hydrate from cloud only once per sign-in
let unsubRemote = null;     // realtime subscription handle (subscribe only once)

function refreshFullUI() {
  rolloverIfNeeded();
  render();
  if (currentPage === 'calendar') renderCalendar();
  if (currentPage === 'archives') renderArchive();
}

// Apply an update that came from another device. Ignore empty payloads so a
// blank cloud row can never wipe local tasks.
function onRemoteState(remoteObj) {
  if (!remoteObj || !Object.keys(remoteObj).length) return;
  // don't clobber edits made in the last moments — our own debounced push
  // (which includes them) is still in flight and will win anyway
  if (Date.now() - lastLocalEditAt < 2000) return;
  // applying a remote change must NOT push back to the cloud (would loop)
  window.__goalApplyingRemote = true;
  try {
    state = migrate(Object.assign(defaultState(), remoteObj));
    refreshFullUI();
  } finally {
    window.__goalApplyingRemote = false;
  }
}

async function hydrateFromCloud() {
  if (hydrated) return;          // guard: Supabase fires several auth events
  hydrated = true;
  const remote = await window.GoalCloud.pull();
  if (remote && Object.keys(remote).length) {
    // adopt the cloud copy without pushing it straight back
    window.__goalApplyingRemote = true;
    try {
      state = migrate(Object.assign(defaultState(), remote));
      refreshFullUI();
    } finally {
      window.__goalApplyingRemote = false;
    }
  } else {
    // first sign-in on this account (or empty row): seed the cloud from local
    refreshFullUI();
    window.GoalCloud.push(state);
  }
  if (!unsubRemote) unsubRemote = GoalStore.subscribe(onRemoteState);
  updateAccountUI();
}

function updateAccountUI() {
  const email = window.GoalCloud && window.GoalCloud.userEmail && window.GoalCloud.userEmail();
  const row = $('#accountRow');
  if (email) {
    row.classList.remove('hidden');
    $('#accountEmail').textContent = email;
  } else {
    row.classList.add('hidden');
  }
  // sign-in button: visible only in cloud mode while signed out
  const canSignIn = !!(window.GoalCloud && window.GoalCloud.available && window.GoalCloud.available() && !email);
  $('#signInBtn').classList.toggle('hidden', !canSignIn);
}

function showAuth() { $('#authModal').classList.remove('hidden'); }
function hideAuth() { $('#authModal').classList.add('hidden'); }

function wireAuth() {
  $('#authToggleMode').onclick = () => {
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    $('#authTitle').textContent = authMode === 'signin' ? 'Sign in to sync' : 'Create your account';
    $('#authSubmit').textContent = authMode === 'signin' ? 'Sign in' : 'Create account';
    $('#authToggleMode').textContent = authMode === 'signin' ? 'Create account' : 'Have an account? Sign in';
    $('#authError').classList.add('hidden');
  };
  $('#authSubmit').onclick = async () => {
    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    if (!email || !password) return;
    const fn = authMode === 'signin' ? window.GoalCloud.signIn : window.GoalCloud.signUp;
    const { error } = await fn(email, password);
    if (error) {
      const e = $('#authError');
      e.textContent = error.message;
      e.classList.remove('hidden');
    } else if (authMode === 'signup') {
      toast('Account created — check your email if confirmation is required, then sign in');
    }
  };
  $('#signOutBtn').onclick = async () => {
    await window.GoalCloud.signOut();
    toast('Signed out');
  };
  $('#signInBtn').onclick = showAuth;
}

async function setupSync() {
  if (!(window.GoalCloud && window.GoalCloud.available())) return; // local-only (default)
  wireAuth();
  await window.GoalCloud.init();
  GoalStore.use(window.GoalCloud.backend());       // route persistence through the cloud layer
  window.GoalCloud.onAuth(async (s) => {
    if (s) {
      hideAuth();
      await hydrateFromCloud();   // no-op if already hydrated
      updateAccountUI();
    } else {
      // signed out: reset so a future sign-in re-hydrates + re-subscribes cleanly
      if (unsubRemote) { unsubRemote(); unsubRemote = null; }
      hydrated = false;
      updateAccountUI();
      showAuth();
    }
  });
  if (window.GoalCloud.getSession()) { hideAuth(); await hydrateFromCloud(); }
  else { updateAccountUI(); showAuth(); }
}

/* ============================================================
   Boot
   ============================================================ */
rolloverIfNeeded();
applyTheme();
wire();
applyPlatformUI();
render();
setupSync(); // activates cloud sync only if supabase-config.js has keys

// Register the PWA service worker (browsers only — not Electron's file://)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
scheduleLogCheck();
// catch day/week rollover if the app is left open across midnight
setInterval(() => { rolloverIfNeeded(); render(); }, 60 * 1000);

// recompute the dynamic weight cap + container size as the window resizes
let resizeRaf;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(renderBars);
});
