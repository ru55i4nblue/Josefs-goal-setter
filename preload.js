const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('goalAPI', {
  writeLog: (filename, content) => ipcRenderer.invoke('write-log', { filename, content }),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  writeIcs: (filename, content) => ipcRenderer.invoke('write-ics', { filename, content }),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),
  setWidget: (open) => ipcRenderer.invoke('widget:set', open),
  pushWidget: (payload) => ipcRenderer.send('widget:push', payload),
  onWidgetClosed: (cb) => ipcRenderer.on('widget:closed', () => cb()),
  onWidgetToggle: (cb) => ipcRenderer.on('widget:toggle', (_e, payload) => cb(payload))
});
