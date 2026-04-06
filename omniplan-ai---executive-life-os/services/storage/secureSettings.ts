/**
 * Secure settings abstraction for sensitive credentials.
 *
 * SECURITY MODEL (Phase 11A update):
 *   - API keys are stored in platform-native secure storage:
 *       Electron:   safeStorage (OS keychain via AES-256 + OS key derivation)
 *       Capacitor:  SecureStoragePlugin (iOS Keychain / Android Keystore)
 *       Web:        localStorage fallback (plaintext — dev environment only,
 *                   never used in production Capacitor or Electron builds)
 *   - Non-sensitive settings (provider, customEndpoint, customModel) remain in
 *     plain localStorage / IDB via the storage adapter.
 *   - A renderer-side _apiKeyCache is populated once at startup by
 *     initAICredentials(). getAISettings() remains synchronous by reading from
 *     this cache, keeping the AI service layer unchanged.
 *   - Email passwords are managed by EmailSettings via platform.credentials
 *     directly — not through this file.
 *
 * PLATFORM BOUNDARY (Phase 8):
 *   All credential I/O goes through platform.credentials (services/platform).
 *   No direct window.electronAPI calls remain in this file.
 *   platform.credentials.isAvailable() gates all secure paths.
 *
 * MIGRATIONS:
 *   migrateCredentials()                    — moves plaintext localStorage keys
 *                                              to platform.credentials on first launch.
 *   runMobileSecureMigration() (Phase 11A)  — on Capacitor, moves credentials
 *                                              from the Phase 10 transitional
 *                                              @capacitor/preferences store to
 *                                              native Keychain/Keystore. Must be
 *                                              called BEFORE migrateCredentials().
 *
 * PLATFORM SECRET HANDLING SUMMARY:
 *   Desktop (Electron):   Electron safeStorage → hardware OS key derivation.
 *                         Strongest protection available on the platform.
 *   Mobile (Capacitor):   iOS Keychain / Android Keystore via
 *                         capacitor-secure-storage-plugin. Hardware-backed on
 *                         capable devices. NOT equivalent to Preferences.
 *   Web (browser/PWA):    localStorage fallback. NOT secure storage.
 *                         Only used in browser development. Users should be
 *                         informed that credentials stored this way are not
 *                         hardware-protected.
 */

import { storage, LOCAL_STORAGE_KEYS } from './index';
import { platform } from '../platform';
import type { AIProviderID } from '../ai/types';

export interface AISettings {
  provider: AIProviderID;
  apiKey: string;
  customEndpoint?: string;
  customModel?: string;
}

// ---------------------------------------------------------------------------
// Non-sensitive AI settings shape stored in localStorage
// ---------------------------------------------------------------------------
interface AISettingsNonSensitive {
  provider: AIProviderID;
  customEndpoint?: string;
  customModel?: string;
}

const AI_DEFAULTS: AISettings = {
  provider: 'none',
  apiKey: '',
  customEndpoint: '',
  customModel: '',
};

// Renderer-side in-memory cache for the API key retrieved from safeStorage.
// Populated by initAICredentials() on app startup.
let _apiKeyCache: string | null = null;

/**
 * Set to true when initAICredentials() encounters a storage error.
 * Distinguishes "no key configured" (false + null cache) from "storage unavailable"
 * (true + null cache). Callers can surface this as "AI features temporarily unavailable".
 */
let _credentialLoadFailed = false;

const KEYCHAIN_AI_KEY = 'omni_api_key';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the renderer-side API key cache from Electron safeStorage.
 * Must be awaited once on app startup before getAISettings() is called.
 * No-op on web (platform.credentials.isAvailable() returns false).
 */
