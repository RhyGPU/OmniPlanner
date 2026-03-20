/**
 * Pure planning-intelligence selectors — Phase 5 + Phase 6.
 *
 * All functions are side-effect-free: they derive scheduling insights from
 * existing state (allWeeks, goalItems) without mutating anything.
 *
 * Design rules:
 *   - No React imports — usable outside components.
 *   - No AI required — deterministic, rule-based.
 *   - No new stored relationships — derived at read time like Phase 3/4 selectors.
 *   - CalendarEvent.linkedTodoId is the precise check; CalendarEvent.parentGoalId
 *     is the coarser goal-level check.
 */

import { CalendarEvent, CalendarEventKind, GoalItem, Todo, WeekData } from '../types';

// ---------------------------------------------------------------------------
// Shared context types
// ---------------------------------------------------------------------------

/** A daily Todo plus the dateKey it lives under (for day-level scheduling checks). */
export interface TodoWithDateContext {
  todo: Todo;
  dateKey: string;
  /** Whether the todo came from a daily plan vs the weekly goals section. */
  source: 'weekly_business' | 'weekly_personal' | 'daily';
}

export interface GoalCoverageSummary {
  goalId: string;
  /** Total calendar minutes allocated to this goal this week. */
  scheduledMinutes: number;
  /** Linked todos (weekly + daily) that have at least one block. */
  scheduledTodoCount: number;
  /** Total linked todos. */
  linkedTodoCount: number;
}

