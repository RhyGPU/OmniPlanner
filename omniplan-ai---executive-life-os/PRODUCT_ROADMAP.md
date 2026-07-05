# OmniPlanner — Product Roadmap

> **Founding thesis (the all-in-one cockpit)**: OmniPlanner exists because no
> good app combines **alarms, weekly planner, to-do list, and email in one
> always-open app**. The integration IS the product. Each pillar's quality bar:
> good enough that you never open the dedicated app (phone clock, Todoist,
> Gmail tab) for day-to-day use.
>
> **Philosophy**: Privacy-first, calm, local-first, open-source, free core.
> AI is optional and user-controlled. No dark patterns. No invasive telemetry.
> The planning spine: life goals → weekly execution → calendar → focus → actuals → review.

---

## Current State (v4.0 — July 2026)

OmniPlanner is a TypeScript/React/Vite/Electron desktop app (with Capacitor
mobile and PWA shells) comprising:

- **Week-isolated planner**: each week is an independent data unit (source of truth: `allWeeks`,
  keyed `omni_week_YYYY-MM-DD`); premium card UI, sub-divided event checklists
- **Carry-forward ritual (v4.0)**: unfinished goal-linked todos surface once per new week
  for Carry / Move / Drop; unlinked todos stay week-isolated by design
- **Desktop alarms (v4.0)**: main-process notification timers persisted to disk, re-armed on
  startup and wake-from-sleep; system tray with close-to-tray; opt-in launch at login
- **Dashboard + Pulse**: priority-ranked events with Start/Skip/Snooze actuals logging,
  alarm rules, sleep tracking, morning briefing
- **Plan-vs-actual**: actuals overlay on the weekly grid (dashed planned vs solid actual)
- **Habit tracking**: cross-week streaks, soft-delete, milestone gamification
- **Multi-provider AI**: Gemini, OpenAI, Anthropic, OpenRouter, local llamafile hosting,
  Ollama/LM Studio presets, token/cost board — or none
- **Life goals**: structured GoalItem hierarchy (10Y→weekly) linked to weekly execution
- **Calendar**: daily time-blocked events, repeating inheritance, ICS import
- **Email**: IMAP with MIME parsing, sandboxed rich HTML view, AI event extraction
  (Electron only; OAuth planned — see Phase 5 below)
- **Storage**: file-system adapter on desktop (no 5 MB cap), IndexedDB on web,
  versioned migrations, auto-backup on quit with rotation
- **Security**: credentials in OS keychains (safeStorage / iOS Keychain / Android Keystore)

---

## Non-Negotiables

- No secrets in `localStorage` long-term (migration path required)
- No raw IMAP-password architecture for web/mobile
- No server dependency for core planner functionality
- No AI requirement for basic planning
- No breaking existing user data without a migration path
- No manipulative growth loops, dark patterns, ads, or invasive telemetry

---

## Roadmap

### Phase 0 — Foundation Docs ✅ (current iteration)
**Goal**: Establish architectural record and security baseline documentation.

- [x] `PRODUCT_ROADMAP.md` — this file
- [x] `ARCHITECTURE_V3.md` — domain model, storage layer design, layer diagram
- [x] `SECURITY_MODEL.md` — threat model, current vulnerabilities, remediation plan

---

### Phase 1 — Storage Hardening + Migration Scaffolding ✅ (current iteration)
**Goal**: Replace ad-hoc `localStorage` calls with a typed abstraction and add a versioned
migration registry. Zero user-visible changes. Lays groundwork for every subsequent phase.

**Deliverables**:
- `services/storage/index.ts` — `StorageAdapter` interface + `LocalStorageAdapter` + key registry
- `services/storage/migrations.ts` — idempotent migration runner, schema version tracking
- `services/storage/secureSettings.ts` — sensitive credential abstraction with TODO markers
- Updated: `weekManager.ts`, `dataManager.ts`, `App.tsx`, `services/settings.ts` — use adapter
- `omni_schema_version` key tracks applied migrations

**Not in Phase 1**: encryption at rest, OS keychain integration, database migration

---

### Phase 2 — Life Goals Domain Model ✅ (v3.0)
**Goal**: Link life goals to weekly execution. Goals are currently unstructured text areas.

**Deliverables**:
- `GoalItem` type: `{ id, text, timeframe, linkedWeeklyGoalIds?, completedAt?, archivedAt? }`
- Migration v2: convert existing text blobs to `GoalItem[]`
- `GoalsView` updated: structured goal list with add/complete/archive
- Weekly planner surfaces relevant 1-year goals in sidebar
- No goal duplication — weekly goal links to a `GoalItem.id`, not a copy

