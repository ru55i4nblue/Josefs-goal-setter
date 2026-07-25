/* ============================================================
   Goal Setter — renderer core
   (data model lives in model.js, secondary pages in pages.js)
   ============================================================ */
const $ = (sel) => document.querySelector(sel);
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

function weightCap() {
  const w = window.innerWidth, h = window.innerHeight;
  return Math.max(6, Math.min(30, Math.round((h - 100) / 70 + (w - 1100) / 500)));
}

/* ---------- state ---------- */
let state = load();
let lastLocalEditAt = 0;

function load() {
  try {
    const raw = GoalStore.read();
    if (!raw) return defaultState();
    return migrate(Object.assign(defaultState(), raw));
  } catch { return defaultState(); }
}
function save() {
  if (!window.__goalApplyingRemote) lastLocalEditAt = Date.now();
  GoalStore.write(state);
}

/* ============================================================
   Rollover
   ============================================================ */
function snapshot(list) {
  return list.map((t) => ({
    id: t.id, title: t.title, weight: t.weight, note: t.note || '',
    done: t.done, completedAt: t.completedAt || null, categoryId: t.categoryId
  }));
}

function rolloverIfNeeded() {
  const tk = todayKey(), wk = weekKey();
  let changed = false;

  if (state.lastDay !== tk) {
    changed = true;
    const ended = dailyTasksToday(state.lastDay);
    if (ended.length) {
      state.dailyArchive.unshift({ date: state.lastDay, tasks: snapshot(ended) });
      state.dailyArchive = state.dailyArchive.slice(0, 7);
    }
    // reset recurring daily/routine tasks; drop past-dated one-offs in dated categories
    state.tasks.forEach((t) => {
      const type = catType(t.categoryId);
      if (t.recurring && t.cadence === 'daily' && (type === 'daily' || type === 'routine')) {
        t.done = false; t.completedAt = null;
      }
    });
    state.tasks = state.tasks.filter((t) => {
      const type = catType(t.categoryId);
      if (type !== 'daily' && type !== 'routine') return true;
      if (t.recurring) return true;
      return t.deliverBy >= tk;                       // keep today + future
    });
    rollDayOrders(state.lastDay, tk);
    state.lastDay = tk;
  }

  if (state.lastWeek !== wk) {
    changed = true;
    const ending = weeklyTasksNow(addDays(tk, -1));
    if (ending.length) {
      state.weeklyArchive.unshift({ week: state.lastWeek, tasks: snapshot(ending) });
      state.weeklyArchive = state.weeklyArchive.slice(0, 4);
    }
    state.tasks.forEach((t) => {
      if (catType(t.categoryId) === 'weekly' && t.recurring) { t.done = false; t.completedAt = null; }
    });
    state.tasks = state.tasks.filter((t) => {
      if (catType(t.categoryId) !== 'weekly' || t.recurring) return true;
      return weekKeyFromKey(t.deliverBy) >= wk;       // keep this week + future
    });
    state.lastWeek = wk;
  }

  if (changed) save();
  return changed;
}

/* ============================================================
   Task actions
   ============================================================ */
function findTask(id) { return state.tasks.find((t) => t.id === id); }

function afterChange() {
  save();
  render();
  if (currentPage === 'calendar') renderCalendar();
  if (currentPage === 'create') renderCatManager();
  if (currentPage === 'archives') renderArchive();
}

function toggleTask(id) {
  const t = findTask(id);
  if (!t) return;
  t.done = !t.done;
  t.completedAt = t.done ? nowTime() : null;
  // completing a task in a custom category files it away in that category's archive
  if (t.done && catType(t.categoryId) === 'custom' && !t.recurring) {
    state.archive.unshift({ ...t, archivedAt: todayKey() });
    state.tasks = state.tasks.filter((x) => x.id !== id);
    afterChange();
    toast(`“${t.title}” archived`, 'Undo', () => {
      state.archive = state.archive.filter((x) => x.id !== t.id);
      t.done = false; t.completedAt = null;
      state.tasks.push(t);
      afterChange();
    });
    return;
  }
  afterChange();
}

