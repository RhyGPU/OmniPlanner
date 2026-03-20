/**
 * Web platform adapter (null / browser fallback implementations).
 *
 * These implementations are selected when window.electronAPI is absent, i.e.
 * the app is running in a plain browser (development, future web shell, or
 * future PWA). They are safe no-ops or degraded equivalents — never throw,
 * never pretend to succeed when they cannot.
 *
 * When a feature is genuinely unavailable, the service returns a clearly
 * falsy result (null, false, empty array) so callers can surface appropriate
 * messaging to the user rather than failing silently.
 */

import type {
  CredentialService,
  EmailService,
  EmailAccountRef,
  EmailTestCredentials,
  NetworkService,
  ShellService,
} from './types';

// ---------------------------------------------------------------------------
// Credential service — unavailable on web
// ---------------------------------------------------------------------------

export const webCredentials: CredentialService = {
  isAvailable(): boolean {
    return false;
  },

  async set(_key: string, _value: string): Promise<boolean> {
    return false; // Caller should fall back to localStorage with a warning
  },

  async get(_key: string): Promise<string | null> {
    return null;
  },

  async delete(_key: string): Promise<void> {
    // No-op
  },
};

// ---------------------------------------------------------------------------
// Email service — unavailable on web
// ---------------------------------------------------------------------------

export const webEmail: EmailService = {
  isAvailable(): boolean {
    return false;
  },

  async fetchEmails(_account: EmailAccountRef) {
    return { success: false, error: 'Email fetching requires the desktop app.' };
  },

  async fetchEmailBody(_account: EmailAccountRef, _uid: string) {
    return { success: false, error: 'Email fetching requires the desktop app.' };
  },

  async testConnection(_creds: EmailTestCredentials) {
    return { success: false, error: 'Email testing requires the desktop app.' };
  },
};

// ---------------------------------------------------------------------------
// Network service — browser fetch (CORS applies)
// ---------------------------------------------------------------------------

export const webNetwork: NetworkService = {
  fetch(url: string, init?: RequestInit): Promise<Response> {
    return fetch(url, init);
  },
};

// ---------------------------------------------------------------------------
// Shell service — limited on web
// ---------------------------------------------------------------------------

export const webShell: ShellService = {
  isAvailable(): boolean {
    return false;
  },

  openExternal(url: string): void {
    // Best-effort fallback; may be blocked by browser popup policy.
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  quit(): void {
    // No-op — cannot quit a browser tab programmatically.
  },
};
