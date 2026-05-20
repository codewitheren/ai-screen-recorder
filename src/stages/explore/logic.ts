import type { Page } from 'playwright';
import type { AgentTurn, VerifiedStep } from './types.ts';

export type ActionResult = { ok: true } | { ok: false; error: string };

const ACTION_TIMEOUT_MS = 7000;
const SNAPSHOT_CHARS = 6000;

// Maps an `AgentTurn` to a recordable step. Returns null for turns we
// shouldn't replay later (no narration, or the terminal `finish`).
export function toVerifiedStep(id: number, t: AgentTurn): VerifiedStep | null {
  const narration = t.narration.trim();
  if (!narration) return null;

  const { kind } = t.action;

  switch (kind) {
    case 'navigate':
      return { id, action: kind, input: t.action.url ?? null, selector: null, narration };
    case 'click':
      return { id, action: kind, selector: t.action.selector ?? null, input: null, narration };
    case 'type':
      return {
        id,
        action: kind,
        selector: t.action.selector ?? null,
        input: t.action.text ?? null,
        narration,
      };
    case 'scroll':
      return { id, action: kind, selector: null, input: null, narration };
    case 'wait':
      return {
        id,
        action: kind,
        selector: null,
        input: t.action.ms != null ? String(t.action.ms) : null,
        narration,
      };
    case 'finish':
      return null;
  }
}

// Executes one browser action. On failure, returns the error message so
// the agent can read it on the next turn and try a different approach.
export async function tryAction(page: Page, t: AgentTurn): Promise<ActionResult> {
  const a = t.action;
  try {
    switch (a.kind) {
      case 'navigate': {
        if (!a.url) return { ok: false, error: 'navigate requires action.url' };
        await page.goto(a.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        return { ok: true };
      }
      case 'click': {
        if (!a.selector) return { ok: false, error: 'click requires action.selector' };
        const loc = page.locator(a.selector).first();
        await loc.waitFor({ state: 'visible', timeout: ACTION_TIMEOUT_MS });
        await loc.click({ timeout: ACTION_TIMEOUT_MS });
        return { ok: true };
      }
      case 'type': {
        if (!a.selector) return { ok: false, error: 'type requires action.selector' };
        const loc = page.locator(a.selector).first();
        await loc.waitFor({ state: 'visible', timeout: ACTION_TIMEOUT_MS });
        await loc.fill(a.text ?? '', { timeout: ACTION_TIMEOUT_MS });
        return { ok: true };
      }
      case 'scroll': {
        await page.mouse.wheel(0, 600);
        return { ok: true };
      }
      case 'wait': {
        await page.waitForTimeout(Math.min(3000, Math.max(0, a.ms ?? 1000)));
        return { ok: true };
      }
      case 'finish':
        return { ok: true };
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// Compact page summary for the prompt: URL, title, and accessibility tree.
// Truncated to `SNAPSHOT_CHARS` to keep token usage bounded on big pages.
export async function snapshot(page: Page): Promise<string> {
  const url = page.url();
  let title = '';
  try {
    title = await page.title();
  } catch {
    /* ignore */
  }

  let tree;
  try {
    tree = await page.locator('body').ariaSnapshot();
  } catch {
    tree = '(aria snapshot unavailable)';
  }

  if (tree.length > SNAPSHOT_CHARS) {
    tree = tree.slice(0, SNAPSHOT_CHARS) + '\n... (truncated)';
  }
  return `URL: ${url}\nTITLE: ${title}\nA11Y:\n${tree}`;
}
