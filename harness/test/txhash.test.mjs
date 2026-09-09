/**
 * ⚠️ `cast send --async --json` prints a BARE HASH, not a JSON object.
 *
 * The first version of the idempotence fix read it as
 * `JSON.parse(stdout).transactionHash ?? String(stdout).trim()`, which throws
 * on a bare hash before the fallback can run. The throw lands in the branch
 * that means "nothing was broadcast", so the row is queued without a hash and
 * the retry sends it again -- the double-write the fix exists to close,
 * reintroduced by the fix. Found by running it against Base Sepolia.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { txHashFrom } from '../src/registry.mjs';

const HASH = '0x377d8de7f6a8041acb876a44242030ff02ffb4c8461ce6c0a7cf6cd4b529b9d3';

test('a bare hash is what --async actually prints', () => {
  assert.equal(txHashFrom(HASH), HASH);
  assert.equal(txHashFrom(`${HASH}\n`), HASH);
});

test('a JSON receipt still works, in case the format changes back', () => {
  assert.equal(txHashFrom(JSON.stringify({ transactionHash: HASH, status: '0x1' })), HASH);
});

test('anything unrecognisable THROWS rather than returning null', () => {
  // ⚠️ Returning null here would mean "not broadcast", which licenses a retry.
  // If we cannot tell, we must not guess in the direction that writes twice.
  for (const bad of ['', 'Error: insufficient funds', '{}', '0xdeadbeef', 'null']) {
    assert.throws(() => txHashFrom(bad), /no recognisable transaction hash/);
  }
});
