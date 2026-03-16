const { contextBridge, ipcRenderer } = require('electron');

// Expose safe IPC methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  quitApp: () => ipcRenderer.send('quit-app'),
  fetchEmails: (account) => ipcRenderer.invoke('email:fetch', account),
  fetchEmailBody: (account, uid) => ipcRenderer.invoke('email:fetch-body', account, uid),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  // Route HTTP requests through the main process to bypass CORS and Windows Firewall
  netFetch: (url, options) => ipcRenderer.invoke('net:fetch', url, options),
});
