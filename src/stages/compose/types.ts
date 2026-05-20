import type { AudioClip } from '../tts/types.ts';

/**
 * An `AudioClip` enriched with its video-aligned start offset, used by
 * the compose stage to delay each clip into the right ffmpeg slot.
 */
export interface AudioSegment extends AudioClip {
  readonly startMs: number;
}

export type ComposeOptions = Record<string, never>;
