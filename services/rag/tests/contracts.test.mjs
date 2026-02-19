import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rag service source exposes ingest and retrieve handlers', () => {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('/rag/ingest'));
  assert.ok(src.includes('/rag/retrieve'));
  assert.ok(src.includes('não encontrei no material fornecido'));
});
