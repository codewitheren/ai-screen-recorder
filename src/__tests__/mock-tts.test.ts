import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { mockTts } from '../testing/mock-tts.js';
import type { ExploreResult } from '../types.js';

describe('mockTts', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('produces one clip per step', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-tts-'));
    const plan: ExploreResult = {
      title: 'Test',
      steps: [
        {
          id: 1,
          action: 'navigate',
          selector: null,
          input: 'https://x.com',
          narration: 'Going to site',
        },
        { id: 2, action: 'click', selector: '#btn', input: null, narration: 'Clicking button' },
      ],
    };

    const clips = await mockTts(plan, tmpDir);
    expect(clips).toHaveLength(2);
  });

  it('each clip has 2000ms duration', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-tts-'));
    const plan: ExploreResult = {
      title: 'Test',
      steps: [
        { id: 1, action: 'navigate', selector: null, input: 'https://x.com', narration: 'Nav' },
      ],
    };

    const clips = await mockTts(plan, tmpDir);
    expect(clips[0]?.durationMs).toBe(2000);
  });

  it('creates mp3 files in audio subdirectory', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-tts-'));
    const plan: ExploreResult = {
      title: 'Test',
      steps: [{ id: 1, action: 'scroll', selector: null, input: null, narration: 'Scrolling' }],
    };

    const clips = await mockTts(plan, tmpDir);
    const audioPath = clips[0]?.audioPath ?? '';
    expect(audioPath).toContain('audio');
    const stat = await fs.stat(audioPath);
    expect(stat.size).toBeGreaterThan(0);
  });

  it('maps stepId correctly', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-tts-'));
    const plan: ExploreResult = {
      title: 'Test',
      steps: [
        { id: 5, action: 'wait', selector: null, input: '1000', narration: 'Waiting' },
        { id: 8, action: 'click', selector: '#x', input: null, narration: 'Click' },
      ],
    };

    const clips = await mockTts(plan, tmpDir);
    expect(clips[0]?.stepId).toBe(5);
    expect(clips[1]?.stepId).toBe(8);
  });
});
