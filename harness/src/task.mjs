/**
 * Load a task, its baseline and its unmutated original, and VERIFY the two
 * proofs R4 and §4 require before any run is scored.
 *
 * ⚠️ mutation_refuted used to be a hand-set boolean in the receipt. A property
 * asserted by whoever wrote the JSON is not a property. Both proofs now run, and
 * a task that fails either cannot be used.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileToRuntime } from './compile.mjs';
import { equivalent } from './equivalence.mjs';
import { mutationStrength, differential, fuzzCampaign } from './differential.mjs';
import { stripComments, assertClean } from './prompt.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));

export function loadManifest(path = process.env.TASK_MANIFEST ?? 'contracts/src/tasks/manifest.json') {
  return JSON.parse(readFileSync(join(REPO, path), 'utf8'));
}


/**
 * Establish that two runtimes agree, at the STRONGEST level available.
 *
 * ⚠️ This exists to remove an asymmetry that was never argued for. The patch a
 * model writes climbs a ladder: prover, then gate 1 over the committed
 * scenario, then gate 2 over 20 001 fuzz runs, and a patch that reaches only
 * the second rung is accepted and labelled FUZZED. The task's OWN setup had no
 * ladder -- proof 1 and proof 3 demanded the top rung or nothing.
 *
 * So the project applied its weaker standard to the code it judges and its
 * stronger one to the code it writes, and the effect was not neutral: it
 * excluded every target where hevm does not terminate. Those are exactly the
 * string-building functions, which carry two orders of magnitude more headroom
 * than log256 and are the only place the four-label vocabulary could ever print
 * a second label. A rule that quietly decides which functions exist is a claim
 * about the world, and this one was never stated.
 *
 * ⚠️ What does NOT change: a proof is still a proof and evidence is still
 * evidence. The level is recorded and travels into the receipt, and a task
 * admitted at FUZZED CAPS every run scored on it -- no patch can be published
 * with a guarantee stronger than the setup it rests on.
 *
 * @returns {{level: 'FORMAL'|'FUZZED', label: string, campaign: object|null}}
 */
async function establishEquivalence(aPath, bPath, sig, what) {
  const eq = await equivalent(aPath, bPath, sig);
  if (eq.equivalent === true) return { level: 'FORMAL', label: eq.label, campaign: null };
  if (eq.equivalent === false) {
    throw new Error(
      `${what} FAILED (REFUTED): hevm found an input where they differ. This is a refutation, ` +
        `not an inconclusive result, and no amount of fuzzing overrides it.`,
    );
  }

  const diff = await differential(aPath, bPath, sig);
  if (!diff.passed) {
    throw new Error(
      `${what} FAILED: the prover did not terminate AND gate ${diff.gate} found a divergence. ` +
        `${diff.counterexample ?? ''}`,
    );
  }
  const campaign = await fuzzCampaign();
  return { level: 'FUZZED', label: 'FUZZED', campaign };
}

