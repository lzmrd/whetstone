/**
 * Gas for a patch against its task, over the fixed scenario.
 *
 * Delegates to PatchGas.t.sol rather than reimplementing the measurement: the
 * instrument lives in one place, with its order-neutrality control (D-14) beside
 * it. Three faulty instruments is enough; a fourth written in JavaScript would be
 * outside the control that exists to catch exactly this.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const REPO = fileURLToPath(new URL('../../', import.meta.url));

export async function measurePatch(taskHex, patchHex) {
  let out;
  try {
    const r = await run(
      'forge',
      ['test', '--match-contract', 'PatchGasTest', '-vv'],
      { cwd: REPO, env: { ...process.env, TASK_HEX: taskHex, PATCH_HEX: patchHex }, maxBuffer: 32e6, timeout: 600_000 },
    );
    out = r.stdout;
  } catch (e) {
    const text = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    // The test asserts task and patch agree on success/failure. If that fires,
    // the equivalence gate let something through and the run must not be scored.
    if (/disagree on success\/failure/.test(text)) {
      throw new Error(
        'task and patch diverge on success/failure during gas measurement, ' +
          'after the equivalence gate passed. Do not score this run.',
      );
    }
    throw new Error(`gas measurement failed:\n${text.slice(-1500)}`);
  }

  const g = {};
  for (const m of out.matchAll(/WHETSTONE_GAS (\w+) (\d+)/g)) g[m[1]] = Number(m[2]);
  const digest = out.match(/WHETSTONE_GAS scenario_digest\s*\n\s*(0x[0-9a-f]{64})/)?.[1] ?? null;
  if (g.scored == null) throw new Error('gas measurement produced no readings');

  return {
    scenario_id: digest,
    scenario_inputs: g.scenario_inputs,
    scored: g.scored,
    skipped: g.skipped,
    v1_total: g.total_task,
    patch_total: g.total_patch,
    saved_total: g.total_task - g.total_patch,
    saved_per_call: Math.round((g.total_task - g.total_patch) / g.scored),
    patch_max_regression: g.max_regression,
    patch_regressed_inputs: g.regressed_inputs,
    max_improvement: g.max_improvement,
  };
}
