const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

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

  if (DEV_URL) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools();
  } else {
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

// Email IMAP handlers
ipcMain.handle('email:fetch', async (_event, account) => {
  try {
    const { ImapFlow } = require('imapflow');
    const hostConfig = IMAP_HOSTS[account.provider] || { host: account.imapHost, port: account.imapPort || 993 };

    const client = new ImapFlow({
      host: hostConfig.host,
      port: hostConfig.port,
      secure: true,
      auth: { user: account.email, pass: account.password },
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

    const client = new ImapFlow({
      host: hostConfig.host,
      port: hostConfig.port,
      secure: true,
      auth: { user: account.email, pass: account.password },
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
