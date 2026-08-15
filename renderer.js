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

// Set when load() couldn't understand the saved data. While it's true we refuse
// to persist anything, because the in-memory state is a blank default and saving
// it would overwrite the real save — and then sync would push the blank upward.
let loadFailed = false;
let loadFailure = null;

function load() {
  let raw = null;
  try {
    raw = GoalStore.read();
  } catch (e) {
    loadFailed = true; loadFailure = e;
    console.error('Goal Setter: could not read saved data', e);
    return defaultState();
  }
  if (!raw) return defaultState();          // genuinely a first run
  try {
    return migrate(Object.assign(defaultState(), raw));
  } catch (e) {
    // A bug in migrate() used to end up here and silently hand back an empty
    // state, which the next save() then wrote over the top of real data. Keep
    // the raw payload and refuse to write until it's understood.
    loadFailed = true; loadFailure = e;
    window.__goalRawBackup = raw;
    console.error('Goal Setter: saved data could not be migrated — refusing to overwrite it', e);
    return defaultState();
  }
}

function save() {
  if (loadFailed) {
    console.error('Goal Setter: save blocked; saved data was not loaded cleanly', loadFailure);
    return;
  }
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

// A completed recurring task clears when its reset point arrives — the earlier
// of the next week boundary and its own next recurrence. This replaces the old
// rules, which reset every routine and daily-recurring task at midnight and
// every weekly one at the week turn, regardless of the days it recurs on.
function clearDueRecurrences(tk = todayKey()) {
  let n = 0;
  state.tasks.forEach((t) => {
    const due = resetDueOn(t);
    if (due && tk >= due) {
      t.done = false; t.completedAt = null; t.completedOn = null;
      n++;
    }
  });
  return n;
}

function rolloverIfNeeded() {
  const tk = todayKey(), wk = weekKey();
  // Reset points are dates, so check them on every boot rather than only on a
  // day boundary — state arriving from another device can already be due.
  let changed = clearDueRecurrences(tk) > 0;

  if (state.lastDay !== tk) {
    changed = true;
    const ended = dailyTasksToday(state.lastDay);
    if (ended.length) {
      state.dailyArchive.unshift({ date: state.lastDay, tasks: snapshot(ended) });
      state.dailyArchive = state.dailyArchive.slice(0, 7);
    }
    state.tasks = state.tasks.filter((t) => {
      const type = catType(t.categoryId);
      if (type !== 'daily' && type !== 'routine') return true;
      if (type === 'routine' || t.recurring) return true;
      if (!t.deliverBy) return true;                  // undated is a someday pile, never swept
      // Unfinished work carries forward and stays overdue rather than being
      // swept at midnight. Without this an overdue task simply vanished, which
      // made "is anything overdue?" a question the app could never answer.
      if (!t.done) return true;
      return t.deliverBy >= tk;                       // completed one-offs are archived, then cleared
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
    state.tasks = state.tasks.filter((t) => {
      if (catType(t.categoryId) !== 'weekly' || t.recurring) return true;
      if (!t.deliverBy) return true;                  // undated is a someday pile, never swept
      if (!t.done) return true;                       // unfinished work carries forward as overdue
      return weekKeyFromKey(t.deliverBy) >= wk;       // completed one-offs are archived, then cleared
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
  if (currentPage === 'bigpicture') renderBigPicture();
}

function toggleTask(id) {
  const t = findTask(id);
  if (!t) return;
  t.done = !t.done;
  t.completedAt = t.done ? nowTime() : null;
  // the DATE matters for recurrence: resetDueOn() measures from here
  t.completedOn = t.done ? todayKey() : null;
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

// Steps arrive from the modal as plain strings or as existing {id,title,done}.
function normaliseSteps(list) {
  return (Array.isArray(list) ? list : [])
    .map((x) => (typeof x === 'string' ? { title: x } : x))
    .filter((x) => x && String(x.title || '').trim())
    .map((x) => ({ id: x.id || uid(), title: String(x.title).trim().slice(0, 120), done: !!x.done }))
    .slice(0, STEP_MAX);
}

// Ticking a step is a direct edit — it has no weight, so nothing recalculates
// beyond the task's own N/M readout.
function toggleStep(taskId, stepId) {
  const t = findTask(taskId);
  if (!t) return;
  const s = stepsOf(t).find((x) => x.id === stepId);
  if (!s) return;
  s.done = !s.done;
  afterChange();
}

/* ---------- big picture projects ---------- */
function addProject(opts) {
  const name = (opts.name || '').trim();
  if (!name) return null;
  const cat = getCat(opts.categoryId) || getCat(defaultCatId());
  if (!cat) return null;
  const p = {
    id: 'p_' + uid(),
    name: name.slice(0, 60),
    categoryId: cat.id,
    deliverBy: opts.deliverBy || null,
    note: opts.note || '',
    order: Date.now()
  };
  state.projects.push(p);
  afterChange();
  return p;
}

function updateProject(id, patch) {
  const p = getProject(id);
  if (!p) return;
  const name = (patch.name || '').trim();
  if (name) p.name = name.slice(0, 60);
  if (patch.deliverBy !== undefined) p.deliverBy = patch.deliverBy || null;
  if (typeof patch.note === 'string') p.note = patch.note;
  if (patch.categoryId && getCat(patch.categoryId)) {
    p.categoryId = patch.categoryId;
    // sub-tasks follow their project, so the two can never disagree
    subtasksOf(p.id).forEach((t) => { t.categoryId = p.categoryId; });
  }
  afterChange();
}

// Deleting a project takes its sub-tasks with it — they have no meaning on
// their own — but both come back together on Undo.
function deleteProject(id) {
  const p = getProject(id);
  if (!p) return;
  const at = state.projects.indexOf(p);
  const subs = subtasksOf(id);
  state.projects = state.projects.filter((x) => x.id !== id);
  state.tasks = state.tasks.filter((t) => t.parentId !== id);
  if (expandedProjectId === id) expandedProjectId = null;
  afterChange();
  toast(`Deleted “${p.name}”${subs.length ? ` · ${subs.length} sub-task${subs.length === 1 ? '' : 's'}` : ''}`,
    'Undo', () => {
      state.projects.splice(at, 0, p);
      subs.forEach((t) => state.tasks.push(t));
      afterChange();
    });
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
    // a sub-task when it names a project it belongs to
    parentId: (opts.parentId && getProject(opts.parentId)) ? opts.parentId : null,
    steps: normaliseSteps(opts.steps),
    // optional, and never set for routine — a chore recurs, it isn't due
    deliverBy: cat.type === 'routine' ? null : (opts.deliverBy || null),
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
  // Routine membership is no longer fixed — a chore can graduate into a real
  // category, and a task can be demoted to one. A sub-task is the exception: it
  // sits in its project's category and moves only when the project does.
  if (t.parentId && getProject(t.parentId)) {
    t.categoryId = getProject(t.parentId).categoryId;
  } else if (patch.categoryId && getCat(patch.categoryId)) {
    t.categoryId = patch.categoryId;
  }
  const nowRoutine = catType(t.categoryId) === 'routine';
  Object.assign(t, {
    title,
    weight: Math.max(1, Math.min(5, Number(patch.weight) || 1)),
    note: patch.note || '',
    // '' clears the date deliberately, so don't fall back to the old value.
    // Routine carries no date at all, so moving in drops it.
    deliverBy: nowRoutine ? null : (patch.deliverBy || null),
    recurring: !!patch.recurring
  });
  if (patch.steps !== undefined) t.steps = normaliseSteps(patch.steps);
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
  // Sub-tasks belong to their project's card, not to the category list — the
  // project is pinned at the top of the box and stands in for them.
  return topLevelTasks(tasksOf(cat.id)).filter((t) => {
    if (cat.type === 'routine') return true;             // standing list, always shown
    if (t.recurring) return activeOn(t, tk) || dueDateOf(t) > tk;
    // A ticked task stays put until rollover clears it — including one that was
    // overdue when completed, which would otherwise vanish the instant you tick it.
    if (t.done) return !t.deliverBy || t.deliverBy <= tk;
    return true;
  });
}

// The single ordering used by BOTH the category box and the widget, so the two
// can never drift: due today first (in the category's own order), then upcoming
// by deliver-by date.
function catOrderedTasks(cat, dateKey = todayKey()) {
  const pool = catBoxTasks(cat);
  // Undated tasks are neither due nor upcoming — they trail the list in the
  // category's own manual order, so a someday pile can't jump the queue.
  const dated = pool.filter(hasDate);
  const undated = sortInCat(pool.filter((t) => !hasDate(t)), cat, dateKey);
  // Overdue is split out from due-today now that unfinished work carries forward
  // instead of being swept — otherwise a week of misses would quietly pile up
  // inside a box labelled "Due today".
  const overdue = sortInCat(dated.filter((t) => dueDateOf(t) < dateKey), cat, dateKey);
  const dueToday = sortInCat(dated.filter((t) => dueDateOf(t) === dateKey), cat, dateKey);
  const later = dated.filter((t) => dueDateOf(t) > dateKey)
    .sort((a, b) => compareDue(a, b) || orderOf(a, dateKey) - orderOf(b, dateKey));
  return { overdue, dueToday, later, undated, all: overdue.concat(dueToday, later, undated) };
}

function categoryBox(cat) {
  const dateKey = todayKey();
  // tint-* sets --c to the category colour; the box's border, header wash and
  // checkboxes all key off it so each category reads as its own object.
  const box = el('div', `list-section cat-box tint-${cat.color}`);
  box.dataset.cat = cat.id;

  const { overdue, dueToday, later, undated, all } = catOrderedTasks(cat, dateKey);
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

  /* ---- projects pinned above everything else ---- */
  const projects = projectsOf(cat.id);
  projects.forEach((p) => box.appendChild(pinnedProject(p)));

  /* ---- due today (highlighted) then upcoming ---- */
  let budget = limit;
  if (!all.length) {
    if (!projects.length) {
      const hint = el('div', 'empty-hint');
      hint.textContent = `No ${cat.name.toLowerCase()} tasks — add one with ＋`;
      box.appendChild(hint);
    }
  } else {
    // Overdue leads, in its own alarm-coloured callout — carried-forward misses
    // are the thing you most need to see when you open the app.
    if (overdue.length && budget > 0) {
      const od = el('div', 'due-today-box overdue-box');
      const oh = el('div', 'due-today-head overdue-head');
      oh.textContent = `Overdue · ${overdue.length}`;
      od.appendChild(oh);
      const ol = el('div', 'task-list');
      overdue.slice(0, budget).forEach((t) => ol.appendChild(taskRow(t, ol, dateKey, cat)));
      budget -= Math.min(budget, overdue.length);
      makeSortable(ol, cat, dateKey);
      od.appendChild(ol);
      box.appendChild(od);
    }
    if (dueToday.length && budget > 0) {
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
      budget -= Math.min(budget, later.length);
      makeSortable(ul, cat, dateKey);
      box.appendChild(ul);
    }
    // Undated work still has to appear somewhere. Routine is entirely undated, so
    // it needs no heading — the box is the list. A mixed category gets a label so
    // the someday pile reads as distinct from the scheduled work above it.
    if (undated.length && budget > 0) {
      if (dueToday.length || later.length) {
        const sub = el('div', 'task-subgroup');
        sub.textContent = NO_DATE_LABEL;
        box.appendChild(sub);
      }
      const nl = el('div', 'task-list undated-list');
      undated.slice(0, budget).forEach((t) => nl.appendChild(taskRow(t, nl, dateKey, cat)));
      makeSortable(nl, cat, dateKey);
      box.appendChild(nl);
    }
  }

  const hiddenCount = all.length - Math.min(all.length, limit);
  if (hiddenCount > 0) {
    const more = el('button', 'cat-more-btn');
    more.textContent = `＋ ${hiddenCount} more — expand`;
    more.onclick = () => { cat.expanded = true; save(); renderTaskArea(); };
    box.appendChild(more);
  }

  return box;
}

// A project as it appears pinned at the top of its category: name, progress,
// and the two dates that matter — the next sub-task and the project's own.
// Clicking it opens the Big Picture tab, same as clicking it there.
function pinnedProject(p) {
  const row = el('button', 'pinned-project');
  row.type = 'button';
  row.onclick = () => openProject(p.id);
  row.title = 'Open in Big Picture';

  const head = el('div', 'pp-head');
  const name = el('span', 'pp-name');
  name.textContent = p.name;
  const { wrap, prog } = projectBar(p);
  const pct = el('span', 'pp-pct');
  pct.textContent = Math.round(prog.pct) + '%';
  head.appendChild(name); head.appendChild(pct);
  row.appendChild(head);
  row.appendChild(wrap);

  const subs = subtasksOf(p.id);
  const meta = el('div', 'pp-meta');
  meta.textContent = `${subs.filter((t) => t.done).length}/${subs.length}  ·  ${projectMetaLine(p)}`;
  row.appendChild(meta);
  return row;
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
  // deliver-by sits next to the weight; today/overdue are called out. Routine
  // never carries a date, so it gets no badge at all rather than an empty one.
  const due = dueDateOf(t);
  const tk = todayKey();
  if (cat.type !== 'routine') {
    const dueBadge = el('span', 'due-badge'
      + (!due ? ' undated' : due < tk ? ' overdue' : due === tk ? ' today' : ''));
    dueBadge.textContent = dueLabel(due);         // format + days remaining, per Settings
    dueBadge.title = due ? `Deliver by ${prettyDate(due)} · ${relativeDue(due)}`
      : 'No deliver-by date — not counted by any progress bar';
    row.appendChild(dueBadge);
  }

  // steps are a checklist, not weight — show how far through, nothing more
  const sp = stepProgress(t);
  if (sp.total) {
    const chip = el('span', 'step-count' + (sp.done === sp.total ? ' complete' : ''));
    chip.textContent = `☑ ${sp.done}/${sp.total}`;
    chip.title = `${sp.done} of ${sp.total} steps done`;
    row.appendChild(chip);
  }

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
   Big Picture — projects as cards, one expandable to fill the pane
   ============================================================ */
// transient: which project is open. Deliberately not saved — reopening the app
// shouldn't drop you inside whatever you last looked at.
let expandedProjectId = null;

// Shared by the Big Picture cards and the pinned row in Taskmaster.
function projectMetaLine(p) {
  const next = projectNextDue(p), due = projectDue(p);
  const bits = [];
  bits.push(next ? `next ${shortDate(next)} · ${relativeDue(next)}` : 'nothing outstanding');
  if (due) bits.push(`due ${shortDate(due)}`);
  return bits.join('  ·  ');
}

function projectBar(p) {
  const prog = projectProgress(p);
  const wrap = el('div', 'proj-bar');
  const track = el('div', 'milestone-track');
  const fill = el('div', 'milestone-fill');
  fill.style.width = prog.pct + '%';
  track.appendChild(fill);
  wrap.appendChild(track);
  return { wrap, prog };
}

function renderBigPicture() {
  const host = $('#bigPictureBody');
  if (!host) return;
  host.innerHTML = '';
  const projects = (state.projects || []);

  if (!projects.length) {
    const hint = el('div', 'empty-hint');
    hint.textContent = 'No projects yet. A project holds sub-tasks that each carry their own weight and deliver-by date.';
    host.appendChild(hint);
    return;
  }

  // expanded takes the whole pane; otherwise a grid of cards
  if (expandedProjectId && getProject(expandedProjectId)) {
    host.appendChild(projectDetail(getProject(expandedProjectId)));
    return;
  }

  const grid = el('div', 'bp-grid');
  projects.forEach((p) => grid.appendChild(projectCard(p)));
  host.appendChild(grid);
}

function projectCard(p) {
  const cat = getCat(p.categoryId) || { name: '—', color: 'gray' };
  const card = el('button', `bp-card tint-${cat.color}`);
  card.type = 'button';
  card.onclick = () => { expandedProjectId = p.id; renderBigPicture(); };
  card.title = 'Open project';

  const head = el('div', 'bp-card-head');
  const name = el('span', 'bp-card-name');
  name.textContent = p.name;
  const pct = el('span', 'bp-card-pct');
  const { wrap, prog } = projectBar(p);
  pct.textContent = Math.round(prog.pct) + '%';
  head.appendChild(name); head.appendChild(pct);
  card.appendChild(head);

  const catLine = el('div', 'bp-card-cat');
  catLine.innerHTML = `<span class="cat-dot">●</span> ${escapeHtml(cat.name)}`;
  card.appendChild(catLine);

  card.appendChild(wrap);

  const meta = el('div', 'bp-card-meta');
  const subs = subtasksOf(p.id);
  meta.textContent = `${subs.filter((t) => t.done).length}/${subs.length} sub-tasks  ·  ${projectMetaLine(p)}`;
  card.appendChild(meta);
  return card;
}

function projectDetail(p) {
  const cat = getCat(p.categoryId) || { name: '—', color: 'gray' };
  const wrap = el('div', `bp-detail tint-${cat.color}`);

  const bar = el('div', 'bp-detail-head');
  const back = el('button', 'btn-ghost btn-small');
  back.textContent = '← All projects';
  back.onclick = () => { expandedProjectId = null; renderBigPicture(); };
  bar.appendChild(back);

  const actions = el('div', 'bp-detail-actions');
  const edit = el('button', 'btn-ghost btn-small');
  edit.textContent = '✎ Edit project';
  edit.onclick = () => openProjectModal(p.id);
  const add = el('button', 'btn-primary btn-small');
  add.textContent = '＋ Sub-task';
  add.onclick = () => openModal({ categoryId: p.categoryId, parentId: p.id });
  actions.appendChild(edit); actions.appendChild(add);
  bar.appendChild(actions);
  wrap.appendChild(bar);

  const title = el('h2', 'bp-detail-title');
  title.textContent = p.name;
  wrap.appendChild(title);

  const sub = el('div', 'bp-detail-sub');
  sub.innerHTML = `<span class="cat-dot">●</span> ${escapeHtml(cat.name)}  ·  ${escapeHtml(projectMetaLine(p))}`;
  wrap.appendChild(sub);

  const { wrap: barWrap, prog } = projectBar(p);
  const pctRow = el('div', 'bp-detail-pct');
  pctRow.textContent = prog.total
    ? `${Math.round(prog.pct)}%  ·  ${prog.done}/${prog.total} weight`
    : 'no weighted sub-tasks yet';
  wrap.appendChild(pctRow);
  wrap.appendChild(barWrap);

  if (p.note) {
    const note = el('div', 'bp-detail-note');
    note.textContent = p.note;
    wrap.appendChild(note);
  }

  const subs = subtasksOf(p.id);
  if (!subs.length) {
    const hint = el('div', 'empty-hint');
    hint.textContent = 'No sub-tasks yet — add one with ＋ Sub-task.';
    wrap.appendChild(hint);
  } else {
    // ordinary task rows, so weights, due badges and drag-ordering come along,
    // each followed by its own step checklist
    const list = el('div', 'task-list bp-subtasks');
    subs.forEach((t) => {
      list.appendChild(taskRow(t, list, todayKey(), cat));
      const steps = stepsOf(t);
      if (!steps.length) return;
      const sl = el('div', 'step-checklist');
      steps.forEach((s) => {
        const r = el('div', 'step-item' + (s.done ? ' done' : ''));
        const box = el('span', 'step-box' + (s.done ? ' done' : ''));
        const nm = el('span', 'step-item-name');
        nm.textContent = s.title;
        r.appendChild(box); r.appendChild(nm);
        r.title = 'Click to check off';
        r.onclick = () => toggleStep(t.id, s.id);
        sl.appendChild(r);
      });
      list.appendChild(sl);
    });
    makeSortable(list, cat, todayKey());
    wrap.appendChild(list);
  }
  return wrap;
}

/* ============================================================
   Progress bars
   ============================================================ */
let lastWeeklyPct = 0;

function renderBars() {
  const range = weekRangeOf();
  // The main bar is the week, and it carries the overdue backlog with it — a
  // week that reads 100% while last week's misses are still open would be a lie.
  const w = progressForRange(range.from, range.to, true);
  const overdue = overdueTasks();
  const mobile = window.innerWidth <= 760;
  const maxTrack = mobile ? 150 : Math.max(170, Math.min(window.innerHeight * 0.42, 420));
  const minTrack = mobile ? 84 : Math.max(110, maxTrack * 0.45);

  $('#weeklyTopFill').style.width = w.pct + '%';
  $('#weeklyTopPct').textContent = Math.round(w.pct) + '%';

  const cap = weightCap();
  const grow = Math.min(w.total / cap, 1);
  $('#mainTrack').style.height = (minTrack + grow * (maxTrack - minTrack)) + 'px';

  const fill = $('#mainBarFill');
  fill.style.height = w.pct + '%';
  if (w.pct > lastWeeklyPct + 0.1) {
    fill.classList.remove('bump'); void fill.offsetWidth; fill.classList.add('bump');
    emitSparks(w.pct);
    if (w.pct >= 99.9 && lastWeeklyPct < 99.9) celebrate();
  }
  lastWeeklyPct = w.pct;

  $('#mainPct').textContent = Math.round(w.pct) + '%';
  $('#weekRangeLabel').textContent = `${shortDate(range.from)} – ${shortDate(range.to)}`;
  $('#weekRangeLabel').title =
    `Week runs ${prettyDate(range.from)} to ${prettyDate(range.to)} · change the start day in Settings`;
  $('#mainMeta').textContent = w.total
    ? `${w.done}/${w.total} weight${overdue.length ? ` · ${overdue.length} overdue` : ''}`
    : 'add dated tasks to begin';

  renderClearIndicator(overdue);
  renderProjectBars();
  renderMilestones();
}

// Projects sit in the bars column alongside the milestones — same card shape, so
// the column reads as one list of things being tracked rather than two.
function renderProjectBars() {
  const host = $('#projectBars');
  if (!host) return;
  host.innerHTML = '';
  (state.projects || []).forEach((p) => {
    const prog = projectProgress(p);
    const cat = getCat(p.categoryId) || { name: '—', color: 'gray' };
    const row = el('button', `milestone project-bar tint-${cat.color}`);
    row.type = 'button';
    row.onclick = () => openProject(p.id);
    row.title = `Open “${p.name}” in Big Picture`;

    const head = el('div', 'milestone-head');
    const nm = el('span', 'milestone-name');
    nm.textContent = p.name;
    const pc = el('span', 'milestone-pct');
    pc.textContent = Math.round(prog.pct) + '%';
    head.appendChild(nm); head.appendChild(pc);
    row.appendChild(head);

    const track = el('div', 'milestone-track');
    const fill = el('div', 'milestone-fill');
    fill.style.width = prog.pct + '%';
    track.appendChild(fill);
    row.appendChild(track);

    const subs = subtasksOf(p.id);
    const sub = el('div', 'milestone-sub');
    sub.textContent = `${subs.filter((t) => t.done).length}/${subs.length}  ·  ${projectMetaLine(p)}`;
    row.appendChild(sub);
    host.appendChild(row);
  });
}

// "Are we straight?" answered before any percentage. Undated work is a someday
// pile and never counts against being up to date.
function renderClearIndicator(overdue = overdueTasks()) {
  const box = $('#clearIndicator');
  const behind = overdue.length > 0;
  box.classList.toggle('behind', behind);
  $('#clearIcon').textContent = behind ? '!' : '✓';
  $('#clearText').textContent = behind
    ? `${overdue.length} overdue · ${sumWeight(overdue)} weight`
    : 'Up to date';
  box.title = behind
    ? overdue.map((t) => `${t.title} — ${relativeDue(dueDateOf(t))}`).join('\n')
    : 'Nothing is past its deliver-by date';
}

function renderMilestones() {
  const host = $('#milestoneBars');
  host.innerHTML = '';
  const list = (state.settings.milestones || []);
  list.forEach((m) => {
    const p = progressUpTo(m.date);
    const days = daysUntil(m.date);
    const row = el('div', 'milestone' + (days < 0 ? ' past' : ''));

    const head = el('div', 'milestone-head');
    const nm = el('span', 'milestone-name');
    nm.textContent = m.name;
    const pc = el('span', 'milestone-pct');
    pc.textContent = Math.round(p.pct) + '%';
    head.appendChild(nm); head.appendChild(pc);
    row.appendChild(head);

    const track = el('div', 'milestone-track');
    const fill = el('div', 'milestone-fill');
    fill.style.width = p.pct + '%';
    track.appendChild(fill);
    row.appendChild(track);

    const sub = el('div', 'milestone-sub');
    sub.textContent = `${shortDate(m.date)} · ${relativeDue(m.date)}`
      + (p.total ? ` · ${p.done}/${p.total} weight` : ' · nothing due yet');
    row.appendChild(sub);

    row.title = `Everything with a deliver-by date on or before ${prettyDate(m.date)}`;
    host.appendChild(row);
  });
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
  const burst = $('#mainBurst');
  for (let i = 0; i < 12; i++) spark(burst, 50, 100 - Math.min(pct, 100), 20);
}
function celebrate() {
  const burst = $('#mainBurst');
  for (let wave = 0; wave < 3; wave++) {
    setTimeout(() => {
      for (let i = 0; i < 14; i++) spark(burst, 20 + Math.random() * 60, Math.random() * 100, 26);
    }, wave * 180);
  }
}

/* ============================================================
   Widget
   ============================================================ */
function widgetTask(t, cat, dateKey) {
  return {
    id: t.id, kind: cat.id, title: t.title, done: t.done,
    color: cat.color, cat: cat.name,              // so a merged list still shows origin
    weight: catHasWeight(cat.id) ? t.weight : null,
    due: relativeDueShort(dueDateOf(t)),          // widget is tiny — compact form ('' when undated)
    overdue: hasDate(t) && dueDateOf(t) < dateKey
  };
}

function widgetSection(cat, dateKey) {
  // same ordering the app shows, so the widget never disagrees with the list
  const tasks = catOrderedTasks(cat, dateKey).all.slice(0, Math.max(1, cat.limit || 2));
  const sec = {
    key: cat.id, label: cat.name, color: cat.color,
    tasks: tasks.map((t) => widgetTask(t, cat, dateKey))
  };
  if (cat.type === 'weekly') sec.pct = Math.round(weeklyProgress().pct);
  if (cat.type === 'daily') sec.pct = Math.round(dailyProgress().pct);
  return sec;
}

// One merged shortlist instead of a stack of boxes. Ranked the way the app
// thinks: unfinished first, then overdue, then due today, then heaviest — weight
// is the whole premise, so a 5 outranks three 1s. Routine carries no weight and
// sinks accordingly, which is the point of it being weightless.
function widgetTopSection(cats, dateKey) {
  const n = Math.max(WIDGET_TOP_MIN,
    Math.min(WIDGET_TOP_MAX, Math.round(Number(state.settings.widgetTop)) || 5));
  const pool = [];
  cats.forEach((c) => catOrderedTasks(c, dateKey).all.forEach((t) => pool.push({ t, c })));

  // undated work ranks last — it's a someday pile, not something due
  const bucket = ({ t }) => {
    const d = dueDateOf(t);
    if (!d) return 3;
    return d < dateKey ? 0 : d === dateKey ? 1 : 2;
  };
  const weightOf = ({ t, c }) => (catHasWeight(c.id) ? t.weight : 0);

  pool.sort((a, b) =>
    (a.t.done ? 1 : 0) - (b.t.done ? 1 : 0)
    || bucket(a) - bucket(b)
    || weightOf(b) - weightOf(a)
    || compareDue(a.t, b.t)
    || a.t.title.localeCompare(b.t.title));

  const shown = pool.slice(0, n);
  return {
    key: '__top', label: 'Top tasks', color: 'purple', dot: false,
    showTaskCats: true,     // no section header here, so each row names its own category
    // a percentage would be lying here — these span categories, so show the cut instead
    note: pool.length > shown.length ? `${shown.length} of ${pool.length}` : `${pool.length}`,
    tasks: shown.map(({ t, c }) => widgetTask(t, c, dateKey))
  };
}

function pushWidget() {
  if (!window.goalAPI || !window.goalAPI.pushWidget) return;
  const dateKey = todayKey();
  const mode = (state.settings && state.settings.widgetMode) || 'categories';
  const chosen = state.categories.filter((c) => c.widget);

  let sections;
  if (mode === 'single') {
    // the chosen category may since have been deleted — fall back rather than blank out
    const cat = getCat(state.settings.widgetCategory) || chosen[0] || state.categories[0];
    sections = cat ? [widgetSection(cat, dateKey)] : [];
  } else if (mode === 'top') {
    sections = [widgetTopSection(chosen, dateKey)];
  } else {
    sections = chosen.map((c) => widgetSection(c, dateKey));
  }
  window.goalAPI.pushWidget('all', { theme: state.theme, sections });
  pushObjective();
}

// The Current objective widget: one project, its next few outstanding sub-tasks.
// Finished ones are dropped rather than shown struck through — the point is what
// to do next, not what's been done.
function objectivePayload() {
  // the chosen project may since have been deleted, or never have been chosen at all
  // if Settings was never opened — fall back rather than blank out, as widget mode
  // 'single' does for its category
  const p = getProject(state.settings.objectiveProject) || (state.projects || [])[0];
  if (!p) return { theme: state.theme, project: null, tasks: [], remaining: 0 };
  const n = Math.max(OBJECTIVE_MIN,
    Math.min(OBJECTIVE_MAX, Math.round(Number(state.settings.objectiveCount)) || 4));
  const dateKey = todayKey();
  const open = subtasksOf(p.id).filter((t) => !t.done)
    .sort((a, b) => compareDue(a, b) || b.weight - a.weight);
  const shown = open.slice(0, n);
  return {
    theme: state.theme,
    project: p.name,
    pct: Math.round(projectProgress(p).pct),
    remaining: Math.max(0, open.length - shown.length),
    tasks: shown.map((t) => ({
      id: t.id, kind: t.categoryId, title: t.title, done: t.done,
      due: relativeDueShort(dueDateOf(t)),
      overdue: hasDate(t) && dueDateOf(t) < dateKey
    }))
  };
}
function pushObjective() {
  if (!window.goalAPI || !window.goalAPI.pushWidget) return;
  window.goalAPI.pushWidget('objective', objectivePayload());
}

/* ============================================================
   Task modal
   ============================================================ */
let modalEditId = null, modalWeight = 1, modalDays = new Set(), modalCatId = 'daily';
let modalParentId = null;   // non-null while the modal is editing a sub-task
let modalSteps = [];        // working copy; only committed on save

function renderModalSteps() {
  const host = $('#stepList');
  host.innerHTML = '';
  if (!modalSteps.length) {
    const hint = el('div', 'step-empty');
    hint.textContent = 'No steps yet.';
    host.appendChild(hint);
  }
  modalSteps.forEach((s, i) => {
    const row = el('div', 'step-row');

    const box = el('button', 'step-box' + (s.done ? ' done' : ''));
    box.type = 'button';
    box.title = s.done ? 'Mark not done' : 'Mark done';
    box.onclick = () => { s.done = !s.done; renderModalSteps(); };
    row.appendChild(box);

    const name = el('input', 'step-title');
    name.type = 'text'; name.value = s.title; name.maxLength = 120;
    name.onchange = () => {
      const v = name.value.trim();
      if (v) s.title = v; else name.value = s.title;
    };
    row.appendChild(name);

    const up = el('button', 'step-move');
    up.type = 'button'; up.textContent = '↑'; up.title = 'Move up'; up.disabled = i === 0;
    up.onclick = () => {
      [modalSteps[i - 1], modalSteps[i]] = [modalSteps[i], modalSteps[i - 1]];
      renderModalSteps();
    };
    row.appendChild(up);

    const del = el('button', 'step-del');
    del.type = 'button'; del.textContent = '✕'; del.title = 'Remove step';
    del.onclick = () => { modalSteps.splice(i, 1); renderModalSteps(); };
    row.appendChild(del);

    host.appendChild(row);
  });
  $('#stepAddBtn').disabled = modalSteps.length >= STEP_MAX;
  $('#stepInput').disabled = modalSteps.length >= STEP_MAX;
}

function addModalStep() {
  const v = $('#stepInput').value.trim();
  if (!v || modalSteps.length >= STEP_MAX) return;
  modalSteps.push({ id: uid(), title: v.slice(0, 120), done: false });
  $('#stepInput').value = '';
  renderModalSteps();
  $('#stepInput').focus();
}

// Every category is a valid destination now, Routine included — moving into it
// drops the task's date and weight, moving out lets it earn them back.
function fillCategorySelect(sel, selectedId) {
  sel.innerHTML = '';
  state.categories.forEach((c) => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.name;
    sel.appendChild(o);
  });
  sel.value = selectedId;
  sel.disabled = false;
  sel.title = 'Move this task to another category';
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
  // Routine never carries a date, so the field is meaningless there.
  $('#dateRow').classList.toggle('hidden',
    cat.type === 'routine' || (cat.type === 'custom' && recurring));
  $('#dateLabel').textContent = isWeeklyCat ? 'Deliver by (any date in the target week)' : 'Deliver by';
  $('#clearDateBtn').classList.toggle('hidden', !$('#taskDate').value);
  renderModalSteps();
}

function openModal(opts = {}) {
  modalEditId = null;
  modalWeight = 1;
  modalDays = new Set();
  modalParentId = opts.parentId || null;      // set when adding inside a project
  modalSteps = [];
  modalCatId = opts.categoryId || defaultCatId();
  $('#modalTitle').textContent = 'New task';
  $('#modalSave').textContent = 'Add task';
  $('#modalDelete').classList.add('hidden');
  $('#taskTitle').value = '';
  $('#taskNote').value = '';
  // blank unless the caller supplied one — a date is now opt-in
  $('#taskDate').value = opts.deliverBy || '';
  $('#recurringChk').checked = false;
  $('#taskCadence').value = 'daily';
  $('#modalDateNote').classList.add('hidden');
  fillCategorySelect($('#taskCategory'), modalCatId);
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
  modalParentId = t.parentId || null;
  // a copy, so cancelling the dialog leaves the task's own steps untouched
  modalSteps = stepsOf(t).map((s) => ({ ...s }));
  modalCatId = t.categoryId;
  $('#modalTitle').textContent = 'Edit task';
  $('#modalSave').textContent = 'Save changes';
  $('#modalDelete').classList.remove('hidden');
  $('#taskTitle').value = t.title;
  $('#taskNote').value = t.note || '';
  $('#taskDate').value = t.deliverBy || '';
  $('#recurringChk').checked = !!t.recurring;
  $('#taskCadence').value = t.cadence || 'daily';
  $('#modalDateNote').classList.add('hidden');
  fillCategorySelect($('#taskCategory'), modalCatId);
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
  const cat = getCat(modalCatId) || getCat(defaultCatId());
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
    deliverBy: $('#taskDate').value || null,     // blank means genuinely undated
    parentId: modalParentId,
    steps: modalSteps
  };
  if (modalEditId) updateTask(modalEditId, payload);
  else addTask(payload);
  closeModal();
}

/* ---------- project modal ---------- */
let projectEditId = null;

function openProjectModal(id) {
  projectEditId = id || null;
  const p = id ? getProject(id) : null;
  $('#projectModalTitle').textContent = p ? 'Edit project' : 'New project';
  $('#projectSave').textContent = p ? 'Save changes' : 'Add project';
  $('#projectDelete').classList.toggle('hidden', !p);
  $('#projectName').value = p ? p.name : '';
  $('#projectNote').value = p ? (p.note || '') : '';
  $('#projectDate').value = p ? (p.deliverBy || '') : '';
  fillCategorySelect($('#projectCategory'), p ? p.categoryId : defaultCatId());
  syncProjectModal();
  $('#projectModal').classList.remove('hidden');
  setTimeout(() => $('#projectName').focus(), 30);
}
function closeProjectModal() { $('#projectModal').classList.add('hidden'); }
function syncProjectModal() {
  $('#projectClearDate').classList.toggle('hidden', !$('#projectDate').value);
}
function saveProjectModal() {
  const payload = {
    name: $('#projectName').value,
    categoryId: $('#projectCategory').value,
    note: $('#projectNote').value.trim(),
    deliverBy: $('#projectDate').value || null
  };
  if (!payload.name.trim()) { toast('Give the project a name first'); return; }
  if (projectEditId) updateProject(projectEditId, payload);
  else {
    const p = addProject(payload);
    if (p) expandedProjectId = p.id;
  }
  closeProjectModal();
  if (currentPage === 'bigpicture') renderBigPicture();
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
  const t = themeId(state.theme);
  // Themes are mutually exclusive classes rather than one boolean, so a third
  // one could be added without touching every existing `body.dark` rule.
  document.body.classList.toggle('dark', DARK_FAMILY.includes(t));
  document.body.classList.toggle('pond', t === 'pond');
  document.body.classList.toggle('space', t === 'space');
  document.body.dataset.theme = t;
  const btn = $('#themeToggle');
  if (btn) {
    const next = THEMES[(THEMES.findIndex(([id]) => id === t) + 1) % THEMES.length];
    btn.textContent = `${THEME_ICONS[t]} Theme: ${themeLabel(t)}`;
    btn.title = `Switch to ${themeLabel(next[0])}`;
  }
  const sel = $('#setTheme');
  if (sel) sel.value = t;
}
function applyPlatformUI() {
  if (!window.goalAPI) {
    ['#startupToggle', '#exportNowBtn', '#exportGcalBtn', '#logTimeRow',
      '#widgetToggle', '#objectiveToggle', '#objectiveCard', '#widgetCard']
      .forEach((s) => { const e = $(s); if (e) e.classList.add('hidden'); });
  }
}
function updateWidgetToggle() {
  const b = $('#widgetToggle');
  if (b) b.textContent = '📌 All goals: ' + (state.widgetOpen ? 'on' : 'off');
  const o = $('#objectiveToggle');
  if (o) o.textContent = '◎ Current objective: ' + (state.objectiveOpen ? 'on' : 'off');
}
function setStartupLabel(on) {
  $('#startupToggle').textContent = '⏻ Launch at startup: ' + (on ? 'on' : 'off');
}

let currentPage = 'taskmaster';
const PAGES = ['taskmaster', 'bigpicture', 'create', 'calendar', 'archives', 'settings'];
function showPage(page) {
  currentPage = page;
  PAGES.forEach((p) => $('#page-' + p).classList.toggle('hidden', p !== page));
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  if (page === 'archives') renderArchive();
  if (page === 'calendar') renderCalendar();
  if (page === 'taskmaster') renderTaskArea();
  if (page === 'create') { renderCatManager(); fillCategorySelect($('#cCategory'), defaultCatId()); }
  if (page === 'settings') renderSettings();
  if (page === 'bigpicture') renderBigPicture();
}

// Opening a project from anywhere lands in the same place: the Big Picture tab
// with that project expanded.
function openProject(id) {
  expandedProjectId = id;
  showPage('bigpicture');
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
