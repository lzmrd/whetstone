/**
 * The agent loop — WHETSTONE §5.
 *
 * Multi-turn with gate feedback, not single-shot. The rationale is the claim the
 * project makes: single-shot measures recall, iterating against a counterexample
 * measures whether the model can use evidence.
 *
 * ⚠️ Feedback is MECHANICAL OUTPUT ONLY -- the compiler's diagnostic, the prover's
 * counterexample, the gas number. No hints, nothing hand-written per model. The
 * moment feedback is tailored, the interface stops being a fixed independent
 * variable and the runs stop being comparable.
 */

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SYSTEM_PROMPT, PROMPT_HASH, assertClean, stripComments } from './prompt.mjs';
import { extractSolidity } from './extract.mjs';
import { compileToRuntime, PINS } from './compile.mjs';
import { equivalent, counterexampleFor } from './equivalence.mjs';
import { measurePatch } from './gas.mjs';
import { signPayment } from './pay.mjs';
import { differential, fuzzCampaign } from './differential.mjs';

/** §5: identical across all models and seeds. Changing one breaks comparability. */
export const INTERFACE = {
  max_rounds: 8,
  budget_usd_per_run: 0.05,
  // ⚠️ Part of the declared interface, like max_rounds -- NOT a tuning knob.
  // Reasoning models spend most of their budget thinking: gpt-oss-20b produced
  // 23 000 characters of reasoning and no answer, which the loop first recorded
  // as a format failure by the MODEL when it was truncation caused by OUR
  // ceiling. Truncation is now its own outcome, and comparable across models
  // precisely because the ceiling is fixed.
  // 6 000 rather than 8 000 because Groq's free tier caps a whole minute at
  // 8 000 tokens, prompt included, so a larger ceiling makes the request itself
  // unservable (HTTP 413).
  max_tokens: 6000,
  /**
   * ⚠️ FIXED AND DECLARED, replacing "provider default".
   *
   * The earlier §5 said temperature was the provider's default, "recorded in the
   * receipt" -- but no provider returns it, so the receipt recorded `null`. A
   * project that pins solc, the EVM version, optimizer runs, the checker, the
   * solver and the input vector was leaving free the one parameter that decides
   * what the model actually says, and could not reproduce its own runs.
   *
   * 0.2 is arbitrary, and that is fine: what matters is that it is fixed,
   * declared, and identical across models. Not 0, because R1 wants seeds to vary
   * sampling and at 0 they would not.
   *
   * ⚠️ This does NOT remove the variance. Four runs of one model on one task gave
   * +291, +136, +263 and -60 gas/call. Each round depends on the last, so
   * trajectories diverge even at low temperature -- D-13 stands, and medians with
   * dispersion are still the only honest way to report.
   */
  temperature: 0.2,
  prompt_hash: PROMPT_HASH,
};

const sha = (s) => createHash('sha256').update(s).digest('hex');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ⚠️ A rate limit is OUR infrastructure problem, not the model's answer. Retried
 * with the delay the provider asks for, and the attempt is not counted as a
 * round -- otherwise a busy provider would show up in the results as a model
 * that failed the task.
 */
