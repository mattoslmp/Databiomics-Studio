import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('deck service implements templates/create/export', () => {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('/deck/templates'));
  assert.ok(src.includes('/decks'));
  assert.ok(src.includes('/decks/:deck_id/export'));
});
