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
const TARIFF = {
  base: Number(process.env.GATEWAY_BASE_TINYBAR ?? 10000),   // 0.0001 HBAR per request
  perInputToken: Number(process.env.GATEWAY_IN_TINYBAR ?? 4),
  perOutputToken: Number(process.env.GATEWAY_OUT_TINYBAR ?? 16), // output costs ~4x input, as list prices do
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

const read = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
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
  catch { return json(res, 400, { error: 'body is not JSON' }); }

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

  const settled = await verifyAndSettle(paymentPayload, paymentRequirements);
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

server.listen(PORT, () => {
  console.log(`
x402-gated inference gateway
  listening   http://127.0.0.1:${PORT}
  tariff      ${TARIFF.base} base + ${TARIFF.perInputToken}/input token + ${TARIFF.perOutputToken}/output token (tinybar)
              metered per call — the amount differs with every request
  paid to     ${PAY_TO}
  providers   ${Object.keys(TABLE.providers).join(', ')}

A request without X-PAYMENT gets 402. There is no unpaid path to the models.
`);
});
