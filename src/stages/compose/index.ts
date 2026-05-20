import { execa } from 'execa';
import path from 'node:path';
import { buildAudioFilter } from './logic.ts';
import type { AudioSegment } from './types.ts';

export * from './types.ts';

/**
 * Encodes `videoPath` together with `audios` into `outDir/final.mp4`.
 *
 * Side effects: spawns ffmpeg and writes the output file. Returns the
 * absolute path of the produced MP4.
 */
export async function compose(
  videoPath: string,
  audios: readonly AudioSegment[],
  outDir: string
): Promise<string> {
  const finalPath = path.join(outDir, 'final.mp4');
  const sorted = [...audios].sort((a, b) => a.startMs - b.startMs);

  const inputs: string[] = ['-i', videoPath];
  for (const a of sorted) inputs.push('-i', a.audioPath);

  const filter = buildAudioFilter(sorted);

  const args: string[] = [
    '-y',
    ...inputs,
    ...(filter
      ? ['-filter_complex', filter, '-map', '0:v:0', '-map', '[aout]']
      : ['-map', '0:v:0']),
    '-c:v',
    'libx264',
    // `fast` gives noticeably better compression than `veryfast` for a
    // small encode-time cost. CRF 24 is visually indistinguishable from
    // 20 on screen recordings and yields ~30% smaller files.
    '-preset',
    'fast',
    '-crf',
    '24',
    '-r',
    '30',
    '-vf',
    'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    finalPath,
  ];

  await execa('ffmpeg', args, { stdio: 'pipe' });
  return finalPath;
}
