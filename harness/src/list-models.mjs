/**
 * Lists the model catalogue available to your key, with per-token prices.
 * Free models are listed first — they are the ones to build against while
 * a paid rate limit is exhausted.
 *
 * Run:  cd harness && npm run models
 */

const {
  OPENCODE_API_KEY,
  OPENCODE_BASE_URL = 'https://opencode.ai/zen/v1',
} = process.env;

if (!OPENCODE_API_KEY) {
  console.error('\n✗ OPENCODE_API_KEY is not set in .env\n');
  process.exit(1);
}

const res = await fetch(`${OPENCODE_BASE_URL}/models`, {
  headers: { Authorization: `Bearer ${OPENCODE_API_KEY}` },
});

if (!res.ok) {
  console.error(`\n✗ HTTP ${res.status} — ${(await res.text()).slice(0, 300)}\n`);
  process.exit(1);
}

const json = await res.json();
const list = json.data ?? json.models ?? json;

if (!Array.isArray(list)) {
  // Field names differ from what we assumed — dump the shape so we can adapt.
  console.log('Unexpected response shape. Top-level keys:', Object.keys(json));
  console.log(JSON.stringify(json).slice(0, 1200));
  process.exit(0);
}

const price = (m, side) =>
  m?.pricing?.[side] ?? m?.cost?.[side] ?? m?.[`${side}_price`] ?? null;

const rows = list.map((m) => ({
  id: m.id ?? m.name,
  in: price(m, 'input'),
  out: price(m, 'output'),
}));

const free = rows.filter((r) => Number(r.in) === 0 || r.in === 'Free' || /free/i.test(r.id));
const paid = rows.filter((r) => !free.includes(r));

const show = (title, arr) => {
  if (arr.length === 0) return;
  console.log(`\n${title}`);
  for (const r of arr) {
    const p = r.in == null ? '(no price field)' : `$${r.in} / $${r.out} per 1M`;
    console.log(`  ${String(r.id).padEnd(40)} ${p}`);
  }
};

console.log(`${rows.length} models available to this key.`);
show('── FREE — build against these while a paid limit is exhausted ──', free);
show('── PAID ──', paid);

console.log(`
Pick 2 paid + 1 free, ideally from different lineages, and put them in .env:
  MODELS=id-one,id-two,id-three
`);
