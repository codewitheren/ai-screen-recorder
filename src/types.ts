// types.ts
//
// Shared type definitions and Zod schemas for the pipeline.
// All stage inputs/outputs are defined here to keep contracts explicit
// and enable runtime validation of LLM responses.

import { z } from 'zod';

// --- Shared primitives ---

export const StepActionSchema = z.enum(['navigate', 'click', 'type', 'wait', 'scroll']);
export type StepAction = z.infer<typeof StepActionSchema>;

// --- Explore stage ---

/**
 * A verified browser step. The selector is guaranteed to resolve
 * on the target page because it was tested during exploration.
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
 * LLM response shape for a single agent turn.
 * Validated at runtime because LLM output is untrusted.
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

// AudioSegment adds a video-aligned start time for ffmpeg composition.
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
  readonly testMode?: boolean;
}
