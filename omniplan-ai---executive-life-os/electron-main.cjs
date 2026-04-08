const { app, BrowserWindow, ipcMain, shell, net, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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

// ---------------------------------------------------------------------------
// Email diagnostics helpers
// ---------------------------------------------------------------------------

/**
 * Classify an imapflow error into a stable email error code string.
 * These string values must match EmailErrorCode in services/email/errors.ts.
 * Never include credentials or message bodies in log output.
 */
function classifyImapError(error) {
  // Null-safe extraction — error may be a non-Error object or null
  const msg = (error && error.message) ? error.message.toLowerCase() : '';
  const code = (error && error.code) ? String(error.code) : '';

  // Network / connectivity — check error.code first (most reliable)
  if (code === 'ENOTFOUND' || msg.includes('getaddrinfo')) return 'EMAIL_DNS_FAILURE';
  if (code === 'ECONNREFUSED') return 'EMAIL_CONNECTION_REFUSED';
  if (code === 'ETIMEDOUT' || msg.includes('timed out') || msg.includes('timeout')) return 'EMAIL_NETWORK_TIMEOUT';
  if (code === 'ECONNRESET' || code === 'EHOSTUNREACH') return 'EMAIL_NETWORK_TIMEOUT';
  if (msg.includes('certificate') || msg.includes('ssl') || msg.includes('tls handshake')) return 'EMAIL_TLS_HANDSHAKE_FAILED';

  // Authentication — order matters: app password hint before generic auth fail
  if (msg.includes('app-specific password') || msg.includes('application-specific')) return 'EMAIL_APP_PASSWORD_REQUIRED';
  if (msg.includes('imap access disabled') || msg.includes('imap is disabled')) return 'EMAIL_IMAP_DISABLED';
  if (msg.includes('authenticationfailed') || msg.includes('[authorizationfailed]') || msg.includes('auth failed')) return 'EMAIL_AUTH_FAILED';
  if (msg.includes('locked') || msg.includes('too many login')) return 'EMAIL_AUTH_LOCKED';

  // Protocol / mailbox
  if (msg.includes('select') && msg.includes('fail')) return 'EMAIL_IMAP_SELECT_FAILED';
  if (msg.includes('mailbox') && (msg.includes('not found') || msg.includes('does not exist'))) return 'EMAIL_MAILBOX_NOT_FOUND';

  return 'EMAIL_IMAP_FETCH_FAILED';
}

/**
 * Best-effort IMAP client cleanup after a failure.
 * Uses close() rather than logout() because logout() requires a live server
 * round-trip and may itself throw if the connection is already broken.
 * Logs cleanup errors separately so they never mask the primary failure.
 */
async function safeImapClose(client, opId, context) {
  if (!client) return;
  try {
    await client.close();
  } catch (cleanupErr) {
    const cleanupMsg = (cleanupErr && cleanupErr.message) ? cleanupErr.message : String(cleanupErr);
    console.error(`[${context} ${opId}] cleanup-error msg="${cleanupMsg}"`);
  }
}

/** Generate a short operation ID for correlating logs with user reports. */
function makeOpId(prefix) {
  return `${prefix}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// IMAP auth helper — supports both app-password and OAuth access-token paths
// ---------------------------------------------------------------------------

/**
 * Resolve the ImapFlow `auth` object for an account.
 * Returns null if the required credential is missing from safeStorage.
 *
 * - authMethod 'oauth' (or undefined-treated-as-password with oauth key):
 *     { user, accessToken } — ImapFlow uses XOAUTH2 automatically
 * - authMethod 'imap_password' or absent:
 *     { user, pass } — standard PLAIN/LOGIN authentication
 *
 * Never logs or returns raw credentials.
 */
function getImapAuth(account) {
  if (account.authMethod === 'oauth') {
    const accessToken = getCredential(`omni_email_oauth_access_${account.id}`);
    if (!accessToken) return null;
    return { user: account.email, accessToken };
  }
  const password = getCredential(`omni_email_pw_${account.id}`);
  if (!password) return null;
  return { user: account.email, pass: password };
}

// ---------------------------------------------------------------------------
// OAuth 2.0 PKCE helpers — desktop-only
//
// Supported providers use XOAUTH2 for IMAP authentication.
// Client IDs must be set via environment variables before packaging:
//
//   GOOGLE_OAUTH_CLIENT_ID    — from Google Cloud Console (Desktop app type)
//   MICROSOFT_OAUTH_CLIENT_ID — from Azure App Registration (mobile/desktop)
//
// Client secrets are NOT required: PKCE eliminates the need for them in
// public clients. Never add a client secret to this file.
// ---------------------------------------------------------------------------

const OAUTH_REDIRECT_URI = 'omniplanner://oauth/callback';
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const OAUTH_CLIENTS = {
  google: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userinfoUrl: 'https://www.googleapis.com/oauth2/v1/userinfo',
    scopes: ['https://mail.google.com/'],
    // Google requires access_type=offline to receive a refresh token
    extraParams: { access_type: 'offline', prompt: 'consent' },
  },
  microsoft: {
    clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID || '',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userinfoUrl: 'https://graph.microsoft.com/v1.0/me',
    scopes: ['https://outlook.office.com/IMAP.AccessAsUser.All', 'offline_access', 'User.Read'],
    extraParams: {},
  },
};

/** Generate a PKCE code_verifier + code_challenge (S256) pair. */
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * One active OAuth flow at a time.
 * Stored as { resolve, verifier, opId, providerKey, accountId, timeoutHandle }.
 */
let _oauthPending = null;

/**
 * Dispatch an OAuth callback URL to the active pending flow.
 * Called from app.on('open-url') on macOS/Linux and from the
 * second-instance handler on Windows.
 */
function handleOAuthCallback(callbackUrl) {
  if (!_oauthPending) {
    console.warn('[email:oauth] Protocol callback received but no active OAuth flow — ignoring.');
    return;
  }

  const { resolve, verifier, opId, providerKey, accountId, timeoutHandle } = _oauthPending;
  _oauthPending = null;
  clearTimeout(timeoutHandle);

  let parsedUrl;
  try {
    parsedUrl = new URL(callbackUrl);
  } catch {
    console.error(`[email:oauth ${opId}] Malformed callback URL`);
    resolve({ success: false, code: 'EMAIL_OAUTH_CALLBACK_FAILED', operationId: opId, phase: 'callback' });
    return;
  }

  const callbackError = parsedUrl.searchParams.get('error');
  const authCode = parsedUrl.searchParams.get('code');

  if (callbackError) {
    const errCode = callbackError === 'access_denied' ? 'EMAIL_OAUTH_CANCELLED' : 'EMAIL_OAUTH_CALLBACK_FAILED';
    console.error(`[email:oauth ${opId}] provider=${providerKey} callback-error=${callbackError} code=${errCode}`);
    resolve({ success: false, code: errCode, operationId: opId, phase: 'callback' });
    return;
  }

  if (!authCode) {
    console.error(`[email:oauth ${opId}] provider=${providerKey} callback missing code`);
    resolve({ success: false, code: 'EMAIL_OAUTH_CALLBACK_FAILED', operationId: opId, phase: 'callback' });
    return;
  }

  exchangeCodeForTokens(providerKey, authCode, verifier, accountId, opId)
    .then(result => resolve(result))
    .catch(err => {
      const errMsg = (err && err.message) ? err.message : String(err);
      console.error(`[email:oauth ${opId}] exchangeCodeForTokens threw unexpectedly: ${errMsg}`);
      resolve({ success: false, code: 'EMAIL_OAUTH_TOKEN_EXCHANGE_FAILED', error: 'Token exchange failed.', operationId: opId, phase: 'token-exchange' });
    });
}

/** Simple HTTPS POST via Electron net module — avoids CORS and returns parsed JSON. */
function makeNetPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'POST', url, redirect: 'follow' });
    for (const [k, v] of Object.entries(headers || {})) req.setHeader(k, String(v));
    const chunks = [];
    req.on('response', res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf-8')) }); }
        catch { resolve({ status: res.statusCode, data: null }); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Simple HTTPS GET via Electron net module — returns parsed JSON. */
function makeNetGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url, redirect: 'follow' });
    for (const [k, v] of Object.entries(headers || {})) req.setHeader(k, String(v));
    const chunks = [];
    req.on('response', res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf-8')) }); }
        catch { resolve({ status: res.statusCode, data: null }); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Exchange an OAuth authorization code for access/refresh tokens,
 * fetch the user's email address, and persist tokens in safeStorage.
 * Returns a structured result — never throws.
 */
async function exchangeCodeForTokens(providerKey, authCode, verifier, accountId, opId) {
  const client = OAUTH_CLIENTS[providerKey];
  if (!client || !client.clientId) {
    console.error(`[email:oauth ${opId}] No client ID configured for provider "${providerKey}"`);
    return { success: false, code: 'EMAIL_OAUTH_PROVIDER_UNSUPPORTED', operationId: opId, phase: 'token-exchange' };
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    redirect_uri: OAUTH_REDIRECT_URI,
    client_id: client.clientId,
    code_verifier: verifier,
  }).toString();

  let tokenResp;
  try {
    tokenResp = await makeNetPost(
      client.tokenUrl,
      body,
      { 'Content-Type': 'application/x-www-form-urlencoded' },
    );
  } catch (err) {
    const errMsg = (err && err.message) ? err.message : String(err);
    console.error(`[email:oauth ${opId}] token POST failed: ${errMsg}`);
    return { success: false, code: 'EMAIL_OAUTH_TOKEN_EXCHANGE_FAILED', error: 'Token request failed.', operationId: opId, phase: 'token-exchange' };
  }

  const tokenData = tokenResp && tokenResp.data;
  if (!tokenData || !tokenData.access_token) {
    const apiErr = (tokenData && tokenData.error) ? tokenData.error : `HTTP ${tokenResp && tokenResp.status}`;
    console.error(`[email:oauth ${opId}] token response error: ${apiErr}`);
    const errCode = (tokenData && tokenData.error === 'access_denied') ? 'EMAIL_OAUTH_SCOPE_DENIED' : 'EMAIL_OAUTH_TOKEN_EXCHANGE_FAILED';
    return { success: false, code: errCode, error: `Provider error: ${apiErr}`, operationId: opId, phase: 'token-exchange' };
  }

  // Fetch user email from provider userinfo endpoint
  let userEmail = '';
  try {
    const userinfoResp = await makeNetGet(client.userinfoUrl, { Authorization: `Bearer ${tokenData.access_token}` });
    const info = userinfoResp && userinfoResp.data;
    // Google returns { email }, Microsoft returns { mail } or { userPrincipalName }
    userEmail = (info && (info.email || info.mail || info.userPrincipalName)) || '';
  } catch (err) {
    const errMsg = (err && err.message) ? err.message : String(err);
    console.error(`[email:oauth ${opId}] userinfo request failed (non-fatal): ${errMsg}`);
    // Non-fatal — token exchange succeeded; user can confirm/edit email in the UI
  }

  // Store access token in safeStorage
  const stored = setCredential(`omni_email_oauth_access_${accountId}`, tokenData.access_token);
  if (!stored) {
    console.error(`[email:oauth ${opId}] safeStorage unavailable — cannot persist OAuth access token`);
    return { success: false, code: 'EMAIL_OAUTH_STORAGE_FAILED', operationId: opId, phase: 'token-storage' };
  }

  // Refresh token is optional on first grant for some providers
  if (tokenData.refresh_token) {
    setCredential(`omni_email_oauth_refresh_${accountId}`, tokenData.refresh_token);
  }

  console.log(`[email:oauth ${opId}] provider=${providerKey} accountId=${accountId} phase=complete`);
  return { success: true, email: userEmail, accountId, operationId: opId };
}

// ---------------------------------------------------------------------------
// OAuth token lifecycle helpers — Phase 21-C
// ---------------------------------------------------------------------------

/**
 * Map an email provider key to an OAUTH_CLIENTS key.
 * Returns null for providers that do not support OAuth.
 */
function getOAuthClientKey(provider) {
  const map = { gmail: 'google', outlook: 'microsoft' };
  return map[provider] || null;
}

/**
 * Returns true when an IMAP error code warrants a single token-refresh attempt
 * for OAuth-backed accounts.
 *
 * Only EMAIL_AUTH_FAILED is eligible: it is the canonical IMAP signal that
 * the server rejected our credentials, which for XOAUTH2 means the access
 * token may be expired. Network, TLS, and mailbox errors are never eligible.
 */
function shouldAttemptOAuthRefresh(errorCode) {
  return errorCode === 'EMAIL_AUTH_FAILED';
}

/**
 * Attempt to refresh the OAuth access token for an account using the stored
 * refresh token. On success, the new access token is written back to
 * safeStorage so the next getImapAuth() call will use it.
 *
 * Returns { success: true } on success.
 * Returns { success: false, code } on any failure — never throws.
 * Never logs tokens or refresh tokens.
 */
async function refreshOAuthToken(accountId, providerKey, opId) {
  const client = OAUTH_CLIENTS[providerKey];
  if (!client || !client.clientId) {
    console.error(`[email:oauth ${opId}] refresh: no client config for providerKey="${providerKey}"`);
    return { success: false, code: 'EMAIL_OAUTH_PROVIDER_UNSUPPORTED' };
  }

  const refreshToken = getCredential(`omni_email_oauth_refresh_${accountId}`);
  if (!refreshToken) {
    console.error(`[email:oauth ${opId}] accountId=${accountId} phase=oauth-refresh no refresh token stored`);
    return { success: false, code: 'EMAIL_OAUTH_REFRESH_UNAVAILABLE' };
  }

  console.log(`[email:oauth ${opId}] accountId=${accountId} provider=${providerKey} phase=oauth-refresh start`);

  const params = {
    grant_type: 'refresh_token',
    client_id: client.clientId,
    refresh_token: refreshToken,
  };
  // Microsoft requires the scope in the refresh request; Google accepts it too
  if (client.scopes && client.scopes.length > 0) {
    params.scope = client.scopes.join(' ');
  }

  let tokenResp;
  try {
    tokenResp = await makeNetPost(
      client.tokenUrl,
      new URLSearchParams(params).toString(),
      { 'Content-Type': 'application/x-www-form-urlencoded' },
    );
  } catch (err) {
    const errMsg = (err && err.message) ? err.message : String(err);
    console.error(`[email:oauth ${opId}] accountId=${accountId} phase=oauth-refresh POST failed: ${errMsg}`);
    return { success: false, code: 'EMAIL_OAUTH_REFRESH_FAILED' };
  }

  const tokenData = tokenResp && tokenResp.data;
  if (!tokenData || !tokenData.access_token) {
    const apiErr = (tokenData && tokenData.error) || `HTTP ${tokenResp && tokenResp.status}`;
    console.error(`[email:oauth ${opId}] accountId=${accountId} phase=oauth-refresh response error="${apiErr}"`);
    // invalid_grant means the refresh token itself is expired or revoked — user must re-authenticate
    const needsReauth = tokenData && (tokenData.error === 'invalid_grant' || tokenData.error === 'token_expired');
    return { success: false, code: needsReauth ? 'EMAIL_OAUTH_REAUTH_REQUIRED' : 'EMAIL_OAUTH_REFRESH_INVALID' };
  }

  const stored = setCredential(`omni_email_oauth_access_${accountId}`, tokenData.access_token);
  if (!stored) {
    console.error(`[email:oauth ${opId}] accountId=${accountId} phase=oauth-refresh safeStorage write failed`);
    return { success: false, code: 'EMAIL_OAUTH_STORAGE_FAILED' };
  }

  // Some providers (Google) rotate the refresh token on use
  if (tokenData.refresh_token) {
    setCredential(`omni_email_oauth_refresh_${accountId}`, tokenData.refresh_token);
  }

  console.log(`[email:oauth ${opId}] accountId=${accountId} provider=${providerKey} phase=oauth-refresh complete`);
  return { success: true };
}

/**
 * Core IMAP fetch-headers operation, extracted so it can be called a second
 * time after a token refresh without duplicating the handler boilerplate.
 *
 * isRetry: true on the post-refresh attempt; used only for log tagging.
 * Never throws — always returns a structured result.
 */
async function doEmailFetch(account, opId, isRetry) {
  const tag = isRetry ? 'fetch-retry' : 'fetch';
  let phase = 'credentials';
  let client;
  try {
    const { ImapFlow } = require('imapflow');
    const hostConfig = IMAP_HOSTS[account.provider] || { host: account.imapHost, port: account.imapPort || 993 };

    const imapAuth = getImapAuth(account);
    if (!imapAuth) {
      console.error(`[email:${tag} ${opId}] accountId=${account.id} authMethod=${account.authMethod || 'imap_password'} phase=failed code=EMAIL_CREDENTIAL_MISSING`);
      return { success: false, code: 'EMAIL_CREDENTIAL_MISSING', error: 'No stored credentials for this account. Re-enter your password in Settings.', operationId: opId, phase };
    }

    client = new ImapFlow({
      host: hostConfig.host,
      port: hostConfig.port,
      secure: true,
      auth: imapAuth,
      logger: false,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });

    client.on('error', (socketErr) => {
      const socketCode = classifyImapError(socketErr);
      const socketMsg = (socketErr && socketErr.message) ? socketErr.message : String(socketErr);
      console.error(`[email:${tag} ${opId}] accountId=${account.id} socket-level-error code=${socketCode} phase=${phase} msg="${socketMsg}"`);
    });

    phase = 'connect';
    await client.connect();
    console.log(`[email:${tag} ${opId}] accountId=${account.id} phase=connected`);

    phase = 'mailbox-open';
    const lock = await client.getMailboxLock('INBOX');
    console.log(`[email:${tag} ${opId}] accountId=${account.id} phase=mailbox-open`);
    const emails = [];

    try {
      phase = 'fetch';
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

    phase = 'logout';
    try {
      await client.logout();
    } catch (logoutErr) {
      const logoutMsg = (logoutErr && logoutErr.message) ? logoutErr.message : String(logoutErr);
      console.error(`[email:${tag} ${opId}] accountId=${account.id} cleanup-error phase=logout msg="${logoutMsg}"`);
    }

    console.log(`[email:${tag} ${opId}] accountId=${account.id} phase=complete count=${emails.length}`);
    return { success: true, emails: emails.reverse(), operationId: opId };
  } catch (error) {
    const code = classifyImapError(error);
    const errMsg = (error && error.message) ? error.message : String(error);
    console.error(`[email:${tag} ${opId}] accountId=${account.id} phase=failed code=${code} failPhase=${phase} error="${errMsg}"`);
    await safeImapClose(client, opId, `email:${tag}`);
    return { success: false, code, error: errMsg, operationId: opId, phase };
  }
}

/**
 * Core IMAP fetch-body operation, extracted for the same reason as doEmailFetch.
 */
async function doEmailFetchBody(account, uid, opId, isRetry) {
  const tag = isRetry ? 'body-retry' : 'body';
  let phase = 'credentials';
  let client;
  try {
    const { ImapFlow } = require('imapflow');
    const hostConfig = IMAP_HOSTS[account.provider] || { host: account.imapHost, port: account.imapPort || 993 };

    const imapAuth = getImapAuth(account);
    if (!imapAuth) {
      console.error(`[email:${tag} ${opId}] accountId=${account.id} authMethod=${account.authMethod || 'imap_password'} phase=failed code=EMAIL_CREDENTIAL_MISSING`);
      return { success: false, code: 'EMAIL_CREDENTIAL_MISSING', error: 'No stored credentials for this account.', operationId: opId, phase };
    }

    client = new ImapFlow({
      host: hostConfig.host,
      port: hostConfig.port,
      secure: true,
      auth: imapAuth,
      logger: false,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });

    client.on('error', (socketErr) => {
      const socketCode = classifyImapError(socketErr);
      const socketMsg = (socketErr && socketErr.message) ? socketErr.message : String(socketErr);
      console.error(`[email:${tag} ${opId}] accountId=${account.id} socket-level-error code=${socketCode} phase=${phase} msg="${socketMsg}"`);
    });

    phase = 'connect';
    await client.connect();
    console.log(`[email:${tag} ${opId}] accountId=${account.id} phase=connected`);

    phase = 'mailbox-open';
    const lock = await client.getMailboxLock('INBOX');

    let body = '';
    try {
      phase = 'fetch';
      const message = await client.fetchOne(uid, { source: true }, { uid: true });
      if (message?.source) {
        phase = 'parse';
        const source = message.source.toString();
        const textMatch = source.match(/Content-Type:\s*text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);
        if (textMatch) {
          body = textMatch[1].replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        } else {
          const htmlMatch = source.match(/Content-Type:\s*text\/html[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);
          if (htmlMatch) {
            body = htmlMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          } else {
            const headerEnd = source.indexOf('\r\n\r\n');
            body = headerEnd > -1 ? source.substring(headerEnd + 4) : source;
          }
        }
      }
    } finally {
      lock.release();
    }

    phase = 'logout';
    try {
      await client.logout();
    } catch (logoutErr) {
      const logoutMsg = (logoutErr && logoutErr.message) ? logoutErr.message : String(logoutErr);
      console.error(`[email:${tag} ${opId}] accountId=${account.id} cleanup-error phase=logout msg="${logoutMsg}"`);
    }

    console.log(`[email:${tag} ${opId}] accountId=${account.id} phase=complete`);
    return { success: true, body, operationId: opId };
  } catch (error) {
    const code = classifyImapError(error);
    const errMsg = (error && error.message) ? error.message : String(error);
    console.error(`[email:${tag} ${opId}] accountId=${account.id} phase=failed code=${code} failPhase=${phase} error="${errMsg}"`);
    await safeImapClose(client, opId, `email:${tag}`);
    return { success: false, code, error: errMsg, operationId: opId, phase };
  }
}

// ---------------------------------------------------------------------------
// OAuth 2.0 protocol registration — must run before app.whenReady()
//
// Registers `omniplanner://` as this app's custom URL scheme so the OS
// redirects the provider's callback URL back to this process.
//
// macOS / Linux: the callback fires via app.on('open-url', ...) below.
// Windows:       the callback opens a second instance; the second-instance
//                handler below forwards the URL here and then quits.
// ---------------------------------------------------------------------------

app.setAsDefaultProtocolClient('omniplanner');

// macOS / Linux: receive the OAuth callback URL in this process
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith('omniplanner://oauth/callback')) {
    handleOAuthCallback(url);
  }
});

