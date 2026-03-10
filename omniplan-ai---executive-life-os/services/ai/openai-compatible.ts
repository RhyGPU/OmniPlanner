/**
 * Generic OpenAI-compatible provider.
 * Works with: OpenRouter, LM Studio, Ollama, text-generation-webui,
 * LocalAI, vLLM, and any other OpenAI-compatible API.
 */

import { AIProvider, ScheduleItem } from './types';

interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
}

async function chatCompletion(config: OpenAICompatibleConfig, systemPrompt: string, userPrompt: string): Promise<string> {
  const url = config.baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.extraHeaders,
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error (${config.baseUrl}): ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): AIProvider {
  return {
    async predictDailyFocus(history: string[], currentTodos: string[]): Promise<string> {
      const system = 'You are an executive performance coach. Return ONLY a short (max 60 chars) daily focus theme. No explanation or quotes.';
      const user = `Past Themes: ${history.join(", ")}\nCurrent Tasks: ${currentTodos.join(", ")}\n\nPredict the single most high-impact focus for today.`;
      return await chatCompletion(config, system, user) || "Deep Work Session";
    },

    async generateSchedule(todoText: string): Promise<ScheduleItem[]> {
      const system = 'You are a scheduling assistant. Return ONLY a raw JSON array. No markdown, no backticks.';
      const user = `Create a realistic schedule for today starting at 9 AM for these tasks: "${todoText}"\n\nEach item: {"title": string, "start": number (decimal hour), "duration": number (hours)}`;
      const text = await chatCompletion(config, system, user);
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const cleanText = jsonMatch ? jsonMatch[0] : text;
      return JSON.parse(cleanText);
    },
  };
}
