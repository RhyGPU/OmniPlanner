/**
 * Reminder synchronisation utility.
 *
 * Derives which local notifications should be scheduled based on the current
 * planner state and user-configured reminder settings, then calls the
 * notificationScheduler to apply the changes.
 *
 * DESIGN:
 *   - Pure derivation: given settings + planner data → schedule or cancel.
 *   - No React hooks. Callable from App.tsx useEffect or any async context.
 *   - Idempotent: safe to call on every data change; existing notifications
 *     are cancelled and re-issued so there is never a stale duplicate.
 *   - All platform differences are handled inside platform.notifications —
 *     this function is platform-agnostic.
 *
 * PLATFORM BEHAVIOUR:
 *   Capacitor: Notifications persist across restarts. Re-scheduling on each
 *     app open is harmless and keeps the schedule accurate.
 *   Web:       Best-effort setTimeout scheduling. Notifications only fire while
 *     the tab is open. Re-scheduling on each page load is necessary.
 *   Electron:  nullNotifications — all calls return false / no-op.
 *
 * UPDATE / CANCEL SEMANTICS:
 *   Each notification ID is stable (from NOTIFICATION_IDS constants). To update
 *   a scheduled notification (e.g., user changes the reminder time), this
 *   function cancels the existing entry then schedules the new one. Callers
 *   only need to call syncReminders() again with updated settings/data.
 */

import type { NotificationSettings, WeekData } from '../types';
import {
  scheduleDailyPlannerReminder,
  cancelDailyPlannerReminder,
  scheduleHabitReminder,
  cancelHabitReminder,
  cancelFocusBlockReminder,
  NOTIFICATION_IDS,
} from './notificationScheduler';
import { platform } from '../services/platform';
import type { PlannedNotification } from '../services/platform';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Synchronise local notifications with current planner state and settings.
 *
 * @param settings      User-configured notification preferences.
 * @param currentWeek   The active week's data (habits, daily plans).
 * @param today         The current date (used to derive today's focus events).
 */
export async function syncReminders(
  settings: NotificationSettings,
  currentWeek: WeekData,
  today: Date,
): Promise<void> {
  // If notifications are unavailable on this platform, bail early.
  if (!platform.notifications.isAvailable()) return;

  // If the master switch is off, cancel everything and return.
  if (!settings.enabled) {
    await platform.notifications.cancelAll();
    return;
  }

  // Run all three reminder tracks in parallel for speed.
  await Promise.all([
    _syncDailyPlannerReminder(settings),
    _syncHabitReminder(settings, currentWeek),
    _syncFocusBlockReminder(settings, currentWeek, today),
  ]);
}

// ---------------------------------------------------------------------------
// Track: daily planner reminder
// ---------------------------------------------------------------------------

async function _syncDailyPlannerReminder(settings: NotificationSettings): Promise<void> {
  const { dailyPlannerReminder } = settings;
  if (!dailyPlannerReminder.enabled) {
    await cancelDailyPlannerReminder();
    return;
  }
  await scheduleDailyPlannerReminder(dailyPlannerReminder.hour, dailyPlannerReminder.minute);
}

// ---------------------------------------------------------------------------
// Track: habit reminder
// ---------------------------------------------------------------------------

async function _syncHabitReminder(
  settings: NotificationSettings,
  currentWeek: WeekData,
): Promise<void> {
  const { habitReminder } = settings;
  if (!habitReminder.enabled) {
    await cancelHabitReminder();
    return;
  }

  // Only schedule if there are active (non-archived, non-deleted) habits.
  const activeHabits = (currentWeek.habits ?? []).filter(
    h => !h.archived && !h.deletedAt,
  );
  if (activeHabits.length === 0) {
    await cancelHabitReminder();
    return;
  }

  await scheduleHabitReminder(habitReminder.hour, habitReminder.minute);
}

// ---------------------------------------------------------------------------
// Track: focus block reminder
// ---------------------------------------------------------------------------

/**
 * Find today's focus-kind calendar events, pick the soonest upcoming one,
 * and schedule a reminder `minutesBefore` minutes before it starts.
 *
 * SCHEDULING SEMANTICS:
 *   - Only the soonest upcoming focus block is scheduled (stable ID 1002).
 *   - If the computed reminder time has already passed, no notification fires.
 *   - Calling syncReminders() again (e.g., when events change) cancels the
 *     existing focus block reminder and schedules the updated one.
 */
async function _syncFocusBlockReminder(
  settings: NotificationSettings,
  currentWeek: WeekData,
  today: Date,
): Promise<void> {
  // Always cancel the existing focus block reminder first.
  // This ensures stale reminders are removed when blocks change.
  await cancelFocusBlockReminder();

  if (!settings.focusBlockReminder.enabled) return;

  const dateKey = _formatDateKey(today);
  const dayPlan = currentWeek.dailyPlans?.[dateKey];
  if (!dayPlan) return;

  const focusBlocks = (dayPlan.events ?? []).filter(e => e.eventKind === 'focus');
  if (focusBlocks.length === 0) return;

  const { minutesBefore } = settings.focusBlockReminder;

  // Find the soonest upcoming focus block whose reminder time is in the future.
  const now = Date.now();
  let soonest: PlannedNotification | null = null;

  for (const block of focusBlocks) {
    const blockStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      block.startHour,
      0,
      0,
      0,
    );
    const reminderTime = new Date(blockStart.getTime() - minutesBefore * 60_000);

    if (reminderTime.getTime() <= now) continue; // Already past

    if (!soonest || reminderTime.getTime() < soonest.scheduledAt.getTime()) {
      soonest = {
        id: NOTIFICATION_IDS.FOCUS_BLOCK_START,
        title: 'Focus Block Starting',
        body: minutesBefore > 0
          ? `"${block.title}" starts in ${minutesBefore} minute${minutesBefore !== 1 ? 's' : ''}.`
          : `"${block.title}" is starting now.`,
        scheduledAt: reminderTime,
      };
    }
  }

  if (soonest) {
    await platform.notifications.schedule(soonest);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Format a Date as YYYY-MM-DD (local time) — mirrors formatDateKey in constants.ts. */
function _formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
