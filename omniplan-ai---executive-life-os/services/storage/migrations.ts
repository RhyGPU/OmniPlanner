/**
 * Schema migration registry.
 *
 * Call `runMigrations()` once at app startup (before rendering).
 * Each migration runs exactly once, identified by an ascending integer version.
 * `omni_schema_version` in storage tracks the highest applied version.
 *
 * Rules:
 *  - Migrations must be idempotent (safe to run on already-migrated data).
 *  - Never modify or delete a migration after it has shipped — add a new one instead.
 *  - Keep migration logic self-contained; do not import from UI components.
 */

import { storage, LOCAL_STORAGE_KEYS } from './index';
import type { WeekData, LifeGoals, GoalItem } from '../../types';

/** The version this build expects storage to be at. Increment when adding migrations. */
const CURRENT_SCHEMA_VERSION = 2;

interface Migration {
  version: number;
  description: string;
  run(): void;
}

// ---------------------------------------------------------------------------
// Migration implementations
// ---------------------------------------------------------------------------

/**
 * v1 — Canonicalise WeeklyGoals from legacy string[] to Todo[].
 *
 * The original format stored goals as plain strings; v2.0 changed them to
 * `{ id, text, done }` objects. This migration was previously implemented
 * inline in both `weekManager.ts` and `dataManager.ts`. It is now the
 * single authoritative migration so it runs once at startup.
 */
function migrateGoalsToTodos(): void {
  const allWeeks = storage.get<Record<string, WeekData>>(LOCAL_STORAGE_KEYS.ALL_WEEKS);
  if (!allWeeks) return;

  let changed = false;
  for (const key of Object.keys(allWeeks)) {
    const week = allWeeks[key];
    if (!week.goals) continue;
    for (const field of ['business', 'personal'] as const) {
      const arr = week.goals[field];
      // Detect legacy string[] format
      if (arr && arr.length > 0 && typeof (arr as unknown[])[0] === 'string') {
        (week.goals as Record<string, unknown>)[field] = (arr as unknown as string[]).map(
          (text, i) => ({ id: `${field[0]}g-migrated-${i}`, text, done: false }),
        );
        changed = true;
      }
    }
  }

  if (changed) {
    storage.set(LOCAL_STORAGE_KEYS.ALL_WEEKS, allWeeks);
  }
}

/**
 * v2 — Convert LifeGoals text blobs to structured GoalItem records.
 *
 * Maps omni_lifegoals (Record-of-strings by year/month) into typed GoalItem
 * objects stored under omni_goal_items.
 *
 * Idempotent: skips entirely if omni_goal_items already contains items.
 * omni_lifegoals is NOT deleted — retained for old-backup import compatibility.
 */
function migrateLifeGoalsToGoalItems(): void {
  // Idempotency guard: if any goalItems already exist, skip
  const existing = storage.get<GoalItem[]>(LOCAL_STORAGE_KEYS.GOAL_ITEMS);
  if (existing && existing.length > 0) return;

  const lifeGoals = storage.get<LifeGoals>(LOCAL_STORAGE_KEYS.LIFE_GOALS);
  if (!lifeGoals) return;

  const now = new Date().toISOString();
  const items: GoalItem[] = [];

  // '10' -> ten_year: one item per non-empty year entry
  for (const [year, text] of Object.entries(lifeGoals['10'] ?? {})) {
    if (!text?.trim()) continue;
    items.push({
      id: `goal-10y-${year}`,
      text: text.trim(),
      timeframe: 'ten_year',
      order: parseInt(year, 10),
      status: 'active',
      targetDate: `${year}-12-31`,
      createdAt: now,
      updatedAt: now,
    });
  }

  // '5' -> five_year: goal field as text, action field as notes
  for (const [year, data] of Object.entries(lifeGoals['5'] ?? {})) {
    const goalText = (data && typeof data === 'object' ? data.goal : '').trim();
    if (!goalText) continue;
    const actionText = (data && typeof data === 'object' ? data.action : '').trim();
    items.push({
      id: `goal-5y-${year}`,
      text: goalText,
      timeframe: 'five_year',
      order: parseInt(year, 10),
      status: 'active',
      notes: actionText || undefined,
      targetDate: `${year}-12-31`,
      createdAt: now,
      updatedAt: now,
    });
  }

  // '3' -> three_year: key is "year_idx" (idx 0=Q1Q2, 1=Q3, 2=Q4)
  for (const [key, text] of Object.entries(lifeGoals['3'] ?? {})) {
    if (!text?.trim()) continue;
    const [year, idxStr] = key.split('_');
    const idx = parseInt(idxStr ?? '0', 10);
    items.push({
      id: `goal-3y-${key}`,
      text: text.trim(),
      timeframe: 'three_year',
      order: parseInt(year, 10) * 3 + idx,
      status: 'active',
      targetDate: `${year}-12-31`,
      createdAt: now,
      updatedAt: now,
    });
  }

  // '1' -> monthly: key is 'Jan'|'Feb'|...|'Dec'
  const MONTH_KEYS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const currentYear = new Date().getFullYear();
  for (const [month, text] of Object.entries(lifeGoals['1'] ?? {})) {
    if (!text?.trim()) continue;
    const monthIdx = MONTH_KEYS.indexOf(month);
    const mm = String(monthIdx + 1).padStart(2, '0');
    items.push({
      id: `goal-1m-${month}`,
      text: text.trim(),
      timeframe: 'monthly',
      order: monthIdx >= 0 ? monthIdx : 99,
      status: 'active',
      targetDate: `${currentYear}-${mm}-01`,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (items.length > 0) {
    storage.set(LOCAL_STORAGE_KEYS.GOAL_ITEMS, items);
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Canonicalise weekly goals from string[] to Todo[]',
    run: migrateGoalsToTodos,
  },
  {
    version: 2,
    description: 'Convert LifeGoals text blobs to structured GoalItem records',
    run: migrateLifeGoalsToGoalItems,
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Run all pending migrations in ascending version order.
 * Safe to call on every app start — no-ops if already up to date.
 */
export function runMigrations(): void {
  const current = storage.get<number>(LOCAL_STORAGE_KEYS.SCHEMA_VERSION) ?? 0;
  if (current >= CURRENT_SCHEMA_VERSION) return;

  for (const migration of MIGRATIONS) {
    if (migration.version > current) {
      migration.run();
      // Persist progress after each migration so a crash mid-run is recoverable
      storage.set(LOCAL_STORAGE_KEYS.SCHEMA_VERSION, migration.version);
    }
  }
}
