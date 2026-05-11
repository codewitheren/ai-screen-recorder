import path from 'node:path';
import fs from 'node:fs/promises';
import type { ExploreResult } from '../types.js';

/**
 * Mock explore stage for test mode. Returns predefined steps that navigate
 * to the target URL and scroll — no LLM calls, no AI credits used.
 */
export async function mockExplore(
  prompt: string,
  url: string,
  outDir: string,
): Promise<ExploreResult> {
  const result: ExploreResult = {
    title: `[TEST] ${prompt}`,
    steps: [
      {
        id: 1,
        action: 'navigate',
        selector: null,
        input: url,
        narration: `Navigating to ${new URL(url).hostname}`,
      },
      {
        id: 2,
        action: 'wait',
        selector: null,
        input: '2000',
        narration: 'Waiting for the page to load',
      },
      {
        id: 3,
        action: 'scroll',
        selector: null,
        input: null,
        narration: 'Scrolling down to see more content',
      },
    ],
  };

  await fs.writeFile(path.join(outDir, 'explore.json'), JSON.stringify(result, null, 2));
  return result;
}
