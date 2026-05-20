import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('getOpenAIClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when OPENROUTER_API_KEY is not set', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { getOpenAIClient } = await import('../lib/openai-client.ts');
    expect(() => getOpenAIClient()).toThrow('OPENROUTER_API_KEY is not set');
  });

  it('returns an OpenAI client when key is set', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key-123';
    const { getOpenAIClient } = await import('../lib/openai-client.ts');
    const client = getOpenAIClient();
    expect(client).toBeDefined();
    expect(client.chat).toBeDefined();
  });

  it('returns the same singleton instance', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key-123';
    const { getOpenAIClient } = await import('../lib/openai-client.ts');
    const a = getOpenAIClient();
    const b = getOpenAIClient();
    expect(a).toBe(b);
  });
});
