const { app, BrowserWindow, ipcMain, shell, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const isMac = process.platform === 'darwin';

let mainWindow;
let widgetWin = null;
let lastWidgetPayload = null;

// Keep the runtime name consistent with the installed exe + startup registry entry.
app.setName('Goal Setter');
if (process.platform === 'win32') app.setAppUserModelId('com.goalsetter.app');

// On macOS a proper application menu is required for standard editing shortcuts
// (Cmd+C/V/X/A/Z) to work in text fields; Windows keeps its clean menuless look.
function buildAppMenu() {
  if (!isMac) { Menu.setApplicationMenu(null); return; }
  const template = [
    { label: 'Goal Setter', submenu: [
      { role: 'about' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { role: 'quit' }
    ] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ] },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' }
    ] },
    { label: 'Window', submenu: [
      { role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Folder where daily markdown logs are written so you can hand them to Claude -> Notion.
function logsDir() {
  const dir = path.join(app.getPath('documents'), 'Goal Setter', 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 820,
    minHeight: 600,
    backgroundColor: '#ffffff',
    title: 'Goal Setter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  buildAppMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Write the compiled daily markdown log to disk and return its path.
ipcMain.handle('write-log', (_e, { filename, content }) => {
  const safe = filename.replace(/[^a-z0-9._-]/gi, '_');
  const full = path.join(logsDir(), safe);
  fs.writeFileSync(full, content, 'utf8');
  return full;
});

ipcMain.handle('open-logs-folder', () => {
  shell.openPath(logsDir());
});

// Launch-at-login (Windows/macOS). Reflects/sets the OS startup item for this app.
ipcMain.handle('get-autostart', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('set-autostart', (_e, enabled) => {
  app.setLoginItemSettings({ openAtLogin: !!enabled, openAsHidden: false });
  return app.getLoginItemSettings().openAtLogin;
});

// Write an .ics calendar export and reveal it so the user can import to Google Calendar.
ipcMain.handle('write-ics', (_e, { filename, content }) => {
  const safe = filename.replace(/[^a-z0-9._-]/gi, '_');
  const dir = path.join(app.getPath('documents'), 'Goal Setter', 'exports');
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, safe);
  fs.writeFileSync(full, content, 'utf8');
  shell.showItemInFolder(full);
  return full;
});

/* ---------- floating always-on-top sticky widget ---------- */
function createWidgetWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  widgetWin = new BrowserWindow({
    width: 260, height: 246,
    x: workArea.x + workArea.width - 260 - 18,
    y: workArea.y + 18,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'widget-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  // 'screen-saver' level floats above macOS fullscreen apps ('floating' does not);
  // skipTransformProcessType stops macOS from bouncing the dock when it shows.
  widgetWin.setAlwaysOnTop(true, 'screen-saver');
  widgetWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  widgetWin.loadFile('widget.html');
  widgetWin.webContents.on('did-finish-load', () => {
    if (lastWidgetPayload) widgetWin.webContents.send('widget:data', lastWidgetPayload);
  });
  widgetWin.on('closed', () => { widgetWin = null; });
}

// main app -> show/hide the widget
ipcMain.handle('widget:set', (_e, open) => {
  if (open) {
    if (!widgetWin) createWidgetWindow();
    else widgetWin.show();
  } else if (widgetWin) {
    widgetWin.close();
  }
  return !!widgetWin;
});

// main app -> latest task data for the widget
ipcMain.on('widget:push', (_e, payload) => {
  lastWidgetPayload = payload;
  if (widgetWin) widgetWin.webContents.send('widget:data', payload);
});

// widget's close button -> hide + tell the main app so its toggle stays in sync
ipcMain.on('widget:close', () => {
  if (widgetWin) widgetWin.close();
  if (mainWindow) mainWindow.webContents.send('widget:closed');
});

// widget -> bring the main app forward
ipcMain.on('widget:open-app', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

// widget -> toggle a task done; hand it to the main app to update state
ipcMain.on('widget:toggle', (_e, payload) => {
  if (mainWindow) mainWindow.webContents.send('widget:toggle', payload);
});

// widget -> resize its window to hug the content height
ipcMain.on('widget:resize', (_e, height) => {
  if (!widgetWin) return;
  const h = Math.max(120, Math.min(600, Math.round(height)));
  const [w] = widgetWin.getSize();
  widgetWin.setSize(w, h);
});
