const { contextBridge, ipcRenderer } = require('electron');

// Expose safe IPC methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  quitApp: () => ipcRenderer.send('quit-app'),
  // Email — account objects no longer carry passwords; main process looks up
  // credentials from safeStorage using account.id.
  fetchEmails: (account) => ipcRenderer.invoke('email:fetch', account),
  fetchEmailBody: (account, uid) => ipcRenderer.invoke('email:fetch-body', account, uid),
  // One-shot connection test before an account is saved — accepts credentials
  // inline. Does NOT store them; caller must call credentialSet afterwards.
  testEmailConnection: (creds) => ipcRenderer.invoke('email:test-connection', creds),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  // Route HTTP requests through the main process to bypass CORS and Windows Firewall
  netFetch: (url, options) => ipcRenderer.invoke('net:fetch', url, options),
  // Credential management via Electron safeStorage.
  // credentialSet returns false when OS-level encryption is unavailable.
  credentialIsAvailable: () => ipcRenderer.invoke('keychain:is-available'),
  credentialSet: (key, value) => ipcRenderer.invoke('keychain:set', key, value),
  credentialGet: (key) => ipcRenderer.invoke('keychain:get', key),
  credentialDelete: (key) => ipcRenderer.invoke('keychain:delete', key),
});
