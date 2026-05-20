# AutoDemo

> Generate tutorial videos from a single text prompt

[![Node.js](https://img.shields.io/badge/Node.js->=20-3c873a?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?style=flat-square)](https://www.typescriptlang.org)
[![Playwright](https://img.shields.io/badge/Playwright-1.48-2ead33?style=flat-square)](https://playwright.dev)

[Features](#features) • [How It Works](#how-it-works) • [Prerequisites](#prerequisites) • [Getting Started](#getting-started) • [Usage](#usage) • [Configuration](#configuration)

## Demo

The video below was generated with a single command (`pnpm dev`) using these inputs:

| Prompt   | "Wikipedia'da örnek bir arama nasıl yapılır?" |
| -------- | --------------------------------------------- |
| URL      | <https://wikipedia.org/>                      |
| Language | Turkish                                       |
| Voice    | Nova (friendly, upbeat)                       |

<!-- markdownlint-disable MD033 -->

<video src="https://github.com/user-attachments/assets/57d53c63-7b1c-49a5-ac51-63ff2e88507e" controls width="100%"></video>

<!-- markdownlint-enable MD033 -->

An AI-powered CLI tool that turns a plain-text task description into a fully narrated 1080p tutorial video. Describe what you want to demonstrate on a website, pick a language and voice, and the tool handles browser automation, screen recording, voice-over synthesis, and final video composition — all without manual editing.

## Features

- **Prompt-driven** — Describe the task in natural language; an AI agent figures out the clicks, scrolls, and inputs
- **Multi-language narration** — Generate voice-overs in 10 languages including English, Turkish, Spanish, French, German, Japanese, and more
- **Multiple voices** — Choose from 6 distinct TTS voices (Alloy, Echo, Fable, Onyx, Nova, Shimmer)
- **Verified automation** — The AI agent validates every selector in a live browser before recording, eliminating flaky playback
- **Production-quality output** — 1080p, 30 fps, loudness-normalized MP4 with synced narration
- **Interactive CLI** — Guided prompts with confirmation before execution

## How It Works

The pipeline runs in four sequential stages:

```text
┌──────────┐     ┌─────┐     ┌────────┐     ┌─────────┐
│  Explore │ ──▶ │ TTS │ ──▶ │ Record │ ──▶ │ Compose │
└──────────┘     └─────┘     └────────┘     └─────────┘
```

1. **Explore** — An AI agent opens the target site in a headless browser, decides actions turn-by-turn, and produces verified steps with narration text
2. **TTS** — Each step's narration is synthesized into an MP3 clip via OpenAI-compatible TTS
3. **Record** — Steps are replayed in a fresh browser session with video capture; each frame is held until its narration finishes
4. **Compose** — ffmpeg merges the video with time-aligned audio clips into a final MP4

## Prerequisites

| Requirement                                 | Purpose                |
| ------------------------------------------- | ---------------------- |
| [Node.js](https://nodejs.org) >= 20         | Runtime                |
| [pnpm](https://pnpm.io)                     | Package manager        |
| [ffmpeg](https://ffmpeg.org) + ffprobe      | Video/audio processing |
| [OpenRouter](https://openrouter.ai) API key | LLM and TTS access     |

> [!NOTE]
> Chromium is installed automatically via Playwright during `postinstall`.

## Getting Started

```bash
# Clone the repository
git clone https://github.com/codewitheren/auto-demo.git
cd auto-demo

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY
```

## Usage

```bash
# Development mode
pnpm dev

# Or build and run
pnpm build
pnpm start
```

The CLI will guide you through:

1. **Task description** — What you want to demonstrate (e.g., _"Show how to create a new pen on CodePen"_)
2. **Target URL** — The website to record
3. **Language** — Narration language
4. **Voice** — TTS voice selection
5. **Output directory** — Where to save the result
6. **Confirm** — Review and start

Output is saved to `./out/<timestamp>/final.mp4` by default.

### Example

```text
$ pnpm dev

┌  🎬 AutoDemo
│
◆  What do you want to do?
│  Show how to create a new repository on GitHub
│
◆  Target website URL?
│  https://github.com
│
◆  Narration language
│  English
│
◆  Voice
│  Nova (friendly, upbeat)
│
◆  Output directory
│  ./out
│
◇  Run Show how to create a new repository on GitHub on https://github.com?
│  Yes
│
●  Output: ./out/2026-05-11T22-14-04-262Z
│
◇  Exploration complete — 11 steps verified
│
◇  Narration complete — 11 clips (41s)
│
◇  Recording complete — 46s video
│
◇  Composition complete — final.mp4
│
◇  Done! ──────────────────────────────────────────────────╮
│                                                          │
│  ✔ Video: ./out/2026-05-11T22-14-04-262Z/final.mp4       │
│                                                          │
│  To play:                                                │
│    open "./out/2026-05-11T22-14-04-262Z/final.mp4"       │
│                                                          │
├──────────────────────────────────────────────────────────╯
│
└  Video created successfully! 🎉
```

## Configuration

Environment variables (set in `.env`):

| Variable             | Default                             | Description                           |
| -------------------- | ----------------------------------- | ------------------------------------- |
| `OPENROUTER_API_KEY` | —                                   | **Required.** Your OpenRouter API key |
| `LLM_MODEL`          | `anthropic/claude-sonnet-4-5`       | Model used for the exploration agent  |
| `TTS_MODEL`          | `openai/gpt-4o-mini-tts-2025-12-15` | Model used for text-to-speech         |
| `TTS_VOICE`          | `alloy`                             | Default voice preset                  |
| `TTS_LANG`           | `English`                           | Default narration language            |

## Scripts

| Command             | Description                       |
| ------------------- | --------------------------------- |
| `pnpm dev`          | Run in development mode (tsx)     |
| `pnpm build`        | Compile TypeScript to `dist/`     |
| `pnpm start`        | Run compiled CLI                  |
| `pnpm test`         | Run the unit test suite (Vitest)  |
| `pnpm test:watch`   | Run tests in watch mode           |
| `pnpm typecheck`    | Type-check without emitting       |
| `pnpm lint`         | Run ESLint                        |
| `pnpm lint:fix`     | Auto-fix lint issues              |
| `pnpm format`       | Format sources with Prettier      |
| `pnpm format:check` | Verify formatting without writing |
| `pnpm check`        | Typecheck + lint + format check   |