function deleteTask(id) {
  const t = findTask(id);
  if (!t) return;
  state.tasks = state.tasks.filter((x) => x.id !== id);
  // keep a copy so it can be recovered later from Archives → Recently deleted
  state.deleted.unshift({ ...t, deletedAt: todayKey(), deletedTime: nowTime() });
  state.deleted = state.deleted.slice(0, 200);
  afterChange();
  toast(`Deleted “${t.title}”`, 'Undo', () => { restoreDeleted(t.id); });
}

function restoreDeleted(id) {
  const rec = state.deleted.find((x) => x.id === id);
  if (!rec) return;
  state.deleted = state.deleted.filter((x) => x.id !== id);
  const { deletedAt, deletedTime, ...task } = rec;
  // its category may have been removed in the meantime
  if (!getCat(task.categoryId)) task.categoryId = 'daily';
  state.tasks.push(task);
  afterChange();
  toast(`Restored “${task.title}”`);
}

function addTask(opts) {
  const title = (opts.title || '').trim();
  if (!title) return null;
  const cat = getCat(opts.categoryId) || getCat('daily');
  const recurring = !!opts.recurring;
  const t = {
    id: uid(),
    title,
    weight: Math.max(1, Math.min(5, Number(opts.weight) || 1)),
    note: opts.note || '',
    categoryId: cat.id,
    recurring,
    cadence: recurring ? (opts.cadence || (cat.type === 'weekly' ? 'weekly' : 'daily')) : null,
    days: recurring ? (opts.days || []) : [],
    deliverBy: opts.deliverBy || todayKey(),
    done: false,
    completedAt: null,
    order: Date.now(),
    createdAt: nowTime()
  };
  state.tasks.push(t);
  afterChange();
  return t;
}

function updateTask(id, patch) {
  const t = findTask(id);
  if (!t) return;
  const title = (patch.title || '').trim();
  if (!title) return;
  const wasRoutine = t.categoryId === 'routine';
  Object.assign(t, {
    title,
    weight: Math.max(1, Math.min(5, Number(patch.weight) || 1)),
    note: patch.note || '',
    deliverBy: patch.deliverBy || t.deliverBy,
    recurring: !!patch.recurring
  });
  // routine membership is fixed — tasks can't be moved in or out of it
  if (!wasRoutine && patch.categoryId && patch.categoryId !== 'routine') t.categoryId = patch.categoryId;
  const cat = getCat(t.categoryId);
  if (t.recurring) {
    t.cadence = patch.cadence || t.cadence || (cat.type === 'weekly' ? 'weekly' : 'daily');
    t.days = t.cadence === 'daily' ? (patch.days || []) : [];
  } else {
    t.cadence = null; t.days = [];
  }
  afterChange();
}

/* ============================================================
   Daily page — one box per category
   ============================================================ */
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function recurLabel(t) {
  if (t.cadence === 'weekly') return '↻ weekly';
  if (!t.days || !t.days.length) return '↻ daily';
  return '↻ ' + [1, 2, 3, 4, 5, 6, 0].filter((d) => t.days.includes(d)).map((d) => DAY_ABBR[d]).join(' ');
}

function render() {
  renderTaskArea();
  renderBars();
  pushWidget();
}

