/**
 * One x402 payment on Hedera: discover → sign → verify → settle.
 *
 * Extracted from pay-smoke.mjs so the loop and the smoke test cannot drift
 * apart. The smoke test proves the rail on its own; this is the same rail with
 * the console noise removed.
 */

import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { createClientHederaSigner, PrivateKey } from '@x402/hedera';

const {
  BLOCKY402_BASE_URL = 'https://api.testnet.blocky402.com',
  HEDERA_NETWORK = 'hedera:testnet',
  HEDERA_ASSET = '0.0.0',
} = process.env;

let cachedFeePayer = null;

/** ⚠️ Never hardcode the fee payer: the facilitator advertises it and may rotate it. */
export async function discoverFeePayer() {
  if (cachedFeePayer) return cachedFeePayer;
  const supported = await fetch(`${BLOCKY402_BASE_URL}/supported`).then((r) => r.json());
  const kind = supported.kinds?.find((k) => k.network === HEDERA_NETWORK);
  const feePayer = kind?.extra?.feePayer ?? supported.signers?.['hedera:*']?.[0];
  if (!feePayer) throw new Error(`no fee payer advertised for ${HEDERA_NETWORK}`);
  cachedFeePayer = feePayer;
  return feePayer;
}

export function requirements(amountTinybar, payTo, feePayer) {
  return {
    scheme: 'exact',
    network: HEDERA_NETWORK,
    amount: String(amountTinybar),
    payTo,
    maxTimeoutSeconds: 300,
    asset: HEDERA_ASSET,
    extra: { feePayer },
  };
}

/** Sign a payment payload. Does NOT settle: a resource server settles what it accepts. */
export async function signPayment(amountTinybar, payTo) {
  const { HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY } = process.env;
  if (!HEDERA_ACCOUNT_ID || !HEDERA_PRIVATE_KEY) throw new Error('HEDERA_ACCOUNT_ID / HEDERA_PRIVATE_KEY unset');
  if (payTo === HEDERA_ACCOUNT_ID) {
    throw new Error('payTo equals the payer: a transfer to yourself nets to zero and Hedera rejects it');
  }

  const feePayer = await discoverFeePayer();
  const paymentRequirements = requirements(amountTinybar, payTo, feePayer);
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
  return {
    paymentRequirements,
    paymentPayload,
    header: Buffer.from(JSON.stringify(paymentPayload)).toString('base64'),
  };
}

/** Server side: validate, then take the money. */
export async function verifyAndSettle(paymentPayload, paymentRequirements) {
  const body = { x402Version: 2, paymentPayload, paymentRequirements };
  const post = (path) =>
    fetch(`${BLOCKY402_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json());

  const verify = await post('/verify');
  if (!verify.isValid) {
    return { ok: false, stage: 'verify', reason: verify.invalidMessage ?? verify.invalidReason };
  }
  const settle = await post('/settle');
  if (!settle.success) {
    return { ok: false, stage: 'settle', reason: settle.errorMessage ?? settle.errorReason };
  }
  return {
    ok: true,
    payer: verify.payer,
    transaction_id: settle.transaction,
    network: settle.network,
    explorer: `https://hashscan.io/testnet/transaction/${settle.transaction}`,
  };
}
