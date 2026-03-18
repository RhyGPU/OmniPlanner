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
import type { WeekData } from '../../types';

/** The version this build expects storage to be at. Increment when adding migrations. */
const CURRENT_SCHEMA_VERSION = 1;

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

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Canonicalise weekly goals from string[] to Todo[]',
    run: migrateGoalsToTodos,
  },
  // Add future migrations here:
  // { version: 2, description: '...', run: migrate_v2 },
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
