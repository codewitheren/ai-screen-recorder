import path from 'node:path';
import fs from 'node:fs/promises';
import { execa } from 'execa';
import type { AudioClip, ExploreResult } from '../types.js';

/**
 * Mock TTS stage for test mode. Generates short silent MP3 files using ffmpeg
 * instead of calling the TTS API — no AI credits used.
 */
export async function mockTts(
  plan: ExploreResult,
  outDir: string,
): Promise<AudioClip[]> {
  const audioDir = path.join(outDir, 'audio');
  await fs.mkdir(audioDir, { recursive: true });

  const clips: AudioClip[] = [];

  for (const step of plan.steps) {
    const mp3Path = path.join(audioDir, `seg_${step.id}.mp3`);
    const durationSec = 2; // 2 seconds of silence per step

    // Generate silent audio with ffmpeg
    await execa('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', `anullsrc=r=44100:cl=mono`,
      '-t', String(durationSec),
      '-c:a', 'libmp3lame',
      '-q:a', '9',
      mp3Path,
    ]);

    clips.push({ stepId: step.id, durationMs: durationSec * 1000, audioPath: mp3Path });
  }

  return clips;
}
