/**
 * Compile one self-contained Solidity file to runtime bytecode, with the pins
 * from foundry.toml.
 *
 * ⚠️ solc directly, not forge, for three reasons:
 *   1. The prompt requires the patch to reuse the task's contract name. Two
 *      contracts with one name in the same forge project collide in `out/`,
 *      and the collision resolves silently to whichever was written last --
 *      so the run would measure the wrong artifact and never say so.
 *   2. hevm wants runtime bytecode; `--bin-runtime` is exactly that, with no
 *      artifact JSON in between.
 *   3. Model output is untrusted input. Keeping it out of the forge project
 *      means a patch cannot shadow or break the repository's own contracts.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);

// Must match foundry.toml. A divergence here silently invalidates every gas
// number, so it is asserted against the file at startup by verify-pins.mjs.
export const PINS = {
  solc: '0.8.35',
  evmVersion: 'osaka',
  optimizerRuns: 200,
};

/**
 * @returns {Promise<{ok: true, runtime: string, path: string} | {ok: false, errors: string}>}
 */
export async function compileToRuntime(source, contractName) {
  const dir = await mkdtemp(join(tmpdir(), 'whetstone-'));
  const file = join(dir, `${contractName}.sol`);
  await writeFile(file, source);

  const args = [
    '--bin-runtime',
    // ⚠️ Without this, solc appends a CBOR blob holding an IPFS hash OF THE
    // SOURCE TEXT. Two files with identical logic and different comments then
    // compile to different bytecode -- which broke the comment-stripping check
    // (304 of 347 bytes identical, only the trailing metadata differing) and,
    // more importantly, would break the claim that anyone can recompute a
    // published result. The metadata is never executed, so removing it changes
    // no gas and no behaviour.
    '--metadata-hash', 'none',
    '--optimize',
    '--optimize-runs', String(PINS.optimizerRuns),
    '--evm-version', PINS.evmVersion,
    file,
  ];

  try {
    const { stdout } = await run('solc', args, { maxBuffer: 32 * 1024 * 1024 });
    // solc prints:  ======= /path/File.sol:Name =======\nBinary of the runtime part:\n<hex>
    const re = new RegExp(
      `=======[^=]*:${contractName}\\s*=======[\\s\\S]*?Binary of the runtime part:\\s*([0-9a-fA-F]*)`,
    );
    const m = stdout.match(re);
    if (!m) {
      return {
        ok: false,
        errors:
          `The file compiled but defines no contract named "${contractName}".\n` +
          `The output must keep the same contract name as the input.`,
      };
    }
    if (!m[1]) {
      return { ok: false, errors: `Contract "${contractName}" compiled to empty runtime bytecode.` };
    }
    const hex = join(dir, `${contractName}.hex`);
    await writeFile(hex, m[1]);
    return { ok: true, runtime: m[1], path: hex };
  } catch (e) {
    // Hand the compiler's own diagnostics back verbatim -- §5 requires feedback
    // to be mechanical output, never anything hand-written per model.
    const raw = `${e.stderr ?? ''}${e.stdout ?? ''}`.trim() || e.message;
    return { ok: false, errors: stripPaths(raw) };
  }
}

/** Temp paths leak nothing useful and waste the model's context. */
function stripPaths(s) {
  return s.replace(/\/[^\s:]*whetstone-[^\s:]*\//g, '').slice(0, 4000);
}