function renderTaskArea() {
  const host = $('#categoryCols');
  if (!host) return;
  host.innerHTML = '';
  document.querySelectorAll('.view-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === state.taskmasterView));
  if (state.taskmasterView === 'grouped') renderGroupedView(host);
  else state.categories.forEach((cat) => host.appendChild(categoryBox(cat)));
}

// Tasks a category box should show: everything still relevant, plus today's
// completions so ticking one off doesn't make it vanish mid-glance.
function catBoxTasks(cat) {
  const tk = todayKey();
  return tasksOf(cat.id).filter((t) => {
    if (t.recurring) return activeOn(t, tk) || dueDateOf(t) > tk;
    if (t.done) return t.deliverBy === tk;
    return true;
  });
}

// The single ordering used by BOTH the category box and the widget, so the two
// can never drift: due today first (in the category's own order), then upcoming
// by deliver-by date.
function catOrderedTasks(cat, dateKey = todayKey()) {
  const pool = catBoxTasks(cat);
  const dueToday = sortInCat(pool.filter((t) => dueDateOf(t) <= dateKey), cat, dateKey);
  const later = pool.filter((t) => dueDateOf(t) > dateKey)
    .sort((a, b) => dueDateOf(a).localeCompare(dueDateOf(b)) || orderOf(a, dateKey) - orderOf(b, dateKey));
  return { dueToday, later, all: dueToday.concat(later) };
}

function categoryBox(cat) {
  const dateKey = todayKey();
  const box = el('div', 'list-section cat-box');
  box.dataset.cat = cat.id;

  const { dueToday, later, all } = catOrderedTasks(cat, dateKey);
  const limit = cat.expanded ? all.length : Math.max(1, cat.limit || 3);

  /* ---- header ---- */
  const head = el('div', 'section-head');
  const h2 = el('h2');
  h2.innerHTML = `${escapeHtml(cat.name)} <span class="cat-dot ${cat.color}">●</span>`;
  const count = el('span', 'cat-count');
  count.textContent = all.length ? `${all.filter((t) => !t.done).length}/${all.length}` : '0';
  h2.appendChild(count);
  head.appendChild(h2);

  const actions = el('div', 'head-actions');
  const mini = (label, title, fn, active) => {
    const b = el('button', 'add-mini' + (active ? ' active' : ''));
    b.textContent = label; b.title = title; b.onclick = fn;
    actions.appendChild(b);
    return b;
  };

  mini('▤', `Open ${cat.name} archive`, () => { showPage('archives'); setArchiveTab(archiveTabForCat(cat)); });
  if (catHasWeight(cat.id)) {
    mini(cat.sort === 'weight' ? '⇅' : '↕',
      cat.sort === 'weight' ? 'Sorting by weight (low→high) — switch to manual' : 'Sort by weight (low→high)',
      () => { cat.sort = cat.sort === 'weight' ? 'manual' : 'weight'; save(); renderTaskArea(); },
      cat.sort === 'weight');
  }
  if (all.length > (cat.limit || 3)) {
    mini(cat.expanded ? '⌃' : '⌄',
      cat.expanded ? 'Collapse to top tasks' : `Expand all ${all.length}`,
      () => { cat.expanded = !cat.expanded; save(); renderTaskArea(); },
      cat.expanded);
  }
  if (cat.type === 'daily' && state.settings.showImport) {
    mini('⇪', 'Import / paste a checklist', () => openImport(cat.id));
  }
  mini('＋', `Add a ${cat.name} task`, () => openModal({ categoryId: cat.id }));
  head.appendChild(actions);
  box.appendChild(head);

  /* ---- due today (highlighted) then upcoming ---- */
  let budget = limit;
  if (!all.length) {
    const hint = el('div', 'empty-hint');
    hint.textContent = `No ${cat.name.toLowerCase()} tasks — add one with ＋`;
    box.appendChild(hint);
  } else {
    if (dueToday.length) {
      const due = el('div', 'due-today-box');
      const dh = el('div', 'due-today-head');
      dh.textContent = `Due today · ${dueToday.length}`;
      due.appendChild(dh);
      const dl = el('div', 'task-list');
      dueToday.slice(0, budget).forEach((t) => dl.appendChild(taskRow(t, dl, dateKey, cat)));
      budget -= Math.min(budget, dueToday.length);
      makeSortable(dl, cat, dateKey);
      due.appendChild(dl);
      box.appendChild(due);
    }
    if (later.length && budget > 0) {
      const ul = el('div', 'task-list upcoming-list');
      later.slice(0, budget).forEach((t) => ul.appendChild(taskRow(t, ul, dateKey, cat)));
      makeSortable(ul, cat, dateKey);
      box.appendChild(ul);
    }
  }

  const hiddenCount = all.length - Math.min(all.length, limit);
  if (hiddenCount > 0) {
    const more = el('button', 'cat-more-btn');
    more.textContent = `＋ ${hiddenCount} more — expand`;
    more.onclick = () => { cat.expanded = true; save(); renderTaskArea(); };
    box.appendChild(more);
  }

  if (cat.type === 'daily') {
    const qa = el('input', 'quick-add');
    qa.type = 'text';
    qa.placeholder = '＋ Quick add — Enter to save, end with (3) for weight';
    qa.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const parsed = parseTaskLine(e.target.value);
      if (!parsed) return;
      addTask({ title: parsed.title, weight: parsed.weight, categoryId: cat.id, deliverBy: todayKey() });
      e.target.value = '';
    });
    box.appendChild(qa);
  }
  return box;
}

