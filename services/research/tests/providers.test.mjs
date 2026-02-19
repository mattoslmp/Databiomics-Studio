import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('provider registry includes mandatory adapters and versioning', () => {
  const source = readFileSync(new URL('../src/providers.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('registry_version'));
  assert.ok(source.includes('pubmed'));
  assert.ok(source.includes('europepmc'));
  assert.ok(source.includes('biorxiv'));
  assert.ok(source.includes('medrxiv'));
  assert.ok(source.includes('semanticscholar'));
  assert.ok(source.includes('resolve_fulltext'));
  assert.ok(source.includes('rate_limit_policy'));
});

test('research index includes rag qa endpoint', () => {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('/research/sessions/:id/qa'));
  assert.ok(source.includes('/research/providers/registry'));
});
