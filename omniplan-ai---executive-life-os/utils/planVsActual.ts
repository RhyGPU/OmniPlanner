/**
 * Plan-vs-Actual Comparison Engine — Phase 2.
 *
 * Compares planned events, habits, and sleep against what actually happened.
 * Generates a structured report for the weekly review view.
 */

import type { WeekData, DailyPlan, DailyActuals, ActualEvent, Habit, Todo } from '../types';

// ---------------------------------------------------------------------------
// Comparison types
// ---------------------------------------------------------------------------

export interface DayComparison {
  dateKey: string;
  /** Events: planned vs actual */
  events: EventComparison;
  /** Habits: planned vs actual */
  habits: HabitComparison;
  /** Sleep: planned vs actual */
  sleep: SleepComparison;
  /** Todos: planned vs completed */
  todos: TodoComparison;
  /** Overall adherence score 0-100 */
  adherenceScore: number;
}

export interface EventComparison {
  planned: number;
  actual: number;
  attended: number;
  missed: number;
  unplanned: number;
  details: Array<{
    title: string;
    plannedStart?: number;
    actualStart?: number;
    status: 'attended' | 'missed' | 'unplanned' | 'rescheduled';
  }>;
}

export interface HabitComparison {
  habits: Array<{
    id: string;
    name: string;
    planned: boolean; // was scheduled for today
    completed: boolean;
    streak: number;
  }>;
  completionRate: number; // 0-100
}

export interface SleepComparison {
  plannedBedtime?: string;
  actualBedtime?: string;
  plannedWake?: string;
  actualWake?: string;
  plannedDuration?: number; // hours
  actualDuration?: number; // hours
  quality?: 1 | 2 | 3 | 4 | 5;
  sleepDebt: number; // hours (positive = deficit)
}

export interface TodoComparison {
  planned: number;
  completed: number;
  added: number; // unplanned todos that were completed
  completionRate: number; // 0-100
}

