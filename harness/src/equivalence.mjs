/**
 * hevm equivalence on two runtime-bytecode files, and the label the run earns.
 *
 * Mirrors scripts/equiv.sh, which stays as the hand-driven entry point. The
 * two must agree on the label logic; the shared trap is documented in both:
 * hevm prints "Contracts behave equivalently" on success and "Contracts may not
 * behave equivalently" on failure, so the failure string CONTAINS the success
 * string and a substring test reports every failure as a proof.
 */

import { execFile } from 'node:child_process';
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

  let out;
  try {
    const r = await run('hevm', args, { maxBuffer: 64 * 1024 * 1024 });
    out = `${r.stdout}${r.stderr}`;
  } catch (e) {
    // hevm exits non-zero on a refutation, which is a RESULT, not an error.
    out = `${e.stdout ?? ''}${e.stderr ?? ''}` || e.message;
  }
  const plain = out.replace(ANSI, '');

  const partial = /partially explore/.test(plain);
  const passed = /\[PASS\] Contracts behave/.test(plain);
  const cex = /calldata|counterexample/i.test(plain);

  if (cex) return { label: 'REFUTED', equivalent: false, output: plain };
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
