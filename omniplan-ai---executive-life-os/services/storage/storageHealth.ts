/**
 * Storage health and readiness tracking for OmniPlanner.
 *
 * Tracks which storage backend is active and whether it is operating normally
 * or in a degraded state. This lets the UI surface meaningful warnings when
 * IndexedDB is unavailable, quota is exceeded, or the backend has fallen back
 * to localStorage.
 *
 * STORAGE BACKEND GUARANTEES BY PLATFORM:
 *   Electron (desktop):
 *     Backend: localStorage (Chromium app data directory)
 *     Quota:   Chromium's localStorage limit (~5–10 MB per origin)
 *     Offline: Always available — no network, no server
 *     Health:  Always 'ready' — localStorage never fails to initialise
 *
 *   Web / PWA (IndexedDB path):
 *     Backend: IndexedDB (browser-managed, typically hundreds of MB)
 *     Quota:   Browser-managed; iOS Safari has historically been aggressive
 *              about storage eviction in low-memory situations
 *     Offline: Full offline support via service worker + IDB cache
 *     Health:  'ready-idb' normally; 'degraded' if IDB unavailable (private
 *              browsing, storage denied, quota exceeded on init)
 *
 *   Web (localStorage fallback after IDB failure):
 *     Backend: localStorage
 *     Quota:   ~5 MB — significantly less than IDB
 *     Health:  'degraded' — user should be warned to export a backup
 *
 *   Capacitor (mobile):
 *     Backend: IndexedDB within WKWebView / ChromeWebView
 *     Quota:   iOS/Android app storage quota (typically generous)
 *     Health:  Same as web IDB path above
 *     NOTE:    Service workers do NOT work in WKWebView (iOS). Offline is
 *              provided by the native app bundle, not a service worker.
 *
 * WRITE FAILURE MODES:
 *   If an IndexedDB write fails (e.g., quota exceeded mid-session), the
 *   in-memory cache remains correct for the current session but IDB diverges.
 *   On next startup, the IDB will reflect the last successfully persisted
 *   state, which may be older than what the user saw. The health state is
 *   updated to 'degraded' and the user is prompted to export a backup.
 */

export type StorageBackend = 'indexeddb' | 'localstorage';
export type StorageHealth = 'ready' | 'degraded';

export interface StorageStatus {
  health: StorageHealth;
  backend: StorageBackend;
  /**
   * Human-readable explanation when health === 'degraded'.
   * Suitable for display in a UI warning banner.
   */
  degradedReason?: string;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/**
 * Initial state: localStorage/ready.
 * LocalStorageAdapter is the default until initStorage() completes.
 * For Electron, this state never changes (localStorage is always the backend).
 */
let _status: StorageStatus = { health: 'ready', backend: 'localstorage' };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read the current storage status. Returns a shallow copy — safe to hold. */
export function getStorageStatus(): StorageStatus {
  return { ..._status };
}

/**
 * Mark storage as ready on the given backend.
 * Called by initStorage() after successful adapter initialisation.
 */
export function setStorageReady(backend: StorageBackend): void {
  _status = { health: 'ready', backend };
}

/**
 * Mark storage as degraded.
 *
 * Called when:
 *   - IndexedDB initialisation fails (falls back to localStorage)
 *   - An IndexedDB write fails with QuotaExceededError mid-session
 *
 * @param reason  Human-readable explanation (shown in UI warning banner).
 * @param backend The backend actually in use (usually 'localstorage' after IDB failure).
 */
export function setStorageDegraded(reason: string, backend: StorageBackend = 'localstorage'): void {
  _status = { health: 'degraded', backend, degradedReason: reason };
}
