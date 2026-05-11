import * as p from '@clack/prompts';
import color from 'picocolors';
import fs from 'node:fs/promises';
import { explore } from './stages/explore.js';
import { record } from './stages/record.js';
import { tts } from './stages/tts.js';
import { compose } from './stages/compose.js';
import { mockExplore } from './testing/mock-explore.js';
import { mockTts } from './testing/mock-tts.js';
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

  if (ctx.testMode) {
    p.log.warn(color.yellow('Test mode — no AI credits will be used'));
  }

  const s = p.spinner();

  s.start('Exploring website...');
  const plan = ctx.testMode
    ? await mockExplore(ctx.prompt, ctx.url, ctx.outDir)
    : await explore(ctx.prompt, ctx.url, ctx.outDir, ctx.language);
  s.stop(`Exploration complete — ${plan.steps.length} steps verified`);

  s.start('Generating narration audio...');
  const clips = ctx.testMode
    ? await mockTts(plan, ctx.outDir)
    : await tts(plan, ctx.voice, ctx.outDir);
  const audioDurations = new Map<number, number>(clips.map((c) => [c.stepId, c.durationMs]));
  const totalAudioSec = Math.round([...audioDurations.values()].reduce((a, b) => a + b, 0) / 1000);
  s.stop(`Narration complete — ${clips.length} clips (${totalAudioSec}s)`);

  s.start('Recording video...');
  const rec = await record(plan, ctx.url, ctx.outDir, audioDurations);
  const durationSec = Math.round((rec.timeline.at(-1)?.endMs ?? 0) / 1000);
  s.stop(`Recording complete — ${durationSec}s video`);

  // Build a lookup map for O(1) timeline access instead of O(n) find per clip.
  const timelineByStep = new Map(rec.timeline.map((t) => [t.stepId, t]));
  const audios: AudioSegment[] = clips.map((c) => {
    const entry = timelineByStep.get(c.stepId);
    if (!entry) throw new Error(`No timeline entry for step ${c.stepId}`);
    return { ...c, startMs: entry.startMs };
  });

  s.start('Composing final video...');
  const finalPath = await compose(rec.videoPath, audios, ctx.outDir);
  s.stop('Composition complete — final.mp4');

  return finalPath;
}
