import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import type * as llmModule from '../lib/llm.ts';

// --- Mocks ------------------------------------------------------------------

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));
vi.mock('../lib/llm.ts', async () => {
  const actual = await vi.importActual<typeof llmModule>('../lib/llm.ts');
  return {
    ...actual,
    chat: chatMock,
  };
});

interface Locator {
  first: () => Locator;
  waitFor: ReturnType<typeof vi.fn>;
  click: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  ariaSnapshot: ReturnType<typeof vi.fn>;
}

interface FakePage {
  goto: ReturnType<typeof vi.fn>;
  locator: ReturnType<typeof vi.fn>;
  mouse: { wheel: ReturnType<typeof vi.fn> };
  waitForTimeout: ReturnType<typeof vi.fn>;
  url: () => string;
  title: () => Promise<string>;
}

interface Handles {
  page: FakePage;
  selectorBehavior: Map<string, 'ok' | 'fail'>;
  clicks: string[];
  fills: Array<{ selector: string; value: string }>;
  navigations: string[];
}

let handles: Handles;

function makeLocator(selector: string): Locator {
  const fails = handles.selectorBehavior.get(selector) === 'fail';
  const loc: Locator = {
    first: () => loc,
    waitFor: vi.fn(async () => {
      if (fails) throw new Error(`selector ${selector} not visible`);
    }),
    click: vi.fn(async () => {
      handles.clicks.push(selector);
    }),
    fill: vi.fn(async (value: string) => {
      handles.fills.push({ selector, value });
    }),
    ariaSnapshot: vi.fn(async () => '- button "OK"'),
  };
  return loc;
}

vi.mock('playwright', () => {
  return {
    chromium: {
      launch: vi.fn(async () => ({
        newContext: vi.fn(async () => ({
          newPage: vi.fn(async () => handles.page),
          close: vi.fn(async () => undefined),
        })),
        close: vi.fn(async () => undefined),
      })),
    },
  };
});

import { explore } from '../stages/index.ts';

async function makeOutDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'explore-test-'));
}

beforeEach(() => {
  chatMock.mockReset();

  const page: FakePage = {
    goto: vi.fn(async (url: string) => {
      handles.navigations.push(url);
    }),
    locator: vi.fn((sel: string) => makeLocator(sel) as unknown as never),
    mouse: { wheel: vi.fn(async () => undefined) },
    waitForTimeout: vi.fn(async () => undefined),
    url: () => handles?.navigations.at(-1) ?? 'about:blank',
    title: async () => 'Mock Page',
  };
  handles = {
    page,
    selectorBehavior: new Map(),
    clicks: [],
    fills: [],
    navigations: [],
  };
});

function llmReply(...turns: object[]): void {
  for (const t of turns) chatMock.mockResolvedValueOnce(JSON.stringify(t));
}

