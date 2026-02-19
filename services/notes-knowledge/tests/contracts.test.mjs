import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('notes service exposes generation and retrieval endpoints', () => {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('/notes/generate'));
  assert.ok(src.includes('/notes/:meeting_id'));
});
