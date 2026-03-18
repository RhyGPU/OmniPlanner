# OmniPlanner — Architecture v3

> Supersedes `ARCHITECTURE.md` (v2.0). Describes the target architecture introduced in Phase 1.

---

## Layers

```
┌──────────────────────────────────────────────────────────────────┐
│  UI Layer                                                        │
│  App.tsx  ·  components/WeeklyPlannerView  ·  GoalsView  · …    │
│  No direct storage access. Reads/writes only through hooks or    │
│  domain functions passed as props.                               │
└────────────────────────┬─────────────────────────────────────────┘
                         │ calls
┌────────────────────────▼─────────────────────────────────────────┐
│  Domain Layer                                                    │
│  utils/weekManager.ts  ·  utils/dataManager.ts                   │
│  utils/habitMilestones.ts  ·  utils/icsParser.ts                 │
│  Pure functions. Types from types.ts. No UI imports.             │
└────────────────────────┬─────────────────────────────────────────┘
                         │ reads/writes via
┌────────────────────────▼─────────────────────────────────────────┐
│  Storage Layer  (NEW — Phase 1)                                  │
│  services/storage/index.ts      StorageAdapter interface         │
│  services/storage/migrations.ts migration registry               │
│  services/storage/secureSettings.ts  sensitive credential API    │
│                                                                  │
│  Concrete adapters (swappable):                                  │
│  - LocalStorageAdapter  (current — Phase 1)                      │
│  - IndexedDBAdapter     (Phase 3 — web/PWA)                      │
│  - ElectronSQLiteAdapter (Phase 3+ — desktop with larger data)   │
└────────────────────────┬─────────────────────────────────────────┘
                         │ routes through when in Electron
┌────────────────────────▼─────────────────────────────────────────┐
│  Platform Layer                                                  │
│  utils/electronFetch.ts  (CORS bypass via Electron net module)   │
│  electron-main.cjs       (IMAP, safeStorage, window management)  │
│  preload.cjs             (safe IPC bridge)                       │
│                                                                  │
│  TODO(phase-3): Add platform detection to gate ELECTRON-ONLY     │
│  features (IMAP, safeStorage) at compile/runtime boundary.       │
└──────────────────────────────────────────────────────────────────┘
                         │ optional
┌────────────────────────▼─────────────────────────────────────────┐
│  AI Layer                                                        │
│  services/ai/index.ts        provider router                     │
│  services/ai/gemini.ts       services/ai/openai.ts  …           │
│  All calls are optional. Provider = 'none' disables AI entirely. │
└──────────────────────────────────────────────────────────────────┘
```

---

## Domain Model

### Core planning entity: `WeekData`

```typescript
WeekData {
  weekStartDate: string        // ISO Monday (YYYY-MM-DD) — primary key
  weekEndDate:   string        // ISO Sunday
  goals:         WeeklyGoals   // { business: Todo[], personal: Todo[] }
  dailyPlans:    Record<string, DailyPlan>  // keyed by YYYY-MM-DD
  meetings:      Todo[]
  notes:         string
  habits:        Habit[]       // week-specific; inheritance handled by weekManager
  createdAt:     number
  updatedAt:     number
}

DailyPlan {
  focus:   string          // manual or AI-predicted theme
  todos:   Todo[]
  notes:   string
  events:  CalendarEvent[] // time-blocked entries
}

Habit {
  id:          string
  name:        string
  completions: Record<string, boolean>  // dateKey → done
  createdAt:   number
  deletedAt?:  number   // soft-delete; undefined = active
  archived?:   boolean
}
```

### Life goals entity: `LifeGoals` (current — text only)

```typescript
LifeGoals {
  '10': Record<string, string>                          // 10-year vision per year-key
  '5':  Record<string, { goal: string; action: string }> // 5-year trajectory
  '3':  Record<string, string>                          // 3-year milestones
  '1':  Record<string, string>                          // 1-year monthly focus
}
```

> **Phase 2 target**: Introduce `GoalItem { id, text, timeframe, linkedWeeklyGoalIds?, completedAt? }`
> and migrate the above text blobs. See PRODUCT_ROADMAP.md Phase 2.

---

## Storage Layer (Phase 1)

### `StorageAdapter` interface

```typescript
interface StorageAdapter {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  keys(prefix?: string): string[];
}
```

All storage access goes through a single `storage` singleton:

```typescript
import { storage } from './services/storage';
```

Direct `localStorage.*` calls outside `services/storage/` are not allowed.

### Key registry (`LOCAL_STORAGE_KEYS`)

All storage key strings live in one place:

```typescript
export const LOCAL_STORAGE_KEYS = {
  ALL_WEEKS:        'omni_all_weeks',
  EMAILS:           'omni_emails',
  LIFE_GOALS:       'omni_lifegoals',
  AI_SETTINGS:      'omni_ai_settings',
  EMAIL_ACCOUNTS:   'omni_email_accounts',  // TODO(security): plaintext passwords
  ZOOM_LEVELS:      'omni_zoom_levels',
  GOALS_BASE_YEARS: 'omni_goals_base_years',
  SCHEMA_VERSION:   'omni_schema_version',
} as const;
```

