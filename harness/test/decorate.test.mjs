/**
 * Both acceptance paths must decorate a measurement the same way.
 *
 * ⚠️ They did not. The proved path set four fields and the fuzzed path set two,
 * dropping the floor comparison -- and under D-16 the only two tasks with real
 * headroom can ONLY be accepted on the fuzzed path, so every run on them
 * published a receipt missing the column that says whether the model beat a
 * one-word edit. The first live run printed "vs floor median NaN" next to a
 * patch that had beaten the floor by 9 480 gas per call.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decorateGas } from '../src/agent.mjs';

const measurement = () => ({ saved_total: 2_872_320, saved_per_call: 10_880 });

test('every published field is set, floor included', () => {
  const g = decorateGas(measurement(), {
    baselineTotal: 266_376,
    denominator: 3_732_168,
    trivialGas: { saved_per_call: 1_400 },
  });
  assert.equal(g.baseline_total, 266_376);
  assert.equal(g.relative_progress, 0.7696);
  assert.equal(g.trivial_saves_per_call, 1_400);
  assert.equal(g.beats_trivial_by, 9_480);
});

test('a task with no trivial floor yields null, never undefined', () => {
  // ⚠️ null and undefined are not interchangeable here: the receipt serialises
  // to JSON, where an undefined field DISAPPEARS. "we did not measure this" and
  // "this key does not exist" read identically to anyone downstream.
  const g = decorateGas(measurement(), {
    baselineTotal: 1, denominator: 100, trivialGas: null,
  });
  assert.equal(g.trivial_saves_per_call, null);
  assert.equal(g.beats_trivial_by, null);
  assert.ok('beats_trivial_by' in JSON.parse(JSON.stringify(g)));
});

test('beating the baseline is above 100% and is not clamped', () => {
  // The baseline is a reference, not a ceiling. A patch that beats it is a real
  // result and must be reported as one.
  const g = decorateGas({ saved_total: 200, saved_per_call: 20 },
    { baselineTotal: 1, denominator: 100, trivialGas: { saved_per_call: 5 } });
  assert.equal(g.relative_progress, 2);
  assert.equal(g.beats_trivial_by, 15);
});

test('a patch that loses to the one-word edit reports a negative, not a zero', () => {
  const g = decorateGas({ saved_total: 100, saved_per_call: 10 },
    { baselineTotal: 1, denominator: 100, trivialGas: { saved_per_call: 42 } });
  assert.equal(g.beats_trivial_by, -32);
});
