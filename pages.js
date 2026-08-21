/* ============================================================
   Goal Setter — secondary pages, modals, exports, sync, wiring
   ============================================================ */

/* ============================================================
   Taskmaster — everything ahead, by deliver-by date
   ============================================================ */
// Weekly archive entries used to be keyed by ISO week ("2026-W32") and are now
// keyed by the week's start date. Older entries stay readable as-is.
function weekArchiveLabel(week) {
  return /^\d{4}-\d{2}-\d{2}$/.test(week || '') ? weekRangeLabel(week) : String(week || '');
}

function renderGroupedView(body) {
  const tk = todayKey();

  // sub-tasks stay inside their project rather than flooding this view
  const rows = topLevelTasks()
    .filter((t) => !(t.done && !t.recurring))
    .map((t) => ({ t, due: dueDateOf(t) }))
    .filter(({ t, due }) => !(t.recurring && t.done && due === tk));

  if (!rows.length) {
    body.innerHTML = '<div class="empty-hint">Nothing scheduled. Add tasks from the Create page.</div>';
    return;
  }

  // Overdue is its own section now that unfinished work carries forward — it
  // used to be folded into "Due today", which understated how far behind you were.
  const overdue = rows.filter((r) => r.due && r.due < tk)
    .sort((a, b) => a.due.localeCompare(b.due) || b.t.weight - a.t.weight);
  const dueToday = rows.filter((r) => r.due && r.due === tk).sort((a, b) => b.t.weight - a.t.weight);
  const later = rows.filter((r) => r.due && r.due > tk)
    .sort((a, b) => a.due.localeCompare(b.due) || b.t.weight - a.t.weight);
  // This view groups by deliver-by date, so undated work gets its own section
  // at the bottom rather than being silently dropped.
  const undated = rows.filter((r) => !r.due).sort((a, b) => b.t.weight - a.t.weight);

  if (overdue.length) {
    body.appendChild(tmSection('Overdue', overdue, true));
  }
  if (dueToday.length) {
    body.appendChild(tmSection('Due today', dueToday, true));
  }
  // group the rest by their deliver-by date
  const groups = new Map();
  later.forEach((r) => {
    if (!groups.has(r.due)) groups.set(r.due, []);
    groups.get(r.due).push(r);
  });
  [...groups.keys()].sort().forEach((date) => {
    const days = Math.round((new Date(date) - new Date(tk)) / 864e5);
    const label = `${prettyDate(date)} · in ${days} day${days === 1 ? '' : 's'}`;
    body.appendChild(tmSection(label, groups.get(date), false));
  });
  if (undated.length) body.appendChild(tmSection(NO_DATE_LABEL, undated, false));
}

function tmSection(label, rows, urgent) {
  const wrap = el('div', 'tm-section' + (urgent ? ' urgent' : ''));
  const head = el('div', 'tm-head');
  head.innerHTML = `<span>${escapeHtml(label)}</span><span class="tm-count">${rows.length}</span>`;
  wrap.appendChild(head);
  rows.forEach(({ t, due }) => {
    const cat = getCat(t.categoryId) || { name: '?', color: 'gray' };
    const row = el('div', 'tm-row' + (t.done ? ' done' : ''));

    const box = el('div', `checkbox ${cat.color}` + (t.done ? ' checked' : ''));
    box.onclick = () => toggleTask(t.id);
    row.appendChild(box);

    const main = el('div', 'task-main');
    const name = el('div', 'task-name');
    name.textContent = t.title;
    main.appendChild(name);
    const meta = el('div', 'tm-meta');
    meta.innerHTML = `<span class="tm-cat ${cat.color}">${escapeHtml(cat.name)}</span>`
      + (t.recurring ? `<span class="recur-badge">${escapeHtml(recurLabel(t))}</span>` : '')
      + `<span class="tm-due${!due ? ' undated' : due < todayKey() ? ' overdue' : due === todayKey() ? ' today' : ''}">${escapeHtml(dueLabel(due))}</span>`;
    main.appendChild(meta);
    if (t.note && state.settings.showWeightNotes) {
      const note = el('div', 'task-note');
      note.textContent = t.note;
      main.appendChild(note);
    }
    row.appendChild(main);

    if (catHasWeight(t.categoryId)) {
      const badge = el('span', 'weight-badge w' + t.weight);
      badge.textContent = '×' + t.weight;
      row.appendChild(badge);
    }

    const edit = el('button', 'row-edit');
    edit.textContent = '✎'; edit.title = 'Edit';
    edit.onclick = () => openEditModal(t.id);
    row.appendChild(edit);
    wrap.appendChild(row);
  });
  return wrap;
}

/* ============================================================
   Create page — category manager
   ============================================================ */
function renderCatManager() {
  const host = $('#catManager');
  if (!host) return;
  host.innerHTML = '';
  state.categories.forEach((cat, idx) => {
    const row = el('div', 'cat-row tint-' + cat.color);

    // --- reorder (order here drives the order of the boxes on Taskmaster) ---
    const moves = el('div', 'cat-moves');
    const mv = (label, delta, disabled) => {
      const b = el('button', 'cat-move');
      b.textContent = label; b.disabled = disabled;
      b.title = delta < 0 ? 'Move up' : 'Move down';
      b.onclick = () => {
        const arr = state.categories;
        const to = idx + delta;
        if (to < 0 || to >= arr.length) return;
        [arr[idx], arr[to]] = [arr[to], arr[idx]];
        save(); render(); renderCatManager();
      };
      moves.appendChild(b);
    };
    mv('↑', -1, idx === 0);
    mv('↓', 1, idx === state.categories.length - 1);
    row.appendChild(moves);

    // --- colour swatches ---
    const swatches = el('div', 'cat-swatches');
    CAT_COLORS.forEach(([id, label]) => {
      const s = el('button', 'swatch ' + id + (cat.color === id ? ' active' : ''));
      s.title = label;
      s.onclick = () => {
        row.classList.remove('tint-' + cat.color);
        cat.color = id;
        row.classList.add('tint-' + id);
        [...swatches.children].forEach((x) => x.classList.toggle('active', x === s));
        save(); render(); pushWidget();
      };
      swatches.appendChild(s);
    });
    row.appendChild(swatches);

    const name = el('input', 'rec-title');
    name.value = cat.name;
    name.title = 'Rename';                        // every category is renameable now
    name.onchange = () => {
      const v = name.value.trim();
      if (v) { cat.name = v; save(); render(); renderCatManager(); } else name.value = cat.name;
    };
    row.appendChild(name);

    const type = el('span', 'cat-type');
    type.textContent = cat.type === 'custom' ? 'persistent' : cat.type;
    row.appendChild(type);

    const widget = el('button', 'rec-routine' + (cat.widget ? ' active' : ''));
    widget.textContent = cat.widget ? '✓ Widget' : 'Widget';
    widget.title = 'Show this category on the floating widget';
    widget.onclick = () => {
      cat.widget = !cat.widget;
      widget.classList.toggle('active', cat.widget);
      widget.textContent = cat.widget ? '✓ Widget' : 'Widget';
      save(); pushWidget(); renderSettings();
    };
    row.appendChild(widget);

    const limitWrap = el('label', 'cat-limit');
    limitWrap.innerHTML = '<span>show</span>';
    const limit = el('input');
    limit.type = 'number'; limit.min = '1'; limit.max = '20'; limit.value = cat.limit || 3;
    limit.onchange = () => {
      cat.limit = Math.max(1, Math.min(20, Number(limit.value) || 3));
      limit.value = cat.limit; save(); render();
    };
    limitWrap.appendChild(limit);
    row.appendChild(limitWrap);

    // Every category is deletable now that progress is driven by dates rather
    // than category type — except the last one, which would leave tasks homeless.
    const isLast = state.categories.length <= 1;
    // Never rehome into Routine if we can avoid it: it's a dateless standing list,
    // so dated tasks moved there would quietly lose their deliver-by dates.
    const others = state.categories.filter((c) => c.id !== cat.id);
    const heir = others.find((c) => c.type !== 'routine') || others[0];
    const del = el('button', 'rec-del');
    del.textContent = '✕';
    del.disabled = isLast;
    del.title = isLast
      ? "Can't delete the only category"
      : `Delete category (its tasks move to ${heir.name})`;
    del.onclick = () => {
      if (isLast) return;
      const moving = tasksOf(cat.id);
      const backup = { cat: { ...cat }, ids: moving.map((t) => t.id), at: state.categories.indexOf(cat) };
      moving.forEach((t) => { t.categoryId = heir.id; });
      state.categories = state.categories.filter((c) => c.id !== cat.id);
      save(); render(); renderCatManager(); pushWidget();
      toast(
        `Deleted “${cat.name}”${moving.length ? ` · ${moving.length} task${moving.length === 1 ? '' : 's'} moved to ${heir.name}` : ''}`,
        'Undo',
        () => {
          state.categories.splice(backup.at, 0, backup.cat);
          backup.ids.forEach((id) => { const t = findTask(id); if (t) t.categoryId = backup.cat.id; });
          save(); render(); renderCatManager(); pushWidget();
        }
      );
    };
    row.appendChild(del);
    host.appendChild(row);
  });
}

