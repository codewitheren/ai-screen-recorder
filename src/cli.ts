#!/usr/bin/env node
// cli.ts
//
// Interactive entry point. Collects task parameters via @clack/prompts,
// validates inputs, then hands off to the pipeline orchestrator.

import 'dotenv/config';
import path from 'node:path';
import * as p from '@clack/prompts';
import color from 'picocolors';
import { runPipeline } from './pipeline.js';

const VOICES = [
  { value: 'alloy', label: 'Alloy', hint: 'neutral, balanced' },
  { value: 'echo', label: 'Echo', hint: 'warm, confident' },
  { value: 'fable', label: 'Fable', hint: 'expressive, British' },
  { value: 'onyx', label: 'Onyx', hint: 'deep, authoritative' },
  { value: 'nova', label: 'Nova', hint: 'friendly, upbeat' },
  { value: 'shimmer', label: 'Shimmer', hint: 'clear, gentle' },
] as const;

const LANGUAGES = [
  { value: 'English', label: 'English' },
  { value: 'Turkish', label: 'Türkçe' },
  { value: 'Spanish', label: 'Español' },
  { value: 'French', label: 'Français' },
  { value: 'German', label: 'Deutsch' },
  { value: 'Japanese', label: '日本語' },
  { value: 'Chinese', label: '中文' },
  { value: 'Korean', label: '한국어' },
  { value: 'Portuguese', label: 'Português' },
  { value: 'Arabic', label: 'العربية' },
] as const;

async function main(): Promise<void> {
  p.intro(color.bgCyan(color.black(' 🎬 AutoDemo ')));

  const config = await p.group(
    {
      prompt: () =>
        p.text({
          message: 'What do you want to do?',
          placeholder: 'Show how to create a new pen on CodePen',
          validate: (value) => {
            if (!value?.trim()) return 'Please enter a task description';
          },
        }),

      url: () =>
        p.text({
          message: 'Target website URL?',
          placeholder: 'https://codepen.io',
          validate: (value) => {
            if (!value?.trim()) return 'URL is required';
            try {
              new URL(value);
            } catch {
              return 'Enter a valid URL (https://...)';
            }
          },
        }),

      language: () =>
        p.select({
          message: 'Narration language',
          initialValue: process.env.TTS_LANG ?? 'English',
          options: [...LANGUAGES],
        }),

      voice: () =>
        p.select({
          message: 'Voice',
          initialValue: process.env.TTS_VOICE ?? 'alloy',
          options: [...VOICES],
        }),

      outDir: () =>
        p.text({
          message: 'Output directory',
          defaultValue: './out',
          placeholder: './out',
        }),

      testMode: () =>
        p.confirm({
          message: `Enable ${color.yellow('test mode')}? (no AI credits used)`,
          initialValue: false,
        }),

      confirm: ({ results }) => {
        const url = results.url ?? '';
        const prompt = results.prompt ?? '';
        const truncated = prompt.length > 50 ? `${prompt.slice(0, 50)}...` : prompt;
        return p.confirm({
          message: `Run ${color.cyan(truncated)} on ${color.cyan(url)}?`,
          initialValue: true,
        });
      },
    },
    {
      onCancel: () => {
        p.cancel('Operation cancelled.');
        process.exit(0);
      },
    }
  );

  if (!config.confirm) {
    p.cancel('Operation cancelled.');
    process.exit(0);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(config.outDir ?? './out', stamp);

  p.log.info(`Output: ${color.dim(outDir)}`);

  try {
    const finalPath = await runPipeline({
      prompt: config.prompt,
      url: config.url,
      voice: config.voice as string,
      language: config.language as string,
      outDir,
      testMode: config.testMode ?? false,
    });

    p.note(
      [
        `${color.green('✔')} Video: ${color.cyan(finalPath)}`,
        '',
        `${color.dim('To play:')}`,
        ` open "${finalPath}"`,
      ].join('\n'),
      'Done!'
    );

    p.outro(color.green('Video created successfully! 🎉'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(msg);
    p.outro(color.red('Pipeline failed.'));
    process.exit(1);
  }
}

main().catch((err) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