// Windows: a second app instance is launched with the callback URL as argv.
// requestSingleInstanceLock makes the OS forward that URL to this instance
// via the second-instance event instead of actually starting a new process.
// The lock is intentionally Windows-only to avoid interfering with dev tooling
// on macOS/Linux where open-url is the correct mechanism.
if (process.platform === 'win32') {
  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    // This is the redundant second instance created by Windows for the callback.
    app.quit();
  }
}

app.on('second-instance', (_event, argv) => {
  const oauthUrl = argv.find(a => typeof a === 'string' && a.startsWith('omniplanner://oauth/callback'));
  if (oauthUrl) handleOAuthCallback(oauthUrl);
  // Restore and focus the main window so the user sees the result
  const [mainWin] = BrowserWindow.getAllWindows();
  if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
});

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

// Pre-configured IMAP hosts for known providers.
// Must stay in sync with PROVIDER_CAPABILITIES in services/email/providers.ts.
const IMAP_HOSTS = {
  gmail:   { host: 'imap.gmail.com',          port: 993 },
  outlook: { host: 'outlook.office365.com',    port: 993 },
  yahoo:   { host: 'imap.mail.yahoo.com',      port: 993 },
  naver:   { host: 'imap.naver.com',           port: 993 },
  daum:    { host: 'imap.daum.net',            port: 993 },
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

// OAuth 2.0 PKCE login handler.
// Opens the system browser, waits for the omniplanner:// callback (up to 5 min),
// exchanges the code for tokens, stores them in safeStorage, and resolves with
// { success, email, accountId }. Tokens are NEVER returned to the renderer.
ipcMain.handle('email:oauth-start', async (_event, { provider, accountId }) => {
  const opId = makeOpId('email-oauth');
  console.log(`[email:oauth ${opId}] provider=${provider} accountId=${accountId} phase=start`);

  // Map email provider to OAuth provider key
  const providerKeyMap = { gmail: 'google', outlook: 'microsoft' };
  const oauthProviderKey = providerKeyMap[provider] || null;
  if (!oauthProviderKey) {
    return { success: false, code: 'EMAIL_OAUTH_PROVIDER_UNSUPPORTED', error: `Provider "${provider}" does not support OAuth login.`, operationId: opId, phase: 'availability' };
  }

  const client = OAUTH_CLIENTS[oauthProviderKey];
  if (!client.clientId) {
    console.error(`[email:oauth ${opId}] GOOGLE_OAUTH_CLIENT_ID / MICROSOFT_OAUTH_CLIENT_ID not set`);
    return { success: false, code: 'EMAIL_OAUTH_PROVIDER_UNSUPPORTED', error: 'OAuth is not configured for this provider. Use an app password instead.', operationId: opId, phase: 'availability' };
  }

  // Cancel any previous pending flow so the promise doesn't hang indefinitely
  if (_oauthPending) {
    console.warn(`[email:oauth ${opId}] Superseding previous pending OAuth flow ${_oauthPending.opId}`);
    clearTimeout(_oauthPending.timeoutHandle);
    _oauthPending.resolve({ success: false, code: 'EMAIL_OAUTH_CANCELLED', operationId: _oauthPending.opId, phase: 'superseded' });
    _oauthPending = null;
  }

  return new Promise((resolve) => {
    const { verifier, challenge } = generatePKCE();

    const params = new URLSearchParams({
      client_id: client.clientId,
      response_type: 'code',
      redirect_uri: OAUTH_REDIRECT_URI,
      scope: client.scopes.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...client.extraParams,
    });

    const authUrl = `${client.authUrl}?${params.toString()}`;

    const timeoutHandle = setTimeout(() => {
      if (_oauthPending && _oauthPending.opId === opId) {
        _oauthPending = null;
        console.error(`[email:oauth ${opId}] provider=${oauthProviderKey} phase=timeout`);
        resolve({ success: false, code: 'EMAIL_OAUTH_CANCELLED', error: 'Sign-in timed out. Try again.', operationId: opId, phase: 'callback' });
      }
    }, OAUTH_TIMEOUT_MS);

    _oauthPending = { resolve, verifier, opId, providerKey: oauthProviderKey, accountId, timeoutHandle };

    console.log(`[email:oauth ${opId}] provider=${oauthProviderKey} phase=browser-open`);
    shell.openExternal(authUrl);
  });
});

// One-shot connection test — accepts credentials inline for the pre-save test
// flow. Does NOT store credentials; caller is responsible for calling
// keychain:set afterwards if the test passes.
ipcMain.handle('email:test-connection', async (_event, { email, password, provider, imapHost, imapPort }) => {
  const opId = makeOpId('email-test');
  let phase = 'availability';
  console.log(`[email:test ${opId}] provider=${provider} phase=start`);
  let client;
  try {
    const { ImapFlow } = require('imapflow');
    const hostConfig = IMAP_HOSTS[provider] || { host: imapHost, port: imapPort || 993 };

    client = new ImapFlow({
      host: hostConfig.host, port: hostConfig.port, secure: true,
      auth: { user: email, pass: password }, logger: false,
      // Prevent indefinite hangs on unresponsive servers
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });

    // Absorb socket-level error events that fire outside the main async chain.
    // Without this listener, an unexpected socket error after connect() would
    // become an uncaught exception in the main process.
    client.on('error', (socketErr) => {
      const socketCode = classifyImapError(socketErr);
      const socketMsg = (socketErr && socketErr.message) ? socketErr.message : String(socketErr);
      console.error(`[email:test ${opId}] socket-level-error code=${socketCode} phase=${phase} msg="${socketMsg}"`);
    });

    phase = 'connect';
    await client.connect();
    console.log(`[email:test ${opId}] phase=connected`);

    phase = 'logout';
    try {
      await client.logout();
    } catch (logoutErr) {
      const logoutMsg = (logoutErr && logoutErr.message) ? logoutErr.message : String(logoutErr);
      console.error(`[email:test ${opId}] cleanup-error phase=logout msg="${logoutMsg}"`);
      // Connection test succeeded even if logout is noisy — the server accepted credentials
    }

    console.log(`[email:test ${opId}] phase=complete`);
    return { success: true, operationId: opId };
  } catch (error) {
    const code = classifyImapError(error);
    const errMsg = (error && error.message) ? error.message : String(error);
    console.error(`[email:test ${opId}] phase=failed code=${code} failPhase=${phase} error="${errMsg}"`);
    await safeImapClose(client, opId, 'email:test');
    return { success: false, code, error: errMsg, operationId: opId, phase };
  }
});

// ---------------------------------------------------------------------------
// Email IMAP handlers — each delegates to a doEmail* helper and applies
// one token-refresh + one retry for OAuth-backed accounts on auth failure.
// ---------------------------------------------------------------------------

ipcMain.handle('email:fetch', async (_event, account) => {
  const opId = makeOpId('email-fetch');
  console.log(`[email:fetch ${opId}] accountId=${account.id} provider=${account.provider} authMethod=${account.authMethod || 'imap_password'} phase=start`);

  const firstResult = await doEmailFetch(account, opId, false);
  if (firstResult.success) return firstResult;

  // OAuth accounts only: one token refresh + one retry on IMAP auth failure.
  // Do not attempt refresh for network, TLS, or mailbox errors.
  if (account.authMethod === 'oauth' && shouldAttemptOAuthRefresh(firstResult.code)) {
    const providerKey = getOAuthClientKey(account.provider);
    if (providerKey) {
      const refreshResult = await refreshOAuthToken(account.id, providerKey, opId);
      if (refreshResult.success) {
        console.log(`[email:fetch ${opId}] accountId=${account.id} phase=oauth-retry`);
        return doEmailFetch(account, opId, true);
      }
      console.error(`[email:fetch ${opId}] accountId=${account.id} oauth-refresh-failed code=${refreshResult.code}`);
      return { success: false, code: refreshResult.code, error: 'OAuth token refresh failed.', operationId: opId, phase: 'oauth-refresh' };
    }
  }

  return firstResult;
});

ipcMain.handle('email:fetch-body', async (_event, account, uid) => {
  const opId = makeOpId('email-body');
  console.log(`[email:body ${opId}] accountId=${account.id} provider=${account.provider} authMethod=${account.authMethod || 'imap_password'} phase=start`);

  const firstResult = await doEmailFetchBody(account, uid, opId, false);
  if (firstResult.success) return firstResult;

  if (account.authMethod === 'oauth' && shouldAttemptOAuthRefresh(firstResult.code)) {
    const providerKey = getOAuthClientKey(account.provider);
    if (providerKey) {
      const refreshResult = await refreshOAuthToken(account.id, providerKey, opId);
      if (refreshResult.success) {
        console.log(`[email:body ${opId}] accountId=${account.id} phase=oauth-retry`);
        return doEmailFetchBody(account, uid, opId, true);
      }
      console.error(`[email:body ${opId}] accountId=${account.id} oauth-refresh-failed code=${refreshResult.code}`);
      return { success: false, code: refreshResult.code, error: 'OAuth token refresh failed.', operationId: opId, phase: 'oauth-refresh' };
    }
  }

  return firstResult;
});
