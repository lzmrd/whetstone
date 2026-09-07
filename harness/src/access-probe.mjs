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

import { TABLE, allPriced } from './providers.mjs';

/**
 * R14 — a model used to red-team this project must never be scored by it.
 * Exact ids, because a substring match on "luna" also hits sao10k/l3-lunaris-8b,
 * which has nothing to do with the reviewer. Checked on EVERY probe: a curated
 * selection is a memory, a check is a property.
 */
const RED_TEAM = new Set([
  'groq/qwen/qwen3.8-27b',
  'openrouter/qwen/qwen3.8-27b',
  'openrouter/qwen/qwen3.8-max-0902',
  'openrouter/qwen/qwen3.8-flash',
  'openrouter/qwen/qwen3.8-2.4t-a95b',
  'openrouter/z-ai/glm-5.3',
  'openrouter/z-ai/glm-5.3-flash',
  'openrouter/moonshotai/kimi-k3',
  'openrouter/openai/gpt-5.6-luna',
  'openrouter/openai/gpt-5.6-luna-pro',
]);

function classify(status, body) {
  if (/free tier can only be used in OpenCode/.test(body)) return ['FREE-TIER GATED', 'API blocked; client-only'];
  if (/Insufficient balance/.test(body)) return ['NO CREDITS', 'fund the workspace'];
  if (/unavailable/.test(body)) return ['MODEL DOWN', 'provider-side, retry later'];
  return [`HTTP ${status}`, body.replace(/\s+/g, ' ').slice(0, 70)];
}

let usable = 0;
const targets = allPriced();
console.log(`\nProbing ${targets.length} priced model(s) across ${Object.keys(TABLE.providers).length} provider(s)\n`);

const leaked = targets.filter((t) => RED_TEAM.has(t.spec) || RED_TEAM.has(t.spec.replace(/:batch$/, '')));
if (leaked.length > 0) {
  console.error(`\n✗ R14 VIOLATION — these reviewed this project and must not be scored by it:`);
  for (const t of leaked) console.error(`    ${t.spec}`);
  console.error(`  Remove them from prices.json.\n`);
  process.exit(1);
}

for (const { spec, price, cfg } of targets) {
  const kind = price.input === 0 && price.output === 0 ? 'free' : 'paid';
  const id = spec.slice(spec.indexOf('/') + 1);
  const apiKey = process.env[cfg.key_env];
  if (!apiKey) {
    console.log(`  ${spec.padEnd(40)} ${kind.padEnd(5)} ${'NO KEY'.padEnd(16)} set ${cfg.key_env} in .env`);
    continue;
  }
  let tag, note = '';
  try {
    const res = await fetch(`${cfg.base_url}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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
  console.log(`  ${spec.padEnd(40)} ${kind.padEnd(5)} ${tag.padEnd(16)} ${note}`);
}

console.log(`\n${usable} model(s) usable and meterable.`);
if (usable === 0) {
  console.log('\n⚠️  No measured run is possible. This is a GATE 0 failure — see spec/RUNBOOK.md.\n');
  process.exit(1);
}
console.log();
