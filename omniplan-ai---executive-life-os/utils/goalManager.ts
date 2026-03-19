/**
 * Goal domain functions.
 *
 * All reads and writes go through the storage adapter.
 * No React imports — these are pure domain functions usable anywhere.
 */

import { GoalItem, GoalTimeframe, Todo, WeekData } from '../types';
import { storage, LOCAL_STORAGE_KEYS } from '../services/storage';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export const getAllGoalItems = (): GoalItem[] =>
  storage.get<GoalItem[]>(LOCAL_STORAGE_KEYS.GOAL_ITEMS) ?? [];

export const saveGoalItems = (items: GoalItem[]): void =>
  storage.set(LOCAL_STORAGE_KEYS.GOAL_ITEMS, items);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export const createGoalItem = (
  partial: Pick<GoalItem, 'text' | 'timeframe'> & Partial<Omit<GoalItem, 'id' | 'createdAt' | 'updatedAt'>>,
): GoalItem => {
  const now = new Date().toISOString();
  return {
    id: `goal-${Date.now()}`,
    status: 'active',
    order: Date.now(),
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
};

// ---------------------------------------------------------------------------
// Mutations (return new array — caller persists via setGoalItems)
// ---------------------------------------------------------------------------

export const updateGoalItem = (
  id: string,
  changes: Partial<Omit<GoalItem, 'id' | 'createdAt'>>,
  items: GoalItem[],
): GoalItem[] =>
  items.map(item =>
    item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item,
  );

export const completeGoalItem = (id: string, items: GoalItem[]): GoalItem[] => {
  const now = new Date().toISOString();
  return items.map(item =>
    item.id === id ? { ...item, status: 'completed', completedAt: now, updatedAt: now } : item,
  );
};

export const archiveGoalItem = (id: string, items: GoalItem[]): GoalItem[] => {
  const now = new Date().toISOString();
  return items.map(item =>
    item.id === id ? { ...item, status: 'archived', archivedAt: now, updatedAt: now } : item,
  );
};

export const restoreGoalItem = (id: string, items: GoalItem[]): GoalItem[] => {
  const now = new Date().toISOString();
  return items.map(item =>
    item.id === id
      ? { ...item, status: 'active', completedAt: undefined, archivedAt: undefined, updatedAt: now }
      : item,
  );
};

export const deleteGoalItem = (id: string, items: GoalItem[]): GoalItem[] =>
  items.filter(item => item.id !== id);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** All active + completed items for a given timeframe, sorted by order. */
export const getGoalItemsByTimeframe = (
  items: GoalItem[],
  timeframe: GoalTimeframe,
): GoalItem[] =>
  items
    .filter(i => i.timeframe === timeframe && i.status !== 'archived')
    .sort((a, b) => a.order - b.order);

/** Items for a timeframe whose targetDate falls in a given calendar year. */
export const getGoalItemsForYear = (
  items: GoalItem[],
  timeframe: GoalTimeframe,
  year: number,
): GoalItem[] =>
  getGoalItemsByTimeframe(items, timeframe).filter(i => {
    if (!i.targetDate) return false;
    return parseInt(i.targetDate.slice(0, 4), 10) === year;
  });

/**
 * Returns active one_year goals + active monthly goals for the current month.
 * Used to populate the Focus Goals panel in WeeklyPlannerView.
 * Capped at 5 items total to keep the sidebar uncluttered.
 */
// ---------------------------------------------------------------------------
// Phase 3 selectors — derive link state from allWeeks at read time.
// Todo.parentGoalId is the sole persisted source of truth for links.
// GoalItem.linkedWeeklyGoalIds is @deprecated and never written here.
// ---------------------------------------------------------------------------

/** All Todos across every week that link to a given GoalItem. */
export const getTodosLinkedToGoal = (
  goalId: string,
  allWeeks: Record<string, WeekData>,
): Todo[] => {
  const result: Todo[] = [];
  for (const week of Object.values(allWeeks)) {
    for (const todo of [...week.goals.business, ...week.goals.personal]) {
      if (todo.parentGoalId === goalId) result.push(todo);
    }
  }
  return result;
};

export const getLinkedTodoCount = (
  goalId: string,
  allWeeks: Record<string, WeekData>,
): number => getTodosLinkedToGoal(goalId, allWeeks).length;

export const getCompletedLinkedTodoCount = (
  goalId: string,
  allWeeks: Record<string, WeekData>,
): number => getTodosLinkedToGoal(goalId, allWeeks).filter(t => t.done).length;

export interface GoalProgress {
  /** Total Todos linked to this goal across all weeks. */
  linked: number;
  /** Linked Todos that are marked done. */
  completed: number;
  /** True only when linked > 0 and every linked Todo is done. */
  allDone: boolean;
}

/**
 * Derives goal progress from weekly Todo state.
 * Does NOT auto-complete the GoalItem — caller may surface allDone as a hint.
 */
export const getGoalProgress = (
  goalId: string,
  allWeeks: Record<string, WeekData>,
): GoalProgress => {
  const todos = getTodosLinkedToGoal(goalId, allWeeks);
  const completed = todos.filter(t => t.done).length;
  return { linked: todos.length, completed, allDone: todos.length > 0 && completed === todos.length };
};

export const isGoalFullyCompleted = (
  goalId: string,
  allWeeks: Record<string, WeekData>,
): boolean => getGoalProgress(goalId, allWeeks).allDone;

// ---------------------------------------------------------------------------
// Phase 4B selectors — daily task linkage.
// DailyPlan.todos use the same Todo.parentGoalId field as weekly goals.
// ---------------------------------------------------------------------------

/** All daily Todos across every week that link to a given GoalItem. */
export const getDailyTodosLinkedToGoal = (
  goalId: string,
  allWeeks: Record<string, WeekData>,
): Todo[] => {
  const result: Todo[] = [];
  for (const week of Object.values(allWeeks)) {
    for (const dayPlan of Object.values(week.dailyPlans)) {
      for (const todo of dayPlan.todos) {
        if (todo.parentGoalId === goalId) result.push(todo);
      }
    }
  }
  return result;
};

export const getLinkedDailyTodoCount = (
  goalId: string,
  allWeeks: Record<string, WeekData>,
): number => getDailyTodosLinkedToGoal(goalId, allWeeks).length;

export const getCompletedLinkedDailyTodoCount = (
  goalId: string,
  allWeeks: Record<string, WeekData>,
): number => getDailyTodosLinkedToGoal(goalId, allWeeks).filter(t => t.done).length;

export interface GoalExecutionSummary {
  /** Weekly goal Todos (week.goals.business / .personal) linked to this goal. */
  weekly: { linked: number; completed: number };
  /** Daily task Todos (week.dailyPlans[dateKey].todos) linked to this goal. */
  daily: { linked: number; completed: number };
  /** Combined across both layers. */
  total: { linked: number; completed: number; allDone: boolean };
}

/**
 * Derives combined weekly + daily execution progress for a GoalItem.
 * Does NOT auto-complete the GoalItem — caller may surface allDone as a hint.
 */
export const getGoalExecutionSummary = (
  goalId: string,
  allWeeks: Record<string, WeekData>,
): GoalExecutionSummary => {
  const weeklyTodos = getTodosLinkedToGoal(goalId, allWeeks);
  const dailyTodos = getDailyTodosLinkedToGoal(goalId, allWeeks);
  const weeklyCompleted = weeklyTodos.filter(t => t.done).length;
  const dailyCompleted = dailyTodos.filter(t => t.done).length;
  const totalLinked = weeklyTodos.length + dailyTodos.length;
  const totalCompleted = weeklyCompleted + dailyCompleted;
  return {
    weekly: { linked: weeklyTodos.length, completed: weeklyCompleted },
    daily: { linked: dailyTodos.length, completed: dailyCompleted },
    total: {
      linked: totalLinked,
      completed: totalCompleted,
      allDone: totalLinked > 0 && totalCompleted === totalLinked,
    },
  };
};

export const getFocusGoalItems = (items: GoalItem[], currentDate: Date): GoalItem[] => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  const annual = items.filter(i => i.status === 'active' && i.timeframe === 'one_year');
  const monthly = items.filter(
    i =>
      i.status === 'active' &&
      i.timeframe === 'monthly' &&
      (i.targetDate?.startsWith(monthPrefix) ?? false),
  );

  return [...annual, ...monthly].slice(0, 5);
};
