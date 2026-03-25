/**
 * Unit tests for services/storage/onboardingState.ts
 *
 * hasPlannerData() is a pure function — no storage mocking needed.
 * getOnboardingDismissed / setOnboardingDismissed use localStorage (jsdom).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hasPlannerData } from '../services/storage/onboardingState';
import type { WeekData, GoalItem } from '../types';

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

function makeGoal(overrides: Partial<GoalItem> = {}): GoalItem {
  return {
    id: 'g1',
    text: 'Build something',
    timeframe: 'one_year',
    order: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const EMPTY_WEEKS: Record<string, WeekData> = {};
const NO_GOALS: GoalItem[] = [];

// ---------------------------------------------------------------------------
// Empty / blank data
// ---------------------------------------------------------------------------

describe('hasPlannerData — empty state', () => {
  it('returns false for completely empty weeks and goals', () => {
    expect(hasPlannerData(EMPTY_WEEKS, NO_GOALS)).toBe(false);
  });

  it('returns false for a week scaffold with no content', () => {
    const weeks = { '2025-01-06': makeWeek() };
    expect(hasPlannerData(weeks, NO_GOALS)).toBe(false);
  });

  it('returns false for a goal with empty text', () => {
    const goals = [makeGoal({ text: '   ' })];
    expect(hasPlannerData(EMPTY_WEEKS, goals)).toBe(false);
  });

  it('returns false for an archived goal with text', () => {
    const goals = [makeGoal({ status: 'archived' })];
    expect(hasPlannerData(EMPTY_WEEKS, goals)).toBe(false);
  });

  it('returns false for a completed goal with text', () => {
    const goals = [makeGoal({ status: 'completed' })];
    expect(hasPlannerData(EMPTY_WEEKS, goals)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Goal detection
// ---------------------------------------------------------------------------

describe('hasPlannerData — goal signals', () => {
  it('returns true for an active goal with non-empty text', () => {
    const goals = [makeGoal({ status: 'active', text: 'Run a marathon' })];
    expect(hasPlannerData(EMPTY_WEEKS, goals)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Habit detection
// ---------------------------------------------------------------------------

describe('hasPlannerData — habit signals', () => {
  it('returns true for an active, non-archived habit', () => {
    const habit = { id: 'h1', name: 'Morning run', completions: {}, createdAt: Date.now() };
    const weeks = { '2025-01-06': makeWeek({ habits: [habit] }) };
    expect(hasPlannerData(weeks, NO_GOALS)).toBe(true);
  });

  it('returns false for an archived habit', () => {
    const habit = { id: 'h1', name: 'Old habit', completions: {}, createdAt: Date.now(), archived: true };
    const weeks = { '2025-01-06': makeWeek({ habits: [habit] }) };
    expect(hasPlannerData(weeks, NO_GOALS)).toBe(false);
  });

  it('returns false for a deleted habit (has deletedAt)', () => {
    const habit = { id: 'h1', name: 'Deleted habit', completions: {}, createdAt: Date.now(), deletedAt: Date.now() };
    const weeks = { '2025-01-06': makeWeek({ habits: [habit] }) };
    expect(hasPlannerData(weeks, NO_GOALS)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Weekly goal text detection
// ---------------------------------------------------------------------------

describe('hasPlannerData — weekly goal text', () => {
  it('returns true for a non-empty business weekly goal', () => {
    const week = makeWeek({
      goals: {
        business: [{ id: 'b1', text: 'Launch beta', done: false }],
        personal: [],
      },
    });
    expect(hasPlannerData({ '2025-01-06': week }, NO_GOALS)).toBe(true);
  });

  it('returns true for a non-empty personal weekly goal', () => {
    const week = makeWeek({
      goals: {
        business: [],
        personal: [{ id: 'p1', text: 'Read 3 books', done: false }],
      },
    });
    expect(hasPlannerData({ '2025-01-06': week }, NO_GOALS)).toBe(true);
  });

  it('returns false for blank weekly goals', () => {
    const week = makeWeek({
      goals: {
        business: [{ id: 'b1', text: '   ', done: false }],
        personal: [{ id: 'p1', text: '', done: false }],
      },
    });
    expect(hasPlannerData({ '2025-01-06': week }, NO_GOALS)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Meeting detection
// ---------------------------------------------------------------------------

describe('hasPlannerData — meeting signals', () => {
  it('returns true when a meeting has text', () => {
    const week = makeWeek({
      meetings: [{ id: 'm1', text: 'All-hands sync', done: false }],
    });
    expect(hasPlannerData({ '2025-01-06': week }, NO_GOALS)).toBe(true);
  });

  it('returns false for a blank meeting', () => {
    const week = makeWeek({
      meetings: [{ id: 'm1', text: '', done: false }],
    });
    expect(hasPlannerData({ '2025-01-06': week }, NO_GOALS)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Daily plan content detection
// ---------------------------------------------------------------------------

describe('hasPlannerData — daily plan signals', () => {
  it('returns true when focus text is set', () => {
    const week = makeWeek({
      dailyPlans: {
        '2025-01-06': { focus: 'Ship the feature', todos: [], notes: '', events: [] },
      },
    });
    expect(hasPlannerData({ '2025-01-06': week }, NO_GOALS)).toBe(true);
  });

  it('returns false when focus text is blank', () => {
    const week = makeWeek({
      dailyPlans: {
        '2025-01-06': { focus: '  ', todos: [], notes: '', events: [] },
      },
    });
    expect(hasPlannerData({ '2025-01-06': week }, NO_GOALS)).toBe(false);
  });

  it('returns true when a daily todo has text', () => {
    const week = makeWeek({
      dailyPlans: {
        '2025-01-06': {
          todos: [{ id: 't1', text: 'Fix the bug', done: false }],
          notes: '',
          events: [],
        },
      },
    });
    expect(hasPlannerData({ '2025-01-06': week }, NO_GOALS)).toBe(true);
  });

  it('returns true when there is at least one calendar event', () => {
    const week = makeWeek({
      dailyPlans: {
        '2025-01-06': {
          todos: [],
          notes: '',
          events: [{ id: 'e1', title: 'Deep work', startHour: 9, duration: 1, color: 'bg-blue-50 border-blue-200' }],
        },
      },
    });
    expect(hasPlannerData({ '2025-01-06': week }, NO_GOALS)).toBe(true);
  });

  it('returns false for a day with blank focus, empty todos, and no events', () => {
    const week = makeWeek({
      dailyPlans: {
        '2025-01-06': {
          focus: '',        // explicit empty string — avoids undefined !== '' edge case
          todos: [{ id: 't1', text: '', done: false }],
          notes: '',
          events: [],
        },
      },
    });
    expect(hasPlannerData({ '2025-01-06': week }, NO_GOALS)).toBe(false);
  });
});
