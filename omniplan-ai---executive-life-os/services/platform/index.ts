/**
 * Platform service factory.
 *
 * Detects the current runtime environment and exports a `platform` singleton
 * with the appropriate adapter implementations for each service interface.
 *
 * Priority order:
 *   1. Electron  — window.electronAPI present (desktop production)
 *   2. Capacitor — globalThis.Capacitor.isNativePlatform() (iOS / Android)
 *   3. Web       — plain browser (development, PWA, progressive web build)
 *
 * Components and service modules import `platform` from here:
 *
 *   import { platform } from '../services/platform';
 *   platform.credentials.set('key', value);
 *   platform.email.fetchEmails(account);
 *   platform.shell.openExternal(url);
 *   await platform.notifications.schedule(notification);
 *
 * Direct access to window.electronAPI or globalThis.Capacitor elsewhere in
 * the codebase is a bug: all platform calls must go through this module.
 */

import { electronCredentials, electronEmail, electronNetwork, electronShell, nullNotifications } from './electron';
import {
  capacitorCredentials,
  capacitorNotifications,
  capacitorShell,
  capacitorEmail,
  capacitorNetwork,
} from './capacitor';
import { webCredentials, webEmail, webNetwork, webShell, webNotifications } from './web';
import type { PlatformServices } from './types';

// Re-export types for consumers that need them
export type {
  CredentialService,
  EmailService,
  EmailAccountRef,
  EmailTestCredentials,
  NetworkService,
  NotificationService,
  NotificationPermission,
  PlannedNotification,
  ShellService,
  PlatformServices,
} from './types';

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

/**
 * True when the app is running inside Electron (preload bridge is present).
 *
 * Single canonical platform check — replaces ad-hoc `window.electronAPI`
 * checks scattered across the codebase.
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

/**
 * True when the app is running inside a Capacitor native container (iOS or Android).
 *
 * Uses the Capacitor global injected by the native layer.  This is false in a
 * plain browser even if the Capacitor packages are installed (the `Capacitor`
 * global is only present when the JS bundle is loaded by the native WebView).
 */
export function isCapacitor(): boolean {
  return (
    typeof (globalThis as any).Capacitor !== 'undefined' &&
    (globalThis as any).Capacitor.isNativePlatform() === true
  );
}

// ---------------------------------------------------------------------------
// Platform service singleton
// ---------------------------------------------------------------------------

/**
 * Platform service singleton.
 *
 * Selected once at module initialisation based on runtime environment.
 * Electron → Capacitor → Web (priority order).
 */
export const platform: PlatformServices = isElectron()
  ? {
      credentials: electronCredentials,
      email: electronEmail,
      network: electronNetwork,
      shell: electronShell,
      notifications: nullNotifications,
    }
  : isCapacitor()
    ? {
        credentials: capacitorCredentials,
        email: capacitorEmail,
        network: capacitorNetwork,
        shell: capacitorShell,
        notifications: capacitorNotifications,
      }
    : {
        credentials: webCredentials,
        email: webEmail,
        network: webNetwork,
        shell: webShell,
        notifications: webNotifications,
      };