function taskRow(t, container, dateKey, cat) {
  const row = el('div', 'task-row' + (t.done ? ' done' : '') + (cat.type === 'routine' ? ' routine' : ''));
  row.draggable = true;
  row.dataset.id = t.id;
  row.ondragstart = (e) => { e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); };
  row.ondragend = () => { row.classList.remove('dragging'); commitOrder(container, cat, dateKey); };

  const handle = el('span', 'drag-handle');
  handle.textContent = '⠿'; handle.title = 'Drag to reorder';
  row.appendChild(handle);

  const box = el('div', `checkbox ${cat.color}` + (t.done ? ' checked' : ''));
  box.onclick = () => toggleTask(t.id);
  row.appendChild(box);

  const main = el('div', 'task-main');
  const name = el('div', 'task-name');
  name.textContent = t.title;
  main.appendChild(name);
  if (t.note && state.settings.showWeightNotes) {
    const note = el('div', 'task-note');
    note.textContent = t.note;
    main.appendChild(note);
  }
  row.appendChild(main);

  if (t.recurring) {
    const r = el('span', 'recur-badge');
    r.textContent = recurLabel(t); r.title = 'Recurring';
    row.appendChild(r);
  }
  // deliver-by sits next to the weight; today/overdue are called out
  const due = dueDateOf(t);
  const tk = todayKey();
  const dueBadge = el('span', 'due-badge' + (due < tk ? ' overdue' : due === tk ? ' today' : ''));
  dueBadge.textContent = due === tk ? 'today' : prettyDate(due);   // the user's chosen format
  dueBadge.title = 'Deliver by ' + prettyDate(due);
  row.appendChild(dueBadge);

  // Routine is weightless by design — no score, no badge.
  if (catHasWeight(cat.id)) {
    const badge = el('span', 'weight-badge w' + t.weight);
    badge.textContent = '×' + t.weight;
    if (t.note) badge.title = t.note;
    row.appendChild(badge);
  }

  const edit = el('button', 'row-edit');
  edit.textContent = '✎'; edit.title = 'Edit';
  edit.onclick = (e) => { e.stopPropagation(); openEditModal(t.id); };
  row.appendChild(edit);

  const del = el('button', 'row-del');
  del.textContent = '✕'; del.title = 'Delete';
  del.onclick = (e) => { e.stopPropagation(); deleteTask(t.id); };
  row.appendChild(del);
  return row;
}

function makeSortable(list, cat, dateKey) {
  list.ondragover = (e) => {
    e.preventDefault();
    const dragging = list.querySelector('.task-row.dragging');
    if (!dragging) return;
    const after = dragAfterElement(list, e.clientY);
    if (after == null) list.appendChild(dragging);
    else list.insertBefore(dragging, after);
  };
}

function dragAfterElement(container, y) {
  const rows = [...container.querySelectorAll('.task-row:not(.dragging)')];
  let closest = { offset: -Infinity, el: null };
  for (const row of rows) {
    const b = row.getBoundingClientRect();
    const offset = y - b.top - b.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, el: row };
  }
  return closest.el;
}

