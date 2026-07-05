const { app, BrowserWindow, ipcMain, shell, net, safeStorage, Notification, Tray, Menu, nativeImage, dialog, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('OmniPlanner');
// Required for Windows toast notifications to display with the app's name/icon.
// Must match build.appId in package.json.
app.setAppUserModelId('com.omniplan.app');
app.disableHardwareAcceleration();

const localAppData = process.env.LOCALAPPDATA || app.getPath('appData');
const userDataDir = path.join(localAppData, 'OmniPlanner');
fs.mkdirSync(userDataDir, { recursive: true });
app.setPath('userData', userDataDir);
app.setPath('cache', path.join(userDataDir, 'Cache'));

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

let mainWindow = null;
let tray = null;
// True once the user chose Quit (tray menu / quit-app IPC / before-quit).
// While false, closing the window hides it to the tray instead of quitting,
// so alarms and background email checks keep running.
let isQuitting = false;

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ---------------------------------------------------------------------------
// Credential store ??backed by Electron safeStorage (OS keychain encryption).
// Encrypted blobs are persisted to a file in the app's userData directory.
//
// SECURITY MODEL:
//   - Encryption is only as strong as safeStorage.isEncryptionAvailable().
//   - On Linux without a keyring daemon the OS-level key is unavailable;
//     safeStorage falls back to a weaker key. We surface this via
//     keychain:is-available so the renderer can warn the user.
//   - Credentials are NEVER exported in backups (see dataManager.ts).
//   - After a backup restore users must re-enter credentials.
// ---------------------------------------------------------------------------

function getCredentialFilePath() {
  return path.join(app.getPath('userData'), 'credentials.enc.json');
}

function readCredentialStore() {
  try {
    return JSON.parse(fs.readFileSync(getCredentialFilePath(), 'utf-8'));
  } catch (_) { return {}; }
}

function writeCredentialStore(store) {
  try {
    // mode 0o600 = owner read/write only
    fs.writeFileSync(getCredentialFilePath(), JSON.stringify(store), { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    console.error('[OmniPlan] Failed to write credential store:', err);
  }
}

/** Decrypt and return a stored credential, or null if absent / unavailable. */
function getCredential(key) {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const store = readCredentialStore();
  if (!store[key]) return null;
  try {
    return safeStorage.decryptString(Buffer.from(store[key], 'base64'));
  } catch (_) { return null; }
}

/** Encrypt and store a credential. Returns false if safeStorage is unavailable. */
function setCredential(key, value) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  try {
    const encrypted = safeStorage.encryptString(value);
    const store = readCredentialStore();
    store[key] = encrypted.toString('base64');
    writeCredentialStore(store);
    return true;
  } catch (_) { return false; }
}

function deleteCredential(key) {
  const store = readCredentialStore();
  if (key in store) {
    delete store[key];
    writeCredentialStore(store);
  }
}

// ---------------------------------------------------------------------------
// Email diagnostics helpers
// ---------------------------------------------------------------------------

/**
 * Classify an imapflow error into a stable email error code string.
 * These string values must match EmailErrorCode in services/email/errors.ts.
 * Never include credentials or message bodies in log output.
 */
function classifyImapError(error) {
  const msg = (error.message || '').toLowerCase();
  const code = error.code || '';

  // Network / connectivity
  if (code === 'ENOTFOUND' || msg.includes('getaddrinfo')) return 'EMAIL_DNS_FAILURE';
  if (code === 'ECONNREFUSED') return 'EMAIL_CONNECTION_REFUSED';
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EHOSTUNREACH') return 'EMAIL_NETWORK_TIMEOUT';
  if (msg.includes('certificate') || msg.includes('ssl') || msg.includes('tls handshake')) return 'EMAIL_TLS_HANDSHAKE_FAILED';

  // Authentication ??order matters: app password hint before generic auth fail
  if (msg.includes('app-specific password') || msg.includes('application-specific')) return 'EMAIL_APP_PASSWORD_REQUIRED';
  if (msg.includes('imap access disabled') || msg.includes('imap is disabled')) return 'EMAIL_IMAP_DISABLED';
  if (msg.includes('authenticationfailed') || msg.includes('[authorizationfailed]') || msg.includes('auth failed')) return 'EMAIL_AUTH_FAILED';
  if (msg.includes('locked') || msg.includes('too many login')) return 'EMAIL_AUTH_LOCKED';

  // Protocol / mailbox
  if (msg.includes('select') && msg.includes('fail')) return 'EMAIL_IMAP_SELECT_FAILED';
  if (msg.includes('mailbox') && (msg.includes('not found') || msg.includes('does not exist'))) return 'EMAIL_MAILBOX_NOT_FOUND';

  return 'EMAIL_IMAP_FETCH_FAILED';
}

/** Generate a short operation ID for correlating logs with user reports. */
function makeOpId(prefix) {
  return `${prefix}-${Date.now().toString(36)}`;
}

// Polyfill diagnostics_channel.tracingChannel for Electron's Node 18.x
// (pino, used by imapflow, requires this Node 19.9+ API)
try {
  const dc = require('node:diagnostics_channel');
  if (typeof dc.tracingChannel !== 'function') {
    dc.tracingChannel = function tracingChannelPolyfill(name) {
      return {
        start: dc.channel(name + ':start'),
        end: dc.channel(name + ':end'),
        asyncStart: dc.channel(name + ':asyncStart'),
        asyncEnd: dc.channel(name + ':asyncEnd'),
        error: dc.channel(name + ':error'),
        subscribe(handlers) {
          if (handlers.start) this.start.subscribe(handlers.start);
          if (handlers.end) this.end.subscribe(handlers.end);
          if (handlers.asyncStart) this.asyncStart.subscribe(handlers.asyncStart);
          if (handlers.asyncEnd) this.asyncEnd.subscribe(handlers.asyncEnd);
          if (handlers.error) this.error.subscribe(handlers.error);
        },
        unsubscribe(handlers) {
          if (handlers.start) this.start.unsubscribe(handlers.start);
          if (handlers.end) this.end.unsubscribe(handlers.end);
          if (handlers.asyncStart) this.asyncStart.unsubscribe(handlers.asyncStart);
          if (handlers.asyncEnd) this.asyncEnd.unsubscribe(handlers.asyncEnd);
          if (handlers.error) this.error.unsubscribe(handlers.error);
        },
        get hasSubscribers() {
          return this.start.hasSubscribers || this.end.hasSubscribers ||
            this.asyncStart.hasSubscribers || this.asyncEnd.hasSubscribers ||
            this.error.hasSubscribers;
        },
      };
    };
  }
} catch (_) {
  // diagnostics_channel unavailable ??email fetch will still fail gracefully
}

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

// ---------------------------------------------------------------------------
// Desktop notifications + alarm scheduling (main process)
//
// Timers live in the main process so alarms fire even when the window is
// hidden to the tray or the renderer reloads. Scheduled alarms are persisted
// to userData/scheduled-alarms.json and re-armed on startup and on wake from
// sleep (setTimeout does not tick while the machine sleeps).
// ---------------------------------------------------------------------------

/** id → { title, body, scheduledAtMs, timer } */
const scheduledAlarms = new Map();
let alarmsPaused = false;

const alarmsFilePath = () => path.join(app.getPath('userData'), 'scheduled-alarms.json');

function persistAlarms() {
  try {
    const entries = [...scheduledAlarms.values()].map(({ id, title, body, scheduledAtMs }) => ({ id, title, body, scheduledAtMs }));
    fs.writeFileSync(alarmsFilePath(), JSON.stringify(entries), { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    console.error('[OmniPlan] Failed to persist alarms:', err);
  }
}

function getNotificationIcon() {
  for (const candidate of [path.join(__dirname, 'dist', 'icon-192.png'), path.join(__dirname, 'public', 'icon-192.png')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function showDesktopNotification(title, body) {
  if (!Notification.isSupported()) return false;
  const notification = new Notification({ title, body, icon: getNotificationIcon() });
  notification.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    focusMainWindow();
  });
  notification.show();
  return true;
}

/** Fire an alarm now (unless paused) and remove it from the schedule. */
function fireAlarm(id) {
  const alarm = scheduledAlarms.get(id);
  if (!alarm) return;
  scheduledAlarms.delete(id);
  persistAlarms();
  if (alarmsPaused) {
    console.log(`[OmniPlan] Alarm ${id} suppressed (alarms paused)`);
    return;
  }
  showDesktopNotification(alarm.title, alarm.body);
}

const MAX_TIMEOUT_MS = 2147483647; // setTimeout ceiling (~24.8 days)

/** (Re-)arm the timer for an alarm entry. Chains for delays beyond the setTimeout ceiling. */
function armAlarmTimer(alarm) {
  if (alarm.timer) clearTimeout(alarm.timer);
  const delay = alarm.scheduledAtMs - Date.now();
  if (delay <= 0) {
    // Missed while asleep / between sessions — fire if less than 10 minutes late,
    // otherwise drop silently (a stale "8:00 AM" alarm at 3 PM is noise).
    if (delay > -10 * 60 * 1000) {
      fireAlarm(alarm.id);
    } else {
      scheduledAlarms.delete(alarm.id);
      persistAlarms();
    }
    return;
  }
  alarm.timer = setTimeout(() => {
    if (alarm.scheduledAtMs - Date.now() > 1000) {
      armAlarmTimer(alarm); // chained long delay — re-arm for the remainder
    } else {
      fireAlarm(alarm.id);
    }
  }, Math.min(delay, MAX_TIMEOUT_MS));
}

function scheduleAlarm(id, title, body, scheduledAtMs) {
  const existing = scheduledAlarms.get(id);
  if (existing?.timer) clearTimeout(existing.timer);
  const alarm = { id, title, body, scheduledAtMs, timer: null };
  scheduledAlarms.set(id, alarm);
  persistAlarms();
  armAlarmTimer(alarm);
  return true;
}

function cancelAlarm(id) {
  const alarm = scheduledAlarms.get(id);
  if (alarm?.timer) clearTimeout(alarm.timer);
  scheduledAlarms.delete(id);
  persistAlarms();
}

function cancelAllAlarms() {
  for (const alarm of scheduledAlarms.values()) {
    if (alarm.timer) clearTimeout(alarm.timer);
  }
  scheduledAlarms.clear();
  persistAlarms();
}

/** Load persisted alarms on startup and re-arm them (fires recently-missed ones). */
function restoreAlarms() {
  try {
    if (!fs.existsSync(alarmsFilePath())) return;
    const entries = JSON.parse(fs.readFileSync(alarmsFilePath(), 'utf-8'));
    for (const { id, title, body, scheduledAtMs } of entries) {
      if (typeof id !== 'number' || typeof scheduledAtMs !== 'number') continue;
      const alarm = { id, title, body: body || '', scheduledAtMs, timer: null };
      scheduledAlarms.set(id, alarm);
      armAlarmTimer(alarm);
    }
  } catch (err) {
    console.error('[OmniPlan] Failed to restore alarms:', err);
  }
}

ipcMain.handle('notification:show', (_event, title, body) => showDesktopNotification(String(title), String(body)));
ipcMain.handle('notification:schedule', (_event, id, title, body, scheduledAtMs) =>
  scheduleAlarm(Number(id), String(title), String(body), Number(scheduledAtMs)));
ipcMain.handle('notification:cancel', (_event, id) => { cancelAlarm(Number(id)); });
ipcMain.handle('notification:cancel-all', () => { cancelAllAlarms(); });
ipcMain.handle('notification:is-supported', () => Notification.isSupported());

// ---------------------------------------------------------------------------
// Launch at startup (opt-in via first-launch prompt / settings toggle)
// ---------------------------------------------------------------------------

ipcMain.handle('startup:get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('startup:set', (_event, enable) => {
  app.setLoginItemSettings({ openAtLogin: !!enable });
  return app.getLoginItemSettings().openAtLogin;
});

// ---------------------------------------------------------------------------
// System tray — keeps the app (and its alarms) alive when the window closes
// ---------------------------------------------------------------------------

function getTrayIcon() {
  const candidates = [
    path.join(__dirname, 'dist', 'favicon.ico'),
    path.join(__dirname, 'public', 'favicon.ico'),
    path.join(__dirname, 'dist', 'icon-192.png'),
    path.join(__dirname, 'public', 'icon-192.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const buffer = fs.readFileSync(candidate);
        const img = nativeImage.createFromBuffer(buffer);
        if (!img.isEmpty()) {
          if (candidate.endsWith('.png')) {
            return img.resize({ width: 16, height: 16 });
          }
          return img;
        }
      } catch (err) {
        console.error(`[OmniPlan] Failed to load tray icon buffer from ${candidate}:`, err);
      }
    }
  }
  return nativeImage.createEmpty();
}

function confirmQuit() {
  const opts = {
    type: 'question',
    buttons: ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Quit OmniPlanner',
    message: 'Are you sure you want to quit?',
    detail: 'Alarms, notifications, and background email checks will stop working until you reopen OmniPlanner.',
  };
  const choice = mainWindow && !mainWindow.isDestroyed()
    ? dialog.showMessageBoxSync(mainWindow, opts)
    : dialog.showMessageBoxSync(opts);
  if (choice === 0) {
    isQuitting = true;
    app.quit();
  }
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open OmniPlanner', click: () => { if (!mainWindow || mainWindow.isDestroyed()) createWindow(); focusMainWindow(); } },
    {
      label: 'Pause Alarms',
      type: 'checkbox',
      checked: alarmsPaused,
      click: (item) => { alarmsPaused = item.checked; },
    },
    { type: 'separator' },
    { label: 'Quit OmniPlanner', click: confirmQuit },
  ]));
}

