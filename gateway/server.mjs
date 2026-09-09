/**
 * The x402-gated inference gateway.
 *
 * ⚠️ WHY THIS EXISTS AT ALL. The harness could settle a payment and then call
 * the provider directly, and the receipt would look identical. But that is
 * "pay, then call" -- the payment gates nothing, and anyone who knows x402 sees
 * it immediately. Here the 402 comes FIRST: without a valid X-PAYMENT header
 * there is no inference, because the provider key lives on this side and the
 * client never has it.
 *
 * Flow, per request:
 *   1. no X-PAYMENT            -> 402 + paymentRequirements  (the challenge)
 *   2. X-PAYMENT present       -> /verify, then /settle       (take the money)
 *   3. settled                 -> proxy to the provider, return its answer
 *                                 plus X-PAYMENT-RESPONSE carrying the tx id
 *
 * ⚠️ PRICING IS METERED PER CALL, not flat. §12 claims "per-call metering rather
 * than a flat charge" as an extra point scored, and for a while the gateway
 * charged 0.001 HBAR for every request regardless of size, which made that claim
 * false.
 *
 * x402 settles BEFORE the work happens, so the completion length is not yet
 * known. The honest construction is to meter the request's DECLARED UPPER BOUND:
 * the prompt actually sent, plus the max_tokens the client asked to be allowed.
 * The amount therefore varies with every request, and a client that asks for
 * less pays less.
 *
 * ⚠️ It is an upper bound, so it OVERCHARGES relative to tokens actually used.
 * That is stated rather than hidden, and it is why `hbar_paid` (what moved) is
 * kept apart from `usd_list` (tokens actually used x published list price) in the
 * receipt. They are different numbers and conflating them would be a lie.
 *
 * Run:  npm run gateway   (from harness/)
 */

import { createServer } from 'node:http';
import { discoverFeePayer, requirements, verifyAndSettle } from '../harness/src/pay.mjs';
import { TABLE } from '../harness/src/providers.mjs';

const PORT = Number(process.env.GATEWAY_PORT ?? 8402);
/** Declared tariff, in tinybar. Flat part covers settlement; the rest is metered. */
/**
 * ⚠️ Validated at startup. `Number('abc')` is NaN, and NaN propagates silently
 * all the way into the 402 response as `amount: "NaN"` -- a payment
 * requirement no client can satisfy and no log explains. A tariff is the price
 * of the service; it either parses as a non-negative integer or the gateway
 * does not start.
 */
const tinybar = (envKey, fallback) => {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`\n✗ ${envKey}=${JSON.stringify(raw)} is not a non-negative integer number of tinybar.\n`);
    process.exit(1);
  }
  return n;
};

const TARIFF = {
  base: tinybar('GATEWAY_BASE_TINYBAR', 10000),   // 0.0001 HBAR per request
  perInputToken: tinybar('GATEWAY_IN_TINYBAR', 4),
  perOutputToken: tinybar('GATEWAY_OUT_TINYBAR', 16), // output costs ~4x input, as list prices do
};

/**
 * ⚠️ A character/4 estimate, not a tokenizer. Deliberate: running the provider's
 * tokenizer server-side for every provider is a dependency the gateway does not
 * need, and the estimate only has to be MONOTONIC in request size for metering to
 * mean something. The estimate is returned in the 402 body so the client can see
 * exactly what it is being charged for.
 */
function priceFor(body) {
  const chars = JSON.stringify(body.messages ?? []).length;
  const inTokens = Math.ceil(chars / 4);
  const outTokens = Number(body.max_tokens ?? 1024);
  const amount = TARIFF.base + inTokens * TARIFF.perInputToken + outTokens * TARIFF.perOutputToken;
  return { amount: String(amount), inTokens, outTokens };
}
const PAY_TO = process.env.HEDERA_PAY_TO;

if (!PAY_TO) {
  console.error('\n✗ HEDERA_PAY_TO is not set — the gateway operator needs an account to be paid into.\n');
  process.exit(1);
}

/**
 * ⚠️ Bounded. An unbounded reader on a public listener is a memory exhaustion
 * with no exploit needed: one request that never ends. The cap is far above any
 * real chat completion, so it can only be hit deliberately.
 */
const MAX_BODY_BYTES = 1024 * 1024;