// Day-scoped categories store order per date; persistent ones permute their own slots.
function commitOrder(container, cat, dateKey) {
  const ordered = [...container.querySelectorAll('.task-row')]
    .map((r) => findTask(r.dataset.id)).filter(Boolean);
  if (cat.type === 'custom') setGlobalOrder(ordered);
  else setDayOrder(ordered, dateKey);
  if (cat.sort === 'weight') cat.sort = 'manual';   // dragging implies manual order
  afterChange();
}

/* ============================================================
   Progress bars
   ============================================================ */
let lastDailyPct = 0, lastWeeklyPct = 0;

function renderBars() {
  const d = dailyProgress(), w = weeklyProgress();
  const mobile = window.innerWidth <= 760;
  const maxTrack = mobile ? 150 : Math.max(170, Math.min(window.innerHeight * 0.42, 420));
  const minTrack = mobile ? 84 : Math.max(110, maxTrack * 0.45);

  $('#weeklyTopFill').style.width = w.pct + '%';
  $('#weeklyTopPct').textContent = Math.round(w.pct) + '%';

  const weeklyFill = $('#weeklyBarFill');
  weeklyFill.parentElement.style.height = Math.round(maxTrack / 3) + 'px';
  weeklyFill.style.height = w.pct + '%';
  $('#weeklyPct').textContent = Math.round(w.pct) + '%';
  if (w.pct > lastWeeklyPct + 0.1) {
    weeklyFill.classList.remove('bump'); void weeklyFill.offsetWidth; weeklyFill.classList.add('bump');
  }

  const cap = weightCap();
  const grow = Math.min(d.total / cap, 1);
  $('#dailyTrack').style.height = (minTrack + grow * (maxTrack - minTrack)) + 'px';

  const fill = $('#dailyBarFill');
  fill.style.height = d.pct + '%';
  if (d.pct > lastDailyPct + 0.1) {
    fill.classList.remove('bump'); void fill.offsetWidth; fill.classList.add('bump');
    emitSparks(d.pct);
    if (d.pct >= 99.9 && lastDailyPct < 99.9) celebrate();
  }
  lastDailyPct = d.pct; lastWeeklyPct = w.pct;

  $('#dailyPct').textContent = Math.round(d.pct) + '%';
  $('#dailyMeta').textContent = d.total ? `${d.done}/${d.total} weight · cap ${cap}` : 'add tasks to begin';
}

function spark(burst, leftPct, topPct, spread) {
  const s = el('span', 'spark');
  s.style.left = leftPct + '%';
  s.style.top = topPct + '%';
  const ang = Math.random() * Math.PI * 2;
  const dist = spread + Math.random() * spread;
  s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
  s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
  burst.appendChild(s);
  setTimeout(() => s.remove(), 700);
}
function emitSparks(pct) {
  const burst = $('#dailyBurst');
  for (let i = 0; i < 12; i++) spark(burst, 50, 100 - Math.min(pct, 100), 20);
}
function celebrate() {
  const burst = $('#dailyBurst');
  for (let wave = 0; wave < 3; wave++) {
    setTimeout(() => {
      for (let i = 0; i < 14; i++) spark(burst, 20 + Math.random() * 60, Math.random() * 100, 26);
    }, wave * 180);
  }
}

/* ============================================================
   Widget
   ============================================================ */
function pushWidget() {
  if (!window.goalAPI || !window.goalAPI.pushWidget) return;
  const dateKey = todayKey();
  const sections = state.categories.filter((c) => c.widget).map((c) => {
    // same ordering the app shows, so the widget never disagrees with the list
    const tasks = catOrderedTasks(c, dateKey).all.slice(0, Math.max(1, c.limit || 2));
    const sec = {
      key: c.id, label: c.name, color: c.color,
      tasks: tasks.map((t) => ({
        id: t.id, kind: c.id, title: t.title, done: t.done,
        weight: catHasWeight(c.id) ? t.weight : null,
        due: dueDateOf(t) === dateKey ? 'today' : shortDate(dueDateOf(t)),  // widget is tiny — compact form

        overdue: dueDateOf(t) < dateKey
      }))
    };
    if (c.type === 'weekly') sec.pct = Math.round(weeklyProgress().pct);
    if (c.type === 'daily') sec.pct = Math.round(dailyProgress().pct);
    return sec;
  });
  window.goalAPI.pushWidget({ theme: state.theme, sections });
}

