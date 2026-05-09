#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { runPipeline } from './pipeline.js';

const program = new Command();

program
  .name('ai-screen-recorder')
  .description('AI agent that records a narrated video of any task on a website')
  .argument('<prompt>', 'what to do on the target website')
  .requiredOption('-u, --url <url>', 'target website URL')
  .option('-v, --voice <voice>', 'TTS voice', process.env.TTS_VOICE ?? 'alloy')
  .option('-l, --lang <language>', 'narration language (e.g. English, Turkish, Spanish)', process.env.TTS_LANG ?? 'English')
  .option('-o, --out <dir>', 'output directory root', './out')
  .action(async (prompt: string, opts: { url: string; voice: string; lang: string; out: string }) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = path.resolve(opts.out, stamp);

    try {
      const finalPath = await runPipeline({
        prompt,
        url: opts.url,
        voice: opts.voice,
        language: opts.lang,
        outDir,
      });
      console.log('');
      console.log(chalk.cyan(`→ ${finalPath}`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n✗ failed: ${msg}`));
      process.exit(1);
    }
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
