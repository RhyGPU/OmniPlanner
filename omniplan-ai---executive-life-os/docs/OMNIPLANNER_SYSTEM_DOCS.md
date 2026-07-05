# OmniPlanner — Consolidated System Documentation (v3.0 – v4.0)

This document contains a consolidated history of all strategic evaluations, architecture blueprints, implementation plans, and walkthrough logs for OmniPlanner.

---

## 🚨 Phase v4.0: The All-In-One Cockpit — Working Desktop Alarms & Carry-Forward

**Founding-thesis correction**: OmniPlanner exists because no good app combines
**alarms + weekly planner + todos + email in one always-open app**. v4.0 makes the
alarm pillar real on the primary platform (Windows desktop), where it had been
silently non-functional: Electron was wired to `nullNotifications` (no toast ever
fired) and closing the window quit the app.

### 1. Main-Process Notifications & Alarm Engine
*   `app.setAppUserModelId('com.omniplan.app')` — required for Windows toasts.
*   IPC: `notification:show / schedule / cancel / cancel-all / is-supported` in
    [electron-main.cjs](../electron-main.cjs). Timers live in the **main process**:
    they survive renderer reloads and fire while the window is hidden.
*   Persistence: alarms are written to `userData/scheduled-alarms.json` (mode 0600),
    restored and re-armed on startup. `powerMonitor.on('resume')` re-arms after
    sleep; alarms missed by <10 minutes fire late, older ones are dropped as stale.
*   Renderer adapter `electronNotifications` replaces `nullNotifications` in
    [services/platform/index.ts](../services/platform/index.ts); the notification
    settings panel is now fully enabled on desktop.

### 2. System Tray & Close-to-Tray Shell
*   Tray menu: **Open OmniPlanner · Pause Alarms (checkbox) · Quit** (with a
    confirmation dialog warning that alarms and background checks stop).
*   The window **X hides to tray** instead of quitting (`isQuitting` flag pattern);
    `window-all-closed` no longer quits while the tray exists. A one-time toast
    explains the behavior on first hide.

### 3. Launch at Login (opt-in)
*   IPC `startup:get/set` wraps `app.setLoginItemSettings`.
*   One-time first-launch prompt (ConfirmDialog in App.tsx) + a persistent toggle in
    **Settings & Data → Notifications**. Never enabled silently.

### 4. Monday Carry-Forward Ritual
*   On the first launch of each new week, [CarryForwardDialog.tsx](../components/CarryForwardDialog.tsx)
    lists the previous week's **unfinished goal-linked todos**, grouped by parent goal,
    with per-item **Carry → Monday / Move → day / Drop** plus bulk actions.
    Unlinked todos never appear — week isolation stays the rule for them.
*   Pure domain logic in [utils/carryForward.ts](../utils/carryForward.ts);
    once-per-week flag `omni_carry_forward_week`. Shown before the Morning Briefing.

### 5. Dashboard Week-Key Bug Fix (critical)
*   `allWeeks` is keyed by `omni_week_YYYY-MM-DD`, but six handlers
    (log actual, toggle/add todo, complete/add habit, set focus theme) indexed it
    by the bare date — every Dashboard Start/Skip/todo/habit action silently
    no-oped, and Add Todo wrote a phantom week under the wrong key. All six now
    use `getWeekStorageKey` + `getOrCreateWeek` with immutable updates.

### 6. Housekeeping
*   `models/` (multi-GB llamafiles) and design archives gitignored; 5.8 GB of
    orphaned git objects from an aborted `git add` pruned.
*   Model-keyed AI pricing (unknown/local models = $0; board labeled an estimate).
*   `focusTheme` declared on `DailyPlan` ([types.ts](../types.ts) line 164) — was being
    written via spread literals in 3 components without a type declaration. Spread
    literals bypass TypeScript's excess-property check, which is why it compiled
    silently. **Watch for this class of type hole**: any `{ ...obj, undeclaredProp: val }`
    pattern will accept undeclared properties without error.
*   Stray storage keys (`omni_ai_usage_stats`, `omni_last_briefing_date`) registered
    in `LOCAL_STORAGE_KEYS`; version aligned to **4.0.0**.

### v4.0 Verification
*   All 138 Vitest tests pass; `tsc --noEmit` clean; production build clean.
*   Carry-forward verified end-to-end in the web preview: carry lands on Monday
    with the goal link intact, reschedule lands on the chosen day, dropped items
    stay untouched in the previous week, ritual re-arms next week.
*   Alarm/tray flows require the packaged desktop app: close window → tray icon
    persists → Pulse alarm fires a Windows toast → reopen from tray → quit via
    tray menu shows confirmation.

