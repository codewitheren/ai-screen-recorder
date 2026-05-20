import type { Page } from 'playwright';
import type { VerifiedStep } from '../explore/types.ts';

const ACTION_TIMEOUT_MS = 8000;

// Executes a single verified step. A selector failure here means the page
// drifted between exploration and recording (e.g. A/B test, new layout)
// — we surface it rather than retrying because the plan is stale.
export async function runStep(page: Page, step: VerifiedStep, fallbackUrl: string): Promise<void> {
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

// Animates the real Playwright pointer to the element's center. The
// motion drives the injected virtual cursor (via mousemove events) so
// viewers see the pointer travel toward each interaction.
export async function moveCursorTo(
  page: Page,
  locator: ReturnType<Page['locator']>
): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 20 });
}
