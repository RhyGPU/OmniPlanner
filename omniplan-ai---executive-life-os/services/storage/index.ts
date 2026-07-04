/**
 * Storage abstraction layer.
 *
 * All persistent reads/writes go through the `storage` singleton.
 * Do NOT call `localStorage.*` directly outside this file.
 *
 * BACKENDS:
 *   Electron (desktop) : LocalStorageAdapter — synchronous, backed by Chromium's
 *                        localStorage in the app's userData directory.
 *   Web / PWA          : IndexedDBAdapter — backed by browser IndexedDB (~hundreds
 *                        of MB quota vs localStorage's ~5 MB). Initialised async
 *                        before first render; see initStorage() below.
 *
 * SWAPPING THE ADAPTER:
 *   Call initStorage(true) once at startup (before runMigrations and before the
 *   React tree renders) to swap `storage` from LocalStorageAdapter to the
 *   IndexedDBAdapter. All existing callers see the new backend transparently
 *   because `storage` is a proxy object that delegates to `_delegate`.
 */

import { setStorageReady, setStorageDegraded } from './storageHealth';
export { getStorageStatus } from './storageHealth';
export type { StorageStatus, StorageHealth, StorageBackend } from './storageHealth';
import { isElectron } from '../platform';

// ---------------------------------------------------------------------------
// StorageAdapter interface
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Key registry
// ---------------------------------------------------------------------------

/** Central registry of all omni_* storage keys.
 *  Add new keys here — never use raw string literals elsewhere. */
export const LOCAL_STORAGE_KEYS = {
  ALL_WEEKS:        'omni_all_weeks',
  EMAILS:           'omni_emails',
  LIFE_GOALS:       'omni_lifegoals',
  AI_SETTINGS:      'omni_ai_settings',
  EMAIL_ACCOUNTS:   'omni_email_accounts',
  ZOOM_LEVELS:      'omni_zoom_levels',
  GOALS_BASE_YEARS: 'omni_goals_base_years',
  /** Phase 2: structured GoalItem records replacing LifeGoals text blobs. */
  GOAL_ITEMS:       'omni_goal_items',
  /** Integer version of the highest applied migration. Written by runMigrations(). */
  SCHEMA_VERSION:   'omni_schema_version',
  /** Phase 11B: local notification reminder configuration. Non-sensitive. */
  NOTIFICATION_SETTINGS: 'omni_notification_settings',
  /** Phase 14: set to true once the user has dismissed the first-run welcome card.
   *  Separate from planner-domain data so restore/import never clears it. */
  ONBOARDING_DISMISSED: 'omni_onboarding_dismissed',
} as const;

// ---------------------------------------------------------------------------
// LocalStorageAdapter (Electron default)
// ---------------------------------------------------------------------------

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

/**
 * File-system backed adapter for Electron desktop storage.
 * Implements synchronous StorageAdapter contract via write-through in-memory cache.
 */
class ElectronFileStorageAdapter implements StorageAdapter {
  private cache = new Map<string, string>();

  private constructor(store: Record<string, any>) {
    for (const [k, v] of Object.entries(store)) {
      this.cache.set(k, JSON.stringify(v));
    }
  }

  static async create(): Promise<ElectronFileStorageAdapter> {
    if (typeof window === 'undefined' || !window.electronAPI?.fileStorageReadAll) {
      throw new Error('Electron file storage IPC not available');
    }
    const store = await window.electronAPI.fileStorageReadAll();
    const adapter = new ElectronFileStorageAdapter(store);
    await adapter._bootstrap();
    return adapter;
  }

