/**
 * The allocator, on the command line — demo beat 3.
 *
 *   npm run allocate                 the informed path: query, response, decision
 *   npm run allocate -- --no-subgraph   the same binary with the index removed
 *
 * ⚠️ ONE BINARY, TWO SHOTS. The fallback must be the same program with its
 * memory taken away, not a second program written to look degraded. `--no-subgraph`
 * blanks the URL and changes nothing else.
 */

import { allPriced, isRedTeam } from './providers.mjs';
import { allocate, QUERY } from './allocator.mjs';

const noSubgraph = process.argv.includes('--no-subgraph');
const url = noSubgraph ? null : process.env.SUBGRAPH_QUERY_URL;
const recorder = noSubgraph ? null : process.env.REGISTRY_RECORDER_ADDRESS;

// ⚠️ Candidate order is the final tie-break, so it comes from the pinned price
// table in a fixed order -- never from a Set, whose iteration order is an
// implementation detail. R14 reviewers are excluded here as well as in resolve().
//
// ⚠️ WHETSTONE_CANDIDATES narrows it to the models that are actually REACHABLE.
// The price table lists everything priced, including the OpenCode ids that
// GATE 0 found blocked; an allocator that rotates onto a model it cannot call
// is not budgeting, it is failing. Set it to what `npm run access` reports as
// usable. Defaults to the whole priced table.
const fromEnv = (process.env.WHETSTONE_CANDIDATES ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const candidates = (fromEnv.length > 0 ? fromEnv : allPriced().map((t) => t.spec))
  .filter((s) => !isRedTeam(s));
if (fromEnv.length > 0) console.log('  (candidates from WHETSTONE_CANDIDATES)');

console.log(`\n▸ allocator  ${noSubgraph ? 'SUBGRAPH DISABLED' : url ? 'querying the subgraph' : 'no SUBGRAPH_QUERY_URL set'}`);
console.log(`  candidates ${candidates.length}: ${candidates.join(', ')}`);

if (url && recorder) {
  console.log(`\n  ── the query ──${QUERY.split('\n').map((l) => `\n  ${l}`).join('')}`);
  console.log(`\n  variables: { recorder: "${recorder.toLowerCase()}" }`);
}

const d = await allocate({ candidates, url, recorder });

if (d.models.length > 0) {
  console.log('\n  ── the response ──');
  console.log(JSON.stringify(d.models, null, 2).split('\n').map((l) => `  ${l}`).join('\n'));
}

console.log('\n  ── the reasoning ──');
for (const line of d.trace) console.log(`  · ${line}`);

console.log(`\n  ── the decision ──`);
console.log(`  mode   ${d.mode === 'informed' ? 'INFORMED by ' + d.models.length + ' indexed model row(s)' : 'BLIND — no memory of previous rounds'}`);
console.log(`  rule   ${d.rule}`);
console.log(`  next   ${d.choice}\n`);

if (d.mode === 'blind') {
  console.log('  ⚠️ Without the index the allocator cannot see consecutive UNKNOWN streaks or');
  console.log('     cost-effectiveness across rounds, so it rotates and spends without memory.');
  console.log('     This is an illustration of the architecture, not a proof that the subgraph');
  console.log('     is necessary — see the header of allocator.mjs.\n');
}
