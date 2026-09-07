/**
 * One agent run against one model. The CLI in front of agent.mjs.
 *
 *   cd harness && npm run agent -- <model> [taskPath]
 *
 * ⚠️ This does NOT produce a leaderboard row yet: gas is not measured here and
 * no receipt is written. It answers the day-1 question that everything else
 * rests on -- can a model return a patch we can compile and prove?
 */

import { runAgent, INTERFACE } from './agent.mjs';
import { checkerVersion } from './equivalence.mjs';
import { resolve, TABLE_HASH } from './providers.mjs';

const [, , spec, taskPath = '../contracts/src/tasks/Task.sol'] = process.argv;
if (!spec) {
  console.error('\nusage: npm run agent -- <provider/model> [task.sol]\n');
  process.exit(1);
}

let target;
try {
  target = resolve(spec);
} catch (e) {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
}
const { model, price, baseUrl, apiKey } = target;

const pad = (s, n) => String(s).padEnd(n);
console.log(`
model        ${spec}   ($${price.input} / $${price.output} per 1M list)
task         ${taskPath}
interface    max_rounds=${INTERFACE.max_rounds}  budget=$${INTERFACE.budget_usd_per_run}  prompt=${INTERFACE.prompt_hash.slice(0, 12)}
checker      ${await checkerVersion()}
prices       v${(await import('./providers.mjs')).TABLE._version}  sha256:${TABLE_HASH.slice(0, 12)}
`);

const t0 = Date.now();
const run = await runAgent({
  model,
  taskPath,
  price,
  baseUrl,
  apiKey,
  log: (round, outcome, detail) =>
    console.log(`  round ${round}  ${pad(outcome, 9)} ${detail ?? ''}`),
});
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`
stopped      ${run.stop_reason}   after ${run.rounds.length} round(s), ${secs}s
tokens       ${run.tokens_in} in / ${run.tokens_out} out
cost         $${run.usd.toFixed(6)} at list price${run.metered ? '' : '   ⚠️ NOT METERED — provider returned no usage'}`);

if (run.patch) {
  console.log(`guarantee    ${run.patch.label}`);
  console.log(`bytecode     ${run.patch.runtime.length / 2} bytes`);
  console.log(`\n${run.patch.source}\n`);
  if (run.patch.label === 'UNKNOWN') {
    console.log('⚠️  The prover did not terminate. This is NOT evidence of equivalence.\n');
  }
} else {
  console.log(`\n✗ no patch passed the gates. Round outcomes: ${run.rounds.map((r) => r.outcome).join(' → ')}`);
  for (const r of run.rounds) {
    if (r.detail) console.log(`\n  round ${r.round} (${r.outcome}):\n    ${r.detail.replace(/\n/g, '\n    ')}`);
  }
  console.log();
}
