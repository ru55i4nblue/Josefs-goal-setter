const $ = (s) => document.querySelector(s);

function taskRow(t, color, showCat) {
  const row = document.createElement('div');
  row.className = 'wtask clickable' + (t.done ? ' done' : '');
  // two categories can share a palette colour, so name it on hover as well
  row.title = (showCat && t.cat ? t.cat + ' · ' : '') + 'Click to check off';

  const box = document.createElement('span');
  // in a merged list each row carries its own category colour
  box.className = `box ${t.color || color}` + (t.done ? ' done' : '');

  // the checkbox only shows its colour once ticked, so an unticked row needs
  // its own marker — solid fill reads far better than a hairline border would
  let dot = null;
  if (showCat) {
    dot = document.createElement('span');
    dot.className = `wdot dot ${t.color || color}`;
  }

  const name = document.createElement('span');
  name.className = 'wname';
  name.textContent = t.title;

  const due = document.createElement('span');
  due.className = 'wdue' + (t.due === 'today' ? ' today' : '') + (t.overdue ? ' overdue' : '');
  due.textContent = t.due || '';

  const badge = document.createElement('span');
  badge.className = 'wbadge' + (t.weight == null ? '' : ' w' + t.weight);
  badge.textContent = t.weight == null ? '' : '×' + t.weight;

  row.onclick = () => {
    if (!window.widgetAPI || !window.widgetAPI.toggle) return;
    row.classList.toggle('done');
    box.classList.toggle('done');
    window.widgetAPI.toggle(t.kind, t.id);
  };

  row.appendChild(box);
  if (dot) row.appendChild(dot);
  row.appendChild(name);
  row.appendChild(due);
  if (badge.textContent) row.appendChild(badge);
  return row;
}

function buildSection(sec) {
  const wrap = document.createElement('div');
  wrap.className = 'section';

  const head = document.createElement('div');
  head.className = 'sec-head';
  head.innerHTML = (sec.dot === false ? '' : `<span class="dot ${sec.color}"></span> `) + sec.label;
  if (typeof sec.pct === 'number') {
    const pct = document.createElement('span');
    pct.className = 'pct ' + (sec.color === 'neon' ? 'neon-text' : 'purple-text');
    pct.textContent = sec.pct + '%';
    head.appendChild(pct);
  } else if (sec.note) {
    const note = document.createElement('span');
    note.className = 'sec-note';
    note.textContent = sec.note;
    head.appendChild(note);
  }
  wrap.appendChild(head);

  const tasks = document.createElement('div');
  tasks.className = 'tasks';
  if (!sec.tasks.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = '—';
    tasks.appendChild(e);
  } else {
    sec.tasks.forEach((t) => tasks.appendChild(taskRow(t, sec.color, !!sec.showTaskCats)));
  }
  wrap.appendChild(tasks);
  return wrap;
}

function applyData(d) {
  // space is a dark-family theme — it wears `dark` too, then overrides
  document.body.classList.toggle('dark', d.theme === 'dark' || d.theme === 'space');
  document.body.classList.toggle('pond', d.theme === 'pond');
  document.body.classList.toggle('space', d.theme === 'space');
  const host = $('#sections');
  host.innerHTML = '';
  (d.sections || []).forEach((sec) => host.appendChild(buildSection(sec)));
  if (window.widgetAPI && window.widgetAPI.resize) {
    const h = document.querySelector('.card').offsetHeight + 12;
    window.widgetAPI.resize(h);
  }
}
window.__applyWidgetData = applyData; // exposed for preview testing

if (window.widgetAPI) {
  window.widgetAPI.onData(applyData);
  $('#closeBtn').onclick = () => window.widgetAPI.close();
  $('#openBtn').onclick = () => window.widgetAPI.openApp();
}
