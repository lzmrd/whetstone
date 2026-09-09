/**
 * The Base Sepolia half of the record: a pointer to the HCS receipt, indexable.
 *
 * ⚠️ WHY THIS EXISTS AT ALL, stated before the code so nobody has to infer it:
 * The Graph cannot index Hedera and HCS is not EVM, so the canonical record —
 * the one tied to the payment — stays on HCS and this emits an index card
 * pointing at it. Given an event you fetch the HCS message from the mirror node
 * and compare hashes; the cross-chain link is checkable without our machine.
 *
 * ⚠️ It records; it verifies NOTHING (D-09). A contract cannot compile a patch,
 * call hevm, or measure gas.
 *
 * ⚠️ NO NEW SDK. This shells out to `cast`, which the project already requires
 * and pins. Adding viem or ethers to write twelve fields to a testnet log would
 * add a dependency, a lockfile and a supply chain to a repository whose claim is
 * that a stranger can reproduce it.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const REPO = fileURLToPath(new URL('../../', import.meta.url));

/**
 * ⚠️ §9 anticipates this failure: RPC down or a bad nonce leaves an HCS receipt
 * with no catalogue card, and the run vanishes from the subgraph. The local log
 * is the source of truth and the queue for retries — a hole in the registry must
 * be recoverable, not silently accepted.
 */
const PENDING = join(REPO, 'harness', '.runs', 'registry-pending.jsonl');

const SIG =
  'record((string,bytes32,string,uint64,string,string,string,bool,string,int256,int256,uint256,int256,uint64))';

/**
 * Receipt + HCS pointer → the twelve fields, in the struct's order.
 *
 * ⚠️ The pointer is a SECOND argument because it is not in the receipt: the
 * topic and sequence number only exist after the receipt has been published, so
 * a receipt cannot contain them. The first version of this file read
 * `receipt.hcs.*` and would have written an empty topic and sequence 0 into
 * every row -- the same documented-but-absent failure that left `oz_version` and
 * `baseline_hash` null for days. Caught by running it against a real receipt
 * instead of against the shape it was assumed to have.
 */
export function toRow(receipt, hcs = {}) {
  const g = receipt.gas ?? {};
  /**
   * ⚠️ An attempt that produced no patch is still a row. It burned inference
   * budget, and the allocator budgets across providers -- money spent for
   * nothing is exactly what it must see. Unscored rows carry no guarantee label
   * (there is nothing to label) and zeroed gas, so the `req` guard below applies
   * only to rows that claim a measurement.
   */
  const scored = receipt.guarantee != null && receipt.gas != null;
  /**
   * ⚠️ LOUD, not zero. `saved_per_call` was absent from the receipt and the
   * first version of this mapping quietly wrote 0 for a run that saved 201 --
   * a field that reads 0 looks like "the model achieved nothing", which is a
   * plausible result and would never have been questioned. Every field this
   * registry row commits to must be present, or the write fails.
   */
  const req = (name, v) => {
    if (!Number.isFinite(v)) {
      throw new Error(
        `registry row would be wrong: receipt.gas.${name} is ${JSON.stringify(v)}. ` +
          `Writing a default here publishes a number nobody measured.`,
      );
    }
    return v;
  };
  const nz = (v) => (Number.isFinite(v) ? v : 0);
  return {
    runId: receipt.run_id,
    // ⚠️ The receipt's own sha256, i.e. of the EXACT bytes published to HCS.
    receiptHash: `0x${hcs.content_sha256 ?? '0'.repeat(64)}`,
    hcsTopicId: hcs.topic_id ?? '',
    hcsSequence: hcs.sequence_number ?? 0,
    model: receipt.agent?.model ?? '',
    taskId: receipt.task?.id ?? '',
    // ⚠️ Empty, never 'UNKNOWN'. UNKNOWN is a real guarantee label meaning "the
    // prover did not terminate on a patch we have"; a run with no patch has not
    // earned any label at all, and conflating the two would put failed calls
    // into the guarantee statistics.
    label: scored ? receipt.guarantee.label : '',
    scored,
    // ⚠️ `stop_reason`, not `outcome`: the receipt has `outcomes` (plural, one
    // per round) and `stop_reason` (how the run ended). Reading a field that
    // does not exist would have written "unknown" onto every row -- the same
    // silent-default failure that put 0 in savedPerCall.
    outcome: receipt.agent?.stop_reason ?? 'unknown',
    // ⚠️ Read straight from the receipt, never re-derived. If it is missing the
    // row must not silently carry 0 -- that is a regression reported as a
    // perfect result.
    savedPerCall: scored ? Math.trunc(req('saved_per_call', g.saved_per_call)) : 0,
    savedTotal: scored ? Math.trunc(req('saved_total', g.saved_total)) : 0,
    maxRegression: scored ? Math.trunc(req('patch_max_regression', g.patch_max_regression)) : 0,
    // Scaled by 1e4 and TRUNCATED, not rounded: a displayed number must never be
    // more favourable than the measured one.
    relativeProgressE4: scored ? Math.trunc(req('relative_progress', g.relative_progress) * 1e4) : 0,
    // Nanodollars. usd_list is a string in the receipt.
    usdListNano: Math.trunc(Number(receipt.cost?.usd_list ?? 0) * 1e9),
  };
}

