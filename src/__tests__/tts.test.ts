import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import type { ExploreResult } from '../stages/index.ts';

vi.mock('execa', () => ({ execa: vi.fn() }));

const speechCreate = vi.fn();
vi.mock('../lib/openai-client.ts', () => ({
  getOpenAIClient: () => ({
    audio: { speech: { create: speechCreate } },
  }),
}));

import { execa } from 'execa';
import { tts } from '../stages/index.ts';

const mockedExeca = vi.mocked(execa);

function makeAudioResponse(): { arrayBuffer: () => Promise<ArrayBuffer> } {
  // The ffprobe mock fakes the duration, so the actual bytes don't matter.
  const bytes = new Uint8Array([0xff, 0xfb, 0x10, 0x00]);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { arrayBuffer: () => Promise.resolve(ab) };
}

async function makeOutDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'tts-test-'));
}

const plan: ExploreResult = {
  title: 't',
  steps: [
    { id: 1, action: 'navigate', selector: null, input: 'https://x.com', narration: 'one' },
    { id: 2, action: 'click', selector: '#a', input: null, narration: 'two' },
    { id: 3, action: 'scroll', selector: null, input: null, narration: 'three' },
  ],
};

describe('tts', () => {
  beforeEach(() => {
    speechCreate.mockReset();
    mockedExeca.mockReset();
    // Default: any ffprobe call returns "1.234" seconds.
    mockedExeca.mockResolvedValue({ stdout: '1.234' } as never);
  });

  it('writes one MP3 per step and returns clips in stepId order', async () => {
    speechCreate.mockResolvedValue(makeAudioResponse());
    const outDir = await makeOutDir();

    const clips = await tts(plan, 'alloy', outDir);

    expect(clips).toHaveLength(3);
    expect(clips.map((c) => c.stepId)).toEqual([1, 2, 3]);

    for (const c of clips) {
      expect(c.audioPath).toBe(path.join(outDir, 'audio', `seg_${c.stepId}.mp3`));
      const stat = await fs.stat(c.audioPath);
      expect(stat.size).toBeGreaterThan(0);
    }
  });

  it('uses ceil(duration_sec * 1000) for clip duration', async () => {
    speechCreate.mockResolvedValue(makeAudioResponse());
    mockedExeca.mockResolvedValue({ stdout: '2.0001' } as never);

    const outDir = await makeOutDir();
    const clips = await tts(plan, 'alloy', outDir);

    // 2.0001s -> 2000.1ms -> ceil = 2001
    for (const c of clips) {
      expect(c.durationMs).toBe(2001);
    }
  });

  it('forwards voice and narration to the OpenAI client', async () => {
    speechCreate.mockResolvedValue(makeAudioResponse());
    const outDir = await makeOutDir();

    await tts(plan, 'nova', outDir);

    expect(speechCreate).toHaveBeenCalledTimes(3);
    const inputs = speechCreate.mock.calls.map((c) => c[0].input).sort();
    expect(inputs).toEqual(['one', 'three', 'two']);
    for (const call of speechCreate.mock.calls) {
      expect(call[0].voice).toBe('nova');
      expect(call[0].response_format).toBe('mp3');
    }
  });

  it('preserves stepId order even when workers finish out of order', async () => {
    // Resolve step 3 first, step 1 last to scramble completion order.
    const delays: Record<string, number> = { one: 40, two: 20, three: 0 };
    speechCreate.mockImplementation(async (args: { input: string }) => {
      await new Promise((r) => setTimeout(r, delays[args.input] ?? 0));
      return makeAudioResponse();
    });

    const outDir = await makeOutDir();
    const clips = await tts(plan, 'alloy', outDir);

    expect(clips.map((c) => c.stepId)).toEqual([1, 2, 3]);
  });

  it('retries with backoff and eventually succeeds', async () => {
    // Stub setTimeout so the backoff sleeps resolve immediately.
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      cb: () => void
    ) => {
      cb();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      let attempts = 0;
      speechCreate.mockImplementation(async () => {
        attempts++;
        if (attempts <= 2) throw new Error('transient');
        return makeAudioResponse();
      });

      const onePlan: ExploreResult = { title: 't', steps: [plan.steps[0]!] };
      const outDir = await makeOutDir();

      const clips = await tts(onePlan, 'alloy', outDir);
      expect(clips).toHaveLength(1);
      expect(attempts).toBe(3);
    } finally {
      setTimeoutSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('throws after exhausting retries', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      cb: () => void
    ) => {
      cb();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      speechCreate.mockRejectedValue(new Error('permanent'));
      const onePlan: ExploreResult = { title: 't', steps: [plan.steps[0]!] };
      const outDir = await makeOutDir();

      await expect(tts(onePlan, 'alloy', outDir)).rejects.toThrow(/permanent/);
      // 1 initial + 3 retries = 4 calls.
      expect(speechCreate).toHaveBeenCalledTimes(4);
    } finally {
      setTimeoutSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('creates the audio output directory if missing', async () => {
    speechCreate.mockResolvedValue(makeAudioResponse());
    const outDir = await makeOutDir();
    const audioDir = path.join(outDir, 'audio');

    await tts(plan, 'alloy', outDir);

    const stat = await fs.stat(audioDir);
    expect(stat.isDirectory()).toBe(true);
  });
});
