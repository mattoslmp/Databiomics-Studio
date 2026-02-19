import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('openapi defines /health and route endpoint', () => {
  const doc = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');
  assert.ok(doc.includes('/health'));
  assert.ok(doc.includes('/llm-gateway/route'));
});
