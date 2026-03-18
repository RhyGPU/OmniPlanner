/**
 * Goal domain functions.
 *
 * All reads and writes go through the storage adapter.
 * No React imports — these are pure domain functions usable anywhere.
 */

import { GoalItem, GoalTimeframe } from '../types';
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
