/**
 * Capacitor platform adapter — iOS and Android via @capacitor/core.
 *
 * CREDENTIAL SECURITY — PHASE 11A UPDATE:
 *   capacitorCredentials now uses `capacitor-secure-storage-plugin` which
 *   wraps platform-native secure storage:
 *     - iOS:     Keychain Services (hardware-backed AES encryption via Secure Enclave)
 *     - Android: Keystore + EncryptedSharedPreferences (hardware-backed on API 23+)
 *     - Web dev: AES-GCM encryption in localStorage (development fallback only —
 *                NOT equivalent to hardware-backed storage; never use in production)
 *
 *   This replaces the Phase 10 transitional implementation which used
 *   @capacitor/preferences (NSUserDefaults / SharedPreferences — app-sandbox only,
 *   NOT hardware-backed). The transitional store is drained by
 *   migrateCapacitorCredentialsFromPreferences() on first launch after upgrade.
 *
 * MIGRATION:
 *   Call migrateCapacitorCredentialsFromPreferences() once at startup (before
 *   migrateCredentials() in secureSettings.ts). It is idempotent: if a key is
 *   already in SecureStoragePlugin it is not overwritten; it is always deleted
 *   from Preferences after confirmed migration.
 *
 * SERVICE WORKER:
 *   WKWebView (iOS Capacitor) does NOT support service workers. The native app
 *   bundle itself provides the offline shell — do not attempt SW registration
 *   when isCapacitor() returns true.
 *
 * EMAIL:
 *   IMAP fetching is not available on Capacitor — the Electron IPC bridge is
 *   absent. EmailService delegates to the web null adapter.
 *
 * NOTIFICATIONS:
 *   @capacitor/local-notifications wraps UNCalendarTrigger (iOS) and
 *   AlarmManager (Android). Runtime permission must be requested before
 *   the first schedule() call.
 */

import { Preferences } from '@capacitor/preferences';
import {
  LocalNotifications,
  type ScheduleOptions,
} from '@capacitor/local-notifications';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import type {
  CredentialService,
  NotificationService,
  NotificationPermission,
  PlannedNotification,
  ShellService,
} from './types';

// Inline detection to avoid circular import with ./index
function _isCapacitorNative(): boolean {
  return (
    typeof (globalThis as any).Capacitor !== 'undefined' &&
    (globalThis as any).Capacitor.isNativePlatform() === true
  );
}

// ---------------------------------------------------------------------------
// Credential service — capacitor-secure-storage-plugin
// (iOS Keychain, Android Keystore, web AES-GCM fallback)
// ---------------------------------------------------------------------------

/**
 * Native-secure credential storage for Capacitor builds.
 *
 * Backed by:
 *   iOS:     iOS Keychain Services (hardware-backed via Secure Enclave on capable devices)
 *   Android: Keystore + EncryptedSharedPreferences (hardware-backed on API 23+)
 *
 * NOTE: The web fallback within capacitor-secure-storage-plugin uses AES-GCM
 * encryption in localStorage. This is NOT hardware-backed and should only ever
 * be used during development/testing, not in production browser deployments.
 */
export const capacitorCredentials: CredentialService = {
  isAvailable(): boolean {
    return true;
  },

  async set(key: string, value: string): Promise<boolean> {
    try {
      await SecureStoragePlugin.set({ key, value });
      return true;
    } catch (e) {
      console.error('[OmniPlanner] SecureStorage.set failed:', e);
      return false;
    }
  },

  async get(key: string): Promise<string | null> {
    try {
      const result = await SecureStoragePlugin.get({ key });
      return result.value ?? null;
    } catch (e) {
      // SecureStoragePlugin throws for missing keys (expected) and for real IO
      // errors (unexpected). Suppress the expected missing-key case; log the rest.
      const msg = e instanceof Error ? e.message : String(e);
      const isMissingKey =
        msg.includes('not exist') ||
        msg.includes('not found') ||
        msg.includes('No value') ||
        msg.includes('key does not');
      if (!isMissingKey) {
        console.error('[OmniPlanner] SecureStorage.get failed (storage may be unavailable):', key, e);
      }
      return null;
    }
  },

  async delete(key: string): Promise<void> {
    try {
      await SecureStoragePlugin.remove({ key });
    } catch {
      // Key may not exist — ignore
    }
  },
};

// ---------------------------------------------------------------------------
// One-time migration: Preferences → SecureStoragePlugin
// ---------------------------------------------------------------------------

/**
 * Migrate credentials from the Phase 10 transitional store (@capacitor/preferences)
 * to the Phase 11 native secure store (capacitor-secure-storage-plugin).
 *
 * IDEMPOTENCY:
 *   - If a key is already present in SecureStoragePlugin it is NOT overwritten
 *     (the existing secure value wins — it is assumed to be newer).
 *   - Each key is deleted from Preferences regardless, whether it was migrated
 *     now or was already present in the secure store.
 *   - Safe to call on every startup; exits early if no credential keys remain
 *     in Preferences.
 *
 * SECURITY:
 *   After this function completes, no OmniPlanner credentials should remain
 *   in NSUserDefaults / SharedPreferences on Capacitor builds.
 */
export async function migrateCapacitorCredentialsFromPreferences(): Promise<void> {
  if (!_isCapacitorNative()) return; // Only runs on native Capacitor builds

  let prefKeys: string[];
  try {
    const result = await Preferences.keys();
    prefKeys = result.keys;
  } catch (e) {
    console.error('[OmniPlanner] Could not enumerate Preferences keys during migration:', e);
    return;
  }

  // Only migrate known credential key patterns
  const credentialKeys = prefKeys.filter(
    k => k === 'omni_api_key' || k.startsWith('omni_email_pw_'),
  );

  if (credentialKeys.length === 0) return; // Nothing to migrate

  console.info(
    `[OmniPlanner] Migrating ${credentialKeys.length} credential(s) from ` +
      'transitional Preferences store to native Keychain/Keystore.',
  );

  for (const key of credentialKeys) {
    try {
      // Check if key is already in SecureStoragePlugin
      let alreadySecure = false;
      try {
        await SecureStoragePlugin.get({ key });
        alreadySecure = true;
      } catch {
        alreadySecure = false;
      }

      if (!alreadySecure) {
        // Read from Preferences and write to SecureStoragePlugin
        const { value } = await Preferences.get({ key });
        if (value !== null) {
          await SecureStoragePlugin.set({ key, value });
          console.info(`[OmniPlanner] Migrated credential key '${key}' to native secure store.`);
        }
      }

      // Delete from Preferences in all cases (already secure or just migrated)
      await Preferences.remove({ key });
    } catch (e) {
      // Non-fatal: log and continue. Key remains in Preferences until next launch.
      console.error(`[OmniPlanner] Failed to migrate credential key '${key}':`, e);
    }
  }
}

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
      // Notification may have already fired — ignore
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
    return false;
  },

  openExternal(url: string): void {
    // Capacitor does not expose a direct openExternal; fall back to window.open
    // which the WKWebView / ChromeCustomTab handler will intercept on device.
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  quit(): void {
    // There is no programmatic app-quit on iOS / Android; the OS handles lifecycle.
    console.warn('[OmniPlanner] quit() is a no-op on Capacitor / mobile.');
  },
};

// ---------------------------------------------------------------------------
// Email and network delegates — reuse web null adapter
// ---------------------------------------------------------------------------
export { webEmail as capacitorEmail, webNetwork as capacitorNetwork } from './web';
