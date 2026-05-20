import type { AudioSegment } from './types.ts';

/**
 * Builds the `-filter_complex` graph that delays each audio clip to its
 * step's start offset, mixes them, and applies loudness normalization.
 *
 * Exported so the unit tests can assert the generated graph without
 * spawning ffmpeg. Returns an empty string when there are no segments.
 */
export function buildAudioFilter(sorted: readonly AudioSegment[]): string {
  if (sorted.length === 0) return '';

  const delayParts: string[] = [];
  const mixLabels: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const segment = sorted[i];
    if (!segment) continue;
    const delayMs = Math.max(0, segment.startMs);
    delayParts.push(`[${i + 1}:a]adelay=${delayMs}:all=1[a${i}]`);
    mixLabels.push(`[a${i}]`);
  }

  return [
    ...delayParts,
    `${mixLabels.join('')}amix=inputs=${sorted.length}:dropout_transition=0:normalize=0[mixed]`,
    `[mixed]loudnorm[aout]`,
  ].join(';');
}
