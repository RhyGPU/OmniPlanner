import { storage, LOCAL_STORAGE_KEYS } from '../storage';

export interface AiUsageStats {
  callsCount: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
}

const STORAGE_KEY = LOCAL_STORAGE_KEYS.AI_USAGE_STATS;

/**
 * Rough pricing per 1M tokens (USD), keyed by model id — the model each
 * provider module actually requests, not the provider name. Vendors change
 * prices; treat the board as an estimate, not an invoice. Unknown models
 * (OpenRouter free tiers, local llamafiles, custom endpoints) contribute $0
 * so the estimate never overstates.
 */
const MODEL_PRICES_PER_MILLION: Record<string, { prompt: number; completion: number }> = {
  'gemini-2.0-flash': { prompt: 0.10, completion: 0.40 },
  'gpt-4o-mini': { prompt: 0.15, completion: 0.60 },
  'claude-sonnet-4-20250514': { prompt: 3.0, completion: 15.0 },
};

export function getAiUsageStats(): AiUsageStats {
  return storage.get<AiUsageStats>(STORAGE_KEY) ?? {
    callsCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    estimatedCostUsd: 0,
  };
}

export function logAiCall(providerId: string, model: string, promptTokens: number, completionTokens: number): void {
  const current = getAiUsageStats();
  const prices = MODEL_PRICES_PER_MILLION[model] ?? { prompt: 0, completion: 0 };
  const cost = (promptTokens * prices.prompt + completionTokens * prices.completion) / 1_000_000;
  
  const updated: AiUsageStats = {
    callsCount: current.callsCount + 1,
    promptTokens: current.promptTokens + promptTokens,
    completionTokens: current.completionTokens + completionTokens,
    estimatedCostUsd: current.estimatedCostUsd + cost,
  };
  storage.set(STORAGE_KEY, updated);
}

export function resetAiUsageStats(): void {
  storage.set(STORAGE_KEY, {
    callsCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    estimatedCostUsd: 0,
  });
}
