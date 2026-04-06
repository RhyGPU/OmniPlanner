/**
 * AI Provider abstraction layer.
 * Add new providers by implementing the AIProvider interface.
 */

export type AIProviderID = 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'custom' | 'none';

export interface AIProviderInfo {
  id: AIProviderID;
  name: string;
  description: string;
  apiKeyPlaceholder: string;
  docsUrl: string;
}

export interface AIProvider {
  /** Generate a daily focus prediction from history and current todos */
  predictDailyFocus(history: string[], currentTodos: string[]): Promise<string>;

  /** Generate a full schedule from a todo list */
  generateSchedule(todoText: string): Promise<ScheduleItem[]>;

  /**
   * Generic single-turn completion.
   * Sends a system prompt and a user message; returns the model's reply.
   * Prefer this over predictDailyFocus for any non-focus-prediction use case.
   */
  complete(systemPrompt: string, userContent: string): Promise<string>;
}

export interface ScheduleItem {
  title: string;
  start: number;   // decimal hour (e.g. 9.5 = 9:30 AM)
  duration: number; // decimal hours
}

/** Registry of all available providers */
export const AI_PROVIDERS: Record<AIProviderID, AIProviderInfo> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Free tier available. Good for general planning.',
    apiKeyPlaceholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI (GPT)',
    description: 'ChatGPT models. Requires paid API key.',
    apiKeyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    description: 'Claude models. Requires API key.',
    apiKeyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 100+ open-source & commercial models.',
    apiKeyPlaceholder: 'sk-or-...',
    docsUrl: 'https://openrouter.ai/keys',
  },
  custom: {
    id: 'custom',
    name: 'Local / Custom',
    description: 'LM Studio, Ollama, or any OpenAI-compatible API.',
    apiKeyPlaceholder: 'optional (leave blank for local)',
    docsUrl: '',
  },
  none: {
    id: 'none',
    name: 'None (Disabled)',
    description: 'AI features will be disabled.',
    apiKeyPlaceholder: '',
    docsUrl: '',
  },
};