export interface SuggestedBlock {
  title: string;
  parentGoalId: string;
  linkedTodoId?: string | number;
  /** Suggested calendar day (YYYY-MM-DD). */
  dateKey: string;
  suggestedHour: number;
  suggestedDuration: number;
  eventKind: CalendarEventKind;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** True if the todo already has a time block this week (by direct ID or goal coverage). */
function isTodoScheduledInWeek(
  todoId: string | number,
  parentGoalId: string | undefined,
  currentWeek: WeekData,
): boolean {
  for (const dayPlan of Object.values(currentWeek.dailyPlans)) {
    for (const evt of dayPlan.events) {
      if (evt.linkedTodoId !== undefined && evt.linkedTodoId === todoId) return true;
      // Coarser check: any block targeting the same goal counts as schedule support
      if (parentGoalId && evt.parentGoalId === parentGoalId) return true;
    }
  }
  return false;
}

/** True if the todo has a time block on a specific day (for daily-granularity checks). */
function isTodoScheduledOnDay(
  todoId: string | number,
  parentGoalId: string | undefined,
  dayEvents: CalendarEvent[],
): boolean {
  return dayEvents.some(
    evt =>
      (evt.linkedTodoId !== undefined && evt.linkedTodoId === todoId) ||
      (parentGoalId !== undefined && evt.parentGoalId === parentGoalId),
  );
}

// ---------------------------------------------------------------------------
// Public selectors
// ---------------------------------------------------------------------------

/**
 * Weekly linked todos (goals.business + goals.personal) that are not done
 * and have no time block anywhere in the current week.
 */
export function getUnscheduledWeeklyLinkedTodos(currentWeek: WeekData): Todo[] {
  return [...currentWeek.goals.business, ...currentWeek.goals.personal].filter(
    t => !t.done && t.parentGoalId && !isTodoScheduledInWeek(t.id, t.parentGoalId, currentWeek),
  );
}

/**
 * Daily linked todos that are not done and have no block on their specific day.
 */
export function getUnscheduledDailyLinkedTodos(currentWeek: WeekData): TodoWithDateContext[] {
  const result: TodoWithDateContext[] = [];
  for (const [dateKey, dayPlan] of Object.entries(currentWeek.dailyPlans)) {
    for (const todo of dayPlan.todos) {
      if (
        !todo.done &&
        todo.parentGoalId &&
        !isTodoScheduledOnDay(todo.id, todo.parentGoalId, dayPlan.events)
      ) {
        result.push({ todo, dateKey, source: 'daily' });
      }
    }
  }
  return result;
}

/**
 * Total calendar minutes this week in blocks that link to the given goal.
 * Only counts blocks with parentGoalId or linkedTodoId — not unlinked blocks.
 */
export function getGoalCalendarSupport(goalId: string, currentWeek: WeekData): number {
  let minutes = 0;
  for (const dayPlan of Object.values(currentWeek.dailyPlans)) {
    for (const evt of dayPlan.events) {
      if (evt.parentGoalId === goalId) {
        minutes += evt.duration * 60;
      }
    }
  }
  return minutes;
}

/**
 * Active goals that have linked work (weekly or daily this week) but no
 * calendar blocks supporting them.
 */
export function getGoalsWithoutCalendarSupport(
  goalItems: GoalItem[],
  currentWeek: WeekData,
): GoalItem[] {
  const weekly = [...currentWeek.goals.business, ...currentWeek.goals.personal];
  return goalItems.filter(g => {
    if (g.status !== 'active') return false;
    const hasLinkedWork =
      weekly.some(t => t.parentGoalId === g.id) ||
      Object.values(currentWeek.dailyPlans).some(dp =>
        dp.todos.some(t => t.parentGoalId === g.id),
      );
    if (!hasLinkedWork) return false;
    return getGoalCalendarSupport(g.id, currentWeek) === 0;
  });
}

/**
 * Coverage summary for a goal: how many of its linked todos have blocks,
 * and total minutes scheduled.
 */
export function getGoalExecutionCoverage(
  goalId: string,
  currentWeek: WeekData,
): GoalCoverageSummary {
  const weekly = [...currentWeek.goals.business, ...currentWeek.goals.personal].filter(
    t => t.parentGoalId === goalId,
  );
  const daily = Object.values(currentWeek.dailyPlans).flatMap(dp =>
    dp.todos.filter(t => t.parentGoalId === goalId),
  );
  const allLinked = [...weekly, ...daily];
  const scheduledTodoCount = allLinked.filter(t =>
    isTodoScheduledInWeek(t.id, t.parentGoalId, currentWeek),
  ).length;
  return {
    goalId,
    scheduledMinutes: getGoalCalendarSupport(goalId, currentWeek),
    linkedTodoCount: allLinked.length,
    scheduledTodoCount,
  };
}

/**
 * Suggest up to one focus block per unscheduled linked weekly todo, placed on
 * the next available day (preferring days with fewer existing events).
 * Purely deterministic — no AI.
 */
export function getSuggestedFocusBlocks(
  currentWeek: WeekData,
  _goalItems: GoalItem[],
): SuggestedBlock[] {
  const unscheduled = getUnscheduledWeeklyLinkedTodos(currentWeek);
  if (unscheduled.length === 0) return [];

  const dayEntries = Object.entries(currentWeek.dailyPlans).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const suggestions: SuggestedBlock[] = [];
  const seenGoals = new Set<string>();

  for (const todo of unscheduled) {
    if (!todo.parentGoalId || seenGoals.has(todo.parentGoalId)) continue;
    seenGoals.add(todo.parentGoalId);

    // Prefer a day with fewer events; fall back to first day
    const target =
      dayEntries.find(([, dp]) => dp.events.length < 4) ?? dayEntries[0];
    if (!target) continue;

    const [dateKey, dayPlan] = target;
    const maxEnd = dayPlan.events.reduce(
      (m, e) => Math.max(m, e.startHour + e.duration),
      9,
    );
    suggestions.push({
      title: todo.text || 'Focus block',
      parentGoalId: todo.parentGoalId,
      linkedTodoId: todo.id,
      dateKey,
      suggestedHour: Math.min(maxEnd, 17),
      suggestedDuration: 1.5,
      eventKind: 'focus',
    });
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Phase 6: execution analytics selectors
// ---------------------------------------------------------------------------

/** Count of focus/task_block events this week (linked or unlinked). */
export function getWeeklyFocusBlockCount(currentWeek: WeekData): number {
  let count = 0;
  for (const dayPlan of Object.values(currentWeek.dailyPlans)) {
    for (const evt of dayPlan.events) {
      if (evt.eventKind === 'focus' || evt.eventKind === 'task_block') count++;
    }
  }
  return count;
}

/** Total minutes of focus/task_block events this week (linked or unlinked). */
export function getWeeklyScheduledMinutes(currentWeek: WeekData): number {
  let minutes = 0;
  for (const dayPlan of Object.values(currentWeek.dailyPlans)) {
    for (const evt of dayPlan.events) {
      if (evt.eventKind === 'focus' || evt.eventKind === 'task_block') {
        minutes += evt.duration * 60;
      }
    }
  }
  return minutes;
}

/**
 * Per-day count of unscheduled linked daily todos.
 * Returns only dateKeys that have at least one unscheduled linked task.
 */
export function getUnscheduledLinkedTaskCountsByDay(
  currentWeek: WeekData,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [dateKey, dayPlan] of Object.entries(currentWeek.dailyPlans)) {
    const count = dayPlan.todos.filter(
      t =>
        !t.done &&
        t.parentGoalId &&
        !isTodoScheduledOnDay(t.id, t.parentGoalId, dayPlan.events),
    ).length;
    if (count > 0) result[dateKey] = count;
  }
  return result;
}

/** True if the day has at least one focus or task_block event linked to a goal. */
export function dayHasLinkedFocusBlocks(dateKey: string, currentWeek: WeekData): boolean {
  const dayPlan = currentWeek.dailyPlans[dateKey];
  if (!dayPlan) return false;
  return dayPlan.events.some(
    evt =>
      (evt.eventKind === 'focus' || evt.eventKind === 'task_block') &&
      evt.parentGoalId,
  );
}

export interface WeeklyReviewSummary {
  /** Active goals with at least one calendar block this week. */
  goalsWithCalendarSupport: number;
  /** Active goals with linked work this week but no calendar blocks. */
  goalsWithLinkedWorkButNoBlocks: number;
  /** Count of focus/task_block events (linked or unlinked). */
  focusBlockCount: number;
  /** Total minutes of focus/task_block events. */
  scheduledFocusMinutes: number;
  /** Linked todos (weekly + daily this week) that are marked done. */
  completedLinkedTasks: number;
  /** Linked todos (weekly + daily this week) that are not done and have no block. */
  unscheduledLinkedTasks: number;
}

/**
 * Aggregates execution analytics for the current week.
 * Purely derived — no mutations, no AI.
 */
export function getWeeklyReviewSummary(
  goalItems: GoalItem[],
  currentWeek: WeekData,
): WeeklyReviewSummary {
  const activeGoals = goalItems.filter(g => g.status === 'active');
  const weeklyTodos = [...currentWeek.goals.business, ...currentWeek.goals.personal];
  const dailyTodos = Object.values(currentWeek.dailyPlans).flatMap(dp => dp.todos);

  let goalsWithCalendarSupport = 0;
  let goalsWithLinkedWorkButNoBlocks = 0;

  for (const g of activeGoals) {
    const hasLinkedWork =
      weeklyTodos.some(t => t.parentGoalId === g.id) ||
      dailyTodos.some(t => t.parentGoalId === g.id);
    if (!hasLinkedWork) continue;
    if (getGoalCalendarSupport(g.id, currentWeek) > 0) {
      goalsWithCalendarSupport++;
    } else {
      goalsWithLinkedWorkButNoBlocks++;
    }
  }

  const allLinked = [
    ...weeklyTodos.filter(t => t.parentGoalId),
    ...dailyTodos.filter(t => t.parentGoalId),
  ];

  return {
    goalsWithCalendarSupport,
    goalsWithLinkedWorkButNoBlocks,
    focusBlockCount: getWeeklyFocusBlockCount(currentWeek),
    scheduledFocusMinutes: getWeeklyScheduledMinutes(currentWeek),
    completedLinkedTasks: allLinked.filter(t => t.done).length,
    unscheduledLinkedTasks:
      getUnscheduledWeeklyLinkedTodos(currentWeek).length +
      getUnscheduledDailyLinkedTodos(currentWeek).length,
  };
}
