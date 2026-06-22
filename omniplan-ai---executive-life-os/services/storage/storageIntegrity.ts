/**
 * Storage corruption detector and recovery.
 *
 * Runs once at startup before migrations. Validates that critical storage keys
 * contain parseable JSON and structurally valid data. If corruption is detected,
 * returns a report so the UI can offer reset or restore-from-backup.
 */

import { storage, LOCAL_STORAGE_KEYS } from './index';

export interface StorageHealthReport {
  healthy: boolean;
  corruptedKeys: string[];
  details: string;
}

/** Creates a healthy report. */
function ok(): StorageHealthReport {
  return { healthy: true, corruptedKeys: [], details: '' };
}

/** Creates an unhealthy report. */
function fail(keys: string[]): StorageHealthReport {
  return {
    healthy: false,
    corruptedKeys: keys,
    details: `Corrupted data found in: ${keys.join(', ')}. You can reset the corrupted keys (other data will be preserved) or restore from a backup.`,
  };
}

/**
 * Validate a single storage key: must be parseable JSON.
 * Returns true if valid or absent (absent is OK — first run).
 */
function validateKey(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return true; // absent = OK
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run storage corruption check on critical keys.
 * Called once at startup before runMigrations().
 */
export function checkStorageHealth(): StorageHealthReport {
  const criticalKeys = [
    LOCAL_STORAGE_KEYS.ALL_WEEKS,
    LOCAL_STORAGE_KEYS.EMAILS,
    LOCAL_STORAGE_KEYS.GOAL_ITEMS,
    LOCAL_STORAGE_KEYS.LIFE_GOALS,
  ];

  const corruptedKeys: string[] = [];

  for (const key of criticalKeys) {
    if (!validateKey(key)) {
      corruptedKeys.push(key);
    }
  }

  if (corruptedKeys.length === 0) {
    return ok();
  }

  return fail(corruptedKeys);
}

/**
 * Repair corrupted keys by removing them.
 * The app will recreate empty structures on next render.
 */
export function repairCorruptedKeys(keys: string[]): void {
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch (_) {
      // best-effort
    }
  }
  // Reset schema version so migrations re-run against clean state
  storage.remove(LOCAL_STORAGE_KEYS.SCHEMA_VERSION);
}
