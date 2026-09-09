/**
 * ⚠️ The budget was an observation, not a constraint: the call was made, the
 * spend was added up, and only then compared to the limit. These cover the
 * preflight that turns it into a bound, and the direction its estimate errs in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worstCaseRoundUsd } from '../src/agent.mjs';

const price = { input: 1, output: 10 }; // $/Mtok, round numbers

test('the output term is exact — it is capped by max_tokens', () => {
  const cost = worstCaseRoundUsd([], 1_000_000, { input: 0, output: 10 });
  assert.equal(cost, 10);
});

test('the input estimate over-counts, so the bound errs toward underspending', () => {
  const messages = [{ role: 'user', content: 'x'.repeat(3000) }];
  const chars = JSON.stringify(messages).length;
  const cost = worstCaseRoundUsd(messages, 0, { input: 1e6, output: 0 });
  // 3 chars per token, against a real ratio nearer 4: the estimate is HIGHER
  // than the truth, which spends less than allowed rather than more.
  assert.equal(cost, Math.ceil(chars / 3));
  assert.ok(Math.ceil(chars / 3) > Math.ceil(chars / 4));
});

test('a longer conversation costs more, so the bound tightens as rounds accumulate', () => {
  const short = worstCaseRoundUsd([{ role: 'user', content: 'hi' }], 100, price);
  const long = worstCaseRoundUsd([{ role: 'user', content: 'x'.repeat(50_000) }], 100, price);
  assert.ok(long > short);
});

test('a free model can never exhaust a budget', () => {
  const cost = worstCaseRoundUsd([{ role: 'user', content: 'x'.repeat(100_000) }], 1e6, { input: 0, output: 0 });
  assert.equal(cost, 0);
});
