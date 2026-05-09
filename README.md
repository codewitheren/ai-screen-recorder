# ai-screen-recorder

AI agent that browses a website and produces a narrated MP4 video of the task you describe.

## Setup

Requires **Node.js 20+** and **ffmpeg**.

```bash
brew install ffmpeg          # macOS
pnpm install                 # also installs Playwright's chromium
cp .env.example .env         # then fill in API keys
```

Required environment variables:

- `OPENROUTER_API_KEY` — single key for both LLM and TTS (via OpenRouter)

## Usage

```bash
pnpm dev "<prompt>" --url <url> [--lang <language>] [--voice <voice>]
```

Examples:

```bash
pnpm dev "Show how to create a new pen on CodePen" \
  --url https://codepen.io \
  --lang Turkish

pnpm dev "Search for TypeScript and open the first result" \
  --url https://en.wikipedia.org
```

Output is written to `out/<timestamp>/final.mp4`.

## How it works

Single process, sequential pipeline:

1. **explore** — AI agent browses the site in a headless browser, deciding and executing one action at a time while writing narration for each step
2. **tts** — Each narration line is synthesized into an MP3
3. **record** — Verified steps are replayed with video recording enabled
4. **compose** — ffmpeg merges audio and video into the final MP4

See [docs/PRD.md](docs/PRD.md) for the full spec.
