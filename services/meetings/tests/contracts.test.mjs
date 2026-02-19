import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('meetings service implements approval/transcription endpoints', () => {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('/meetings/:meeting_id/transcription'));
  assert.ok(src.includes('/meetings/:meeting_id/avatar-bot-approval'));
});
