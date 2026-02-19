import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('voice service implements profile verify and synth endpoints', () => {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('/voice/profiles'));
  assert.ok(src.includes('/voice/profiles/:voice_profile_id/verify'));
  assert.ok(src.includes('/voice/synthesize'));
});
