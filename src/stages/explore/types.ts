import { z } from 'zod';

// --- Shared primitives ---

export const StepActionSchema = z.enum(['navigate', 'click', 'type', 'wait', 'scroll']);
export type StepAction = z.infer<typeof StepActionSchema>;

// --- Explore stage ---

/**
 * A browser step whose selector has been exercised successfully during
 * exploration, so the record stage can replay it deterministically.
 */
export const VerifiedStepSchema = z.object({
  id: z.number().int().positive(),
  action: StepActionSchema,
  selector: z.string().nullish(),
  input: z.string().nullish(),
  narration: z.string().min(1),
});
export type VerifiedStep = z.infer<typeof VerifiedStepSchema>;

export const ExploreResultSchema = z.object({
  title: z.string(),
  steps: z.array(VerifiedStepSchema).min(1),
});
export type ExploreResult = z.infer<typeof ExploreResultSchema>;

/**
 * One decision from the explore agent.
 *
 * Validated at runtime because LLM output is untrusted: models occasionally
 * omit fields or invent action kinds. `thought` and `narration` default to
 * empty so a model that emits only `action` still parses.
 */
export const AgentTurnSchema = z.object({
  thought: z.string().default(''),
  narration: z.string().default(''),
  action: z.object({
    kind: z.enum(['navigate', 'click', 'type', 'scroll', 'wait', 'finish']),
    selector: z.string().nullish(),
    text: z.string().nullish(),
    url: z.string().nullish(),
    ms: z.number().int().nonnegative().nullish(),
  }),
});
export type AgentTurn = z.infer<typeof AgentTurnSchema>;

export type ExploreProgress =
  | { type: 'turn-start'; turn: number; maxTurns: number }
  | {
      type: 'decision';
      turn: number;
      maxTurns: number;
      thought: string;
      narration: string;
      action: {
        kind: AgentTurn['action']['kind'];
        selector?: string | null;
        url?: string | null;
        text?: string | null;
        ms?: number | null;
      };
    }
  | { type: 'action-ok'; turn: number }
  | { type: 'action-error'; turn: number; error: string }
  | { type: 'invalid-json'; turn: number; error: string }
  | { type: 'step-recorded'; stepId: number; totalSoFar: number; maxTurns: number }
  | { type: 'finished'; steps: number };

export interface ExploreOptions {
  onProgress?: (event: ExploreProgress) => void;
}
