/**
 * R12, enforced instead of assumed.
 *
 * ⚠️ The rule said "scripts/selfcheck.sh gates every measured run" and NOTHING
 * CALLED IT. The script existed, passed, and was run by hand — so the two
 * properties it guards were established once and then believed, which is the
 * failure this project keeps correcting elsewhere. Every number published before
 * this commit rests on a check that was not running.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const REPO = fileURLToPath(new URL('../../', import.meta.url));

export async function requireSelfCheck() {
  try {
    const { stdout } = await run('bash', ['scripts/selfcheck.sh'], { cwd: REPO, maxBuffer: 16e6 });
    return { ok: true, output: stdout };
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    throw new Error(
      `SELF-CHECK FAILED — no run may be scored or published (R12).\n\n${out.slice(-2000)}`,
    );
  }
}
