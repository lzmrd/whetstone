/**
 * A run must not carry a stronger guarantee than the task it was scored on.
 *
 * ⚠️ The case that matters is the third one: hevm PROVING a patch equivalent to
 * its task is a real result, and publishing FORMAL for it would still be wrong
 * when the baseline underneath was only established by fuzzing. The label
 * describes what a reader can rely on, and a reader relies on the whole chain.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampLabel } from '../src/agent.mjs';

test('a FORMAL task leaves every label alone', () => {
  for (const l of ['FORMAL_NO_EXPLICIT_INPUT_BOUND', 'FORMAL_BOUNDED', 'FUZZED', 'UNKNOWN']) {
    assert.equal(clampLabel(l, 'FORMAL'), l);
  }
});

test('a FUZZED task caps a proved patch at FUZZED', () => {
  assert.equal(clampLabel('FORMAL_NO_EXPLICIT_INPUT_BOUND', 'FUZZED'), 'FUZZED');
  assert.equal(clampLabel('FORMAL_BOUNDED', 'FUZZED'), 'FUZZED');
});

test('UNKNOWN is never raised by the clamp', () => {
  assert.equal(clampLabel('UNKNOWN', 'FUZZED'), 'UNKNOWN');
  assert.equal(clampLabel('UNKNOWN', 'FORMAL'), 'UNKNOWN');
});

test('FUZZED stays FUZZED under either ceiling', () => {
  assert.equal(clampLabel('FUZZED', 'FUZZED'), 'FUZZED');
  assert.equal(clampLabel('FUZZED', 'FORMAL'), 'FUZZED');
});
