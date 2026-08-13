const { contextBridge, ipcRenderer } = require('electron');

// Each widget window is told which one it is via additionalArguments, so both
// can share this preload and one set of IPC channels.
const arg = process.argv.find((a) => a.startsWith('--widget-id='));
const WIDGET_ID = arg ? arg.split('=')[1] : 'all';

contextBridge.exposeInMainWorld('widgetAPI', {
  id: WIDGET_ID,
  onData: (cb) => ipcRenderer.on('widget:data', (_e, data) => cb(data)),
  close: () => ipcRenderer.send('widget:close', { id: WIDGET_ID }),
  openApp: () => ipcRenderer.send('widget:open-app'),
  resize: (height) => ipcRenderer.send('widget:resize', { id: WIDGET_ID, height }),
  toggle: (kind, id) => ipcRenderer.send('widget:toggle', { kind, id })
});
