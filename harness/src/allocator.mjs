/**
 * The budget allocator — WHETSTONE R10, D-10.
 *
 * ⚠️ DETERMINISTIC CODE, NOT AN LLM. An LLM allocator would add cost and
 * non-reproducibility to a project whose entire thesis is measurement rigour,
 * and a fixed policy still satisfies the bounty's "an agent that budgets across
 * providers". It also means the decision can be printed next to the evidence
 * that produced it, which is the point: the allocator's dependence on the
 * subgraph has to be SHOWN, not asserted.
 *
 * ⚠️ WHAT THE SUBGRAPH ACTUALLY BUYS, stated honestly because the obvious
 * objection is "you are indexing your own contract, that is circular":
 * `consecutiveUnknown` is a fold over a model's history in block order. It
 * cannot be read off one event, and computing it here means fetching and
 * replaying every run ever recorded on every decision. The subgraph maintains it
 * as rows arrive. That is a real consumption, and it is what the fallback below
 * loses.
 *
 * ⚠️ AND WHAT IT DOES NOT BUY. Filming this allocator degrading when the
 * subgraph is switched off does not PROVE the subgraph is necessary — an
 * allocator built to read its memory from the subgraph will of course degrade
 * without it. The demo illustrates the architecture. The honest claim is the
 * paragraph above: here is the specific quantity, here is why it is a fold, here
 * is what replaces it when the index is gone.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const RR_STATE = join(REPO, 'harness', '.runs', 'round-robin.json');

/** ⚠️ Two consecutive UNKNOWN labels and the model is set aside. R10's example policy, verbatim. */
export const UNKNOWN_STREAK_LIMIT = 2;

/**
 * ⚠️ Two consecutive paid attempts that returned nothing usable and the model is
 * set aside too. Without this the allocator explored forever: a model that never
 * produces a patch never earns a scored run, so it stayed "unseen" and won the
 * cold-start rule every single round while burning budget. Found by running the
 * allocator against the live subgraph, not by reading the policy.
 */
export const FAILURE_STREAK_LIMIT = 2;

export const QUERY = `query Allocator($recorder: Bytes!) {
  models(where: { recorder: $recorder }, orderBy: attemptCount, orderDirection: desc, first: 50) {
    name
    runCount
    attemptCount
    failedCount
    consecutiveFailures
    sumSavedPerCall
    sumUsdListNano
    totalSavedTotal
    formalCount
    fuzzedCount
    unknownCount
    consecutiveUnknown
    lastLabel
  }
}`;

/**
 * ⚠️ Every field the policy reads. A field missing from the query comes back
 * `undefined`, `Number(undefined)` is `NaN`, and every comparison against NaN is
 * false — so a rule does not error, it silently never fires. That happened: an
 * edit to QUERY did not apply, `consecutiveFailures` was absent, and the bench
 * rule was dead while its tests passed on hand-written rows that had the field.
 * The query and the policy are now checked against each other at runtime.
 */
const REQUIRED_FIELDS = [
  'runCount', 'attemptCount', 'failedCount', 'consecutiveFailures',
  'sumUsdListNano', 'totalSavedTotal', 'consecutiveUnknown',
];

export function assertComplete(rows) {
  for (const r of rows) {
    const missing = REQUIRED_FIELDS.filter((f) => r[f] === undefined);
    if (missing.length > 0) {
      throw new Error(
        `the subgraph response is missing ${missing.join(', ')} for "${r.name}". ` +
          `The policy reads these; absent, they read as NaN and the rules that ` +
          `depend on them silently never fire. Fix QUERY or the schema.`,
      );
    }
  }
  return rows;
}

