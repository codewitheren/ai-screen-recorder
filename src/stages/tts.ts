import OpenAI from 'openai';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execa } from 'execa';
import type { AudioClip, ExploreResult } from '../types.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const TTS_MODEL = process.env.TTS_MODEL ?? 'openai/gpt-4o-mini-tts-2025-12-15';

// Singleton client — initialized on first use.
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
    client = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL });
  }
  return client;
}

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

async function ttsToFile(text: string, voice: string, outPath: string, retries = 2): Promise<void> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await getClient().audio.speech.create({
        model: TTS_MODEL,
        voice: voice,
        input: text,
        response_format: 'mp3',
      });
      const buf = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(outPath, buf);
      return;
    } catch (err) {
      const isLast = attempt === retries;
      if (isLast) throw err;
      const waitMs = 1000 * (attempt + 1);
      console.error(`  TTS attempt ${attempt + 1} failed, retrying in ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}
