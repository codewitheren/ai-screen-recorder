import type { VerifiedStep } from '../explore/types.ts';

export interface TimelineEntry {
  readonly stepId: number;
  readonly startMs: number;
  readonly endMs: number;
}

export interface RecordResult {
  readonly videoPath: string;
  readonly timeline: readonly TimelineEntry[];
}

export type RecordProgress =
  | { type: 'start'; total: number; estimatedTotalMs: number }
  | {
      type: 'step-start';
      index: number;
      total: number;
      stepId: number;
      action: VerifiedStep['action'];
      selector: string | null;
      input: string | null;
      narration: string;
      remainingEstimateMs: number;
    }
  | {
      type: 'step-done';
      index: number;
      total: number;
      stepId: number;
      elapsedMs: number;
    }
  | { type: 'finished'; total: number; totalDurationMs: number };

export interface RecordOptions {
  onProgress?: (event: RecordProgress) => void;
}
