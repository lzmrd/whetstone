/**
 * hevm equivalence on two runtime-bytecode files, and the label the run earns.
 *
 * Mirrors scripts/equiv.sh, which stays as the hand-driven entry point. The
 * two must agree on the label logic; the shared trap is documented in both:
 * hevm prints "Contracts behave equivalently" on success and "Contracts may not
 * behave equivalently" on failure, so the failure string CONTAINS the success
 * string and a substring test reports every failure as a proof.
 */

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const CHECKER = { name: 'hevm', version: null, solver: 'bitwuzla' };

export async function checkerVersion() {
  if (CHECKER.version) return CHECKER.version;
  const { stdout } = await run('hevm', ['version']);
  CHECKER.version = stdout.trim().split('\n')[0];
  return CHECKER.version;
}

const ANSI = /\x1B\[[0-9;]*[mK]/g;

/**
 * Wall clock for one hevm invocation.
 *
 * ⚠️ `--smt-timeout` bounds a single SMT query, not the process: hevm can keep
 * generating queries indefinitely on an input it cannot fold. Without this the
 * whole batch hangs on one patch, which is a denial of service handed to us by
 * whatever a model happened to emit. Generous rather than tight -- a real proof
 * on the current targets takes seconds, so anything near this bound has already
 * failed in practice.
 */
const WALL_MS = 30 * 60 * 1000;

/**
 * Memory ceiling for one hevm invocation.
 *
 * ⚠️ The wall clock above bounds TIME and nothing bounded MEMORY, which is the
 * limit this project actually hits. On the vanity target hevm reaches 6 GB in
 * eighteen seconds -- nowhere near the wall clock -- and the kernel's OOM
 * killer then picks a victim by its own heuristic. Twice that victim was the
 * editor; once it was a proof job that vanished leaving a log stopped mid-line.
 * Inside a cgroup the kill lands on hevm and nothing else, which is the whole
 * point: a prover that cannot fit a function is a RESULT we can record, and a
 * batch killed halfway through by an unrelated process is not.
 *
 * ⚠️ `--scope` is correct HERE and wrong in scripts/prove.sh. A scope belongs to
 * the process that started it: node stays alive awaiting the child, so the
 * scope lives exactly as long as the call. prove.sh returns immediately, so its
 * scope was torn down after 25 seconds -- which is why that script uses a
 * transient service instead.
 */
const MEM_MAX = process.env.HEVM_MEMORY_MAX ?? '6G';

let capState = null;

/**
 * Wrap an argv in a memory-capped cgroup, when the platform offers one.
 *
 * ⚠️ hevm's presence is checked BEFORE wrapping, and separately. Wrapped, a
 * missing hevm surfaces as systemd-run's failure rather than as ENOENT, and the
 * ENOENT branch below is load-bearing: it is what stops an absent prover being
 * softened into UNKNOWN and then into a FUZZED label earned with no prover
 * involved. Losing that distinction to a convenience wrapper would reopen the
 * exact hole that branch was written to close.
 */
function capped(argv) {
  if (capState === null) {
    try {
      execFileSync('hevm', ['version'], { stdio: 'ignore' });
    } catch (e) {
      if (e.code === 'ENOENT') capState = { available: false, hevmMissing: true };
    }
    if (capState === null) {
      try {
        execFileSync('systemctl', ['--user', 'show-environment'], { stdio: 'ignore' });
        execFileSync('systemd-run', ['--version'], { stdio: 'ignore' });
        capState = { available: true, hevmMissing: false };
      } catch {
        capState = { available: false, hevmMissing: false };
      }
    }
  }
  if (capState.hevmMissing) {
    throw new Error(
      `hevm is not on the PATH. This is a harness failure, not an UNKNOWN verdict: ` +
        `without the prover no guarantee label can be earned. Run scripts/bootstrap.sh ` +
        `and source .envrc.sh.`,
    );
  }
  if (!capState.available) return argv;
  return [
    'systemd-run', '--user', '--scope', '--quiet',
    '-p', `MemoryMax=${MEM_MAX}`, '-p', 'MemorySwapMax=0', '--',
    ...argv,
  ];
}

/**
 * Why a non-zero hevm exit ended, when it ended without a verdict.
 *
 * ⚠️ Exported for testing, and separate from the parsing below on purpose: an
 * out-of-memory kill must never reach the marker parser. Partial output from a
 * killed process can contain anything, and the one thing this function must
 * never do is let a kill be read as a refutation.
 *
 * @returns {'wall-clock'|'memory'|null} null when it was not a kill at all
 */
export function classifyKill(e, elapsedMs, wallMs = WALL_MS) {
  // A cgroup OOM kills the child with SIGKILL; systemd-run then exits 137 of
  // its own accord, so node sees a normal exit with a status and no signal.
  if (e.code === 137 || e.signal === 'SIGKILL' || e.killed) {
    // The wall clock is enforced by node, which reports `killed`. Anything that
    // dies far short of it, having been SIGKILLed, hit the memory ceiling.
    if (e.killed && elapsedMs >= wallMs * 0.9) return 'wall-clock';
    if (e.code === 137 || e.signal === 'SIGKILL') return 'memory';
    return 'wall-clock';
  }
  if (e.signal) return 'wall-clock';
  return null;
}

/**
 * @returns {Promise<{label: string, equivalent: boolean|null, output: string}>}
 *   label: FORMAL_NO_EXPLICIT_INPUT_BOUND | FORMAL_BOUNDED | REFUTED | UNKNOWN
 *   equivalent: true (proved) | false (counterexample) | null (neither)
 */
export async function equivalent(fileA, fileB, sig, { timeout = 300, maxIterations = -1 } = {}) {
  const args = [
    'equivalence',
    '--code-a-file', fileA,
    '--code-b-file', fileB,
    '--sig', sig,
    '--solver', CHECKER.solver,
    '--smt-timeout', String(timeout),
    '--num-solvers', '2',
    '--max-iterations', String(maxIterations),
  ];

  const [cmd, ...argv] = capped(['hevm', ...args]);

  let out;
  const startedAt = Date.now();
  try {
    const r = await run(cmd, argv, { maxBuffer: 64 * 1024 * 1024, timeout: WALL_MS });
    out = `${r.stdout}${r.stderr}`;
  } catch (e) {
    // ⚠️ Two different non-zero exits, and they must NOT be conflated.
    //
    //   refutation  hevm exits non-zero on a counterexample. That is a RESULT.
    //   killed      the wall clock ran out. There is no verdict, and whatever
    //               partial output exists must not be parsed for one --
    //               `--smt-timeout` bounds each SMT query, nothing bounds the
    //               number of queries, so a pathological input can run forever.
    // ⚠️ The prover being ABSENT is not a verdict of any kind.
    //
    // Found while regression-testing the wall clock above: with hevm off the
    // PATH this function returned UNKNOWN, and agent.mjs turns UNKNOWN into a
    // fall back to gates 1 and 2, which awards the FUZZED label. A guarantee
    // label would have been earned, published to HCS and written on chain with
    // no prover involved at any point. A missing tool is a harness error and
    // must stop the run, not soften it by one rung.
    if (e.code === 'ENOENT') {
      throw new Error(
        `hevm is not on the PATH. This is a harness failure, not an UNKNOWN verdict: ` +
          `without the prover no guarantee label can be earned. Run scripts/bootstrap.sh ` +
          `and source .envrc.sh.`,
      );
    }
    const kill = classifyKill(e, Date.now() - startedAt);
    if (kill === 'memory') {
      return {
        label: 'UNKNOWN',
        equivalent: null,
        output:
          `hevm was killed at the ${MEM_MAX} memory ceiling after ` +
          `${Math.round((Date.now() - startedAt) / 1000)}s. No verdict, and the partial ` +
          `output is deliberately not parsed: this is the prover failing to fit the ` +
          `function, not a statement about the function.`,
      };
    }
    if (kill === 'wall-clock') {
      return {
        label: 'UNKNOWN',
        equivalent: null,
        output: `hevm exceeded the ${WALL_MS / 1000}s wall clock and was killed. No verdict.`,
      };
    }
    out = `${e.stdout ?? ''}${e.stderr ?? ''}` || e.message;
  }
  const plain = out.replace(ANSI, '');

  const partial = /partially explore/.test(plain);
  const passed = /\[PASS\] Contracts behave equivalently/.test(plain);

  /**
   * ⚠️ Matched on hevm's own refutation markers, not on the word "calldata".
   *
   * This test used to be /calldata|counterexample/i AND it ran BEFORE the pass
   * test, so any output containing that word anywhere would have been reported
   * as a refutation -- with `equivalent: false` and an empty counterexample fed
   * back to the model. It never fired on hevm 0.58.0, whose passing output is
   * two lines and contains neither word; the word came from the `Calldata:`
   * heading that hevm prints INSIDE a counterexample. A marker that happens not
   * to appear is not the same as a correct test.
   *
   * The two verdicts differ by one word in hevm's own output, and the
   * difference is load-bearing:
   *   "Contracts do not behave equivalently"   a counterexample exists
   *   "Contracts may not behave equivalently"  exploration was incomplete
   */
  const refuted = /\[FAIL\] Contracts do not behave equivalently/.test(plain)
    || /^Not equivalent\./m.test(plain);

  // Both markers at once is not a verdict this function is entitled to resolve:
  // it means the output is not what either branch assumes, and picking one
  // would publish a guarantee derived from a parse we know is wrong.
  if (passed && refuted) {
    throw new Error(
      `hevm reported BOTH a proof and a refutation. Refusing to classify:\n${plain.slice(0, 800)}`,
    );
  }

  if (refuted) return { label: 'REFUTED', equivalent: false, output: plain };
  if (passed && !partial) {
    return {
      label: maxIterations === -1 ? 'FORMAL_NO_EXPLICIT_INPUT_BOUND' : 'FORMAL_BOUNDED',
      equivalent: true,
      output: plain,
    };
  }
  // Neither proof nor refutation. Never report this as equivalence.
  return { label: 'UNKNOWN', equivalent: null, output: plain };
}

/**
 * The part of hevm's refutation that is useful to a model: the differing input
 * and the two end states. §5 requires feedback to be mechanical output only.
 */
export function counterexampleFor(output) {
  const i = output.indexOf('Not equivalent');
  const body = (i >= 0 ? output.slice(i) : output).trim();
  return body.slice(0, 2500);
}
