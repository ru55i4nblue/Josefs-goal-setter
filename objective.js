const $ = (s) => document.querySelector(s);

function row(t) {
  const el = document.createElement('div');
  el.className = 'obj-row clickable' + (t.done ? ' done' : '');
  el.title = 'Click to check off';

  const box = document.createElement('span');
  box.className = 'obj-box' + (t.done ? ' done' : '');

  const name = document.createElement('span');
  name.className = 'obj-task';
  name.textContent = t.title;

  const due = document.createElement('span');
  due.className = 'obj-due' + (t.overdue ? ' overdue' : t.due === 'today' ? ' today' : '');
  due.textContent = t.due || '';

  el.onclick = () => {
    if (!window.widgetAPI || !window.widgetAPI.toggle) return;
    el.classList.toggle('done');
    box.classList.toggle('done');
    window.widgetAPI.toggle(t.kind, t.id);
  };

  el.appendChild(box);
  el.appendChild(name);
  if (due.textContent) el.appendChild(due);
  return el;
}

function applyData(d) {
  document.body.classList.toggle('dark', d.theme === 'dark' || d.theme === 'space');
  document.body.classList.toggle('pond', d.theme === 'pond');
  document.body.classList.toggle('space', d.theme === 'space');

  $('#objName').textContent = d.project || 'No project chosen';
  $('#objPct').textContent = typeof d.pct === 'number' ? d.pct + '%' : '';
  $('#objFill').style.width = (typeof d.pct === 'number' ? d.pct : 0) + '%';

  const host = $('#objList');
  host.innerHTML = '';
  const tasks = d.tasks || [];
  if (!tasks.length) {
    const e = document.createElement('div');
    e.className = 'obj-empty';
    e.textContent = d.project ? 'Nothing left in this project.' : 'Choose a project in Settings.';
    host.appendChild(e);
  } else {
    tasks.forEach((t) => host.appendChild(row(t)));
  }

  // "+3 more" so a trimmed list doesn't look like the whole project
  $('#objMore').textContent = d.remaining > 0 ? `+${d.remaining} more` : '';
  $('#objMore').classList.toggle('hidden', !(d.remaining > 0));

  if (window.widgetAPI && window.widgetAPI.resize) {
    window.widgetAPI.resize(document.querySelector('.card').offsetHeight + 12);
  }
}
window.__applyObjectiveData = applyData;   // exposed for preview testing

if (window.widgetAPI) {
  window.widgetAPI.onData(applyData);
  $('#closeBtn').onclick = () => window.widgetAPI.close();
  $('#openBtn').onclick = () => window.widgetAPI.openApp();
}