function createTray() {
  if (tray) return;
  try {
    tray = new Tray(getTrayIcon());
    tray.setToolTip('OmniPlanner — alarms active');
    rebuildTrayMenu();
    tray.on('double-click', () => { if (!mainWindow || mainWindow.isDestroyed()) createWindow(); focusMainWindow(); });
  } catch (err) {
    console.error('[OmniPlan] Tray creation failed:', err);
    tray = null;
  }
}

// Pre-configured IMAP hosts for known providers
const IMAP_HOSTS = {
  gmail: { host: 'imap.gmail.com', port: 993 },
  outlook: { host: 'outlook.office365.com', port: 993 },
  yahoo: { host: 'imap.mail.yahoo.com', port: 993 },
  naver: { host: 'imap.naver.com', port: 993 },
};

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusMainWindow();
    return mainWindow;
  }

  // Restore previous window bounds from userData
  let bounds = {};
  try {
    const stateFile = path.join(app.getPath('userData'), 'window-state.json');
    if (fs.existsSync(stateFile)) {
      bounds = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    }
  } catch (_) { /* ignore corrupt state */ }

  const win = new BrowserWindow({
    width: bounds.width || 1400,
    height: bounds.height || 900,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    title: 'OmniPlanner',
    show: false,
    backgroundColor: '#f8fafc',
    icon: path.join(__dirname, 'dist', 'favicon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      zoomFactor: 1.0,
    },
  });

  // Save window bounds on resize/move
  const saveBounds = () => {
    try {
      const b = win.getBounds();
      fs.writeFileSync(
        path.join(app.getPath('userData'), 'window-state.json'),
        JSON.stringify(b),
        'utf-8'
      );
    } catch (_) { /* ignore */ }
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  mainWindow = win;

  win.setMenuBarVisibility(false);

  const csp = DEV_URL
    ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https:; connect-src *;"
    : "default-src 'self' 'unsafe-inline' blob: data: https:; connect-src *;";

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  if (DEV_URL) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    win.loadFile(indexPath);
  }

  win.once('ready-to-show', () => {
    focusMainWindow();
  });

  win.webContents.once('did-finish-load', () => {
    win.setTitle('OmniPlanner');
    focusMainWindow();
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[OmniPlanner] Failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
    focusMainWindow();
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[OmniPlanner] Renderer process stopped:', details);
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[renderer] ${sourceId}:${line} ${message}`);
    }
  });

  win.on('focus', () => {
    win.webContents.focus();
  });

  // Close-to-tray: the X button hides the window so alarms keep running.
  // A real quit (tray menu, quit-app IPC) sets isQuitting first.
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
      notifyHiddenToTrayOnce();
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  return win;
}

// One-time toast so users know the app didn't exit when they pressed X.
let hiddenToTrayNotified = false;
function notifyHiddenToTrayOnce() {
  if (hiddenToTrayNotified) return;
  hiddenToTrayNotified = true;
  try {
    const flagFile = path.join(app.getPath('userData'), 'tray-hint-shown');
    if (fs.existsSync(flagFile)) return;
    fs.writeFileSync(flagFile, '1', 'utf-8');
    showDesktopNotification(
      'OmniPlanner is still running',
      'Alarms stay active in the background. Right-click the tray icon to quit.',
    );
  } catch (_) { /* best-effort */ }
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  restoreAlarms();

  // Timers don't tick during system sleep — re-arm everything on wake so
  // recently-missed alarms fire and future ones get correct delays.
  powerMonitor.on('resume', () => {
    console.log('[OmniPlan] System resumed — re-arming alarms');
    for (const alarm of [...scheduledAlarms.values()]) {
      armAlarmTimer(alarm);
    }
  });
});

app.on('second-instance', focusMainWindow);

app.on('before-quit', (event) => {
  isQuitting = true;
  if (activeModelProcess) {
    try {
      console.log('[OmniPlan] Terminating local model server on exit...');
      activeModelProcess.kill();
    } catch (_) {}
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Trigger a synchronous screenshot of localStorage data for auto-backup
    mainWindow.webContents.executeJavaScript(
      `(function() {
        try {
          const keys = Object.keys(localStorage).filter(k => k.startsWith('omni_'));
          const data = {};
          for (const k of keys) { data[k] = localStorage.getItem(k); }
          return JSON.stringify(data);
        } catch(e) { return null; }
      })()`,
      true
    ).then((result) => {
      if (result) {
        try {
          const backupDir = path.join(userDataDir, 'backups');
          fs.mkdirSync(backupDir, { recursive: true });
          const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const backupFile = path.join(backupDir, `auto-backup-${ts}.json`);
          const payload = JSON.stringify({ version: 'auto', exportDate: new Date().toISOString(), data: JSON.parse(result) }, null, 2);
          fs.writeFileSync(backupFile, payload, { encoding: 'utf-8', mode: 0o600 });
          // Purge old backups — keep last 10
          const files = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('auto-backup-') && f.endsWith('.json'))
            .sort()
            .reverse();
          for (let i = 10; i < files.length; i++) {
            try { fs.unlinkSync(path.join(backupDir, files[i])); } catch (_) {}
          }
          console.log('[OmniPlanner] Auto-backup saved:', backupFile);
        } catch (err) {
          console.error('[OmniPlanner] Auto-backup failed:', err);
        }
      }
    }).catch(() => {});
  }
  // Let the quit proceed — the backup is best-effort
});

app.on('window-all-closed', () => {
  // With the tray active the app must survive window closure — that is the
  // whole point of close-to-tray (alarms, background email). Only quit when
  // the tray could not be created (and keep macOS dock behavior).
  if (!tray && process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Auto-update check — compare with latest GitHub release
async function checkForUpdates() {
  try {
    const https = require('https');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
    const currentVersion = pkg.version;

    await new Promise((resolve) => {
      const req = https.get(
        'https://api.github.com/repos/RhyGPU/OmniPlanner/releases/latest',
        { headers: { 'User-Agent': 'OmniPlanner' } },
        (res) => {
          let data = '';
          res.on('data', (d) => data += d);
          res.on('end', () => {
            try {
              const release = JSON.parse(data);
              const latest = (release.tag_name || '').replace(/^v/, '');
              if (latest && latest !== currentVersion) {
                console.log(`[OmniPlan] Update available: v${currentVersion} → v${latest}`);
                const updateFile = path.join(app.getPath('userData'), 'update-available.json');
                fs.writeFileSync(updateFile, JSON.stringify({ current: currentVersion, latest, url: release.html_url || '' }), 'utf-8');
              }
            } catch (_) { /* ignore */ }
            resolve();
          });
        }
      );
      req.on('error', () => resolve());
      req.setTimeout(5000, () => { req.destroy(); resolve(); });
    });
  } catch (_) { /* best-effort */ }
}
// Check 30s after startup so it doesn't slow down launch
setTimeout(checkForUpdates, 30000);

ipcMain.on('quit-app', () => {
  confirmQuit();
});

// Expose the auto-backup directory path to the renderer
ipcMain.handle('get-backup-dir', () => {
  return path.join(userDataDir, 'backups');
});

// Manual backup trigger from renderer (menu/shortcut)
ipcMain.handle('trigger-manual-backup', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false, error: 'No window' };
  try {
    const result = await mainWindow.webContents.executeJavaScript(
      `(function() {
        try {
          const keys = Object.keys(localStorage).filter(k => k.startsWith('omni_'));
          const data = {};
          for (const k of keys) { data[k] = localStorage.getItem(k); }
          return JSON.stringify(data);
        } catch(e) { return null; }
      })()`,
      true
    );
    if (!result) return { success: false, error: 'No data' };
    const backupDir = path.join(userDataDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFile = path.join(backupDir, `manual-backup-${ts}.json`);
    const payload = JSON.stringify({ version: 'manual', exportDate: new Date().toISOString(), data: JSON.parse(result) }, null, 2);
    fs.writeFileSync(backupFile, payload, { encoding: 'utf-8', mode: 0o600 });
    return { success: true, path: backupFile };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Check if an update is available (written by checkForUpdates)
ipcMain.handle('check-update-status', () => {
  try {
    const updateFile = path.join(app.getPath('userData'), 'update-available.json');
    if (fs.existsSync(updateFile)) {
      return JSON.parse(fs.readFileSync(updateFile, 'utf-8'));
    }
  } catch (_) {}
  return null;
});

// Generic HTTPS proxy via Electron's net module.
// The renderer's fetch() can be blocked by CORS/CSP or Windows Firewall;
// routing through the main process avoids both problems.
ipcMain.handle('net:fetch', (_event, url, options = {}) => {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = net.request({ method: options.method || 'GET', url, redirect: 'follow' });
    } catch (err) {
      return reject(err);
    }

    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        if (v != null) request.setHeader(k, String(v));
      }
    }

    request.on('response', (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        // Normalize multi-value headers to single strings
        const headers = {};
        for (const [k, v] of Object.entries(response.headers)) {
          headers[k] = Array.isArray(v) ? v.join(', ') : v;
        }
        resolve({ status: response.statusCode, ok: response.statusCode >= 200 && response.statusCode < 300, body, headers });
      });
      response.on('error', reject);
    });

    request.on('error', reject);
    if (options.body) request.write(options.body);
    request.end();
  });
});

// Open external URLs in the system browser (used by AI settings docs links)
ipcMain.on('open-external', (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

// Credential management IPC ??renderer calls these to read/write safeStorage.
// Passwords stored here never transit IPC again after save: email handlers
// call getCredential() directly from the main process.
ipcMain.handle('keychain:is-available', () => safeStorage.isEncryptionAvailable());
ipcMain.handle('keychain:set', (_event, key, value) => setCredential(key, value));
ipcMain.handle('keychain:get', (_event, key) => getCredential(key));
ipcMain.handle('keychain:delete', (_event, key) => { deleteCredential(key); });

// ---------------------------------------------------------------------------
// File-based Key-Value Storage IPC (FileStorageAdapter backend)
// ---------------------------------------------------------------------------
const storageDir = path.join(userDataDir, 'storage');
fs.mkdirSync(storageDir, { recursive: true });

ipcMain.handle('file-storage:read-all', () => {
  const store = {};
  try {
    const files = fs.readdirSync(storageDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const key = file.slice(0, -5); // remove '.json'
        const content = fs.readFileSync(path.join(storageDir, file), 'utf-8');
        try {
          store[key] = JSON.parse(content);
        } catch (_) {
          store[key] = content;
        }
      }
    }
  } catch (err) {
    console.error('[OmniPlan] file-storage:read-all failed:', err);
  }
  return store;
});

ipcMain.handle('file-storage:set', (_event, key, value) => {
  try {
    const filePath = path.join(storageDir, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), { encoding: 'utf-8', mode: 0o600 });
    return true;
  } catch (err) {
    console.error(`[OmniPlan] file-storage:set failed for key ${key}:`, err);
    return false;
  }
});

ipcMain.handle('file-storage:remove', (_event, key) => {
  try {
    const filePath = path.join(storageDir, `${key}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (err) {
    console.error(`[OmniPlan] file-storage:remove failed for key ${key}:`, err);
    return false;
  }
});

