/**
 * The provider registry: resolve "provider/model" into everything a call needs.
 *
 * ⚠️ Two providers is not gold-plating. R10 commits the allocator to "budgeting
 * across providers"; with a single provider that phrase has nothing behind it.
 * It also removes a single point of failure that already cost a day -- GATE 0
 * fired because the one provider we had turned out to refuse API access
 * entirely.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const RAW = readFileSync(new URL('./prices.json', import.meta.url), 'utf8');
export const TABLE = JSON.parse(RAW);
export const TABLE_HASH = createHash('sha256').update(RAW).digest('hex');

/** Model ids may contain slashes (openrouter), so split on the FIRST one only. */
export function parseSpec(spec) {
  const i = spec.indexOf('/');
  if (i < 0) {
    throw new Error(
      `"${spec}" is not a model spec. Use provider/model, e.g. groq/llama-3.3-70b-versatile.\n` +
        `Known providers: ${Object.keys(TABLE.providers).join(', ')}`,
    );
  }
  return { provider: spec.slice(0, i), model: spec.slice(i + 1) };
}

export function resolve(spec) {
  const { provider, model } = parseSpec(spec);
  const p = TABLE.providers[provider];
  if (!p) {
    throw new Error(`unknown provider "${provider}". Known: ${Object.keys(TABLE.providers).join(', ')}`);
  }

  const apiKey = process.env[p.key_env];
  if (!apiKey) throw new Error(`${p.key_env} is not set in .env — needed for provider "${provider}"`);

  // ⚠️ No price entry means no cost column for this model, and the cost column
  // is half the thesis. Refuse rather than silently report zero.
  const price = p.models[model];
  if (!price) {
    throw new Error(
      `no pinned price for "${spec}".\n` +
        `A model that cannot be metered must not appear in the leaderboard.\n` +
        `Transcribe it from ${p.source} into harness/src/prices.json, ` +
        `set "retrieved", and bump _version.`,
    );
  }

  return { provider, model, apiKey, price, baseUrl: p.base_url, source: p.source };
}

/** Every provider/model pair that has a pinned price. */
export function allPriced() {
  const out = [];
  for (const [provider, p] of Object.entries(TABLE.providers)) {
    for (const [model, price] of Object.entries(p.models)) {
      out.push({ spec: `${provider}/${model}`, provider, model, price, cfg: p });
    }
  }
  return out;
}
