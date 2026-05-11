import { z } from 'zod';

// --- Shared primitives ---

export const StepActionSchema = z.enum(['navigate', 'click', 'type', 'wait', 'scroll']);
export type StepAction = z.infer<typeof StepActionSchema>;

// --- Explore stage ---

/**
 * A step verified by the explore agent: executed in a live browser, so the
 * selector (when present) is guaranteed to resolve on the target page.
 */
export const VerifiedStepSchema = z.object({
  id: z.number().int().positive(),
  action: StepActionSchema,
  selector: z.string().nullish(), // Playwright selector; required for click/type
  input: z.string().nullish(),    // URL (navigate), text (type), or ms (wait)
  narration: z.string().min(1),   // Voice-over line written at decision time
});
export type VerifiedStep = z.infer<typeof VerifiedStepSchema>;

export const ExploreResultSchema = z.object({
  title: z.string(),
  steps: z.array(VerifiedStepSchema).min(1),
});
export type ExploreResult = z.infer<typeof ExploreResultSchema>;

/**
 * The LLM's response for a single agent turn: reasoning, narration, and the
 * next browser action to execute.
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
  readonly startMs: number; // ms since recording started
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

// AudioSegment extends AudioClip with the video-aligned start time.
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
