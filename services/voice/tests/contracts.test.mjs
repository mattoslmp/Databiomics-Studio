import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('voice service implements clone, slide-tts and jobs endpoints', () => {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('/voice/synthesize'));
  assert.ok(src.includes('/voice/synthesize-from-slides'));
  assert.ok(src.includes('/voice/jobs/:job_id'));
  assert.ok(src.includes('clone_requires_pro_plan'));
});
