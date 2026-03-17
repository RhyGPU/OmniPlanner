/**
 * Anthropic (Claude) AI provider.
 * Uses the REST API directly via fetch — no SDK needed.
 */

import { AIProvider, ScheduleItem } from './types';
import { electronFetch } from '../../utils/electronFetch';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

async function createMessage(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await electronFetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((b: any) => b.type === 'text');
  return textBlock?.text?.trim() || '';
}

export function createAnthropicProvider(apiKey: string): AIProvider {
  return {
    async predictDailyFocus(history: string[], currentTodos: string[]): Promise<string> {
      const system = 'You are an executive performance coach. Return ONLY a short (max 60 chars) daily focus theme. No explanation or quotes.';
      const user = `Past Themes: ${history.join(", ")}\nCurrent Tasks: ${currentTodos.join(", ")}\n\nPredict the single most high-impact focus for today.`;

      return await createMessage(apiKey, system, user) || "Deep Work Session";
    },

    async generateSchedule(todoText: string): Promise<ScheduleItem[]> {
      const system = 'You are a scheduling assistant. Return ONLY a raw JSON array. No markdown, no backticks, no explanation.';
      const user = `Create a realistic schedule for today starting at 9 AM for these tasks: "${todoText}"\n\nEach item: {"title": string, "start": number (decimal hour), "duration": number (hours)}`;

      const text = await createMessage(apiKey, system, user);
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const cleanText = jsonMatch ? jsonMatch[0] : text;
      return JSON.parse(cleanText);
    },
  };
}
