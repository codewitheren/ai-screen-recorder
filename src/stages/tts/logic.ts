import { execa } from 'execa';
import fs from 'node:fs/promises';
import { getOpenAIClient } from '../../lib/openai-client.ts';

const TTS_MODEL = process.env.TTS_MODEL ?? 'openai/gpt-4o-mini-tts-2025-12-15';
const MAX_RETRIES = 3;

// Minimal bounded-concurrency runner. Avoids pulling in `p-limit` just
// for this one call site. Results are written by input index so the
// returned array mirrors the input ordering.
export async function runWithConcurrency<T>(
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

export async function getAudioDurationMs(filePath: string): Promise<number> {
  try {
    const { stdout } = await execa('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      filePath,
    ]);
    const val = parseFloat(stdout.trim());
    return Number.isNaN(val) ? 0 : Math.ceil(val * 1000);
  } catch (err) {
    console.error(`Error probing audio duration for file ${filePath}:`, err);
    return 0;
  }
}

export async function ttsToFile(
  text: string,
  voice: string,
  outPath: string,
  onRetry?: (attempt: number, waitMs: number, error: string) => void
): Promise<void> {
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
      const msg = err instanceof Error ? err.message : String(err);
      onRetry?.(attempt + 1, waitMs, msg);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}
