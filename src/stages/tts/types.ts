export interface AudioClip {
  readonly stepId: number;
  readonly durationMs: number;
  readonly audioPath: string;
}

export type TtsProgress =
  | { type: 'start'; total: number; concurrency: number }
  | { type: 'clip-start'; stepId: number; narration: string }
  | {
      type: 'clip-done';
      stepId: number;
      durationMs: number;
      completed: number;
      total: number;
      etaMs: number | null;
    }
  | { type: 'retry'; stepId: number; attempt: number; waitMs: number; error: string }
  | { type: 'finished'; total: number; totalDurationMs: number };

export interface TtsOptions {
  onProgress?: (event: TtsProgress) => void;
}