function tuple(r) {
  const q = (s) => JSON.stringify(String(s));
  return `(${[
    q(r.runId), r.receiptHash, q(r.hcsTopicId), r.hcsSequence,
    q(r.model), q(r.taskId), q(r.label), r.scored, q(r.outcome),
    r.savedPerCall, r.savedTotal, r.maxRegression, r.relativeProgressE4, r.usdListNano,
  ].join(',')})`;
}

/**
 * @param {string|null} tx — the hash, IF the transaction was broadcast.
 *   ⚠️ Its presence is the retry rule: a queued row that carries a hash is
 *   already on the network and must never be re-sent, only polled.
 */
function queue(row, why, tx = null) {
  mkdirSync(dirname(PENDING), { recursive: true });
  appendFileSync(PENDING, `${JSON.stringify({ row, why, tx, at: new Date().toISOString() })}\n`);
}

/**
 * @returns {{recorded: boolean, tx: string|null, address: string|null, reason: string|null}}
 */
/**
 * ⚠️ Outcomes that are OURS, not the model's, and must never be written to a
 * public record about models. They never reached a provider and cost nothing.
 * The registry is append-only, so a row written by mistake cannot be taken back —
 * which is the property that makes it worth trusting, and the reason the check
 * belongs before the write rather than after.
 */
const NOT_ATTRIBUTABLE = new Set(['harness_error']);

