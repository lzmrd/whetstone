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
import { stripComments, assertClean } from './prompt.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));

export function loadManifest(path = process.env.TASK_MANIFEST ?? 'contracts/src/tasks/manifest.json') {
  return JSON.parse(readFileSync(join(REPO, path), 'utf8'));
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
  const p1 = await equivalent(baseline.path, task.path, sig);
  if (p1.equivalent !== true) {
    throw new Error(`proof 1 FAILED (${p1.label}): the baseline is not equivalent to the task. Do not score.`);
  }

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

  if (kind === 'semantic' && p2.equivalent !== false) {
    throw new Error(
      `proof 2 FAILED (${p2.label}): hevm did not refute task == original, so the mutation is not ` +
        `demonstrably semantic. R4 is not satisfied. Do not score.`,
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
   * proof 3 — the trivial floor must be PROVED identical to the task.
   *
   * ⚠️ Not ceremony. The floor claims that a one-word edit recovers 69 gas while
   * changing nothing. If hevm refuses, the removed check was NOT dead, those gas
   * were buying real behaviour, and the reference would understate every model.
   */
  let proof_3 = null;
  if (trivial) {
    const p3 = await equivalent(trivial.path, task.path, sig);
    if (p3.equivalent !== true) {
      throw new Error(
        `proof 3 FAILED (${p3.label}): the trivial floor is not equivalent to the task, so the ` +
          `edit it represents changes behaviour and cannot serve as a floor.`,
      );
    }
    proof_3 = p3.label;
  }

  return {
    manifest,
    kind,
    trivial,
    proof_3,
    taskSource,
    task,
    baseline,
    original,
    proof_1: p1.label,
    proof_2: p2.label,
    // Only a semantic variant can claim this.
    mutation_refuted: kind === 'semantic',
  };
}
