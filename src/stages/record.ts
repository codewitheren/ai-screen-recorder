// record.ts
//
// Replays verified steps in a fresh browser with Playwright video capture.
// Each step is held on-screen long enough for its narration audio to finish.
// No AI calls here — purely deterministic playback.

import { chromium, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { ExploreResult, RecordResult, TimelineEntry, VerifiedStep } from '../types.js';

const ACTION_TIMEOUT_MS = 8000;
// Extra padding after each step so narration doesn't clip into the next action.
const POST_STEP_GAP_MS = 400;

/**
 * Replays steps with video recording. Returns the video path and a
 * timeline mapping each step to its start/end offset in the recording.
 */
export async function record(
  plan: ExploreResult,
  startUrl: string,
  outDir: string,
  audioDurations: Map<number, number>
): Promise<RecordResult> {
  const videoDir = path.join(outDir, 'video');
  await fs.mkdir(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: videoDir, size: { width: 1920, height: 1080 } },
  });
  // Playwright's video capture doesn't include the real OS cursor, so we
  // inject a virtual cursor overlay that follows mouse events on every page.
  await context.addInitScript({ content: VIRTUAL_CURSOR_SCRIPT });
  const page = await context.newPage();

  const timeline: TimelineEntry[] = [];
  const t0 = Date.now();

  try {
    for (const step of plan.steps) {
      const startMs = Date.now() - t0;
      await runStep(page, step, startUrl);

      // Hold until narration finishes playing so audio stays in sync.
      const audioMs = audioDurations.get(step.id) ?? 0;
      const elapsed = Date.now() - t0 - startMs;
      const holdMs = Math.max(POST_STEP_GAP_MS, audioMs + POST_STEP_GAP_MS - elapsed);
      await page.waitForTimeout(holdMs);

      timeline.push({ stepId: step.id, startMs, endMs: Date.now() - t0 });
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
  return { videoPath, timeline };
}

// Executes a single verified step. If a selector fails here, it means
// the page state drifted between exploration and recording.
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
      await moveCursorTo(page, loc);
      await loc.click({ timeout: ACTION_TIMEOUT_MS });
      return;
    }
    case 'type': {
      if (!step.selector) throw new Error(`Step ${step.id}: type missing selector`);
      const loc = page.locator(step.selector).first();
      await loc.waitFor({ state: 'visible', timeout: ACTION_TIMEOUT_MS });
      await moveCursorTo(page, loc);
      await loc.fill(step.input ?? '', { timeout: ACTION_TIMEOUT_MS });
      return;
    }
  }
}

// Smoothly moves the real Playwright mouse to the element's center. This
// drives the injected virtual cursor (via mousemove events) so viewers see
// the pointer travel toward each interaction.
async function moveCursorTo(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 20 });
}

// Browser-side script injected into every page. Renders a cursor div and
// updates its position on mousemove. Kept as a string so this Node module
// doesn't need DOM types in tsconfig.
const VIRTUAL_CURSOR_SCRIPT = `
(() => {
  const install = () => {
    if (document.getElementById('__ai_cursor__')) return;
    const cursor = document.createElement('div');
    cursor.id = '__ai_cursor__';
    cursor.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:20px',
      'height:20px',
      'border-radius:50%',
      'background:rgba(255,64,64,0.85)',
      'border:2px solid #fff',
      'box-shadow:0 0 8px rgba(0,0,0,0.5)',
      'pointer-events:none',
      'z-index:2147483647',
      'transform:translate(-50%,-50%)',
      'transition:transform 0.05s linear'
    ].join(';');
    document.documentElement.appendChild(cursor);
    window.addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    }, { passive: true, capture: true });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
`;
