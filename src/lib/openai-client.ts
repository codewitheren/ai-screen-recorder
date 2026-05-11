// openai-client.ts
//
// Singleton OpenAI client pointed at OpenRouter. Shared by both
// the LLM chat helper and the TTS stage to avoid duplicate config.

import OpenAI from 'openai';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
    client = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL });
  }
  return client;
}
