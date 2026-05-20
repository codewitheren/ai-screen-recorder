import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('execa', () => ({ execa: vi.fn() }));

import { execa } from 'execa';
import { buildAudioFilter, compose } from '../stages/compose.js';
import type { AudioSegment } from '../types.js';

const mockedExeca = vi.mocked(execa);

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

describe('compose', () => {
  beforeEach(() => {
    mockedExeca.mockReset();
    mockedExeca.mockResolvedValue({ stdout: '', stderr: '' } as never);
  });

  function lastFfmpegArgs(): string[] {
    const call = mockedExeca.mock.calls.at(-1);
    if (!call) throw new Error('execa was not called');
    expect(call[0]).toBe('ffmpeg');
    return call[1] as string[];
  }

  it('writes final.mp4 inside the provided outDir', async () => {
    const out = await compose(
      '/tmp/video.webm',
      [{ stepId: 1, durationMs: 1000, audioPath: '/tmp/a.mp3', startMs: 0 }],
      '/tmp/out'
    );
    expect(out).toBe('/tmp/out/final.mp4');
    expect(mockedExeca).toHaveBeenCalledTimes(1);
  });

  it('maps only the video stream when no audio segments are provided', async () => {
    await compose('/tmp/video.webm', [], '/tmp/out');
    const args = lastFfmpegArgs();

    expect(args).toContain('-map');
    expect(args).toContain('0:v:0');
    // No filter graph or audio map when there are no audio inputs.
    expect(args).not.toContain('-filter_complex');
    expect(args).not.toContain('[aout]');
  });

  it('adds one -i per audio segment in startMs order', async () => {
    const segments: AudioSegment[] = [
      { stepId: 2, durationMs: 2000, audioPath: '/tmp/b.mp3', startMs: 3000 },
      { stepId: 1, durationMs: 1000, audioPath: '/tmp/a.mp3', startMs: 0 },
    ];
    await compose('/tmp/video.webm', segments, '/tmp/out');
    const args = lastFfmpegArgs();

    // Video input first, then audio inputs sorted by startMs.
    const inputIndices = args.reduce<number[]>((acc, v, i) => {
      if (v === '-i') acc.push(i);
      return acc;
    }, []);
    expect(inputIndices).toHaveLength(3);
    expect(args[inputIndices[0]! + 1]).toBe('/tmp/video.webm');
    expect(args[inputIndices[1]! + 1]).toBe('/tmp/a.mp3');
    expect(args[inputIndices[2]! + 1]).toBe('/tmp/b.mp3');
  });

  it('passes a filter graph that delays each audio and routes to [aout]', async () => {
    const segments: AudioSegment[] = [
      { stepId: 1, durationMs: 1000, audioPath: '/tmp/a.mp3', startMs: 0 },
      { stepId: 2, durationMs: 2000, audioPath: '/tmp/b.mp3', startMs: 1500 },
    ];
    await compose('/tmp/video.webm', segments, '/tmp/out');
    const args = lastFfmpegArgs();

    const fcIdx = args.indexOf('-filter_complex');
    expect(fcIdx).toBeGreaterThan(-1);
    const graph = args[fcIdx + 1] ?? '';
    expect(graph).toContain('[1:a]adelay=0|0[a0]');
    expect(graph).toContain('[2:a]adelay=1500|1500[a1]');
    expect(graph).toContain('amix=inputs=2');
    expect(graph).toContain('loudnorm[aout]');

    // Both video and the mixed audio are mapped.
    const mapPairs = args.reduce<string[]>((acc, v, i) => {
      if (v === '-map') acc.push(args[i + 1] ?? '');
      return acc;
    }, []);
    expect(mapPairs).toContain('0:v:0');
    expect(mapPairs).toContain('[aout]');
  });

  it('encodes to 1080p H.264/AAC with the documented preset', async () => {
    await compose(
      '/tmp/video.webm',
      [{ stepId: 1, durationMs: 1000, audioPath: '/tmp/a.mp3', startMs: 0 }],
      '/tmp/out'
    );
    const args = lastFfmpegArgs();

    expect(args).toContain('-y');
    expect(args).toContain('-c:v');
    expect(args).toContain('libx264');
    expect(args).toContain('-preset');
    expect(args).toContain('fast');
    expect(args).toContain('-crf');
    expect(args).toContain('24');
    expect(args).toContain('-c:a');
    expect(args).toContain('aac');
    expect(args).toContain('-b:a');
    expect(args).toContain('192k');
    expect(args).toContain('-shortest');
    // The scale+pad filter must target 1920x1080.
    const vfIdx = args.indexOf('-vf');
    expect(args[vfIdx + 1]).toContain('1920:1080');
  });

  it('propagates ffmpeg errors', async () => {
    mockedExeca.mockRejectedValueOnce(new Error('ffmpeg blew up'));
    await expect(
      compose(
        '/tmp/video.webm',
        [{ stepId: 1, durationMs: 1000, audioPath: '/tmp/a.mp3', startMs: 0 }],
        '/tmp/out'
      )
    ).rejects.toThrow(/ffmpeg blew up/);
  });
});
