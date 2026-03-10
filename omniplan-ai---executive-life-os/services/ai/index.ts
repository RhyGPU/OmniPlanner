/**
 * AI Service — main entry point.
 *
 * Reads the user's chosen provider + API key from localStorage,
 * creates the right provider, and exposes the two main AI functions.
 *
 * To add a new AI provider:
 *   1. Create a new file in services/ai/ (e.g. "mistral.ts")
 *   2. Implement the AIProvider interface
 *   3. Add the provider ID to AIProviderID in types.ts
 *   4. Add a case in getProvider() below
 *   5. Add its info to AI_PROVIDERS in types.ts
 */

import { AIProvider, AIProviderID } from './types';
import { createGeminiProvider } from './gemini';
import { createOpenAIProvider } from './openai';
import { createAnthropicProvider } from './anthropic';
import { createOpenAICompatibleProvider } from './openai-compatible';
import { getAISettings } from '../settings';

function getProvider(): AIProvider | null {
  const { provider, apiKey, customEndpoint, customModel } = getAISettings();

  if (provider === 'none') {
    return null;
  }

  // Custom and OpenRouter don't strictly require an API key (local models)
  if (!apiKey && provider !== 'custom') {
    return null;
  }

  switch (provider) {
    case 'gemini':
      return createGeminiProvider(apiKey);
    case 'openai':
      return createOpenAIProvider(apiKey);
    case 'anthropic':
      return createAnthropicProvider(apiKey);
    case 'openrouter':
      return createOpenAICompatibleProvider({
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey,
        model: customModel || 'meta-llama/llama-3.1-8b-instruct:free',
        extraHeaders: {
          'HTTP-Referer': 'https://omniplan.app',
          'X-Title': 'OmniPlan AI',
        },
      });
    case 'custom':
      return createOpenAICompatibleProvider({
        baseUrl: customEndpoint || 'http://localhost:1234/v1',
        apiKey: apiKey || '',
        model: customModel || 'default',
      });
    default:
      return null;
  }
}

/**
 * Predict a daily focus theme using AI.
 * Returns a helpful message if AI is not configured.
 */
export async function predictMainEvent(history: string[], currentTodos: string[]): Promise<string> {
  const provider = getProvider();
  if (!provider) {
    return "Configure AI in Settings to enable this";
  }

  try {
    return await provider.predictDailyFocus(history, currentTodos);
  } catch (error) {
    console.error("AI prediction error:", error);
    return "AI error — check your API key in Settings";
  }
}

/**
 * Generate a schedule from todos using AI.
 * Returns empty array if AI is not configured.
 */
export async function generateSchedule(todoText: string): Promise<any[]> {
  const provider = getProvider();
  if (!provider) {
    return [];
  }

  try {
    return await provider.generateSchedule(todoText);
  } catch (error) {
    console.error("AI schedule error:", error);
    return [];
  }
}
