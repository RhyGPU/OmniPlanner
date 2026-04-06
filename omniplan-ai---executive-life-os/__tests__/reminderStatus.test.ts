/**
 * Unit tests for utils/reminderStatus.ts
 *
 * All functions are pure — no mocking required.
 */

import { describe, it, expect } from 'vitest';
import {
  formatReminderTime,
  formatMinutesBefore,
  isFocusReminderActive,
  isHabitReminderActive,
  isDailyReminderActive,
  getFocusReminderLabel,
  getHabitReminderLabel,
  getDailyReminderLabel,
} from '../utils/reminderStatus';
import type { NotificationSettings } from '../types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BASE: NotificationSettings = {
  enabled: true,
  dailyPlannerReminder: { enabled: true, hour: 8, minute: 0 },
  habitReminder: { enabled: true, hour: 21, minute: 0 },
  focusBlockReminder: { enabled: true, minutesBefore: 5 },
};

const masterOff: NotificationSettings = { ...BASE, enabled: false };
const focusOff: NotificationSettings = { ...BASE, focusBlockReminder: { ...BASE.focusBlockReminder, enabled: false } };
const habitOff: NotificationSettings = { ...BASE, habitReminder: { ...BASE.habitReminder, enabled: false } };
const dailyOff: NotificationSettings = { ...BASE, dailyPlannerReminder: { ...BASE.dailyPlannerReminder, enabled: false } };

// ---------------------------------------------------------------------------
// formatReminderTime
// ---------------------------------------------------------------------------

describe('formatReminderTime', () => {
  it('formats midnight as 12:00 AM', () => {
    expect(formatReminderTime(0, 0)).toBe('12:00 AM');
  });

  it('formats noon as 12:00 PM', () => {
    expect(formatReminderTime(12, 0)).toBe('12:00 PM');
  });

  it('formats 8:00 AM correctly', () => {
    expect(formatReminderTime(8, 0)).toBe('8:00 AM');
  });

  it('formats 9:30 PM correctly', () => {
    expect(formatReminderTime(21, 30)).toBe('9:30 PM');
  });

  it('formats 1:05 PM with zero-padded minutes', () => {
    expect(formatReminderTime(13, 5)).toBe('1:05 PM');
  });

  it('formats 11:59 PM correctly', () => {
    expect(formatReminderTime(23, 59)).toBe('11:59 PM');
  });

  it('formats 1:00 AM correctly', () => {
    expect(formatReminderTime(1, 0)).toBe('1:00 AM');
  });
});

// ---------------------------------------------------------------------------
// formatMinutesBefore
// ---------------------------------------------------------------------------

describe('formatMinutesBefore', () => {
  it('returns "at start" for 0 minutes', () => {
    expect(formatMinutesBefore(0)).toBe('at start');
  });

  it('returns "5 min before" for 5 minutes', () => {
    expect(formatMinutesBefore(5)).toBe('5 min before');
  });

  it('returns "30 min before" for 30 minutes', () => {
    expect(formatMinutesBefore(30)).toBe('30 min before');
  });

  it('returns "15 min before" for 15 minutes', () => {
    expect(formatMinutesBefore(15)).toBe('15 min before');
  });
});

// ---------------------------------------------------------------------------
// Active-state predicates
// ---------------------------------------------------------------------------

describe('isFocusReminderActive', () => {
  it('true when master and sub-reminder are both enabled', () => {
    expect(isFocusReminderActive(BASE)).toBe(true);
  });

  it('false when master switch is off', () => {
    expect(isFocusReminderActive(masterOff)).toBe(false);
  });

  it('false when focusBlockReminder.enabled is false', () => {
    expect(isFocusReminderActive(focusOff)).toBe(false);
  });
});

describe('isHabitReminderActive', () => {
  it('true when master and sub-reminder are both enabled', () => {
    expect(isHabitReminderActive(BASE)).toBe(true);
  });

  it('false when master switch is off', () => {
    expect(isHabitReminderActive(masterOff)).toBe(false);
  });

  it('false when habitReminder.enabled is false', () => {
    expect(isHabitReminderActive(habitOff)).toBe(false);
  });
});

describe('isDailyReminderActive', () => {
  it('true when master and sub-reminder are both enabled', () => {
    expect(isDailyReminderActive(BASE)).toBe(true);
  });

  it('false when master switch is off', () => {
    expect(isDailyReminderActive(masterOff)).toBe(false);
  });

  it('false when dailyPlannerReminder.enabled is false', () => {
    expect(isDailyReminderActive(dailyOff)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Label derivation
// ---------------------------------------------------------------------------

describe('getFocusReminderLabel', () => {
  it('returns formatted minutesBefore when active', () => {
    expect(getFocusReminderLabel(BASE)).toBe('5 min before');
  });

  it('returns "at start" when minutesBefore is 0 and active', () => {
    const s: NotificationSettings = { ...BASE, focusBlockReminder: { enabled: true, minutesBefore: 0 } };
    expect(getFocusReminderLabel(s)).toBe('at start');
  });

  it('returns null when master is off', () => {
    expect(getFocusReminderLabel(masterOff)).toBeNull();
  });

  it('returns null when sub-reminder is off', () => {
    expect(getFocusReminderLabel(focusOff)).toBeNull();
  });
});

describe('getHabitReminderLabel', () => {
  it('returns formatted time when active', () => {
    expect(getHabitReminderLabel(BASE)).toBe('9:00 PM');
  });

  it('returns null when master is off', () => {
    expect(getHabitReminderLabel(masterOff)).toBeNull();
  });

  it('returns null when sub-reminder is off', () => {
    expect(getHabitReminderLabel(habitOff)).toBeNull();
  });
});

describe('getDailyReminderLabel', () => {
  it('returns formatted time when active', () => {
    expect(getDailyReminderLabel(BASE)).toBe('8:00 AM');
  });

  it('returns null when master is off', () => {
    expect(getDailyReminderLabel(masterOff)).toBeNull();
  });

  it('returns null when sub-reminder is off', () => {
    expect(getDailyReminderLabel(dailyOff)).toBeNull();
  });
});
