const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetAPI', {
  onData: (cb) => ipcRenderer.on('widget:data', (_e, data) => cb(data)),
  close: () => ipcRenderer.send('widget:close'),
  openApp: () => ipcRenderer.send('widget:open-app'),
  resize: (height) => ipcRenderer.send('widget:resize', height),
  toggle: (kind, id) => ipcRenderer.send('widget:toggle', { kind, id })
});