function addCategory(name) {
  const n = (name || '').trim();
  if (!n) return;
  if (state.categories.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
    toast('A category with that name already exists');
    return;
  }
  const palette = CAT_COLORS.map(([id]) => id).filter((c) => c !== 'gray');
  state.categories.push({
    id: 'c_' + uid(), name: n, builtin: false, type: 'custom',
    color: palette[state.categories.length % palette.length],
    widget: false, expanded: false, sort: 'manual', limit: 3
  });
  save(); render(); renderCatManager();
  fillCategorySelect($('#cCategory'), defaultCatId());
  toast(`Category “${n}” created`);
}

/* ============================================================
   Settings page
   ============================================================ */
function renderSettings() {
  $('#setShowImport').checked = !!state.settings.showImport;
  $('#setShowWeightNotes').checked = !!state.settings.showWeightNotes;

  const th = $('#setTheme');
  th.innerHTML = '';
  THEMES.forEach(([id, label]) => {
    const o = document.createElement('option');
    o.value = id; o.textContent = `${THEME_ICONS[id]}  ${label}`;
    th.appendChild(o);
  });
  th.value = themeId(state.theme);

  const sel = $('#setDateFormat');
  sel.innerHTML = '';
  DATE_FORMATS.forEach((f) => {
    const o = document.createElement('option');
    o.value = f.id; o.textContent = formatSample(f.id);
    sel.appendChild(o);
  });
  sel.value = state.settings.dateFormat || DEFAULT_DATE_FORMAT;

  const due = $('#setDueDisplay');
  due.innerHTML = '';
  DUE_DISPLAYS.forEach(([id, label]) => {
    const o = document.createElement('option');
    o.value = id; o.textContent = label;
    due.appendChild(o);
  });
  due.value = state.settings.dueDisplay || 'both';

  const ws = $('#setWeekStart');
  ws.innerHTML = '';
  WEEK_STARTS.forEach(([day, label]) => {
    const o = document.createElement('option');
    o.value = String(day); o.textContent = label;
    ws.appendChild(o);
  });
  ws.value = String(weekStartDay());
  updateWeekStartHint();

  renderMilestoneSettings();
  updateDatePreview();
  renderWidgetSettings();
}

function renderMilestoneSettings() {
  const host = $('#milestoneList');
  host.innerHTML = '';
  const list = state.settings.milestones || [];
  if (!list.length) {
    const hint = el('div', 'empty-hint');
    hint.textContent = 'No milestones yet.';
    host.appendChild(hint);
  }
  list.forEach((m) => {
    const row = el('div', 'cat-row milestone-row');

    const name = el('input', 'rec-title');
    name.value = m.name;
    name.title = 'Rename';
    name.onchange = () => {
      const v = name.value.trim();
      if (v) { m.name = v.slice(0, 40); save(); render(); } else name.value = m.name;
    };
    row.appendChild(name);

    const date = el('input', 'text-input milestone-date');
    date.type = 'date'; date.value = m.date;
    date.onchange = () => {
      if (!date.value) { date.value = m.date; return; }
      m.date = date.value; save(); render(); renderMilestoneSettings();
    };
    row.appendChild(date);

    const del = el('button', 'rec-del');
    del.textContent = '✕';
    del.title = 'Remove milestone';
    del.onclick = () => {
      const at = state.settings.milestones.indexOf(m);
      state.settings.milestones.splice(at, 1);
      save(); render(); renderMilestoneSettings();
      toast(`Removed “${m.name}”`, 'Undo', () => {
        state.settings.milestones.splice(at, 0, m);
        save(); render(); renderMilestoneSettings();
      });
    };
    row.appendChild(del);
    host.appendChild(row);
  });

  const full = list.length >= MILESTONE_MAX;
  $('#milestoneAdd').disabled = full;
  $('#milestoneAdd').title = full ? `Up to ${MILESTONE_MAX} milestones` : 'Add milestone';
}

// Spell the current week out, since "starts on Wednesday" is hard to picture.
function updateWeekStartHint() {
  const r = weekRangeOf();
  $('#weekStartHint').textContent =
    `This week runs ${prettyDate(r.from)} — ${prettyDate(r.to)}.`;
}