export async function recordRun(receipt, hcs = {}) {
  const address = process.env.RUN_REGISTRY_ADDRESS;
  const rpc = process.env.BASE_SEPOLIA_RPC_URL;
  const signer = signerArgs();
  const row = toRow(receipt, hcs);

  if (NOT_ATTRIBUTABLE.has(row.outcome)) {
    return {
      recorded: false, tx: null, address: null, skipped: true,
      reason: `outcome "${row.outcome}" is our infrastructure failing, not the model. ` +
        `Not written: the log is append-only and a public record about models must not ` +
        `carry our own outages.`,
    };
  }

  /**
   * ⚠️ Every row points to a receipt that exists, with no exception.
   *
   * `toRow` defaults a missing pointer to 32 zero bytes, and unscored attempts
   * used to be written that way deliberately. A reader following the README --
   * take receiptHash, fetch that message from the mirror node, hash it, compare
   * -- finds nothing to fetch and cannot tell a documented absence from a lie.
   * Both entry points publish the receipt for a failed run now; this refuses the
   * row if one of them ever stops.
   */
  if (/^0x0{64}$/.test(row.receiptHash)) {
    return {
      recorded: false, tx: null, address: null,
      reason: 'refusing to write a row whose receiptHash is all zeros: it would point at no ' +
        'receipt on an append-only log. Publish the receipt to HCS first, or write nothing.',
    };
  }

  if (!address || !rpc || !signer) {
    const reason = 'RUN_REGISTRY_ADDRESS / BASE_SEPOLIA_RPC_URL / BASE_SEPOLIA_KEYSTORE not set';
    queue(row, reason);
    return { recorded: false, tx: null, address: null, reason };
  }

  /**
   * ⚠️ BROADCAST AND WAIT ARE SEPARATED, and the reason is a hole the timeout
   * I added yesterday opened.
   *
   * `cast send` used to broadcast and block until the receipt arrived. With a
   * 180-second wall clock on it, a transaction that was BROADCAST and simply
   * slow to mine came back as a failure -- and the failure queued the row for
   * retry. The retry re-sent it. The contract is append-only with no idempotence
   * on runId, so one run could be counted twice in the aggregates and twice by
   * the allocator, permanently.
   *
   * `--async` returns the hash the moment it is accepted by the node. From that
   * point the transaction exists whether or not we are still watching, so the
   * hash is the thing worth keeping: waiting for the receipt becomes a separate,
   * repeatable question rather than the only chance to learn the answer.
   */
  let tx;
  try {
    const { stdout } = await run(
      'cast',
      ['send', address, SIG, tuple(row), '--rpc-url', rpc, ...signer, '--async', '--json'],
      { cwd: REPO, maxBuffer: 8e6, timeout: 60_000 },
    );
    tx = JSON.parse(stdout).transactionHash ?? String(stdout).trim();
  } catch (e) {
    // Nothing was broadcast: no hash came back, so a retry cannot duplicate.
    const reason = `${e.stderr ?? e.message}`.trim().split('\n')[0];
    queue(row, reason, null);
    return { recorded: false, tx: null, address, reason };
  }

  const conf = await confirm(tx, rpc);
  if (conf.mined && conf.ok) return { recorded: true, tx, address, reason: null };
  if (conf.mined && !conf.ok) {
    // Mined and reverted. Re-sending is safe -- nothing was appended.
    queue(row, `transaction ${tx} reverted`, null);
    return { recorded: false, tx, address, reason: `transaction reverted` };
  }
  // Broadcast but not yet mined. ⚠️ The hash travels with the queued row and
  // `retryPending` will POLL it rather than re-send.
  queue(row, `broadcast but unconfirmed after ${CONFIRM_TIMEOUT_MS / 1000}s`, tx);
  return { recorded: false, tx, address, reason: 'broadcast, awaiting confirmation' };
}

/** How long to wait for a receipt before parking the hash. */
const CONFIRM_TIMEOUT_MS = 150_000;

/**
 * Was this transaction mined, and did it succeed?
 *
 * @returns {{mined: boolean, ok: boolean}} — `mined: false` means "not yet",
 *   never "not ever". The distinction is the whole point: a transaction we
 *   cannot find may still be in the mempool, and treating that as failure is
 *   what produced the double-write in the first place.
 */
async function confirm(tx, rpc, timeoutMs = CONFIRM_TIMEOUT_MS) {
  try {
    const { stdout } = await run(
      'cast',
      ['receipt', tx, '--rpc-url', rpc, '--confirmations', '1', '--json'],
      { cwd: REPO, maxBuffer: 8e6, timeout: timeoutMs },
    );
    const r = JSON.parse(stdout);
    return { mined: true, ok: r.status === '0x1' || r.status === 1 || r.status === true };
  } catch {
    return { mined: false, ok: false };
  }
}

