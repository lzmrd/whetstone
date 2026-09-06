/**
 * Whetstone — payment rail smoke test.
 *
 * Proves the Hedera x402 round-trip end to end: discover → sign → verify → settle.
 * This is the Hedera bounty's core requirement ("at least one real paid request
 * end to end"), isolated so it can be proven on day 0, before anything harder.
 *
 * Run:  cd harness && npm install && npm run pay:smoke
 */

import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { createClientHederaSigner, PrivateKey } from '@x402/hedera';

const {
  BLOCKY402_BASE_URL = 'https://api.testnet.blocky402.com',
  HEDERA_ACCOUNT_ID,
  HEDERA_PRIVATE_KEY,
  HEDERA_PAY_TO,
  HEDERA_ASSET = '0.0.0',
  HEDERA_NETWORK = 'hedera:testnet',
} = process.env;

const AMOUNT_TINYBAR = '100000'; // 0.001 HBAR

const die = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

// ── 0. preconditions ────────────────────────────────────────────────
for (const [k, v] of Object.entries({ HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, HEDERA_PAY_TO })) {
  if (!v) die(`${k} is not set. Copy .env.example to .env and fill it in.`);
}

if (HEDERA_PAY_TO === HEDERA_ACCOUNT_ID) {
  die(
    `HEDERA_PAY_TO equals HEDERA_ACCOUNT_ID (${HEDERA_ACCOUNT_ID}).\n` +
      `  A transfer to yourself nets to zero and Hedera will reject it.\n` +
      `  Create a second testnet account and use it as HEDERA_PAY_TO — that is\n` +
      `  also the honest shape: the gateway operator is the payee, the agent is the payer.`,
  );
}

// ── 1. discover: never hardcode the fee payer ───────────────────────
console.log(`→ GET ${BLOCKY402_BASE_URL}/supported`);
const supported = await fetch(`${BLOCKY402_BASE_URL}/supported`).then((r) => r.json());

const kind = supported.kinds?.find((k) => k.network === HEDERA_NETWORK);
if (!kind) die(`The facilitator does not advertise ${HEDERA_NETWORK}.`);

const feePayer = kind.extra?.feePayer ?? supported.signers?.['hedera:*']?.[0];
if (!feePayer) die('No fee payer advertised for Hedera.');
console.log(`  fee payer: ${feePayer}`);

// ── 2. build the requirements ───────────────────────────────────────
const paymentRequirements = {
  scheme: 'exact',
  network: HEDERA_NETWORK,
  amount: AMOUNT_TINYBAR,
  payTo: HEDERA_PAY_TO,
  maxTimeoutSeconds: 300,
  asset: HEDERA_ASSET,
  extra: { feePayer },
};

// ── 3. sign ─────────────────────────────────────────────────────────
console.log(`→ signing ${AMOUNT_TINYBAR} tinybar (0.001 HBAR) from ${HEDERA_ACCOUNT_ID}`);
const signer = createClientHederaSigner(
  HEDERA_ACCOUNT_ID,
  PrivateKey.fromStringECDSA(HEDERA_PRIVATE_KEY),
  { network: HEDERA_NETWORK },
);

const signed = await new ExactHederaScheme(signer).createPaymentPayload(2, paymentRequirements);

const paymentPayload = {
  x402Version: 2,
  scheme: 'exact',
  network: HEDERA_NETWORK,
  accepted: paymentRequirements,
  payload: signed.payload,
};

const body = { x402Version: 2, paymentPayload, paymentRequirements };

// ── 4. verify ───────────────────────────────────────────────────────
console.log('→ POST /verify');
const verify = await fetch(`${BLOCKY402_BASE_URL}/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then((r) => r.json());

if (!verify.isValid) die(`Verification failed: ${verify.invalidMessage ?? verify.invalidReason}`);
console.log(`  valid — payer ${verify.payer}`);

// ── 5. settle ───────────────────────────────────────────────────────
console.log('→ POST /settle');
const settle = await fetch(`${BLOCKY402_BASE_URL}/settle`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then((r) => r.json());

if (!settle.success) die(`Settlement failed: ${settle.errorMessage ?? settle.errorReason}`);

// ── 6. the proof header a resource server would receive ─────────────
const xPayment = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

console.log(`\n✓ settled — transaction ${settle.transaction}`);
console.log(`  network:   ${settle.network}`);
console.log(`  X-PAYMENT: ${xPayment.slice(0, 60)}… (${xPayment.length} chars)`);
console.log(`\n  Verify independently on HashScan:`);
console.log(`  https://hashscan.io/testnet/transaction/${settle.transaction}\n`);
