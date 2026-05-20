import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { VIRTUAL_CURSOR_SCRIPT } from './assets.ts';
import type { ExploreResult } from '../explore/types.ts';
import { runStep } from './logic.ts';
import type { RecordOptions, RecordResult, TimelineEntry } from './types.ts';

const POST_STEP_GAP_MS = 400;

export * from './types.ts';

export async function record(
  plan: ExploreResult,
  startUrl: string,
  outDir: string,
  audioDurations: Map<number, number>,
  options: RecordOptions = {}
): Promise<RecordResult> {
  const onProgress = options.onProgress ?? (() => undefined);
  const videoDir = path.join(outDir, 'video');
  await fs.mkdir(videoDir, { recursive: true });

  // Each step holds the frame for at least its narration audio + a small
  // gap; sum these up for a baseline total estimate. Adds ~600ms per step
  // for browser action overhead.
  const perStepEstimates = plan.steps.map((s) => {
    const audioMs = audioDurations.get(s.id) ?? 0;
    return Math.max(POST_STEP_GAP_MS, audioMs + POST_STEP_GAP_MS) + 600;
  });
  const estimatedTotalMs = perStepEstimates.reduce((a, b) => a + b, 0);
  onProgress({ type: 'start', total: plan.steps.length, estimatedTotalMs });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: videoDir, size: { width: 1920, height: 1080 } },
  });
  // Playwright's recorder doesn't capture the OS cursor, so we inject a
  // virtual cursor overlay that follows mouse events on every page.
  await context.addInitScript({ content: VIRTUAL_CURSOR_SCRIPT });
  const page = await context.newPage();

  const timeline: TimelineEntry[] = [];
  const t0 = Date.now();

  try {
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      if (!step) continue;

      const startMs = Date.now() - t0;
      const remainingEstimateMs = perStepEstimates.slice(i).reduce((a, b) => a + b, 0);
      onProgress({
        type: 'step-start',
        index: i + 1,
        total: plan.steps.length,
        stepId: step.id,
        action: step.action,
        selector: step.selector ?? null,
        input: step.input ?? null,
        narration: step.narration,
        remainingEstimateMs,
      });

      await runStep(page, step, startUrl);

      // Hold the frame until narration finishes, otherwise the next
      // action would start before the viewer hears about this one.
      const audioMs = audioDurations.get(step.id) ?? 0;
      const elapsed = Date.now() - t0 - startMs;
      const holdMs = Math.max(POST_STEP_GAP_MS, audioMs + POST_STEP_GAP_MS - elapsed);
      await page.waitForTimeout(holdMs);

      const endMs = Date.now() - t0;
      timeline.push({ stepId: step.id, startMs, endMs });
      onProgress({
        type: 'step-done',
        index: i + 1,
        total: plan.steps.length,
        stepId: step.id,
        elapsedMs: endMs - startMs,
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const files = await fs.readdir(videoDir);
  const webm = files.find((f) => f.endsWith('.webm'));
  if (!webm) throw new Error('No video recording produced');
  const videoPath = path.join(videoDir, webm);

  await fs.writeFile(path.join(outDir, 'timeline.json'), JSON.stringify(timeline, null, 2));
  onProgress({
    type: 'finished',
    total: plan.steps.length,
    totalDurationMs: timeline.at(-1)?.endMs ?? 0,
  });
  return { videoPath, timeline };
}
