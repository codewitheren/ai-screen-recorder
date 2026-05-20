// tts.ts
//
// Synthesizes a narration MP3 per step using the OpenRouter TTS endpoint.
//
// Runs with bounded concurrency (`TTS_CONCURRENCY`) so we get a real
// speedup over sequential synthesis while staying well under typical
// provider rate limits. Failures use exponential backoff with jitter.

import path from 'node:path';
import fs from 'node:fs/promises';
import { execa } from 'execa';
import { getOpenAIClient } from '../lib/openai-client.js';
import type { AudioClip, ExploreResult } from '../types.js';

const TTS_MODEL = process.env.TTS_MODEL ?? 'openai/gpt-4o-mini-tts-2025-12-15';
const MAX_RETRIES = 3;
const TTS_CONCURRENCY = Math.max(1, parseInt(process.env.TTS_CONCURRENCY ?? '4', 10) || 4);

/**
 * Synthesizes one MP3 per step in `plan` and returns the resulting clips
 * in step-id order.
 *
 * Side effects: writes `outDir/audio/seg_<id>.mp3` for each step.
 * Throws if any clip fails after `MAX_RETRIES` retries.
 */
export async function tts(
  plan: ExploreResult,
  voice: string,
  outDir: string
): Promise<AudioClip[]> {
  const audioDir = path.join(outDir, 'audio');
  await fs.mkdir(audioDir, { recursive: true });

  const tasks = plan.steps.map((step) => async (): Promise<AudioClip> => {
    const mp3Path = path.join(audioDir, `seg_${step.id}.mp3`);
    await ttsToFile(step.narration, voice, mp3Path);
    const durationMs = await getAudioDurationMs(mp3Path);
    return { stepId: step.id, durationMs, audioPath: mp3Path };
  });

  const clips = await runWithConcurrency(tasks, TTS_CONCURRENCY);
  // Workers complete out of order; restore step ordering for the caller.
  clips.sort((a, b) => a.stepId - b.stepId);
  return clips;
}

// Minimal bounded-concurrency runner. Avoids pulling in `p-limit` just
// for this one call site. Results are written by input index so the
// returned array mirrors the input ordering.
async function runWithConcurrency<T>(
  tasks: readonly (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      const task = tasks[i];
      if (!task) return;
      results[i] = await task();
    }
  });
  await Promise.all(workers);
  return results;
}

async function getAudioDurationMs(filePath: string): Promise<number> {
  const { stdout } = await execa('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    filePath,
  ]);
  return Math.ceil(parseFloat(stdout.trim()) * 1000);
}

async function ttsToFile(text: string, voice: string, outPath: string): Promise<void> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await getOpenAIClient().audio.speech.create({
        model: TTS_MODEL,
        voice: voice,
        input: text,
        response_format: 'mp3',
      });
      const buf = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(outPath, buf);
      return;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      // Exponential backoff (1s, 2s, 4s) + up to 500ms jitter to avoid
      // thundering-herd retries when several clips fail at the same time.
      const waitMs = 1000 * 2 ** attempt + Math.floor(Math.random() * 500);
      console.error(`  TTS attempt ${attempt + 1} failed, retrying in ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}
