/**
 * End-to-end daily planning reminder utility.
 *
 * Provides a thin, domain-aware layer on top of `platform.notifications` for
 * scheduling OmniPlanner-specific local notifications (daily planner reminder,
 * focus block start, habit reminder).
 *
 * DESIGN:
 *   - Notification IDs are stable numeric constants so cancelling and
 *     re-scheduling is idempotent.
 *   - All scheduling goes through `platform.notifications` so the correct
 *     adapter is used transparently on Capacitor / web / Electron.
 *   - Callers check the returned boolean to decide whether to surface
 *     an "Enable notifications" prompt.
 *
 * PLATFORM BEHAVIOUR:
 *   Capacitor (iOS/Android): Uses UNCalendarTrigger / AlarmManager.
 *     Notifications persist across app restarts.  Requires explicit
 *     `requestPermission()` before the first schedule() call.
 *   Web browser (PWA): Uses Web Notifications API + setTimeout.
 *     Only fires while the tab is open.  Not persistent across restarts.
 *   Electron: nullNotifications — returns false; no notification fires.
 *
 * USAGE:
 *   // On app start / settings save:
 *   const ok = await scheduleDailyPlannerReminder(8, 0);
 *   if (!ok) { /* show "Enable Notifications" button *\/ }
 *
 *   // To cancel:
 *   await cancelDailyPlannerReminder();
 */

import { platform } from '../services/platform';
import type { NotificationPermission } from '../services/platform';

// ---------------------------------------------------------------------------
// Stable notification IDs
// ---------------------------------------------------------------------------

export const NOTIFICATION_IDS = {
  /** Morning prompt to open and plan the day. */
  DAILY_PLANNER_REMINDER: 1001,
  /** Alert when a scheduled focus block is about to start. */
  FOCUS_BLOCK_START: 1002,
  /** Evening habit completion check-in. */
  HABIT_REMINDER: 1003,
} as const;

// ---------------------------------------------------------------------------
// Permission helper
// ---------------------------------------------------------------------------

/**
 * Request notification permission and return the result.
 *
 * Safe to call on any platform — returns 'unavailable' when the
 * notification service is not present.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!platform.notifications.isAvailable()) return 'unavailable';
  return platform.notifications.requestPermission();
}

// ---------------------------------------------------------------------------
// Daily planner reminder
// ---------------------------------------------------------------------------

/**
 * Schedule (or re-schedule) the daily planner reminder for today.
 *
 * Schedules the notification for today at `hour:minute` local time.
 * If the requested time has already passed today the notification is
 * scheduled for the same time tomorrow.
 *
 * @param hour   Local hour (0–23). Default: 8 (8 AM).
 * @param minute Local minute (0–59). Default: 0.
 * @returns true if the notification was accepted by the platform.
 */
export async function scheduleDailyPlannerReminder(
  hour = 8,
  minute = 0,
): Promise<boolean> {
  if (!platform.notifications.isAvailable()) return false;

  const scheduledAt = nextOccurrence(hour, minute);

  return platform.notifications.schedule({
    id: NOTIFICATION_IDS.DAILY_PLANNER_REMINDER,
    title: 'OmniPlanner — Plan Your Day',
    body: 'Take a moment to review your goals and schedule today\'s focus blocks.',
    scheduledAt,
  });
}

/** Cancel the daily planner reminder. */
export async function cancelDailyPlannerReminder(): Promise<void> {
  if (!platform.notifications.isAvailable()) return;
  await platform.notifications.cancel(NOTIFICATION_IDS.DAILY_PLANNER_REMINDER);
}

// ---------------------------------------------------------------------------
// Focus block reminder
// ---------------------------------------------------------------------------

/**
 * Schedule a focus-block-start notification.
 *
 * @param blockTitle  Name of the focus block (shown in notification body).
 * @param startTime   When the block begins.
 * @returns true if accepted by the platform.
 */
export async function scheduleFocusBlockReminder(
  blockTitle: string,
  startTime: Date,
): Promise<boolean> {
  if (!platform.notifications.isAvailable()) return false;
  if (startTime.getTime() <= Date.now()) return false;

  return platform.notifications.schedule({
    id: NOTIFICATION_IDS.FOCUS_BLOCK_START,
    title: 'Focus Block Starting',
    body: blockTitle,
    scheduledAt: startTime,
  });
}

/** Cancel the focus block reminder. */
export async function cancelFocusBlockReminder(): Promise<void> {
  if (!platform.notifications.isAvailable()) return;
  await platform.notifications.cancel(NOTIFICATION_IDS.FOCUS_BLOCK_START);
}

// ---------------------------------------------------------------------------
// Habit reminder
// ---------------------------------------------------------------------------

/**
 * Schedule a daily habit completion reminder.
 *
 * @param hour   Local hour (0–23). Default: 21 (9 PM).
 * @param minute Local minute (0–59). Default: 0.
 */
export async function scheduleHabitReminder(hour = 21, minute = 0): Promise<boolean> {
  if (!platform.notifications.isAvailable()) return false;

  return platform.notifications.schedule({
    id: NOTIFICATION_IDS.HABIT_REMINDER,
    title: 'Habit Check-In',
    body: 'Mark your habits for today before the day ends.',
    scheduledAt: nextOccurrence(hour, minute),
  });
}

/** Cancel the habit reminder. */
export async function cancelHabitReminder(): Promise<void> {
  if (!platform.notifications.isAvailable()) return;
  await platform.notifications.cancel(NOTIFICATION_IDS.HABIT_REMINDER);
}

// ---------------------------------------------------------------------------
// Cancel everything
// ---------------------------------------------------------------------------

/** Cancel all OmniPlanner-scheduled notifications. */
export async function cancelAllNotifications(): Promise<void> {
  if (!platform.notifications.isAvailable()) return;
  await platform.notifications.cancelAll();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns a Date for the next occurrence of `hour:minute` local time.
 * If the time has already passed today, returns tomorrow's occurrence.
 */
function nextOccurrence(hour: number, minute: number): Date {
  const now = new Date();
  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
    0,
  );
  if (candidate.getTime() <= now.getTime()) {
    // Already passed — schedule for tomorrow
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}
