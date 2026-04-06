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
import { getAIReadiness } from './readiness';
import { EmailError, EMAIL_ERROR_CODES, makeEmailOperationId } from '../email/errors';

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

/**
 * Extract a calendar event from an email body using AI.
 *
 * Returns event data when an event is found, or null when the AI confidently
 * determines no event/meeting/appointment is present.
 *
 * Throws EmailError (never returns null) for all failure cases:
 *   - AI not configured              → EMAIL_AI_UNAVAILABLE / EMAIL_AI_MISSING_KEY
 *   - AI call throws                 → EMAIL_EVENT_EXTRACTION_FAILED
 *   - AI response has no JSON        → EMAIL_EVENT_EXTRACTION_INVALID_JSON
 *   - JSON parse fails               → EMAIL_EVENT_EXTRACTION_INVALID_JSON
 *   - Parsed object missing fields   → EMAIL_EVENT_PREVIEW_INVALID
 *
 * This replaces the previous catch→return-null pattern so callers can
 * distinguish "no event found" from "AI pipeline failed".
 */
export async function extractEventFromEmail(
  emailBody: string,
): Promise<{ title: string; date: string; startHour: number; duration: number } | null> {
  const opId = makeEmailOperationId('email-extract');
  const provider = getProvider();

  if (!provider) {
    const { state } = getAIReadiness();
    const code =
      state === 'missing_key'
        ? EMAIL_ERROR_CODES.EMAIL_AI_MISSING_KEY
        : EMAIL_ERROR_CODES.EMAIL_AI_UNAVAILABLE;
    throw new EmailError(code, 'AI provider not configured', opId);
  }

  const systemPrompt =
    'Extract a calendar event from the following email. Return ONLY valid JSON with these fields: ' +
    '{"title": string, "date": "YYYY-MM-DD", "startHour": number (decimal, e.g. 14.5 for 2:30 PM), ' +
    '"duration": number (in hours)}. If no event/meeting/appointment can be found, return the string "null". ' +
    'Do not include any other text.';

  let rawResult: string;
  try {
    rawResult = await provider.complete(systemPrompt, emailBody);
  } catch (e) {
    console.error(`[email-extract ${opId}] AI call failed:`, e);
    throw new EmailError(
      EMAIL_ERROR_CODES.EMAIL_EVENT_EXTRACTION_FAILED,
      e instanceof Error ? e.message : String(e),
      opId,
    );
  }

  const trimmed = rawResult.trim();
  // AI explicitly says no event was found
  if (trimmed === 'null' || trimmed === '') return null;

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new EmailError(
      EMAIL_ERROR_CODES.EMAIL_EVENT_EXTRACTION_INVALID_JSON,
      'AI response contained no JSON object',
      opId,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new EmailError(
      EMAIL_ERROR_CODES.EMAIL_EVENT_EXTRACTION_INVALID_JSON,
      `JSON.parse failed: ${e instanceof Error ? e.message : String(e)}`,
      opId,
    );
  }

  if (parsed?.title && parsed?.date && typeof parsed.startHour === 'number') {
    return {
      title: parsed.title as string,
      date: parsed.date as string,
      startHour: parsed.startHour as number,
      duration: (parsed.duration as number) || 1,
    };
  }

  throw new EmailError(
    EMAIL_ERROR_CODES.EMAIL_EVENT_PREVIEW_INVALID,
    'Parsed JSON missing required fields (title, date, startHour)',
    opId,
  );
}
