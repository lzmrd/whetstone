/**
 * The canonical record: a receipt written to a Hedera Consensus Service topic,
 * then READ BACK from the mirror node and hash-checked.
 *
 * ⚠️ D-09: the registry is a log, not an oracle. Nothing here verifies that a
 * run happened -- HCS cannot know that. What it provides is a tamper-evident,
 * timestamped, publicly readable record, and verifiability comes from
 * reproducibility: pinned toolchain plus published artifact hashes mean anyone
 * can recompute the numbers and catch a lie.
 *
 * The read-back is not ceremony. Writing and assuming it landed is how you
 * discover on Thursday that the topic id was wrong, or the message was chunked,
 * or the mirror node holds something different from what you sent.
 */

import {
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import { createHash } from 'node:crypto';

const MIRROR = 'https://testnet.mirrornode.hedera.com/api/v1';

/** HCS charges and chunks per 1024 bytes; a chunked message costs several sequence numbers. */
export const CHUNK_BYTES = 1024;

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function client() {
  const { HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY } = process.env;
  if (!HEDERA_ACCOUNT_ID || !HEDERA_PRIVATE_KEY) {
    throw new Error('HEDERA_ACCOUNT_ID / HEDERA_PRIVATE_KEY are not set in .env');
  }
  return Client.forTestnet().setOperator(
    HEDERA_ACCOUNT_ID,
    PrivateKey.fromStringECDSA(HEDERA_PRIVATE_KEY),
  );
}

/** Create the topic once. The id belongs in .env, not in code. */
export async function createTopic(memo = 'whetstone/receipts/v2') {
  const c = client();
  const receipt = await (await new TopicCreateTransaction()
    .setTopicMemo(memo)
    .execute(c)).getReceipt(c);
  c.close();
  return receipt.topicId.toString();
}

/**
 * Submit one receipt. Returns the pointer that Base Sepolia will later carry:
 * topic, sequence number, consensus timestamp and the content hash.
 */
/**
 * THE bytes of a receipt. Not "a" serialization — the one published to HCS,
 * hashed into `content_sha256`, and committed to on Base Sepolia.
 *
 * ⚠️ Exported because the artifact bundle wrote its own pretty-printed copy.
 * Same content, different bytes, different sha256 — so every published bundle
 * hashed differently from the receipt the chains had committed to, and a reader
 * who hashed the file we handed them would have concluded we were lying. 11 of
 * 11 scored runs were in that state and nothing noticed, because each half was
 * internally consistent. Two writers, one definition, so they cannot drift.
 */
export const canonical = (receipt) => JSON.stringify(receipt);

export async function submitReceipt(receiptObject, topicId = process.env.HCS_TOPIC_ID) {
  if (!topicId) {
    throw new Error(
      'HCS_TOPIC_ID is not set. Run `npm run hcs:init` once and put the id in .env.',
    );
  }
  const payload = canonical(receiptObject);
  const bytes = Buffer.byteLength(payload);

  const c = client();
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(payload)
    .execute(c);
  const receipt = await tx.getReceipt(c);
  c.close();

  return {
    topic_id: topicId,
    sequence_number: Number(receipt.topicSequenceNumber),
    transaction_id: tx.transactionId.toString(),
    content_sha256: sha256(payload),
    bytes,
    chunks: Math.ceil(bytes / CHUNK_BYTES),
  };
}

/**
 * Read the message back from the mirror node and confirm it is byte-identical
 * to what was sent.
 *
 * ⚠️ HCS SPLITS ANYTHING OVER 1024 BYTES, and the mirror node exposes each chunk
 * as its OWN sequence number. A receipt is comfortably over that -- the first
 * real one was 1 645 bytes -- so fetching `messages/{seq}` returns the first
 * 1024 bytes and nothing announces that the rest exists. Hashing that gives a
 * mismatch, which is how this was found; hashing it and NOT checking would have
 * published a pointer to a truncated record.
 *
 * Chunks are contiguous from the receipt's sequence number, and each carries
 * chunk_info saying which of how many it is. Both are checked.
 */
export async function verifyOnMirror(topicId, sequenceNumber, expectedSha, { chunks = 1, timeoutMs = 60000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const first = `${MIRROR}/topics/${topicId}/messages/${sequenceNumber}`;

  while (Date.now() < deadline) {
    const parts = [];
    let missing = false;
    let declaredTotal = null;

    for (let i = 0; i < chunks; i++) {
      const res = await fetch(`${MIRROR}/topics/${topicId}/messages/${sequenceNumber + i}`);
      if (res.status === 404) { missing = true; break; }
      if (!res.ok) throw new Error(`mirror node HTTP ${res.status}`);
      const msg = await res.json();
      if (msg.chunk_info) {
        declaredTotal = msg.chunk_info.total;
        // Guard against reading somebody else's message that happens to sit at
        // the next sequence number.
        if (msg.chunk_info.number !== i + 1) {
          return { found: true, matches: false, url: first, error: `chunk ${i + 1} reports number ${msg.chunk_info.number}` };
        }
      }
      parts.push({ content: Buffer.from(msg.message, 'base64').toString('utf8'), ts: msg.consensus_timestamp });
    }

    if (!missing) {
      if (declaredTotal != null && declaredTotal !== chunks) {
        return { found: true, matches: false, url: first, error: `message declares ${declaredTotal} chunks, we expected ${chunks}` };
      }
      const content = parts.map((p) => p.content).join('');
      const got = sha256(content);
      return {
        found: true,
        matches: got === expectedSha,
        chunks_read: parts.length,
        consensus_timestamp: parts[parts.length - 1].ts,
        content_sha256: got,
        content,
        url: first,
      };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { found: false, matches: false, url: first };
}
