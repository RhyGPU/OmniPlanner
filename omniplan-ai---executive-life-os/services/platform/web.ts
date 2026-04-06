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
  NotificationService,
  NotificationPermission,
  PlannedNotification,
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

  async startOAuthLogin(_params) {
    return {
      success: false,
      code: 'EMAIL_OAUTH_PLATFORM_UNAVAILABLE',
      error: 'Sign-in with a provider account requires the desktop app.',
      phase: 'availability',
    };
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

// ---------------------------------------------------------------------------
// Notification service — Web Notifications API + setTimeout scheduling
// ---------------------------------------------------------------------------
//
// Only works while the tab is open.  Notifications do not persist across
// browser restarts.  Users must grant Notification permission.
// This is best-effort for the web/PWA shell; the full experience requires
// the Capacitor native build.

/** Tracks setTimeout handles so we can cancel them. */
const _webNotifTimers = new Map<number, ReturnType<typeof setTimeout>>();

export const webNotifications: NotificationService = {
  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  },

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isAvailable()) return 'unavailable';
    try {
      const result = await Notification.requestPermission();
      return result as NotificationPermission;
    } catch {
      return 'unavailable';
    }
  },

  async schedule(notification: PlannedNotification): Promise<boolean> {
    if (!this.isAvailable()) return false;
    if (Notification.permission !== 'granted') return false;

    const delayMs = notification.scheduledAt.getTime() - Date.now();
    if (delayMs < 0) return false; // already in the past

    // Clear any existing timer for this ID
    const existing = _webNotifTimers.get(notification.id);
    if (existing !== undefined) clearTimeout(existing);

    const handle = setTimeout(() => {
      _webNotifTimers.delete(notification.id);
      new Notification(notification.title, { body: notification.body });
    }, delayMs);

    _webNotifTimers.set(notification.id, handle);
    return true;
  },

  async cancel(id: number): Promise<void> {
    const handle = _webNotifTimers.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      _webNotifTimers.delete(id);
    }
  },

  async cancelAll(): Promise<void> {
    for (const handle of _webNotifTimers.values()) {
      clearTimeout(handle);
    }
    _webNotifTimers.clear();
  },
};
