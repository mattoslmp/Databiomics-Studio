import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('llm module supports remote and local engines', () => {
  const source = readFileSync(new URL('../src/llm.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('LLM_BASE_URL'));
  assert.ok(source.includes('localExtractiveBullets'));
  assert.ok(source.includes('retrieveTopK'));
  assert.ok(source.includes('remote-llm'));
});