  private async _bootstrap(): Promise<void> {
    // Migrate legacy localStorage keys on first startup if files are empty
    if (this.cache.size === 0) {
      const legacyKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k !== null && k.startsWith('omni_')) legacyKeys.push(k);
      }
      if (legacyKeys.length > 0) {
        console.info(`[storage] Migrating ${legacyKeys.length} keys from localStorage to FileSystem...`);
        for (const key of legacyKeys) {
          const raw = localStorage.getItem(key);
          if (raw !== null) {
            try {
              const val = JSON.parse(raw);
              await window.electronAPI!.fileStorageSet(key, val);
              this.cache.set(key, raw);
              localStorage.removeItem(key);
            } catch (_) {
              // ignore
            }
          }
        }
      }
    }
  }

  get<T>(key: string): T | null {
    const raw = this.cache.get(key);
    if (raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    const raw = JSON.stringify(value);
    this.cache.set(key, raw);
    window.electronAPI!.fileStorageSet(key, value).catch(e => {
      console.warn('[storage] FileStorage set failed for key', key, e);
    });
  }

  remove(key: string): void {
    this.cache.delete(key);
    window.electronAPI!.fileStorageRemove(key).catch(e => {
      console.warn('[storage] FileStorage remove failed for key', key, e);
    });
  }

  keys(prefix?: string): string[] {
    const result: string[] = [];
    for (const k of this.cache.keys()) {
      if (!prefix || k.startsWith(prefix)) result.push(k);
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Storage proxy (allows adapter swap at startup)
// ---------------------------------------------------------------------------

/**
 * Active adapter. Starts as LocalStorageAdapter so the app works immediately
 * on Electron or before the async IDB init completes.
 * Replaced by initStorage(true) for the web shell.
 */
let _delegate: StorageAdapter = new LocalStorageAdapter();

/**
 * Swap the backing adapter.
 * Must be called before any reads/writes — i.e., before runMigrations() and
 * before the React tree renders. Not safe to call after startup.
 */
export function setStorageAdapter(adapter: StorageAdapter): void {
  _delegate = adapter;
}

/**
 * Initialise the web storage adapter.
 *
 * When useIDB is true (web shell), opens IndexedDB, migrates any existing
 * localStorage planner data, loads all entries into the in-memory cache, then
 * swaps `storage` to the IDB adapter. If IndexedDB is unavailable (private
 * browsing on some browsers, or explicit storage denial) the function logs a
 * warning and leaves `storage` on LocalStorageAdapter.
 *
 * When useIDB is false (Electron), this is a no-op — localStorage remains
 * the backend.
 */
export async function initStorage(useIDB: boolean): Promise<void> {
  if (isElectron()) {
    try {
      const fileAdapter = await ElectronFileStorageAdapter.create();
      setStorageAdapter(fileAdapter);
      setStorageReady('localstorage'); // reuse localstorage layout tag for ease
      return;
    } catch (e) {
      console.warn('[storage] Electron file storage init failed, using localStorage fallback:', e);
      setStorageReady('localstorage');
      return;
    }
  }

  if (!useIDB) {
    setStorageReady('localstorage');
    return;
  }
  try {
    const { IndexedDBAdapter } = await import('./indexeddb');
    const idb = await IndexedDBAdapter.create();
    setStorageAdapter(idb);
    setStorageReady('indexeddb');
  } catch (e) {
    const reason =
      'IndexedDB is unavailable on this device or browser ' +
      '(private/incognito mode, storage denied, or quota exceeded). ' +
      'Your planner data is stored in localStorage (~5 MB limit). ' +
      'Export a backup to protect your data.';
    console.warn('[storage] IndexedDB unavailable — falling back to localStorage.', e);
    setStorageDegraded(reason, 'localstorage');
  }
}

/**
 * Singleton storage proxy. Import everywhere you need persistence.
 *
 * Uses whatever adapter is currently active (_delegate). Callers never need
 * to know which backend is in use — the interface is the same.
 */
export const storage: StorageAdapter = {
  get<T>(key: string): T | null         { return _delegate.get<T>(key); },
  set<T>(key: string, value: T): void   { _delegate.set(key, value); },
  remove(key: string): void             { _delegate.remove(key); },
  keys(prefix?: string): string[]       { return _delegate.keys(prefix); },
};

// Re-export so callers can type-check against the class if needed
export { IndexedDBAdapter } from './indexeddb';
