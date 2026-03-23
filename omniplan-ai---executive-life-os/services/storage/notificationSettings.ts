/**
 * Notification reminder settings persistence.
 *
 * Non-sensitive: stores only time preferences and enable flags — no credentials,
 * no PII. Persisted via the standard storage adapter (localStorage on Electron,
 * IndexedDB on web / Capacitor).
 *
 * DEFAULTS:
 *   All reminders are off by default (`enabled: false`). The user must
 *   explicitly opt in and grant notification permission before any
 *   notifications are scheduled. This avoids surprise permission prompts on
 *   first launch.
 */

import { storage, LOCAL_STORAGE_KEYS } from './index';
import type { NotificationSettings } from '../../types';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  dailyPlannerReminder: {
    enabled: true,
    hour: 8,
    minute: 0,
  },
  habitReminder: {
    enabled: true,
    hour: 21,
    minute: 0,
  },
  focusBlockReminder: {
    enabled: true,
    minutesBefore: 5,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read saved notification settings, falling back to defaults. */
export function getNotificationSettings(): NotificationSettings {
  const saved = storage.get<NotificationSettings>(LOCAL_STORAGE_KEYS.NOTIFICATION_SETTINGS);
  if (!saved) return { ...DEFAULT_NOTIFICATION_SETTINGS };

  // Merge with defaults to handle missing fields from older saved versions
  return {
    enabled: saved.enabled ?? DEFAULT_NOTIFICATION_SETTINGS.enabled,
    dailyPlannerReminder: {
      ...DEFAULT_NOTIFICATION_SETTINGS.dailyPlannerReminder,
      ...saved.dailyPlannerReminder,
    },
    habitReminder: {
      ...DEFAULT_NOTIFICATION_SETTINGS.habitReminder,
      ...saved.habitReminder,
    },
    focusBlockReminder: {
      ...DEFAULT_NOTIFICATION_SETTINGS.focusBlockReminder,
      ...saved.focusBlockReminder,
    },
  };
}

/** Persist notification settings. */
export function saveNotificationSettings(settings: NotificationSettings): void {
  storage.set(LOCAL_STORAGE_KEYS.NOTIFICATION_SETTINGS, settings);
}
