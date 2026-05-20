// openai-client.ts
//
// Lazily-constructed singleton OpenAI client pointed at OpenRouter.
//
// Shared by both the chat helper (`llm.ts`) and the TTS stage so they
// reuse one HTTP connection pool and so the `OPENROUTER_API_KEY` check
// has exactly one home.

import OpenAI from 'openai';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

let client: OpenAI | null = null;

/**
 * Returns the process-wide OpenAI client, constructing it on first call.
 * Throws if `OPENROUTER_API_KEY` is not set in the environment.
 */
export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
    client = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL });
  }
  return client;
}
