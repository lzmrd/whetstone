/**
 * How a hevm invocation ended, when it ended without a verdict.
 *
 * ⚠️ The case that matters is the last one. A prover killed for eating memory
 * leaves partial output behind, and that output can contain anything. If a kill
 * were ever classified as "not a kill", the partial text would reach the marker
 * parser, and the worst outcome there is not UNKNOWN -- it is a REFUTATION
 * assembled from a truncated buffer, fed back to a model as a counterexample
 * and published as a guarantee.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyKill } from '../src/equivalence.mjs';

const WALL = 30 * 60 * 1000;

test('a cgroup OOM exits 137 with no signal, and is memory', () => {
  // systemd-run reports the child's SIGKILL as its own exit status, so node
  // sees a normal exit. Reading only `signal` would miss every capped kill.
  assert.equal(classifyKill({ code: 137 }, 18_000, WALL), 'memory');
});

test('a bare SIGKILL is memory, whatever the elapsed time', () => {
  assert.equal(classifyKill({ signal: 'SIGKILL' }, 18_000, WALL), 'memory');
  assert.equal(classifyKill({ signal: 'SIGKILL' }, WALL, WALL), 'memory');
});

test("node's own wall clock is a wall clock, not a memory kill", () => {
  assert.equal(classifyKill({ killed: true, signal: 'SIGTERM' }, WALL, WALL), 'wall-clock');
});

test('an ordinary non-zero exit is NOT a kill, so the output may be parsed', () => {
  // This is how a refutation arrives: hevm exits non-zero with a counterexample.
  assert.equal(classifyKill({ code: 1 }, 500, WALL), null);
  assert.equal(classifyKill({ code: 0 }, 500, WALL), null);
});

test('a kill is never null, so partial output can never reach the parser', () => {
  for (const e of [{ code: 137 }, { signal: 'SIGKILL' }, { killed: true }, { signal: 'SIGSEGV' }]) {
    assert.notEqual(classifyKill(e, 1000, WALL), null, JSON.stringify(e));
  }
});
