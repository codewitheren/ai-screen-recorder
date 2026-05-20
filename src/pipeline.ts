// pipeline.ts
//
// Orchestrates the four-stage video generation pipeline:
// explore -> tts -> record -> compose.
//
// Stages are run sequentially because each one consumes the output of the
// previous. TTS runs before record so audio durations are known when
// recording (each step is held on-screen long enough for its narration).
//
// Each stage exposes an `onProgress` callback with structured events; the
// pipeline maps those into a clean, line-oriented log so the user can
// follow what the agent is doing without spinner/log interleaving noise.

import * as p from '@clack/prompts';
import color from 'picocolors';
import fs from 'node:fs/promises';
import {
  explore,
  record,
  tts,
  compose,
  type ExploreProgress,
  type RecordProgress,
  type TtsProgress,
  type AudioSegment,
} from './stages/index.ts';
import { truncate, formatEta, progressTag, describeAction } from './lib/formatter.ts';

export interface RunContext {
  readonly prompt: string;
  readonly url: string;
  readonly voice: string;
  readonly language: string;
  readonly outDir: string;
}

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

  // --- 1. Explore ----------------------------------------------------------
  stageHeader(1, 'Explore', 'AI agent decides what to do, one action at a time');
  const exploreStart = Date.now();
  const plan = await explore(ctx.prompt, ctx.url, ctx.outDir, ctx.language, {
    onProgress: handleExploreProgress,
  });
  stageDone(`${plan.steps.length} step${plural(plan.steps.length)} verified`, exploreStart);

  // --- 2. TTS --------------------------------------------------------------
  stageHeader(2, 'Narration', `Synthesizing ${plan.steps.length} voice clips in parallel`);
  const ttsStart = Date.now();
  const clips = await tts(plan, ctx.voice, ctx.outDir, {
    onProgress: handleTtsProgress,
  });
  const audioDurations = new Map<number, number>(clips.map((c) => [c.stepId, c.durationMs]));
  const totalAudioSec = Math.round([...audioDurations.values()].reduce((a, b) => a + b, 0) / 1000);
  stageDone(`${clips.length} clips, ${totalAudioSec}s of speech`, ttsStart);

  // --- 3. Record -----------------------------------------------------------
  stageHeader(3, 'Record', 'Replaying the plan in a real browser');
  const recordStart = Date.now();
  const rec = await record(plan, ctx.url, ctx.outDir, audioDurations, {
    onProgress: handleRecordProgress,
  });
  const durationSec = Math.round((rec.timeline.at(-1)?.endMs ?? 0) / 1000);
  stageDone(`${durationSec}s of video captured`, recordStart);

  // --- 4. Compose ----------------------------------------------------------
  // Index the timeline by stepId so we can pair each audio clip with its
  // recorded start offset in a single pass instead of O(n*m).
  const timelineByStep = new Map(rec.timeline.map((t) => [t.stepId, t]));
  const audios: AudioSegment[] = clips.map((c) => {
    const entry = timelineByStep.get(c.stepId);
    if (!entry) throw new Error(`No timeline entry for step ${c.stepId}`);
    return { ...c, startMs: entry.startMs };
  });

  stageHeader(4, 'Compose', 'Muxing audio and video with ffmpeg');
  const composeStart = Date.now();
  const finalPath = await compose(rec.videoPath, audios, ctx.outDir);
  stageDone('final.mp4 written', composeStart);

  return finalPath;
}

// --- Output helpers ---------------------------------------------------------
//
// We deliberately avoid `p.spinner()` here because the agent emits many
// per-turn log lines; a redrawing spinner interleaved with permanent log
// rows produces cluttered output. Instead each event becomes exactly one
// stable, easy-to-scan line.

function plural(n: number): string {
  return n === 1 ? '' : 's';
}

function stageHeader(num: number, title: string, subtitle: string): void {
  // Blank line + bold prefix keeps stages visually distinct without the
  // visual weight of a full p.note() box.
  p.log.message('');
  p.log.message(
    `${color.bgCyan(color.black(` ${num}/4 `))} ${color.bold(color.cyan(title))} ${color.dim('— ' + subtitle)}`
  );
}

function stageDone(summary: string, startedAt: number): void {
  const sec = ((Date.now() - startedAt) / 1000).toFixed(1);
  p.log.success(`${summary} ${color.dim(`(${sec}s)`)}`);
}

// --- Stage-specific event handlers -----------------------------------------

function handleExploreProgress(event: ExploreProgress): void {
  switch (event.type) {
    case 'decision': {
      // `finish` is just a control signal — don't dump it as a row.
      if (event.action.kind === 'finish') return;
      const tag = progressTag(event.turn, event.maxTurns);
      const lines = [`${tag} ${describeAction(event.action)}`];
      if (event.narration) {
        lines.push(`       ${color.dim('🗣  ' + truncate(event.narration, 100))}`);
      }
      p.log.message(lines.join('\n'));
      return;
    }
    case 'action-error':
      p.log.warn(
        `      ${color.red('✗')} ${truncate(event.error, 100)} ${color.dim('— agent will retry')}`
      );
      return;
    case 'invalid-json':
      p.log.warn(`      ${color.red('✗')} invalid JSON ${color.dim('— re-prompting')}`);
      return;
    case 'turn-start':
    case 'action-ok':
    case 'step-recorded':
    case 'finished':
      // Silent: the `decision` row already covers what the user needs.
      return;
  }
}

function handleTtsProgress(event: TtsProgress): void {
  switch (event.type) {
    case 'clip-done': {
      const tag = progressTag(event.completed, event.total);
      const secs = (event.durationMs / 1000).toFixed(1);
      const eta =
        event.etaMs == null || event.completed === event.total
          ? ''
          : color.dim(` · ~${formatEta(event.etaMs)} left`);
      p.log.message(
        `${tag} ${color.green('✓')} clip ${event.stepId} ${color.dim(`(${secs}s)`)}${eta}`
      );
      return;
    }
    case 'retry':
      p.log.warn(
        `      ${color.red('✗')} clip ${event.stepId} attempt ${event.attempt} failed ${color.dim(`(${truncate(event.error, 60)}) — retry in ${event.waitMs}ms`)}`
      );
      return;
    case 'start':
    case 'clip-start':
    case 'finished':
      return;
  }
}

function handleRecordProgress(event: RecordProgress): void {
  switch (event.type) {
    case 'step-start': {
      // The agent step may carry either a URL (navigate) or a text payload
      // (type) in its `input` field; pick the right one for display.
      const actionStr = describeAction({
        kind: event.action,
        selector: event.selector,
        text: event.action === 'type' ? event.input : null,
        url: event.action === 'navigate' ? event.input : null,
        ms: event.action === 'wait' && event.input ? Number(event.input) : null,
      });
      const tag = progressTag(event.index, event.total);
      const eta =
        event.index === event.total
          ? ''
          : color.dim(` · ~${formatEta(event.remainingEstimateMs)} left`);
      const lines = [`${tag} ${actionStr}${eta}`];
      if (event.narration) {
        lines.push(`       ${color.dim('🗣  ' + truncate(event.narration, 100))}`);
      }
      p.log.message(lines.join('\n'));
      return;
    }
    case 'start':
    case 'step-done':
    case 'finished':
      return;
  }
}
