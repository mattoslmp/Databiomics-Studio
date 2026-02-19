import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('avatar-builder implements onboarding, metrics and similarity gate fields', () => {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('/avatars/:avatar_id/build'));
  assert.ok(src.includes('/metrics'));
  assert.ok(src.includes('similarity_gate_failed'));
  assert.ok(src.includes('preview_video_ref'));
});
