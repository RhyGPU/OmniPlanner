/**
 * IndexedDB storage adapter for OmniPlanner.
 *
 * Used as the primary storage backend when running in a web browser (non-Electron).
 * Implements the same synchronous StorageAdapter contract as LocalStorageAdapter
 * by maintaining a fully-populated in-memory Map that is lazily synchronised to
 * IndexedDB via write-through on every mutation.
 *
 * WHY IN-MEMORY CACHE:
 *   StorageAdapter.get/set/remove/keys are synchronous — the entire codebase depends
 *   on this. IndexedDB is asynchronous. The cache is the source of truth within a
 *   session; IDB is the durable persistence layer. The cache is populated once during
 *   IndexedDBAdapter.create() before the React tree renders, so all subsequent sync
 *   reads are satisfied from memory.
 *
 * WRITE-THROUGH STRATEGY:
 *   Every set/remove call updates the in-memory cache synchronously and schedules an
 *   async IDB transaction. If the transaction fails (storage quota exceeded, etc.) the
 *   in-memory data is still consistent for the current session. A warning is logged.
 *   On the next app load, the IDB will reflect whatever was last successfully written.
 *
 * FIRST-SESSION MIGRATION:
 *   If IDB is empty on first creation but localStorage contains omni_* keys, all
 *   those keys are migrated to IDB and removed from localStorage. This is a one-time
 *   operation that preserves existing web-localStorage planner data.
 *
 * QUOTA AND BROWSER SUPPORT:
 *   IndexedDB is supported in all modern browsers. It is subject to the browser's
 *   storage quota (typically hundreds of MB, vs localStorage's ~5 MB). If creation
 *   fails, callers should fall back to LocalStorageAdapter.
 */

import type { StorageAdapter } from './index';

// ---------------------------------------------------------------------------
// IDB helpers (promise wrappers)
// ---------------------------------------------------------------------------

const DB_NAME = 'omniplanner';
const STORE   = 'keyval';
const DB_VER  = 1;

function openOmniDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };

    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror   = ()  => reject(req.error);
  });
}

/** Resolves when a transaction commits, rejects on error/abort. */
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error ?? new Error('IDB transaction aborted'));
  });
}

/** Read all keys and values from the store in a single readonly transaction. */
function readAll(db: IDBDatabase): Promise<Array<[string, string]>> {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);

    const keysReq = store.getAllKeys();
    const valsReq = store.getAll();

    let keys: string[] | null = null;
    let vals: string[] | null = null;

    keysReq.onsuccess = () => {
      keys = keysReq.result as string[];
      if (vals !== null) done();
    };
    valsReq.onsuccess = () => {
      vals = valsReq.result as string[];
      if (keys !== null) done();
    };

    keysReq.onerror = () => reject(keysReq.error);
    valsReq.onerror = () => reject(valsReq.error);

    function done() {
      resolve((keys as string[]).map((k, i) => [k, (vals as string[])[i]]));
    }
  });
}

// ---------------------------------------------------------------------------
// IndexedDBAdapter
// ---------------------------------------------------------------------------

export class IndexedDBAdapter implements StorageAdapter {
  /** JSON-serialized values — mirrors what is (or will be) persisted in IDB. */
  private cache = new Map<string, string>();
  private db: IDBDatabase;

  private constructor(db: IDBDatabase) {
    this.db = db;
  }

  // ---------------------------------------------------------------------------
  // Async factory — only entry point
  // ---------------------------------------------------------------------------

  /**
   * Opens the database, migrates from localStorage if this is the first IDB
   * session, loads all entries into the in-memory cache, then returns the
   * ready-to-use adapter.
   *
   * Throws if IndexedDB is unavailable (caller should fall back to
   * LocalStorageAdapter).
   */
  static async create(): Promise<IndexedDBAdapter> {
    const db      = await openOmniDB();
    const adapter = new IndexedDBAdapter(db);
    await adapter._bootstrap();
    return adapter;
  }

  // ---------------------------------------------------------------------------
  // Startup helpers
  // ---------------------------------------------------------------------------

  private async _bootstrap(): Promise<void> {
    const entries = await readAll(this.db);

    if (entries.length === 0) {
      // IDB is empty — check localStorage for data to migrate
      const lsKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k !== null && k.startsWith('omni_')) lsKeys.push(k);
      }
      if (lsKeys.length > 0) {
        await this._migrateFromLocalStorage(lsKeys);
        return; // cache already populated by migration
      }
      return;
    }

    for (const [k, v] of entries) {
      this.cache.set(k, v);
    }
  }

  /**
   * One-time localStorage → IndexedDB migration.
   * Writes all omni_* values from localStorage into IDB atomically, then
   * removes them from localStorage once the IDB transaction commits.
   * Populates the in-memory cache as a side-effect.
   */
  private async _migrateFromLocalStorage(keys: string[]): Promise<void> {
    const tx    = this.db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);

    const migrated: Array<[string, string]> = [];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        store.put(raw, key);
        migrated.push([key, raw]);
      }
    }

    await txDone(tx);

    // IDB transaction confirmed — safe to clear localStorage
    for (const [key, raw] of migrated) {
      localStorage.removeItem(key);
      this.cache.set(key, raw);
    }

    console.info(
      `[storage] Migrated ${migrated.length} key(s) from localStorage to IndexedDB.`,
    );
  }

  // ---------------------------------------------------------------------------
  // StorageAdapter interface — synchronous, operates on in-memory cache
  // ---------------------------------------------------------------------------

  get<T>(key: string): T | null {
    const raw = this.cache.get(key);
    if (raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null; // corrupted value — treat as absent
    }
  }

  set<T>(key: string, value: T): void {
    const raw = JSON.stringify(value);
    this.cache.set(key, raw);

    // Write-through: fire-and-forget IDB transaction
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(raw, key);
    txDone(tx).catch(e =>
      console.warn('[storage] IndexedDB write failed for key', key, e),
    );
  }

  remove(key: string): void {
    this.cache.delete(key);

    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    txDone(tx).catch(e =>
      console.warn('[storage] IndexedDB delete failed for key', key, e),
    );
  }

  keys(prefix?: string): string[] {
    const result: string[] = [];
    for (const k of this.cache.keys()) {
      if (!prefix || k.startsWith(prefix)) result.push(k);
    }
    return result;
  }
}
