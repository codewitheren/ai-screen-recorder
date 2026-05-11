import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { mockExplore } from '../testing/mock-explore.js';
import { ExploreResultSchema } from '../types.js';

describe('mockExplore', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns a valid ExploreResult', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-explore-'));
    const result = await mockExplore('Test prompt', 'https://example.com', tmpDir);

    expect(() => ExploreResultSchema.parse(result)).not.toThrow();
  });

  it('has title prefixed with [TEST]', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-explore-'));
    const result = await mockExplore('My task', 'https://example.com', tmpDir);
    expect(result.title).toBe('[TEST] My task');
  });

  it('produces 3 steps', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-explore-'));
    const result = await mockExplore('Test', 'https://example.com', tmpDir);
    expect(result.steps).toHaveLength(3);
  });

  it('first step navigates to the given URL', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-explore-'));
    const result = await mockExplore('Test', 'https://mysite.io', tmpDir);
    const firstStep = result.steps[0];
    expect(firstStep?.action).toBe('navigate');
    expect(firstStep?.input).toBe('https://mysite.io');
  });

  it('writes explore.json to outDir', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-explore-'));
    await mockExplore('Test', 'https://example.com', tmpDir);
    const content = await fs.readFile(path.join(tmpDir, 'explore.json'), 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.title).toContain('[TEST]');
  });
});
