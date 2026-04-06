/**
 * Pure reminder-status derivation helpers.
 *
 * All functions are side-effect-free: they derive human-readable reminder
 * state from a NotificationSettings snapshot without touching storage,
 * platform APIs, or React.
 *
 * Design rules:
 *   - No React imports — usable outside components.
 *   - No platform calls — callers decide what to do with the result.
 *   - "Effectively active" means both the master switch AND the sub-reminder
 *     are enabled; a sub-reminder alone does nothing when the master is off.
 */

import type { NotificationSettings } from '../types';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format a local hour + minute as "8:00 AM" / "9:30 PM". */
export function formatReminderTime(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const m = minute === 0 ? '00' : String(minute).padStart(2, '0');
  return `${h}:${m} ${period}`;
}

/** Format minutes-before as "5 min before" or "at start". */
export function formatMinutesBefore(minutesBefore: number): string {
  return minutesBefore === 0 ? 'at start' : `${minutesBefore} min before`;
}

// ---------------------------------------------------------------------------
// Active-state predicates
// ---------------------------------------------------------------------------

/**
 * True when focus block reminders are effectively active.
 * Requires both the master switch and focusBlockReminder.enabled to be on.
 */
export function isFocusReminderActive(settings: NotificationSettings): boolean {
  return settings.enabled && settings.focusBlockReminder.enabled;
}

/**
 * True when habit reminders are effectively active.
 * Note: reminderSync also requires at least one active habit — this predicate
 * does not check the habit list, only the settings flags.
 */
export function isHabitReminderActive(settings: NotificationSettings): boolean {
  return settings.enabled && settings.habitReminder.enabled;
}

/** True when the daily planner reminder is effectively active. */
export function isDailyReminderActive(settings: NotificationSettings): boolean {
  return settings.enabled && settings.dailyPlannerReminder.enabled;
}

// ---------------------------------------------------------------------------
// Human-readable status labels
// ---------------------------------------------------------------------------

/**
 * Short label for the focus reminder state, e.g. "5 min before".
 * Returns null when reminders are not active (no badge needed).
 */
export function getFocusReminderLabel(settings: NotificationSettings): string | null {
  if (!isFocusReminderActive(settings)) return null;
  return formatMinutesBefore(settings.focusBlockReminder.minutesBefore);
}

/**
 * Short label for the habit reminder time, e.g. "9:00 PM".
 * Returns null when reminders are not active.
 */
export function getHabitReminderLabel(settings: NotificationSettings): string | null {
  if (!isHabitReminderActive(settings)) return null;
  return formatReminderTime(settings.habitReminder.hour, settings.habitReminder.minute);
}

/**
 * Short label for the daily planner reminder time, e.g. "8:00 AM".
 * Returns null when reminders are not active.
 */
export function getDailyReminderLabel(settings: NotificationSettings): string | null {
  if (!isDailyReminderActive(settings)) return null;
  return formatReminderTime(settings.dailyPlannerReminder.hour, settings.dailyPlannerReminder.minute);
}
