/**
 * OmniPlanner shared core — platform-agnostic module boundary.
 *
 * Everything exported from this file:
 *   • Contains NO window.electronAPI references
 *   • Contains NO Node.js-only APIs
 *   • Contains NO React imports (pure TypeScript)
 *   • Is fully testable in isolation (no side effects at import time)
 *   • Can be consumed by Electron, web browser, or React Native shells
 *
 * When building a new platform shell (web app, mobile app), import your
 * domain types and selectors from here rather than reaching into individual
 * util files. This keeps the dependency graph clean and makes it obvious
 * what belongs to the portable core vs. a platform-specific adapter.
 *
 * Platform-specific services (credentials, email, network, shell) live in:
 *   services/platform/index.ts
 *
 * Storage adapter interface (swappable for IndexedDB, SQLite, etc.) lives in:
 *   services/storage/index.ts  (re-exported below)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Module map
 * ─────────────────────────────────────────────────────────────────────────
 * Domain types          → ../types
 * Goal domain logic     → ../utils/goalManager
 * Week domain logic     → ../utils/weekManager
 * Planning selectors    → ../utils/planningIntelligence
 * Habit milestones      → ../utils/habitMilestones
 * ICS calendar parser   → ../utils/icsParser
 * Storage interface     → ../services/storage
 * Data export/import    → ../utils/dataManager
 * ─────────────────────────────────────────────────────────────────────────
 */

// Domain model types
export * from '../types';

// Goal management: CRUD, selectors, progress
export * from '../utils/goalManager';

// Week management: CRUD, habit reconciliation, repeating events
export * from '../utils/weekManager';

// Planning intelligence: scheduling selectors, execution analytics, historical trends
export * from '../utils/planningIntelligence';

// Habit milestone system: streak milestones, filler titles, colour tiers
export * from '../utils/habitMilestones';

// ICS calendar parser
export * from '../utils/icsParser';

// Storage adapter interface (StorageAdapter, LOCAL_STORAGE_KEYS, storage singleton)
export * from '../services/storage';

// Data export / import / backup
export * from '../utils/dataManager';
