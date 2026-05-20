import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import type { ExploreResult, VerifiedStep } from '../stages/index.ts';

// --- Playwright mock --------------------------------------------------------

interface MouseRecorder {
  moves: Array<{ x: number; y: number }>;
  wheels: Array<{ dx: number; dy: number }>;
}

interface FakePage {
  goto: ReturnType<typeof vi.fn>;
  waitForTimeout: ReturnType<typeof vi.fn>;
  mouse: {
    wheel: ReturnType<typeof vi.fn>;
    move: ReturnType<typeof vi.fn>;
  };
  locator: ReturnType<typeof vi.fn>;
  url: () => string;
  title: () => Promise<string>;
}

interface PlaywrightHandles {
  page: FakePage;
  mouse: MouseRecorder;
  videoDir: string;
  videoFile: string;
  browser: { close: ReturnType<typeof vi.fn> };
  context: { close: ReturnType<typeof vi.fn>; addInitScript: ReturnType<typeof vi.fn> };
  selectorBehavior: Map<string, 'ok' | 'fail'>;
  clicks: string[];
  fills: Array<{ selector: string; value: string }>;
}

let handles: PlaywrightHandles;

function makeLocator(selector: string): unknown {
  const ok = handles.selectorBehavior.get(selector) !== 'fail';
  const loc: Record<string, unknown> = {
    first: () => loc,
    waitFor: vi.fn(async () => {
      if (!ok) throw new Error(`waitFor failed for ${selector}`);
    }),
    click: vi.fn(async () => {
      handles.clicks.push(selector);
    }),
    fill: vi.fn(async (value: string) => {
      handles.fills.push({ selector, value });
    }),
    boundingBox: vi.fn(async () => ({ x: 10, y: 20, width: 100, height: 40 })),
  };
  return loc;
}

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(async () => handles.browser),
  },
}));

import { chromium } from 'playwright';
import { record } from '../stages/index.ts';

beforeEach(() => {
  vi.clearAllMocks();
});

async function setupHandles(): Promise<string> {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'record-test-'));
  const videoDir = path.join(outDir, 'video');
  await fs.mkdir(videoDir, { recursive: true });
  const videoFile = path.join(videoDir, 'rec.webm');
  // The stage reads the directory listing to find the produced video;
  // touch a file so it can be discovered without a real recorder.
  await fs.writeFile(videoFile, '');

  const mouse: MouseRecorder = { moves: [], wheels: [] };
  const page: FakePage = {
    goto: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    mouse: {
      wheel: vi.fn(async (dx: number, dy: number) => {
        mouse.wheels.push({ dx, dy });
      }),
      move: vi.fn(async (x: number, y: number) => {
        mouse.moves.push({ x, y });
      }),
    },
    locator: vi.fn((sel: string) => makeLocator(sel)),
    url: () => 'about:blank',
    title: async () => 'untitled',
  };

  handles = {
    page,
    mouse,
    videoDir,
    videoFile,
    browser: { close: vi.fn(async () => undefined) },
    context: {
      close: vi.fn(async () => undefined),
      addInitScript: vi.fn(async () => undefined),
    },
    selectorBehavior: new Map(),
    clicks: [],
    fills: [],
  };

  vi.mocked(chromium.launch).mockResolvedValue(handles.browser as never);
  // newContext returns a context with newPage.
  Object.assign(handles.browser, {
    newContext: vi.fn(async () => ({
      ...handles.context,
      newPage: vi.fn(async () => page),
    })),
  });

  return outDir;
}

function plan(steps: VerifiedStep[]): ExploreResult {
  return { title: 'test', steps };
}