---

## 🎯 Part 1: Product Vision & Architecture Analysis

OmniPlanner (also referred to as **OmniPlan AI** or **Executive Life OS**) is built around a distinct philosophy:
*   **Privacy-First & Local-First**: A 100% client-side application. No cloud databases, no tracking, and no external account requirements. All data stays local to the device.
*   **Week-Isolated Planning**: Each week is a self-contained sandbox. Tasks and goals do not automatically roll over to cascade into an overwhelming backlog. This design aims to reduce planning anxiety by starting every Monday with a clean slate.
*   **Actionable Executive Suite**: Rather than just a to-do list, it serves as a central cockpit, combining long-term goals (10Y/5Y/3Y/1Y/monthly), weekly scheduling, daily focus themes, calendar time-blocking, email triage, and focus alarms.
*   **Optional AI Assist**: AI features (using Gemini, OpenAI, etc.) are strictly opt-in and supplementary (e.g., extracting events from emails, predicting daily focus), degrading gracefully if the user has no API keys.

### Strategic Feedback & Evaluation

#### Strengths & Merits
1.  **Backlog Anxiety Reduction**: The **week-isolated** architecture is a powerful psychological mechanism. Traditional planners (like Todoist or Notion templates) punish users for falling behind by letting overdue tasks pile up. OmniPlanner treats time as bounded units.
2.  **Privacy Guarantee**: By keeping email caching, calendar events, habits, and journal entries entirely local (and encrypting API keys/passwords via OS keychains), it creates a highly secure environment for personal reflection and executive work.
3.  **Local Performance**: With no network hops needed to read or write data, the UI is instantly responsive.

#### Strategic Challenges & Risks
1.  **The Multi-Device Paradox**: Modern users expect to plan on a desktop and check tasks on their phone. While Capacitor (mobile) and PWA support exist, a **local-first app without a server** makes syncing between devices extremely difficult. Standard manual JSON exports are a high-friction workaround.
2.  **Web Sandbox Limitations**: PWA/Web environments cannot bypass CORS easily (requiring Node.js proxies) and cannot connect directly to standard IMAP mailboxes without a server. This limits the "Priority Inbox" feature primarily to the Electron desktop shell.
3.  **Local Storage Limits**: Electron initially relied on browser `localStorage`. Browser `localStorage` is capped at ~5-10MB. Caching years of email bodies, journal entries, sleep logs, and calendar events will eventually exceed this quota.

---

## 🛠️ Part 2: Master Implementation Plans

### 📋 Phase v3.0: Core Architecture Upgrades
*   **Robust File-System Key-Value Storage**: Expose file storage read-all, set, and delete operations via Electron IPC. Synchronously cache keys in memory on startup so we can implement the synchronous `StorageAdapter` interface, writing writes through asynchronously to bypass the 5MB browser sandbox limit.
*   **Pomodoro Focus Timer**: Synthesize focus complete alert tones using Web Audio API `AudioContext` with zero asset dependencies. Log completed focus blocks to calendar actual logs.
*   **Morning Briefing Agenda Modal**: Startup visualizer for habit rates, high priority actions, calendar blocks, and focus inputs. Pop open automatically on the day's first launch.
*   **MIME Email Parser**: Switch from regex parsing to `mailparser` package. Render rich html inside a sandboxed `iframe` with toggling.
*   **CSP & Security Hardening**: Drop `'unsafe-eval'` in production CSP. Add settings plaintext warnings in browser/fallback modes.

### 📋 Phase v3.1: Local LLMs & Token Estimators
*   **Embedded Local Llamafile Controller**: Expose child-process control IPC handlers (`local-model:list`, `local-model:start`, `local-model:stop`, `local-model:status`). Automatically terminate running processes on Electron quit (`before-quit` event). Provide a control panel in Settings to list downloaded llamafiles (`gemma-3-4b-it.exe`, `qwen2.5-3b-instruct-q4_k_m.exe`, etc.) and start/stop them with one click, auto-binding custom endpoints to port 8080.
*   **Interactive Local AI Presets**: Add preset buttons for external engines Ollama (port 11434) and LM Studio (port 1234) inside `AISettings.tsx`.
*   **AI Usage & Token Cost Estimator**: Track prompt and completion tokens in a logger service, calculating approximate API costs per optimization call (Gemini 2.0 Flash, GPT-4o-Mini, Claude 3.5 Sonnet, and $0.00 for local servers). Render metrics on a real-time board in `AISettings.tsx`.

