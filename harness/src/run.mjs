/**
 * One agent run against one model. The CLI in front of agent.mjs.
 *
 *   cd harness && npm run agent -- <model> [taskPath]
 *
 * ⚠️ This does NOT produce a leaderboard row yet: gas is not measured here and
 * no receipt is written. It answers the day-1 question that everything else
 * rests on -- can a model return a patch we can compile and prove?
 */

import { readFileSync } from 'node:fs';
import { runAgent, INTERFACE } from './agent.mjs';
import { checkerVersion } from './equivalence.mjs';

const [, , model, taskPath = '../contracts/src/tasks/Task.sol'] = process.argv;
if (!model) {
  console.error('\nusage: npm run agent -- <model-id> [task.sol]\n');
  process.exit(1);
}

const table = JSON.parse(readFileSync(new URL('./prices.json', import.meta.url), 'utf8'));
const price = table.prices[model];
if (!price) {
  console.error(`\n✗ No pinned price for "${model}".`);
  console.error('  A model that cannot be metered must not appear in the leaderboard.');
  console.error(`  Transcribe its price from ${table._source} into prices.json.\n`);
  process.exit(1);
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`
model        ${model}   ($${price.input} / $${price.output} per 1M)
task         ${taskPath}
interface    max_rounds=${INTERFACE.max_rounds}  budget=$${INTERFACE.budget_usd_per_run}  prompt=${INTERFACE.prompt_hash.slice(0, 12)}
checker      ${await checkerVersion()}
`);

const t0 = Date.now();
const run = await runAgent({
  model,
  taskPath,
  price,
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
