/**
 * Who failed — us or the provider?
 *
 * ⚠️ This rule decides what is written to an append-only public log about
 * models, and it exists because the rule was ABSENT once: a transient
 * ECONNRESET killed the gateway, five seeds failed with "fetch failed", and five
 * rows saying the model produced nothing were recorded on Base Sepolia. They
 * cannot be taken back.
 *
 * The lesson this repository had already written down two commits earlier — a
 * rule nothing can trigger is not a rule — and then did not apply to itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attributeFailure } from '../src/agent.mjs';
import { toRow } from '../src/registry.mjs';

const err = (message, code) => Object.assign(new Error(message), code ? { cause: { code } } : {});

test('a dead gateway is ours, not the model\'s', () => {
  // The exact shape observed: undici throws this when nothing is listening.
  assert.equal(attributeFailure(err('fetch failed', 'ECONNREFUSED')), 'harness_error');
  assert.equal(attributeFailure(err('fetch failed')), 'harness_error');
});

test('the failure that actually caused the bad rows is classified as ours', () => {
  assert.equal(attributeFailure(err('fetch failed', 'ECONNRESET')), 'harness_error');
  assert.equal(attributeFailure(err('facilitator_unreachable')), 'harness_error');
});

test('every transport signature we have seen is ours', () => {
  for (const c of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND']) {
    assert.equal(attributeFailure(err('fetch failed', c)), 'harness_error', c);
  }
  assert.equal(attributeFailure(err('socket hang up')), 'harness_error');
});

test('anything the provider answered is the PROVIDER\'s, and stays on the record', () => {
  // A budget allocator is entitled to see these: they are facts about a provider.
  assert.equal(attributeFailure(err('HTTP 500 from provider')), 'provider_error');
  assert.equal(attributeFailure(err('HTTP 429 rate limited')), 'provider_error');
  assert.equal(attributeFailure(err('model returned no fenced code block')), 'provider_error');
  assert.equal(attributeFailure(err('context length exceeded')), 'provider_error');
});

test('it fails toward keeping the row, not toward dropping it', () => {
  // Dropping a row silently hides a provider's failures from the allocator and
  // leaves no trace that it happened. Keeping a wrong one is at least visible.
  assert.equal(attributeFailure(err('something nobody has seen before')), 'provider_error');
  assert.equal(attributeFailure(err('')), 'provider_error');
  assert.equal(attributeFailure(undefined), 'provider_error');
});

test('a harness_error row is refused before it can be written', async () => {
  const { recordRun } = await import('../src/registry.mjs');
  const r = await recordRun(
    { run_id: 'x', agent: { model: 'm', stop_reason: 'harness_error' }, cost: { usd_list: '0' } },
    {},
  );
  assert.equal(r.recorded, false);
  assert.equal(r.skipped, true);
  assert.match(r.reason, /not the model/);
});

test('a provider_error row IS written — the refusal is narrow', () => {
  const row = toRow(
    { run_id: 'x', agent: { model: 'm', stop_reason: 'provider_error' }, cost: { usd_list: '0.002' } },
    {},
  );
  assert.equal(row.outcome, 'provider_error');
  assert.equal(row.scored, false);
  assert.equal(row.usdListNano, 2000000, 'the money it burned travels with it');
});
