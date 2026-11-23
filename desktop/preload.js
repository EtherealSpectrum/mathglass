const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mathglassDesktop', {
  isDesktop: true,
  platform: process.platform,
  winAction: action => ipcRenderer.send('mathglass:win-action', action),
  getBounds: () => ipcRenderer.invoke('mathglass:get-bounds'),
  setBounds: bounds => ipcRenderer.send('mathglass:resize-bounds', bounds),
  getState: () => ipcRenderer.invoke('mathglass:get-state'),
  openExternal: url => ipcRenderer.send('mathglass:open-external', url),
  fetchImageDataUrl: url => ipcRenderer.invoke('mathglass:fetch-image-data-url', url),
  onWindowState: cb => {
    const fn = (_e, st) => cb?.(st);
    ipcRenderer.on('mathglass:window-state', fn);
    return () => ipcRenderer.removeListener('mathglass:window-state', fn);
  },
  onShortcut: cb => {
    const fn = (_e, payload) => cb?.(payload);
    ipcRenderer.on('mathglass:shortcut', fn);
    return () => ipcRenderer.removeListener('mathglass:shortcut', fn);
  },
});
