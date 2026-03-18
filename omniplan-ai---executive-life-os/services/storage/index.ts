/**
 * Storage abstraction layer.
 *
 * All persistent reads/writes go through the `storage` singleton.
 * Do NOT call `localStorage.*` directly outside this file.
 *
 * Swapping the backing store (IndexedDB, SQLite, encrypted) only requires
 * a new class implementing `StorageAdapter` and updating the export below.
 */

/** Typed key-value storage interface. */
export interface StorageAdapter {
  /** Read and deserialize a value. Returns null if absent or corrupted. */
  get<T>(key: string): T | null;
  /** Serialize and write a value. */
  set<T>(key: string, value: T): void;
  /** Remove a key. No-op if absent. */
  remove(key: string): void;
  /** Return all keys, optionally filtered by prefix. */
  keys(prefix?: string): string[];
}

/** Central registry of all omni_* localStorage keys.
 *  Add new keys here — never use raw string literals elsewhere. */
export const LOCAL_STORAGE_KEYS = {
  ALL_WEEKS:        'omni_all_weeks',
  EMAILS:           'omni_emails',
  LIFE_GOALS:       'omni_lifegoals',
  /** TODO(security/api-key): plaintext API key — Phase 3 migrate to Electron safeStorage */
  AI_SETTINGS:      'omni_ai_settings',
  /** TODO(security/email-password): contains plaintext IMAP passwords — Phase 3/5 migrate */
  EMAIL_ACCOUNTS:   'omni_email_accounts',
  ZOOM_LEVELS:      'omni_zoom_levels',
  GOALS_BASE_YEARS: 'omni_goals_base_years',
  /** Phase 2: structured GoalItem records replacing LifeGoals text blobs. */
  GOAL_ITEMS:       'omni_goal_items',
  /** Integer version of the highest applied migration. Written by runMigrations(). */
  SCHEMA_VERSION:   'omni_schema_version',
} as const;

/** localStorage-backed adapter. Serializes values to JSON. */
class LocalStorageAdapter implements StorageAdapter {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : null;
    } catch {
      // Corrupted entry — treat as absent
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  remove(key: string): void {
    localStorage.removeItem(key);
  }

  keys(prefix?: string): string[] {
    const result: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null && (!prefix || k.startsWith(prefix))) {
        result.push(k);
      }
    }
    return result;
  }
}

/** Singleton storage instance. Import this everywhere you need persistence. */
export const storage: StorageAdapter = new LocalStorageAdapter();
