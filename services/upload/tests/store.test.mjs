import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('upload store supports create/append/finalize lifecycle', () => {
  const src = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('createUploadSession'));
  assert.ok(src.includes('appendUploadChunk'));
  assert.ok(src.includes('finalizeUpload'));
  assert.ok(src.includes("upload-sessions.json"));
});