export async function fetchModels(url, recorder) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { recorder: recorder.toLowerCase() } }),
  });
  if (!res.ok) throw new Error(`subgraph HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  if (body.errors) throw new Error(`subgraph errors: ${JSON.stringify(body.errors).slice(0, 300)}`);
  return assertComplete(body.data.models);
}

/** Blind rotation, persisted so it is a rotation and not a constant. */
function roundRobin(candidates) {
  let i = 0;
  if (existsSync(RR_STATE)) i = JSON.parse(readFileSync(RR_STATE, 'utf8')).next ?? 0;
  const choice = candidates[i % candidates.length];
  mkdirSync(dirname(RR_STATE), { recursive: true });
  writeFileSync(RR_STATE, JSON.stringify({ next: (i + 1) % candidates.length }));
  return choice;
}

/**
 * The policy. Pure: same inputs, same decision, every time.
 *
 * @param {string[]} candidates model specs, in a fixed order — the order IS the
 *   tie-break, so it must come from the price table and never from a Set.
 * @param {object[]} models rows from the subgraph, already filtered by recorder
 */
export function decide(candidates, models) {
  const by = new Map(models.map((m) => [m.name, m]));
  const trace = [];

  // ⚠️ 1. Cold start reads ATTEMPTS, not scored runs. Reading runCount meant a
  //    model that always failed had "no history" forever and won this rule every
  //    round, so the loop spent repeatedly on a provider that returned nothing.
  const unseen = candidates.filter((c) => !by.has(c) || Number(by.get(c).attemptCount) === 0);
  if (unseen.length > 0) {
    trace.push(`${unseen.length} model(s) never attempted → explore before ranking`);
    return { choice: unseen[0], rule: 'cold-start', trace };
  }

  // 2. Bench two ways: a checker that keeps giving up, and a provider that keeps
  //    returning nothing. Different causes, same conclusion — stop paying for it.
  const benched = [];
  for (const c of candidates) {
    const m = by.get(c);
    if (Number(m.consecutiveUnknown) >= UNKNOWN_STREAK_LIMIT) {
      benched.push(c);
      trace.push(`${c}: ${m.consecutiveUnknown} consecutive UNKNOWN → benched`);
    } else if (Number(m.consecutiveFailures) >= FAILURE_STREAK_LIMIT) {
      benched.push(c);
      trace.push(
        `${c}: ${m.consecutiveFailures} consecutive failed attempts ` +
          `($${(Number(m.sumUsdListNano) / 1e9).toFixed(6)} burned, ${m.runCount} scored) → benched`,
      );
    }
  }
  let pool = candidates.filter((c) => !benched.includes(c));
  if (pool.length === 0) {
    // ⚠️ Do not stop. Every model benched means the TARGET is intractable, not
    // that the models are bad, and refusing to spend would look like a policy
    // decision about models. Fall back to the least-recently-benched.
    trace.push('every model is benched → the target is intractable, not the models. Rotating anyway.');
    pool = candidates;
  }

  // ⚠️ 3. Models with attempts but no SCORED run cannot be ranked — there is no
  //    numerator. They are not benched (they have not failed enough yet), so
  //    they get another exploration turn rather than a division by nothing.
  const unranked = pool.filter((c) => Number(by.get(c).runCount) === 0);
  if (unranked.length > 0) {
    trace.push(`${unranked[0]}: attempted but never scored → one more exploration turn`);
    return { choice: unranked[0], rule: 'explore-unscored', trace };
  }

  // 4. Rank on gas saved per nanodollar spent. ⚠️ Integer arithmetic, compared by
  //    cross-multiplication: floating point here would make the decision depend
  //    on rounding, and a deterministic policy that ties differently on different
  //    machines is not deterministic.
  const score = (c) => {
    const m = by.get(c);
    return { num: BigInt(m.totalSavedTotal), den: BigInt(m.sumUsdListNano) || 1n, m };
  };
  const ranked = [...pool].sort((a, b) => {
    const x = score(a), y = score(b);
    const left = x.num * y.den, right = y.num * x.den;
    if (left !== right) return left > right ? -1 : 1;
    // Tie-breaks, in order: cheaper first, then candidate order. Never random.
    const ca = BigInt(x.m.sumUsdListNano), cb = BigInt(y.m.sumUsdListNano);
    if (ca !== cb) return ca < cb ? -1 : 1;
    return candidates.indexOf(a) - candidates.indexOf(b);
  });

  for (const c of ranked) {
    const m = by.get(c);
    const perDollar = Number(m.sumUsdListNano) > 0
      ? (Number(m.totalSavedTotal) / (Number(m.sumUsdListNano) / 1e9)).toFixed(0)
      : 'n/a';
    trace.push(
      `${c}: ${m.runCount}/${m.attemptCount} scored, ${m.totalSavedTotal} gas saved, ` +
        `$${(Number(m.sumUsdListNano) / 1e9).toFixed(6)} spent → ${perDollar} gas/$ ` +
        `[${m.formalCount} formal, ${m.fuzzedCount} fuzzed, ${m.unknownCount} unknown]`,
    );
  }
  return { choice: ranked[0], rule: 'gas-per-dollar', trace };
}

/**
 * @returns {{choice, mode: 'informed'|'blind', rule, trace, models, error}}
 */
export async function allocate({ candidates, url, recorder }) {
  if (!candidates || candidates.length === 0) throw new Error('no candidate models');

  if (!url || !recorder) {
    return {
      choice: roundRobin(candidates),
      mode: 'blind',
      rule: 'round-robin',
      trace: ['no subgraph configured → no memory of previous rounds → blind rotation'],
      models: [],
      error: null,
    };
  }
  try {
    const models = await fetchModels(url, recorder);
    const d = decide(candidates, models);
    return { ...d, mode: 'informed', models, error: null };
  } catch (e) {
    // ⚠️ Degrade, do not crash: a paid loop that stops because an index is
    // unreachable is worse than one that spends without memory. But say so.
    return {
      choice: roundRobin(candidates),
      mode: 'blind',
      rule: 'round-robin',
      trace: [`subgraph unreachable (${e.message.slice(0, 120)}) → falling back to blind rotation`],
      models: [],
      error: e.message,
    };
  }
}
