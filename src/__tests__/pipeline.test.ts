import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExploreResult } from '../stages/explore/types.ts';
import type { RunContext } from '../pipeline.ts';

// Stage modules are mocked so the pipeline runs without spawning a real
// browser, ffmpeg, or hitting OpenRouter.
vi.mock('../stages/index.ts', () => ({
  explore: vi.fn(),
  record: vi.fn(),
  tts: vi.fn(),
  compose: vi.fn(),
}));
// `@clack/prompts` would otherwise write to stdout under vitest.
vi.mock('@clack/prompts', () => ({
  log: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
    message: vi.fn(),
    success: vi.fn(),
  },
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() }),
}));

describe('runPipeline', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('runs all four stages and returns the final mp4 path', async () => {
    const { explore, tts, record, compose } = await import('../stages/index.ts');

    const mockPlan = {
      title: 'Real',
      steps: [
        { id: 1, action: 'navigate', selector: null, input: 'https://x.com', narration: 'go' },
      ],
    };
    const mockClips = [{ stepId: 1, durationMs: 3000, audioPath: '/tmp/a.mp3' }];
    const mockTimeline = [{ stepId: 1, startMs: 0, endMs: 3000 }];

    vi.mocked(explore).mockResolvedValue(mockPlan as unknown as ExploreResult);
    vi.mocked(tts).mockResolvedValue(mockClips);
    vi.mocked(record).mockResolvedValue({ videoPath: '/tmp/v.webm', timeline: mockTimeline });
    vi.mocked(compose).mockResolvedValue('/tmp/final.mp4');

    const { runPipeline } = await import('../pipeline.ts');

    const ctx: RunContext = {
      prompt: 'real task',
      url: 'https://x.com',
      voice: 'nova',
      language: 'English',
      outDir: '/tmp/real-out',
    };

    const result = await runPipeline(ctx);
    expect(result).toBe('/tmp/final.mp4');
    expect(explore).toHaveBeenCalledWith(
      'real task',
      'https://x.com',
      '/tmp/real-out',
      'English',
      expect.objectContaining({ onProgress: expect.any(Function) })
    );
    expect(tts).toHaveBeenCalled();
    expect(record).toHaveBeenCalled();
    expect(compose).toHaveBeenCalled();
  });

  it('throws when timeline entry is missing for a step', async () => {
    const { explore, tts, record } = await import('../stages/index.ts');

    const mockPlan = {
      title: 'Test',
      steps: [
        { id: 1, action: 'navigate', selector: null, input: 'https://x.com', narration: 'nav' },
        { id: 2, action: 'click', selector: '#btn', input: null, narration: 'click' },
      ],
    };
    const mockClips = [
      { stepId: 1, durationMs: 2000, audioPath: '/tmp/a.mp3' },
      { stepId: 2, durationMs: 1500, audioPath: '/tmp/b.mp3' },
    ];
    // Timeline intentionally omits step 2 to trigger the missing-entry path.
    const mockTimeline = [{ stepId: 1, startMs: 0, endMs: 2000 }];

    vi.mocked(explore).mockResolvedValue(mockPlan as unknown as ExploreResult);
    vi.mocked(tts).mockResolvedValue(mockClips);
    vi.mocked(record).mockResolvedValue({ videoPath: '/tmp/v.webm', timeline: mockTimeline });

    const { runPipeline } = await import('../pipeline.ts');

    const ctx: RunContext = {
      prompt: 'test',
      url: 'https://x.com',
      voice: 'alloy',
      language: 'English',
      outDir: '/tmp/test-out',
    };

    await expect(runPipeline(ctx)).rejects.toThrow('No timeline entry for step 2');
  });
});
