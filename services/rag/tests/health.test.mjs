import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('openapi defines /health, /metrics and rag endpoints', () => {
  const doc = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');
  assert.ok(doc.includes('/health'));
  assert.ok(doc.includes('/metrics'));
  assert.ok(doc.includes('/rag/ingest'));
  assert.ok(doc.includes('/rag/retrieve'));
});
