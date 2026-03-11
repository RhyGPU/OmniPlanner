const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Expose safe IPC methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  quitApp: () => ipcRenderer.send('quit-app'),
  zoomIn: () => { webFrame.setZoomLevel(webFrame.getZoomLevel() + 0.5); return webFrame.getZoomLevel(); },
  zoomOut: () => { webFrame.setZoomLevel(webFrame.getZoomLevel() - 0.5); return webFrame.getZoomLevel(); },
  zoomReset: () => { webFrame.setZoomLevel(0); return 0; },
  getZoomLevel: () => webFrame.getZoomLevel(),
});
