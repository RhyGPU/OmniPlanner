# OmniPlanner — Release Checklist

Run this checklist before every release (merge to main, version bump, or binary distribution).

---

## 1. Automated gate (required to pass before any release)

```bash
# In omniplan-ai---executive-life-os/
npm run typecheck   # Zero TypeScript errors
npm run test:run    # All automated tests pass
```

Both must exit 0. A failing typecheck or failing test blocks the release.

---

## 2. Migration verification

| Check | How |
|---|---|
| `npm run test:run` covers migration tests | `__tests__/migrations.test.ts` — v1, v3 idempotency, version gating |
| Fresh install (no storage keys) → migrations run clean | Manual: clear storage, open app, check no console errors |
| Existing data upgrade → data survives | Manual: load a pre-v3 backup, restore, verify goals/todos visible |
| Schema version advances to 3 after first run | Manual: check localStorage `omni_schema_version` = 3 |

---

## 3. Backup / restore verification

| Check | How |
|---|---|
| Valid backup accepted | `__tests__/backupValidator.test.ts` — modern + legacy format tests |
| Malformed backup rejected (null, array, missing fields) | `__tests__/backupValidator.test.ts` — null/primitive/unrecognized tests |
| Restore preview shown before overwrite | Manual: DataView → restore file → preview metadata appears |
| Malformed file shows error, no data written | Manual: upload a `.txt` file as backup → error displayed, data unchanged |
| Legacy backup (pre-v3.0) restores with warning | Manual: import a v2 backup → warning shown, goals regenerated on next launch |

---

## 4. Reminder logic verification

| Check | How |
|---|---|
| Reminder status labels accurate | `__tests__/reminderStatus.test.ts` |
| Focus block reminder only shown for focus/task_block events | `__tests__/CalendarEventEditor.test.tsx` |
| Reminder section hidden on Electron | `__tests__/CalendarEventEditor.test.tsx` |
| "Enable notifications" hint shown when master switch is off | `__tests__/CalendarEventEditor.test.tsx` |
| Habit badge appears in habits panel when reminder active | Manual: enable habit reminder, check Habitual Protocols header badge |
| Bell icon on focus event when reminder active | Manual: enable focus reminder, check calendar event card |

---

## 5. AI readiness gating

| Check | How |
|---|---|
| Provider = none → button disabled, label = "AI disabled" | `__tests__/readiness.test.ts` |
| Provider set, no key → label = "API key missing" | `__tests__/readiness.test.ts` |
| Provider = custom, no key → ready (no key required) | `__tests__/readiness.test.ts` |
| AI Optimize Week button disabled when not ready | Manual: set provider to none → button disabled in WeeklyPlannerView |

---

## 6. Onboarding / welcome card

| Check | How |
|---|---|
| `hasPlannerData()` conservative detection | `__tests__/onboardingState.test.ts` — 19 scenarios |
| Fresh install (no data) shows welcome card | Manual: clear storage, open app |
| User with data does not see welcome card | Manual: restore a backup, reload — no card |
| Dismiss hides card permanently | Manual: click "Start planning" → card gone on reload |

---

## 7. Platform smoke test matrix

Test on each target before a binary release:

| Feature | Desktop (Electron) | Web/PWA | Mobile (Capacitor) |
|---|---|---|---|
| App loads, weekly planner visible | ☐ | ☐ | ☐ |
| Create/edit/delete calendar event | ☐ | ☐ | ☐ |
| Add weekly goal, link to calendar block | ☐ | ☐ | ☐ |
| Add habit, mark completion | ☐ | ☐ | ☐ |
| Export backup → file downloads | ☐ | ☐ | ☐ |
| Import backup → data restored | ☐ | ☐ | ☐ |
| AI provider + key configured, Optimize Week runs | ☐ | ☐ | ☐ |
| Notification reminder enabled, fires at scheduled time | n/a (unavailable) | ☐ | ☐ |
| Reminder section hidden in CalendarEventEditor | ☐ (Electron) | ☐ | ☐ |
| No console errors on load | ☐ | ☐ | ☐ |

---

## 8. Regression surface — manual spot checks

These are not covered by automated tests due to platform complexity:

- Storage degradation banner shown when IndexedDB unavailable (web)
- Secure credential migration on first upgrade from a pre-v11 build (Electron)
- ICS import round-trip (paste `.ics` content, events appear in planner)
- Email inbox load with a real IMAP account (requires credentials)
- Goal hierarchy: create parent → child goals, verify streak analytics

---

## 9. Pre-merge checklist (every PR)

- [ ] `npm run typecheck` passes
- [ ] `npm run test:run` passes
- [ ] No new `any` types added without comment
- [ ] No direct `localStorage.*` calls outside `services/storage/`
- [ ] No platform API calls (Capacitor/Electron) outside `services/platform/`
- [ ] Backup/restore discipline preserved (no credentials in backup)
- [ ] New storage keys registered in `LOCAL_STORAGE_KEYS` registry

---

## 10. Version bump procedure

1. Run automated gate: `npm run typecheck && npm run test:run`
2. Complete manual smoke test matrix above
3. Update `version` in `package.json`
4. Tag the release commit: `git tag vX.Y.Z`
5. Build platform binaries: `npm run dist` / `npm run build:mobile`
6. Export a test backup and verify it restores cleanly in the new binary
