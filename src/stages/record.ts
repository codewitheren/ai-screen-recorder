import { chromium, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { ExploreResult, RecordResult, TimelineEntry, VerifiedStep } from '../types.js';

const ACTION_TIMEOUT_MS = 8000;
// Extra pause after each step so the narration audio has room to finish.
const POST_STEP_GAP_MS = 400;

/**
 * Replays the explore agent's verified steps in a fresh browser session with
 * video recording enabled. Each step is held on-screen until its narration
 * audio finishes. No LLM calls — selectors are already known to work.
 */
export async function record(
  plan: ExploreResult,
  startUrl: string,
  outDir: string,
  audioDurations: Map<number, number>,
): Promise<RecordResult> {
  const videoDir = path.join(outDir, 'video');
  await fs.mkdir(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: videoDir, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();

  const timeline: TimelineEntry[] = [];
  const t0 = Date.now();

  try {
    for (const step of plan.steps) {
      const startMs = Date.now() - t0;
      await runStep(page, step, startUrl);

      // Hold the screen until the narration for this step has played out.
      const audioMs = audioDurations.get(step.id) ?? 0;
      const elapsed = Date.now() - t0 - startMs;
      const holdMs = Math.max(POST_STEP_GAP_MS, audioMs + POST_STEP_GAP_MS - elapsed);
      await page.waitForTimeout(holdMs);

      timeline.push({ stepId: step.id, startMs, endMs: Date.now() - t0 });
    }
  } finally {
    // Closing the context flushes the WebM to disk.
    await context.close();
    await browser.close();
  }

  const files = await fs.readdir(videoDir);
  const webm = files.find((f) => f.endsWith('.webm'));
  if (!webm) throw new Error('No video recording produced');
  const videoPath = path.join(videoDir, webm);

  await fs.writeFile(path.join(outDir, 'timeline.json'), JSON.stringify(timeline, null, 2));
  return { videoPath, timeline };
}

// Executes a single verified step. Selectors were validated during explore so
// failures here indicate a page-state change between exploration and recording.
async function runStep(page: Page, step: VerifiedStep, fallbackUrl: string): Promise<void> {
  switch (step.action) {
    case 'navigate': {
      await page.goto(step.input || fallbackUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return;
    }
    case 'wait': {
      await page.waitForTimeout(Number(step.input) || 1000);
      return;
    }
    case 'scroll': {
      await page.mouse.wheel(0, 600);
      return;
    }
    case 'click': {
      if (!step.selector) throw new Error(`Step ${step.id}: click missing selector`);
      const loc = page.locator(step.selector).first();
      await loc.waitFor({ state: 'visible', timeout: ACTION_TIMEOUT_MS });
      await loc.click({ timeout: ACTION_TIMEOUT_MS });
      return;
    }
    case 'type': {
      if (!step.selector) throw new Error(`Step ${step.id}: type missing selector`);
      const loc = page.locator(step.selector).first();
      await loc.waitFor({ state: 'visible', timeout: ACTION_TIMEOUT_MS });
      await loc.fill(step.input ?? '', { timeout: ACTION_TIMEOUT_MS });
      return;
    }
  }
}
