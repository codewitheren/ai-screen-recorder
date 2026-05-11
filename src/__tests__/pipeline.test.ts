import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExploreResult, RunContext } from '../types.js';

// Mock all stages to avoid real browser/ffmpeg/API calls
vi.mock('../stages/explore.js', () => ({
  explore: vi.fn(),
}));
vi.mock('../stages/record.js', () => ({
  record: vi.fn(),
}));
vi.mock('../stages/tts.js', () => ({
  tts: vi.fn(),
}));
vi.mock('../stages/compose.js', () => ({
  compose: vi.fn(),
}));
vi.mock('../testing/mock-explore.js', () => ({
  mockExplore: vi.fn(),
}));
vi.mock('../testing/mock-tts.js', () => ({
  mockTts: vi.fn(),
}));
// Mock @clack/prompts to avoid terminal output during tests
vi.mock('@clack/prompts', () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

describe('runPipeline', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses mock stages in test mode', async () => {
    const { mockExplore } = await import('../testing/mock-explore.js');
    const { mockTts } = await import('../testing/mock-tts.js');
    const { record } = await import('../stages/record.js');
    const { compose } = await import('../stages/compose.js');

    const mockPlan = {
      title: 'Test',
      steps: [
        { id: 1, action: 'navigate', selector: null, input: 'https://x.com', narration: 'nav' },
      ],
    };
    const mockClips = [{ stepId: 1, durationMs: 2000, audioPath: '/tmp/a.mp3' }];
    const mockTimeline = [{ stepId: 1, startMs: 0, endMs: 2000 }];

    vi.mocked(mockExplore).mockResolvedValue(mockPlan as unknown as ExploreResult);
    vi.mocked(mockTts).mockResolvedValue(mockClips);
    vi.mocked(record).mockResolvedValue({ videoPath: '/tmp/v.webm', timeline: mockTimeline });
    vi.mocked(compose).mockResolvedValue('/tmp/final.mp4');

    const { runPipeline } = await import('../pipeline.js');

    const ctx: RunContext = {
      prompt: 'test',
      url: 'https://x.com',
      voice: 'alloy',
      language: 'English',
      outDir: '/tmp/test-out',
      testMode: true,
    };

    const result = await runPipeline(ctx);
    expect(result).toBe('/tmp/final.mp4');
    expect(mockExplore).toHaveBeenCalledWith('test', 'https://x.com', '/tmp/test-out');
    expect(mockTts).toHaveBeenCalled();
    expect(record).toHaveBeenCalled();
    expect(compose).toHaveBeenCalled();
  });

  it('uses real stages when not in test mode', async () => {
    const { explore } = await import('../stages/explore.js');
    const { tts } = await import('../stages/tts.js');
    const { record } = await import('../stages/record.js');
    const { compose } = await import('../stages/compose.js');

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

    const { runPipeline } = await import('../pipeline.js');

    const ctx: RunContext = {
      prompt: 'real task',
      url: 'https://x.com',
      voice: 'nova',
      language: 'English',
      outDir: '/tmp/real-out',
      testMode: false,
    };

    const result = await runPipeline(ctx);
    expect(result).toBe('/tmp/final.mp4');
    expect(explore).toHaveBeenCalledWith('real task', 'https://x.com', '/tmp/real-out', 'English');
    expect(tts).toHaveBeenCalled();
  });

  it('throws when timeline entry is missing for a step', async () => {
    const { mockExplore } = await import('../testing/mock-explore.js');
    const { mockTts } = await import('../testing/mock-tts.js');
    const { record } = await import('../stages/record.js');

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
    // Timeline only has step 1, missing step 2
    const mockTimeline = [{ stepId: 1, startMs: 0, endMs: 2000 }];

    vi.mocked(mockExplore).mockResolvedValue(mockPlan as unknown as ExploreResult);
    vi.mocked(mockTts).mockResolvedValue(mockClips);
    vi.mocked(record).mockResolvedValue({ videoPath: '/tmp/v.webm', timeline: mockTimeline });

    const { runPipeline } = await import('../pipeline.js');

    const ctx: RunContext = {
      prompt: 'test',
      url: 'https://x.com',
      voice: 'alloy',
      language: 'English',
      outDir: '/tmp/test-out',
      testMode: true,
    };

    await expect(runPipeline(ctx)).rejects.toThrow('No timeline entry for step 2');
  });
});
