import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('upload service declares tus endpoints', () => {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('/uploads/tus'));
  assert.ok(src.includes('/uploads/tus/:id'));
  assert.ok(src.includes('/uploads/tus/:id/complete'));
  assert.ok(src.includes('/uploads/sessions/:id'));
});
