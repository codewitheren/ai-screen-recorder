import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { chat, extractJson } from '../../lib/llm.ts';
import type { ChatMessage } from '../../lib/llm.ts';
import { AgentTurnSchema } from './types.ts';
import type { AgentTurn, ExploreResult, VerifiedStep } from './types.ts';
import { buildExploreSystemPrompt } from './prompt.ts';
import { toVerifiedStep, tryAction, snapshot } from './logic.ts';
import type { ExploreOptions } from './types.ts';

const MAX_TURNS = Math.max(1, parseInt(process.env.EXPLORE_MAX_TURNS ?? '15', 10) || 15);

export * from './types.ts';

export async function explore(
  prompt: string,
  url: string,
  outDir: string,
  language = 'English',
  options: ExploreOptions = {}
): Promise<ExploreResult> {
  const onProgress = options.onProgress ?? (() => undefined);
  const SYSTEM = buildExploreSystemPrompt(language);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const history: ChatMessage[] = [];
  const steps: VerifiedStep[] = [];
  let stepId = 1;
  let title = prompt;

  // Seed the conversation with the goal and the start URL. The model's
  // first action should normally be `navigate`.
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
      onProgress({ type: 'turn-start', turn: turn + 1, maxTurns: MAX_TURNS });
      const raw = await chat({ system: SYSTEM, messages: history });
      history.push({ role: 'assistant', content: raw });

      // Parse and validate the model's JSON. Schema failures count toward
      // the consecutive-error budget so a stuck model eventually aborts.
      let decision: AgentTurn;
      try {
        decision = AgentTurnSchema.parse(JSON.parse(extractJson(raw)));
      } catch (err) {
        consecutiveErrors++;
        onProgress({
          type: 'invalid-json',
          turn: turn + 1,
          error: (err as Error).message,
        });
        if (consecutiveErrors >= 3) {
          throw new Error(`Agent produced invalid JSON 3 times: ${(err as Error).message}`, {
            cause: err,
          });
        }
        history.push({
          role: 'user',
          content:
            'ERROR: Your last response was not valid JSON matching the schema. Reply with strict JSON only.',
        });
        continue;
      }

      onProgress({
        type: 'decision',
        turn: turn + 1,
        maxTurns: MAX_TURNS,
        thought: decision.thought,
        narration: decision.narration,
        action: {
          kind: decision.action.kind,
          selector: decision.action.selector ?? null,
          url: decision.action.url ?? null,
          text: decision.action.text ?? null,
          ms: decision.action.ms ?? null,
        },
      });

      if (decision.action.kind === 'finish') {
        title = decision.thought?.slice(0, 80) || prompt;
        break;
      }

      // Execute the proposed action in the live browser.
      const result = await tryAction(page, decision);
      if (!result.ok) {
        consecutiveErrors++;
        onProgress({ type: 'action-error', turn: turn + 1, error: result.error });
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
      onProgress({ type: 'action-ok', turn: turn + 1 });

      // Action succeeded: persist it as a verified step and continue.
      const stored = toVerifiedStep(stepId++, decision);
      if (stored) {
        steps.push(stored);
        onProgress({
          type: 'step-recorded',
          stepId: stored.id,
          totalSoFar: steps.length,
          maxTurns: MAX_TURNS,
        });
      }

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

  onProgress({ type: 'finished', steps: steps.length });

  const result: ExploreResult = { title, steps };
  await fs.writeFile(path.join(outDir, 'explore.json'), JSON.stringify(result, null, 2));
  return result;
}
