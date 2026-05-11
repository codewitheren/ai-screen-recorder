import { describe, it, expect } from 'vitest';
import { buildAudioFilter } from '../stages/compose.js';
import type { AudioSegment } from '../types.js';

describe('buildAudioFilter', () => {
  it('returns empty string for no segments', () => {
    expect(buildAudioFilter([])).toBe('');
  });

  it('builds filter for single segment', () => {
    const segments: AudioSegment[] = [
      { stepId: 1, durationMs: 2000, audioPath: '/tmp/a.mp3', startMs: 0 },
    ];
    const filter = buildAudioFilter(segments);
    expect(filter).toContain('[1:a]adelay=0|0[a0]');
    expect(filter).toContain('amix=inputs=1');
    expect(filter).toContain('loudnorm[aout]');
  });

  it('builds filter for multiple segments with correct delays', () => {
    const segments: AudioSegment[] = [
      { stepId: 1, durationMs: 2000, audioPath: '/tmp/a.mp3', startMs: 0 },
      { stepId: 2, durationMs: 3000, audioPath: '/tmp/b.mp3', startMs: 2500 },
      { stepId: 3, durationMs: 1500, audioPath: '/tmp/c.mp3', startMs: 5000 },
    ];
    const filter = buildAudioFilter(segments);
    expect(filter).toContain('[1:a]adelay=0|0[a0]');
    expect(filter).toContain('[2:a]adelay=2500|2500[a1]');
    expect(filter).toContain('[3:a]adelay=5000|5000[a2]');
    expect(filter).toContain('amix=inputs=3');
    expect(filter).toContain('[a0][a1][a2]');
  });

  it('clamps negative startMs to 0', () => {
    const segments: AudioSegment[] = [
      { stepId: 1, durationMs: 1000, audioPath: '/tmp/a.mp3', startMs: -500 },
    ];
    const filter = buildAudioFilter(segments);
    expect(filter).toContain('adelay=0|0');
  });
});
