const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('goalAPI', {
  writeLog: (filename, content) => ipcRenderer.invoke('write-log', { filename, content }),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  writeIcs: (filename, content) => ipcRenderer.invoke('write-ics', { filename, content }),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),
  // both sticky widgets share these, keyed by id ('all' | 'objective')
  setWidget: (id, open) => ipcRenderer.invoke('widget:set', { id, open }),
  pushWidget: (id, payload) => ipcRenderer.send('widget:push', { id, payload }),
  onWidgetClosed: (cb) => ipcRenderer.on('widget:closed', (_e, info) => cb(info || {})),
  onWidgetToggle: (cb) => ipcRenderer.on('widget:toggle', (_e, payload) => cb(payload)),
  onObjectiveProject: (cb) => ipcRenderer.on('objective:set-project', (_e, info) => cb(info || {}))
});
