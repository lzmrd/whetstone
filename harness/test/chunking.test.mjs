/**
 * ⚠️ The bug this covers was invisible for a reason worth stating: every
 * receipt published so far is chunked (3-4 chunks, up to 3838 bytes) and every
 * one happens to be pure ASCII, so the boundary was crossed fifteen times
 * without a single multi-byte character sitting on it.
 *
 * `patch_source` is model output. One `≥` in a comment, in the wrong position,
 * discards a run that was already paid for.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const CHUNK = 1024;
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Split like HCS does: on BYTES, with no regard for character boundaries. */
const split = (payload) => {
  const buf = Buffer.from(payload, 'utf8');
  const out = [];
  for (let i = 0; i < buf.length; i += CHUNK) out.push(buf.subarray(i, i + CHUNK));
  return out;
};

const reassembleOld = (chunks) => chunks.map((c) => c.toString('utf8')).join('');
const reassembleNew = (chunks) => Buffer.concat(chunks);

/** A payload whose multi-byte character lands exactly across byte 1024. */
const straddling = () => {
  // '≥' is 3 bytes (e2 89 a5). Put its first byte at index 1023.
  const head = 'a'.repeat(CHUNK - 1);
  return `${head}≥${'b'.repeat(200)}`;
};

test('a multi-byte character across the chunk boundary survives byte concatenation', () => {
  const payload = straddling();
  const chunks = split(payload);
  assert.ok(chunks.length > 1, 'the fixture must actually be chunked');
  assert.equal(sha256(reassembleNew(chunks)), sha256(payload));
});

test('the old string-join reassembly corrupts it — the bug is real, not theoretical', () => {
  const payload = straddling();
  const chunks = split(payload);
  assert.notEqual(reassembleOld(chunks), payload);
  assert.notEqual(sha256(reassembleOld(chunks)), sha256(payload));
  assert.ok(reassembleOld(chunks).includes('�'), 'expected replacement characters');
});

test('pure ASCII reassembles identically either way — which is why this was never seen', () => {
  const payload = 'x'.repeat(3000);
  const chunks = split(payload);
  assert.equal(sha256(reassembleOld(chunks)), sha256(payload));
  assert.equal(sha256(reassembleNew(chunks)), sha256(payload));
});
