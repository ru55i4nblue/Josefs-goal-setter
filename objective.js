const $ = (s) => document.querySelector(s);

let lastData = null;

// The window hugs its content, so anything that changes the card's height has
// to ask for a resize — opening the project picker included.
function fit() {
  if (window.widgetAPI && window.widgetAPI.resize) {
    window.widgetAPI.resize(document.querySelector('.card').offsetHeight + 12);
  }
}

// Switch project without opening the app. The list rides along in every payload,
// so this needs no round trip to draw — only to commit the choice.
function buildPicker(d) {
  const host = $('#objPicker');
  const list = d.projects || [];
  host.innerHTML = '';
  // nothing to switch between: leave the name inert rather than offering a
  // menu of one
  $('#objName').classList.toggle('switchable', list.length > 1);
  if (list.length < 2) { host.classList.add('hidden'); return; }

  list.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'obj-pick' + (p.id === d.projectId ? ' current' : '');

    const dot = document.createElement('span');
    dot.className = 'obj-pick-dot dot ' + (p.color || 'gray');

    const name = document.createElement('span');
    name.className = 'obj-pick-name';
    name.textContent = p.name;

    b.appendChild(dot);
    b.appendChild(name);
    b.onclick = () => {
      host.classList.add('hidden');
      if (p.id !== d.projectId && window.widgetAPI && window.widgetAPI.setProject) {
        window.widgetAPI.setProject(p.id);
      }
      fit();
    };
    host.appendChild(b);
  });
}

function togglePicker(force) {
  const host = $('#objPicker');
  if (!host.children.length) return;
  const hide = force === undefined ? !host.classList.contains('hidden') : force;
  host.classList.toggle('hidden', hide);
  fit();
}

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

// A task's steps, shown under it as an indented checklist — the same shape the
// app uses inside a project. Read-only: the row above is what you tick.
function stepList(t) {
  const steps = t.steps || [];
  if (!steps.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'obj-steps';
  steps.forEach((s) => {
    const item = document.createElement('div');
    item.className = 'obj-step' + (s.done ? ' done' : '');

    const box = document.createElement('span');
    box.className = 'obj-step-box' + (s.done ? ' done' : '');

    const name = document.createElement('span');
    name.className = 'obj-step-name';
    name.textContent = s.title;

    item.appendChild(box);
    item.appendChild(name);
    wrap.appendChild(item);
  });
  return wrap;
}

function applyData(d) {
  document.body.classList.toggle('dark', d.theme === 'dark' || d.theme === 'space');
  document.body.classList.toggle('pond', d.theme === 'pond');
  document.body.classList.toggle('space', d.theme === 'space');

  // the project's category colour drives --c, which the fill and the card's
  // edge read from; text keeps its own tokens, since a fill colour used as text
  // is exactly how this project's contrast bugs have always started
  const card = document.querySelector('.card');
  card.className = 'card obj-card' + (d.color ? ' tint-' + d.color : '');

  lastData = d;
  $('#objName').textContent = d.project || 'No project chosen';
  $('#objPct').textContent = typeof d.pct === 'number' ? d.pct + '%' : '';
  $('#objFill').style.width = (typeof d.pct === 'number' ? d.pct : 0) + '%';
  buildPicker(d);

  const host = $('#objList');
  host.innerHTML = '';
  const tasks = d.tasks || [];
  if (!tasks.length) {
    const e = document.createElement('div');
    e.className = 'obj-empty';
    e.textContent = d.project ? 'Nothing left in this project.' : 'Choose a project in Settings.';
    host.appendChild(e);
  } else {
    tasks.forEach((t) => {
      host.appendChild(row(t));
      const steps = stepList(t);
      if (steps) host.appendChild(steps);
    });
  }

  // "+3 more" so a trimmed list doesn't look like the whole project
  $('#objMore').textContent = d.remaining > 0 ? `+${d.remaining} more` : '';
  $('#objMore').classList.toggle('hidden', !(d.remaining > 0));

  fit();
}
window.__applyObjectiveData = applyData;   // exposed for preview testing

$('#objName').onclick = () => togglePicker();
document.addEventListener('click', (e) => {
  if (e.target.closest('#objName') || e.target.closest('#objPicker')) return;
  togglePicker(true);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') togglePicker(true); });

if (window.widgetAPI) {
  window.widgetAPI.onData(applyData);
  $('#closeBtn').onclick = () => window.widgetAPI.close();
  $('#openBtn').onclick = () => window.widgetAPI.openApp();
}
