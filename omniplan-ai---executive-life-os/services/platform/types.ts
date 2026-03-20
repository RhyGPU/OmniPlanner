/**
 * Platform service interfaces for OmniPlanner.
 *
 * These interfaces define the contract for capabilities that differ
 * between platforms (Electron desktop, web browser, Capacitor mobile).
 * Domain logic and UI components import these interfaces — never the
 * concrete implementations — so platform-specific code stays isolated.
 *
 * Implementations:
 *   services/platform/electron.ts   — Electron desktop (current production)
 *   services/platform/capacitor.ts  — iOS / Android via Capacitor
 *   services/platform/web.ts        — Web browser / null fallbacks
 *
 * Usage:
 *   import { platform } from '../services/platform';
 *   await platform.credentials.set('my_key', secret);
 */

import type { EmailAccount } from '../../types';

// ---------------------------------------------------------------------------
// Credential storage
// ---------------------------------------------------------------------------

/**
 * Secure credential storage.
 *
 * Electron: OS keychain via safeStorage (AES-256 + OS key derivation).
 * Web: unavailable — callers fall back to localStorage with warning.
 */
export interface CredentialService {
  /**
   * True if this platform implements credential storage at all.
   * Does NOT guarantee keychain hardware is available; use the boolean
   * returned by set() for that.
   */
  isAvailable(): boolean;

  /**
   * Persist a credential. Returns false if OS keychain is unavailable
   * (e.g. Linux without a keyring daemon) — caller should fall back.
   */
  set(key: string, value: string): Promise<boolean>;

  /** Retrieve a credential, or null if absent or service unavailable. */
  get(key: string): Promise<string | null>;

  /** Delete a stored credential. No-op if key does not exist. */
  delete(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Email (IMAP) service
// ---------------------------------------------------------------------------

/** Minimal account shape passed to the email IPC handlers. */
export type EmailAccountRef = Pick<
  EmailAccount,
  'id' | 'email' | 'provider' | 'imapHost' | 'imapPort' | 'enabled'
>;

/** Credentials for a one-shot pre-save connection test. Passwords are NOT stored. */
export interface EmailTestCredentials {
  email: string;
  password: string;
  provider: string;
  imapHost?: string;
  imapPort?: number;
}

/**
 * IMAP email fetching.
 *
 * Electron: handled in main process; passwords are looked up from safeStorage
 *   there — never pass passwords from renderer via this service.
 * Web: unavailable.
 */
export interface EmailService {
  /** True if email fetching is available on this platform. */
  isAvailable(): boolean;

  /** Fetch email headers from an IMAP account. */
  fetchEmails(
    account: EmailAccountRef,
  ): Promise<{ success: boolean; emails?: any[]; error?: string }>;

  /** Fetch the full body of a single email by UID. */
  fetchEmailBody(
    account: EmailAccountRef,
    uid: string,
  ): Promise<{ success: boolean; body?: string; error?: string }>;

  /**
   * One-shot IMAP connection test before an account is saved.
   * Inline credentials only — NOT stored by this call.
   */
  testConnection(
    creds: EmailTestCredentials,
  ): Promise<{ success: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// Network (HTTP) service
// ---------------------------------------------------------------------------

/**
 * HTTP/HTTPS fetch service.
 *
 * Electron: routes through main-process net module (bypasses CORS + Windows Firewall).
 * Web: delegates to browser fetch().
 *
 * Drop-in replacement for fetch() in service code that must work cross-platform.
 */
export interface NetworkService {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

// ---------------------------------------------------------------------------
// Shell / OS integration
// ---------------------------------------------------------------------------

/**
 * OS shell integration (open URLs, quit app, etc.).
 *
 * Electron: full support.
 * Web: limited — openExternal falls back to window.open(); quit() is a no-op.
 */
export interface ShellService {
  /** True when running inside Electron and OS shell APIs are available. */
  isAvailable(): boolean;

  /** Open a URL in the system default browser. */
  openExternal(url: string): void;

  /** Quit the application. No-op on web. */
  quit(): void;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** A single notification to schedule. */
export interface PlannedNotification {
  /** Stable numeric ID. Use constants from notificationScheduler.ts. */
  id: number;
  title: string;
  body: string;
  /** When the notification should fire. */
  scheduledAt: Date;
}

/** Permission state for push / local notifications. */
export type NotificationPermission = 'granted' | 'denied' | 'unavailable' | 'default';

/**
 * Local notification service.
 *
 * Capacitor (mobile): @capacitor/local-notifications — UNCalendarTrigger (iOS),
 *   AlarmManager (Android). Requires explicit permission grant.
 * Web browser: Web Notifications API + setTimeout scheduling. Works in
 *   modern browsers when the tab is open; no persistence across sessions.
 * Electron: Not implemented in Phase 10 — Electron has its own
 *   notification APIs outside this service boundary. nullNotifications is used.
 */
export interface NotificationService {
  /** True if this platform can schedule local notifications at all. */
  isAvailable(): boolean;

  /** Request notification permission from the OS. Returns the resulting state. */
  requestPermission(): Promise<NotificationPermission>;

  /**
   * Schedule a local notification.
   * Returns true if the notification was accepted by the platform.
   */
  schedule(notification: PlannedNotification): Promise<boolean>;

  /** Cancel a previously scheduled notification by ID. */
  cancel(id: number): Promise<void>;

  /** Cancel all notifications scheduled by this app. */
  cancelAll(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

/** All platform-specific service implementations, selected at startup. */
export interface PlatformServices {
  credentials: CredentialService;
  email: EmailService;
  network: NetworkService;
  shell: ShellService;
  notifications: NotificationService;
}
