/**
 * Capacitor platform adapter — iOS and Android via @capacitor/core.
 *
 * CREDENTIAL SECURITY WARNING:
 *   @capacitor/preferences uses NSUserDefaults (iOS) and SharedPreferences
 *   (Android).  These storage backends are app-sandboxed but are NOT
 *   hardware-backed encrypted storage.  They are NOT equivalent to:
 *     - iOS Keychain (hardware-backed AES-256)
 *     - Android Keystore (hardware-backed key storage)
 *
 *   This means API keys stored here are protected only by the OS app
 *   sandbox, not hardware security modules.  This is an acceptable
 *   trade-off for a local-first productivity app, but users should be
 *   informed.  The credential service logs a one-time console warning
 *   when first accessed on a Capacitor build.
 *
 *   Future improvement path: replace with a community Capacitor plugin
 *   that wraps the native Keychain/Keystore APIs directly.
 *
 * SERVICE WORKER:
 *   WKWebView (iOS Capacitor) does NOT support service workers.  The
 *   native app bundle itself provides the offline shell — do not attempt
 *   SW registration when isCapacitor() returns true.
 *
 * EMAIL:
 *   IMAP fetching is not available on Capacitor — the Electron IPC bridge
 *   is absent.  EmailService delegates to the web null adapter.
 *
 * NOTIFICATIONS:
 *   @capacitor/local-notifications wraps UNCalendarTrigger (iOS) and
 *   AlarmManager (Android).  Runtime permission must be requested before
 *   the first schedule() call.
 */

import { Preferences } from '@capacitor/preferences';
import {
  LocalNotifications,
  type ScheduleOptions,
} from '@capacitor/local-notifications';
import type {
  CredentialService,
  NotificationService,
  NotificationPermission,
  PlannedNotification,
  ShellService,
} from './types';
import { webEmail, webNetwork } from './web';

// ---------------------------------------------------------------------------
// One-time security warning
// ---------------------------------------------------------------------------

let _credentialWarningShown = false;

function warnCredentialSecurity(): void {
  if (_credentialWarningShown) return;
  _credentialWarningShown = true;
  console.warn(
    '[OmniPlanner] Capacitor credential storage uses NSUserDefaults / SharedPreferences ' +
      '(app-sandboxed, NOT hardware-backed Keychain/Keystore). ' +
      'API keys are protected by the OS app sandbox only.',
  );
}

// ---------------------------------------------------------------------------
// Credential service — @capacitor/preferences
// ---------------------------------------------------------------------------

export const capacitorCredentials: CredentialService = {
  isAvailable(): boolean {
    return true;
  },

  async set(key: string, value: string): Promise<boolean> {
    warnCredentialSecurity();
    try {
      await Preferences.set({ key, value });
      return true;
    } catch (e) {
      console.error('[OmniPlanner] capacitorCredentials.set failed:', e);
      return false;
    }
  },

  async get(key: string): Promise<string | null> {
    warnCredentialSecurity();
    try {
      const result = await Preferences.get({ key });
      return result.value ?? null;
    } catch {
      return null;
    }
  },

  async delete(key: string): Promise<void> {
    try {
      await Preferences.remove({ key });
    } catch {
      // Ignore — key may not exist
    }
  },
};

// ---------------------------------------------------------------------------
// Notification service — @capacitor/local-notifications
// ---------------------------------------------------------------------------

export const capacitorNotifications: NotificationService = {
  isAvailable(): boolean {
    return true;
  },

  async requestPermission(): Promise<NotificationPermission> {
    try {
      const result = await LocalNotifications.requestPermissions();
      if (result.display === 'granted') return 'granted';
      if (result.display === 'denied') return 'denied';
      return 'default';
    } catch {
      return 'unavailable';
    }
  },

  async schedule(notification: PlannedNotification): Promise<boolean> {
    try {
      // Ensure we have permission first
      const permCheck = await LocalNotifications.checkPermissions();
      if (permCheck.display !== 'granted') return false;

      const options: ScheduleOptions = {
        notifications: [
          {
            id: notification.id,
            title: notification.title,
            body: notification.body,
            schedule: {
              at: notification.scheduledAt,
              allowWhileIdle: true,
            },
          },
        ],
      };
      await LocalNotifications.schedule(options);
      return true;
    } catch (e) {
      console.error('[OmniPlanner] capacitorNotifications.schedule failed:', e);
      return false;
    }
  },

  async cancel(id: number): Promise<void> {
    try {
      await LocalNotifications.cancel({ notifications: [{ id }] });
    } catch {
      // Ignore — notification may have already fired
    }
  },

  async cancelAll(): Promise<void> {
    try {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }
    } catch {
      // Ignore
    }
  },
};

// ---------------------------------------------------------------------------
// Shell service — limited on mobile
// ---------------------------------------------------------------------------

export const capacitorShell: ShellService = {
  isAvailable(): boolean {
    // Shell features (openExternal, quit) are limited on mobile
    return false;
  },

  openExternal(url: string): void {
    // Capacitor does not expose a direct openExternal; fall back to window.open
    // which will open in the system browser on iOS/Android via the WKWebView handler.
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  quit(): void {
    // There is no programmatic app-quit on iOS / Android; the OS handles lifecycle.
    console.warn('[OmniPlanner] quit() is a no-op on Capacitor / mobile.');
  },
};

// Email and network delegates — re-exported for use in platform/index.ts
export { webEmail as capacitorEmail, webNetwork as capacitorNetwork };
