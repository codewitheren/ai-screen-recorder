// llm.ts
//
// Thin wrapper around the OpenAI chat completions API.
//
// Centralizes the system-prompt convention (prepended on every call) and
// the JSON extraction logic so the explore agent doesn't have to deal
// with markdown-fenced responses scattered across stages.

import { getOpenAIClient } from './openai-client.ts';

const MODEL = process.env.LLM_MODEL ?? 'openai/gpt-4o-mini';

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
 * Sends a multi-turn conversation to the LLM and returns the assistant text.
 *
 * The caller owns the conversation history; this function just prepends
 * `opts.system` and forwards the request. Throws if the model returns
 * an empty response (which usually means a provider-side error).
 */
export async function chat(opts: ChatOptions): Promise<string> {
  const res = await getOpenAIClient().chat.completions.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    messages: [{ role: 'system' as const, content: opts.system }, ...opts.messages],
  });
  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error('LLM returned no text content');
  return text;
}

/**
 * Returns the first JSON object or array embedded in an LLM response.
 *
 * Tolerates the two common shapes models produce: markdown-fenced code
 * blocks (```json ... ```) and free-form prose with JSON spliced in.
 * Throws if no JSON-looking content is found.
 */
export function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const start = raw.search(/[{[]/);
  if (start === -1) throw new Error('No JSON found in LLM response');
  return raw.slice(start).trim();
}
