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

/** §5: identical across all models and seeds. Changing one breaks comparability. */
export const INTERFACE = {
  max_rounds: 8,
  budget_usd_per_run: 0.05,
  prompt_hash: PROMPT_HASH,
};

const sha = (s) => createHash('sha256').update(s).digest('hex');

async function callModel({ baseUrl, apiKey, model, messages }) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${model}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();
  const usage = json.usage ?? {};
  return {
    reply: json.choices?.[0]?.message?.content ?? '',
    tokensIn: usage.prompt_tokens ?? usage.input_tokens ?? 0,
    tokensOut: usage.completion_tokens ?? usage.output_tokens ?? 0,
    // ⚠️ Missing usage is not a warning. Without it the cost column does not
    // exist for this model, and the cost column is half the thesis.
    metered: Boolean(usage.prompt_tokens ?? usage.input_tokens),
  };
}

/**
 * @returns run record: the patch if one passed the gates, plus every round's
 *   outcome, token spend, and the reason the loop stopped.
 */
export async function runAgent({
  model,
  taskPath,
  contractName = 'Candidate',
  sig = 'f(uint256)',
  price = { input: 0, output: 0 },
  maxRounds = INTERFACE.max_rounds,
  budgetUsd = INTERFACE.budget_usd_per_run,
  baseUrl = process.env.OPENCODE_BASE_URL ?? 'https://opencode.ai/zen/v1',
  apiKey = process.env.OPENCODE_API_KEY,
  log = () => {},
}) {
  const rawTask = await readFile(taskPath, 'utf8');
  const taskSource = stripComments(rawTask);

  // §5 gate. Throws rather than warns: a run that leaks the upstream identity
  // still produces a number, and that number is meaningless.
  //
  // Checked on the STRIPPED text, because that is what is sent -- but the strip
  // is then proved to have changed nothing that matters, below.
  assertClean(taskSource, `task file ${taskPath} (after comment stripping)`);
  assertClean(SYSTEM_PROMPT, 'system prompt');

  const rawBuild = await compileToRuntime(rawTask, contractName);
  if (!rawBuild.ok) throw new Error(`the task itself does not compile:\n${rawBuild.errors}`);

  const taskBuild = await compileToRuntime(taskSource, contractName);
  if (!taskBuild.ok) throw new Error(`the task does not compile after comment stripping:\n${taskBuild.errors}`);

  // ⚠️ The stripper is a regex and Solidity string literals can contain "//".
  // If it removed anything that reaches the bytecode, the model is being scored
  // on a different function than the one the repository holds. Refuse the run.
  if (rawBuild.runtime !== taskBuild.runtime) {
    throw new Error(
      'comment stripping changed the compiled bytecode -- the stripper corrupted the source. ' +
        'The model would be scored on a different function than the one in the repository.',
    );
  }

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
    toolchain: { ...PINS },
    rounds: [],
    tokens_in: 0,
    tokens_out: 0,
    usd: 0,
    metered: true,
    patch: null,
    stop_reason: null,
  };

  for (let round = 1; round <= maxRounds; round++) {
    let call;
    try {
      call = await callModel({ baseUrl, apiKey, model, messages });
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
          log(round, 'proved', eq.label);
          run.rounds.push({ round, outcome: 'proved', label: eq.label });
          run.patch = { source: got.source, runtime: built.runtime, path: built.path, label: eq.label };
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
          // ⚠️ UNKNOWN is not a failure by the model and must not be fed back
          // as one. The prover gave up; that is our limitation, not its patch.
          log(round, 'unknown', 'prover did not terminate — keeping the patch, label UNKNOWN');
          run.rounds.push({ round, outcome: 'unknown' });
          run.patch = { source: got.source, runtime: built.runtime, path: built.path, label: 'UNKNOWN' };
          run.stop_reason = 'prover_unknown';
          return run;
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
