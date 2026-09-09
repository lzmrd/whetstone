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
  const { stdout } = await run('forge', ['config', '--json'], { cwd: REPO, maxBuffer: 8e6, timeout: 60_000 });
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
export async function differential(taskHex, patchHex, sig = 'f(uint256)') {
  const env = { ...process.env, TASK_HEX: taskHex, PATCH_HEX: patchHex, TASK_SIG: sig };
  try {
    const { stdout } = await run(
      'forge',
      ['test', '--match-contract', 'DifferentialTest'],
      // 20 001 fuzz runs against etched bytecode; generous, but bounded.
      { cwd: REPO, env, maxBuffer: 32e6, timeout: 900_000 },
    );
    return { passed: true, gate: null, counterexample: null, output: stdout };
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    const gate = /gate 1:/.test(out) ? 1 : /gate 2:/.test(out) ? 2 : null;

    /**
     * ⚠️ `forge` exiting non-zero is not the same as a gate firing.
     *
     * Everything that is not one of our two gate messages is OUR failure --
     * a missing file, a permission foundry.toml does not grant, a compiler
     * error, a timeout -- and it was being returned as `{passed: false}`,
     * indistinguishable from "the patch diverges". On the patch path that
     * publishes a model failure, on chain, for something the model did not do.
     * It is the same misattribution `attributeFailure()` exists to prevent on
     * the provider side, on the side nobody had looked at.
     *
     * Found by a demonstration of the new admission ladder: the hex files were
     * written to /tmp, which `fs_permissions` does not allow, and the ladder
     * reported that the task's baseline diverged.
     */
    if (gate === null) {
      throw new Error(
        `differential harness failed without either gate firing — this is our error, not a ` +
          `divergence, and must not be attributed to the code under test:\n${out.slice(-1200)}`,
      );
    }
    // hevm could not give a counterexample here; the fuzzer can, and it is
    // mechanical output, so §5 allows feeding it back.
    const cex = out.match(/counterexample: (calldata=\S+ args=\[[^\]]*\])/)?.[1]
      ?? out.match(/GATE\d DIVERGENCE at input: (\S+)/)?.[1]
      ?? null;
    return { passed: false, gate, counterexample: cex, output: out };
  }
}

/**
 * How much of the committed scenario the mutation actually moved.
 *
 * ⚠️ The companion to proof 2, and the reason proof 2 alone was not the gate §4
 * claimed. hevm refuting `task == original` establishes that a divergent input
 * EXISTS. R4 needs more than that: a memorised answer has to become wrong, and a
 * mutation that diverges on one input in 2**256 leaves it right everywhere else.
 * One is an existence claim, the other is about measure.
 *
 * @returns {{diverged: number, total: number, fraction: number}}
 */
export async function mutationStrength(taskHex, originalHex, sig = 'f(uint256)') {
  const env = { ...process.env, TASK_HEX: taskHex, ORIGINAL_HEX: originalHex, TASK_SIG: sig };
  const { stdout } = await run(
    'forge',
    ['test', '--match-test', 'test_mutation_strength', '-vv'],
    { cwd: REPO, env, maxBuffer: 32e6, timeout: 300_000 },
  );
  const m = stdout.match(/WHETSTONE_DIVERGENCE (\d+) (\d+)/);
  if (!m) throw new Error(`mutation strength did not report a number:\n${stdout}`);
  const diverged = Number(m[1]);
  const total = Number(m[2]);
  return { diverged, total, fraction: Number((diverged / total).toFixed(4)) };
}
