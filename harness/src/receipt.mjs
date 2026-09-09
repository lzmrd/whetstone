/**
 * Build the receipt, write it to HCS, and read it back.
 *
 * Schema whetstone/receipt/v2, RUNBOOK. Every field is there because something
 * breaks without it -- a score with no scenario id is undefined, a cost with no
 * price-table hash is unauditable, a guarantee label with no checker version is
 * a claim about a tool that may since have changed behaviour.
 */

import { execFileSync } from 'node:child_process';
import { submitReceipt, verifyOnMirror, sha256 } from './hcs.mjs';
import { TABLE, TABLE_HASH } from './providers.mjs';
import { PINS } from './compile.mjs';
import { checkerVersion, CHECKER } from './equivalence.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));

/**
 * ⚠️ Provenance, and it was documented in the receipt schema for days without
 * ever being emitted. The task and baseline sources are INLINED, so these are not
 * build inputs — but they are the answer to "whose code is this baseline?", and
 * the whole anti-circularity argument is that the efficient code is Vectorized's
 * and only the mutation is ours. A claim about provenance with no version behind
 * it is not checkable.
 */
function libVersion(name) {
  const f = join(REPO, 'lib', name, '.pinned-version');
  return existsSync(f) ? readFileSync(f, 'utf8').trim() : null;
}

const git = (args) => {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch { return null; }
};