function renderWidgetSettings() {
  const mode = state.settings.widgetMode || 'categories';

  const ms = $('#setWidgetMode');
  ms.innerHTML = '';
  WIDGET_MODES.forEach(([id, label]) => {
    const o = document.createElement('option');
    o.value = id; o.textContent = label;
    ms.appendChild(o);
  });
  ms.value = mode;

  // "single" picks one category outright; the others draw from the ticked list
  $('#widgetSingleRow').classList.toggle('hidden', mode !== 'single');
  $('#widgetTopRow').classList.toggle('hidden', mode !== 'top');
  $('#widgetCatWrap').classList.toggle('hidden', mode === 'single');
  $('#widgetCatHint').textContent = mode === 'top'
    ? 'The shortlist is drawn from these categories (also set per category on the Create page).'
    : 'Each ticked category gets its own section on the widget (also set per category on the Create page).';

  const cs = $('#setWidgetCategory');
  cs.innerHTML = '';
  state.categories.forEach((c) => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.name;
    cs.appendChild(o);
  });
  // the saved category can have been deleted since; show what pushWidget will fall back to
  cs.value = getCat(state.settings.widgetCategory) ? state.settings.widgetCategory
    : (state.categories[0] ? state.categories[0].id : '');

  $('#setWidgetTop').value = state.settings.widgetTop || 5;

  // current objective widget
  const op = $('#setObjectiveProject');
  op.innerHTML = '';
  if (!(state.projects || []).length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = 'No projects yet';
    op.appendChild(o);
    op.disabled = true;
  } else {
    op.disabled = false;
    sortedProjects().forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.name;
      op.appendChild(o);
    });
    // The select must never *show* a project the state doesn't hold. Picking the
    // option that already looks chosen fires no change event, so a display-only
    // fallback would leave objectiveProject null and the widget empty for good.
    // migrate() normalises this at load; a project created since then can't rely on it.
    if (!getProject(state.settings.objectiveProject)) {
      state.settings.objectiveProject = state.projects[0].id;
      save();
      pushObjective();
    }
    op.value = state.settings.objectiveProject;
  }
  $('#setObjectiveCount').value = state.settings.objectiveCount || 4;

  const host = $('#widgetCatList');
  host.innerHTML = '';
  state.categories.forEach((c) => {
    const l = el('label', 'check-row');
    const cb = el('input');
    cb.type = 'checkbox'; cb.checked = !!c.widget;
    cb.onchange = () => { c.widget = cb.checked; save(); pushWidget(); renderCatManager(); };
    const s = el('span');
    s.textContent = c.name;
    l.appendChild(cb); l.appendChild(s);
    host.appendChild(l);
  });
}

// live sample of the chosen format, using today so it reads naturally
function updateDatePreview() {
  const sample = addDays(todayKey(), 3);
  $('#dateFormatPreview').textContent =
    `A task due in three days reads as “${dueLabel(sample)}” · the sticky widget uses the compact “${shortDate(sample)} · ${relativeDueShort(sample)}”`;
}

/* ============================================================
   Archives — daily, weekly, and one tab per custom category
   ============================================================ */
let archiveTab = 'daily';
function archiveTabForCat(cat) {
  if (cat.type === 'weekly') return 'weekly';
  if (cat.type === 'custom') return 'cat:' + cat.id;
  return 'daily';
}
function setArchiveTab(tab) { archiveTab = tab; renderArchive(); }

