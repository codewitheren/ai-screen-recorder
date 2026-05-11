import { getOpenAIClient } from './openai-client.js';

const MODEL = process.env.LLM_MODEL ?? 'anthropic/claude-sonnet-4-5';

export interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface ChatOptions {
  readonly system: string;
  readonly messages: readonly ChatMessage[];
  readonly maxTokens?: number;
}

/**
 * Sends a multi-turn conversation to the LLM and returns the response text.
 * The system prompt is prepended automatically; callers manage the history.
 */
export async function chat(opts: ChatOptions): Promise<string> {
  const res = await getOpenAIClient().chat.completions.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    messages: [
      { role: 'system' as const, content: opts.system },
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
