import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('execa', () => ({ execa: vi.fn() }));
vi.mock('node:fs', () => ({
  default: { existsSync: vi.fn() },
  existsSync: vi.fn(),
}));
vi.mock('playwright', () => ({
  chromium: { executablePath: vi.fn() },
}));

import { execa } from 'execa';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { preflightApiKey, preflightSystem } from '../lib/preflight.ts';

const mockedExeca = vi.mocked(execa);
const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedExecutablePath = vi.mocked(chromium.executablePath);

describe('preflightApiKey', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when OPENROUTER_API_KEY is missing', () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(() => preflightApiKey()).toThrow(/OPENROUTER_API_KEY is not set/);
  });

  it('throws when OPENROUTER_API_KEY is only whitespace', () => {
    process.env.OPENROUTER_API_KEY = '   ';
    expect(() => preflightApiKey()).toThrow(/OPENROUTER_API_KEY is not set/);
  });

  it('passes when OPENROUTER_API_KEY is set', () => {
    process.env.OPENROUTER_API_KEY = 'sk-test';
    expect(() => preflightApiKey()).not.toThrow();
  });

  it('formats the error as a numbered list', () => {
    delete process.env.OPENROUTER_API_KEY;
    try {
      preflightApiKey();
      throw new Error('should have thrown');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/Missing prerequisites:/);
      expect(msg).toMatch(/^ {2}1\. /m);
    }
  });
});

describe('preflightSystem', () => {
  beforeEach(() => {
    mockedExeca.mockReset();
    mockedExistsSync.mockReset();
    mockedExecutablePath.mockReset();
  });

  function happyPath(): void {
    // ffmpeg/ffprobe `-version` succeeds.
    mockedExeca.mockResolvedValue({ stdout: '', stderr: '' } as never);
    mockedExecutablePath.mockReturnValue('/fake/chromium');
    mockedExistsSync.mockReturnValue(true);
  }

  it('passes when all prerequisites are met', async () => {
    happyPath();
    await expect(preflightSystem()).resolves.toBeUndefined();
  });

  it('reports missing ffmpeg', async () => {
    mockedExecutablePath.mockReturnValue('/fake/chromium');
    mockedExistsSync.mockReturnValue(true);
    mockedExeca.mockImplementation(((name: string) => {
      if (name === 'ffmpeg') return Promise.reject(new Error('not found'));
      return Promise.resolve({ stdout: '', stderr: '' });
    }) as never);

    await expect(preflightSystem()).rejects.toThrow(/'ffmpeg' not found on PATH/);
  });

  it('reports missing ffprobe', async () => {
    mockedExecutablePath.mockReturnValue('/fake/chromium');
    mockedExistsSync.mockReturnValue(true);
    mockedExeca.mockImplementation(((name: string) => {
      if (name === 'ffprobe') return Promise.reject(new Error('not found'));
      return Promise.resolve({ stdout: '', stderr: '' });
    }) as never);

    await expect(preflightSystem()).rejects.toThrow(/'ffprobe' not found on PATH/);
  });

  it('reports missing Chromium when executablePath returns empty', async () => {
    mockedExeca.mockResolvedValue({ stdout: '', stderr: '' } as never);
    mockedExecutablePath.mockReturnValue('');
    mockedExistsSync.mockReturnValue(false);

    await expect(preflightSystem()).rejects.toThrow(/Playwright Chromium is not installed/);
  });

  it('reports missing Chromium when binary file is absent', async () => {
    mockedExeca.mockResolvedValue({ stdout: '', stderr: '' } as never);
    mockedExecutablePath.mockReturnValue('/missing/chromium');
    mockedExistsSync.mockReturnValue(false);

    await expect(preflightSystem()).rejects.toThrow(/Playwright Chromium is not installed/);
  });

  it('reports missing Chromium when executablePath throws', async () => {
    mockedExeca.mockResolvedValue({ stdout: '', stderr: '' } as never);
    mockedExecutablePath.mockImplementation(() => {
      throw new Error('not installed');
    });

    await expect(preflightSystem()).rejects.toThrow(/Playwright Chromium is not installed/);
  });

  it('aggregates every missing requirement into one error', async () => {
    mockedExeca.mockRejectedValue(new Error('not found'));
    mockedExecutablePath.mockReturnValue('');
    mockedExistsSync.mockReturnValue(false);

    try {
      await preflightSystem();
      throw new Error('should have thrown');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/ffmpeg/);
      expect(msg).toMatch(/ffprobe/);
      expect(msg).toMatch(/Chromium/);
      // Numbered list with at least three entries.
      expect(msg).toMatch(/^ {2}1\. /m);
      expect(msg).toMatch(/^ {2}2\. /m);
      expect(msg).toMatch(/^ {2}3\. /m);
    }
  });

  it('probes ffmpeg and ffprobe in parallel', async () => {
    happyPath();
    await preflightSystem();

    const calls = mockedExeca.mock.calls.map((c) => c[0]);
    expect(calls).toContain('ffmpeg');
    expect(calls).toContain('ffprobe');
  });
});