export async function prepareTask(manifest) {
  const read = (p) => readFileSync(join(REPO, p), 'utf8');

  const taskRaw = read(manifest.task.path);
  const taskSource = stripComments(taskRaw);
  // Only the task is ever sent, so only the task is gated. The baseline and the
  // original may name anything -- they exist on our side of the wall.
  assertClean(taskSource, `task ${manifest.task.path}`);

  const task = await compileToRuntime(taskSource, manifest.task.contract);
  const baseline = await compileToRuntime(stripComments(read(manifest.baseline.path)), manifest.baseline.contract);
  const original = await compileToRuntime(stripComments(read(manifest.original.path)), manifest.original.contract);
  const trivial = manifest.trivial
    ? await compileToRuntime(stripComments(read(manifest.trivial.path)), manifest.trivial.contract)
    : null;
  for (const [name, b] of [['task', task], ['baseline', baseline], ['original', original],
                           ...(trivial ? [['trivial', trivial]] : [])]) {
    if (!b.ok) throw new Error(`${name} does not compile:\n${b.errors}`);
  }

  const sig = manifest.task.sig;

  // proof 1 — the baseline computes the task. Without it the denominator is a
  // different function and the metric is meaningless.
  const p1 = await establishEquivalence(baseline.path, task.path, sig, 'proof 1 (baseline == task)');

  /**
   * proof 2 — and its expected outcome INVERTS with the kind of variant.
   *
   *   semantic : hevm must REFUTE. A cosmetic mutation leaves a memorised answer
   *              correct and the anti-contamination defence is decoration.
   *   control  : hevm must PROVE. A "control" that quietly changed behaviour is
   *              not a control, and would silently invalidate the comparison it
   *              exists to make.
   *
   * Checking only one direction would let the more dangerous mistake through.
   */
  const kind = manifest.kind ?? 'semantic';
  const p2 = await equivalent(task.path, original.path, sig);

  /**
   * ⚠️ UNKNOWN is tolerated HERE and nowhere else, and only because proof 2b
   * below is strictly stronger than what proof 2 asks.
   *
   * Proof 2 is an existence claim: some input makes them differ. Proof 2b
   * executes both on every point of the committed scenario and counts. If 2b
   * reports half the scenario diverging, a divergent input has been exhibited
   * -- concretely, by running them -- so the existence claim is established by
   * a method that does not need the solver to terminate. Without this, no
   * intractable target could ever prove its mutation semantic.
   *
   * ⚠️ A REFUTED proof 2 is still required to be a refutation, not a failure:
   * `equivalent === true` here means the mutation is cosmetic and the task dies.
   */
  if (kind === 'semantic' && p2.equivalent === true) {
    throw new Error(
      `proof 2 FAILED (${p2.label}): hevm PROVED task == original, so the mutation is cosmetic. ` +
        `R4 is not satisfied. Do not score.`,
    );
  }
  if (kind === 'control' && p2.equivalent !== true) {
    throw new Error(
      `proof 2 FAILED (${p2.label}): this is declared a CONTROL, so it must be PROVED identical to ` +
        `the original. It is not, so it is a semantic variant wearing a control's label and the ` +
        `comparison it exists to support would be invalid.`,
    );
  }

  /**
   * proof 2b — HOW MUCH of the domain the mutation moved.
   *
   * ⚠️ Proof 2 is an existence claim: hevm refutes `task == original` as soon as
   * ONE input differs. R4 asks for something stronger — that a memorised answer
   * become wrong — and a `revert` bolted in front of an untouched body satisfies
   * proof 2 while leaving the memorised body correct on every other input.
   * Task.sol argues against exactly that mutation; the gate could not tell the
   * two apart, and §4 nevertheless described it as turning R4 into a gate.
   *
   * ⚠️ The threshold is DECLARED, not derived. A semantic mutation must move at
   * least half of the committed scenario. The mutation in use moves 769 of 769;
   * the bare-revert variant would move 1. Nothing in between has been argued
   * about, so the line is drawn where it separates those two by a wide margin
   * and it is written here rather than tuned to whatever passed.
   *
   * ⚠️ Demonstrated to fire, not believed to: `contracts/src/tasks/NegativeControl.sol`
   * is the bare-revert variant, and `manifest-negative.json` runs it through this
   * function. It passes proof 2 and is refused here at 1/769.
   */
  const strength = await mutationStrength(task.path, original.path, sig);
  if (kind === 'semantic' && strength.fraction < 0.5) {
    throw new Error(
      `proof 2b FAILED: the mutation changes behaviour on only ${strength.diverged}/${strength.total} ` +
        `(${(strength.fraction * 100).toFixed(1)}%) of the scenario. hevm refuted equivalence, so a ` +
        `divergence exists, but a memorised answer stays correct almost everywhere. R4 is not ` +
        `satisfied by an existence claim. Do not score.`,
    );
  }
  if (kind === 'control' && strength.diverged !== 0) {
    throw new Error(
      `proof 2b FAILED: this is declared a CONTROL and it diverges from the original on ` +
        `${strength.diverged}/${strength.total} scenario inputs. hevm proved them equivalent, so ` +
        `these two results contradict each other and one of the instruments is wrong. Do not score.`,
    );
  }

  /**
   * proof 3 — the trivial floor must be PROVED identical to the task.
   *
   * ⚠️ Not ceremony. The floor claims that a one-word edit recovers 69 gas while
   * changing nothing. If hevm refuses, the removed check was NOT dead, those gas
   * were buying real behaviour, and the reference would understate every model.
   */
  let proof_3 = null;
  let p3 = null;
  if (trivial) {
    p3 = await establishEquivalence(trivial.path, task.path, sig, 'proof 3 (trivial == task)');
    proof_3 = p3.label;
  }

  /**
   * ⚠️ The CEILING for every run scored on this task.
   *
   * A patch cannot carry a stronger guarantee than the setup underneath it. If
   * the baseline was only shown equivalent to the task by fuzzing, then the
   * denominator itself rests on evidence rather than proof, and publishing a
   * FORMAL label beside it would overstate the weakest link while naming the
   * strongest. `agent.mjs` clamps the run's label to this.
   */
  const levels = [p1.level, ...(p3 ? [p3.level] : [])];
  const task_guarantee = levels.includes('FUZZED') ? 'FUZZED' : 'FORMAL';

  return {
    manifest,
    kind,
    trivial,
    proof_3,
    task_guarantee,
    task_fuzz_campaign: p1.campaign ?? p3?.campaign ?? null,
    taskSource,
    task,
    baseline,
    original,
    proof_1: p1.label,
    proof_2: p2.label,
    mutation_strength: strength,
    // Only a semantic variant can claim this.
    mutation_refuted: kind === 'semantic',
  };
}