async function callModel({ baseUrl, apiKey, model, messages, maxTokens, temperature, seed, log, gateway, payments }) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    let res;

    if (gateway) {
      // ── x402: ask, get refused, pay what the SERVER asks, ask again ──
      // The price comes from the 402 body, never from our own config: a client
      // that decides what to pay is not being gated by anything.
      const url = `${gateway}/v1/chat/completions`;
      const payload = JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, seed });
      const headers = { 'Content-Type': 'application/json' };

      const challenge = await fetch(url, { method: 'POST', headers, body: payload });
      if (challenge.status === 402) {
        const { accepts } = await challenge.json();
        const req = accepts?.[0];
        if (!req) throw new Error('gateway returned 402 with no payment requirements');
        const signed = await signPayment(req.amount, req.payTo);
        log?.(0, 'paid', `${req.amount} tinybar to ${req.payTo} — settling before inference`);
        res = await fetch(url, {
          method: 'POST',
          headers: { ...headers, 'X-PAYMENT': signed.header },
          body: payload,
        });
        const proof = res.headers.get('x-payment-response');
        if (proof) {
          const p = JSON.parse(Buffer.from(proof, 'base64').toString('utf8'));
          payments?.push({ amount_tinybar: req.amount, pay_to: req.payTo, ...p });
          log?.(0, 'settled', p.transaction);
        }
      } else {
        // ⚠️ A gateway that answers without demanding payment is not gating
        // anything. Refuse rather than quietly enjoying free inference.
        throw new Error(`gateway answered HTTP ${challenge.status} without a 402 challenge — it is not gating`);
      }
    } else {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        // ⚠️ `seed` is best-effort: the API accepts it, but providers batch
        // requests on shared GPUs and none guarantees bit-identical output.
        // Recorded as what we SENT, never claimed as what was honoured.
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, seed }),
      });
    }

    if (res.status === 429) {
      const body = await res.text();
      const s = Number(body.match(/try again in ([\d.]+)s/)?.[1] ?? 0);
      const wait = Math.min(Math.ceil((s || 5 * attempt) * 1000) + 500, 65000);
      log?.(0, 'ratelimit', `waiting ${(wait / 1000).toFixed(1)}s (attempt ${attempt}/4, not counted as a round)`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${model}: ${(await res.text()).slice(0, 300)}`);

    const json = await res.json();
    const choice = json.choices?.[0] ?? {};
    const usage = json.usage ?? {};
    return {
      reply: choice.message?.content ?? '',
      // Reasoning models put chain-of-thought here. It is NOT an answer, but its
      // presence distinguishes "produced nothing" from "reasoned past the limit".
      reasoning: choice.message?.reasoning ?? choice.message?.reasoning_content ?? '',
      finish: choice.finish_reason ?? 'unknown',
      tokensIn: usage.prompt_tokens ?? usage.input_tokens ?? 0,
      tokensOut: usage.completion_tokens ?? usage.output_tokens ?? 0,
      // ⚠️ Missing usage is not a warning. Without it the cost column does not
      // exist for this model, and the cost column is half the thesis.
      metered: Boolean(usage.prompt_tokens ?? usage.input_tokens),
    };
  }
  throw new Error(`rate limited by ${model} after 4 attempts`);
}

/**
 * @returns run record: the patch if one passed the gates, plus every round's
 *   outcome, token spend, and the reason the loop stopped.
 */
export async function runAgent({
  model,
  provider,
  gateway = process.env.GATEWAY_URL || null,
  // A task prepared and PROVED by task.mjs. Passing a bare path is no longer
  // allowed: a run whose two proofs were never checked is not a benchmark run.
  prepared,
  contractName = prepared?.manifest.task.contract ?? 'Candidate',
  sig = prepared?.manifest.task.sig ?? 'f(uint256)',
  price = { input: 0, output: 0 },
  maxRounds = INTERFACE.max_rounds,
  budgetUsd = INTERFACE.budget_usd_per_run,
  maxTokens = INTERFACE.max_tokens,
  temperature = INTERFACE.temperature,
  seed = 0,
  baseUrl = process.env.OPENCODE_BASE_URL ?? 'https://opencode.ai/zen/v1',
  apiKey = process.env.OPENCODE_API_KEY,
  log = () => {},
}) {
  if (!prepared) throw new Error('runAgent needs a task prepared by prepareTask(): both proofs must be checked first');
  const { taskSource, task: taskBuild, baseline } = prepared;
  assertClean(SYSTEM_PROMPT, 'system prompt');

  // The denominator, measured once per run against the same instrument the
  // patch will be measured with.
  const baselineGas = await measurePatch(taskBuild.path, baseline.path);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        `Optimise this for gas. Same contract name, same external signature, identical behaviour.\n\n` +
        `\`\`\`solidity\n${taskSource}\n\`\`\``,
    },
  ];

  const run = {
    model,
    task_hash: sha(taskSource),
    prompt_hash: PROMPT_HASH,
    temperature,
    seed,
    task_id: prepared.manifest.id,
    mutation_refuted: prepared.mutation_refuted,
    baseline_total: baselineGas.patch_total,
    proof_1: prepared.proof_1,
    toolchain: { ...PINS },
    rounds: [],
    tokens_in: 0,
    tokens_out: 0,
    payments: [],
    usd: 0,
    metered: true,
    patch: null,
    stop_reason: null,
  };

  for (let round = 1; round <= maxRounds; round++) {
    let call;
    try {
      call = await callModel({ baseUrl, apiKey, model: gateway ? `${provider}/${model}` : model, messages, maxTokens, temperature, seed, log, gateway, payments: run.payments });
    } catch (e) {
      run.rounds.push({ round, outcome: 'provider_error', detail: e.message });
      run.stop_reason = 'provider_error';
      return run;
    }

    run.tokens_in += call.tokensIn;
    run.tokens_out += call.tokensOut;
    run.usd = (run.tokens_in / 1e6) * price.input + (run.tokens_out / 1e6) * price.output;
    if (!call.metered) run.metered = false;

    messages.push({ role: 'assistant', content: call.reply });

    // ── truncation is ours, not theirs ───────────────────────────────────
    if (call.reply.trim() === '' && (call.finish === 'length' || call.reasoning)) {
      const why = call.finish === 'length'
        ? `output truncated at ${call.tokensOut} tokens (${call.reasoning.length} chars of reasoning, no answer)`
        : 'returned reasoning but no answer';
      log(round, 'truncated', why);
      run.rounds.push({ round, outcome: 'truncated', detail: why });
      messages.push({
        role: 'user',
        content: 'Your reply was cut off before any code. Answer with the solidity block only, no explanation.',
      });
      if (run.usd >= budgetUsd) { run.stop_reason = 'budget'; return run; }
      continue;
    }

    // ── gate 0: is there a file in there at all? ─────────────────────────
    const got = extractSolidity(call.reply);
    if (!got.ok) {
      log(round, 'format', got.reason);
      run.rounds.push({ round, outcome: 'format', detail: got.reason });
      messages.push({
        role: 'user',
        content:
          `${got.reason}\nReturn the complete file in a single \`\`\`solidity block, nothing else.`,
      });
    } else {
      // ── gate 1: does it compile, under the pinned toolchain? ───────────
      const built = await compileToRuntime(got.source, contractName);
      if (!built.ok) {
        log(round, 'compile', built.errors.split('\n')[0]);
        run.rounds.push({ round, outcome: 'compile', detail: built.errors.slice(0, 500) });
        messages.push({ role: 'user', content: `It does not compile:\n\n${built.errors}` });
      } else if (built.runtime === taskBuild.runtime) {
        // Identical bytecode is not a patch. Say so rather than spending a
        // proof on it and reporting a saving of zero as a result.
        log(round, 'nochange', 'bytecode identical to the input');
        run.rounds.push({ round, outcome: 'nochange' });
        messages.push({
          role: 'user',
          content: 'That compiles to bytecode identical to the input. Change the implementation.',
        });
      } else {
        // ── gate 3: does it still do the same thing? ────────────────────
        const eq = await equivalent(built.path, taskBuild.path, sig);
        if (eq.equivalent === true) {
          // ⚠️ Cross-check, not ceremony. A formal proof subsumes fuzzing, so a
          // DISAGREEMENT here cannot be a property of the patch -- it means our
          // own plumbing is broken (wrong bytecode etched, wrong file compared).
          // Cheap, and it fails loudly instead of silently scoring the wrong pair.
          const cross = await differential(taskBuild.path, built.path);
          if (!cross.passed) {
            throw new Error(
              `INTEGRITY FAILURE: hevm proved the patch equivalent, but gate ${cross.gate} found a ` +
                `divergence (${cross.counterexample ?? 'no counterexample parsed'}). These cannot both ` +
                `be true of the same pair of bytecodes. Do not score this run.`,
            );
          }
          log(round, 'proved', eq.label);
          const gas = await measurePatch(taskBuild.path, built.path);
          // ⚠️ Above 100% is expected and legitimate: the patch beat the
          // baseline, it did not violate a limit. The baseline is not a ceiling.
          const denom = gas.v1_total - baselineGas.patch_total;
          gas.baseline_total = baselineGas.patch_total;
          gas.relative_progress = denom > 0 ? Number((gas.saved_total / denom).toFixed(4)) : null;
          log(round, 'gas', `${gas.saved_per_call} gas/call saved, max regression ${gas.patch_max_regression}, ${(gas.relative_progress * 100).toFixed(1)}% of baseline`);
          run.rounds.push({ round, outcome: 'proved', label: eq.label, gas });
          run.patch = { source: got.source, runtime: built.runtime, path: built.path, label: eq.label };
          run.gas = gas;
          run.stop_reason = 'proved';
          return run;
        }
        if (eq.equivalent === false) {
          const cex = counterexampleFor(eq.output);
          log(round, 'refuted', 'counterexample returned to the model');
          run.rounds.push({ round, outcome: 'refuted' });
          messages.push({
            role: 'user',
            content: `Behaviour differs from the input. The prover found this:\n\n${cex}`,
          });
        } else {
          // ── level 3 gave up: fall back to level 2, do not fall through ────
          //
          // ⚠️ This branch used to accept the patch on the strength of having
          // compiled: label UNKNOWN, gas measured, receipt published, no
          // differential evidence of any kind. A ladder whose lower rungs are
          // skipped when the top one fails is not a ladder.
          log(round, 'unknown', 'prover did not terminate — falling back to gates 1 and 2');
          const diff = await differential(taskBuild.path, built.path);

          if (diff.passed) {
            const campaign = await fuzzCampaign();
            log(round, 'fuzzed', `${campaign.runs} runs, seed ${campaign.seed}, no divergence`);
            run.rounds.push({ round, outcome: 'fuzzed', label: 'FUZZED' });
            const gas = await measurePatch(taskBuild.path, built.path);
            const denom = gas.v1_total - baselineGas.patch_total;
            gas.baseline_total = baselineGas.patch_total;
            gas.relative_progress = denom > 0 ? Number((gas.saved_total / denom).toFixed(4)) : null;
            run.gas = gas;
            run.fuzz_campaign = campaign;
            run.patch = { source: got.source, runtime: built.runtime, path: built.path, label: 'FUZZED' };
            run.stop_reason = 'fuzzed';
            return run;
          }

          // The fuzzer found what the prover could not. This IS a model failure,
          // and the counterexample is mechanical output, so §5 allows feeding it back.
          log(round, 'refuted', `gate ${diff.gate} found a divergence the prover could not`);
          run.rounds.push({ round, outcome: 'refuted', by: `gate${diff.gate}` });
          messages.push({
            role: 'user',
            content:
              `Behaviour differs from the input. Differential testing found this ` +
              `counterexample:\n\n${diff.counterexample ?? diff.output.slice(-1200)}`,
          });
        }
      }
    }

    if (run.usd >= budgetUsd) {
      run.stop_reason = 'budget';
      return run;
    }
  }

  run.stop_reason = 'max_rounds';
  return run;
}
