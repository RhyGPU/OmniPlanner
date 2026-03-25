/**
 * Unit tests for services/storage/migrations.ts
 *
 * We mock the storage module so migration logic can be tested without
 * real localStorage / IndexedDB. Each test controls what storage.get()
 * returns and asserts what storage.set() is called with.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Storage mock — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockStore: Record<string, unknown> = {};

vi.mock('../services/storage/index', () => {
  const LOCAL_STORAGE_KEYS = {
    ALL_WEEKS: 'omni_all_weeks',
    EMAILS: 'omni_emails',
    LIFE_GOALS: 'omni_lifegoals',
    AI_SETTINGS: 'omni_ai_settings',
    EMAIL_ACCOUNTS: 'omni_email_accounts',
    ZOOM_LEVELS: 'omni_zoom_levels',
    GOALS_BASE_YEARS: 'omni_goals_base_years',
    GOAL_ITEMS: 'omni_goal_items',
    SCHEMA_VERSION: 'omni_schema_version',
    NOTIFICATION_SETTINGS: 'omni_notification_settings',
    ONBOARDING_DISMISSED: 'omni_onboarding_dismissed',
  } as const;

  const storage = {
    get: vi.fn(<T>(key: string): T | null => {
      const v = mockStore[key];
      return (v !== undefined ? v : null) as T | null;
    }),
    set: vi.fn(<T>(key: string, value: T): void => {
      mockStore[key] = value;
    }),
    remove: vi.fn((key: string): void => { delete mockStore[key]; }),
    keys: vi.fn((): string[] => Object.keys(mockStore)),
  };

  return { storage, LOCAL_STORAGE_KEYS };
});

// Import after mock registration
import { runMigrations } from '../services/storage/migrations';
import { storage, LOCAL_STORAGE_KEYS } from '../services/storage/index';

const mockSet = storage.set as ReturnType<typeof vi.fn>;
const mockGet = storage.get as ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Clear the mock store and call history before each test
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  vi.clearAllMocks();
  // Re-wire get to still read from mockStore after clearAllMocks
  mockGet.mockImplementation(<T>(key: string): T | null => {
    const v = mockStore[key];
    return (v !== undefined ? v : null) as T | null;
  });
  mockSet.mockImplementation(<T>(key: string, value: T): void => {
    mockStore[key] = value;
  });
});

// ---------------------------------------------------------------------------
// runMigrations — version gating
// ---------------------------------------------------------------------------

describe('runMigrations — version gating', () => {
  it('skips all migrations when already at CURRENT_SCHEMA_VERSION (3)', () => {
    mockStore[LOCAL_STORAGE_KEYS.SCHEMA_VERSION] = 3;
    runMigrations();
    // set() should not be called if all migrations are skipped
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('runs from version 0 and writes schema version after each migration', () => {
    // No schema version in store → starts at 0
    // No data to migrate, so the only set() calls are the version bumps
    runMigrations();
    // Should have written schema version 1, 2, 3
    const versionCalls = mockSet.mock.calls
      .filter(([k]) => k === LOCAL_STORAGE_KEYS.SCHEMA_VERSION)
      .map(([, v]) => v);
    expect(versionCalls).toEqual([1, 2, 3]);
  });

  it('runs only pending migrations when partially applied', () => {
    mockStore[LOCAL_STORAGE_KEYS.SCHEMA_VERSION] = 2;
    runMigrations();
    // Only version 3 should be written
    const versionCalls = mockSet.mock.calls
      .filter(([k]) => k === LOCAL_STORAGE_KEYS.SCHEMA_VERSION)
      .map(([, v]) => v);
    expect(versionCalls).toEqual([3]);
  });
});

// ---------------------------------------------------------------------------
// v1 — migrateGoalsToTodos
// ---------------------------------------------------------------------------

describe('v1 — migrateGoalsToTodos', () => {
  it('converts string[] business goals to Todo[] objects', () => {
    mockStore[LOCAL_STORAGE_KEYS.SCHEMA_VERSION] = 0;
    mockStore[LOCAL_STORAGE_KEYS.ALL_WEEKS] = {
      '2025-01-06': {
        weekStartDate: '2025-01-06',
        goals: { business: ['Ship v1', 'Write tests'], personal: [] },
        dailyPlans: {},
        meetings: [],
        notes: '',
        habits: [],
      },
    };

    runMigrations();

    const saved = mockStore[LOCAL_STORAGE_KEYS.ALL_WEEKS] as Record<string, { goals: { business: Array<{ id: string; text: string; done: boolean }> } }>;
    const business = saved['2025-01-06'].goals.business;
    expect(Array.isArray(business)).toBe(true);
    expect(business[0]).toMatchObject({ text: 'Ship v1', done: false });
    expect(business[1]).toMatchObject({ text: 'Write tests', done: false });
    expect(typeof business[0].id).toBe('string');
  });

  it('does not modify already-migrated Todo[] goals (idempotency)', () => {
    const existingGoal = { id: 'bg-existing-0', text: 'Ship v1', done: false };
    mockStore[LOCAL_STORAGE_KEYS.SCHEMA_VERSION] = 0;
    mockStore[LOCAL_STORAGE_KEYS.ALL_WEEKS] = {
      '2025-01-06': {
        weekStartDate: '2025-01-06',
        goals: { business: [existingGoal], personal: [] },
        dailyPlans: {},
        meetings: [],
        notes: '',
        habits: [],
      },
    };

    runMigrations();

    // ALL_WEEKS should NOT be rewritten since first element was already an object
    const allWeeksCalls = mockSet.mock.calls.filter(([k]) => k === LOCAL_STORAGE_KEYS.ALL_WEEKS);
    expect(allWeeksCalls).toHaveLength(0);
  });

  it('no-ops when allWeeks is null', () => {
    mockStore[LOCAL_STORAGE_KEYS.SCHEMA_VERSION] = 0;
    // allWeeks not in store → null
    runMigrations();
    // Should not write all weeks
    const allWeeksCalls = mockSet.mock.calls.filter(([k]) => k === LOCAL_STORAGE_KEYS.ALL_WEEKS);
    expect(allWeeksCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// v3 — normaliseIdsToStrings
// ---------------------------------------------------------------------------

describe('v3 — normaliseIdsToStrings', () => {
  it('converts numeric Todo.id values to strings', () => {
    mockStore[LOCAL_STORAGE_KEYS.SCHEMA_VERSION] = 2;
    mockStore[LOCAL_STORAGE_KEYS.ALL_WEEKS] = {
      '2025-01-06': {
        weekStartDate: '2025-01-06',
        goals: {
          business: [{ id: 1234567890, text: 'Task', done: false }],
          personal: [],
        },
        meetings: [],
        dailyPlans: {
          '2025-01-06': {
            todos: [{ id: 9876543210, text: 'Daily task', done: false }],
            notes: '',
            events: [],
          },
        },
        habits: [],
        notes: '',
      },
    };

    runMigrations();

    const saved = mockStore[LOCAL_STORAGE_KEYS.ALL_WEEKS] as Record<string, {
      goals: { business: Array<{ id: unknown }> };
      dailyPlans: Record<string, { todos: Array<{ id: unknown }> }>;
    }>;
    expect(saved['2025-01-06'].goals.business[0].id).toBe('1234567890');
    expect(saved['2025-01-06'].dailyPlans['2025-01-06'].todos[0].id).toBe('9876543210');
  });

  it('converts numeric CalendarEvent.id and linkedTodoId to strings', () => {
    mockStore[LOCAL_STORAGE_KEYS.SCHEMA_VERSION] = 2;
    mockStore[LOCAL_STORAGE_KEYS.ALL_WEEKS] = {
      '2025-01-06': {
        weekStartDate: '2025-01-06',
        goals: { business: [], personal: [] },
        meetings: [],
        dailyPlans: {
          '2025-01-06': {
            todos: [],
            notes: '',
            events: [
              {
                id: 1700000000000,
                title: 'Focus',
                startHour: 9,
                duration: 1,
                color: 'bg-blue-50',
                linkedTodoId: 1700000000001,
              },
            ],
          },
        },
        habits: [],
        notes: '',
      },
    };

    runMigrations();

    const saved = mockStore[LOCAL_STORAGE_KEYS.ALL_WEEKS] as Record<string, {
      dailyPlans: Record<string, { events: Array<{ id: unknown; linkedTodoId: unknown }> }>;
    }>;
    const evt = saved['2025-01-06'].dailyPlans['2025-01-06'].events[0];
    expect(evt.id).toBe('1700000000000');
    expect(evt.linkedTodoId).toBe('1700000000001');
  });

  it('is idempotent — string IDs are not changed', () => {
    mockStore[LOCAL_STORAGE_KEYS.SCHEMA_VERSION] = 2;
    const existingEvent = {
      id: 'evt-already-string',
      title: 'Focus',
      startHour: 9,
      duration: 1,
      color: 'bg-blue-50',
      linkedTodoId: 'todo-already-string',
    };
    mockStore[LOCAL_STORAGE_KEYS.ALL_WEEKS] = {
      '2025-01-06': {
        weekStartDate: '2025-01-06',
        goals: { business: [], personal: [] },
        meetings: [],
        dailyPlans: {
          '2025-01-06': { todos: [], notes: '', events: [existingEvent] },
        },
        habits: [],
        notes: '',
      },
    };

    runMigrations();

    // No changes → ALL_WEEKS should not be rewritten
    const allWeeksCalls = mockSet.mock.calls.filter(([k]) => k === LOCAL_STORAGE_KEYS.ALL_WEEKS);
    expect(allWeeksCalls).toHaveLength(0);
  });

  it('no-ops when allWeeks is null', () => {
    mockStore[LOCAL_STORAGE_KEYS.SCHEMA_VERSION] = 2;
    runMigrations();
    const allWeeksCalls = mockSet.mock.calls.filter(([k]) => k === LOCAL_STORAGE_KEYS.ALL_WEEKS);
    expect(allWeeksCalls).toHaveLength(0);
  });
});
