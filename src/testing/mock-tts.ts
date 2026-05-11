// mock-tts.ts
//
// Test-mode substitute for the real TTS stage.
// Generates silent MP3 files via ffmpeg instead of calling the TTS API.

import path from 'node:path';
import fs from 'node:fs/promises';
import { execa } from 'execa';
import type { AudioClip, ExploreResult } from '../types.js';

/**
 * Produces 2-second silent MP3 clips for each step.
 * No API calls — safe for CI and offline testing.
 */
export async function mockTts(plan: ExploreResult, outDir: string): Promise<AudioClip[]> {
  const audioDir = path.join(outDir, 'audio');
  await fs.mkdir(audioDir, { recursive: true });

  const clips: AudioClip[] = [];

  for (const step of plan.steps) {
    const mp3Path = path.join(audioDir, `seg_${step.id}.mp3`);
    const durationSec = 2;

    await execa('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=44100:cl=mono`,
      '-t',
      String(durationSec),
      '-c:a',
      'libmp3lame',
      '-q:a',
      '9',
      mp3Path,
    ]);

    clips.push({ stepId: step.id, durationMs: durationSec * 1000, audioPath: mp3Path });
  }

  return clips;
}
