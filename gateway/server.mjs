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
 * ⚠️ Pricing is a flat amount per request, not per token: the token count is
 * not known before the call. The receipt keeps `hbar_paid` (what moved) apart
 * from `usd_list` (tokens x published list price) precisely because they are
 * different numbers and conflating them would be a lie about cost.
 *
 * Run:  npm run gateway   (from harness/)
 */

import { createServer } from 'node:http';
import { discoverFeePayer, requirements, verifyAndSettle } from '../harness/src/pay.mjs';
import { TABLE } from '../harness/src/providers.mjs';

const PORT = Number(process.env.GATEWAY_PORT ?? 8402);
const PRICE_TINYBAR = String(process.env.GATEWAY_PRICE_TINYBAR ?? 100000); // 0.001 HBAR
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
  if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, price_tinybar: PRICE_TINYBAR });
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
  const paymentRequirements = requirements(PRICE_TINYBAR, PAY_TO, feePayer);

  // ── 1. the challenge ────────────────────────────────────────────────
  const header = req.headers['x-payment'];
  if (!header) {
    return json(res, 402, {
      x402Version: 2,
      error: 'payment required',
      accepts: [paymentRequirements],
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
  console.log(`  ✓ settled ${PRICE_TINYBAR} tinybar from ${settled.payer} — ${settled.transaction_id}`);

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
    })).toString('base64'),
  });
  res.end(text);
});

server.listen(PORT, () => {
  console.log(`
x402-gated inference gateway
  listening   http://127.0.0.1:${PORT}
  price       ${PRICE_TINYBAR} tinybar per request
  paid to     ${PAY_TO}
  providers   ${Object.keys(TABLE.providers).join(', ')}

A request without X-PAYMENT gets 402. There is no unpaid path to the models.
`);
});
