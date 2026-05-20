import path from 'node:path';
import fs from 'node:fs/promises';
import type { ExploreResult } from '../explore/types.ts';
import { runWithConcurrency, getAudioDurationMs, ttsToFile } from './logic.ts';
import type { AudioClip, TtsOptions } from './types.ts';

const TTS_CONCURRENCY = Math.max(1, parseInt(process.env.TTS_CONCURRENCY ?? '4', 10) || 4);

export * from './types.ts';

export async function tts(
  plan: ExploreResult,
  voice: string,
  outDir: string,
  options: TtsOptions = {}
): Promise<AudioClip[]> {
  const onProgress = options.onProgress ?? (() => undefined);
  const audioDir = path.join(outDir, 'audio');
  await fs.mkdir(audioDir, { recursive: true });

  const total = plan.steps.length;
  onProgress({ type: 'start', total, concurrency: Math.min(TTS_CONCURRENCY, total) });

  const startedAt = Date.now();
  let completed = 0;

  const tasks = plan.steps.map((step) => async (): Promise<AudioClip> => {
    const mp3Path = path.join(audioDir, `seg_${step.id}.mp3`);
    onProgress({ type: 'clip-start', stepId: step.id, narration: step.narration });
    await ttsToFile(step.narration, voice, mp3Path, (attempt, waitMs, error) =>
      onProgress({ type: 'retry', stepId: step.id, attempt, waitMs, error })
    );
    const durationMs = await getAudioDurationMs(mp3Path);
    completed++;
    const elapsed = Date.now() - startedAt;
    const remaining = total - completed;
    // ETA: extrapolate from average per-clip wall time, scaled by how many
    // clips can still finish in parallel.
    const etaMs =
      completed === 0 || remaining === 0
        ? 0
        : Math.round((elapsed / completed) * Math.ceil(remaining / Math.max(1, TTS_CONCURRENCY)));
    onProgress({
      type: 'clip-done',
      stepId: step.id,
      durationMs,
      completed,
      total,
      etaMs,
    });
    return { stepId: step.id, durationMs, audioPath: mp3Path };
  });

  const clips = await runWithConcurrency(tasks, TTS_CONCURRENCY);
  // Workers complete out of order; restore step ordering for the caller.
  clips.sort((a, b) => a.stepId - b.stepId);

  onProgress({
    type: 'finished',
    total,
    totalDurationMs: clips.reduce((sum, c) => sum + c.durationMs, 0),
  });
  return clips;
}
