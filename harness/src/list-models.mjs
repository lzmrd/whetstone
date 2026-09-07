/**
 * Lists the model catalogue reachable with your key, cross-referenced against
 * the pinned price table.
 *
 * ⚠️ Two facts this script exists to make visible:
 *   1. The /v1/models endpoint returns NO pricing — only id, object, created,
 *      owned_by. Prices therefore come from prices.json, pinned by hand, with
 *      its source URL and retrieval date recorded inside it.
 *   2. The endpoint lists the whole Zen catalogue, not what your plan covers.
 *      A model appearing here may still be refused or billed separately.
 *      The only way to know is to call it — see `npm run model:smoke`.
 *
 * Run:  cd harness && npm run models
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const {
  OPENCODE_API_KEY,
  OPENCODE_BASE_URL = 'https://opencode.ai/zen/v1',
} = process.env;

if (!OPENCODE_API_KEY) {
  console.error('\n✗ OPENCODE_API_KEY is not set in .env\n');
  process.exit(1);
}

const raw = readFileSync(new URL('./prices.json', import.meta.url), 'utf8');
const table = JSON.parse(raw);
const tableHash = createHash('sha256').update(raw).digest('hex').slice(0, 12);

const res = await fetch(`${OPENCODE_BASE_URL}/models`, {
  headers: { Authorization: `Bearer ${OPENCODE_API_KEY}` },
});
if (!res.ok) {
  console.error(`\n✗ HTTP ${res.status} — ${(await res.text()).slice(0, 300)}\n`);
  process.exit(1);
}

const ids = (await res.json()).data.map((m) => m.id).sort();

const priced = [];
const unpriced = [];
for (const id of ids) {
  (table.prices[id] ? priced : unpriced).push(id);
}

console.log(`${ids.length} models reachable with this key.`);
console.log(`Price table v${table._version} (${table._retrieved}, sha256:${tableHash})\n`);

console.log('── PRICED — usable in the measured batch ──');
for (const id of priced) {
  const p = table.prices[id];
  const tag = p.input === 0 && p.output === 0 ? 'FREE' : `$${p.input} / $${p.output} per 1M`;
  console.log(`  ${id.padEnd(36)} ${tag}`);
}

console.log(`\n── NO PRICE ENTRY (${unpriced.length}) ──`);
console.log('  Cannot be metered, so must not appear in the leaderboard.');
console.log('  To use one: transcribe its price from', table._source);
console.log('  into prices.json, bump _version, and record the date.\n');
for (let i = 0; i < unpriced.length; i += 4) {
  console.log('  ' + unpriced.slice(i, i + 4).map((s) => s.padEnd(30)).join(''));
}

console.log(`
Next: pick your models and set them in .env, e.g.
  MODELS=deepseek-v4-flash-free,minimax-m3,minimax-m2.7

⚠️ R14: do NOT list a model that was used to red-team the mutation M.
   GPT Luna, GLM 5.3, Kimi K3 and Qwen 3.8 reviewed the specification;
   a model asked how to defeat M must not then be scored against it.

Then run 'npm run model:smoke' — it will show an HTTP error for any model
your plan does not actually cover, and confirm token usage is returned.
`);
