/**
 * Unit tests for utils/planningIntelligence.ts
 *
 * All selectors are pure — no mocking required.
 */

import { describe, it, expect } from 'vitest';
import {
  getUnscheduledWeeklyLinkedTodos,
  getUnscheduledDailyLinkedTodos,
  getGoalCalendarSupport,
  getGoalsWithoutCalendarSupport,
  getGoalExecutionCoverage,
  getWeeklyFocusBlockCount,
  getWeeklyScheduledMinutes,
} from '../utils/planningIntelligence';
import type { WeekData, GoalItem, CalendarEvent, Todo } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWeek(overrides: Partial<WeekData> = {}): WeekData {
  return {
    weekStartDate: '2025-01-06',
    weekEndDate: '2025-01-12',
    goals: { business: [], personal: [] },
    dailyPlans: {},
    meetings: [],
    notes: '',
    habits: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeGoal(id: string, overrides: Partial<GoalItem> = {}): GoalItem {
  return {
    id,
    text: 'Goal text',
    timeframe: 'one_year',
    order: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTodo(id: string, overrides: Partial<Todo> = {}): Todo {
  return { id, text: 'A task', done: false, ...overrides };
}

function makeFocusEvent(id: string, goalId?: string, todoId?: string, duration = 1): CalendarEvent {
  return {
    id,
    title: 'Focus block',
    startHour: 9,
    duration,
    color: 'bg-blue-50 border-blue-200',
    eventKind: 'focus',
    parentGoalId: goalId,
    linkedTodoId: todoId,
  };
}

function makeTaskBlockEvent(id: string, duration = 1.5): CalendarEvent {
  return {
    id,
    title: 'Task block',
    startHour: 10,
    duration,
    color: 'bg-purple-50 border-purple-200',
    eventKind: 'task_block',
  };
}

function makeMeetingEvent(id: string): CalendarEvent {
  return {
    id,
    title: 'Standup',
    startHour: 11,
    duration: 0.5,
    color: 'bg-green-50 border-green-200',
    eventKind: 'meeting',
  };
}

// ---------------------------------------------------------------------------
// getUnscheduledWeeklyLinkedTodos
// ---------------------------------------------------------------------------

describe('getUnscheduledWeeklyLinkedTodos', () => {
  it('returns empty array when no weekly goals', () => {
    const week = makeWeek();
    expect(getUnscheduledWeeklyLinkedTodos(week)).toHaveLength(0);
  });

  it('returns todos with parentGoalId that have no calendar block', () => {
    const todo = makeTodo('t1', { parentGoalId: 'g1' });
    const week = makeWeek({
      goals: { business: [todo], personal: [] },
      dailyPlans: { '2025-01-06': { todos: [], notes: '', events: [] } },
    });
    const result = getUnscheduledWeeklyLinkedTodos(week);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t1');
  });

  it('excludes done todos', () => {
    const todo = makeTodo('t1', { parentGoalId: 'g1', done: true });
    const week = makeWeek({ goals: { business: [todo], personal: [] } });
    expect(getUnscheduledWeeklyLinkedTodos(week)).toHaveLength(0);
  });

  it('excludes todos without parentGoalId', () => {
    const todo = makeTodo('t1');
    const week = makeWeek({ goals: { business: [todo], personal: [] } });
    expect(getUnscheduledWeeklyLinkedTodos(week)).toHaveLength(0);
  });

  it('excludes todos that have a matching calendar block (by linkedTodoId)', () => {
    const todo = makeTodo('t1', { parentGoalId: 'g1' });
    const evt = makeFocusEvent('e1', 'g1', 't1');
    const week = makeWeek({
      goals: { business: [todo], personal: [] },
      dailyPlans: { '2025-01-06': { todos: [], notes: '', events: [evt] } },
    });
    expect(getUnscheduledWeeklyLinkedTodos(week)).toHaveLength(0);
  });

  it('excludes todos covered by a block with matching parentGoalId (coarse check)', () => {
    const todo = makeTodo('t1', { parentGoalId: 'g1' });
    const evt = makeFocusEvent('e1', 'g1'); // no linkedTodoId, but parentGoalId matches
    const week = makeWeek({
      goals: { business: [todo], personal: [] },
      dailyPlans: { '2025-01-06': { todos: [], notes: '', events: [evt] } },
    });
    expect(getUnscheduledWeeklyLinkedTodos(week)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getUnscheduledDailyLinkedTodos
// ---------------------------------------------------------------------------

describe('getUnscheduledDailyLinkedTodos', () => {
  it('returns empty when no daily plans', () => {
    expect(getUnscheduledDailyLinkedTodos(makeWeek())).toHaveLength(0);
  });

  it('returns daily linked todos with no block on that day', () => {
    const todo = makeTodo('t1', { parentGoalId: 'g1' });
    const week = makeWeek({
      dailyPlans: {
        '2025-01-06': { todos: [todo], notes: '', events: [] },
      },
    });
    const result = getUnscheduledDailyLinkedTodos(week);
    expect(result).toHaveLength(1);
    expect(result[0].todo.id).toBe('t1');
    expect(result[0].dateKey).toBe('2025-01-06');
    expect(result[0].source).toBe('daily');
  });

  it('excludes daily todos that are done', () => {
    const todo = makeTodo('t1', { parentGoalId: 'g1', done: true });
    const week = makeWeek({
      dailyPlans: { '2025-01-06': { todos: [todo], notes: '', events: [] } },
    });
    expect(getUnscheduledDailyLinkedTodos(week)).toHaveLength(0);
  });

  it('excludes daily todos without parentGoalId', () => {
    const todo = makeTodo('t1');
    const week = makeWeek({
      dailyPlans: { '2025-01-06': { todos: [todo], notes: '', events: [] } },
    });
    expect(getUnscheduledDailyLinkedTodos(week)).toHaveLength(0);
  });

  it('excludes daily todos that have a block on the same day', () => {
    const todo = makeTodo('t1', { parentGoalId: 'g1' });
    const evt = makeFocusEvent('e1', 'g1', 't1');
    const week = makeWeek({
      dailyPlans: { '2025-01-06': { todos: [todo], notes: '', events: [evt] } },
    });
    expect(getUnscheduledDailyLinkedTodos(week)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getGoalCalendarSupport
// ---------------------------------------------------------------------------

describe('getGoalCalendarSupport', () => {
  it('returns 0 when no daily plans', () => {
    expect(getGoalCalendarSupport('g1', makeWeek())).toBe(0);
  });

  it('returns 0 when no blocks link to the goal', () => {
    const evt = makeFocusEvent('e1', 'g2'); // different goal
    const week = makeWeek({
      dailyPlans: { '2025-01-06': { todos: [], notes: '', events: [evt] } },
    });
    expect(getGoalCalendarSupport('g1', week)).toBe(0);
  });

  it('sums duration * 60 for blocks with matching parentGoalId', () => {
    const e1 = makeFocusEvent('e1', 'g1', undefined, 1);   // 60 min
    const e2 = makeFocusEvent('e2', 'g1', undefined, 1.5); // 90 min
    const week = makeWeek({
      dailyPlans: {
        '2025-01-06': { todos: [], notes: '', events: [e1] },
        '2025-01-07': { todos: [], notes: '', events: [e2] },
      },
    });
    expect(getGoalCalendarSupport('g1', week)).toBe(150);
  });

  it('ignores blocks for other goals', () => {
    const e1 = makeFocusEvent('e1', 'g1', undefined, 2); // 120 min
    const e2 = makeFocusEvent('e2', 'g2', undefined, 1); // different goal
    const week = makeWeek({
      dailyPlans: { '2025-01-06': { todos: [], notes: '', events: [e1, e2] } },
    });
    expect(getGoalCalendarSupport('g1', week)).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// getGoalsWithoutCalendarSupport
// ---------------------------------------------------------------------------

describe('getGoalsWithoutCalendarSupport', () => {
  it('returns empty when no goals', () => {
    expect(getGoalsWithoutCalendarSupport([], makeWeek())).toHaveLength(0);
  });

  it('excludes inactive goals', () => {
    const goal = makeGoal('g1', { status: 'archived' });
    expect(getGoalsWithoutCalendarSupport([goal], makeWeek())).toHaveLength(0);
  });

  it('excludes active goals with no linked work', () => {
    const goal = makeGoal('g1');
    // No todos link to g1
    const week = makeWeek({
      goals: { business: [makeTodo('t1')], personal: [] }, // unlinked todo
    });
    expect(getGoalsWithoutCalendarSupport([goal], week)).toHaveLength(0);
  });

  it('returns active goals that have linked work but no calendar block', () => {
    const goal = makeGoal('g1');
    const todo = makeTodo('t1', { parentGoalId: 'g1' });
    const week = makeWeek({
      goals: { business: [todo], personal: [] },
    });
    const result = getGoalsWithoutCalendarSupport([goal], week);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('g1');
  });

  it('excludes goals that have calendar support', () => {
    const goal = makeGoal('g1');
    const todo = makeTodo('t1', { parentGoalId: 'g1' });
    const evt = makeFocusEvent('e1', 'g1');
    const week = makeWeek({
      goals: { business: [todo], personal: [] },
      dailyPlans: { '2025-01-06': { todos: [], notes: '', events: [evt] } },
    });
    expect(getGoalsWithoutCalendarSupport([goal], week)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getGoalExecutionCoverage
// ---------------------------------------------------------------------------

describe('getGoalExecutionCoverage', () => {
  it('returns zero coverage for a goal with no linked todos or blocks', () => {
    const coverage = getGoalExecutionCoverage('g1', makeWeek());
    expect(coverage.goalId).toBe('g1');
    expect(coverage.scheduledMinutes).toBe(0);
    expect(coverage.linkedTodoCount).toBe(0);
    expect(coverage.scheduledTodoCount).toBe(0);
  });

  it('counts linked todos from weekly goals', () => {
    const todo = makeTodo('t1', { parentGoalId: 'g1' });
    const week = makeWeek({ goals: { business: [todo], personal: [] } });
    const coverage = getGoalExecutionCoverage('g1', week);
    expect(coverage.linkedTodoCount).toBe(1);
    expect(coverage.scheduledTodoCount).toBe(0);
  });

  it('increments scheduledTodoCount when a todo has a block', () => {
    const todo = makeTodo('t1', { parentGoalId: 'g1' });
    const evt = makeFocusEvent('e1', 'g1', 't1');
    const week = makeWeek({
      goals: { business: [todo], personal: [] },
      dailyPlans: { '2025-01-06': { todos: [], notes: '', events: [evt] } },
    });
    const coverage = getGoalExecutionCoverage('g1', week);
    expect(coverage.linkedTodoCount).toBe(1);
    expect(coverage.scheduledTodoCount).toBe(1);
    expect(coverage.scheduledMinutes).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// getWeeklyFocusBlockCount
// ---------------------------------------------------------------------------

describe('getWeeklyFocusBlockCount', () => {
  it('returns 0 for an empty week', () => {
    expect(getWeeklyFocusBlockCount(makeWeek())).toBe(0);
  });

  it('counts focus events', () => {
    const evt = makeFocusEvent('e1');
    const week = makeWeek({
      dailyPlans: { '2025-01-06': { todos: [], notes: '', events: [evt] } },
    });
    expect(getWeeklyFocusBlockCount(week)).toBe(1);
  });

  it('counts task_block events', () => {
    const evt = makeTaskBlockEvent('e1');
    const week = makeWeek({
      dailyPlans: { '2025-01-06': { todos: [], notes: '', events: [evt] } },
    });
    expect(getWeeklyFocusBlockCount(week)).toBe(1);
  });

  it('does not count meeting events', () => {
    const evt = makeMeetingEvent('e1');
    const week = makeWeek({
      dailyPlans: { '2025-01-06': { todos: [], notes: '', events: [evt] } },
    });
    expect(getWeeklyFocusBlockCount(week)).toBe(0);
  });

  it('counts across multiple days', () => {
    const e1 = makeFocusEvent('e1');
    const e2 = makeTaskBlockEvent('e2');
    const week = makeWeek({
      dailyPlans: {
        '2025-01-06': { todos: [], notes: '', events: [e1] },
        '2025-01-07': { todos: [], notes: '', events: [e2] },
      },
    });
    expect(getWeeklyFocusBlockCount(week)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getWeeklyScheduledMinutes
// ---------------------------------------------------------------------------

describe('getWeeklyScheduledMinutes', () => {
  it('returns 0 for an empty week', () => {
    expect(getWeeklyScheduledMinutes(makeWeek())).toBe(0);
  });

  it('sums focus event duration * 60', () => {
    const e1 = makeFocusEvent('e1', undefined, undefined, 1);   // 60 min
    const e2 = makeFocusEvent('e2', undefined, undefined, 1.5); // 90 min
    const week = makeWeek({
      dailyPlans: {
        '2025-01-06': { todos: [], notes: '', events: [e1, e2] },
      },
    });
    expect(getWeeklyScheduledMinutes(week)).toBe(150);
  });

  it('includes task_block events', () => {
    const evt = makeTaskBlockEvent('e1'); // duration 1.5 → 90 min
    const week = makeWeek({
      dailyPlans: { '2025-01-06': { todos: [], notes: '', events: [evt] } },
    });
    expect(getWeeklyScheduledMinutes(week)).toBe(90);
  });

  it('excludes meetings from the total', () => {
    const focus = makeFocusEvent('e1', undefined, undefined, 1); // 60 min
    const meeting = makeMeetingEvent('e2');
    const week = makeWeek({
      dailyPlans: {
        '2025-01-06': { todos: [], notes: '', events: [focus, meeting] },
      },
    });
    expect(getWeeklyScheduledMinutes(week)).toBe(60);
  });
});
