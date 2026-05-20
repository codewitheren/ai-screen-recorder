// pipeline.ts
//
// Orchestrates the four-stage video generation pipeline:
// explore -> tts -> record -> compose.
//
// Stages are run sequentially because each one consumes the output of the
// previous. TTS runs before record so audio durations are known when
// recording (each step is held on-screen long enough for its narration).

import * as p from '@clack/prompts';
import fs from 'node:fs/promises';
import { explore } from './stages/explore.js';
import { record } from './stages/record.js';
import { tts } from './stages/tts.js';
import { compose } from './stages/compose.js';
import type { AudioSegment, RunContext } from './types.js';

/**
 * Runs the full pipeline end-to-end.
 *
 * Side effects: creates `ctx.outDir`, writes intermediate artifacts
 * (explore.json, audio/, video/, timeline.json) and the final mp4.
 *
 * Returns the absolute path to the final mp4.
 */
export async function runPipeline(ctx: RunContext): Promise<string> {
  await fs.mkdir(ctx.outDir, { recursive: true });

  const s = p.spinner();

  s.start('Exploring website...');
  const plan = await explore(ctx.prompt, ctx.url, ctx.outDir, ctx.language);
  s.stop(`Exploration complete — ${plan.steps.length} steps verified`);

  s.start('Generating narration audio...');
  const clips = await tts(plan, ctx.voice, ctx.outDir);
  const audioDurations = new Map<number, number>(clips.map((c) => [c.stepId, c.durationMs]));
  const totalAudioSec = Math.round([...audioDurations.values()].reduce((a, b) => a + b, 0) / 1000);
  s.stop(`Narration complete — ${clips.length} clips (${totalAudioSec}s)`);

  s.start('Recording video...');
  const rec = await record(plan, ctx.url, ctx.outDir, audioDurations);
  const durationSec = Math.round((rec.timeline.at(-1)?.endMs ?? 0) / 1000);
  s.stop(`Recording complete — ${durationSec}s video`);

  // Index the timeline by stepId so we can pair each audio clip with its
  // recorded start offset in a single pass instead of O(n*m).
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
