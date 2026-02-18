import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('provider registry includes crossref and arxiv adapters', () => {
  const source = readFileSync(new URL('../src/providers.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('crossrefAdapter'));
  assert.ok(source.includes('arxivAdapter'));
  assert.ok(source.includes('providerRegistry'));
});
