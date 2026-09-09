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
/**
 * ⚠️ The ceiling on billable output, and the reason it is enforced here.
 *
 * `max_tokens` arrives from whoever is paying. Unvalidated it was
 * `Number(body.max_tokens ?? 1024)`, so a client could send a negative number
 * and be quoted a NEGATIVE amount, a string and be quoted `NaN`, or a billion
 * and have that number reach the provider on OUR API key. The quote is a price
 * the payer is shown before paying; a price that is not a non-negative integer
 * is not a price.
 *
 * The cap is above the interface's own 6 000-token reply ceiling with room to
 * spare, so it never binds on a real run of this harness and always binds on
 * something trying its luck.
 */
const MAX_OUTPUT_TOKENS = 32_000;

/** Wall clock for the upstream call. Generous: reasoning models are slow. */
const UPSTREAM_TIMEOUT_MS = 180_000;

class BadRequest extends Error {
  constructor(message) { super(message); this.badRequest = true; }
}

function priceFor(body) {
  const chars = JSON.stringify(body.messages ?? []).length;
  const inTokens = Math.ceil(chars / 4);

  const raw = body.max_tokens ?? 1024;
  const outTokens = Number(raw);
  if (!Number.isInteger(outTokens) || outTokens < 1) {
    throw new BadRequest(`max_tokens must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  if (outTokens > MAX_OUTPUT_TOKENS) {
    throw new BadRequest(`max_tokens ${outTokens} exceeds this gateway's ceiling of ${MAX_OUTPUT_TOKENS}`);
  }

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

async function handle(req, res) {
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

  /**
   * ⚠️ The MODEL is checked, not only the provider.
   *
   * Only the provider was validated, and the model string was forwarded
   * untouched. So anyone who could pay 0.0001 HBAR could invoke any model that
   * key can reach -- including expensive ones this gateway has no price for and
   * would therefore be selling below cost, on our account.
   *
   * The price table is the allowlist, and that is not a coincidence: a model
   * with no pinned price cannot be metered, and something that cannot be
   * metered must not be sold. `providers.mjs` already refuses to SCORE such a
   * model; this refuses to serve it.
   */
  if (!provider.models[model]) {
    return json(res, 400, {
      error: `"${spec}" has no pinned price, so this gateway does not serve it`,
      priced: Object.keys(provider.models),
    });
  }

  const feePayer = await discoverFeePayer();
  let quote;
  try { quote = priceFor(body); }
  catch (e) { if (e.badRequest) return json(res, 400, { error: e.message }); throw e; }
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

  /**
   * ⚠️ Bounded, and the bound matters more here than anywhere else in this
   * file: the payment has ALREADY SETTLED by the time this runs. An upstream
   * that accepts the connection and never answers left the client hanging
   * indefinitely on a request it had paid for, with no error and no refund.
   *
   * A 502 does not give the money back either -- that is honest metering of a
   * call we made on their behalf -- but it ends the request, says what
   * happened, and carries the settlement id so the payer can see what they
   * bought. Silence is the only option here that is worse than a failure.
   */
  let upstream;
  try {
    upstream = await fetch(`${provider.base_url}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, model }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    console.error(`  ✗ upstream ${timedOut ? 'timed out' : 'failed'} AFTER settlement: ${e?.message ?? e}`);
    return json(res, 502, {
      error: timedOut
        ? `upstream did not answer within ${UPSTREAM_TIMEOUT_MS / 1000}s`
        : `upstream request failed: ${e?.message ?? e}`,
      // ⚠️ The payment happened. Say so rather than letting it look free.
      payment_settled: true,
      transaction: settled.transaction_id,
      amount_tinybar: quote.amount,
    });
  }

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
}

/**
 * ⚠️ Every request is caught HERE, not by the process-wide handlers below.
 *
 * An unexpected throw inside `handle` used to reach `unhandledRejection`, which
 * logs and keeps the process alive -- while the client that triggered it waits
 * forever on a socket nobody will ever write to. Those handlers exist so one
 * bad request cannot take the gateway down mid-batch; they were never a way to
 * ANSWER the request. A supervisor restarting a process it believes to be
 * healthy is a different problem from a caller hanging on a paid call.
 */
const server = createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(`  ✗ unhandled error in request: ${e?.stack ?? e}`);
    if (res.headersSent) return res.end();
    json(res, 502, { error: 'gateway failed while handling this request' });
  });
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
