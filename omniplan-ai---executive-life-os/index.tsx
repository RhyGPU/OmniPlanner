
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initStorage } from './services/storage';
import { runMigrations } from './services/storage/migrations';
import { checkStorageHealth, repairCorruptedKeys } from './services/storage/storageIntegrity';
import { isElectron } from './services/platform';

// ---------------------------------------------------------------------------
// Startup sequence (must complete before first render)
// ---------------------------------------------------------------------------

async function startup(): Promise<void> {
  // 1. Initialise storage backend.
  //    Web shell: swap LocalStorageAdapter → IndexedDBAdapter (with one-time
  //    localStorage→IDB migration if this is the first web-IDB session).
  //    Electron: no-op — localStorage remains the backend.
  await initStorage(!isElectron());

  // 2. Storage corruption check (before migrations — migrations assume valid data).
  //    If critical keys are corrupt, attempt repair and continue.
  try {
    const health = checkStorageHealth();
    if (!health.healthy) {
      console.warn('[OmniPlan] Storage corruption detected:', health.details);
      // Auto-repair: remove corrupt keys, reset schema version so migrations re-run.
      repairCorruptedKeys(health.corruptedKeys);
      console.info('[OmniPlan] Corrupted keys removed. Data in other keys was preserved.');
    }
  } catch (e) {
    console.error('[OmniPlan] Storage health check failed:', e);
  }

  // 3. Run schema migrations against the now-active storage backend.
  //    Idempotent: no-ops if storage is already at the current schema version.
  try {
    runMigrations();
  } catch (e) {
    console.error('[OmniPlan] Migration failed — starting with current storage state:', e);
  }

  // 4. Storage quota health check (Electron/localStorage only).
  //    Warn the user before they hit the 5-10 MB ceiling and silently lose data.
  try {
    let usedBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) usedBytes += k.length * 2 + (localStorage.getItem(k)?.length ?? 0) * 2;
    }
    const usedMB = usedBytes / (1024 * 1024);
    if (usedMB > 4.0) {
      // Above 4 MB — show a persistent warning the first time
      const warningKey = 'omni_storage_warning_shown';
      const warningShown = localStorage.getItem(warningKey);
      if (!warningShown) {
        localStorage.setItem(warningKey, '1');
        console.warn(
          `[OmniPlan] Storage usage high: ${usedMB.toFixed(1)} MB / ~10 MB. ` +
          'Export a backup regularly. Consider using the web version for more storage.'
        );
      }
    }
  } catch (_) {
    // quota check is best-effort; never block startup
  }

  // 5. Register service worker for offline support (web shell only).
  //    No-op in Electron — file:// protocol does not support SW.
  if (!isElectron() && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then(reg => {
        console.info('[SW] registered, scope:', reg.scope);
      })
      .catch(err => {
        // Non-fatal — app still works online without the SW
        console.warn('[SW] registration failed:', err);
      });
  }
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find #root element');

const root = ReactDOM.createRoot(rootElement);

startup()
  .catch(e => {
    // Startup failures (storage init, migrations) must not prevent the app
    // from rendering — the planner is still usable with whatever data is
    // available in the current session.
    console.error('[OmniPlan] Startup error (rendering anyway):', e);
  })
  .finally(() => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
