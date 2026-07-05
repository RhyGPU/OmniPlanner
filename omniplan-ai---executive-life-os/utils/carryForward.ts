/**
 * Monday carry-forward ritual — domain logic.
 *
 * Week isolation is deliberate: regular todos die with their week so backlogs
 * never snowball. But GOAL-LINKED todos represent commitments to a life goal;
 * letting those vanish silently means goals stall while every week "feels"
 * clean. This module finds last week's unfinished goal-linked todos so the
 * user can decide their fate — carry, reschedule, or drop — in one 30-second
 * pass. A decision ritual, not a guilt list.
 *
 * Pure functions only: no React, no storage. App.tsx owns the once-per-week
 * trigger flag (LOCAL_STORAGE_KEYS.CARRY_FORWARD_WEEK) and applies decisions
 * through its normal setAllWeeks flow.
 */

import type { WeekData, Todo, GoalItem } from '../types';

export interface CarryForwardCandidate {
  todo: Todo;
  /** Where the todo lived last week: a date key for daily todos, or a
   *  weekly-goals section. Used for display and for de-duplication. */
  source: { kind: 'daily'; dateKey: string } | { kind: 'weekly'; section: 'business' | 'personal' };
  /** Human label for the source, e.g. "Tue 7/1" or "Weekly · Business". */
  sourceLabel: string;
}

export interface CarryForwardGroup {
  goalId: string;
  /** Goal text, or a fallback label when the goal was deleted/archived. */
  goalText: string;
  items: CarryForwardCandidate[];
}

/** What the user chose for a single candidate. */
export interface CarryForwardDecision {
  candidate: CarryForwardCandidate;
  /** 'carry' → Monday of the new week; a dateKey → that specific day; 'drop' → leave behind. */
  action: 'carry' | 'drop' | { rescheduleTo: string };
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dailySourceLabel(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateKey;
  return `${DAY_LABELS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * Collect unfinished goal-linked todos from a week — weekly goal sections
 * first (they are the primary goal commitments), then daily plans in date
 * order. Todos without parentGoalId are intentionally excluded: week
 * isolation remains the rule for unlinked tasks.
 */
export function getCarryForwardCandidates(prevWeek: WeekData | undefined | null): CarryForwardCandidate[] {
  if (!prevWeek) return [];
  const out: CarryForwardCandidate[] = [];

  for (const section of ['business', 'personal'] as const) {
    for (const todo of prevWeek.goals?.[section] ?? []) {
      if (todo.parentGoalId && !todo.done) {
        out.push({
          todo,
          source: { kind: 'weekly', section },
          sourceLabel: `Weekly · ${section === 'business' ? 'Business' : 'Personal'}`,
        });
      }
    }
  }

  for (const dateKey of Object.keys(prevWeek.dailyPlans ?? {}).sort()) {
    for (const todo of prevWeek.dailyPlans[dateKey]?.todos ?? []) {
      if (todo.parentGoalId && !todo.done) {
        out.push({
          todo,
          source: { kind: 'daily', dateKey },
          sourceLabel: dailySourceLabel(dateKey),
        });
      }
    }
  }

  return out;
}

/** Group candidates under their parent goal for display. */
export function groupCandidatesByGoal(
  candidates: CarryForwardCandidate[],
  goalItems: GoalItem[],
): CarryForwardGroup[] {
  const byGoal = new Map<string, CarryForwardGroup>();
  for (const candidate of candidates) {
    const goalId = candidate.todo.parentGoalId!;
    let group = byGoal.get(goalId);
    if (!group) {
      const goal = goalItems.find(g => g.id === goalId);
      group = { goalId, goalText: goal?.text ?? 'Unlinked goal (removed)', items: [] };
      byGoal.set(goalId, group);
    }
    group.items.push(candidate);
  }
  return [...byGoal.values()];
}

/**
 * Build a copy of a carried todo for the new week. Fresh id (so undoing a
 * carry never mutates last week's record), done reset, goal link preserved,
 * schedule metadata cleared (the old week's scheduling no longer applies).
 */
export function buildCarriedTodo(source: Todo): Todo {
  return {
    id: `carry-${source.id}-${Date.now()}`,
    text: source.text,
    done: false,
    parentGoalId: source.parentGoalId,
    priority: source.priority,
  };
}
