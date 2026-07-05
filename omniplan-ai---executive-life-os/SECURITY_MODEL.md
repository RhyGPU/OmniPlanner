# OmniPlanner — Security Model

> Last updated: v4.0 (July 2026) — credential findings from Phase 1 are RESOLVED;
> see "Resolved Findings" below for the history and current architecture.
> Product philosophy: privacy-first, local-first, no telemetry.

---

## Threat Model

OmniPlanner is a **local-first desktop application**. The primary threat surface is
**local device compromise**, not network attackers. There is no server, no account,
no sync service.

### Assets

| Asset | Sensitivity | Location (v4.0) |
|-------|-------------|-----------------|
| Weekly plan data (todos, habits, notes) | Medium | `omni_all_weeks` — file storage (desktop) / IndexedDB (web) |
| Life goals | Medium | `omni_goal_items` — same storage adapter |
| AI provider API key | **High** | OS credential store (safeStorage / Keychain / Keystore); plaintext only in browser fallback |
| Email account password | **Critical** | OS credential store, key `omni_email_pw_<id>`; never in planner storage |
| Email content (cached) | High | `omni_emails` — same storage adapter |
| Scheduled alarm titles/times | Low-Medium | `scheduled-alarms.json` in userData (mode 0600) |

### Threat actors

1. **Malicious browser extension** — can read `localStorage` for any origin
2. **XSS in renderer** — low risk today (no remote content in main view); higher risk if email
   bodies render unsanitized HTML
3. **Physical access / shared device** — anyone with DevTools access can read all data
4. **Malicious backup file** — imported JSON could trigger data corruption; no code execution
   risk from JSON (only `JSON.parse` is used)
5. **IMAP password exposure** — plaintext password passes through: localStorage → IPC → main
   process → imapflow → IMAP server (TLS). Risk if main process is compromised.

### Out of scope (by design)

- Network-level attacks (no cloud sync, no API server)
- Multi-user data isolation (single-user app)
- Supply chain attacks (standard npm risk, not OmniPlanner-specific)

---

## Current Credential Architecture (v4.0)

| Platform | API keys & email passwords | Mechanism |
|----------|---------------------------|-----------|
| Electron (desktop) | Encrypted at rest | `safeStorage` (OS key derivation) → `credentials.enc.json` (mode 0600) in userData. Email passwords never transit IPC after initial save — IMAP handlers read them main-process-side. |
| Capacitor (mobile) | Hardware-backed where available | iOS Keychain / Android Keystore via `capacitor-secure-storage-plugin` (Phase 11A migration from transitional Preferences store). |
| Web (browser dev/PWA) | **Plaintext localStorage** | Fallback only. The UI warns users that browser mode has no secure storage. Not used by Electron or Capacitor builds. |

One-time migrations (`migrateCredentials`, `runMobileSecureMigration`) drain any
legacy plaintext credentials into the platform store and strip them from
localStorage. `services/storage/secureSettings.ts` remains the single renderer
boundary for sensitive keys.

## Resolved Findings

### ✅ RESOLVED — Email passwords stored in plaintext (was CRITICAL)
Fixed in Phase 4/8/11A. `EmailAccount.password` no longer exists in storage:
passwords live in the platform credential store under `omni_email_pw_<id>`,
and `migrateCredentials()` strips any legacy plaintext copies on startup.
Main-process IMAP handlers call `getCredential()` directly, so passwords do
not cross the IPC boundary after the initial save.

### ✅ RESOLVED — AI API keys stored in plaintext (was HIGH)
Fixed in Phase 4/11A. Keys are stored via `platform.credentials`
(safeStorage / Keychain / Keystore); only non-sensitive settings
(provider, endpoint, model) remain in plain storage. Browser-mode fallback
is plaintext by necessity and labeled as such in the UI.

### ✅ RESOLVED — Permissive CSP (was MEDIUM)
Fixed in v3.0: production CSP drops `'unsafe-eval'`; it is applied only when
the Vite dev server is active.

### ✅ MITIGATED — HTML email rendering (was MEDIUM, plaintext-only then)
v3.0 renders rich HTML email bodies inside an `<iframe sandbox="">` — script
execution, form submission, and top-navigation are blocked by the empty
sandbox attribute; plaintext view remains the default toggle. Residual risk:
remote images can leak read-receipts; acceptable for a local-first client.

### ✅ RESOLVED — localStorage size limit (was LOW)
v3.0 file-system storage adapter on Electron (per-key JSON files in userData)
and the IndexedDB adapter on web remove the ~5 MB cap.

## Open Items

- **Web/PWA plaintext fallback** — inherent to browsers without OAuth; Phase 5
  OAuth work removes stored email secrets entirely on web.
- **OAuth for Gmail/Outlook** (Phase 5) — replaces IMAP app-passwords with
  revocable scoped tokens stored via safeStorage.
- **Alarm data file** (`scheduled-alarms.json`, v4.0) — stores alarm titles/times
  (plaintext, mode 0600). Titles may reveal schedule contents to local admins;
  same sensitivity class as the planner data files beside it.

---

## Security Controls in Place

| Control | Status | Notes |
|---------|--------|-------|
| Context isolation (`contextIsolation: true`) | ✅ | Renderer cannot access Node.js |
| Node integration disabled (`nodeIntegration: false`) | ✅ | Standard Electron security |
| Preload script IPC bridge | ✅ | Only explicitly allowed channels exposed |
| `JSON.parse` only for backup import | ✅ | No eval, no code execution from files |
| Soft-delete for habits | ✅ | Data preservation; no silent deletion |
| Backup export is local file | ✅ | No cloud upload |
| No telemetry | ✅ | Zero analytics, tracking, or error reporting |
| AI is opt-in | ✅ | No data sent to AI providers unless user configures |

---

## Remediation Roadmap

### Phase 1 — Bound the blast radius ✅
- [x] Isolate credential access behind `services/storage/secureSettings.ts`
- [x] Add TODO markers at every plaintext credential site
- [x] Document all vulnerabilities here

### Phase 3 — OS keychain integration (Electron) ✅ (shipped Phase 4/8/11A)
- [x] `ipcMain.handle('keychain:set'/'get'/'delete'/'is-available')` via safeStorage
- [x] `secureSettings.ts` routes through `platform.credentials`
- [x] One-time migrations for legacy plaintext keys and email passwords
- [x] `EmailAccount.password` removed from storage (stripped by migration)
- [x] CSP tightened (`unsafe-eval` dev-only, v3.0)

### Phase 5 — OAuth for email (open)
- [ ] Replace IMAP password auth with OAuth2 for Gmail and Outlook
      (requires registering OAuth client IDs with Google/Microsoft)
- [ ] Remove password entry entirely on web/mobile
- [ ] Document app-specific password fallback for providers without OAuth
