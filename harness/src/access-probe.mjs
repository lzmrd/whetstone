/**
 * Can we actually call the models we plan to score?
 *
 * ⚠️ This exists because the answer turned out to be NO, on 7 September, for
 * every model in the pinned price table -- discovered only when the agent loop
 * was first run end to end. `npm run models` lists the catalogue and says
 * nothing about entitlement; a model can appear there and be unreachable.
 *
 * Failure modes seen, all distinct and all worth telling apart:
 *   FREE-TIER GATED  the free models are usable only inside the OpenCode client.
 *                    The API refuses them outright. No amount of credit fixes it.
 *   NO CREDITS       paid models need a funded workspace balance.
 *   MODEL DOWN       provider-side outage, transient.
 *
 * Run:  cd harness && npm run access
 */

import { readFileSync } from 'node:fs';

const { OPENCODE_API_KEY, OPENCODE_BASE_URL = 'https://opencode.ai/zen/v1' } = process.env;
if (!OPENCODE_API_KEY) {
  console.error('\n✗ OPENCODE_API_KEY is not set in .env\n');
  process.exit(1);
}

const table = JSON.parse(readFileSync(new URL('./prices.json', import.meta.url), 'utf8'));

function classify(status, body) {
  if (/free tier can only be used in OpenCode/.test(body)) return ['FREE-TIER GATED', 'API blocked; client-only'];
  if (/Insufficient balance/.test(body)) return ['NO CREDITS', 'fund the workspace'];
  if (/unavailable/.test(body)) return ['MODEL DOWN', 'provider-side, retry later'];
  return [`HTTP ${status}`, body.replace(/\s+/g, ' ').slice(0, 70)];
}

let usable = 0;
console.log(`\nProbing ${Object.keys(table.prices).length} priced models at ${OPENCODE_BASE_URL}\n`);

for (const [id, price] of Object.entries(table.prices)) {
  const kind = price.input === 0 && price.output === 0 ? 'free' : 'paid';
  let tag, note = '';
  try {
    const res = await fetch(`${OPENCODE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENCODE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: id, messages: [{ role: 'user', content: 'say ok' }], max_tokens: 5 }),
    });
    if (res.ok) {
      const json = await res.json();
      const metered = Boolean(json.usage?.prompt_tokens ?? json.usage?.input_tokens);
      tag = 'USABLE';
      note = metered ? 'usage reported' : '⚠️ NO usage — cannot be metered, must not be scored';
      if (metered) usable++;
    } else {
      [tag, note] = classify(res.status, await res.text());
    }
  } catch (e) {
    [tag, note] = ['NETWORK', e.message.slice(0, 60)];
  }
  console.log(`  ${id.padEnd(32)} ${kind.padEnd(5)} ${tag.padEnd(16)} ${note}`);
}

console.log(`\n${usable} model(s) usable and meterable.`);
if (usable === 0) {
  console.log('\n⚠️  No measured run is possible. This is a GATE 0 failure — see spec/RUNBOOK.md.\n');
  process.exit(1);
}
console.log();
