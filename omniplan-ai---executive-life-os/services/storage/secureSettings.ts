/**
 * Secure settings abstraction for sensitive credentials.
 *
 * CURRENT STATE: Credentials are stored as plaintext in localStorage.
 * This is the only file that reads or writes sensitive keys (AI_SETTINGS,
 * EMAIL_ACCOUNTS). All other code must go through these functions.
 *
 * WHY THIS FILE EXISTS: Bounding all credential I/O here makes the Phase 3
 * migration to OS keychain a single-file change rather than a codebase hunt.
 *
 * TODO(security/api-key): In Phase 3, replace storage.get/set(AI_SETTINGS)
 * with Electron safeStorage IPC calls:
 *   ipcRenderer.invoke('keychain:set', 'omni_api_key', settings.apiKey)
 *   ipcRenderer.invoke('keychain:get', 'omni_api_key')
 * The non-sensitive fields (provider, customEndpoint, customModel) can remain
 * in localStorage.
 *
 * TODO(security/email-password): In Phase 3/5, EmailAccount.password must NOT
 * be stored in localStorage. Migration path:
 *   - Electron: safeStorage keychain (same pattern as API key above)
 *   - Web/mobile: OAuth2 tokens only — remove the password field entirely
 * See SECURITY_MODEL.md for the full remediation plan.
 */

import { storage, LOCAL_STORAGE_KEYS } from './index';
import type { AIProviderID } from '../ai/types';

export interface AISettings {
  provider: AIProviderID;
  apiKey: string;
  customEndpoint?: string;
  customModel?: string;
}

const AI_DEFAULTS: AISettings = {
  provider: 'none',
  apiKey: '',
  customEndpoint: '',
  customModel: '',
};

/** Read AI provider settings. Falls back to legacy env-var path for existing users. */
export function getAISettings(): AISettings {
  const saved = storage.get<Partial<AISettings>>(LOCAL_STORAGE_KEYS.AI_SETTINGS);
  if (saved) {
    return {
      provider: saved.provider ?? AI_DEFAULTS.provider,
      apiKey: saved.apiKey ?? '',
      customEndpoint: saved.customEndpoint ?? '',
      customModel: saved.customModel ?? '',
    };
  }

  // Preserve legacy environment-variable path (older Vite config)
  const legacyKey =
    (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
    (typeof process !== 'undefined' && process.env?.API_KEY) ||
    '';
  if (legacyKey) {
    return { ...AI_DEFAULTS, provider: 'gemini', apiKey: legacyKey };
  }

  return AI_DEFAULTS;
}

/**
 * Persist AI provider settings.
 *
 * TODO(security/api-key): Route `settings.apiKey` through Electron safeStorage IPC
 * in Phase 3. Store only non-sensitive fields (provider, customEndpoint, customModel)
 * in localStorage.
 */
export function saveAISettings(settings: AISettings): void {
  storage.set(LOCAL_STORAGE_KEYS.AI_SETTINGS, settings);
}
