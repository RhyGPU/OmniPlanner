/**
 * App settings — persisted in localStorage.
 * Central place for all user preferences.
 */

import { AIProviderID } from './ai/types';

export interface AISettings {
  provider: AIProviderID;
  apiKey: string;
  customEndpoint?: string;
  customModel?: string;
}

const SETTINGS_KEY = 'omni_ai_settings';

export function getAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        provider: parsed.provider || 'none',
        apiKey: parsed.apiKey || '',
        customEndpoint: parsed.customEndpoint || '',
        customModel: parsed.customModel || '',
      };
    }
  } catch {
    // Corrupted settings, return defaults
  }

  // Check for legacy env-based key (from older Vite config)
  const legacyKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY)
    || (typeof process !== 'undefined' && process.env?.API_KEY)
    || '';

  if (legacyKey) {
    return { provider: 'gemini', apiKey: legacyKey };
  }

  return { provider: 'none', apiKey: '' };
}

export function saveAISettings(settings: AISettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
