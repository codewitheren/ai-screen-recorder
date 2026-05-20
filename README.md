# AutoDemo

**An AI-powered CLI tool that automatically controls a browser, records the screen, synthesizes voice-over narration, and composes fully synchronized 1080p Web/Product tutorial videos—entirely from a single text prompt.**

[![Node.js](https://img.shields.io/badge/Node.js->=20-3c873a?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?style=flat-square)](https://www.typescriptlang.org)
[![Playwright](https://img.shields.io/badge/Playwright-1.48-2ead33?style=flat-square)](https://playwright.dev)

<!-- HERO-MEDIA-START -->

![AutoDemo Hero Action](assets/hero-demo.gif)

<!-- HERO-MEDIA-END -->

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
- **Self-Correcting Exploration** — The agent has a failure budget and retry mechanisms to try alternative selectors or strategies if one fails
- **Multi-language narration** — Generate voice-overs in 10 languages including English, Turkish, Spanish, French, German, Japanese, and more
- **Multiple voices** — Choose from 6 distinct TTS voices (Alloy, Echo, Fable, Onyx, Nova, Shimmer)
- **Verified automation** — The AI agent validates every selector in a live browser before recording, eliminating flaky playback
- **Production-quality output** — 1080p, 30 fps, loudness-normalized MP4 with synced narration
- **Interactive CLI with Real-time Logs** — Beautiful step-by-step progress tracking for each stage (Explore, Narration, Record, Compose) with live time estimation and detailed visual output without console clutter

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
◇  What do you want to do?
│  How to search on Wikipedia
│
◇  Target website URL?
│  https://wikipedia.org/
│
◇  Narration language
│  English
│
◇  Voice
│  Alloy
│
◇  Output directory
│  ./out
│
◇  Run how to search on wikipedia on https://wikipedia.org/?
│  Yes
│
●  Output: ./out/2026-05-20T13-02-55-222Z
│
│
│
│   1/4  Explore — AI agent decides what to do, one action at a time
│
│  [ 1/15] navigate https://wikipedia.org/
│         🗣  We are navigating to Wikipedia's homepage, the first step for our search.
│
│  [ 2/15] click    role=textbox[name=/Search Wikipedia/i]
│         🗣  First, let's locate the search bar to type our query.
│
▲        ✗ locator.waitFor: Timeout 7000ms exceeded. — agent will retry
│
│  [ 3/15] click    role=searchbox[name='Search Wikipedia']
│         🗣  Trying a different selector to target the search field on Wikipedia's homepage.
│
│  [ 4/15] type     "science" → role=searchbox[name='Search Wikipedia']
│         🗣  Now we type our search term "science" into the input box.
│
│  [ 5/15] click    role=button[name='Search']
│         🗣  Finally, we click the search button to submit and get the results.
│
◆  4 steps verified (18.4s)
│
│
│
│   2/4  Narration — Synthesizing 4 voice clips in parallel
│
│  [1/4] ✓ clip 3 (4.2s) · ~2s left
│
│  [2/4] ✓ clip 1 (4.0s) · ~1s left
│
│  [3/4] ✓ clip 2 (5.1s) · ~1s left
│
│  [4/4] ✓ clip 4 (4.5s)
│
◆  4 clips, 18s of speech (2.1s)
│
│
│
│   3/4  Record — Replaying the plan in a real browser
│
│  [1/4] navigate https://wikipedia.org/ · ~20s left
│         🗣  We are navigating to Wikipedia's homepage, the first step for our search.
│
│  [2/4] click    role=searchbox[name='Search Wikipedia'] · ~15s left
│         🗣  Trying a different selector to target the search field on Wikipedia's homepage.
│
│  [3/4] type     "science" → role=searchbox[name='Search Wikipedia'] · ~10s left
│         🗣  Now we type our search term "science" into the input box.
│
│  [4/4] click    role=button[name='Search']
│         🗣  Finally, we click the search button to submit and get the results.
│
◆  19s of video captured (19.6s)
│
│
│
│   4/4  Compose — Muxing audio and video with ffmpeg
│
◆  final.mp4 written (1.5s)
│
◇  Done! ──────────────────────────────────────────────────────────────────────────────╮
│                                                                                      │
│  ✔ Video: ./out/2026-05-20T13-02-55-222Z/final.mp4                                   │
│                                                                                      │
│  To play:                                                                            │
│   open "./out/2026-05-20T13-02-55-222Z/final.mp4"                                    │
│                                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────╯
│
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