/* ============================================================
   Task modal
   ============================================================ */
let modalEditId = null, modalWeight = 1, modalDays = new Set(), modalCatId = 'daily';

function fillCategorySelect(sel, selectedId, lockRoutine) {
  sel.innerHTML = '';
  state.categories.forEach((c) => {
    if (c.id === 'routine' && !lockRoutine) return;       // can't move tasks into Routine
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.name;
    sel.appendChild(o);
  });
  sel.value = selectedId;
  sel.disabled = !!lockRoutine;                            // and can't move them out
  sel.title = lockRoutine ? "Routine tasks can't be moved to another category" : '';
}

function syncModalFields() {
  const recurring = $('#recurringChk').checked;
  const cat = getCat(modalCatId) || getCat('daily');
  const isWeeklyCat = cat.type === 'weekly';
  // routine chores carry no weight, so hide the picker and its note
  const weighted = catHasWeight(cat.id);
  $('#weightPick').classList.toggle('hidden', !weighted);
  $('#weightLabel').classList.toggle('hidden', !weighted);
  $('#noteLabel').classList.toggle('hidden', !weighted);
  $('#taskNote').classList.toggle('hidden', !weighted);
  // custom categories choose their cadence; weekly/daily categories are implied
  $('#cadenceWrap').classList.toggle('hidden', !(recurring && cat.type === 'custom'));
  const cadence = recurring
    ? (cat.type === 'custom' ? $('#taskCadence').value : (isWeeklyCat ? 'weekly' : 'daily'))
    : null;
  $('#dayPickWrap').classList.toggle('hidden', !(recurring && cadence === 'daily'));
  $('#dateRow').classList.toggle('hidden', cat.type === 'custom' && recurring);
  $('#dateLabel').textContent = isWeeklyCat ? 'Deliver by (any date in the target week)' : 'Deliver by';
}

function openModal(opts = {}) {
  modalEditId = null;
  modalWeight = 1;
  modalDays = new Set();
  modalCatId = opts.categoryId || 'daily';
  $('#modalTitle').textContent = 'New task';
  $('#modalSave').textContent = 'Add task';
  $('#modalDelete').classList.add('hidden');
  $('#taskTitle').value = '';
  $('#taskNote').value = '';
  $('#taskDate').value = opts.deliverBy || todayKey();
  $('#recurringChk').checked = false;
  $('#taskCadence').value = 'daily';
  $('#modalDateNote').classList.add('hidden');
  fillCategorySelect($('#taskCategory'), modalCatId, modalCatId === 'routine');
  document.querySelectorAll('#weightPick .w-btn').forEach((b) => b.classList.toggle('active', b.dataset.w === '1'));
  document.querySelectorAll('#dayPick button').forEach((b) => b.classList.remove('active'));
  syncModalFields();
  $('#modal').classList.remove('hidden');
  setTimeout(() => $('#taskTitle').focus(), 30);
}

function openEditModal(id) {
  const t = findTask(id);
  if (!t) return;
  modalEditId = id;
  modalWeight = t.weight;
  modalDays = new Set(t.days || []);
  modalCatId = t.categoryId;
  $('#modalTitle').textContent = 'Edit task';
  $('#modalSave').textContent = 'Save changes';
  $('#modalDelete').classList.remove('hidden');
  $('#taskTitle').value = t.title;
  $('#taskNote').value = t.note || '';
  $('#taskDate').value = t.deliverBy || todayKey();
  $('#recurringChk').checked = !!t.recurring;
  $('#taskCadence').value = t.cadence || 'daily';
  $('#modalDateNote').classList.add('hidden');
  fillCategorySelect($('#taskCategory'), modalCatId, modalCatId === 'routine');
  document.querySelectorAll('#weightPick .w-btn')
    .forEach((b) => b.classList.toggle('active', Number(b.dataset.w) === t.weight));
  document.querySelectorAll('#dayPick button')
    .forEach((b) => b.classList.toggle('active', modalDays.has(Number(b.dataset.day))));
  syncModalFields();
  $('#modal').classList.remove('hidden');
  setTimeout(() => $('#taskTitle').focus(), 30);
}
function closeModal() { $('#modal').classList.add('hidden'); }

