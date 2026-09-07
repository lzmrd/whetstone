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

const git = (args) => {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch { return null; }
};

export async function buildReceipt({ run, spec, taskSource, taskPath, payment }) {
  const dirty = git(['status', '--porcelain']) !== '';

  return {
    schema: 'whetstone/receipt/v2',
    run_id: `${Date.now().toString(36)}-${sha256(spec + taskSource).slice(0, 8)}`,
    round: run.rounds.length,
    // ⚠️ Never "final" while the baseline does not exist. See gas.relative_progress.
    status: 'provisional',

    task: {
      function: taskPath,
      variant_hash: sha256(taskSource),
      baseline_hash: null,
      scenario_id: run.gas?.scenario_id ?? null,
      scenario_name: 'boundary/v1',
      prompt_hash: run.prompt_hash,
    },

    agent: {
      model: spec,
      seed: null,
      temperature: null,
      max_rounds: 8,
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
      hbar_paid: payment?.hbar ?? '0',
      settle_tx: payment?.transaction_id ?? null,
    },

    gas: run.gas
      ? {
          inputs: run.gas.scenario_inputs,
          scored: run.gas.scored,
          skipped: run.gas.skipped,
          v1_total: run.gas.v1_total,
          patch_total: run.gas.patch_total,
          saved_total: run.gas.saved_total,
          patch_max_regression: run.gas.patch_max_regression,
          patch_regressed_inputs: run.gas.patch_regressed_inputs,
          // ⚠️ null, not 0. Relative progress needs a baseline, the baseline is
          // solady under the mutation M, and M does not exist yet. Reporting a
          // number here would invent a denominator.
          baseline_total: null,
          relative_progress: null,
        }
      : null,

    guarantee: run.patch
      ? {
          label: run.patch.label,
          bounds: { max_iterations: -1, max_input_len: null },
          assumptions: [],
          reverts_covered: true,
          // ⚠️ false because the task is the PLACEHOLDER: no mutation has been
          // applied, so nothing was refuted. A run with this false is not a
          // valid benchmark run, and saying so in the record is the point.
          mutation_refuted: false,
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
    },

    artifacts: {
      repo: 'https://github.com/lzmrd/whetstone',
      commit: git(['rev-parse', 'HEAD']),
      // ⚠️ A dirty tree means the commit hash does not describe what ran.
      dirty,
      patch_sha256: run.patch ? sha256(run.patch.source) : null,
    },

    timestamp: new Date().toISOString(),
  };
}

export async function publishReceipt(receipt) {
  const ptr = await submitReceipt(receipt);
  const check = await verifyOnMirror(ptr.topic_id, ptr.sequence_number, ptr.content_sha256, { chunks: ptr.chunks });
  return { ...ptr, mirror: check };
}
