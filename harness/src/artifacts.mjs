/**
 * The recomputation bundle promised by RUNBOOK §"Every scored run publishes".
 *
 * ⚠️ It was promised and never produced. The RUNBOOK described an
 * `artifacts/<run_id>/` directory, in this repository, at the commit named in the
 * receipt — and no such directory has ever existed. The only per-run outputs went
 * to `.run/`, which is gitignored, so the inputs a third party needs in order to
 * recompute a score were on one laptop.
 *
 * That is not a documentation slip. "Publish the receipt and anyone can recompute
 * the number and catch a lie" is the first of the three properties this project
 * claims, and recomputation needs the inputs, not only their hashes. The receipt
 * already carries the patch source for exactly this reason; everything else it
 * commits to by hash alone was unobtainable.
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEM_PROMPT } from './prompt.mjs';
import { canonical } from './hcs.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));

/**
 * @returns {{dir: string, files: string[]}} paths relative to the repository root
 */
export function exportArtifacts({ receipt, prepared, run }) {
  const dir = join(REPO, 'artifacts', receipt.run_id);
  mkdirSync(dir, { recursive: true });

  const read = (p) => readFileSync(join(REPO, p), 'utf8');
  const m = prepared.manifest;

  const files = {
    // What the model was given, byte for byte, comments stripped as they are on
    // the wire. The receipt's task_sha256 is the hash OF THIS FILE.
    'variant.sol': prepared.taskSource,
    // What it is measured against. Published so nobody has to take our word that
    // the denominator was not shaped to flatter or punish.
    'baseline.sol': read(m.baseline.path),
    // The unmutated original: proof 2's other side. Safe to publish -- it is
    // withheld from the MODEL, not from the reader.
    'original.sol': read(m.original.path),
    'scenario.sol': read('contracts/test/Scenario.sol'),
    'prompt.txt': SYSTEM_PROMPT,
    // ⚠️ The EXACT bytes published to HCS, never a pretty-printed copy. This
    // file is evidence, and evidence must hash to the value the chain committed
    // to. Read it with `jq . receipt.json`.
    'receipt.json': canonical(receipt),
    // Runtime bytecode of both sides: what hevm actually compared, and what the
    // gas instrument actually measured. Everything above compiles to these.
    'task.runtime.hex': prepared.task.runtime,
    'baseline.runtime.hex': prepared.baseline.runtime,
    // ⚠️ RECOMPUTE.md tells the reader to run hevm against this file. The first
    // version of this exporter named it and did not write it, which would have
    // sent anyone following the instructions into a missing-file error on the
    // step that checks the anti-memorisation claim.
    'original.runtime.hex': prepared.original.runtime,
  };
  if (prepared.trivial) files['trivial.sol'] = read(m.trivial.path);
  if (run.patch) {
    files['patch.sol'] = run.patch.source;
    files['patch.runtime.hex'] = run.patch.runtime;
  }

  // ⚠️ How to check this bundle without trusting us, written INTO the bundle.
  files['RECOMPUTE.md'] = `# Recompute this run

Run id \`${receipt.run_id}\`, model \`${receipt.agent.model}\`, ${receipt.timestamp}.

\`\`\`
git clone https://github.com/lzmrd/whetstone && cd whetstone
git checkout ${receipt.artifacts.commit}
./scripts/bootstrap.sh && source .envrc.sh
\`\`\`

${receipt.artifacts.dirty ? `⚠️ **The working tree was DIRTY when this ran**, so the commit above does not
fully describe what produced these numbers. The bundle is still self-contained —
every input is in this directory — but the repository state is not pinned by that
hash alone.\n` : ''}
⚠️ \`receipt.json\` is the **exact bytes published to Hedera**, compact and with
no trailing newline, so \`sha256sum receipt.json\` reproduces the hash recorded on
Base Sepolia. Read it with \`jq . receipt.json\`; do not reformat the file.

| Claim | How to check it yourself |
|---|---|
| this bundle is the run the chains recorded | \`sha256sum receipt.json\` equals the \`receiptHash\` on Base Sepolia, and equals the sha256 of the reassembled HCS message |
| equivalence | \`hevm equivalence --code-a-file task.runtime.hex --code-b-file patch.runtime.hex --sig '${receipt.task.sig}' --max-iterations -1\`, with hevm ${receipt.toolchain.checker_version} |
| the baseline computes the task | same command on \`baseline.runtime.hex\` and \`task.runtime.hex\` — must PASS |
| the mutation is semantic | same command on \`task.runtime.hex\` and \`original.runtime.hex\` — must REFUTE |
| gas | \`forge test --match-contract GasScenarioTest\` after etching these two runtimes; scenario digest \`${receipt.task.scenario_id}\` |
| the scenario is the committed one | the digest of \`${receipt.task.scenario_name}\` in \`scenario.sol\` must equal that digest |
| the mutation is not cosmetic-in-disguise | it moves **${receipt.guarantee.mutation_strength?.diverged ?? '?'} of ${receipt.guarantee.mutation_strength?.total ?? '?'}** scenario inputs |
| nothing was recompiled differently | solc ${receipt.toolchain.solc}, evm_version ${receipt.toolchain.evm_version}, optimizer ${receipt.toolchain.optimizer_runs} runs, \`--metadata-hash none\` |

⚠️ A number that disagrees with the receipt is a **finding**, not a support
request. The falsification bounty in the README applies.
`;

  const written = [];
  for (const [name, content] of Object.entries(files)) {
    // ⚠️ receipt.json gets no trailing newline: one byte changes the sha256 and
    // breaks the only property the file has.
    const exact = name === 'receipt.json';
    writeFileSync(join(dir, name), exact || content.endsWith('\n') ? content : `${content}\n`);
    written.push(`artifacts/${receipt.run_id}/${name}`);
  }
  return { dir: `artifacts/${receipt.run_id}`, files: written };
}