export async function buildReceipt({ run, spec, taskSource, taskPath, payment, payments = [] }) {
  const dirty = git(['status', '--porcelain']) !== '';

  return {
    schema: 'whetstone/receipt/v2',
    run_id: `${Date.now().toString(36)}-${sha256(spec + taskSource).slice(0, 8)}`,
    round: run.rounds.length,
    // ⚠️ Never "final" while the baseline does not exist. See gas.relative_progress.
    // "unpaid" is stronger than provisional: the run bypassed the x402 gateway and
    // must not appear in a leaderboard at all.
    status: run.paid === false ? 'unpaid — NOT SCOREABLE' : 'provisional',

    task: {
      id: run.task_id,
      function: taskPath,
      sig: run.sig ?? null,
      variant_hash: sha256(taskSource),
      // ⚠️ Was `run.baseline_hash ?? null` against a run object that never set
      // it, so every published receipt carried null -- the same
      // documented-but-unemitted failure as oz_version. The baseline IS the
      // denominator: a receipt that does not commit to it cannot support
      // "nobody has to take our word that the baseline was not shaped to
      // flatter or punish".
      baseline_hash: run.baseline_runtime ? sha256(run.baseline_runtime) : null,
      scenario_id: run.gas?.scenario_id ?? null,
      // ⚠️ Reported BY THE MEASUREMENT, beside the digest it belongs to. This
      // used to be a regex over Scenario.sol, which was safe while the file
      // held one scenario and silently wrong the moment it held two: it matched
      // the first NAME and every run claimed "boundary/v1". A name and a digest
      // that can disagree are two facts about one thing; they now come from the
      // same line of output.
      scenario_name: run.gas?.scenario_name ?? null,
      prompt_hash: run.prompt_hash,
    },

    agent: {
      model: spec,
      seed: run.seed,
      // ⚠️ What we SENT. No provider guarantees it was honoured bit-for-bit.
      temperature: run.temperature,
      // ⚠️ What THIS run was allowed, carried on the run itself. It was the
      // literal 8, a second copy of INTERFACE.max_rounds: the first change to
      // the declared interface would have published receipts describing a run
      // that never happened. Reading the constant instead would fix the drift
      // and still describe the constant rather than the run.
      max_rounds: run.max_rounds ?? null,
      rounds_used: run.rounds.length,
      outcomes: run.rounds.map((r) => r.outcome),
      stop_reason: run.stop_reason,
    },

    cost: {
      tokens_in: run.tokens_in,
      tokens_out: run.tokens_out,
      price_table: { version: TABLE._version, sha256: TABLE_HASH, retrieved: TABLE.providers[spec.split('/')[0]]?.retrieved ?? null },
      // ⚠️ usd_list and hbar_paid are DIFFERENT NUMBERS and must never be
      // conflated. usd_list is "what this would cost anyone" at published list
      // price; hbar_paid is what actually moved on Hedera.
      usd_list: run.usd.toFixed(8),
      // What actually moved on Hedera: one settled payment per round, summed.
      hbar_paid: (payments.reduce((n, p) => n + Number(p.amount_tinybar), 0) / 1e8).toFixed(8),
      settlements: payments.map((p) => ({ tx: p.transaction, amount_tinybar: p.amount_tinybar, pay_to: p.pay_to })),
      settle_tx: payments[0]?.transaction ?? payment?.transaction_id ?? null,
      paid_through_gateway: run.paid === true,
    },

    gas: run.gas
      ? {
          inputs: run.gas.scenario_inputs,
          scored: run.gas.scored,
          skipped: run.gas.skipped,
          v1_total: run.gas.v1_total,
          patch_total: run.gas.patch_total,
          saved_total: run.gas.saved_total,
          // ⚠️ The headline number, and it was NOT in the receipt. Every batch
          // record, every leaderboard row and the CLI all report gas per call,
          // and the canonical record carried only the total -- so a consumer had
          // to re-derive the primary metric and hope it divided by the same
          // denominator we did. Found while mapping the receipt onto the
          // registry event: the field read 0 for a run that saved 201.
          saved_per_call: run.gas.saved_per_call,
          patch_max_regression: run.gas.patch_max_regression,
          patch_regressed_inputs: run.gas.patch_regressed_inputs,
          // ⚠️ null, not 0. Relative progress needs a baseline, the baseline is
          // solady under the mutation M, and M does not exist yet. Reporting a
          // number here would invent a denominator.
          baseline_total: run.gas.baseline_total ?? null,
          relative_progress: run.gas.relative_progress ?? null,
          // ⚠️ Part of the gap is a dead overflow check that a one-word edit
          // removes. Without this a model scoring at the floor looks like it
          // optimised something; it may have understood nothing.
          trivial_total: run.trivial_total ?? null,
          trivial_saves_per_call: run.trivial_saves_per_call ?? null,
          beats_trivial_by: run.gas.beats_trivial_by ?? null,
        }
      : null,

    guarantee: run.patch
      ? {
          label: run.patch.label,
          bounds: { max_iterations: -1, max_input_len: null },
          assumptions: [],
          // ⚠️ §7: FUZZED must carry "campaigns, seeds, corpus, ranges, and what
          // was compared". Without it the label asserts nothing -- 20 000 runs
          // and 20 runs would print identically. Null on a FORMAL_* label, where
          // the proof, not a campaign, is the evidence.
          fuzz_campaign: run.patch.label === 'FUZZED' ? (run.fuzz_campaign ?? null) : null,
          reverts_covered: true,
          // Verified per run by task.mjs, not asserted: hevm must REFUTE
          // task == original, or prepareTask throws and nothing is scored.
          mutation_refuted: run.mutation_refuted === true,
          // ⚠️ mutation_refuted alone is an EXISTENCE claim: hevm needs one
          // divergent input out of 2**256 to refute. R4 asks that a memorised
          // answer become wrong, which is about measure, not existence -- a bare
          // revert bolted onto the untouched body refutes identically and leaves
          // the body correct everywhere else. This is the fraction, and the gate
          // that enforces it is proof 2b in task.mjs.
          mutation_strength: run.mutation_strength ?? null,
          proof_1_baseline_equals_task: run.proof_1 ?? null,
          proof_3_trivial_equals_task: run.proof_3 ?? null,
        }
      : null,

    toolchain: {
      solc: PINS.solc,
      evm_version: PINS.evmVersion,
      optimizer_runs: PINS.optimizerRuns,
      bytecode_hash: 'none',
      checker: CHECKER.name,
      checker_version: await checkerVersion(),
      solver: CHECKER.solver,
      oz_version: libVersion('openzeppelin-contracts'),
      solady_version: libVersion('solady'),
      forge_std_version: libVersion('forge-std'),
    },

    artifacts: {
      repo: 'https://github.com/lzmrd/whetstone',
      commit: git(['rev-parse', 'HEAD']),
      // ⚠️ A dirty tree means the commit hash does not describe what ran.
      dirty,
      patch_sha256: run.patch ? sha256(run.patch.source) : null,
      // ⚠️ The SOURCE, not only its hash. A receipt that commits to the hash of
      // a patch nobody can fetch is not verifiable: "anyone can recompute this"
      // requires that anyone can obtain the thing to recompute. Costs one extra
      // HCS chunk.
      patch_source: run.patch?.source ?? null,
    },

    timestamp: new Date().toISOString(),
  };
}

export async function publishReceipt(receipt) {
  const ptr = await submitReceipt(receipt);
  const check = await verifyOnMirror(ptr.topic_id, ptr.sequence_number, ptr.content_sha256, { chunks: ptr.chunks });
  return { ...ptr, mirror: check };
}
