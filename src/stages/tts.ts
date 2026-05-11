import path from 'node:path';
import fs from 'node:fs/promises';
import { execa } from 'execa';
import { getOpenAIClient } from '../openai-client.js';
import type { AudioClip, ExploreResult } from '../types.js';

const TTS_MODEL = process.env.TTS_MODEL ?? 'openai/gpt-4o-mini-tts-2025-12-15';
const MAX_RETRIES = 2;

/**
 * Synthesizes a narration MP3 for each step in the explore result.
 * Runs sequentially to avoid TTS rate-limit errors on OpenRouter.
 */
export async function tts(
  plan: ExploreResult,
  voice: string,
  outDir: string,
): Promise<AudioClip[]> {
  const audioDir = path.join(outDir, 'audio');
  await fs.mkdir(audioDir, { recursive: true });

  const clips: AudioClip[] = [];
  for (const step of plan.steps) {
    const mp3Path = path.join(audioDir, `seg_${step.id}.mp3`);
    await ttsToFile(step.narration, voice, mp3Path);
    const durationMs = await getAudioDurationMs(mp3Path);
    clips.push({ stepId: step.id, durationMs, audioPath: mp3Path });
  }

  return clips;
}

async function getAudioDurationMs(filePath: string): Promise<number> {
  const { stdout } = await execa('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    filePath,
  ]);
  return Math.ceil(parseFloat(stdout.trim()) * 1000);
}

async function ttsToFile(text: string, voice: string, outPath: string): Promise<void> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await getOpenAIClient().audio.speech.create({
        model: TTS_MODEL,
        voice: voice,
        input: text,
        response_format: 'mp3',
      });
      const buf = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(outPath, buf);
      return;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      const waitMs = 1000 * (attempt + 1);
      console.error(`  TTS attempt ${attempt + 1} failed, retrying in ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}
