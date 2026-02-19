import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('llm-gateway source exposes route, usage and outbox handlers', () => {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('/llm-gateway/route'));
  assert.ok(src.includes('/llm-gateway/usage'));
  assert.ok(src.includes('/llm-gateway/outbox'));
  assert.ok(src.includes('missing_workspace_context'));
});
