# OmniPlanner — Product Roadmap

> **Philosophy**: Privacy-first, calm, local-first, open-source, free core.
> AI is optional and user-controlled. No dark patterns. No invasive telemetry.
> The core product is planning: life goals → weekly execution → calendar → focus.

---

## Current State (v2.1)

OmniPlanner is a functional TypeScript/React/Vite/Electron desktop planner with:

- **Week-isolated planner**: each week is an independent data unit (source of truth: `allWeeks`)
- **Habit tracking**: cross-week streaks, soft-delete, 112-point milestone gamification
- **Multi-provider AI**: Gemini, OpenAI, Anthropic, OpenRouter, local, or none
- **Life goals**: 10/5/3/1-year goal hierarchy (text only, not yet linked to weekly execution)
- **Calendar**: daily time-blocked events, repeating event inheritance, ICS import
- **Backup/restore**: JSON export/import with legacy migration
- **Email view**: prototype IMAP integration (Electron only, AI-assisted event extraction)
- **Platforms**: Electron desktop (Windows/macOS/Linux)

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

### Phase 2 — Life Goals Domain Model
**Goal**: Link life goals to weekly execution. Goals are currently unstructured text areas.

**Deliverables**:
- `GoalItem` type: `{ id, text, timeframe, linkedWeeklyGoalIds?, completedAt?, archivedAt? }`
- Migration v2: convert existing text blobs to `GoalItem[]`
- `GoalsView` updated: structured goal list with add/complete/archive
- Weekly planner surfaces relevant 1-year goals in sidebar
- No goal duplication — weekly goal links to a `GoalItem.id`, not a copy

**Constraint**: backward-compatible with existing backup JSON

---

### Phase 3 — Cross-Platform Shell Migration
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

### Phase 4 — Reminders and Focus Sessions
**Goal**: Close the gap between planning and execution with lightweight focus support.

**Deliverables**:
- Focus session timer (Pomodoro or custom) — local only, no tracking
- Desktop notifications via Electron (opt-in)
- Daily start-of-day prompt: show today's focus, top todos, habit check
- Gentle end-of-day review: habit completion summary
- No push server, no account, no telemetry

---

### Phase 5 — Mail-Aware Scheduling (Minimal)
**Goal**: Let email surface actionable calendar items without becoming an email client.

**Deliverables**:
- "Extract event from email" flow remains AI-assisted
- OAuth-based Gmail/Outlook integration (replaces IMAP password)
- Email stays a secondary feature — planner does not depend on it
- `omni_email_accounts.password` deprecated; migration to OAuth tokens documented

**Out of scope**: email compose, threading, search, full inbox management

---

### Phase 6 — AI Polish
**Goal**: Make AI assistance more useful while keeping it strictly optional.

**Deliverables**:
- Improve focus prediction: use habit completion rates + goal timeframe + historical notes
- Goal-aware scheduling: AI suggests weekly goal breakdown from 1-year goals
- Local model support: first-class Ollama/LM Studio experience
- AI usage summary (tokens used, provider, cost estimate) — transparency for user
- AI is still 100% opt-in; all features degrade gracefully to manual input

---

## Versioning Convention

`MAJOR.MINOR` — major = breaking data format change with migration, minor = additive.

Current: **v2.1** → Phase 1 target: **v2.2** → Phase 2 target: **v3.0** (new GoalItem format)

---

## Contribution Principles

1. **Domain first**: add a type to `types.ts` before writing UI
2. **Migration required**: any format change needs a migration in `services/storage/migrations.ts`
3. **Storage via adapter**: no direct `localStorage.*` calls outside `services/storage/`
4. **AI is optional**: every feature must work with `provider: 'none'`
5. **No new dependencies** without a compelling reason and review
6. **Test checklist in PR**: describe how to manually verify the change end-to-end
