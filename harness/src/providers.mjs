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

/**
 * R14 — a model used to red-team this project must never be scored by it.
 *
 * ⚠️ This set lived in access-probe.mjs, a smoke test, and STATUS.md recorded R14
 * as "✅ refuses to run on violation". It did no such thing: `npm run agent` and
 * `npm run batch` never consulted it. The rule was enforced incidentally, by
 * these models having no price entry, which is a different rule that happens to
 * catch the same cases today. Adding a price would have silently scored a
 * reviewer. Found by adversarial review.
 *
 * It lives here now because `resolve()` is the one path every entry point takes.
 *
 * Exact ids, because a substring match on "luna" also hits sao10k/l3-lunaris-8b,
 * which has nothing to do with the reviewer.
 */
export const RED_TEAM = new Set([
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

/** True if this spec names a model that reviewed this project. */
export function isRedTeam(spec) {
  return RED_TEAM.has(spec) || RED_TEAM.has(spec.replace(/:batch$/, ''));
}

export function resolve(spec) {
  const { provider, model } = parseSpec(spec);

  // ⚠️ Before anything else. A reviewed model must not be scored even if it is
  // priced, reachable and requested by name.
  if (isRedTeam(spec)) {
    throw new Error(
      `R14 VIOLATION: "${spec}" was used to red-team this project and must never be scored by it.\n` +
        `Its critiques shaped the specification, the gates and the task, so any score it earns is ` +
        `contaminated by its own influence on the benchmark. Refusing to run.`,
    );
  }
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
