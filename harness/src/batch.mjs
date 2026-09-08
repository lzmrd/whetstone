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
import { createHash } from 'node:crypto';
import { resolve } from './providers.mjs';
import { buildReceipt, publishReceipt } from './receipt.mjs';
import { loadManifest, prepareTask } from './task.mjs';
import { requireSelfCheck } from './selfcheck.mjs';
import { recordRun } from './registry.mjs';
import { exportArtifacts } from './artifacts.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ⚠️ A batch is by definition a measured run, so an unpaid one is meaningless.
if (!process.env.GATEWAY_URL) {
  console.error('\n✗ GATEWAY_URL is not set. A batch reaches the models through the x402 gateway or not at all.');
  console.error('  Start it with: npm run gateway\n');
  process.exit(1);
}

// R12 — before anything is measured.
process.stdout.write('self-check … ');
await requireSelfCheck();
console.log('revert payloads compared, instrument order-neutral, scenario digest matches ✓');

const manifest = loadManifest();
process.stdout.write(`preparing task ${manifest.id} — running both proofs … `);
const prepared = await prepareTask(manifest);
// ⚠️ Print the OUTCOME, not a fixed string. This line said "proof 2 REFUTED ✓"
// unconditionally and printed it for a control whose proof 2 had PASSED --
// the log asserting the opposite of what was measured.
console.log(
  `kind=${prepared.kind}  proof 1 ${prepared.proof_1}  proof 2 ${prepared.proof_2}` +
    ` (${prepared.kind === 'semantic' ? 'refutation required' : 'equivalence required'}) ✓`,
);
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
    console.log(`✗ ${e.message.slice(0, 160)}`);
    results.push({ seed, ok: false, reason: e.message });
    continue;
  }

  const g = run.gas;
  if (!run.patch) {
    const last = run.rounds[run.rounds.length - 1];
    console.log(`✗ ${run.stop_reason} after ${run.rounds.length} round(s)  ${(last?.detail ?? '').slice(0, 150)}`);
    results.push({ seed, ok: false, reason: run.stop_reason, rounds: run.rounds.length, usd: run.usd });
    // ⚠️ A seed that bought inference and produced nothing is still a row: the
    // allocator budgets across providers and money burned is money burned.
    if (process.env.RUN_REGISTRY_ADDRESS) {
      const failed = await buildReceipt({ run, spec, taskSource, taskPath, payments: run.payments });
      const reg = await recordRun(failed, {});
      if (!reg.recorded) console.log(`     ⚠️ registry: ${reg.reason}`);
    }
    continue;
  }
  console.log(
    `${String(g.saved_per_call).padStart(5)} gas/call  ` +
      `${String(((g.relative_progress ?? 0) * 100).toFixed(0)).padStart(4)}% of base  ` +
      `${g.beats_trivial_by != null ? `${g.beats_trivial_by >= 0 ? '+' : ''}${g.beats_trivial_by}`.padStart(5) : '    —'} vs floor  ` +
      `reg ${String(g.patch_max_regression).padStart(4)}  ` +
      `${run.rounds.length} round(s)  $${run.usd.toFixed(6)}  ${run.patch.label}`,
  );
  results.push({ seed, ok: true, run, ...g, usd: run.usd, label: run.patch.label, rounds: run.rounds.length });

  if (process.env.HCS_TOPIC_ID) {
    const receipt = await buildReceipt({ run, spec, taskSource, taskPath, payments: run.payments });
    const ptr = await publishReceipt(receipt);
    if (!ptr.mirror.matches) console.log(`     ⚠️ receipt seq ${ptr.sequence_number} FAILED read-back`);
    /**
     * ⚠️ These three steps were in run.mjs and NOT here, so a batch published
     * receipts to Hedera and wrote nothing to Base Sepolia -- the subgraph, the
     * allocator's memory and the leaderboard would all have stayed empty while
     * the run log said everything succeeded. Exactly the "wired in one entry
     * point, not the other" failure this repository has already hit in the
     * opposite direction.
     */
    exportArtifacts({ receipt, prepared, run });
    const reg = await recordRun(receipt, ptr);
    console.log(reg.recorded
      ? `     receipt seq ${ptr.sequence_number} · registry ${reg.tx.slice(0, 12)}…`
      : `     ⚠️ registry NOT RECORDED — ${reg.reason}`);
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

// ⚠️ The floor answers what the percentage cannot: did the model do better than a
// one-word edit? Part of the gap is a dead overflow check the compiler cannot
// remove; recovering it needs no understanding of the function.
const floor = ok[0]?.run?.trivial_saves_per_call ?? null;
if (floor != null) {
  const beats = ok.map((r) => r.beats_trivial_by).filter((x) => x != null);
  const below = ok.filter((r) => r.saved_per_call <= floor).length;
  console.log(`  trivial floor    ${floor} gas/call — recoverable by one word, no understanding required`);
  console.log(`  vs floor         median ${median(beats) >= 0 ? '+' : ''}${median(beats)}   ${below} of ${ok.length} run(s) did NOT beat the one-word edit`);
}
console.log(`  labels           ${[...new Set(ok.map((r) => r.label))].join(', ')}`);

// ── R6: the machine-readable half of the leaderboard ─────────────────────
// ⚠️ The rule promised "CLI/JSON" and only the CLI existed. The registry event,
// the subgraph, the web view and any third party recomputing a row all read
// this, not the table above.
const sha256 = (hex) => createHash('sha256').update(String(hex)).digest('hex');

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const outDir = join(REPO, '.run', 'batches');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${Date.now()}-${spec.replace(/[/:]/g, '_')}.json`);
writeFileSync(outFile, JSON.stringify({
  schema: 'whetstone/batch/v1',
  model: spec,
  // ⚠️ `digest` is the identity; `mutation` is a human label and binds nothing.
  // The control batch shipped a description of `* 128` / `/ 8` for a file that
  // had already been rewritten to keep `<< 7` / `>> 3` -- the record named a
  // mutation that never ran. Scenario.sol solved exactly this for the input
  // vector and the lesson had not been carried across to the task.
  task: { id: manifest.id, kind: prepared.kind, path: manifest.task.path,
          digest: sha256(prepared.task.runtime),
          baseline_digest: sha256(prepared.baseline.runtime),
          mutation: manifest.mutation.description,
          proof_1: prepared.proof_1, proof_2: prepared.proof_2,
          mutation_strength: prepared.mutation_strength,
          mutation_refuted: prepared.mutation_refuted },
  interface: { seeds: n, temperature: INTERFACE.temperature, max_rounds: INTERFACE.max_rounds,
               max_tokens: INTERFACE.max_tokens, prompt_hash: INTERFACE.prompt_hash },
  summary: {
    produced_patch: ok.length, attempted: n,
    gas_per_call: { median: median(saved), min: Math.min(...saved), max: Math.max(...saved),
                    p25: quantile(saved, 0.25), p75: quantile(saved, 0.75) },
    max_regression: { median: median(regs), worst: Math.max(...regs) },
    relative_progress_median: rel.length ? median(rel) : null,
    usd_list: { median: median(costs), total: costs.reduce((a, b) => a + b, 0) },
    labels: [...new Set(ok.map((r) => r.label))],
    // Non-null only when some run actually earned FUZZED.
    fuzz_campaign: ok.find((r) => r.label === 'FUZZED')?.run?.fuzz_campaign ?? null,
    trivial_floor_per_call: ok[0]?.run?.trivial_saves_per_call ?? null,
    runs_not_beating_trivial: ok.filter((r) => r.run?.trivial_saves_per_call != null
      && r.saved_per_call <= r.run.trivial_saves_per_call).length,
    // ⚠️ Carried explicitly so a consumer cannot summarise it away.
    spread_crosses_zero: Math.min(...saved) < 0 && Math.max(...saved) > 0,
  },
  runs: results.map((r) => r.ok
    ? { seed: r.seed, ok: true, saved_per_call: r.saved_per_call, saved_total: r.saved_total,
        max_regression: r.patch_max_regression, regressed_inputs: r.patch_regressed_inputs,
        beats_trivial_by: r.beats_trivial_by ?? null,
        relative_progress: r.relative_progress, label: r.label, rounds: r.rounds, usd: r.usd }
    : { seed: r.seed, ok: false, reason: r.reason, rounds: r.rounds ?? 0 }),
  generated_at: new Date().toISOString(),
}, null, 2) + '\n');
console.log(`  json             ${outFile.replace(REPO, '')}`);

// ⚠️ A spread that straddles zero is not "the model saves ~X gas".
if (Math.min(...saved) < 0 && Math.max(...saved) > 0) {
  console.log(`
  ⚠️ THE SPREAD CROSSES ZERO. This model sometimes improves the function and
     sometimes makes it worse, with every patch proved equivalent. Reporting the
     median alone here would hide the finding rather than summarise it.`);
}
console.log();
