# OmniPlanner — Security Model

> Last updated: Phase 1 (storage hardening iteration)
> Product philosophy: privacy-first, local-first, no telemetry.

---

## Threat Model

OmniPlanner is a **local-first desktop application**. The primary threat surface is
**local device compromise**, not network attackers. There is no server, no account,
no sync service.

### Assets

| Asset | Sensitivity | Location |
|-------|-------------|----------|
| Weekly plan data (todos, habits, notes) | Medium | `omni_all_weeks` localStorage |
| Life goals | Medium | `omni_lifegoals` localStorage |
| AI provider API key | **High** | `omni_ai_settings` localStorage |
| Email account password | **Critical** | `omni_email_accounts` localStorage |
| Email content (cached) | High | `omni_emails` localStorage |

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

## Current Vulnerabilities

### CRITICAL — Email passwords stored in plaintext

**Key**: `omni_email_accounts`
**Field**: `EmailAccount.password`
**Risk**: Any code with DOM access (extensions, XSS) can read IMAP passwords.
**Affected files**: `components/EmailSettings.tsx`, `electron-main.cjs`

```
// TODO(security/email-password): EmailAccount.password is stored in plaintext localStorage.
// Migration path:
//   - Electron (Phase 3): route through Electron safeStorage IPC
//     ipcMain.handle('keychain:set', (_, key, value) => safeStorage.encryptString(value))
//     ipcMain.handle('keychain:get', (_, key) => safeStorage.decryptString(buf))
//   - Web/mobile (Phase 5): OAuth-only; remove password field entirely from EmailAccount
// DO NOT remove this TODO until the migration is complete and tested.
```

### HIGH — AI API keys stored in plaintext

**Key**: `omni_ai_settings`
**Field**: `AISettings.apiKey`
**Risk**: API key readable via DevTools or malicious extension.
**Affected files**: `services/storage/secureSettings.ts` (Phase 1+), `services/settings.ts`

```
// TODO(security/api-key): apiKey is stored in plaintext localStorage.
// Phase 3 migration: route through Electron safeStorage IPC.
// See SECURITY_MODEL.md for full plan.
```

**Interim mitigations** (Phase 1):
- Credentials isolated in `services/storage/secureSettings.ts`
- TODO markers provide clear migration contract
- Electron context isolation is enabled (renderer cannot call Node.js directly)

### MEDIUM — Permissive Content Security Policy

**Location**: `electron-main.cjs` (CSP header on main window)
**Current CSP**: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; … connect-src *`
**Risk**: `unsafe-inline` and `unsafe-eval` weaken XSS defenses.
**Justification**: Required for Vite dev server and TailwindCSS JIT in dev mode.
**Mitigation for production**: Use CSP nonce or hash-based approach for scripts. Remove `unsafe-eval` in production build.

```
// TODO(security/csp): tighten CSP for production. 'unsafe-eval' should only appear in dev.
// Use VITE_CSP_NONCE or build-time script hash injection before web deployment.
```

### MEDIUM — Email body rendered without sanitization

**Location**: `components/EmailView.tsx`
**Risk**: If email bodies contain HTML/script content and are rendered unsanitized, XSS is possible.
**Current state**: Email body is displayed as `<pre>` text (no HTML rendering). Low risk today.

```
// TODO(security/email-xss): Before rendering HTML email bodies, sanitize with DOMPurify
// or equivalent. Currently rendered as plaintext — safe.
```

### LOW — localStorage size limit

**Limit**: ~5–10 MB per origin.
**Risk**: Large data sets (years of weekly data) could hit the limit, silently dropping saves.
**Mitigation (Phase 3)**: IndexedDB adapter has no practical size limit.

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

### Phase 1 (current) — Bound the blast radius
- [x] Isolate credential access behind `services/storage/secureSettings.ts`
- [x] Add TODO markers at every plaintext credential site
- [x] Document all vulnerabilities here

### Phase 3 — OS keychain integration (Electron)
- [ ] Add `ipcMain.handle('keychain:set')` using `safeStorage.encryptString`
- [ ] Add `ipcMain.handle('keychain:get')` using `safeStorage.decryptString`
- [ ] Update `secureSettings.ts` to call keychain IPC when in Electron context
- [ ] Migrate existing plaintext API keys to keychain on first run (one-time migration)
- [ ] Add `ipcMain.handle('keychain:delete')` for account removal
- [ ] Remove `EmailAccount.password` from localStorage; store encrypted via keychain
- [ ] Tighten CSP (`unsafe-eval` dev-only)

### Phase 5 — OAuth for email
- [ ] Replace IMAP password auth with OAuth2 for Gmail and Outlook
- [ ] Remove `password` field from `EmailAccount` type
- [ ] Add migration v3 to drop stored passwords from `omni_email_accounts`
- [ ] Document app-specific password fallback for providers without OAuth

---

## TODO Index

The following `// TODO(security/*)` markers exist in the codebase. Each must be resolved
before the corresponding platform is deployed.

| Tag | File | Phase | Description |
|-----|------|-------|-------------|
| `TODO(security/api-key)` | `services/storage/secureSettings.ts` | 3 | AI API key → safeStorage |
| `TODO(security/email-password)` | `types.ts`, `components/EmailSettings.tsx` | 3/5 | IMAP password → keychain/OAuth |
| `TODO(security/csp)` | `electron-main.cjs` | 3 | Tighten CSP for production |
| `TODO(security/email-xss)` | `components/EmailView.tsx` | 5 | Sanitize HTML email bodies |
