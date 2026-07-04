import { storage, LOCAL_STORAGE_KEYS } from '../storage';

export interface AiUsageStats {
  callsCount: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
}

const STORAGE_KEY = LOCAL_STORAGE_KEYS.AI_USAGE_STATS;

const TOKEN_PRICES: Record<string, { prompt: number; completion: number }> = {
  gemini: { prompt: 0.075 / 1000000, completion: 0.30 / 1000000 },
  openai: { prompt: 0.15 / 1000000, completion: 0.60 / 1000000 },
  anthropic: { prompt: 3.0 / 1000000, completion: 15.0 / 1000000 },
  openrouter: { prompt: 0, completion: 0 },
  custom: { prompt: 0, completion: 0 },
};

export function getAiUsageStats(): AiUsageStats {
  return storage.get<AiUsageStats>(STORAGE_KEY) ?? {
    callsCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    estimatedCostUsd: 0,
  };
}

export function logAiCall(providerId: string, promptTokens: number, completionTokens: number): void {
  const current = getAiUsageStats();
  const prices = TOKEN_PRICES[providerId] || { prompt: 0, completion: 0 };
  const cost = (promptTokens * prices.prompt) + (completionTokens * prices.completion);
  
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