/**
 * How this process proves it is the recorder.
 *
 * ⚠️ NOT `--private-key`. That put the key in the argument vector of every
 * `cast send`, and on Linux `/proc/<pid>/cmdline` is world-readable (mode 444)
 * while `/proc/<pid>/environ` is not (mode 400): for the few seconds of each
 * transaction, any user on the machine could read it.
 *
 * What that key buys is not write access -- RunRegistry is permissionless and
 * anyone may append -- it is IDENTITY. The subgraph groups models by recorder,
 * so whoever holds it can write invented scores that appear to come from us,
 * onto a log that is append-only by design and therefore not correctable.
 *
 * The keystore path is passed instead; the key stays encrypted on disk and the
 * password is read from a file whose path, not whose contents, is the argument.
 *
 * ⚠️ Refuses to fall back. A raw key in the environment is silently accepted by
 * `cast`, so a fallback here would mean the insecure path stays one missing
 * variable away and nothing says so.
 */
function signerArgs() {
  const keystore = process.env.BASE_SEPOLIA_KEYSTORE;
  const passwordFile = process.env.BASE_SEPOLIA_KEYSTORE_PASSWORD_FILE;
  if (keystore && passwordFile) return ['--keystore', keystore, '--password-file', passwordFile];
  if (process.env.BASE_SEPOLIA_PRIVATE_KEY) {
    throw new Error(
      'BASE_SEPOLIA_PRIVATE_KEY is set but the keystore is not. Passing a raw key to `cast` ' +
        'exposes it in /proc/<pid>/cmdline to every user on this machine. Run ' +
        './scripts/keystore-import.sh, set BASE_SEPOLIA_KEYSTORE and ' +
        'BASE_SEPOLIA_KEYSTORE_PASSWORD_FILE, and delete the raw key.',
    );
  }
  return null;
}

/** Drain the queue. Anything still failing stays queued. */
export async function retryPending() {
  if (!existsSync(PENDING)) return { attempted: 0, recorded: 0, stillPending: 0 };
  const lines = readFileSync(PENDING, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const address = process.env.RUN_REGISTRY_ADDRESS;
  const rpc = process.env.BASE_SEPOLIA_RPC_URL;
  const signer = signerArgs();
  if (!address || !rpc || !signer) return { attempted: 0, recorded: 0, stillPending: lines.length };

  const left = [];
  let recorded = 0;
  let confirmed = 0;
  for (const entry of lines) {
    /**
     * ⚠️ A queued row that carries a hash was BROADCAST. Re-sending it would
     * append the same run twice to a log with no idempotence on runId, and the
     * duplicate would count twice in every aggregate and in the allocator,
     * permanently. So it is polled, never re-sent.
     *
     * A transaction that was dropped from the mempool therefore stays pending
     * forever rather than being retried automatically. That is the safe
     * direction on an append-only log: a row that is missing can be added by a
     * human who has looked, a row written twice cannot be taken back.
     */
    if (entry.tx) {
      const conf = await confirm(entry.tx, rpc, 30_000);
      if (conf.mined && conf.ok) { confirmed++; continue; }
      if (conf.mined && !conf.ok) {
        // Reverted: nothing was appended, so re-sending is safe.
        entry.tx = null;
      } else {
        left.push({ ...entry, why: `still unconfirmed: ${entry.tx}` });
        continue;
      }
    }

    try {
      const { stdout } = await run('cast', ['send', address, SIG, tuple(entry.row), '--rpc-url', rpc,
                         ...signer, '--async', '--json'], { cwd: REPO, maxBuffer: 8e6, timeout: 60_000 });
      const tx = JSON.parse(stdout).transactionHash ?? String(stdout).trim();
      const conf = await confirm(tx, rpc, 60_000);
      if (conf.mined && conf.ok) { recorded++; continue; }
      left.push({ ...entry, tx, why: conf.mined ? `reverted: ${tx}` : `broadcast, unconfirmed: ${tx}` });
    } catch (e) {
      left.push({ ...entry, tx: null, why: `${e.stderr ?? e.message}`.trim().split('\n')[0] });
    }
  }
  writeFileSync(PENDING, left.map((e) => `${JSON.stringify(e)}\n`).join(''));
  return { attempted: lines.length, recorded, confirmed, stillPending: left.length };
}
