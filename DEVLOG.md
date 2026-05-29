# OmniPlanner Dev Log

**Local-first life OS · Feb 2026 – Present**

70 commits · 22 phases · ~11K lines of TypeScript

---

## Phase 0–1: The Repository Exists (Feb 25, 2026)

**Tags:** `Foundation` `Electron Desktop` `Gemini AI` `CI/CD`

Before the repository, OmniPlanner was a web-based weekly planner. Then it became an Electron desktop app. The conversion was messy but fast — Tauri was considered, Electron won for speed.

First commits: `electron-main.cjs`, `preload.cjs`, `run.js` launcher, electron-builder config targeting Windows NSIS, macOS DMG, Linux AppImage. Same day: Gemini AI provider wired in, first GitHub Actions CI workflow.

The project stopped being a disposable web experiment.

---

## Phase 2–3: Life Goals Go Domain (Feb 26 – Mar 18)

**Tags:** `Domain Model` `Goal Linking` `Credential Encryption` `v2.0`

The core architectural bet: week-isolated planning. Each week is an indestructible page that doesn't bleed into adjacent weeks.

**Phase 2:** `GoalItem` domain model — structured life goals (10Y/5Y/3Y/1Y/monthly/weekly) that link to weekly execution via `Todo.parentGoalId`. Legacy `LifeGoals` text blobs migrated into typed `GoalItem[]`.

**Phase 3:** Goals connect to weeks. Weekly goals (`business`/`personal`) link upward to life goals. Weekly planner sidebar shows relevant 1-year goals.

**Phase 4:** Credential hardening. `services/storage/secureSettings.ts` became the single boundary for sensitive keys. `Electron.safeStorage` encrypted API keys and IMAP passwords.

---

## Phase 5–9: Calendar Intelligence, Web Shell, and Mobile (Mar 19–23)

**Tags:** `Calendar Types` `Analytics` `PWA Support` `Platform Boundary`

**Phase 5:** `CalendarEventKind` discriminates meetings, focus blocks, task blocks, routines. Events link to goals and todos.

**Phase 6:** Execution analytics in weekly review sidebar.

**Phase 7:** Historical trend visibility — comparing weeks.

**Phase 8:** Platform service boundary — `CredentialService`, `EmailService`, `NetworkService`, `NotificationService`, `ShellService`.

**Phase 9:** Web shell — PWA manifest, service worker, `IndexedDBAdapter`, transparent backend swapping.

---

## Phase 10–14: Mobile, Onboarding, and Polish (Mar 20)

**Tags:** `Mobile Notifications` `Onboarding` `Offline Resilience` `Secure Storage`

Five phases in one day. Capacitor mobile shell with local notifications. Native secure storage on mobile. Offline resilience with conflict-free restore. Welcome card for first-time users with `hasPlannerData()` detection.

---

## Phase 15–18: Polish and Clarity (Mar 23)

**Tags:** `UX Polish` `AI Settings` `Email→Calendar` `Backup UX`

Empty-state guidance across all planner views. AI readiness gating (shows disabled/missing key/ready). Two-step restore flow with preview. Calendar-email workflow polish.

---

## Phase 19: Engineering Hardening (Mar 24)

**Tags:** `Typecheck Clean` `ID Normalization` `Component Extraction`

Zero TypeScript errors. All IDs normalized from `number` to `string`. Components extracted and organized. Credential visibility in settings.

---

## Phase 20–22: Reminders, Email, Tests (Mar 24 – Apr 3)

**Tags:** `138 Tests` `OAuth` `Diagnostics` `Reminder UI`

Reminder visibility with inline indicators. 138 tests across 7 files. OAuth token lifecycle with safe refresh. Email error taxonomy with stable codes and calm user-facing messages.

---

## Current: Dashboard, Alarms, and the Plan-vs-Actual Gap (May 2026)

**Tags:** `Dashboard` `Event Start/Skip/Snooze` `Pulse Tab` `Alarm Rules` `Sleep Tracking` `Priority Stars` `Undo Toast` `Auto-backup` `Window State` `Auto-update` `Storage Recovery`

The weekly planner was solid. But nobody opens a planner to see a grid — they open it to know *what's next*.

Now the main screen is a **Dashboard**: top events ranked by priority × urgency, habits due now, recent emails, top todos. Every event card has a **Start** button (logs actual start time), **Skip** button (marks as missed), **Snooze** button (5-min reminder). Sleep events get "Going to bed".

A new **Pulse** tab manages all alarms: daily reminders with toggles, auto-generated event alarms (sleep wind-down, meeting prep), alarm rules engine.

Planned: plan-vs-actual overlay on weekly grid — soft blocks for planned, solid blocks for actual, per-day toggle.

---

*OmniPlanner is AGPL-3.0. Built by [RhyGPU](https://rhygpu-dev.pages.dev/).*
