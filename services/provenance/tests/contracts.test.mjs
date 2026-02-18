import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('provenance endpoints are declared', () => {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('/provenance/issue'));
  assert.ok(src.includes('/verify/:content_id'));
  assert.ok(src.includes('/provenance/deletion-receipt'));
});
