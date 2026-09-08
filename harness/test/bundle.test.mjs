/**
 * A published bundle is evidence, and evidence has to hash to the value the
 * chains committed to.
 *
 * ⚠️ It did not. HCS published `JSON.stringify(receipt)`; the bundle wrote
 * `JSON.stringify(receipt, null, 2)` plus a newline. Same content, different
 * bytes, different sha256 — so all 11 scored runs shipped a receipt.json that
 * hashed differently from the value on Base Sepolia, and a reader who hashed the
 * file we handed them would have concluded we were lying about our own results.
 *
 * Nothing noticed, because each half was internally consistent: the HCS receipt
 * matched its own hash, and the bundle was a faithful copy of the same object.
 * The defect lived exactly in the gap between two correct components.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical } from '../src/hcs.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const ART = join(REPO, 'artifacts');

test('canonical is compact: whitespace is not part of a receipt', () => {
  assert.equal(canonical({ b: 1, a: 2 }), '{"b":1,"a":2}');
  assert.ok(!canonical({ a: { b: 1 } }).includes('\n'));
  assert.ok(!canonical({ a: { b: 1 } }).includes(' '));
});

test('every published receipt is byte-identical to its canonical form', () => {
  if (!existsSync(ART)) return;
  const bundles = readdirSync(ART).filter((d) => existsSync(join(ART, d, 'receipt.json')));
  assert.ok(bundles.length > 0, 'there should be published bundles to check');

  for (const b of bundles) {
    const raw = readFileSync(join(ART, b, 'receipt.json'), 'utf8');
    assert.equal(
      raw,
      canonical(JSON.parse(raw)),
      `artifacts/${b}/receipt.json is not the bytes that were published. ` +
        `Its sha256 will not match the hash recorded on Base Sepolia, so anyone ` +
        `following RECOMPUTE.md gets a mismatch and concludes the record is false.`,
    );
  }
});

test('a trailing newline is enough to break it', () => {
  const r = { run_id: 'x' };
  assert.notEqual(canonical(r) + '\n', canonical(r));
});
