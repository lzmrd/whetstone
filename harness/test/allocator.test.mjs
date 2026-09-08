/**
 * The allocator's policy is the independent variable of the whole demo, so it is
 * tested as one: same inputs, same decision, every time, on every machine.
 *
 * ⚠️ `decide` is pure and separated from the fetch for exactly this reason. A
 * policy that can only be exercised by standing up a subgraph is a policy nobody
 * tests, and R10 promises "an explicit policy" — explicit means checkable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, UNKNOWN_STREAK_LIMIT } from '../src/allocator.mjs';

const M = (name, o = {}) => ({
  name,
  runCount: '3', sumSavedPerCall: '600', sumUsdListNano: '1000000',
  totalSavedTotal: '300000', formalCount: '3', fuzzedCount: '0',
  unknownCount: '0', consecutiveUnknown: '0', lastLabel: 'FORMAL_NO_EXPLICIT_INPUT_BOUND',
  ...o,
});

test('a model with no history is explored before anything is ranked', () => {
  const d = decide(['a', 'b'], [M('a')]);
  assert.equal(d.rule, 'cold-start');
  assert.equal(d.choice, 'b');
});

test('runCount 0 counts as no history, not as a bad result', () => {
  const d = decide(['a', 'b'], [M('a'), M('b', { runCount: '0', totalSavedTotal: '0' })]);
  assert.equal(d.rule, 'cold-start');
  assert.equal(d.choice, 'b');
});

test('two consecutive UNKNOWN bench a model even when it leads on gas per dollar', () => {
  const d = decide(
    ['greedy', 'steady'],
    [
      M('greedy', { totalSavedTotal: '9000000', consecutiveUnknown: String(UNKNOWN_STREAK_LIMIT) }),
      M('steady', { totalSavedTotal: '300000' }),
    ],
  );
  assert.equal(d.choice, 'steady');
  assert.match(d.trace.join('\n'), /greedy: 2 consecutive UNKNOWN → benched/);
});

test('one UNKNOWN is not enough to bench', () => {
  const d = decide(
    ['greedy', 'steady'],
    [M('greedy', { totalSavedTotal: '9000000', consecutiveUnknown: '1' }), M('steady')],
  );
  assert.equal(d.choice, 'greedy');
});

test('ranking is gas saved per nanodollar, not gas saved', () => {
  const d = decide(
    ['expensive', 'efficient'],
    [
      M('expensive', { totalSavedTotal: '1000000', sumUsdListNano: '100000000' }), //  0.01 gas/nano
      M('efficient', { totalSavedTotal: '200000', sumUsdListNano: '1000000' }),    //  0.2  gas/nano
    ],
  );
  assert.equal(d.choice, 'efficient');
});

test('every model benched still spends, and says why', () => {
  const d = decide(
    ['a', 'b'],
    [M('a', { consecutiveUnknown: '4' }), M('b', { consecutiveUnknown: '2' })],
  );
  assert.ok(d.choice === 'a' || d.choice === 'b');
  assert.match(d.trace.join('\n'), /the target is intractable, not the models/);
});

/**
 * ⚠️ The numbers here overflow a float64's integer range. With `Number` the two
 * scores compare equal and the tie-break silently decides the round; the
 * allocator would look deterministic while ranking on rounding error.
 */
test('ranking survives values that lose precision as floats', () => {
  const big = '9007199254740992';        // 2**53
  const bigger = '9007199254740993';     // 2**53 + 1, which float64 cannot represent
  const d = decide(
    ['low', 'high'],
    [
      M('low', { totalSavedTotal: big, sumUsdListNano: '1' }),
      M('high', { totalSavedTotal: bigger, sumUsdListNano: '1' }),
    ],
  );
  assert.equal(d.choice, 'high');
  assert.equal(Number(big) === Number(bigger), true, 'as floats these are indistinguishable');
});

test('the same inputs always produce the same decision', () => {
  const rows = [M('a', { totalSavedTotal: '500000' }), M('b', { totalSavedTotal: '400000' })];
  const first = decide(['a', 'b'], rows).choice;
  for (let i = 0; i < 25; i++) assert.equal(decide(['a', 'b'], rows).choice, first);
});

test('an exact tie breaks on cost, then on candidate order — never randomly', () => {
  const tie = decide(
    ['a', 'b'],
    [M('a', { sumUsdListNano: '2000000', totalSavedTotal: '600000' }),
     M('b', { sumUsdListNano: '1000000', totalSavedTotal: '300000' })],
  );
  assert.equal(tie.choice, 'b', 'same ratio → the cheaper one');

  const total = decide(
    ['a', 'b'],
    [M('a'), M('b')],
  );
  assert.equal(total.choice, 'a', 'identical rows → candidate order');
});
