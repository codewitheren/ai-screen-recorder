import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractJson } from '../lib/llm.js';

vi.mock('../lib/openai-client.js', () => {
  const mockCreate = vi.fn();
  return {
    getOpenAIClient: () => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    }),
    __mockCreate: mockCreate,
  };
});

describe('extractJson', () => {
  it('extracts JSON from markdown fenced block', () => {
    const raw = 'Here is the result:\n```json\n{"key": "value"}\n```\nDone.';
    expect(extractJson(raw)).toBe('{"key": "value"}');
  });

  it('extracts JSON from fenced block without language tag', () => {
    const raw = '```\n[1, 2, 3]\n```';
    expect(extractJson(raw)).toBe('[1, 2, 3]');
  });

  it('extracts raw JSON object without fences', () => {
    const raw = 'Some text before {"action": "click"} and after';
    expect(extractJson(raw)).toBe('{"action": "click"} and after');
  });

  it('extracts raw JSON array without fences', () => {
    const raw = 'Result: [1, 2, 3]';
    expect(extractJson(raw)).toBe('[1, 2, 3]');
  });

  it('throws when no JSON is found', () => {
    expect(() => extractJson('no json here')).toThrow('No JSON found');
  });

  it('throws on empty string', () => {
    expect(() => extractJson('')).toThrow('No JSON found');
  });

  it('handles multiline JSON in fences', () => {
    const raw =
      '```json\n{\n  "thought": "test",\n  "action": {\n    "kind": "finish"\n  }\n}\n```';
    const result = extractJson(raw);
    const parsed = JSON.parse(result);
    expect(parsed.thought).toBe('test');
    expect(parsed.action.kind).toBe('finish');
  });
});

describe('chat', () => {
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod: { __mockCreate: ReturnType<typeof vi.fn> } =
      (await import('../lib/openai-client.js')) as never;
    mockCreate = mod.__mockCreate;
    mockCreate.mockReset();
  });

  it('throws when LLM returns no content', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    const { chat } = await import('../lib/llm.js');
    await expect(
      chat({ system: 'test', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow('LLM returned no text content');
  });

  it('returns text content from LLM response', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"result": true}' } }],
    });

    const { chat } = await import('../lib/llm.js');
    const result = await chat({
      system: 'You are a helper',
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(result).toBe('{"result": true}');
  });
});