describe('record', () => {
  it('replays every step and writes timeline.json', async () => {
    const outDir = await setupHandles();
    const steps: VerifiedStep[] = [
      { id: 1, action: 'navigate', selector: null, input: 'https://x.com', narration: 'go' },
      { id: 2, action: 'click', selector: '#btn', input: null, narration: 'click' },
      { id: 3, action: 'type', selector: '#field', input: 'hello', narration: 'type' },
      { id: 4, action: 'scroll', selector: null, input: null, narration: 'scroll' },
      { id: 5, action: 'wait', selector: null, input: '500', narration: 'wait' },
    ];
    const audio = new Map<number, number>([
      [1, 100],
      [2, 100],
      [3, 100],
      [4, 100],
      [5, 100],
    ]);

    const result = await record(plan(steps), 'https://fallback.example', outDir, audio);

    expect(result.timeline).toHaveLength(5);
    expect(result.timeline.map((e) => e.stepId)).toEqual([1, 2, 3, 4, 5]);
    for (const entry of result.timeline) {
      expect(entry.endMs).toBeGreaterThanOrEqual(entry.startMs);
    }
    expect(result.videoPath).toBe(handles.videoFile);

    const saved = JSON.parse(await fs.readFile(path.join(outDir, 'timeline.json'), 'utf8'));
    expect(saved).toEqual(result.timeline);
  });

  it('dispatches each action to the right Playwright API', async () => {
    const outDir = await setupHandles();
    const steps: VerifiedStep[] = [
      { id: 1, action: 'navigate', selector: null, input: 'https://example.com', narration: 'n' },
      { id: 2, action: 'click', selector: 'role=button[name=ok]', input: null, narration: 'c' },
      { id: 3, action: 'type', selector: '#email', input: 'a@b.co', narration: 't' },
      { id: 4, action: 'scroll', selector: null, input: null, narration: 's' },
    ];
    await record(plan(steps), 'https://fallback.example', outDir, new Map());

    expect(handles.page.goto).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ waitUntil: 'domcontentloaded' })
    );
    expect(handles.clicks).toContain('role=button[name=ok]');
    expect(handles.fills).toEqual([{ selector: '#email', value: 'a@b.co' }]);
    expect(handles.mouse.wheels).toEqual([{ dx: 0, dy: 600 }]);
  });

  it('falls back to startUrl when navigate has no explicit input', async () => {
    const outDir = await setupHandles();
    const steps: VerifiedStep[] = [
      { id: 1, action: 'navigate', selector: null, input: null, narration: 'n' },
    ];
    await record(plan(steps), 'https://fallback.example', outDir, new Map());

    expect(handles.page.goto).toHaveBeenCalledWith(
      'https://fallback.example',
      expect.objectContaining({ waitUntil: 'domcontentloaded' })
    );
  });

  it('animates the cursor toward the element center before click', async () => {
    const outDir = await setupHandles();
    const steps: VerifiedStep[] = [
      { id: 1, action: 'click', selector: '#btn', input: null, narration: 'c' },
    ];
    await record(plan(steps), 'https://fallback.example', outDir, new Map());

    // boundingBox = { x:10, y:20, width:100, height:40 } -> center (60, 40).
    expect(handles.mouse.moves).toEqual([{ x: 60, y: 40 }]);
  });

  it('waits at least as long as the narration audio', async () => {
    const outDir = await setupHandles();
    const steps: VerifiedStep[] = [
      { id: 1, action: 'scroll', selector: null, input: null, narration: 's' },
    ];
    await record(plan(steps), 'https://fallback.example', outDir, new Map([[1, 2500]]));

    // The hold is computed as audioMs + POST_STEP_GAP_MS (400) - elapsed; the
    // scroll itself is near-instant under mocks, so the wait must be >= 400
    // and ideally close to ~2900ms. We assert a comfortable lower bound.
    expect(handles.page.waitForTimeout).toHaveBeenCalled();
    const wait = vi.mocked(handles.page.waitForTimeout).mock.calls[0]?.[0] as number;
    expect(wait).toBeGreaterThanOrEqual(2500);
  });

  it('uses POST_STEP_GAP_MS when there is no narration audio for the step', async () => {
    const outDir = await setupHandles();
    const steps: VerifiedStep[] = [
      { id: 1, action: 'scroll', selector: null, input: null, narration: 's' },
    ];
    await record(plan(steps), 'https://fallback.example', outDir, new Map());

    const wait = vi.mocked(handles.page.waitForTimeout).mock.calls[0]?.[0] as number;
    expect(wait).toBeGreaterThanOrEqual(400);
    expect(wait).toBeLessThan(1000);
  });

  it('throws when click step has no selector', async () => {
    const outDir = await setupHandles();
    const steps: VerifiedStep[] = [
      { id: 1, action: 'click', selector: null, input: null, narration: 'c' },
    ];
    await expect(
      record(plan(steps), 'https://fallback.example', outDir, new Map())
    ).rejects.toThrow(/click missing selector/);
  });

  it('throws when type step has no selector', async () => {
    const outDir = await setupHandles();
    const steps: VerifiedStep[] = [
      { id: 1, action: 'type', selector: null, input: 'x', narration: 't' },
    ];
    await expect(
      record(plan(steps), 'https://fallback.example', outDir, new Map())
    ).rejects.toThrow(/type missing selector/);
  });

  it('throws when no .webm file is produced', async () => {
    const outDir = await setupHandles();
    // Remove the placeholder so the directory listing turns up empty.
    await fs.unlink(handles.videoFile);

    const steps: VerifiedStep[] = [
      { id: 1, action: 'scroll', selector: null, input: null, narration: 's' },
    ];
    await expect(
      record(plan(steps), 'https://fallback.example', outDir, new Map())
    ).rejects.toThrow(/No video recording produced/);
  });

  it('closes the browser context even on failure', async () => {
    const outDir = await setupHandles();
    const steps: VerifiedStep[] = [
      { id: 1, action: 'click', selector: null, input: null, narration: 'c' },
    ];

    await expect(
      record(plan(steps), 'https://fallback.example', outDir, new Map())
    ).rejects.toThrow();

    expect(handles.context.close).toHaveBeenCalled();
    expect(handles.browser.close).toHaveBeenCalled();
  });

  it('injects the virtual cursor script via addInitScript', async () => {
    const outDir = await setupHandles();
    const steps: VerifiedStep[] = [
      { id: 1, action: 'scroll', selector: null, input: null, narration: 's' },
    ];
    await record(plan(steps), 'https://fallback.example', outDir, new Map());

    expect(handles.context.addInitScript).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(handles.context.addInitScript).mock.calls[0]?.[0] as {
      content?: string;
    };
    expect(arg?.content).toContain('__ai_cursor__');
    expect(arg?.content).toContain('mousemove');
  });
});
