/**
 * AI Readiness — Phase 16.
 *
 * Centralised derived state for whether AI features can run.
 * Keeps provider/key checks out of components.
 *
 * Rules:
 *   'disabled'     — user explicitly chose provider = 'none'
 *   'missing_key'  — provider chosen but no API key entered (except 'custom')
 *   'ready'        — provider + key present, or 'custom' (no key required)
 *
 * No 'unavailable' state: AI is HTTP-based and works on all platforms.
 * If the network is down the provider will throw; that is a runtime error,
 * not a readiness state.
 */

import { getAISettings } from '../settings';
import type { AIProviderID } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIReadinessState = 'ready' | 'missing_key' | 'disabled';

export interface AIReadiness {
  /** Derived state. */
  state: AIReadinessState;
  /** True only when state === 'ready'. Safe to gate action on this. */
  canRun: boolean;
  /** Which provider ID is currently configured. */
  provider: AIProviderID;
  /**
   * Short status label (≤ 5 words) for display beside AI controls.
   * e.g. "Gemini ready", "API key missing", "AI disabled"
   */
  label: string;
  /**
   * One-sentence actionable hint.
   * Empty string when state === 'ready'.
   */
  hint: string;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Returns the current AI readiness derived from stored settings.
 * Reads synchronously from the in-memory settings cache — safe to call
 * on every render without performance concern.
 */
export function getAIReadiness(): AIReadiness {
  const { provider, apiKey } = getAISettings();

  if (provider === 'none') {
    return {
      state: 'disabled',
      canRun: false,
      provider,
      label: 'AI disabled',
      hint: 'Select a provider in Settings & Data → AI Provider to enable this.',
    };
  }

  // 'custom' doesn't require a key (local model may not need auth)
  if (!apiKey && provider !== 'custom') {
    return {
      state: 'missing_key',
      canRun: false,
      provider,
      label: 'API key missing',
      hint: 'Add your API key in Settings & Data → AI Provider.',
    };
  }

  return {
    state: 'ready',
    canRun: true,
    provider,
    label: `${provider} active`,
    hint: '',
  };
}