### 📋 Phase v3.2: Premium Weekly Planner & Sub-divided Event Blocks
*   **Sub-divided Schedule Blocks**: Support nesting `CalendarSubEvent` items inside calendar blocks. Offer interactive checkoff widgets directly on the timeline grid and a granular checklist designer in the event editor modal.
*   **Premium Drawer Layout**: Migrate the floating Week Review panel into a sliding sidebar panel that collapses cleanly via a close button to yield full-screen focus.
*   **Unified Column Cards**: Restructure daily planner columns to group focus fields and to-do checklists inside rounded cards with shadows and hover micro-animations.

---

## 📝 Part 3: Development Walkthrough & Changes Log

### 1. Robust File-System Storage (v3.0)
*   **Electron Main**: Implemented file storage IPC channels (`file-storage:read-all`, `file-storage:set`, `file-storage:remove`) in [electron-main.cjs](file:///d:/정준화/OmniPlanner/omniplan-ai---executive-life-os/electron-main.cjs) writing to `userData/storage/`.
*   **Storage Adapter Factory**: Created the `ElectronFileStorageAdapter` class in [services/storage/index.ts](file:///d:/정준화/OmniPlanner/omniplan-ai---executive-life-os/services/storage/index.ts). Synchronously migrates legacy `omni_*` key-value pairs from `localStorage` into file storage on startup, bypassing the 5MB browser storage quota.

### 2. Interactive Pomodoro & Focus Timer (v3.0)
*   **Timer UI**: Created the [PomodoroTimer.tsx](file:///d:/정준화/OmniPlanner/omniplan-ai---executive-life-os/components/PomodoroTimer.tsx) component. Features custom presets (25m/50m focus, 5m/15m break), dynamic countdown progress indicators, and an undoable focus logger.
*   **Synth Sound Chime**: Uses the native browser `AudioContext` to synthesize a clean, two-tone rising chime (A5 -> E6) upon timer completion.
*   **Calendar Logging**: Automatically logs the elapsed duration into the actual calendar log for today.

### 3. Start-of-Day Morning Briefing & Daily Focus (v3.0)
*   **Agenda Visualizer**: Created the [MorningBriefing.tsx](file:///d:/정준화/OmniPlanner/omniplan-ai---executive-life-os/components/MorningBriefing.tsx) modal. Shows yesterday's habit completion rates, today's top 3 pending high-priority actions, and today's upcoming focus blocks.
*   **Dashboard Integration**: Added a quote-style focus banner at the top of [DashboardView.tsx](file:///d:/정준화/OmniPlanner/omniplan-ai---executive-life-os/components/DashboardView.tsx) and exposed a **Daily Brief** manual trigger button.

### 4. Robust MIME Email & Sandboxed Rich HTML Views (v3.0)
*   **MIME Parsing**: Integrated `mailparser` in the main process to handle complex MIME structures, Quoted-Printable/base64 decodings, and multi-part headers cleanly.
*   **Secure Frame Sandbox**: Renders the parsed rich email body inside a sandboxed `iframe` (`sandbox=""`), blocking script execution, external tracking tokens, and style leaks in [EmailView.tsx](file:///d:/정준화/OmniPlanner/omniplan-ai---executive-life-os/components/EmailView.tsx).

### 5. Desktop Security Hardening (v3.0)
*   **Production CSP**: Hardened production headers in `electron-main.cjs` to drop `'unsafe-eval'` script permissions when dev server is inactive.
*   **Credentials Warning**: Displays warnings to users in PWA/browser fallback modes in `AISettings.tsx` and `EmailSettings.tsx` alerting them that credentials are saved in plaintext storage since local keychain APIs are unavailable.

### 6. Local Llamafile Server Controller (v3.1)
*   **Llamafile Integration**: Spawns self-contained `.exe` files in the `models/` directory in headless server mode (`--server --port 8080 --host 127.0.0.1`), leveraging system GPU acceleration.
*   **Resource Cleanup**: Hooked into Electron's `before-quit` event to terminate any running local model server process cleanly on exit.
*   **Desktop UI**: Implemented a **Local Llamafile Server Controller** panel inside [AISettings.tsx](file:///d:/정준화/OmniPlanner/omniplan-ai---executive-life-os/components/AISettings.tsx). This panel lists the executables copied from `D:\정준화\mnemosyne\models` (`gemma-3-4b-it.exe`, `qwen2.5-3b-instruct-q4_k_m.exe`, `qwen3-4b.exe`) and lets users start/stop servers with one click, auto-configuring their custom endpoint to port 8080.

### 7. Interactive Local AI Presets (v3.1)
*   **Settings Panel**: Added instant preset buttons for external engines **Ollama** (sets URL to `http://localhost:11434/v1` and model to `llama3`) and **LM Studio** (sets URL to `http://localhost:1234/v1` and model to `default`) in `AISettings.tsx`.

### 8. AI Usage & Token Cost Estimator (v3.1)
*   **Usage Service**: Created [tokenLogger.ts](file:///d:/정준화/OmniPlanner/omniplan-ai---executive-life-os/services/ai/tokenLogger.ts) to track aggregate AI metrics: calls completed, prompt tokens, completion tokens, and estimated USD costs.
*   **Metrics Integration**: Added hooks in [gemini.ts](file:///d:/정준화/OmniPlanner/omniplan-ai---executive-life-os/services/ai/gemini.ts), [openai.ts](file:///d:/정준화/OmniPlanner/omniplan-ai---executive-life-os/services/ai/openai.ts), [anthropic.ts](file:///d:/정준화/OmniPlanner/omniplan-ai---executive-life-os/services/ai/anthropic.ts), and [openai-compatible.ts](file:///d:/정준화/OmniPlanner/omniplan-ai---executive-life-os/services/ai/openai-compatible.ts) to capture usage statistics from API responses.
*   **Dashboard UI**: Embedded an **AI Cost & Token Board** inside `AISettings.tsx` displaying real-time metrics with an option to reset statistics.

### 9. Sparkles Icon Import Hotfix (v3.1)
*   **Runtime Crash Resolution**: Resolved a startup crash (white screen) in the Electron desktop renderer caused by an uncaught `ReferenceError: Sparkles is not defined` inside `DashboardView.tsx`.
*   **Fix**: Correctly imported the `Sparkles` icon from `lucide-react` at the top of `components/DashboardView.tsx`.

### 10. Premium Weekly Planner & Sub-divided Event Blocks (v3.2)
*   **Checklist Creator inside Modal**: Added a **Sub-Events & Checklist** planner section in `components/CalendarEventEditor.tsx` allowing users to add, toggle, and remove sub-items (e.g. meetings, tasks) within any block.
*   **In-Place Checkboxes**: Displayed sub-events directly inside the calendar block on the timeline grid. Clicking a checkbox toggles the completion state in real-time, preventing the block edit modal from opening.
*   **Collapsible Week Review Sidebar**: Wrapped the review stats in an elegant sliding panel on the right side of the main workspace in `components/WeeklyPlannerView.tsx`. Made it collapsible with a close `X` button, allowing the calendar grid to expand to full-screen when review is closed.
*   **Daily Column Card Refactor**: Grouped the Daily Focus and To Do List of each day in a beautiful white card with soft drop shadows and rounded (`rounded-[2rem]`) edges. Cleaned up the borders to make the layout feel deeply integrated and aligned.
*   **Grid Logic & High-Contrast Lines**: Aligned the half-hour time-slot height inside the grid from `h-20` (80px) to the actual positioning height value `PIXELS_PER_HOUR * STEP` (40px), syncing click triggers with visual borders. Hardened slot borders, separating hour ticks with solid lines and half-hours with dashed lines for maximum visibility on warm screens.
*   **Moment-Based Event Filters**: Filter out events whose scheduled time range is in the past relative to the current local hour inside `components/DashboardView.tsx`, updating the dynamic "today" badge count automatically.
*   **Dashboard Display Limits**: Sliced the rendered upcoming events list to a maximum of 3 items to keep the overview clean and compact.

---

## 📋 Phase v4.1 Backlog: UI Polish

Design-review findings captured to prevent loss:
*   **Micro-label floor**: Raise 9px labels to an **11px minimum** — unreadable on high-DPI, fails WCAG at that size.
*   **Dark mode**: An always-open evening app needs a dark theme. All-white surfaces cause eye strain during late planning.
*   **44×44px touch targets**: Before the Capacitor mobile build matters, all interactive elements must meet minimum touch target.
*   **"ENTERPRISE EDITION" badge**: Replace or remove — it's a placeholder that undercuts credibility.

---

## 🧑‍💻 Manual Verification Checklist — Packaged App (Phase 1 Gate)

Until this passes on the developer's machine, Phase 1 stays "code-verified" not "done done":

1. Build with `npm run start` (or `npm run dist:win` for NSIS installer)
2. Close window → confirm tray icon appears → confirm app in Task Manager → confirm gone from taskbar
3. Set Pulse alarm ~2 min out → close window → confirm Windows toast fires
4. Double-click tray icon → confirm window restores and focuses
5. Tray → Quit OmniPlanner → confirm confirmation dialog → confirm full exit
6. (Opt-in) Enable startup in Settings → reboot → confirm auto-launch + tray icon
