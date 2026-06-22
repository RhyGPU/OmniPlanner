const { app, BrowserWindow, ipcMain, shell, net, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('OmniPlanner');
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

  // Allow renderer fetch() to reach external AI and IMAP APIs.
  // Without this, Electron's default file:// CSP blocks outbound connections.
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https:; connect-src *;"
        ],
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

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  return win;
}

app.whenReady().then(createWindow);

app.on('second-instance', focusMainWindow);

app.on('before-quit', (event) => {
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
  if (process.platform !== 'darwin') app.quit();
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
  app.quit();
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
    try {
      const message = await client.fetchOne(uid, { source: true }, { uid: true });
      if (message?.source) {
        // Simple text extraction from raw email source
        const source = message.source.toString();
        // Try to extract plain text body
        const textMatch = source.match(/Content-Type:\s*text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);
        if (textMatch) {
          body = textMatch[1].replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        } else {
          // Fallback: strip HTML tags
          const htmlMatch = source.match(/Content-Type:\s*text\/html[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);
          if (htmlMatch) {
            body = htmlMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          } else {
            // Last resort: everything after headers
            const headerEnd = source.indexOf('\r\n\r\n');
            body = headerEnd > -1 ? source.substring(headerEnd + 4) : source;
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    console.log(`[email:body ${opId}] accountId=${account.id} phase=complete`);
    return { success: true, body, operationId: opId };
  } catch (error) {
    const code = classifyImapError(error);
    console.error(`[email:body ${opId}] accountId=${account.id} phase=failed code=${code} error="${error.message}"`);
    return { success: false, code, error: error.message, operationId: opId };
  }
});