describe('explore', () => {
  it('executes navigate -> click -> finish and persists verified steps', async () => {
    llmReply(
      {
        thought: 'open the site',
        narration: 'Opening the site.',
        action: { kind: 'navigate', url: 'https://example.com' },
      },
      {
        thought: 'click the button',
        narration: 'Clicking the OK button.',
        action: { kind: 'click', selector: 'role=button[name=ok]' },
      },
      { thought: 'done', narration: '', action: { kind: 'finish' } }
    );

    const outDir = await makeOutDir();
    const result = await explore('do a thing', 'https://example.com', outDir);

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]).toMatchObject({
      id: 1,
      action: 'navigate',
      input: 'https://example.com',
      narration: 'Opening the site.',
    });
    expect(result.steps[1]).toMatchObject({
      id: 2,
      action: 'click',
      selector: 'role=button[name=ok]',
      narration: 'Clicking the OK button.',
    });
    expect(handles.navigations).toEqual(['https://example.com']);
    expect(handles.clicks).toEqual(['role=button[name=ok]']);

    const saved = JSON.parse(await fs.readFile(path.join(outDir, 'explore.json'), 'utf8'));
    expect(saved.steps).toHaveLength(2);
  });

  it('captures type actions with the input text', async () => {
    llmReply(
      {
        narration: 'Typing email.',
        action: { kind: 'type', selector: '#email', text: 'a@b.co' },
      },
      { action: { kind: 'finish' } }
    );

    const outDir = await makeOutDir();
    const result = await explore('type something', 'https://example.com', outDir);

    expect(result.steps[0]).toMatchObject({
      action: 'type',
      selector: '#email',
      input: 'a@b.co',
    });
    expect(handles.fills).toEqual([{ selector: '#email', value: 'a@b.co' }]);
  });

  it('captures wait actions with the millisecond value as input string', async () => {
    llmReply(
      { narration: 'Waiting briefly.', action: { kind: 'wait', ms: 750 } },
      { action: { kind: 'finish' } }
    );

    const outDir = await makeOutDir();
    const result = await explore('wait', 'https://example.com', outDir);

    expect(result.steps[0]).toMatchObject({ action: 'wait', input: '750' });
    expect(handles.page.waitForTimeout).toHaveBeenCalledWith(750);
  });

  it('skips turns without narration but still executes the action', async () => {
    llmReply(
      // No narration -> not recorded as a step but still executed.
      { narration: '', action: { kind: 'scroll' } },
      { narration: 'Done scrolling.', action: { kind: 'scroll' } },
      { action: { kind: 'finish' } }
    );

    const outDir = await makeOutDir();
    const result = await explore('scroll', 'https://example.com', outDir);

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.narration).toBe('Done scrolling.');
    expect(handles.page.mouse.wheel).toHaveBeenCalledTimes(2);
  });

  it('recovers from a single bad-JSON turn by re-prompting', async () => {
    chatMock.mockResolvedValueOnce('not json at all');
    llmReply(
      {
        narration: 'Recovered and navigating.',
        action: { kind: 'navigate', url: 'https://example.com' },
      },
      { action: { kind: 'finish' } }
    );

    const outDir = await makeOutDir();
    const result = await explore('go', 'https://example.com', outDir);

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.narration).toBe('Recovered and navigating.');
  });

  it('aborts after 3 consecutive invalid-JSON turns', async () => {
    chatMock
      .mockResolvedValueOnce('garbage 1')
      .mockResolvedValueOnce('garbage 2')
      .mockResolvedValueOnce('garbage 3');

    const outDir = await makeOutDir();
    await expect(explore('x', 'https://example.com', outDir)).rejects.toThrow(
      /Agent produced invalid JSON 3 times/
    );
  });

  it('lets the agent self-correct after a single action failure', async () => {
    handles.selectorBehavior.set('#bad', 'fail');
    llmReply(
      { narration: 'Try bad selector.', action: { kind: 'click', selector: '#bad' } },
      { narration: 'Try good selector.', action: { kind: 'click', selector: '#good' } },
      { action: { kind: 'finish' } }
    );

    const outDir = await makeOutDir();
    const result = await explore('click', 'https://example.com', outDir);

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ action: 'click', selector: '#good' });
    expect(handles.clicks).toEqual(['#good']);
  });

  it('aborts after 4 consecutive action failures', async () => {
    handles.selectorBehavior.set('#bad', 'fail');
    // Four bad selectors in a row -> tryAction fails four times.
    for (let i = 0; i < 5; i++) {
      llmReply({
        narration: 'click bad',
        action: { kind: 'click', selector: '#bad' },
      });
    }

    const outDir = await makeOutDir();
    await expect(explore('x', 'https://example.com', outDir)).rejects.toThrow(
      /Agent failed too many times/
    );
  });

  it('throws when the agent finishes without producing any steps', async () => {
    llmReply({ action: { kind: 'finish' } });

    const outDir = await makeOutDir();
    await expect(explore('nothing', 'https://example.com', outDir)).rejects.toThrow(
      /without recording any steps/
    );
  });

  it('returns an error to the agent when navigate has no url', async () => {
    llmReply(
      { narration: 'nav without url', action: { kind: 'navigate' } },
      {
        narration: 'nav with url',
        action: { kind: 'navigate', url: 'https://example.com' },
      },
      { action: { kind: 'finish' } }
    );

    const outDir = await makeOutDir();
    const result = await explore('go', 'https://example.com', outDir);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.input).toBe('https://example.com');
  });

  it('injects the configured language into the system prompt', async () => {
    llmReply({ action: { kind: 'finish' } });

    // No steps recorded -> exploration will throw, but we only care about
    // what the system prompt looked like on the first chat call.
    const outDir = await makeOutDir();
    await explore('x', 'https://example.com', outDir, 'Turkish').catch(() => undefined);

    const firstCall = chatMock.mock.calls[0]?.[0] as { system: string };
    expect(firstCall.system).toMatch(/Turkish/);
  });
});