export interface WeekComparison {
  days: DayComparison[];
  summary: {
    totalPlannedEvents: number;
    totalAttendedEvents: number;
    totalMissedEvents: number;
    totalUnplannedEvents: number;
    habitCompletionRate: number;
    avgSleepDebt: number;
    avgEnergy?: number;
    avgMood?: number;
    overallAdherence: number;
    topGap: string; // human-readable "biggest gap"
    topWin: string; // human-readable "biggest win"
  };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Compare a single day's plan vs actuals.
 */
export function compareDay(
  dateKey: string,
  plan: DailyPlan,
  actuals: DailyActuals | undefined,
  habits: Habit[],
): DayComparison {
  if (!actuals) {
    // No actuals logged yet — return empty comparison
    return {
      dateKey,
      events: { planned: plan.events.length, actual: 0, attended: 0, missed: 0, unplanned: 0, details: [] },
      habits: habits.map(h => ({ id: h.id, name: h.name, planned: true, completed: false, streak: 0 })),
      habitCompletionRate: 0,
      sleep: { sleepDebt: 0 },
      todos: { planned: plan.todos.length, completed: 0, added: 0, completionRate: 0 },
      adherenceScore: 0,
    };
  }

  // Events comparison
  const eventComp = compareEvents(plan.events, actuals.events);

  // Habits comparison
  const habitComp = compareHabits(habits, actuals.habits);

  // Sleep comparison
  const sleepComp = compareSleep(plan.events, actuals.sleep);

  // Todos comparison
  const todoComp = compareTodos(plan.todos);

  // Overall adherence (weighted: events 30%, habits 30%, sleep 20%, todos 20%)
  const adherenceScore = Math.round(
    eventComp.attended / Math.max(eventComp.planned, 1) * 30 +
    habitComp.completionRate * 0.3 +
    (1 - Math.min(sleepComp.sleepDebt / 4, 1)) * 20 +
    todoComp.completionRate * 0.2
  );

  return {
    dateKey,
    events: eventComp,
    habits: habitComp,
    sleep: sleepComp,
    todos: todoComp,
    adherenceScore,
  };
}

/**
 * Compare a full week's plan vs actuals.
 */
export function compareWeek(weekData: WeekData): WeekComparison {
  const days: DayComparison[] = [];

  for (const [dateKey, dayPlan] of Object.entries(weekData.dailyPlans)) {
    const dayComp = compareDay(dateKey, dayPlan, dayPlan.actuals, weekData.habits);
    days.push(dayComp);
  }

  // Aggregate summary
  const totalPlanned = days.reduce((s, d) => s + d.events.planned, 0);
  const totalAttended = days.reduce((s, d) => s + d.events.attended, 0);
  const totalMissed = days.reduce((s, d) => s + d.events.missed, 0);
  const totalUnplanned = days.reduce((s, d) => s + d.events.unplanned, 0);
  const avgHabitRate = days.reduce((s, d) => s + d.habits.completionRate, 0) / Math.max(days.length, 1);
  const avgSleepDebt = days.reduce((s, d) => s + d.sleep.sleepDebt, 0) / Math.max(days.length, 1);
  const overallAdherence = days.reduce((s, d) => s + d.adherenceScore, 0) / Math.max(days.length, 1);

  // Find top gap and win
  let topGap = 'No gaps detected';
  let topWin = 'No wins yet';

  // Biggest gap: most missed events in a day
  const worstDay = days.reduce((worst, d) => d.events.missed > worst.events.missed ? d : worst, days[0]);
  if (worstDay && worstDay.events.missed > 0) {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const date = new Date(worstDay.dateKey + 'T00:00:00');
    const dayName = dayNames[date.getDay() === 0 ? 6 : date.getDay() - 1];
    topGap = `${dayName}: missed ${worstDay.events.missed} planned event${worstDay.events.missed > 1 ? 's' : ''}`;
  }

  // Biggest win: best habit streak
  const bestHabitDay = days.reduce((best, d) => {
    const bestStreak = Math.max(...d.habits.habits.map(h => h.streak));
    const thisStreak = Math.max(...best.habits.habits.map(h => h.streak));
    return thisStreak > bestStreak ? d : best;
  }, days[0]);
  if (bestHabitDay) {
    const bestHabit = bestHabitDay.habits.habits.reduce((best, h) => h.streak > best.streak ? h : best, { id: '', name: '', planned: false, completed: false, streak: 0 });
    if (bestHabit.streak > 0) {
      topWin = `${bestHabit.name}: ${bestHabit.streak} day streak`;
    }
  }

  return {
    days,
    summary: {
      totalPlannedEvents: totalPlanned,
      totalAttendedEvents: totalAttended,
      totalMissedEvents: totalMissed,
      totalUnplannedEvents: totalUnplanned,
      habitCompletionRate: Math.round(avgHabitRate),
      avgSleepDebt: Math.round(avgSleepDebt * 10) / 10,
      overallAdherence: Math.round(overallAdherence),
      topGap,
      topWin,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal comparators
// ---------------------------------------------------------------------------

function compareEvents(
  planned: Array<{ id: string; title: string; startHour: number }>,
  actual: ActualEvent[],
): EventComparison {
  const details: EventComparison['details'] = [];
  let attended = 0;
  let missed = 0;
  let unplanned = 0;

  // Check planned vs actual
  for (const p of planned) {
    const match = actual.find(a => a.plannedEventId === p.id);
    if (match) {
      if (match.attended) {
        attended++;
        const status = Math.abs(match.startHour - p.startHour) > 0.5 ? 'rescheduled' : 'attended';
        details.push({ title: p.title, plannedStart: p.startHour, actualStart: match.startHour, status });
      } else {
        missed++;
        details.push({ title: p.title, plannedStart: p.startHour, status: 'missed' });
      }
    } else {
      // No actual logged for this planned event — count as missed
      missed++;
      details.push({ title: p.title, plannedStart: p.startHour, status: 'missed' });
    }
  }

  // Check for unplanned events
  for (const a of actual) {
    if (!a.plannedEventId) {
      unplanned++;
      details.push({ title: a.title, actualStart: a.startHour, status: 'unplanned' });
    }
  }

  return {
    planned: planned.length,
    actual: actual.length,
    attended,
    missed,
    unplanned,
    details,
  };
}

function compareHabits(
  habits: Habit[],
  actualHabits: Record<string, boolean>,
): HabitComparison {
  const habitResults = habits
    .filter(h => !h.archived && !h.deletedAt)
    .map(h => ({
      id: h.id,
      name: h.name,
      planned: true,
      completed: actualHabits[h.id] ?? false,
      streak: calculateStreak(h),
    }));

  const completed = habitResults.filter(h => h.completed).length;
  const rate = habitResults.length > 0 ? Math.round((completed / habitResults.length) * 100) : 0;

  return { habits: habitResults, completionRate: rate };
}

function compareSleep(
  plannedEvents: Array<{ eventKind?: string; startHour: number; duration: number }>,
  actualSleep: DailyActuals['sleep'],
): SleepComparison {
  // Find planned sleep event (routine kind with latest start Hour)
  const sleepEvent = plannedEvents
    .filter(e => e.eventKind === 'routine')
    .sort((a, b) => b.startHour - a.startHour)[0];

  const plannedBedtime = sleepEvent ? formatHour(sleepEvent.startHour) : undefined;
  const plannedWake = sleepEvent ? formatHour(sleepEvent.startHour + sleepEvent.duration) : undefined;
  const plannedDuration = sleepEvent ? sleepEvent.duration : undefined;

  let actualDuration: number | undefined;
  if (actualSleep) {
    const [bedH, bedM] = actualSleep.bedtime.split(':').map(Number);
    const [wakeH, wakeM] = actualSleep.wakeTime.split(':').map(Number);
    let diff = (wakeH + wakeM / 60) - (bedH + bedM / 60);
    if (diff < 0) diff += 24; // crossed midnight
    actualDuration = Math.round(diff * 10) / 10;
  }

  const sleepDebt = (plannedDuration && actualDuration)
    ? Math.max(0, plannedDuration - actualDuration)
    : 0;

  return {
    plannedBedtime,
    actualBedtime: actualSleep?.bedtime,
    plannedWake,
    actualWake: actualSleep?.wakeTime,
    plannedDuration,
    actualDuration,
    quality: actualSleep?.quality,
    sleepDebt,
  };
}

function compareTodos(todos: Todo[]): TodoComparison {
  const planned = todos.length;
  const completed = todos.filter(t => t.done).length;
  return {
    planned,
    completed,
    added: 0, // we don't track unplanned todos in the current model
    completionRate: planned > 0 ? Math.round((completed / planned) * 100) : 100,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateStreak(habit: Habit): number {
  const dates = Object.keys(habit.completions)
    .filter(k => habit.completions[k])
    .sort()
    .reverse();

  if (dates.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Check if the most recent completion is today or yesterday (streak is active)
  const mostRecent = new Date(dates[0] + 'T00:00:00');
  const daysSince = (today.getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSince > 1) return 0; // Streak broken

  // Count consecutive days backwards
  let checkDate = new Date(mostRecent);
  for (let i = 0; i < 365; i++) {
    const dateKey = checkDate.toISOString().split('T')[0];
    if (habit.completions[dateKey]) {
      streak++;
    } else {
      break;
    }
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return streak;
}

function formatHour(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
}
