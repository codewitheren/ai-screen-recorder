// preflight.ts
//
// Validates runtime prerequisites before the pipeline does any real work,
// so the user sees one consolidated error message instead of a cryptic
// failure deep inside ffmpeg, Playwright, or the OpenAI client.

import fs from 'node:fs';
import { execa } from 'execa';
import { chromium } from 'playwright';

/**
 * Verifies system-level prerequisites: Node.js >= 20, ffmpeg and ffprobe
 * on PATH, and an installed Playwright Chromium binary.
 *
 * Collects every missing requirement before throwing so the user can fix
 * them all in one pass rather than discovering them one at a time.
 */
export async function preflightSystem(): Promise<void> {
  const errors: string[] = [];

  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  if (!Number.isFinite(major) || major < 20) {
    errors.push(
      `Node.js >= 20 is required (current: ${process.versions.node}). Install from https://nodejs.org`
    );
  }

  const [ffmpegOk, ffprobeOk] = await Promise.all([hasBinary('ffmpeg'), hasBinary('ffprobe')]);
  if (!ffmpegOk) {
    errors.push("'ffmpeg' not found on PATH. Install it: https://ffmpeg.org/download.html");
  }
  if (!ffprobeOk) {
    errors.push("'ffprobe' not found on PATH (usually ships with ffmpeg).");
  }

  try {
    const exe = chromium.executablePath();
    if (!exe || !fs.existsSync(exe)) {
      errors.push(
        "Playwright Chromium is not installed. Run: 'pnpm exec playwright install chromium'"
      );
    }
  } catch {
    errors.push(
      "Playwright Chromium is not installed. Run: 'pnpm exec playwright install chromium'"
    );
  }

  throwIfAny(errors);
}

/**
 * Verifies that `OPENROUTER_API_KEY` is set in the environment.
 * Kept separate from `preflightSystem` so unit tests can stub the API
 * key without booting a browser.
 */
export function preflightApiKey(): void {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throwIfAny([
      'OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key from https://openrouter.ai',
    ]);
  }
}

function throwIfAny(errors: string[]): void {
  if (errors.length > 0) {
    const list = errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n');
    throw new Error(`Missing prerequisites:\n${list}`);
  }
}

async function hasBinary(name: string): Promise<boolean> {
  try {
    await execa(name, ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
