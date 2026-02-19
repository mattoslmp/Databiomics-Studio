import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('execution service exposes generation and export endpoints', () => {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('/execution/generate'));
  assert.ok(src.includes('/execution/:meeting_id/export'));
});
