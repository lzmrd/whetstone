/**
 * Does every scored run recorded on-chain have a published bundle, and does the
 * bundle match what the chain committed to?
 *
 * ⚠️ WHY THIS EXISTS. Three complete, valid bundles sat untracked next to 143
 * tracked files, and the only difference between them was that somebody had run
 * `git add` for the others. That is not a publication policy — it is a selection
 * effect, and on a project whose headline claim is third-party recomputation a
 * hand-picked subset of receipts is the worst possible thing to publish. Which
 * runs get published cannot depend on who typed what.
 *
 * The rule, stated once and enforced here:
 *
 *   Every SCORED run publishes its bundle. No discretion, no exceptions.
 *   Unscored attempts publish none — there is no patch to recompute — and are
 *   recorded on-chain only, with their cost.
 *
 * ⚠️ It also checks the CONTENT, not just the presence: the sha256 of the
 * bundle's receipt.json must equal the hash the registry committed to. A bundle
 * that is present but different is worse than one that is missing, because it
 * looks like evidence.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const url = process.env.SUBGRAPH_QUERY_URL;
const recorder = process.env.REGISTRY_RECORDER_ADDRESS;

if (!url || !recorder) {
  console.error('\n✗ SUBGRAPH_QUERY_URL and REGISTRY_RECORDER_ADDRESS must be set.\n');
  process.exit(2);
}

const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    query: `query($r: Bytes!) {
      runs(where: { recorder: $r, scored: true }, first: 1000) {
        runId receiptHash hcsTopicId hcsSequence savedPerCall
      }
    }`,
    variables: { r: recorder.toLowerCase() },
  }),
});
const body = await res.json();
if (body.errors) { console.error(body.errors); process.exit(2); }
const runs = body.data.runs;

let missing = 0, mismatched = 0;
for (const r of runs) {
  const file = join(REPO, 'artifacts', r.runId, 'receipt.json');
  if (!existsSync(file)) {
    console.log(`  ✗ ${r.runId}  scored on-chain, NO published bundle`);
    missing++;
    continue;
  }
  // ⚠️ The bundle's receipt must be byte-identical to what was published to HCS
  // and committed to on Base Sepolia. Anything else is a different document
  // wearing the same run id.
  const got = createHash('sha256').update(readFileSync(file)).digest('hex');
  const want = r.receiptHash.replace(/^0x/, '');
  if (got !== want) {
    console.log(`  ⚠ ${r.runId}  bundle present but its receipt hashes differently`);
    console.log(`      on-chain ${want}`);
    console.log(`      bundle   ${got}`);
    mismatched++;
  }
}

const ok = runs.length - missing - mismatched;
console.log(`\n  ${runs.length} scored run(s) on-chain · ${ok} with a matching published bundle` +
  `${missing ? ` · ${missing} MISSING` : ''}${mismatched ? ` · ${mismatched} MISMATCHED` : ''}`);

if (missing || mismatched) {
  console.log(`\n⚠️  Every scored run must publish its bundle. A published set that is a
    hand-picked subset of the runs is a selection effect, and this project's
    headline claim is that anyone can recompute a result.\n`);
  process.exit(1);
}
console.log('  ✓ publication is complete and matches the chain\n');
