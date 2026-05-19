const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toodly', {
  openMainWindow: () => ipcRenderer.invoke('open-main-window'),
  getPinAlwaysOnTop: () => ipcRenderer.invoke('toodly:get-pin-always-on-top'),
  setPinAlwaysOnTop: (enabled) => ipcRenderer.invoke('toodly:set-pin-always-on-top', enabled),
  getData: () => ipcRenderer.invoke('toodly:get-data'),
  setData: (data) => ipcRenderer.invoke('toodly:set-data', data),
  getUpdateStatus: () => ipcRenderer.invoke('toodly:get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('toodly:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('toodly:install-update'),
  getAuth: () => ipcRenderer.invoke('toodly:get-auth'),
  loginAi: () => ipcRenderer.invoke('toodly:login-ai'),
  logoutAi: () => ipcRenderer.invoke('toodly:logout-ai'),
  summarizeAi: (range, payload) => ipcRenderer.invoke('toodly:summarize-ai', range, payload),
  onDataUpdated: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('toodly:data-updated', listener);
    return () => ipcRenderer.removeListener('toodly:data-updated', listener);
  },
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('toodly:update-status', listener);
    return () => ipcRenderer.removeListener('toodly:update-status', listener);
  },
});