**Constraint**: backward-compatible with existing backup JSON

---

### Phase 3 — Cross-Platform Shell Migration ✅ (v3.0, Phases 8–11)
**Goal**: Prepare for web/PWA and mobile without abandoning desktop.

**Deliverables**:
- Electron safeStorage integration for API key encryption (IPC: `keychain:get`, `keychain:set`)
- Email account password migration to OS keychain (Electron) or OAuth (web/mobile)
- Platform detection module — feature flags per context (Electron / web / mobile)
- StorageAdapter swap: IndexedDB adapter for web (larger capacity, better performance)
- Shared domain logic: confirm zero Electron-only imports in `utils/`, `services/` (except `electronFetch.ts`)
- PWA manifest + service worker stub for offline-first web

**Email constraint**: IMAP password handling must be isolated to Electron context with clear
`// ELECTRON-ONLY` markers. Web/mobile deployments must use OAuth or app-specific passwords
routed through user-controlled local proxy.

---

### Phase 4 — Reminders and Focus Sessions ✅ (v3.0–v4.0)
**Goal**: Close the gap between planning and execution with lightweight focus support.

**Delivered**:
- [x] Focus session timer (Pomodoro, 25/50m presets) — local only, no tracking
- [x] Desktop notifications via Electron main-process timers (v4.0) — persisted,
      re-armed on wake, fire while hidden to tray; launch-at-login opt-in
- [x] Daily start-of-day prompt: Morning Briefing (habits, top actions, focus theme)
- [x] Weekly review sidebar with execution analytics
- No push server, no account, no telemetry

---

### Phase 5 — Mail-Aware Scheduling (NEXT UP)
**Goal**: Make the email pillar reliable enough to replace Gmail-tab triage —
per the all-in-one thesis, email is a first-class pillar, but the planner must
never depend on it.

**Deliverables**:
- "Extract event from email" flow remains AI-assisted ✅ (shipped)
- OAuth-based Gmail/Outlook integration (replaces IMAP password) — requires
  registering OAuth client IDs with Google/Microsoft
- Background new-mail desktop notifications via the v4.0 tray infrastructure
- Planner never depends on email being configured
- `omni_email_accounts.password` deprecated; migration to OAuth tokens documented

**Out of scope**: email compose, threading, search, full inbox management

---

### Phase 6 — AI Polish (partially shipped in v3.1)
**Goal**: Make AI assistance more useful while keeping it strictly optional.

**Deliverables**:
- Improve focus prediction: use habit completion rates + goal timeframe + historical notes
- Goal-aware scheduling: AI suggests weekly goal breakdown from 1-year goals
- [x] Local model support: llamafile hosting + Ollama/LM Studio presets (v3.1)
- [x] AI usage summary (tokens, per-model cost estimate) — transparency for user (v3.1)
- AI is still 100% opt-in; all features degrade gracefully to manual input

---

### Phase 7 — Distribution & Multi-Device Sync (future)
**Goal**: Ship a packaged installer and let the phone act as the alarm/todo
satellite to the desktop cockpit — without a server.

**Deliverables**:
- Packaged Windows installer via existing electron-builder config (`npm run dist:win`),
  replacing the run.bat + Node.js friction
- Sync-file approach: full state exported to a user-chosen folder
  (Dropbox / OneDrive / Syncthing); newer-state merge on startup,
  last-write-wins per week key; CRDT merge later if needed
- No cloud service, no account — the sync transport is the user's own storage

---

## Versioning Convention

`MAJOR.MINOR` — major = breaking data format change with migration, minor = additive.

History: v2.1 → v2.2 (storage hardening) → v3.0 (GoalItem format, platform shells)
→ v3.1 (local AI) → v3.2 (planner UI) → **v4.0 (current: working desktop alarms,
tray shell, carry-forward ritual)**

---

## Contribution Principles

1. **Domain first**: add a type to `types.ts` before writing UI
2. **Migration required**: any format change needs a migration in `services/storage/migrations.ts`
3. **Storage via adapter**: no direct `localStorage.*` calls outside `services/storage/`
4. **AI is optional**: every feature must work with `provider: 'none'`
5. **No new dependencies** without a compelling reason and review
6. **Test checklist in PR**: describe how to manually verify the change end-to-end