function saveModal() {
  const cat = getCat(modalCatId) || getCat('daily');
  const recurring = $('#recurringChk').checked;
  const cadence = recurring
    ? (cat.type === 'custom' ? $('#taskCadence').value : (cat.type === 'weekly' ? 'weekly' : 'daily'))
    : null;
  const payload = {
    title: $('#taskTitle').value,
    weight: modalWeight,
    note: $('#taskNote').value.trim(),
    categoryId: modalCatId,
    recurring,
    cadence,
    days: cadence === 'daily' ? [...modalDays].sort() : [],
    deliverBy: $('#taskDate').value || todayKey()
  };
  if (modalEditId) updateTask(modalEditId, payload);
  else addTask(payload);
  closeModal();
}

/* ---------- shared line parser (quick add + import) ---------- */
function parseTaskLine(line) {
  let s = (line || '').trim();
  if (!s) return null;
  s = s.replace(/^[-*•]\s*/, '').replace(/^\[[ xX]\]\s*/, '').replace(/^\d+[.)]\s*/, '');
  if (!s) return null;
  let weight = 1;
  const m = s.match(/(?:\((\d)\)|!\s*(\d))\s*$/);
  if (m) {
    weight = Math.min(5, Math.max(1, Number(m[1] || m[2])));
    s = s.replace(/(?:\(\d\)|!\s*\d)\s*$/, '').trim();
  }
  return s ? { title: s, weight } : null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============================================================
   Toast
   ============================================================ */
let toastTimer;
function toast(msg, actionLabel, actionFn) {
  const t = $('#toast');
  t.textContent = msg;
  if (actionLabel && actionFn) {
    const b = el('button', 'toast-action');
    b.textContent = actionLabel;
    b.onclick = () => { t.classList.add('hidden'); actionFn(); };
    t.appendChild(b);
  }
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), actionLabel ? 6000 : 2600);
}

/* ============================================================
   Theme / platform / nav
   ============================================================ */
function applyTheme() {
  document.body.classList.toggle('dark', state.theme === 'dark');
  $('#themeToggle').textContent = state.theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode';
}
function applyPlatformUI() {
  if (!window.goalAPI) {
    ['#startupToggle', '#exportNowBtn', '#exportGcalBtn', '#logTimeRow', '#widgetToggle']
      .forEach((s) => { const e = $(s); if (e) e.classList.add('hidden'); });
  }
}
function updateWidgetToggle() {
  const b = $('#widgetToggle');
  if (b) b.textContent = '📌 Sticky widget: ' + (state.widgetOpen ? 'on' : 'off');
}
function setStartupLabel(on) {
  $('#startupToggle').textContent = '⏻ Launch at startup: ' + (on ? 'on' : 'off');
}

let currentPage = 'taskmaster';
const PAGES = ['taskmaster', 'create', 'calendar', 'archives', 'settings'];
function showPage(page) {
  currentPage = page;
  PAGES.forEach((p) => $('#page-' + p).classList.toggle('hidden', p !== page));
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  if (page === 'archives') renderArchive();
  if (page === 'calendar') renderCalendar();
  if (page === 'taskmaster') renderTaskArea();
  if (page === 'create') { renderCatManager(); fillCategorySelect($('#cCategory'), 'daily', false); }
  if (page === 'settings') renderSettings();
}

/* ============================================================
   Boot
   ============================================================ */
rolloverIfNeeded();
applyTheme();
wire();
applyPlatformUI();
render();
setupSync();
scheduleLogCheck();

setInterval(() => { if (rolloverIfNeeded()) render(); }, 60 * 1000);

let resizeRaf;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(renderBars);
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
