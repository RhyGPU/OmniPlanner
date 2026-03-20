/**
 * Secure settings abstraction for sensitive credentials.
 *
 * SECURITY MODEL (Phase 4):
 *   - API keys are stored in Electron safeStorage (OS keychain encryption).
 *   - Non-sensitive settings (provider, customEndpoint, customModel) remain in
 *     plain localStorage via the storage adapter.
 *   - A renderer-side _apiKeyCache is populated once at startup by
 *     initAICredentials(). getAISettings() remains synchronous by reading from
 *     this cache, keeping the AI service layer unchanged.
 *   - On web (no electronAPI), falls back to plain localStorage for the API key
 *     so the app still works in a browser dev environment.
 *   - Email passwords are managed by EmailSettings via platform.credentials
 *     directly — not through this file.
 *
 * PLATFORM BOUNDARY (Phase 8):
 *   All credential I/O now goes through platform.credentials (services/platform).
 *   No direct window.electronAPI calls remain in this file.
 *
 * MIGRATION:
 *   migrateCredentials() moves any plaintext API key / email passwords that
 *   were stored in localStorage under the old scheme into safeStorage, then
 *   strips the plaintext values. It is idempotent and safe to call on every
 *   startup.
 */

import { storage, LOCAL_STORAGE_KEYS } from './index';
import { platform, isElectron } from '../platform';
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
  } catch {
    _apiKeyCache = null;
  }
}

/**
 * Read AI provider settings synchronously.
 *
 * Returns cached API key (populated by initAICredentials). Falls back to
 * plaintext localStorage only when running outside Electron (dev browser).
 */
export function getAISettings(): AISettings {
  const saved = storage.get<AISettingsNonSensitive>(LOCAL_STORAGE_KEYS.AI_SETTINGS);

  let apiKey = '';
  if (isElectron()) {
    apiKey = _apiKeyCache ?? '';
  } else {
    // Web fallback: read from legacy full-settings object or env var
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

  // Legacy env-var path for existing users without saved settings
  if (!isElectron() && !apiKey) {
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

  if (isElectron()) {
    const ok = await platform.credentials.set(KEYCHAIN_AI_KEY, settings.apiKey);
    if (ok) {
      _apiKeyCache = settings.apiKey;
    }
    return ok;
  }

  // Web fallback: store API key in plain localStorage (dev/browser environment)
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
  const rawAccounts = localStorage.getItem('omni_email_accounts');
  if (!rawAccounts) return;
  try {
    const accounts: Array<{ id: string; password?: string; [key: string]: unknown }> =
      JSON.parse(rawAccounts);
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
      localStorage.setItem('omni_email_accounts', JSON.stringify(accounts));
    }
  } catch {
    // Malformed storage — leave it alone
  }
}
