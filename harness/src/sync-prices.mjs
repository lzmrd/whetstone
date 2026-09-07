/**
 * Fetch list prices from each provider and PIN them into prices.json.
 *
 * ⚠️ This corrects a claim this project carried as a verified fact. "Runtime
 * price fetching is impossible, the endpoint returns no pricing" was true of
 * OpenCode Zen and was then generalised to providers it had never been checked
 * against. Groq and OpenRouter both return per-token pricing in /models.
 *
 * Fetched AND pinned, not fetched at run time. A provider changing a price
 * mid-batch would make runs within one batch incomparable, and the receipt is
 * supposed to let anyone recompute the cost. So the value is frozen here with
 * its retrieval date, and `npm run access` re-reads the live figure and reports
 * drift rather than silently following it.
 *
 * Run:  cd harness && npm run prices:sync
 */

import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Curated, explicit. Two rules, both of which cost real candidates:
 *
 *   OPEN-WEIGHT ONLY -- RUNBOOK "Model source". Excludes the proprietary free
 *   models on OpenRouter (poolside, thinkingmachines, cohere, dots-studio),
 *   which are otherwise the most tempting entries in the list.
 *
 *   R14 -- a model used to red-team this project must not be scored by it.
 *   Every one of the four reviewers is available on these providers:
 *     groq/qwen/qwen3.8-27b, openrouter/qwen/qwen3.8-*,
 *     openrouter/z-ai/glm-5.3*, openrouter/moonshotai/kimi-k3*,
 *     openrouter/openai/gpt-5.6-luna*
 *   None appear below. The check in access-probe.mjs enforces it on every run,
 *   because a curated list is a memory and a check is a property.
 */
const SELECTED = {
  groq: [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.6-27b',
  ],
  openrouter: [
    'google/gemma-4-31b-it:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'minimax/minimax-m3:free',
  ],
};

const ENDPOINT = {
  groq: 'https://api.groq.com/openai/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
};

/** Both providers quote USD per TOKEN. The table is per 1M — convert once, here. */
const perMillion = (x) => Number((Number(x) * 1e6).toFixed(6));

const file = new URL('./prices.json', import.meta.url);
const table = JSON.parse(readFileSync(file, 'utf8'));
const today = new Date().toISOString().slice(0, 10);

for (const [provider, wanted] of Object.entries(SELECTED)) {
  const cfg = table.providers[provider];
  const key = process.env[cfg.key_env];
  if (!key) {
    console.log(`  ${provider}: ${cfg.key_env} not set — skipped`);
    continue;
  }

  const res = await fetch(ENDPOINT[provider], { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    console.log(`  ${provider}: HTTP ${res.status} — skipped`);
    continue;
  }
  const byId = new Map((await res.json()).data.map((m) => [m.id, m]));

  const models = {};
  for (const id of wanted) {
    const m = byId.get(id);
    if (!m) { console.log(`  ⚠️  ${provider}/${id}: not in the catalogue — skipped`); continue; }
    const p = m.pricing;
    if (!p || p.prompt == null) { console.log(`  ⚠️  ${provider}/${id}: no pricing — cannot be metered`); continue; }
    models[id] = {
      input: perMillion(p.prompt),
      output: perMillion(p.completion),
      cached_read: p.input_cache_read != null ? perMillion(p.input_cache_read) : null,
    };
    console.log(`  ${provider}/${id.padEnd(40)} $${models[id].input} / $${models[id].output} per 1M`);
  }

  cfg.models = models;
  cfg.retrieved = today;
  cfg.price_origin = 'fetched from the provider /models endpoint, then pinned';
  cfg.status = `ACTIVE — ${Object.keys(models).length} model(s) selected: open-weight only, R14 reviewers excluded`;
}

table._version = (table._version ?? 1) + 1;
writeFileSync(file, JSON.stringify(table, null, 2) + '\n');
console.log(`\nprices.json is now v${table._version}, retrieved ${today}.`);
