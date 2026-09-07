/**
 * n seeds against one model, reported as a median with dispersion.
 *
 *   cd harness && npm run batch -- <provider/model> [n] [task.sol]
 *
 * ⚠️ R5 and D-13 required this from the first revision of the spec and nothing
 * implemented it, so every number quoted so far has been a single run. Four
 * single runs of one model on one task gave +291, +136, +263 and -60 gas/call.
 * Publishing the first would have been a beautiful, false story.
 *
 * n=5 gives a median and a spread. It does NOT give statistical power:
 * separating a 2% difference needs roughly 9 runs and 1% about 36. Ties are the
 * normal outcome here and are printed as ties.
 */

import { readFileSync } from 'node:fs';
import { runAgent, INTERFACE } from './agent.mjs';
import { resolve } from './providers.mjs';
import { buildReceipt, publishReceipt } from './receipt.mjs';
import { loadManifest, prepareTask } from './task.mjs';

const [, , spec, nRaw = '5', taskPath = '../contracts/src/tasks/Task.sol'] = process.argv;
if (!spec) {
  console.error('\nusage: npm run batch -- <provider/model> [n] [task.sol]\n');
  process.exit(1);
}
const n = Number(nRaw);

const median = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const quantile = (xs, q) => {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))];
};

const target = resolve(spec);
const manifest = loadManifest();
process.stdout.write(`preparing task ${manifest.id} — running both proofs … `);
const prepared = await prepareTask(manifest);
console.log(`proof 1 ${prepared.proof_1}, proof 2 REFUTED ✓`);
const taskSource = prepared.taskSource;

console.log(`
model        ${spec}
task         ${manifest.id}   (${manifest.task.path})
mutation     ${manifest.mutation.description}
seeds        ${n}   temperature ${INTERFACE.temperature}   max_rounds ${INTERFACE.max_rounds}
`);

const results = [];
for (let seed = 1; seed <= n; seed++) {
  process.stdout.write(`  seed ${seed}/${n} … `);
  let run;
  try {
    run = await runAgent({
      model: target.model,
      provider: target.provider,
      baseUrl: target.baseUrl,
      apiKey: target.apiKey,
      price: target.price,
      prepared,
      seed,
    });
  } catch (e) {
    console.log(`✗ ${e.message.slice(0, 80)}`);
    results.push({ seed, ok: false, reason: e.message });
    continue;
  }

  const g = run.gas;
  if (!run.patch) {
    console.log(`✗ ${run.stop_reason} after ${run.rounds.length} round(s)`);
    results.push({ seed, ok: false, reason: run.stop_reason, rounds: run.rounds.length, usd: run.usd });
    continue;
  }
  console.log(
    `${String(g.saved_per_call).padStart(5)} gas/call  reg ${String(g.patch_max_regression).padStart(4)}  ` +
      `${run.rounds.length} round(s)  $${run.usd.toFixed(6)}  ${run.patch.label}`,
  );
  results.push({ seed, ok: true, run, ...g, usd: run.usd, label: run.patch.label, rounds: run.rounds.length });

  if (process.env.HCS_TOPIC_ID) {
    const receipt = await buildReceipt({ run, spec, taskSource, taskPath, payments: run.payments });
    const ptr = await publishReceipt(receipt);
    if (!ptr.mirror.matches) console.log(`     ⚠️ receipt seq ${ptr.sequence_number} FAILED read-back`);
  }
}

const ok = results.filter((r) => r.ok);
console.log(`\n── leaderboard row ──────────────────────────────────────────`);
if (ok.length === 0) {
  console.log(`  ${spec}: no run produced a patch. Reasons: ${results.map((r) => r.reason).join(', ')}\n`);
  process.exit(0);
}

const saved = ok.map((r) => r.saved_per_call);
const rel = ok.map((r) => r.relative_progress).filter((x) => x != null);
const regs = ok.map((r) => r.patch_max_regression);
const costs = ok.map((r) => r.usd);

console.log(`  model            ${spec}`);
console.log(`  runs             ${ok.length}/${n} produced a patch`);
console.log(`  gas/call         median ${median(saved)}   min ${Math.min(...saved)}   max ${Math.max(...saved)}   p25 ${quantile(saved, 0.25)}  p75 ${quantile(saved, 0.75)}`);
console.log(`  max regression   median ${median(regs)}   worst ${Math.max(...regs)}          <- mandatory column`);
console.log(`  cost             median $${median(costs).toFixed(6)}   total $${costs.reduce((a, b) => a + b, 0).toFixed(6)}`);
if (rel.length) console.log(`  vs baseline      median ${(median(rel) * 100).toFixed(1)}%   (>100% = beat the baseline, expected and legitimate)`);
console.log(`  labels           ${[...new Set(ok.map((r) => r.label))].join(', ')}`);

// ⚠️ A spread that straddles zero is not "the model saves ~X gas".
if (Math.min(...saved) < 0 && Math.max(...saved) > 0) {
  console.log(`
  ⚠️ THE SPREAD CROSSES ZERO. This model sometimes improves the function and
     sometimes makes it worse, with every patch proved equivalent. Reporting the
     median alone here would hide the finding rather than summarise it.`);
}
console.log();