// ---------------------------------------------------------------------------
// Local Llamafile Server Process Management
// ---------------------------------------------------------------------------
const { spawn } = require('child_process');
const modelsDir = path.join(__dirname, 'models');
let activeModelProcess = null;
let activeModelName = null;

ipcMain.handle('local-model:list', async () => {
  try {
    if (!fs.existsSync(modelsDir)) {
      return [];
    }
    const files = fs.readdirSync(modelsDir);
    return files.filter(f => f.endsWith('.exe') || f.endsWith('.llamafile'));
  } catch (err) {
    console.error('[OmniPlan] local-model:list failed:', err);
    return [];
  }
});

ipcMain.handle('local-model:start', async (_event, modelName, port = 8080) => {
  try {
    if (activeModelProcess) {
      console.log(`[OmniPlan] Stopping previous model process: ${activeModelName}`);
      try { activeModelProcess.kill(); } catch (_) {}
      activeModelProcess = null;
      activeModelName = null;
    }

    const modelPath = path.join(modelsDir, modelName);
    console.log(`[OmniPlan] Spawning local model server: ${modelName} on port ${port}`);

    const proc = spawn(modelPath, ['--server', '--port', port.toString(), '--host', '127.0.0.1'], {
      detached: true,
      stdio: 'ignore',
    });

    activeModelProcess = proc;
    activeModelName = modelName;

    proc.on('close', (code) => {
      console.log(`[OmniPlan] Local model server closed with code: ${code}`);
      if (activeModelName === modelName) {
        activeModelProcess = null;
        activeModelName = null;
      }
    });

    proc.on('error', (err) => {
      console.error(`[OmniPlan] Local model server process error:`, err);
    });

    proc.unref();
    return { success: true, port };
  } catch (err) {
    console.error('[OmniPlan] local-model:start failed:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-model:stop', async () => {
  if (activeModelProcess) {
    console.log(`[OmniPlan] Stopping model process manually: ${activeModelName}`);
    try { activeModelProcess.kill(); } catch (_) {}
    activeModelProcess = null;
    activeModelName = null;
    return true;
  }
  return false;
});

ipcMain.handle('local-model:status', async () => {
  return {
    running: activeModelProcess !== null,
    modelName: activeModelName,
  };
});

// One-shot connection test ??accepts credentials inline for the pre-save test
// flow. Does NOT store credentials; caller is responsible for calling
// keychain:set afterwards if the test passes.
ipcMain.handle('email:test-connection', async (_event, { email, password, provider, imapHost, imapPort }) => {
  const opId = makeOpId('email-test');
  console.log(`[email:test ${opId}] provider=${provider} phase=start`);
  try {
    const { ImapFlow } = require('imapflow');
    const hostConfig = IMAP_HOSTS[provider] || { host: imapHost, port: imapPort || 993 };
    const client = new ImapFlow({
      host: hostConfig.host, port: hostConfig.port, secure: true,
      auth: { user: email, pass: password }, logger: false,
    });
    await client.connect();
    console.log(`[email:test ${opId}] phase=connected`);
    await client.logout();
    console.log(`[email:test ${opId}] phase=complete`);
    return { success: true, operationId: opId };
  } catch (error) {
    const code = classifyImapError(error);
    console.error(`[email:test ${opId}] phase=failed code=${code} error="${error.message}"`);
    return { success: false, code, error: error.message, operationId: opId };
  }
});

// Email IMAP handlers
ipcMain.handle('email:fetch', async (_event, account) => {
  const opId = makeOpId('email-fetch');
  console.log(`[email:fetch ${opId}] accountId=${account.id} provider=${account.provider} phase=start`);
  try {
    const { ImapFlow } = require('imapflow');
    const hostConfig = IMAP_HOSTS[account.provider] || { host: account.imapHost, port: account.imapPort || 993 };
    const password = getCredential(`omni_email_pw_${account.id}`);
    if (!password) {
      console.error(`[email:fetch ${opId}] accountId=${account.id} phase=failed code=EMAIL_CREDENTIAL_MISSING`);
      return { success: false, code: 'EMAIL_CREDENTIAL_MISSING', error: 'No stored credentials for this account. Re-enter your password in Settings.', operationId: opId };
    }

    const client = new ImapFlow({
      host: hostConfig.host,
      port: hostConfig.port,
      secure: true,
      auth: { user: account.email, pass: password },
      logger: false,
    });

    await client.connect();
    console.log(`[email:fetch ${opId}] accountId=${account.id} phase=connected`);
    const lock = await client.getMailboxLock('INBOX');
    console.log(`[email:fetch ${opId}] accountId=${account.id} phase=mailbox-open`);
    const emails = [];

    try {
      // Fetch last 50 emails
      const totalMessages = client.mailbox.exists;
      const startSeq = Math.max(1, totalMessages - 49);

      for await (const message of client.fetch(`${startSeq}:*`, {
        envelope: true,
        uid: true,
        flags: true,
      })) {
        emails.push({
          uid: message.uid,
          subject: message.envelope.subject || '(No subject)',
          sender: message.envelope.from?.[0]?.name || message.envelope.from?.[0]?.address || 'Unknown',
          senderEmail: message.envelope.from?.[0]?.address || '',
          date: message.envelope.date?.toISOString() || '',
          read: message.flags.has('\\Seen'),
          preview: '',
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
    console.log(`[email:fetch ${opId}] accountId=${account.id} phase=complete count=${emails.length}`);
    return { success: true, emails: emails.reverse(), operationId: opId };
  } catch (error) {
    const code = classifyImapError(error);
    console.error(`[email:fetch ${opId}] accountId=${account.id} phase=failed code=${code} error="${error.message}"`);
    return { success: false, code, error: error.message, operationId: opId };
  }
});

ipcMain.handle('email:fetch-body', async (_event, account, uid) => {
  const opId = makeOpId('email-body');
  console.log(`[email:body ${opId}] accountId=${account.id} provider=${account.provider} phase=start`);
  try {
    const { ImapFlow } = require('imapflow');
    const { simpleParser } = require('mailparser');
    const hostConfig = IMAP_HOSTS[account.provider] || { host: account.imapHost, port: account.imapPort || 993 };
    const password = getCredential(`omni_email_pw_${account.id}`);
    if (!password) {
      console.error(`[email:body ${opId}] accountId=${account.id} phase=failed code=EMAIL_CREDENTIAL_MISSING`);
      return { success: false, code: 'EMAIL_CREDENTIAL_MISSING', error: 'No stored credentials for this account.', operationId: opId };
    }

    const client = new ImapFlow({
      host: hostConfig.host,
      port: hostConfig.port,
      secure: true,
      auth: { user: account.email, pass: password },
      logger: false,
    });

    await client.connect();
    console.log(`[email:body ${opId}] accountId=${account.id} phase=connected`);
    const lock = await client.getMailboxLock('INBOX');

    let body = '';
    let htmlBody = '';
    try {
      const message = await client.fetchOne(uid, { source: true }, { uid: true });
      if (message?.source) {
        const parsed = await simpleParser(message.source);
        body = parsed.text || '';
        htmlBody = parsed.html || '';
      }
    } finally {
      lock.release();
    }

    await client.logout();
    console.log(`[email:body ${opId}] accountId=${account.id} phase=complete`);
    return { success: true, body, htmlBody, operationId: opId };
  } catch (error) {
    const code = classifyImapError(error);
    console.error(`[email:body ${opId}] accountId=${account.id} phase=failed code=${code} error="${error.message}"`);
    return { success: false, code, error: error.message, operationId: opId };
  }
});
