/**
 * Gates 1 and 2 from the harness — WHETSTONE §7 levels 1 and 2.
 *
 * ⚠️ These gates existed as a test file that NOTHING INVOKED, which was found by
 * auditing a commit that had declared them done. A gate nothing calls is not a
 * gate.
 *
 * ⚠️ The more serious hole they close: when hevm returned UNKNOWN the loop kept
 * the patch, measured its gas and published it with **no differential evidence at
 * all**. The entire point of a ladder is that failing level 3 drops you to level
 * 2; instead it dropped to nothing. A patch could be scored on the strength of
 * having compiled.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const REPO = fileURLToPath(new URL('../../', import.meta.url));

/** The campaign IS the label: §7 requires runs, seed and what was compared. */
export async function fuzzCampaign() {
  const { stdout } = await run('forge', ['config', '--json'], { cwd: REPO, maxBuffer: 8e6 });
  const cfg = JSON.parse(stdout);
  return {
    runs: cfg.fuzz?.runs ?? null,
    seed: cfg.fuzz?.seed ?? null,
    compared: 'success flag and the full return buffer, which covers return bytes and revert data',
    corpus: 'Scenario.inputs() exhaustively (gate 1) plus uniform 256-bit sampling (gate 2)',
  };
}

/**
 * @returns {{passed: boolean, gate: 1|2|null, counterexample: string|null, output: string}}
 */
export async function differential(taskHex, patchHex) {
  const env = { ...process.env, TASK_HEX: taskHex, PATCH_HEX: patchHex };
  try {
    const { stdout } = await run(
      'forge',
      ['test', '--match-contract', 'DifferentialTest'],
      { cwd: REPO, env, maxBuffer: 32e6 },
    );
    return { passed: true, gate: null, counterexample: null, output: stdout };
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    const gate = /gate 1:/.test(out) ? 1 : /gate 2:/.test(out) ? 2 : null;
    // hevm could not give a counterexample here; the fuzzer can, and it is
    // mechanical output, so §5 allows feeding it back.
    const cex = out.match(/counterexample: (calldata=\S+ args=\[[^\]]*\])/)?.[1]
      ?? out.match(/GATE\d DIVERGENCE at input: (\S+)/)?.[1]
      ?? null;
    return { passed: false, gate, counterexample: cex, output: out };
  }
}
