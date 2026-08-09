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
      // Routine is a standing list, so it resets every day whether or not it was
      // ever flagged recurring.
      if (type === 'routine' || (t.recurring && t.cadence === 'daily' && type === 'daily')) {
        t.done = false; t.completedAt = null;
      }
    });
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
    state.tasks.forEach((t) => {
      if (catType(t.categoryId) === 'weekly' && t.recurring) { t.done = false; t.completedAt = null; }
    });
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
  const wasRoutine = t.categoryId === 'routine';
  Object.assign(t, {
    title,
    weight: Math.max(1, Math.min(5, Number(patch.weight) || 1)),
    note: patch.note || '',
    // '' clears the date deliberately, so don't fall back to the old value
    deliverBy: wasRoutine ? null : (patch.deliverBy || null),
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

  /* ---- due today (highlighted) then upcoming ---- */
  let budget = limit;
  if (!all.length) {
    const hint = el('div', 'empty-hint');
    hint.textContent = `No ${cat.name.toLowerCase()} tasks — add one with ＋`;
    box.appendChild(hint);
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

  if (cat.type === 'daily') {
    const qa = el('input', 'quick-add');
    qa.type = 'text';
    qa.placeholder = '＋ Quick add — Enter to save, end with (3) for weight';
    qa.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const parsed = parseTaskLine(e.target.value);
      if (!parsed) return;
      // dated categories are about today's list; a persistent one shouldn't get
      // a deadline just because it was typed quickly
      addTask({ title: parsed.title, weight: parsed.weight, categoryId: cat.id,
        deliverBy: cat.type === 'daily' || cat.type === 'weekly' ? todayKey() : null });
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
  const range = weekRangeOf();
  // The main bar is the week, and it carries the overdue backlog with it — a
  // week that reads 100% while last week's misses are still open would be a lie.
  const w = progressForRange(range.from, range.to, true);
  const d = progressForDate(todayKey());
  const overdue = overdueTasks();
  const mobile = window.innerWidth <= 760;
  const maxTrack = mobile ? 150 : Math.max(170, Math.min(window.innerHeight * 0.42, 420));
  const minTrack = mobile ? 84 : Math.max(110, maxTrack * 0.45);

  $('#weeklyTopFill').style.width = w.pct + '%';
  $('#weeklyTopPct').textContent = Math.round(w.pct) + '%';

  const miniFill = $('#miniBarFill');
  miniFill.parentElement.style.height = Math.round(maxTrack / 3) + 'px';
  miniFill.style.height = d.pct + '%';
  $('#miniPct').textContent = Math.round(d.pct) + '%';
  if (d.pct > lastDailyPct + 0.1) {
    miniFill.classList.remove('bump'); void miniFill.offsetWidth; miniFill.classList.add('bump');
  }

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
  lastDailyPct = d.pct; lastWeeklyPct = w.pct;

  $('#mainPct').textContent = Math.round(w.pct) + '%';
  $('#weekRangeLabel').textContent = `${shortDate(range.from)} – ${shortDate(range.to)}`;
  $('#weekRangeLabel').title =
    `Week runs ${prettyDate(range.from)} to ${prettyDate(range.to)} · change the start day in Settings`;
  $('#mainMeta').textContent = w.total
    ? `${w.done}/${w.total} weight${overdue.length ? ` · ${overdue.length} overdue` : ''}`
    : 'add dated tasks to begin';

  renderClearIndicator(overdue);
  renderMilestones();
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
  // Routine never carries a date, so the field is meaningless there.
  $('#dateRow').classList.toggle('hidden',
    cat.type === 'routine' || (cat.type === 'custom' && recurring));
  $('#dateLabel').textContent = isWeeklyCat ? 'Deliver by (any date in the target week)' : 'Deliver by';
  $('#clearDateBtn').classList.toggle('hidden', !$('#taskDate').value);
}

function openModal(opts = {}) {
  modalEditId = null;
  modalWeight = 1;
  modalDays = new Set();
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
  $('#taskDate').value = t.deliverBy || '';
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
    deliverBy: $('#taskDate').value || null      // blank means genuinely undated
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
  const t = themeId(state.theme);
  // Themes are mutually exclusive classes rather than one boolean, so a third
  // one could be added without touching every existing `body.dark` rule.
  document.body.classList.toggle('dark', t === 'dark');
  document.body.classList.toggle('pond', t === 'pond');
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