function renderArchive() {
  const tabs = $('#archiveTabs');
  tabs.innerHTML = '';
  const defs = [
    { id: 'daily', label: 'Daily (7 days)' },
    { id: 'weekly', label: 'Weekly (4 weeks)' }
  ].concat(state.categories.filter((c) => c.type === 'custom').map((c) => ({ id: 'cat:' + c.id, label: c.name })))
    .concat([{ id: 'deleted', label: `Recently deleted${state.deleted.length ? ` (${state.deleted.length})` : ''}` }]);

  defs.forEach((d) => {
    const b = el('button', 'archive-tab' + (archiveTab === d.id ? ' active' : ''));
    b.textContent = d.label;
    b.onclick = () => setArchiveTab(d.id);
    tabs.appendChild(b);
  });

  const body = $('#archiveBody');
  body.innerHTML = '';

  if (archiveTab === 'deleted') return renderDeleted(body);
  if (archiveTab.startsWith('cat:')) return renderCustomArchive(archiveTab.slice(4), body);

  const data = archiveTab === 'daily' ? state.dailyArchive : state.weeklyArchive;
  if (!data.length) {
    body.innerHTML = `<div class="empty-hint">No archived ${archiveTab} records yet — they appear automatically after a ${archiveTab === 'daily' ? 'day' : 'week'} rolls over.</div>`;
    return;
  }
  data.forEach((entry) => {
    const total = entry.tasks.reduce((a, t) => a + t.weight, 0);
    const done = entry.tasks.reduce((a, t) => a + (t.done ? t.weight : 0), 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const color = archiveTab === 'daily' ? 'var(--purple)' : 'var(--neon)';
    const card = el('div', 'archive-card');
    card.innerHTML = `
      <h3>${escapeHtml(archiveTab === 'daily' ? prettyDate(entry.date) : weekArchiveLabel(entry.week))}</h3>
      <div class="arch-sub">${done}/${total} weight completed · ${pct}%</div>
      <div class="arch-bar"><div style="width:${pct}%;background:${color}"></div></div>`;
    entry.tasks.forEach((t) => {
      const row = el('div', 'arch-task');
      row.innerHTML = `
        <span class="${t.done ? 'ok' : 'no'}">${t.done ? '✓' : '○'}</span>
        <span>${escapeHtml(t.title)}</span>
        <span class="weight-badge w${t.weight}">×${t.weight}</span>
        <span class="arch-time">${escapeHtml(t.completedAt || '—')}</span>`;
      // Routine chores are a fixed everyday list — re-adding one would just
      // duplicate the recurring task that already exists, so offer no restore.
      if (t.categoryId !== 'routine') {
        const readd = el('button', 'arch-readd btn-restore');
        readd.textContent = '↩ Restore';
        readd.title = 'Re-add to today';
        readd.onclick = () => {
          // the original category may since have been deleted — fall back
          const want = archiveTab === 'daily' ? 'daily' : 'weekly';
          addTask({ title: t.title, weight: t.weight, note: t.note || '',
            categoryId: getCat(want) ? want : defaultCatId(), deliverBy: todayKey() });
          toast(`Re-added “${t.title}”`);
        };
        row.appendChild(readd);
      }
      card.appendChild(row);
    });
    body.appendChild(card);
  });
}

function renderDeleted(body) {
  if (!state.deleted.length) {
    body.innerHTML = '<div class="empty-hint">Nothing deleted recently. Tasks you delete are kept here for 30 days so you can get them back.</div>';
    return;
  }
  const card = el('div', 'archive-card');
  card.innerHTML = `<h3>Recently deleted</h3>
    <div class="arch-sub">${state.deleted.length} task${state.deleted.length === 1 ? '' : 's'} · kept for 30 days</div>`;

  state.deleted.forEach((t) => {
    const cat = getCat(t.categoryId);
    const row = el('div', 'arch-task');
    row.innerHTML = `
      <span class="no">🗑</span>
      <span>${escapeHtml(t.title)}</span>
      <span class="tm-cat ${cat ? cat.color : 'gray'}">${escapeHtml(cat ? cat.name : 'deleted category')}</span>
      ${catHasWeight(t.categoryId) ? `<span class="weight-badge w${t.weight}">×${t.weight}</span>` : ''}
      <span class="arch-time">${escapeHtml(shortDate(t.deletedAt) + (t.deletedTime ? ' ' + t.deletedTime : ''))}</span>`;

    const restore = el('button', 'arch-readd btn-restore');
    restore.textContent = '↩ Restore';
    restore.title = 'Put this task back' + (cat ? ` in ${cat.name}` : '');
    restore.onclick = () => { restoreDeleted(t.id); renderArchive(); };
    row.appendChild(restore);

    const purge = el('button', 'row-del purge-btn');
    purge.textContent = '✕';
    purge.title = 'Delete permanently';
    purge.onclick = () => {
      state.deleted = state.deleted.filter((x) => x.id !== t.id);
      save(); renderArchive();
      toast(`“${t.title}” permanently deleted`);
    };
    row.appendChild(purge);
    card.appendChild(row);
  });

  const clear = el('button', 'btn-ghost clear-deleted');
  clear.textContent = 'Empty recently deleted';
  clear.onclick = () => {
    const n = state.deleted.length;
    const backup = state.deleted.slice();
    state.deleted = [];
    save(); renderArchive();
    toast(`Emptied ${n} task${n === 1 ? '' : 's'}`, 'Undo', () => {
      state.deleted = backup; save(); renderArchive();
    });
  };
  card.appendChild(clear);
  body.appendChild(card);
}

function renderCustomArchive(catId, body) {
  const cat = getCat(catId);
  const items = state.archive.filter((t) => t.categoryId === catId);
  if (!items.length) {
    body.innerHTML = `<div class="empty-hint">Nothing archived from ${escapeHtml(cat ? cat.name : 'this category')} yet. Completing a task here files it away.</div>`;
    return;
  }
  const card = el('div', 'archive-card');
  card.innerHTML = `<h3>${escapeHtml(cat ? cat.name : 'Archive')}</h3>
    <div class="arch-sub">${items.length} completed task${items.length === 1 ? '' : 's'}</div>`;
  items.forEach((t) => {
    const row = el('div', 'arch-task');
    row.innerHTML = `
      <span class="ok">✓</span>
      <span>${escapeHtml(t.title)}</span>
      <span class="weight-badge w${t.weight}">×${t.weight}</span>
      <span class="arch-time">${escapeHtml(t.archivedAt || '—')}</span>`;
    const restore = el('button', 'arch-readd btn-restore');
    restore.textContent = '↩ Restore';
    restore.title = 'Restore to ' + (cat ? cat.name : 'category');
    restore.onclick = () => {
      state.archive = state.archive.filter((x) => x.id !== t.id);
      const { archivedAt, ...task } = t;
      task.done = false; task.completedAt = null;
      state.tasks.push(task);
      afterChange();
      toast(`Restored “${t.title}”`);
    };
    row.appendChild(restore);
    card.appendChild(row);
  });
  body.appendChild(card);
}

/* ============================================================
   Calendar
   ============================================================ */
function occurrenceDone(t, key) {
  if (!t.recurring) return t.done;
  const current = t.cadence === 'weekly'
    ? weekKeyFromKey(key) === weekKey()
    : key === todayKey();
  return current ? t.done : false;
}
function tasksForDate(key) {
  const arch = state.dailyArchive.find((a) => a.date === key);
  if (arch) return arch.tasks;
  return dailyTasksToday(key);
}

// Month the calendar is showing.
let calMonthStart = monthStart(todayKey());

function renderCalendar() {
  const wrap = $('#calMonth');
  if (!wrap) return;
  wrap.innerHTML = '';
  const tk = todayKey();
  const days = monthGridDays(calMonthStart);

  const thisMonth = sameMonth(calMonthStart, tk);
  $('#weekLabel').textContent = monthLabel(calMonthStart) + (thisMonth ? ' · this month' : '');
  $('#weekToday').classList.toggle('active', thisMonth);

  // weekday header, following the user's week-start setting
  const dows = $('#calDows');
  if (dows) {
    dows.innerHTML = '';
    days.slice(0, 7).forEach((k) => {
      const d = el('div', 'cal-dow');
      d.textContent = DAYS_SHORT[weekdayOf(k)];
      dows.appendChild(d);
    });
  }

  days.forEach((key) => {
    const cell = el('div', 'cal-cell');
    if (!sameMonth(key, calMonthStart)) cell.classList.add('outside');
    if (key === tk) cell.classList.add('today');
    else if (key < tk) cell.classList.add('past');

    const num = el('div', 'cal-daynum');
    num.textContent = Number(key.split('-')[2]);
    cell.appendChild(num);

    const list = el('div', 'cal-items');
    const items = calendarTasksFor(key);
    // A month cell is short. Show what fits and count the rest, like Apple's does.
    const MAX = 3;
    items.slice(0, MAX).forEach((t) => {
      const pill = el('div', 'cal-pill'
        + (t.weight >= 3 ? ' w-hi' : '')
        + (occurrenceDone(t, key) ? ' done' : ''));
      const cat = getCat(t.categoryId);
      if (cat) pill.classList.add('tint-' + cat.color);
      pill.textContent = t.title;
      pill.title = `${t.title}${catHasWeight(t.categoryId) ? ` (×${t.weight})` : ''}`;
      if (key >= tk && t.id) {
        pill.classList.add('editable');
        pill.onclick = (e) => { e.stopPropagation(); openEditModal(t.id); };
      }
      list.appendChild(pill);
    });
    if (items.length > MAX) {
      const more = el('div', 'cal-more');
      more.textContent = `+${items.length - MAX} more`;
      list.appendChild(more);
    }
    cell.appendChild(list);

    cell.onclick = () => openDayModal(key);
    wrap.appendChild(cell);
  });
}
function shiftMonth(n) { calMonthStart = addMonths(calMonthStart, n); renderCalendar(); }
function calendarToToday() { calMonthStart = monthStart(todayKey()); renderCalendar(); }

/* ---------- day view modal ---------- */
let dayModalKey = null;
function openDayModal(key) {
  dayModalKey = key;
  $('#dayModalTitle').textContent = prettyDate(key) + (key < todayKey() ? ' · archived' : '');
  $('#dayModalAdd').classList.toggle('hidden', key < todayKey());
  renderDayModal();
  $('#dayModal').classList.remove('hidden');
}

function renderDayModal() {
  const key = dayModalKey, tk = todayKey();
  const body = $('#dayModalBody');
  body.innerHTML = '';
  const editable = key >= tk;

  const weekly = weeklyTasksNow(key);
  if (weekly.length) {
    const wk = weekKeyFromKey(key);
    body.appendChild(daySection(wk === weekKey() ? 'Weekly · this week' : 'Weekly · ' + wk));
    body.appendChild(dayList(weekly, editable, key));
  }
  body.appendChild(daySection('Daily'));
  const daily = tasksForDate(key);
  if (!daily.length) {
    const e = el('div', 'empty-hint subgroup-empty');
    e.textContent = 'no tasks on this day';
    body.appendChild(e);
  } else {
    body.appendChild(dayList(daily, editable, key));
  }
}
function daySection(label) {
  const h = el('div', 'task-subgroup'); h.textContent = label; return h;
}
function dayList(tasks, editable, key) {
  const list = el('div', 'day-drag-list');
  const sorted = tasks.slice().sort((a, b) =>
    (occurrenceDone(a, key) ? 1 : 0) - (occurrenceDone(b, key) ? 1 : 0) || orderOf(a, key) - orderOf(b, key));
  sorted.forEach((t) => list.appendChild(dayTaskRow(t, editable, key, list)));
  list.ondragover = (e) => {
    e.preventDefault();
    const dragging = list.querySelector('.day-task.dragging');
    if (!dragging) return;
    const rows = [...list.querySelectorAll('.day-task:not(.dragging)')];
    let closest = { offset: -Infinity, el: null };
    for (const r of rows) {
      const b = r.getBoundingClientRect();
      const off = e.clientY - b.top - b.height / 2;
      if (off < 0 && off > closest.offset) closest = { offset: off, el: r };
    }
    if (closest.el == null) list.appendChild(dragging);
    else list.insertBefore(dragging, closest.el);
  };
  return list;
}
function dayTaskRow(t, editable, key, container) {
  const done = occurrenceDone(t, key);
  const row = el('div', 'day-task' + (done ? ' done' : ''));
  row.dataset.id = t.id;
  if (editable && t.id) {
    row.draggable = true;
    row.ondragstart = () => row.classList.add('dragging');
    row.ondragend = () => {
      row.classList.remove('dragging');
      const ordered = [...container.querySelectorAll('.day-task')]
        .map((r) => findTask(r.dataset.id)).filter(Boolean);
      setDayOrder(ordered, key);
      save(); render(); renderDayModal();
    };
    const handle = el('span', 'drag-handle');
    handle.textContent = '⠿'; handle.title = 'Drag to reorder';
    row.appendChild(handle);
  }
  const mark = el('span', done ? 'ok' : 'no');
  mark.textContent = done ? '✓' : '○';
  row.appendChild(mark);
  const name = el('span', 'day-task-name');
  name.textContent = t.title;
  row.appendChild(name);
  if (t.recurring) {
    const r = el('span', 'recur-badge'); r.textContent = recurLabel(t); row.appendChild(r);
  }
  const badge = el('span', 'weight-badge w' + t.weight);
  badge.textContent = '×' + t.weight;
  row.appendChild(badge);
  if (editable && t.id) {
    const edit = el('button', 'row-edit');
    edit.textContent = '✎'; edit.title = 'Edit';
    edit.onclick = () => { $('#dayModal').classList.add('hidden'); openEditModal(t.id); };
    const del = el('button', 'row-del');
    del.textContent = '✕'; del.title = 'Delete';
    del.onclick = () => { deleteTask(t.id); renderDayModal(); };
    row.appendChild(edit); row.appendChild(del);
  }
  return row;
}

/* ============================================================
   Import modal
   ============================================================ */
let importCatId = 'daily';
function openImport(catId) {
  importCatId = catId || 'daily';
  $('#importText').value = '';
  $('#importRecurring').checked = false;
  $('#importModal').classList.remove('hidden');
  setTimeout(() => $('#importText').focus(), 30);
}

/* ============================================================
   Daily markdown log (desktop only)
   ============================================================ */
function buildLogMarkdown() {
  const date = todayKey();
  const lines = [`# Goal Setter log — ${prettyDate(date)}`, ''];
  state.categories.forEach((cat) => {
    const tasks = catTasksFor(cat.id, date);
    lines.push(`## ${cat.name}`);
    if (!tasks.length) { lines.push('_No tasks set._', ''); return; }
    const total = sumWeight(tasks), done = sumDone(tasks);
    lines.push(`Completion: **${done}/${total} weight** (${total ? Math.round(done / total * 100) : 0}%)`, '');
    lines.push('| Task | Weight | Done | Completed at | Why it matters |', '| --- | --- | --- | --- | --- |');
    tasks.forEach((t) => {
      lines.push(`| ${t.title} | ${t.weight} | ${t.done ? '✅' : '⬜'} | ${t.completedAt || '—'} | ${(t.note || '').replace(/\|/g, '\\|') || '—'} |`);
    });
    lines.push('');
  });
  return lines.join('\n');
}
async function exportLog(auto = false) {
  const date = todayKey();
  const filename = `goal-log-${date}.md`;
  try {
    await window.goalAPI.writeLog(filename, buildLogMarkdown());
    if (!state.loggedDays.includes(date)) { state.loggedDays.push(date); save(); }
    toast(auto ? `Auto-saved log → ${filename}` : `Saved ${filename}`);
  } catch (e) { toast('Could not write log: ' + e.message); }
}
function scheduleLogCheck() {
  const check = () => {
    if (!window.goalAPI) return;
    const d = new Date(), date = todayKey(d);
    const [h, m] = (state.logTime || '22:00').split(':').map(Number);
    if (d.getHours() * 60 + d.getMinutes() >= h * 60 + m && !state.loggedDays.includes(date)) exportLog(true);
  };
  check();
  setInterval(check, 60 * 1000);
}

/* ============================================================
   Google Calendar (.ics) export — weight >= 2
   ============================================================ */
const ICS_BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
function buildIcs() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Goal Setter//EN', 'CALSCALE:GREGORIAN'];
  let count = 0;
  // An undated task has no day to sit on in a calendar, so it can't be exported.
  topLevelTasks().filter((t) => t.weight >= 2 && hasDate(t)).forEach((t) => {
    count++;
    const start = dueDateOf(t).replace(/-/g, '');
    const end = addDays(dueDateOf(t), 1).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${t.id}@goalsetter`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsEsc(t.title + ' (×' + t.weight + ')')}`);
    if (t.note) lines.push(`DESCRIPTION:${icsEsc(t.note)}`);
    if (t.recurring) {
      if (t.cadence === 'weekly') lines.push('RRULE:FREQ=WEEKLY');
      else if (!t.days.length) lines.push('RRULE:FREQ=DAILY');
      else lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${t.days.map((d) => ICS_BYDAY[d]).join(',')}`);
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return { ics: lines.join('\r\n'), count };
}
async function exportToGoogleCalendar() {
  const { ics, count } = buildIcs();
  if (!count) { toast('No weight ≥ 2 tasks to export'); return; }
  try {
    await window.goalAPI.writeIcs(`goal-setter-${todayKey()}.ics`, ics);
    toast(`Exported ${count} task${count > 1 ? 's' : ''} → .ics`);
  } catch (e) { toast('Export failed: ' + e.message); }
}

/* ============================================================
   Cloud sync
   ============================================================ */
let authMode = 'signin', hydrated = false, unsubRemote = null;

function refreshFullUI() {
  rolloverIfNeeded();
  render();
  if (currentPage === 'calendar') renderCalendar();
  if (currentPage === 'archives') renderArchive();
  if (currentPage === 'create') renderCatManager();
}
// A v1 client stores tasks in dailyTasks/scheduled/weeklyTasks and knows nothing
// about `tasks`. If such a client is still running on another device it will push
// its own shape and blank out everything here, so refuse those payloads and push
// our (newer) state back instead of adopting them.
// If local data failed to load, the in-memory state is a blank default. Pushing
// that would replace good cloud data with nothing, on every device.
function cloudPush(what) {
  if (loadFailed) {
    console.error('Goal Setter: cloud push blocked; local data was not loaded cleanly');
    return;
  }
  if (window.GoalCloud && window.GoalCloud.push) window.GoalCloud.push(what);
}

function isStaleSchema(remote) {
  if (!remote) return true;
  const localHasTasks = Array.isArray(state.tasks) && state.tasks.length;
  // A v3 client has no concept of a sub-task: it would present them as loose
  // tasks in their category, let them be reordered and deleted out of their
  // project, and drop nothing gracefully. Refuse it the same way v2 is refused.
  if (remote.version === 3) return !!localHasTasks;
  // Never let an empty cloud payload replace local work, whatever version it
  // claims. A device that failed to load its own save once pushed a blank state
  // up, and every other device then faithfully adopted the blank over good data.
  // Deleting your last task is legitimate but rare; this costs one Undo at worst
  // and prevents a total wipe at best.
  const remoteIsEmpty = !Array.isArray(remote.tasks) || !remote.tasks.length;
  if (remoteIsEmpty && localHasTasks) return true;
  // The same protection for projects, which it did not used to have. A payload
  // carrying tasks but no projects at all is not "empty" by the test above, so
  // it was adopted and took every local project with it — that is how a device
  // whose projects had never reached the cloud lost them on the next sync.
  // Deleting your last project is legitimate but rare; refusing costs one
  // republish and prevents a silent wipe.
  const localHasProjects = Array.isArray(state.projects) && state.projects.length;
  const remoteHasProjects = Array.isArray(remote.projects) && remote.projects.length;
  if (!remoteHasProjects && localHasProjects) return true;
  if (remote.version >= 3) return false;
  // A v2 client has no concept of an undated task: its migrate() stamps today's
  // date onto anything without one, which would re-date the whole someday pile
  // and hand every routine chore a meaningless deadline. Refuse it — but only
  // when we hold local data worth protecting, so a fresh install still adopts
  // (and thereby upgrades) whatever is already in the cloud.
  if (remote.version === 2) return !!localHasTasks;
  const hasV2 = Array.isArray(remote.tasks) && remote.tasks.length;
  return !hasV2 && localHasTasks;
}

function applyRemote(remote) {
  window.__goalApplyingRemote = true;
  try {
    state = migrate(Object.assign(defaultState(), remote));
    refreshFullUI();
  } finally { window.__goalApplyingRemote = false; }
}

// Pull the row and take it, republish over it, or leave things alone. The single
// place that decides, so the boot path, the realtime handler, the focus check
// and the Sync now button can't drift apart.
async function reconcile() {
  if (!(window.GoalCloud && window.GoalCloud.getSession && window.GoalCloud.getSession())) return false;
  const remote = await window.GoalCloud.pull();
  if (!remote || !Object.keys(remote).length) { cloudPush(state); return true; }
  if (isStaleSchema(remote)) { cloudPush(state); return true; }
  applyRemote(remote);
  return true;
}

// Realtime is the fast path, not the only one. Anything that suggests we may
// have missed an update — regaining focus, coming back online, or just time
// passing — triggers a reconcile, throttled so they can't stack up.
let lastReconcileAt = 0;
let reconcileTimer = null;
function scheduleReconcile(delay = 0, minGap = 15000) {
  clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    if (Date.now() - lastReconcileAt < minGap) return;
    lastReconcileAt = Date.now();
    reconcile();
  }, delay);
}

function onRemoteState(remote) {
  if (!remote || !Object.keys(remote).length) return;
  if (Date.now() - lastLocalEditAt < 2000) {
    // Don't discard it. A realtime event is the only notice that another device
    // changed something; dropping it lost that change until the next restart.
    // Come back for it once the local edit has settled.
    scheduleReconcile(2500, 0);
    return;
  }
  if (isStaleSchema(remote)) {
    cloudPush(state);
    toast(Array.isArray(remote.tasks) && remote.tasks.length
      ? 'Another device is running an old version — update it to sync'
      : 'Ignored an empty update from the cloud — the tasks on this device were kept');
    return;
  }
  applyRemote(remote);
}
async function hydrateFromCloud() {
  if (hydrated) return;
  hydrated = true;
  const remote = await window.GoalCloud.pull();
  if (remote && Object.keys(remote).length && isStaleSchema(remote)) {
    // don't adopt an old-format payload over newer local data — republish ours
    cloudPush(state);
    refreshFullUI();
    if (!unsubRemote) unsubRemote = GoalStore.subscribe(onRemoteState);
    updateAccountUI();
    return;
  }
  if (remote && Object.keys(remote).length) {
    window.__goalApplyingRemote = true;
    try { state = migrate(Object.assign(defaultState(), remote)); refreshFullUI(); }
    finally { window.__goalApplyingRemote = false; }
  } else {
    refreshFullUI();
    cloudPush(state);
  }
  if (!unsubRemote) unsubRemote = GoalStore.subscribe(onRemoteState);
  updateAccountUI();
}
function syncStatusLine(st) {
  if (!st) return '';
  if (st.lastError) return '⚠ ' + st.lastError;
  if (st.channel === 'retrying' || st.channel === 'joining') return 'Reconnecting…';
  const when = st.lastSyncedAt ? new Date(st.lastSyncedAt) : null;
  if (!when) return st.channel === 'live' ? 'Connected' : 'Not synced yet';
  const mins = Math.floor((Date.now() - when.getTime()) / 60000);
  const ago = mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago' : Math.floor(mins / 60) + ' h ago';
  return (st.channel === 'live' ? 'Synced ' : 'Offline · last synced ') + ago;
}

function updateAccountUI() {
  const email = window.GoalCloud && window.GoalCloud.userEmail && window.GoalCloud.userEmail();
  $('#accountRow').classList.toggle('hidden', !email);
  if (email) $('#accountEmail').textContent = email;
  const canSignIn = !!(window.GoalCloud && window.GoalCloud.available && window.GoalCloud.available() && !email);
  $('#signInBtn').classList.toggle('hidden', !canSignIn);

  const line = $('#syncStatus');
  if (line) {
    const st = window.GoalCloud && window.GoalCloud.status ? window.GoalCloud.status() : null;
    line.textContent = email ? syncStatusLine(st) : '';
    line.classList.toggle('sync-bad', !!(st && st.lastError));
  }
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
    const email = $('#authEmail').value.trim(), password = $('#authPassword').value;
    if (!email || !password) return;
    const fn = authMode === 'signin' ? window.GoalCloud.signIn : window.GoalCloud.signUp;
    const { error } = await fn(email, password);
    if (error) { const e = $('#authError'); e.textContent = error.message; e.classList.remove('hidden'); }
    else if (authMode === 'signup') toast('Account created — signing you in');
  };
  $('#signOutBtn').onclick = async () => { await window.GoalCloud.signOut(); toast('Signed out'); };
  $('#signInBtn').onclick = showAuth;
  $('#syncNowBtn').onclick = async () => {
    lastReconcileAt = Date.now();
    const ran = await reconcile();
    updateAccountUI();
    const st = window.GoalCloud.status ? window.GoalCloud.status() : null;
    if (!ran) toast('Not signed in');
    else if (st && st.lastError) toast('Sync problem: ' + st.lastError);
    else toast('Synced');
  };
}

async function setupSync() {
  if (!(window.GoalCloud && window.GoalCloud.available())) return;
  wireAuth();
  await window.GoalCloud.init();
  GoalStore.use(window.GoalCloud.backend());
  window.GoalCloud.onAuth(async (s) => {
    if (s) { hideAuth(); await hydrateFromCloud(); updateAccountUI(); }
    else {
      if (unsubRemote) { unsubRemote(); unsubRemote = null; }
      hydrated = false; updateAccountUI(); showAuth();
    }
  });
  // surface what sync is doing instead of failing mutely
  if (window.GoalCloud.onStatus) {
    let shownError = null;
    window.GoalCloud.onStatus((st) => {
      updateAccountUI();
      if (st.lastError && st.lastError !== shownError) {
        shownError = st.lastError;
        toast('Sync problem: ' + st.lastError);
      }
      if (!st.lastError) shownError = null;
    });
  }
  // keep the "synced N min ago" line honest without touching the network
  setInterval(updateAccountUI, 30000);
  // catch anything realtime missed
  window.addEventListener('focus', () => scheduleReconcile(200));
  window.addEventListener('online', () => scheduleReconcile(500, 0));
  setInterval(() => scheduleReconcile(0, 60000), 5 * 60 * 1000);

  if (window.GoalCloud.getSession()) { hideAuth(); await hydrateFromCloud(); }
  else { updateAccountUI(); showAuth(); }
}

/* ============================================================
   Wiring
   ============================================================ */
function wire() {
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.onclick = () => { showPage(b.dataset.page); document.body.classList.remove('sidebar-open'); };
  });
  $('#menuToggle').onclick = () => document.body.classList.toggle('sidebar-open');
  $('#sidebarBackdrop').onclick = () => document.body.classList.remove('sidebar-open');

  $('#themeToggle').onclick = () => {
    const i = THEMES.findIndex(([id]) => id === themeId(state.theme));
    state.theme = THEMES[(i + 1) % THEMES.length][0];
    save(); applyTheme(); pushWidget();
  };
  $('#setTheme').onchange = (e) => {
    state.theme = themeId(e.target.value);
    save(); applyTheme(); pushWidget();
  };

  /* ---- task modal ---- */
  document.querySelectorAll('#weightPick .w-btn').forEach((b) => {
    b.onclick = () => {
      modalWeight = Number(b.dataset.w);
      document.querySelectorAll('#weightPick .w-btn').forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  document.querySelectorAll('#dayPick button').forEach((b) => {
    b.onclick = () => {
      const d = Number(b.dataset.day);
      if (modalDays.has(d)) modalDays.delete(d); else modalDays.add(d);
      b.classList.toggle('active', modalDays.has(d));
    };
  });
  $('#taskCategory').onchange = (e) => { modalCatId = e.target.value; syncModalFields(); };
  $('#recurringChk').addEventListener('change', syncModalFields);
  $('#taskCadence').addEventListener('change', syncModalFields);
  $('#taskDate').addEventListener('input', syncModalFields);   // show/hide Clear
  $('#clearDateBtn').onclick = () => { $('#taskDate').value = ''; syncModalFields(); };
  $('#stepAddBtn').onclick = addModalStep;
  $('#stepInput').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();          // Enter here adds a step, it doesn't submit
    addModalStep();
  });

  /* ---- big picture ---- */
  $('#bpNewBtn').onclick = () => openProjectModal(null);
  $('#projectCancel').onclick = closeProjectModal;
  $('#projectSave').onclick = saveProjectModal;
  $('#projectDate').addEventListener('input', syncProjectModal);
  $('#projectClearDate').onclick = () => { $('#projectDate').value = ''; syncProjectModal(); };
  $('#projectDelete').onclick = () => {
    if (projectEditId) deleteProject(projectEditId);
    closeProjectModal();
    renderBigPicture();
  };
  $('#projectModal').addEventListener('mousedown', (e) => {
    if (e.target === $('#projectModal')) closeProjectModal();
  });
  $('#modalCancel').onclick = closeModal;
  $('#modalDelete').onclick = () => { if (modalEditId) deleteTask(modalEditId); closeModal(); };
  $('#modalSave').onclick = saveModal;
  $('#taskTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveModal(); });

  /* ---- create page ---- */
  document.querySelectorAll('#cWeight .w-btn').forEach((b) => {
    b.onclick = () => document.querySelectorAll('#cWeight .w-btn').forEach((x) => x.classList.toggle('active', x === b));
  });
  const cDays = new Set();
  document.querySelectorAll('#cDayPick button').forEach((b) => {
    b.onclick = () => {
      const d = Number(b.dataset.day);
      if (cDays.has(d)) cDays.delete(d); else cDays.add(d);
      b.classList.toggle('active', cDays.has(d));
    };
  });
  const syncCreate = () => {
    const rec = $('#cRecurring').checked;
    const cat = getCat($('#cCategory').value) || getCat('daily');
    $('#cRecurWrap').classList.toggle('hidden', !rec);
    if (cat.type === 'weekly') $('#cCadence').value = 'weekly';
    if (cat.type === 'daily' || cat.type === 'routine') $('#cCadence').value = 'daily';
    $('#cCadence').disabled = cat.type !== 'custom';
    $('#cDayPickWrap').classList.toggle('hidden', $('#cCadence').value !== 'daily');
  };
  $('#cRecurring').addEventListener('change', syncCreate);
  $('#cCategory').addEventListener('change', syncCreate);
  $('#cCadence').addEventListener('change', syncCreate);
  $('#cDeliverBy').value = todayKey();
  $('#cCreate').onclick = () => {
    const rec = $('#cRecurring').checked;
    const t = addTask({
      title: $('#cTitle').value,
      weight: Number(document.querySelector('#cWeight .w-btn.active').dataset.w),
      note: $('#cNote').value.trim(),
      categoryId: $('#cCategory').value,
      recurring: rec,
      cadence: rec ? $('#cCadence').value : null,
      days: rec && $('#cCadence').value === 'daily' ? [...cDays].sort() : [],
      deliverBy: $('#cDeliverBy').value || null    // blank means genuinely undated
    });
    if (!t) { toast('Give the task a name first'); return; }
    $('#cTitle').value = ''; $('#cNote').value = '';
    cDays.clear();
    document.querySelectorAll('#cDayPick button').forEach((b) => b.classList.remove('active'));
    $('#cRecurring').checked = false; syncCreate();
    toast(`Created “${t.title}”`);
  };
  $('#addCatBtn').onclick = () => { addCategory($('#newCatName').value); $('#newCatName').value = ''; };
  $('#newCatName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#addCatBtn').click(); });

  /* ---- taskmaster ---- */
  $('#tmAddBtn').onclick = () => openModal({ categoryId: 'daily' });
  document.querySelectorAll('.view-btn').forEach((b) => {
    b.onclick = () => { state.taskmasterView = b.dataset.view; save(); renderTaskArea(); };
  });

  /* ---- big picture: how the project cards are ordered ---- */
  document.querySelectorAll('.sort-btn').forEach((b) => {
    b.onclick = () => {
      state.settings.projectSort = b.dataset.sort;
      save(); renderBigPicture(); pushObjective();
    };
  });

  /* ---- calendar week nav ---- */
  $('#weekPrev').onclick = () => shiftMonth(-1);
  $('#weekNext').onclick = () => shiftMonth(1);
  $('#weekToday').onclick = calendarToToday;

  /* ---- import ---- */
  $('#importCancel').onclick = () => $('#importModal').classList.add('hidden');
  $('#importSave').onclick = () => {
    const recurring = $('#importRecurring').checked;
    let n = 0;
    $('#importText').value.split('\n').forEach((line) => {
      const p = parseTaskLine(line);
      if (!p) return;
      addTask({ title: p.title, weight: p.weight, categoryId: importCatId, recurring, cadence: recurring ? 'daily' : null, deliverBy: todayKey() });
      n++;
    });
    $('#importModal').classList.add('hidden');
    if (n) toast(`Imported ${n} task${n > 1 ? 's' : ''}`);
  };

  /* ---- day modal ---- */
  $('#dayModalClose').onclick = () => $('#dayModal').classList.add('hidden');
  $('#dayModalAdd').onclick = () => {
    $('#dayModal').classList.add('hidden');
    openModal({ categoryId: defaultCatId(), deliverBy: dayModalKey });
  };

  /* ---- settings ---- */
  $('#setShowImport').onchange = (e) => { state.settings.showImport = e.target.checked; save(); render(); };
  $('#setShowWeightNotes').onchange = (e) => { state.settings.showWeightNotes = e.target.checked; save(); render(); };
  const applyDateSetting = () => {
    save();
    updateDatePreview();
    render();
    if (currentPage === 'calendar') renderCalendar();
  };
  $('#setDateFormat').onchange = (e) => { state.settings.dateFormat = e.target.value; applyDateSetting(); };
  $('#setDueDisplay').onchange = (e) => { state.settings.dueDisplay = e.target.value; applyDateSetting(); };
  $('#milestoneAdd').onclick = () => {
    const name = $('#milestoneName').value.trim();
    const date = $('#milestoneDate').value;
    if (!date) { toast('Pick a date for the milestone'); return; }
    if ((state.settings.milestones || []).length >= MILESTONE_MAX) return;
    state.settings.milestones.push({ id: uid(), name: (name || 'Milestone').slice(0, 40), date });
    state.settings.milestones.sort((a, b) => a.date.localeCompare(b.date));
    $('#milestoneName').value = ''; $('#milestoneDate').value = '';
    save(); render(); renderMilestoneSettings();
    toast(`Milestone “${name || 'Milestone'}” added`);
  };

  $('#setWeekStart').onchange = (e) => {
    state.settings.weekStart = Number(e.target.value);
    // Moving the boundary changes what weekKey() returns, which would otherwise
    // read as "a new week has begun" and fire an archive + recurring reset.
    state.lastWeek = weekKey();
    save(); updateWeekStartHint(); render();
    if (currentPage === 'calendar') renderCalendar();
  };

  /* ---- widget layout ---- */
  $('#setWidgetMode').onchange = (e) => {
    state.settings.widgetMode = e.target.value;
    save(); renderWidgetSettings(); pushWidget();
  };
  $('#setWidgetCategory').onchange = (e) => {
    state.settings.widgetCategory = e.target.value;
    save(); pushWidget();
  };
  $('#setWidgetTop').oninput = (e) => {
    const n = Math.round(Number(e.target.value));
    if (!n) return;                                   // mid-edit empty field — wait for a number
    state.settings.widgetTop = Math.max(WIDGET_TOP_MIN, Math.min(WIDGET_TOP_MAX, n));
    save(); pushWidget();
  };
  // snap a typed-out-of-range value back once the field is left
  $('#setWidgetTop').onblur = () => { $('#setWidgetTop').value = state.settings.widgetTop; };

  /* ---- current objective ---- */
  $('#setObjectiveProject').onchange = (e) => {
    state.settings.objectiveProject = e.target.value || null;
    save(); pushObjective();
  };
  $('#setObjectiveCount').oninput = (e) => {
    const n = Math.round(Number(e.target.value));
    if (!n) return;                                   // mid-edit empty field
    state.settings.objectiveCount = Math.max(OBJECTIVE_MIN, Math.min(OBJECTIVE_MAX, n));
    save(); pushObjective();
  };
  $('#setObjectiveCount').onblur = () => {
    $('#setObjectiveCount').value = state.settings.objectiveCount;
  };
  $('#logTimeInput').value = state.logTime || '22:00';
  $('#logTimeInput').onchange = (e) => {
    const v = e.target.value;
    if (!v) return;
    state.logTime = v;
    const [h, m] = v.split(':').map(Number);
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) {
      state.loggedDays = state.loggedDays.filter((d) => d !== todayKey());
    }
    save(); toast('Daily log time set to ' + v);
  };
  $('#exportNowBtn').onclick = () => exportLog(false);
  $('#exportGcalBtn').onclick = exportToGoogleCalendar;

  /* ---- widget ---- */
  updateWidgetToggle();
  $('#widgetToggle').onclick = async () => {
    state.widgetOpen = !state.widgetOpen;
    save(); updateWidgetToggle();
    if (window.goalAPI && window.goalAPI.setWidget) {
      await window.goalAPI.setWidget('all', state.widgetOpen);
      if (state.widgetOpen) pushWidget();
    }
  };
  $('#objectiveToggle').onclick = async () => {
    state.objectiveOpen = !state.objectiveOpen;
    save(); updateWidgetToggle();
    if (window.goalAPI && window.goalAPI.setWidget) {
      await window.goalAPI.setWidget('objective', state.objectiveOpen);
      if (state.objectiveOpen) pushObjective();
    }
  };
  // closing either widget from its own ✕ keeps only that toggle in sync
  if (window.goalAPI && window.goalAPI.onWidgetClosed) {
    window.goalAPI.onWidgetClosed(({ id }) => {
      if (id === 'objective') state.objectiveOpen = false;
      else state.widgetOpen = false;
      save(); updateWidgetToggle();
    });
  }
  if (window.goalAPI && window.goalAPI.onWidgetToggle) {
    window.goalAPI.onWidgetToggle(({ id }) => toggleTask(id));
  }
  // the objective widget's own project picker
  if (window.goalAPI && window.goalAPI.onObjectiveProject) {
    window.goalAPI.onObjectiveProject(({ id }) => {
      if (!getProject(id)) return;
      state.settings.objectiveProject = id;
      save(); pushObjective(); renderSettings();
    });
  }
  if (window.goalAPI && window.goalAPI.setWidget) {
    if (state.widgetOpen) window.goalAPI.setWidget('all', true).then(() => pushWidget());
    if (state.objectiveOpen) window.goalAPI.setWidget('objective', true).then(() => pushObjective());
  }

  /* ---- startup toggle ---- */
  if (window.goalAPI && window.goalAPI.getAutostart) {
    window.goalAPI.getAutostart().then(setStartupLabel).catch(() => setStartupLabel(false));
    $('#startupToggle').onclick = async () => {
      try {
        const next = await window.goalAPI.setAutostart(!(await window.goalAPI.getAutostart()));
        setStartupLabel(next);
        toast(next ? 'Goal Setter will launch at startup' : 'Startup launch disabled');
      } catch { toast('Startup setting unavailable'); }
    };
  }

  /* ---- modal dismissal ---- */
  document.querySelectorAll('.modal-overlay').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden'));
  });
}
