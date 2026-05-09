import { chromium, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { chat, extractJson, type ChatMessage } from '../llm.js';
import {
  AgentTurnSchema,
  type AgentTurn,
  type ExploreResult,
  type StepAction,
  type VerifiedStep,
} from '../types.js';

const MAX_TURNS = 25;
const ACTION_TIMEOUT_MS = 7000;
const SNAPSHOT_CHARS = 6000;

function buildSystem(language: string): string {
  return `You are a browser-using AI agent. You will be shown the current page
and you must DECIDE ONE NEXT ACTION at a time to accomplish the user's goal.
After each action you will see the new page state and decide the next action,
until the goal is reached.

Rules:
- Output STRICT JSON only, no prose, no markdown fences. One object per turn.
- "narration" is one short, friendly, voice-over sentence (8-25 words) that
  describes what THIS action accomplishes for the viewer. It will be spoken
  over the recording. No greetings, no sign-offs.
- IMPORTANT: Write the "narration" field in ${language}. All narration text must
  be in ${language} regardless of the page language.
- "action.kind" must be one of: navigate, click, type, scroll, wait, finish.
- For "click" and "type", "action.selector" must be a Playwright selector
  derived from what you SEE in the snapshot. Prefer in this order:
    1. role= (e.g. role=button[name=/sign up/i])
    2. text= (e.g. text=/^Submit$/i)
    3. [data-testid=...] or other stable attributes
  Avoid brittle :nth-child or long CSS chains.
- For "type", also include "action.text" with the exact value to type.
- For "navigate", include "action.url".
- For "wait", include "action.ms" (max 3000).
- "finish" means the goal is achieved; no further actions.
- Keep total steps under 15. Be efficient.
- If the previous action failed, the user message will start with "ERROR:".
  Pick a different selector or strategy. Do not repeat the same failure.

JSON shape:
{
  "thought": "short reasoning",
  "narration": "voice-over sentence for this action (in ${language})",
  "action": {
    "kind": "navigate"|"click"|"type"|"scroll"|"wait"|"finish",
    "selector": string | null,
    "text": string | null,
    "url": string | null,
    "ms": number | null
  }
}`;
}

/**
 * Runs the explore agent: opens a headless browser, feeds page snapshots to
 * the LLM turn-by-turn, and executes each decided action immediately. Both
 * the step plan and narration text are produced in the same LLM call.
 * Returns verified steps whose selectors are known to work.
 */
export async function explore(
  prompt: string,
  url: string,
  outDir: string,
  language = 'English',
): Promise<ExploreResult> {
  const SYSTEM = buildSystem(language);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const history: ChatMessage[] = [];
  const steps: VerifiedStep[] = [];
  let stepId = 1;
  let title = prompt;

  // Seed: give the agent its goal and the blank browser state.
  history.push({
    role: 'user',
    content:
      `GOAL: ${prompt}\nSTART_URL: ${url}\n\n` +
      `The browser is open but blank. Your first action should normally be ` +
      `to navigate to START_URL. Then explore step by step. Reply with the ` +
      `JSON for your first turn now.`,
  });

  try {
    let consecutiveErrors = 0;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const raw = await chat({ system: SYSTEM, messages: history });
      history.push({ role: 'assistant', content: raw });

      // Parse and validate the agent's JSON response.
      let decision: AgentTurn;
      try {
        decision = AgentTurnSchema.parse(JSON.parse(extractJson(raw)));
      } catch (err) {
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          throw new Error(`Agent produced invalid JSON 3 times: ${(err as Error).message}`, { cause: err });
        }
        history.push({
          role: 'user',
          content: 'ERROR: Your last response was not valid JSON matching the schema. Reply with strict JSON only.',
        });
        continue;
      }

      if (decision.action.kind === 'finish') {
        title = decision.thought?.slice(0, 80) || prompt;
        break;
      }

      // Execute the action in the live browser.
      const result = await tryAction(page, decision);
      if (!result.ok) {
        consecutiveErrors++;
        if (consecutiveErrors >= 4) {
          throw new Error(`Agent failed too many times. Last error: ${result.error}`);
        }
        history.push({
          role: 'user',
          content:
            `ERROR: ${result.error}\n\n` +
            `Page state after failure:\n${await snapshot(page)}\n\n` +
            `Try a different selector or approach. Reply with the next JSON turn.`,
        });
        continue;
      }

      consecutiveErrors = 0;

      // Commit the verified step and feed the new page state to the agent.
      const stored = toVerifiedStep(stepId++, decision);
      if (stored) steps.push(stored);

      history.push({
        role: 'user',
        content:
          `OK. Action executed.\n\n` +
          `Page state:\n${await snapshot(page)}\n\n` +
          `Reply with the next JSON turn (or finish if the goal is done).`,
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  if (steps.length === 0) {
    throw new Error('Explore agent finished without recording any steps');
  }

  const result: ExploreResult = { title, steps };
  await fs.writeFile(path.join(outDir, 'explore.json'), JSON.stringify(result, null, 2));
  return result;
}

// Maps an agent turn to a VerifiedStep. Returns null if the narration is
// empty (e.g. for intermediate scroll/wait actions the agent skipped) or for
// the terminal 'finish' action.
function toVerifiedStep(id: number, t: AgentTurn): VerifiedStep | null {
  const narration = t.narration.trim();
  if (!narration) return null;

  const action = t.action.kind as StepAction;
  const a = t.action;

  switch (a.kind) {
    case 'navigate': return { id, action, input: a.url ?? null, selector: null, narration };
    case 'click':    return { id, action, selector: a.selector ?? null, input: null, narration };
    case 'type':     return { id, action, selector: a.selector ?? null, input: a.text ?? null, narration };
    case 'scroll':   return { id, action, selector: null, input: null, narration };
    case 'wait':     return { id, action, selector: null, input: a.ms != null ? String(a.ms) : null, narration };
    case 'finish':   return null;
  }
}

// Executes a single agent action in the browser. Returns ok:false on any
// failure so the caller can feed the error back to the agent.
async function tryAction(
  page: Page,
  t: AgentTurn,
): Promise<{ ok: true } | { ok: false; error: string }> {
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

// Returns a compact text representation of the current page state:
// URL, page title, and an aria snapshot of the visible content.
// Capped at SNAPSHOT_CHARS to stay within LLM context limits.
async function snapshot(page: Page): Promise<string> {
  const url = page.url();
  let title = '';
  try { title = await page.title(); } catch { /* ignore */ }

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
