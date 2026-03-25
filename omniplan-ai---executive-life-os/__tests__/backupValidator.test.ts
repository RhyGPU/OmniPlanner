/**
 * Unit tests for utils/backupValidator.ts
 *
 * validateBackup() is a pure function — no mocking required.
 */

import { describe, it, expect } from 'vitest';
import { validateBackup } from '../utils/backupValidator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModernBackup(data: Record<string, unknown> = {}) {
  return {
    version: '3.0',
    exportDate: '2025-01-01T00:00:00.000Z',
    data: {
      allWeeks: {},
      emails: [],
      lifeGoals: null,
      goalItems: [],
      ...data,
    },
  };
}

function makeWeekEntry(overrides: Record<string, unknown> = {}) {
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

// ---------------------------------------------------------------------------
// Null / primitive inputs
// ---------------------------------------------------------------------------

describe('validateBackup — null/primitive inputs', () => {
  it('rejects null', () => {
    const r = validateBackup(null);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('rejects undefined', () => {
    const r = validateBackup(undefined);
    expect(r.valid).toBe(false);
  });

  it('rejects a plain string', () => {
    const r = validateBackup('not-json');
    expect(r.valid).toBe(false);
  });

  it('rejects an array at root level', () => {
    const r = validateBackup([]);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/array/i);
  });

  it('rejects a number', () => {
    const r = validateBackup(42);
    expect(r.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Modern format (v3.0)
// ---------------------------------------------------------------------------

describe('validateBackup — modern format', () => {
  it('accepts a well-formed modern backup', () => {
    const r = validateBackup(makeModernBackup());
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('warns when version is not 3.0 but does not reject', () => {
    const backup = { ...makeModernBackup(), version: '2.0' };
    const r = validateBackup(backup);
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.includes('2.0'))).toBe(true);
  });

  it('rejects when data field is an array', () => {
    const backup = { version: '3.0', exportDate: '', data: [] };
    const r = validateBackup(backup);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/data.*object/i);
  });

  it('accepts backup with valid week entries', () => {
    const backup = makeModernBackup({
      allWeeks: { '2025-01-06': makeWeekEntry() },
      goalItems: [{ id: 'g1', text: 'Ship it', timeframe: 'weekly', status: 'active', order: 0, createdAt: '', updatedAt: '' }],
    });
    const r = validateBackup(backup);
    expect(r.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Legacy format
// ---------------------------------------------------------------------------

describe('validateBackup — legacy format', () => {
  it('accepts a legacy backup with allWeeks at root', () => {
    const backup = { allWeeks: {}, emails: [], lifeGoals: null };
    const r = validateBackup(backup);
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.toLowerCase().includes('legacy'))).toBe(true);
  });

  it('accepts a legacy backup with only the emails key', () => {
    const backup = { emails: [] };
    const r = validateBackup(backup);
    expect(r.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unrecognized format
// ---------------------------------------------------------------------------

describe('validateBackup — unrecognized format', () => {
  it('rejects an object with no recognized fields', () => {
    const r = validateBackup({ foo: 'bar', baz: 123 });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/recognizable/i);
  });
});

// ---------------------------------------------------------------------------
// allWeeks validation
// ---------------------------------------------------------------------------

describe('validateBackup — allWeeks field', () => {
  it('rejects allWeeks as an array', () => {
    const backup = makeModernBackup({ allWeeks: [] });
    const r = validateBackup(backup);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('allWeeks'))).toBe(true);
  });

  it('rejects a week entry that is not an object', () => {
    const backup = makeModernBackup({ allWeeks: { '2025-01-06': 'bad' } });
    const r = validateBackup(backup);
    expect(r.valid).toBe(false);
  });

  it('rejects a week entry with malformed weekStartDate', () => {
    const backup = makeModernBackup({
      allWeeks: { '2025-01-06': makeWeekEntry({ weekStartDate: 'not-a-date' }) },
    });
    const r = validateBackup(backup);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('weekStartDate'))).toBe(true);
  });

  it('rejects a week entry with missing goals', () => {
    const backup = makeModernBackup({
      allWeeks: { '2025-01-06': makeWeekEntry({ goals: null }) },
    });
    const r = validateBackup(backup);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('goals'))).toBe(true);
  });

  it('warns on spot-check limit exceeded', () => {
    const weeks: Record<string, unknown> = {};
    for (let i = 0; i < 15; i++) {
      const d = `2025-0${(i % 9) + 1}-0${(i % 7) + 1}`;
      weeks[d] = makeWeekEntry({ weekStartDate: '2025-01-06' });
    }
    const backup = makeModernBackup({ allWeeks: weeks });
    const r = validateBackup(backup);
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.includes('Spot-checked'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// goalItems validation
// ---------------------------------------------------------------------------

describe('validateBackup — goalItems field', () => {
  it('rejects goalItems as a non-array non-null value', () => {
    const backup = makeModernBackup({ goalItems: 'bad' });
    const r = validateBackup(backup);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('goalItems'))).toBe(true);
  });

  it('warns when a goal item has unexpected shape', () => {
    const backup = makeModernBackup({ goalItems: [{ broken: true }] });
    const r = validateBackup(backup);
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.includes('goal item'))).toBe(true);
  });

  it('accepts well-formed goalItems', () => {
    const goalItem = { id: 'g1', text: 'Run a marathon', timeframe: 'one_year', status: 'active', order: 0, createdAt: '', updatedAt: '' };
    const backup = makeModernBackup({ goalItems: [goalItem] });
    const r = validateBackup(backup);
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.includes('goal item'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Empty backup warning
// ---------------------------------------------------------------------------

describe('validateBackup — empty backup', () => {
  it('warns when all counts are zero', () => {
    const backup = makeModernBackup({ allWeeks: {}, emails: [], goalItems: [] });
    const r = validateBackup(backup);
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.includes('no planner data'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// emails validation
// ---------------------------------------------------------------------------

describe('validateBackup — emails field', () => {
  it('rejects emails as an object', () => {
    const backup = makeModernBackup({ emails: {} });
    const r = validateBackup(backup);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('emails'))).toBe(true);
  });

  it('accepts emails as an empty array', () => {
    const backup = makeModernBackup({ emails: [] });
    const r = validateBackup(backup);
    expect(r.valid).toBe(true);
  });
});
