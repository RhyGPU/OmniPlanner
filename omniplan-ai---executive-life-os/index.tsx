
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initStorage } from './services/storage';
import { runMigrations } from './services/storage/migrations';
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

  // 2. Run schema migrations against the now-active storage backend.
  //    Idempotent: no-ops if storage is already at the current schema version.
  try {
    runMigrations();
  } catch (e) {
    console.error('[OmniPlan] Migration failed — starting with current storage state:', e);
  }

  // 3. Register service worker for offline support (web shell only).
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