const read = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('request body too large'), { tooLarge: true }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const json = (res, code, obj, headers = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(obj));
};

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, tariff_tinybar: TARIFF });
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) return json(res, 404, { error: 'not found' });

  let body;
  try { body = JSON.parse(await read(req)); }
  catch (e) {
    if (e?.tooLarge) return json(res, 413, { error: `body exceeds ${MAX_BODY_BYTES} bytes` });
    return json(res, 400, { error: 'body is not JSON' });
  }

  // The client addresses provider/model; the provider key never leaves this side.
  const spec = String(body.model ?? '');
  const i = spec.indexOf('/');
  const providerId = i < 0 ? '' : spec.slice(0, i);
  const model = i < 0 ? spec : spec.slice(i + 1);
  const provider = TABLE.providers[providerId];
  if (!provider) return json(res, 400, { error: `unknown provider in model spec "${spec}"` });

  const feePayer = await discoverFeePayer();
  const quote = priceFor(body);
  const paymentRequirements = requirements(quote.amount, PAY_TO, feePayer);

  // ── 1. the challenge ────────────────────────────────────────────────
  const header = req.headers['x-payment'];
  if (!header) {
    return json(res, 402, {
      x402Version: 2,
      error: 'payment required',
      accepts: [paymentRequirements],
      // What the price is made of, so the charge is inspectable and not a number
      // the server simply asserts.
      metering: {
        estimated_input_tokens: quote.inTokens,
        max_output_tokens: quote.outTokens,
        tariff_tinybar: TARIFF,
        note: 'upper bound: output is priced at max_tokens because x402 settles before the work',
      },
    });
  }

  // ── 2. verify, then settle ──────────────────────────────────────────
  let paymentPayload;
  try { paymentPayload = JSON.parse(Buffer.from(header, 'base64').toString('utf8')); }
  catch { return json(res, 400, { error: 'X-PAYMENT is not valid base64 JSON' }); }

  /**
   * ⚠️ The facilitator is a remote HTTPS service and it WILL drop connections.
   * This call was unguarded, so a single transient ECONNRESET during settlement
   * threw out of the request handler, took the whole gateway process down, and
   * every subsequent run failed with "fetch failed" — which the harness then
   * recorded as the MODEL failing. A local network blip was written to a public
   * append-only log as five model failures. Guarded here, and attributed
   * correctly in agent.mjs.
   */
  let settled;
  try {
    settled = await verifyAndSettle(paymentPayload, paymentRequirements);
  } catch (e) {
    console.log(`  ✗ facilitator unreachable: ${e.cause?.code ?? e.message}`);
    return json(res, 502, {
      error: 'facilitator_unreachable',
      stage: 'settle',
      reason: `${e.cause?.code ?? e.message}`,
      note: 'This is an infrastructure failure on the payment rail, not a model failure. Retry.',
    });
  }
  if (!settled.ok) {
    console.log(`  ✗ ${settled.stage} failed: ${settled.reason}`);
    return json(res, 402, { x402Version: 2, error: `${settled.stage} failed`, reason: settled.reason });
  }
  console.log(
    `  ✓ settled ${quote.amount} tinybar (${quote.inTokens} in / ≤${quote.outTokens} out) ` +
      `from ${settled.payer} — ${settled.transaction_id}`,
  );

  // ── 3. only now is there any inference ──────────────────────────────
  const key = process.env[provider.key_env];
  if (!key) return json(res, 500, { error: `${provider.key_env} not set on the gateway` });

  const upstream = await fetch(`${provider.base_url}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, model }),
  });

  const text = await upstream.text();
  res.writeHead(upstream.status, {
    'Content-Type': 'application/json',
    // The proof of payment travels back with the answer.
    'X-PAYMENT-RESPONSE': Buffer.from(JSON.stringify({
      success: true,
      transaction: settled.transaction_id,
      network: settled.network,
      payer: settled.payer,
      amount_tinybar: quote.amount,
      metering: { estimated_input_tokens: quote.inTokens, max_output_tokens: quote.outTokens },
    })).toString('base64'),
  });
  res.end(text);
});

/**
 * ⚠️ Last line of defence. Any unhandled rejection anywhere in a handler used to
 * terminate the process, so one bad request ended the run for all the others.
 * Log it and keep serving: a gateway that dies quietly is worse than one that
 * returns errors loudly.
 */
process.on('unhandledRejection', (e) => {
  console.error(`\n⚠️  unhandled rejection (the gateway stays up): ${e?.stack ?? e}\n`);
});
process.on('uncaughtException', (e) => {
  console.error(`\n⚠️  uncaught exception (the gateway stays up): ${e?.stack ?? e}\n`);
});

/**
 * ⚠️ Bound to the loopback interface explicitly.
 *
 * `listen(PORT)` binds 0.0.0.0 — every interface — while the banner below has
 * always printed `127.0.0.1`. On any shared or public network that exposed a
 * proxy which spends our provider API keys, gated by nothing but a payment made
 * to us. The log was not describing the server; it was describing an intention.
 *
 * Set GATEWAY_HOST deliberately to serve a third-party agent — the answer this
 * project gives to the closed-loop objection — but as a choice, not a default.
 */
const HOST = process.env.GATEWAY_HOST ?? '127.0.0.1';

server.listen(PORT, HOST, () => {
  console.log(`
x402-gated inference gateway
  listening   http://${HOST}:${PORT}
  tariff      ${TARIFF.base} base + ${TARIFF.perInputToken}/input token + ${TARIFF.perOutputToken}/output token (tinybar)
              metered per call — the amount differs with every request
  paid to     ${PAY_TO}
  providers   ${Object.keys(TABLE.providers).join(', ')}

A request without X-PAYMENT gets 402. There is no unpaid path to the models.
`);
});
