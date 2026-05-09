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

export type TimelineEntry = {
  stepId: number;
  startMs: number; // ms since recording started
  endMs: number;
};

export type RecordResult = {
  videoPath: string;
  timeline: TimelineEntry[];
};

// --- TTS / Compose stages ---

export type AudioClip = {
  stepId: number;
  durationMs: number;
  audioPath: string;
};

// AudioSegment extends AudioClip with the video-aligned start time.
export type AudioSegment = AudioClip & {
  startMs: number;
};

// --- Pipeline ---

export type RunContext = {
  prompt: string;
  url: string;
  voice: string;
  language: string;
  outDir: string;
};
