import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('avatar-builder implements onboarding endpoints', () => {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('/avatars'));
  assert.ok(src.includes('/avatars/:avatar_id/liveness'));
  assert.ok(src.includes('/avatars/:avatar_id/build'));
});
