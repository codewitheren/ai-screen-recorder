// types.ts
//
// Shared type definitions and Zod schemas for the pipeline.
//
// Every cross-stage contract lives here so consumers can import a single
// module. Schemas double as runtime validators for untrusted input
// (LLM responses, persisted JSON) and as the source of truth for the
// matching TypeScript types via `z.infer`.

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

// --- Record stage ---

export interface TimelineEntry {
  readonly stepId: number;
  readonly startMs: number;
  readonly endMs: number;
}

export interface RecordResult {
  readonly videoPath: string;
  readonly timeline: readonly TimelineEntry[];
}

// --- TTS / Compose stages ---

export interface AudioClip {
  readonly stepId: number;
  readonly durationMs: number;
  readonly audioPath: string;
}

/**
 * An `AudioClip` enriched with its video-aligned start offset, used by
 * the compose stage to delay each clip into the right ffmpeg slot.
 */
export interface AudioSegment extends AudioClip {
  readonly startMs: number;
}

// --- Pipeline ---

export interface RunContext {
  readonly prompt: string;
  readonly url: string;
  readonly voice: string;
  readonly language: string;
  readonly outDir: string;
}
