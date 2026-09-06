/**
 * Whetstone — model access smoke test.
 *
 * Closes two day-0 risks in one run:
 *   1. Does the provider return token `usage`?  → without it there is no cost column,
 *      and the cost column is half the thesis.
 *   2. Are per-token prices retrievable at runtime? → this is what makes pass-through
 *      pricing a fact anyone can check rather than a claim we make.
 *
 * Run:  cd harness && npm run model:smoke
 */

const {
  OPENCODE_API_KEY,
  OPENCODE_BASE_URL = 'https://opencode.ai/zen/v1',
  MODELS = '',
} = process.env;

const die = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

if (!OPENCODE_API_KEY) die('OPENCODE_API_KEY is not set.');

const models = MODELS.split(',').map((m) => m.trim()).filter(Boolean);
if (models.length === 0) {
  die('MODELS is empty. Put at least one model id in .env (comma-separated).');
}

const auth = { Authorization: `Bearer ${OPENCODE_API_KEY}` };

// ── 1. the catalogue: prices must be fetchable, not hardcoded ───────
console.log(`→ GET ${OPENCODE_BASE_URL}/models`);
let catalogue = new Map();
try {
  const res = await fetch(`${OPENCODE_BASE_URL}/models`, { headers: auth });
  const json = await res.json();
  const list = json.data ?? json.models ?? json;
  for (const m of Array.isArray(list) ? list : []) {
    catalogue.set(m.id ?? m.name, m);
  }
  console.log(`  ${catalogue.size} models in the catalogue`);
} catch (e) {
  console.log(`  ⚠️  could not read the catalogue: ${e.message}`);
  console.log('     Pass-through pricing would have to be hardcoded — weaker, but not fatal.');
}

// ── 2. one call per model, checking for usage ──────────────────────
const PROMPT =
  'Reply with exactly the word: ready. No punctuation, no explanation.';

for (const model of models) {
  console.log(`\n→ POST ${OPENCODE_BASE_URL}/chat/completions  [${model}]`);

  const res = await fetch(`${OPENCODE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: PROMPT }],
      max_tokens: 16,
    }),
  });

  if (!res.ok) {
    console.log(`  ✗ HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
    continue;
  }

  const json = await res.json();
  const reply = json.choices?.[0]?.message?.content?.trim();
  const usage = json.usage;

  console.log(`  reply: ${JSON.stringify(reply)}`);

  if (!usage) {
    console.log('  ✗ NO `usage` OBJECT — this model cannot be metered.');
    console.log('    Either exclude it, or the cost column does not exist for it.');
    continue;
  }

  const inTok = usage.prompt_tokens ?? usage.input_tokens;
  const outTok = usage.completion_tokens ?? usage.output_tokens;
  console.log(`  ✓ usage: ${inTok} in / ${outTok} out`);

  const meta = catalogue.get(model);
  const priceIn = meta?.pricing?.input ?? meta?.cost?.input;
  const priceOut = meta?.pricing?.output ?? meta?.cost?.output;

  if (priceIn == null) {
    console.log('  ⚠️  no price found in the catalogue for this id — check the field names');
  } else {
    const usd = (inTok / 1e6) * Number(priceIn) + (outTok / 1e6) * Number(priceOut ?? 0);
    console.log(`  ✓ price: $${priceIn}/$${priceOut} per 1M → this call = $${usd.toFixed(8)}`);
  }
}

console.log(`
Day-0 checks:
  · usage present  → the cost column exists
  · price fetchable → pass-through pricing is verifiable, not asserted
Anything marked ✗ above must be resolved before the measured batch.
`);
