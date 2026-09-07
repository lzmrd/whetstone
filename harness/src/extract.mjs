/**
 * Pull a Solidity file out of a model's reply.
 *
 * ⚠️ This is the least glamorous file in the project and one of the most
 * load-bearing. Models answer with prose around the code, several blocks, an
 * untagged fence, a diff, or an apology. Every extraction failure that gets
 * silently treated as "the model failed the task" is a scoring error attributed
 * to the model instead of to us -- so the failure modes are named, and an
 * unusable reply is fed back as a format error and retried, not scored as zero.
 */

const FENCE = /```[ \t]*([A-Za-z0-9+#-]*)[ \t]*\r?\n([\s\S]*?)```/g;

function looksLikeSolidity(s) {
  return /\bpragma\s+solidity\b/.test(s) && /\bcontract\s+\w+/.test(s);
}

/**
 * @returns {{ok: true, source: string, how: string} | {ok: false, reason: string}}
 */
export function extractSolidity(reply) {
  if (typeof reply !== 'string' || reply.trim() === '') {
    return { ok: false, reason: 'The reply was empty.' };
  }

  const blocks = [...reply.matchAll(FENCE)].map((m) => ({
    tag: (m[1] || '').toLowerCase(),
    body: m[2],
  }));

  // 1. a block explicitly tagged solidity — what the prompt asks for
  const tagged = blocks.filter((b) => b.tag === 'solidity' || b.tag === 'sol');
  if (tagged.length === 1) return { ok: true, source: tagged[0].body.trim(), how: 'tagged' };
  if (tagged.length > 1) {
    // Several tagged blocks: usually "before" and "after". Prefer the last
    // complete one; if none is complete, that is a format error, not a guess.
    const complete = tagged.filter((b) => looksLikeSolidity(b.body));
    if (complete.length >= 1) {
      return { ok: true, source: complete[complete.length - 1].body.trim(), how: 'tagged/last-of-many' };
    }
    return { ok: false, reason: `Found ${tagged.length} solidity blocks and none was a complete file.` };
  }

  // 2. an untagged fence that is nonetheless a complete file
  const untagged = blocks.filter((b) => looksLikeSolidity(b.body));
  if (untagged.length >= 1) {
    return { ok: true, source: untagged[untagged.length - 1].body.trim(), how: 'untagged-fence' };
  }

  // 3. no fences at all, but the whole reply is a file
  if (blocks.length === 0 && looksLikeSolidity(reply)) {
    return { ok: true, source: reply.trim(), how: 'bare' };
  }

  if (blocks.length > 0) {
    return {
      ok: false,
      reason:
        `Found ${blocks.length} code block(s) but none contained a complete Solidity file ` +
        `(needs both a "pragma solidity" line and a "contract" declaration).`,
    };
  }
  return { ok: false, reason: 'The reply contained no code block and was not itself a Solidity file.' };
}
