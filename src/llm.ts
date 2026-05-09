import OpenAI from 'openai';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL = process.env.LLM_MODEL ?? 'anthropic/claude-sonnet-4-5';

// Singleton client — initialized on first use.
let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
    client = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL });
  }
  return client;
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string };

/**
 * Sends a multi-turn conversation to the LLM and returns the response text.
 * The system prompt is prepended automatically; callers manage the history.
 */
export async function chat(opts: {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
}): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    messages: [
      { role: 'system', content: opts.system },
      ...opts.messages,
    ],
  });
  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error('LLM returned no text content');
  return text;
}

/**
 * Extracts the first JSON object or array from a raw LLM response.
 * Strips markdown code fences if present.
 */
export function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const start = raw.search(/[{[]/);
  if (start === -1) throw new Error('No JSON found in LLM response');
  return raw.slice(start).trim();
}
