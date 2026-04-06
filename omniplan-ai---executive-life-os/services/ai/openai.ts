/**
 * OpenAI (GPT) AI provider.
 * Uses the REST API directly via fetch — no SDK needed.
 */

import { AIProvider, ScheduleItem } from './types';
import { electronFetch } from '../../utils/electronFetch';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

async function chatCompletion(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await electronFetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

export function createOpenAIProvider(apiKey: string): AIProvider {
  return {
    async predictDailyFocus(history: string[], currentTodos: string[]): Promise<string> {
      const system = 'You are an executive performance coach. Return ONLY a short (max 60 chars) daily focus theme. No explanation or quotes.';
      const user = `Past Themes: ${history.join(", ")}\nCurrent Tasks: ${currentTodos.join(", ")}\n\nPredict the single most high-impact focus for today.`;

      return await chatCompletion(apiKey, system, user) || "Deep Work Session";
    },

    async generateSchedule(todoText: string): Promise<ScheduleItem[]> {
      const system = 'You are a scheduling assistant. Return ONLY a raw JSON array. No markdown, no backticks.';
      const user = `Create a realistic schedule for today starting at 9 AM for these tasks: "${todoText}"\n\nEach item: {"title": string, "start": number (decimal hour), "duration": number (hours)}`;

      const text = await chatCompletion(apiKey, system, user);
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const cleanText = jsonMatch ? jsonMatch[0] : text;
      return JSON.parse(cleanText);
    },

    async complete(systemPrompt: string, userContent: string): Promise<string> {
      return await chatCompletion(apiKey, systemPrompt, userContent);
    },
  };
}
