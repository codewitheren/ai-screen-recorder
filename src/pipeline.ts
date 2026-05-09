import chalk from 'chalk';
import fs from 'node:fs/promises';
import { explore } from './stages/explore.js';
import { record } from './stages/record.js';
import { tts } from './stages/tts.js';
import { compose } from './stages/compose.js';
import type { AudioSegment, RunContext } from './types.js';

/**
 * Runs the full pipeline for a single recorded video:
 *   1. explore — agent browses the site, builds verified steps + narrations
 *   2. tts     — synthesizes narration audio for each step
 *   3. record  — replays steps with video recording; holds each frame for audio
 *   4. compose — merges video + audio into a final MP4
 */
export async function runPipeline(ctx: RunContext): Promise<string> {
  await fs.mkdir(ctx.outDir, { recursive: true });

  process.stdout.write(chalk.gray('[explore] '));
  const plan = await explore(ctx.prompt, ctx.url, ctx.outDir, ctx.language);
  console.log(chalk.green(`✓ ${plan.steps.length} steps verified in browser`));

  process.stdout.write(chalk.gray('[tts]     '));
  const clips = await tts(plan, ctx.voice, ctx.outDir);
  const audioDurations = new Map(clips.map((c) => [c.stepId, c.durationMs]));
  const totalAudioSec = Math.round([...audioDurations.values()].reduce((a, b) => a + b, 0) / 1000);
  console.log(chalk.green(`✓ ${clips.length} audio files (${totalAudioSec}s total)`));

  process.stdout.write(chalk.gray('[record]  '));
  const rec = await record(plan, ctx.url, ctx.outDir, audioDurations);
  const durationSec = Math.round((rec.timeline.at(-1)?.endMs ?? 0) / 1000);
  console.log(chalk.green(`✓ recorded ${durationSec}s`));

  // Map each audio clip to its actual on-screen start time from the timeline.
  const audios: AudioSegment[] = clips.map((c) => {
    const entry = rec.timeline.find((x) => x.stepId === c.stepId);
    if (!entry) throw new Error(`No timeline entry for step ${c.stepId}`);
    return { ...c, startMs: entry.startMs };
  });

  process.stdout.write(chalk.gray('[compose] '));
  const finalPath = await compose(rec.videoPath, audios, ctx.outDir);
  console.log(chalk.green('✓ final.mp4'));

  return finalPath;
}