export async function initAICredentials(): Promise<void> {
  if (!platform.credentials.isAvailable()) return;
  try {
    const key = await platform.credentials.get(KEYCHAIN_AI_KEY);
    _apiKeyCache = key ?? null;
    _credentialLoadFailed = false;
  } catch (e) {
    console.error(
      '[OmniPlanner] initAICredentials: failed to load API key from secure storage. ' +
      'AI features will be unavailable this session. Check keychain/keystore access.',
      e,
    );
    _apiKeyCache = null;
    _credentialLoadFailed = true;
  }
}

/**
 * Returns true when initAICredentials() encountered a storage error this session.
 *
 * Use this to surface "AI features temporarily unavailable — secure storage error"
 * rather than treating the failure as "no API key configured".
 *
 * False means either the key was loaded successfully or credentials are not
 * used on this platform (web fallback path).
 */
export function getCredentialLoadFailed(): boolean {
  return _credentialLoadFailed;
}

/**
 * Read AI provider settings synchronously.
 *
 * Returns cached API key (populated by initAICredentials).
 *
 * On Electron and Capacitor: returns _apiKeyCache (populated from native secure
 * storage at startup by initAICredentials).
 * On web: falls back to plaintext localStorage (dev environment only — not secure).
 */
export function getAISettings(): AISettings {
  const saved = storage.get<AISettingsNonSensitive>(LOCAL_STORAGE_KEYS.AI_SETTINGS);

  let apiKey = '';
  if (platform.credentials.isAvailable()) {
    // Electron + Capacitor: use the in-memory cache populated by initAICredentials()
    apiKey = _apiKeyCache ?? '';
  } else {
    // Web fallback: read from legacy full-settings object or env var
    // NOTE: This stores the API key in plaintext localStorage.
    // This path is only reached in plain browser dev environments.
    const legacy = storage.get<Partial<AISettings>>(LOCAL_STORAGE_KEYS.AI_SETTINGS);
    apiKey = legacy?.apiKey ?? '';
    if (!apiKey) {
      apiKey =
        (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
        (typeof process !== 'undefined' && process.env?.API_KEY) ||
        '';
    }
  }

  if (saved) {
    return {
      provider: saved.provider ?? AI_DEFAULTS.provider,
      apiKey,
      customEndpoint: saved.customEndpoint ?? '',
      customModel: saved.customModel ?? '',
    };
  }

  // Legacy env-var path for existing users without saved settings (web only)
  if (!platform.credentials.isAvailable() && !apiKey) {
    const legacyKey =
      (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
      (typeof process !== 'undefined' && process.env?.API_KEY) ||
      '';
    if (legacyKey) {
      return { ...AI_DEFAULTS, provider: 'gemini', apiKey: legacyKey };
    }
  }

  return { ...AI_DEFAULTS, apiKey };
}

/**
 * Persist AI provider settings.
 *
 * The API key is routed to Electron safeStorage when running inside Electron.
 * Only non-sensitive fields are written to localStorage.
 * Returns false if the keychain is unavailable (Linux without keyring daemon).
 */
export async function saveAISettings(settings: AISettings): Promise<boolean> {
  // Always persist non-sensitive fields in localStorage
  const nonSensitive: AISettingsNonSensitive = {
    provider: settings.provider,
    customEndpoint: settings.customEndpoint,
    customModel: settings.customModel,
  };
  storage.set(LOCAL_STORAGE_KEYS.AI_SETTINGS, nonSensitive);

  if (platform.credentials.isAvailable()) {
    // Electron + Capacitor: store in native secure storage (safeStorage / Keychain / Keystore)
    const ok = await platform.credentials.set(KEYCHAIN_AI_KEY, settings.apiKey);
    if (ok) {
      _apiKeyCache = settings.apiKey;
    }
    return ok;
  }

  // Web fallback: store API key in plain localStorage (dev/browser environment only).
  // WARNING: This is NOT secure storage. API keys stored here are readable by
  // any script with localStorage access. Never used in Electron or Capacitor builds.
  storage.set(LOCAL_STORAGE_KEYS.AI_SETTINGS, { ...nonSensitive, apiKey: settings.apiKey });
  return true;
}

/**
 * Migrate any plaintext credentials stored under the old scheme.
 *
 * - AI API key: moved from full AISettings object in localStorage to safeStorage.
 * - Email passwords: moved from EmailAccount.password in omni_email_accounts to
 *   safeStorage key omni_email_pw_<id>, then stripped from the accounts array.
 *
 * Idempotent: if safeStorage already has a value for a key, the migration is
 * skipped for that key (avoids overwriting a newer value with a stale one).
 */
export async function migrateCredentials(): Promise<void> {
  if (!platform.credentials.isAvailable()) return;

  // ── 1. AI API key ──────────────────────────────────────────────────────────
  const savedSettings = storage.get<Partial<AISettings & { apiKey: string }>>(
    LOCAL_STORAGE_KEYS.AI_SETTINGS,
  );
  if (savedSettings?.apiKey) {
    const existing = await platform.credentials.get(KEYCHAIN_AI_KEY);
    if (!existing) {
      await platform.credentials.set(KEYCHAIN_AI_KEY, savedSettings.apiKey);
      _apiKeyCache = savedSettings.apiKey;
    } else {
      _apiKeyCache = existing;
    }
    // Strip plaintext key from localStorage regardless
    const { apiKey: _removed, ...rest } = savedSettings;
    storage.set(LOCAL_STORAGE_KEYS.AI_SETTINGS, rest);
  }

  // ── 2. Email passwords ─────────────────────────────────────────────────────
  // NOTE: this migration reads from the storage adapter (which may be IDB on
  // web after Phase 9 init). The IndexedDB adapter already migrated the raw
  // localStorage entries during its own bootstrap, so storage.get() here
  // reads from the correct backend for this platform.
  const accounts = storage.get<Array<{ id: string; password?: string; [key: string]: unknown }>>(
    LOCAL_STORAGE_KEYS.EMAIL_ACCOUNTS,
  );
  if (!accounts) return;
  try {
    let dirty = false;
    for (const account of accounts) {
      if (account.password) {
        const credKey = `omni_email_pw_${account.id}`;
        const existing = await platform.credentials.get(credKey);
        if (!existing) {
          await platform.credentials.set(credKey, account.password);
        }
        delete account.password;
        dirty = true;
      }
    }
    if (dirty) {
      storage.set(LOCAL_STORAGE_KEYS.EMAIL_ACCOUNTS, accounts);
    }
  } catch {
    // Malformed storage — leave it alone
  }
}

/**
 * Phase 11A: Run mobile-specific secure storage migration.
 *
 * On Capacitor builds, credentials were stored in @capacitor/preferences
 * (NSUserDefaults / SharedPreferences — app-sandbox only, NOT hardware-backed)
 * during Phase 10. This function delegates to the Capacitor platform adapter to
 * drain those entries into native Keychain / Keystore via
 * capacitor-secure-storage-plugin.
 *
 * Must be called BEFORE migrateCredentials() so that by the time
 * migrateCredentials() checks platform.credentials for existing values,
 * the newly-migrated Keychain entries are already present and will not
 * be overwritten.
 *
 * Is a no-op on Electron and web — safe to call unconditionally.
 */
export async function runMobileSecureMigration(): Promise<void> {
  try {
    // Dynamic import keeps the Capacitor plugin out of the Electron / web bundles.
    const { migrateCapacitorCredentialsFromPreferences } = await import('../platform/capacitor');
    await migrateCapacitorCredentialsFromPreferences();
  } catch (e) {
    // Non-fatal: if the Capacitor platform module is not available (Electron / web),
    // the dynamic import will still succeed but migrateCapacitorCredentialsFromPreferences
    // will be a no-op via its own _isCapacitorNative() guard.
    // Log unexpected errors only.
    if (e instanceof Error && !e.message.includes('not a function')) {
      console.error('[OmniPlanner] runMobileSecureMigration error:', e);
    }
  }
}
