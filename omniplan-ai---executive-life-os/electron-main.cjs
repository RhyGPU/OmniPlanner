const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'OmniPlan AI',
    icon: path.join(__dirname, 'dist', 'favicon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      zoomFactor: 1.0,
    },
  });

  // Remove the default menu bar but keep zoom shortcuts working
  win.setMenuBarVisibility(false);

  // Enable Ctrl+= / Ctrl+- / Ctrl+0 zoom shortcuts
  win.webContents.on('before-input-event', (event, input) => {
    if (input.control || input.meta) {
      if (input.key === '=' || input.key === '+') {
        win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5);
        event.preventDefault();
      } else if (input.key === '-') {
        win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5);
        event.preventDefault();
      } else if (input.key === '0') {
        win.webContents.setZoomLevel(0);
        event.preventDefault();
      }
    }
  });

  if (DEV_URL) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools();
  } else {
    // In production, load from dist folder with relative paths
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    win.loadFile(indexPath);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('quit-app', () => {
  app.quit();
});