### Migration system

`runMigrations()` is called once on app startup (in `index.tsx` before React render).

```
omni_schema_version (integer) tracks the highest applied migration.
Migrations are ordered arrays of { version, description, run() }.
Each migration runs exactly once. runMigrations() is idempotent.
```

Current migrations:
- **v1**: Canonicalise weekly goals from `string[]` to `Todo[]`
  (promotes the `migrateWeeklyGoals` logic that was previously duplicated
  in `weekManager.ts` and `dataManager.ts`)

### Sensitive credential separation

`services/storage/secureSettings.ts` owns all access to sensitive keys (`AI_SETTINGS`,
`EMAIL_ACCOUNTS`). It is the only place these keys are read or written.

```
Phase 1: plaintext localStorage (status quo, now explicitly bounded)
Phase 3: Electron safeStorage via IPC (ipcMain.handle('keychain:get' / 'keychain:set'))
Phase 5: OAuth tokens replace IMAP passwords for email providers
```

---

## Data Flow

### Weekly planner edit

```
User edits → WeeklyPlannerView
  → updateCurrentWeek(updatedWeek)       [prop from App.tsx]
  → App.tsx setAllWeeks(...)
  → useEffect [allWeeks] → saveAllWeeks()
  → storage.set(ALL_WEEKS, allWeeks)
  → LocalStorageAdapter → localStorage.setItem
```

### App startup

```
index.tsx:
  runMigrations()    ← idempotent, checks omni_schema_version
  ReactDOM.render(<App />)

App.tsx:
  useState(() => getAllWeeks())     ← reads from storage adapter
  useState(() => storage.get(EMAILS))
  useState(() => storage.get(LIFE_GOALS))
```

### Backup export

```
DataView → downloadBackup()
  → dataManager.exportAllData()
  → storage.get(ALL_WEEKS) + storage.get(EMAILS) + storage.get(LIFE_GOALS)
  → JSON blob download
```

---

## File Map (v3 target state)

```
omniplan-ai---executive-life-os/
├── types.ts                          domain types (WeekData, Habit, LifeGoals, …)
├── constants.tsx                     date utilities, time slots
├── index.tsx                         entry: runMigrations() then render
├── App.tsx                           central state; no direct localStorage calls
│
├── services/
│   ├── storage/
│   │   ├── index.ts                  StorageAdapter + LocalStorageAdapter + key registry
│   │   ├── migrations.ts             runMigrations(), migration registry
│   │   └── secureSettings.ts        getAISettings / saveAISettings (with TODO markers)
│   ├── settings.ts                   thin re-export shim for backward compatibility
│   └── ai/
│       ├── index.ts                  provider router
│       ├── types.ts                  AIProvider interface + provider registry
│       ├── gemini.ts / openai.ts / anthropic.ts / openai-compatible.ts
│
├── utils/
│   ├── weekManager.ts               week CRUD, habit inheritance, streaks (uses storage)
│   ├── dataManager.ts               backup/restore export (uses storage)
│   ├── habitMilestones.ts           milestone messages (pure, no storage)
│   ├── icsParser.ts                 ICS import (pure, no storage)
│   └── electronFetch.ts             ELECTRON-ONLY: CORS bypass via net module
│
├── components/
│   ├── WeeklyPlannerView.tsx
│   ├── MonthlyView.tsx
│   ├── GoalsView.tsx
│   ├── EmailView.tsx
│   ├── EmailSettings.tsx            TODO(security): stores IMAP passwords
│   ├── AISettings.tsx
│   ├── DataView.tsx
│   ├── Sidebar.tsx                  TODO: remove misleading "Real-time Sync Active" label
│   ├── CheckableList.tsx
│   └── Dialog.tsx
│
├── electron-main.cjs                ELECTRON-ONLY: window, IMAP, admin elevation
├── preload.cjs                      ELECTRON-ONLY: safe IPC bridge
│
├── PRODUCT_ROADMAP.md
├── ARCHITECTURE_V3.md               (this file)
├── SECURITY_MODEL.md
└── ARCHITECTURE.md                  (v2.0 — superseded, kept for history)
```

---

## Cross-Platform Strategy (Phase 3 Preview)

Shared TypeScript core (everything in `utils/` and `services/ai/`) is already platform-neutral.
The following must be isolated behind platform guards before web/mobile deployment:

| File | Issue | Resolution |
|------|-------|------------|
| `utils/electronFetch.ts` | Uses `window.electronAPI` | Wrap in `if (isElectron())` with fetch fallback |
| `electron-main.cjs` | Node.js IMAP, net module | Electron only; never bundled for web |
| `components/EmailSettings.tsx` | Stores IMAP passwords | Phase 5: OAuth or ELECTRON-ONLY gate |
| `services/storage/secureSettings.ts` | Plaintext credentials | Phase 3: Electron safeStorage IPC |

A `isElectron()` platform detection utility will be added in Phase 3.
