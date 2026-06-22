/**
 * Alarm Rules Engine — Phase 2.
 *
 * Derives smart alarms from calendar events and scheduled todos based on
 * configurable rules. The calendar is the single source of truth — alarms
 * are derived, never manually created.
 *
 * RULE TYPES:
 *   sleep:      Sleep event at 11pm → wind-down alarm at 10pm, wake alarm at 6am
 *   meeting     Meeting at 2pm → prep alarm 30min before, travel alarm based on buffer
 *   focus:      Focus block → start reminder 5min before
 *   habit:      Daily habit check-in at configurable time
 *   custom:     User-defined rules (e.g., "1hr before any event tagged 'important'")
 *
 * Each rule generates zero or more Alarm objects that get scheduled as
 * native notifications via the notificationScheduler.
 */

import type { CalendarEvent, WeekData } from '../types';
import { formatDateKey } from '../constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Alarm {
  /** Unique stable ID derived from rule + event: "sleep-winddown-2026-01-15" */
  id: string;
  /** What this alarm is about */
  title: string;
  /** Detail text */
  body: string;
  /** When to fire */
  scheduledAt: Date;
  /** What triggered this alarm */
  sourceEventId?: string;
  /** What action to suggest */
  action?: 'view' | 'complete' | 'dismiss';
}

export interface AlarmRule {
  id: string;
  /** Which event kinds this rule applies to */
  eventKinds: Array<'sleep' | 'meeting' | 'focus' | 'routine' | 'task_block' | 'any'>;
  /** Offset in minutes from event start (negative = before, positive = after) */
  offsetMinutes: number;
  title: string;
  bodyTemplate: string;  // supports {eventTitle}, {time}, {date}
  enabled: boolean;
}

export interface AlarmRuleset {
  rules: AlarmRule[];
  /** Global default: minutes before event to fire a generic "starting soon" alarm */
  defaultEventReminderMinutes: number;
}

// ---------------------------------------------------------------------------
// Default rules
// ---------------------------------------------------------------------------

export const DEFAULT_ALARM_RULESET: AlarmRuleset = {
  rules: [
    {
      id: 'sleep-wind-down',
      eventKinds: ['sleep'],
      offsetMinutes: -60,
      title: 'Wind Down',
      bodyTemplate: 'Sleep at {time}. Start winding down now.',
      enabled: true,
    },
    {
      id: 'sleep-wake',
      eventKinds: ['sleep'],
      offsetMinutes: 480, // 8 hours after sleep = wake time
      title: 'Wake Up',
      bodyTemplate: 'Good morning! Start your day.',
      enabled: true,
    },
    {
      id: 'meeting-prep',
      eventKinds: ['meeting'],
      offsetMinutes: -30,
      title: 'Meeting Soon',
      bodyTemplate: '"{eventTitle}" starts in 30 minutes.',
      enabled: true,
    },
    {
      id: 'focus-start',
      eventKinds: ['focus'],
      offsetMinutes: -5,
      title: 'Focus Block',
      bodyTemplate: '"{eventTitle}" starts in 5 minutes.',
      enabled: true,
    },
    {
      id: 'event-default',
      eventKinds: ['any'],
      offsetMinutes: -15,
      title: 'Upcoming',
      bodyTemplate: '"{eventTitle}" in 15 minutes.',
      enabled: false, // user must opt in
    },
  ],
  defaultEventReminderMinutes: 15,
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Derive all alarms for a given day from calendar events + scheduled todos.
 * Returns alarms sorted by scheduled time (earliest first).
 */
export function deriveAlarmsForDay(
  date: Date,
  events: CalendarEvent[],
  ruleset: AlarmRuleset = DEFAULT_ALARM_RULESET,
  now: Date = new Date(),
): Alarm[] {
  const alarms: Alarm[] = [];
  const dateKey = formatDateKey(date);

  for (const event of events) {
    const eventStart = eventDateTime(date, event.startHour);

    for (const rule of ruleset.rules) {
      if (!rule.enabled) continue;
      if (!rule.eventKinds.includes('any') && !rule.eventKinds.includes(event.eventKind ?? 'meeting')) continue;

      const alarmTime = new Date(eventStart.getTime() + rule.offsetMinutes * 60_000);

      // Skip alarms in the past
      if (alarmTime.getTime() <= now.getTime()) continue;

      // For sleep-wake rule, skip if the wake time would be before now
      if (rule.id === 'sleep-wake' && alarmTime.getTime() <= now.getTime()) continue;

      const timeStr = formatTime(alarmTime);
      const eventTimeStr = formatTime(eventStart);

      alarms.push({
        id: `${rule.id}-${event.id}-${dateKey}`,
        title: rule.title,
        body: rule.bodyTemplate
          .replace('{eventTitle}', event.title)
          .replace('{time}', eventTimeStr)
          .replace('{date}', dateKey),
        scheduledAt: alarmTime,
        sourceEventId: event.id,
        action: 'view',
      });
    }
  }

  return alarms.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

/**
 * Derive alarms for a full week.
 */
export function deriveAlarmsForWeek(
  weekData: WeekData,
  ruleset: AlarmRuleset = DEFAULT_ALARM_RULESET,
  now: Date = new Date(),
): Alarm[] {
  const allAlarms: Alarm[] = [];

  for (const [dateKey, dayPlan] of Object.entries(weekData.dailyPlans)) {
    const events = dayPlan.events ?? [];
    if (events.length === 0) continue;

    const date = new Date(dateKey + 'T00:00:00');
    const dayAlarms = deriveAlarmsForDay(date, events, ruleset, now);
    allAlarms.push(...dayAlarms);
  }

  return allAlarms;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function eventDateTime(date: Date, startHour: number): Date {
  const hours = Math.floor(startHour);
  const minutes = Math.round((startHour - hours) * 60);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

function formatTime(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  const min = m.toString().padStart(2, '0');
  return `${hour12}:${min} ${ampm}`;
}
