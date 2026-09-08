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
import { exportArtifacts } from './artifacts.mjs';
import { recordRun } from './registry.mjs';
import { buildReceipt, publishReceipt } from './receipt.mjs';
import { loadManifest, prepareTask } from './task.mjs';
import { requireSelfCheck } from './selfcheck.mjs';

const [, , spec] = process.argv;
if (!spec) {
  console.error('\nusage: npm run agent -- <provider/model>');
  console.error('  the task comes from contracts/src/tasks/manifest.json (override with TASK_MANIFEST)\n');
  process.exit(1);
}

let target;
try {
  target = resolve(spec);
} catch (e) {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
}
const { provider, model, price, baseUrl, apiKey } = target;

// ⚠️ R12 applies to a single run exactly as it does to a batch. This path was
// left out when the rule was first enforced, which is how a rule half-applied
// becomes a rule not applied.
process.stdout.write('self-check … ');
await requireSelfCheck();
console.log('✓');

const manifest = loadManifest();
process.stdout.write(`preparing ${manifest.id} — both proofs … `);
const prepared = await prepareTask(manifest);
console.log(`proof 1 ${prepared.proof_1}, proof 2 ${prepared.proof_2} (kind=${prepared.kind}) ✓`);
const taskPath = manifest.task.path;

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
  prepared,
  price,
  provider,
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
  if (run.gas) {
    const g = run.gas;
    console.log(`
scenario     ${g.scored} scored / ${g.skipped} skipped of ${g.scenario_inputs}
gas total    ${g.v1_total} (task)  ->  ${g.patch_total} (patch)
saved        ${g.saved_total} total, ${g.saved_per_call} per call
regression   ${g.patch_max_regression} max, on ${g.patch_regressed_inputs} input(s)   <- mandatory column
cost/1k gas  $${((run.usd / Math.max(g.saved_total, 1)) * 1000).toFixed(8)} per 1k gas saved`);
  }
  console.log(`\n${run.patch.source}\n`);
  if (run.patch.label === 'UNKNOWN') {
    console.log('⚠️  The prover did not terminate. This is NOT evidence of equivalence.\n');
  }
  // ── the canonical record ────────────────────────────────────────────
  const receipt = await buildReceipt({
    run,
    spec,
    taskSource: prepared.taskSource,
    taskPath,
    payment: run.payments?.[0] ?? null,
    payments: run.payments,
  });

  // ⚠️ Written BEFORE the receipt is published. The bundle is what makes the
  // receipt checkable; publishing a pointer to inputs nobody can fetch was the
  // gap this closes.
  const bundle = exportArtifacts({ receipt, prepared, run });
  console.log(`\nartifacts    ${bundle.dir}/  (${bundle.files.length} files, see RECOMPUTE.md)`);

  if (process.env.HCS_TOPIC_ID && process.argv.includes('--no-receipt') === false) {
    const ptr = await publishReceipt(receipt);
    console.log(`
receipt      HCS ${ptr.topic_id} seq ${ptr.sequence_number}  (${ptr.bytes} bytes, ${ptr.chunks} chunk)
             sha256 ${ptr.content_sha256.slice(0, 24)}…
             read back from mirror: found=${ptr.mirror.found} hash_matches=${ptr.mirror.matches}
             ${ptr.mirror.url}`);
    if (!ptr.mirror.matches) console.log('\n⚠️  MIRROR MISMATCH — the published record differs from what was sent.\n');

    // ⚠️ AFTER the HCS publish, never before: the row is a POINTER, and the
    // topic and sequence number it points at do not exist until the canonical
    // record does. A registry row written first would point at nothing.
    const reg = await recordRun(receipt, ptr);
    if (reg.recorded) {
      console.log(`registry     Base Sepolia ${reg.address}
             tx ${reg.tx}`);
    } else {
      // ⚠️ Not fatal, and not silent (§9). The run is paid for and its canonical
      // record exists; what is missing is the index card, so it would vanish
      // from the subgraph and from the allocator's memory. Queued for retry.
      console.log(`registry     NOT RECORDED — ${reg.reason}
             queued in harness/.runs/registry-pending.jsonl for retry`);
    }
  } else {
    console.log('\nreceipt      not published (HCS_TOPIC_ID unset or --no-receipt)');
  }

  if (receipt.artifacts.dirty) {
    console.log('\n⚠️  Working tree is dirty: the commit hash in the receipt does not describe what ran.');
  }
  if (receipt.guarantee && receipt.guarantee.mutation_refuted === false) {
    console.log('⚠️  mutation_refuted=false — placeholder task, no mutation applied. NOT a valid benchmark run.');
  }
} else {
  console.log(`\n✗ no patch passed the gates. Round outcomes: ${run.rounds.map((r) => r.outcome).join(' → ')}`);
  for (const r of run.rounds) {
    if (r.detail) console.log(`\n  round ${r.round} (${r.outcome}):\n    ${r.detail.replace(/\n/g, '\n    ')}`);
  }
  console.log();
}
