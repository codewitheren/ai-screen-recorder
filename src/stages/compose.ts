import { execa } from 'execa';
import path from 'node:path';
import type { AudioSegment } from '../types.js';

/**
 * Merges the recorded WebM video with per-step MP3 narrations, each offset
 * to its step's start time. Outputs a loudness-normalized 1080p MP4.
 */
export async function compose(
  videoPath: string,
  audios: readonly AudioSegment[],
  outDir: string,
): Promise<string> {
  const finalPath = path.join(outDir, 'final.mp4');
  const sorted = [...audios].sort((a, b) => a.startMs - b.startMs);

  // ffmpeg inputs: video first, then one audio file per step.
  const inputs: string[] = ['-i', videoPath];
  for (const a of sorted) inputs.push('-i', a.audioPath);

  // Build filter_complex: delay each audio stream to its step start, then mix.
  const filter = buildAudioFilter(sorted);

  const args: string[] = [
    '-y',
    ...inputs,
    ...(filter
      ? ['-filter_complex', filter, '-map', '0:v:0', '-map', '[aout]']
      : ['-map', '0:v:0']
    ),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-r', '30',
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    finalPath,
  ];

  await execa('ffmpeg', args, { stdio: 'pipe' });
  return finalPath;
}

function buildAudioFilter(sorted: readonly AudioSegment[]): string {
  if (sorted.length === 0) return '';

  const delayParts: string[] = [];
  const mixLabels: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const segment = sorted[i];
    if (!segment) continue;
    const delayMs = Math.max(0, segment.startMs);
    delayParts.push(`[${i + 1}:a]adelay=${delayMs}|${delayMs}[a${i}]`);
    mixLabels.push(`[a${i}]`);
  }

  return [
    ...delayParts,
    `${mixLabels.join('')}amix=inputs=${sorted.length}:dropout_transition=0:normalize=0[mixed]`,
    `[mixed]loudnorm[aout]`,
  ].join(';');
}
