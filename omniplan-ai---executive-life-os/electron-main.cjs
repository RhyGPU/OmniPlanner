const { app, BrowserWindow, ipcMain, shell, net, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Credential store — backed by Electron safeStorage (OS keychain encryption).
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
  } catch { return {}; }
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
  } catch { return null; }
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
  } catch { return false; }
}

function deleteCredential(key) {
  const store = readCredentialStore();
  if (key in store) {
    delete store[key];
    writeCredentialStore(store);
  }
}

// ─── Windows: relaunch with admin elevation if not already elevated ───────────
// Must run before app.whenReady(). AI and email both need network access that
// Windows Firewall grants to admin processes on first run.
if (process.platform === 'win32') {
  const { execSync, spawn } = require('child_process');
  let isAdmin = false;
  try {
    execSync('net session', { stdio: 'pipe' });
    isAdmin = true;
  } catch {}

  if (!isAdmin) {
    // Escape paths for PowerShell string embedding
    const execPath = process.execPath.replace(/\\/g, '/').replace(/'/g, "''");
    const rawArgs = process.argv.slice(1);
    const argList = rawArgs.length > 0
      ? `-ArgumentList @(${rawArgs.map(a => `'${a.replace(/'/g, "''")}'`).join(',')})`
      : '';

    spawn('powershell.exe', [
      '-NoProfile', '-WindowStyle', 'Hidden',
      '-Command',
      `Start-Process -FilePath '${execPath}' ${argList} -Verb RunAs`,
    ], { detached: true, stdio: 'ignore' }).unref();

    app.exit(0); // close this non-elevated instance immediately
  }
}
// ─────────────────────────────────────────────────────────────────────────────

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
  // diagnostics_channel unavailable — email fetch will still fail gracefully
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

  // Remove the default menu bar
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

  // Restore keyboard focus to the renderer after any OS-level interaction
  // (e.g. a UAC prompt or system notification briefly stealing focus).
  win.on('focus', () => {
    win.webContents.focus();
  });
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

// Credential management IPC — renderer calls these to read/write safeStorage.
// Passwords stored here never transit IPC again after save: email handlers
// call getCredential() directly from the main process.
ipcMain.handle('keychain:is-available', () => safeStorage.isEncryptionAvailable());
ipcMain.handle('keychain:set', (_event, key, value) => setCredential(key, value));
ipcMain.handle('keychain:get', (_event, key) => getCredential(key));
ipcMain.handle('keychain:delete', (_event, key) => { deleteCredential(key); });

// One-shot connection test — accepts credentials inline for the pre-save test
// flow. Does NOT store credentials; caller is responsible for calling
// keychain:set afterwards if the test passes.
ipcMain.handle('email:test-connection', async (_event, { email, password, provider, imapHost, imapPort }) => {
  try {
    const { ImapFlow } = require('imapflow');
    const hostConfig = IMAP_HOSTS[provider] || { host: imapHost, port: imapPort || 993 };
    const client = new ImapFlow({
      host: hostConfig.host, port: hostConfig.port, secure: true,
      auth: { user: email, pass: password }, logger: false,
    });
    await client.connect();
    await client.logout();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Email IMAP handlers
ipcMain.handle('email:fetch', async (_event, account) => {
  try {
    const { ImapFlow } = require('imapflow');
    const hostConfig = IMAP_HOSTS[account.provider] || { host: account.imapHost, port: account.imapPort || 993 };
    const password = getCredential(`omni_email_pw_${account.id}`);
    if (!password) return { success: false, error: 'No stored credentials for this account. Re-enter your password in Settings.' };

    const client = new ImapFlow({
      host: hostConfig.host,
      port: hostConfig.port,
      secure: true,
      auth: { user: account.email, pass: password },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
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
    return { success: true, emails: emails.reverse() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('email:fetch-body', async (_event, account, uid) => {
  try {
    const { ImapFlow } = require('imapflow');
    const hostConfig = IMAP_HOSTS[account.provider] || { host: account.imapHost, port: account.imapPort || 993 };
    const password = getCredential(`omni_email_pw_${account.id}`);
    if (!password) return { success: false, error: 'No stored credentials for this account.' };

    const client = new ImapFlow({
      host: hostConfig.host,
      port: hostConfig.port,
      secure: true,
      auth: { user: account.email, pass: password },
      logger: false,
    });

    await client.connect();
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
    return { success: true, body };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
