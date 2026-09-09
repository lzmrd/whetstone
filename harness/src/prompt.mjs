/**
 * The fixed system prompt, and the guard that keeps it honest.
 *
 * WHETSTONE §5: what the model sees IS the experiment. The prompt is committed,
 * hashed into every receipt, and identical across all models and seeds. Editing
 * it invalidates comparability with every run that came before.
 */

import { createHash } from 'node:crypto';

/// ⚠️ §5 forbids these from ever reaching the model.
///
/// ⚠️ WHAT THIS IS NOT. This filter is not "the anti-memorisation defence in
/// operational form", as an earlier comment claimed. The file it redacts is the
/// OpenZeppelin implementation nearly verbatim -- same constants, same shift
/// chain -- so any model that has seen the library recognises the FUNCTION with
/// or without the word "openzeppelin" in it. Token filtering cannot hide code
/// that is recognisable by construction, and D-05 says outright that both
/// libraries are in every model's training data.
///
/// What it actually buys, stated at its real size:
///   · dropping the library names removes the cheapest cue for pulling the exact
///     upstream text into context and diffing against it. Recall from weights is
///     noisy; a verbatim quotation the model has just written is not. Raising the
///     cost of the precise operation is worth doing and is not a defence.
///   · "whetstone" would let it recognise the BENCHMARK, which is a different
///     concern from recognising the function and the only one this fully solves.
///
/// The anti-memorisation defence is the semantic mutation `M` and the proofs
/// that gate it -- a memorised answer is admitted and then REJECTED, which is
/// why the defence survives being read about.
// ⚠️ 'uniswap' joined this list when the fourth task stopped being an
// OpenZeppelin transcription. The list is a record of whose code the corpus is
// built from, so every addition to the corpus has to be checked against it --
// a provenance name that is not here is a leak the gate cannot see.
export const FORBIDDEN = ['openzeppelin', 'solady', 'whetstone', 'vectorized', 'mulDiv', 'uniswap', 'v4-periphery'];

export const SYSTEM_PROMPT = `You optimise Solidity functions for gas.

You will be given one complete, compilable Solidity file containing a function.
Your task: return a version that costs less gas and behaves IDENTICALLY.

"Identically" is checked by a symbolic equivalence prover, not by a test suite.
For every possible input the two must agree on:
  - the returned value
  - whether the call succeeds or reverts
  - the exact revert data when it reverts

Output format, strictly:
  - a SINGLE fenced code block tagged solidity, and nothing else outside it
  - a complete file: SPDX line, pragma solidity 0.8.35, no imports
  - the same contract name and the same external function signature as the input
  - no constructor, no state variables, no events

Toolchain your output is compiled and measured with:
  solc 0.8.35, evm_version osaka, optimizer enabled, 200 runs

How the score is computed:
  total gas across a fixed set of 769 inputs, covering every power-of-two
  boundary and its neighbours, plus zero and the maximum 256-bit value.
  A change that helps some inputs and hurts others is measured on the total,
  and the worst single-input regression is reported alongside it.

If you are given compiler errors or a counterexample from the prover, fix that
specific problem and return the corrected file in the same format.`;

export const PROMPT_HASH = createHash('sha256').update(SYSTEM_PROMPT).digest('hex');

/**
 * Refuse to send anything carrying a forbidden token.
 *
 * ⚠️ This is a GATE, not a lint. A task file that still says "OpenZeppelin" in a
 * comment hands the model the identity of the upstream library, and from there
 * the original implementation and the mutation are both recoverable. The run
 * would still produce a number, and the number would be meaningless -- which is
 * the worst kind of failure, so it throws rather than warns.
 */
export function assertClean(text, where) {
  const lower = text.toLowerCase();
  const hits = FORBIDDEN.filter((t) => lower.includes(t.toLowerCase()));
  if (hits.length > 0) {
    throw new Error(
      `${where} contains forbidden token(s): ${hits.join(', ')}\n` +
        `WHETSTONE §5 excludes these from anything the model sees. ` +
        `Redact the task source before running, do not weaken this check.`,
    );
  }
}

/**
 * Strip comments from a task file before it is sent.
 *
 * ⚠️ Not cosmetic. Comments are the classic leakage channel -- the DESIGN-NOTES
 * leakage defences list "comments added by the patch" for exactly this reason,
 * and the very first real run of the agent loop was refused because this
 * repository's own task file carried the string "WHETSTONE" in a header comment.
 * A file can be perfectly clean as code and leak everything in prose.
 *
 * The caller MUST verify that the stripped source compiles to byte-identical
 * runtime bytecode. Solidity string literals can contain "//" and a regex
 * stripper can corrupt them; the bytecode comparison is what catches that,
 * which is why this function is not trusted on its own.
 */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments, natspec included
    .replace(/^[ \t]*\/\/.*$/gm, '')      // whole-line // comments
    .replace(/[ \t]+\/\/.*$/gm, '')       // trailing // comments
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}
