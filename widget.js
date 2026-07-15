const $ = (s) => document.querySelector(s);

function taskRow(t, color) {
  const row = document.createElement('div');
  row.className = 'wtask clickable' + (t.done ? ' done' : '');
  row.title = 'Click to check off';

  const box = document.createElement('span');
  box.className = `box ${color}` + (t.done ? ' done' : '');

  const name = document.createElement('span');
  name.className = 'wname';
  name.textContent = t.title;

  const badge = document.createElement('span');
  badge.className = 'wbadge';
  badge.textContent = '×' + t.weight;

  row.onclick = () => {
    if (!window.widgetAPI || !window.widgetAPI.toggle) return;
    row.classList.toggle('done');
    box.classList.toggle('done');
    window.widgetAPI.toggle(t.kind, t.id);
  };

  row.appendChild(box);
  row.appendChild(name);
  row.appendChild(badge);
  return row;
}

function buildSection(sec) {
  const wrap = document.createElement('div');
  wrap.className = 'section';

  const head = document.createElement('div');
  head.className = 'sec-head';
  head.innerHTML = `<span class="dot ${sec.color}"></span> ${sec.label}`;
  if (typeof sec.pct === 'number') {
    const pct = document.createElement('span');
    pct.className = 'pct ' + (sec.color === 'neon' ? 'neon-text' : 'purple-text');
    pct.textContent = sec.pct + '%';
    head.appendChild(pct);
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
    sec.tasks.forEach((t) => tasks.appendChild(taskRow(t, sec.color)));
  }
  wrap.appendChild(tasks);
  return wrap;
}

function applyData(d) {
  document.body.classList.toggle('dark', d.theme === 'dark');
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
