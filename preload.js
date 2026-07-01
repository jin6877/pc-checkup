const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  scan: () => ipcRenderer.invoke('scan'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
