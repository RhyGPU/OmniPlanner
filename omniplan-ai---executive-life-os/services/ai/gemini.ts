/**
 * Google Gemini AI provider.
 * Uses the REST API directly so requests route through electronFetch,
 * which forwards them via Electron's net module (bypasses CORS + firewall).
 */

import { AIProvider, ScheduleItem } from './types';
import { electronFetch } from '../../utils/electronFetch';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function generateContent(
  apiKey: string,
  model: string,
  prompt: string,
  temperature = 0.8,
): Promise<string> {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
  const response = await electronFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

export function createGeminiProvider(apiKey: string): AIProvider {
  return {
    async predictDailyFocus(history: string[], currentTodos: string[]): Promise<string> {
      const prompt = `You are an executive performance coach. Based on the user's past focus areas and current tasks, predict the single most high-impact "Main Event" or theme for today.

Past Themes: ${history.join(', ')}
Current Tasks: ${currentTodos.join(', ')}

Return ONLY the suggested Main Event title (max 60 characters). No explanation or quotes.
Example: "Deep Work: Architecture Scalability Review" or "Strategic Networking: Investor Luncheon"`;

      return await generateContent(apiKey, 'gemini-2.0-flash', prompt, 0.8) || 'Deep Work Session';
    },

    async generateSchedule(todoText: string): Promise<ScheduleItem[]> {
      const prompt = `I have the following to-do list for today: "${todoText}".
Please create a realistic schedule starting around 9 AM.
Return ONLY a raw JSON array of objects. Do not include markdown formatting or backticks.
Each object should have:
- title: string
- start: number (decimal hour, e.g., 9 or 13.5)
- duration: number (decimal hour, e.g., 1 or 0.5)

Example output format:
[{"title": "Morning Coffee & Plan", "start": 9, "duration": 0.5}, {"title": "Work Block", "start": 9.5, "duration": 2}]`;

      const text = await generateContent(apiKey, 'gemini-2.0-flash', prompt, 0.7);
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const cleanText = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanText);
    },
  };
}
