# Coherence audit — scope against implementation

Re-checked **Tuesday 8 September** by running things, not by reading them. The
previous revision of this file listed three false claims; all three are now
closed, and this rewrite exists because **the audit document itself had gone
stale**, which is the same failure it was written to catch.

---

## Closed since the last audit

| Was | Now |
|---|---|
| R12: self-check gated nothing — the script existed and nothing called it | ✅ `batch.mjs` **and** `run.mjs` refuse to start if it fails |
| Gate 2 did not exist, so `FUZZED` was unreachable | ✅ `Differential.t.sol`, 20 000 pinned runs, wired into the loop |
| R6 promised CLI **and JSON**; only CLI existed | ✅ `.run/batches/*.json` per batch |
| `UNKNOWN` accepted a patch with **no** differential evidence | ✅ falls back to gates 1-2 → `FUZZED`, or refutes and feeds the counterexample back |
| `npm run agent` was broken by an interface change | ✅ repaired, and now self-checks too |
| "no unpaid path to the models" was false | ✅ true: a run without the gateway is refused, or marked `unpaid — NOT SCOREABLE` |
| §12 claimed per-call metering; the gateway charged a flat fee | ✅ metered per request, breakdown in the 402 body |
| `FUZZED` had nowhere to record its campaign | ✅ `guarantee.fuzz_campaign` |
| A percentage could not say whether anything was understood | ✅ the **trivial floor**, guarded by proof 3 |

## Found and fixed in this pass

- **`oz_version`, `solady_version`, `wrapper_hash`** were in the documented
  receipt schema for days and **never emitted**. Provenance is the whole
  anti-circularity argument — *the efficient code is Vectorized's, only the
  mutation is ours* — and it had no version behind it. Now emitted from
  `lib/*/.pinned-version`.
- The receipt schema in the RUNBOOK had drifted in **both** directions: three
  fields documented and unemitted, sixteen emitted and undocumented. It is now
  **generated from `buildReceipt()`**, not maintained by hand.
- `scenario_name` was a hardcoded string in the receipt builder. It could drift
  from `Scenario.sol` while the digest changed underneath. Now read from source.
- §5 said the model receives "the gas scenario (fixture set)". It receives a
  precise *description*, not the 769 values. The description determines the set
  exactly, so the spec now says that rather than implying the vector is sent.

---

## Rule by rule

| | Rule | Status |
|---|---|---|
| R1 | One mutated variant per function, fixed across seeds | ✅ |
| R2 | `M` authorship a declared fact | ✅ declared **model-written** |
| R3 | Mutated variant is the run's v1 reference | ✅ |
| R4 | Mutation semantic, never cosmetic | ✅ gated by proof 2 |
| R5 | Median and dispersion | ✅ |
| R6 | Leaderboard CLI **/ JSON** | ✅ |
| R7 | Day 3 is The Graph | ❌ **not started — the largest remaining block** |
| R8 | Demo video | ❌ Thursday |
| R9 | Commit early and often | ✅ 37+ commits |
| R10 | Deterministic allocator | ❌ **not built** — needed by *both* remaining prizes |
| R11 | HCS first, then Base Sepolia | ⚠️ HCS ✅, Base Sepolia ❌ |
| R12 | Self-check gates every run | ✅ both entry points |
| R13 | Checker version is part of the claim | ✅ |
| R14 | Red-team pool disjoint | ✅ refuses to run on violation |

## Gates

| | | Status |
|---|---|---|
| 1 | Known behaviour over the committed scenario | ✅ full return buffer, not just success/failure |
| 2 | Differential fuzzing | ✅ 20 000 runs, pinned seed, recorded in the receipt |
| 3 | Symbolic equivalence | ✅ hevm 0.58.0, three proof obligations per task |
| 4 | Falsification bounty | ❌ a README policy, not code |

## Partner prizes

| Hedera | |
|---|---|
| x402-gated service, Blocky402 | ✅ |
| Real paid request end to end | ✅ metered per call |
| Own gateway, pass-through pricing | ✅ |
| HCS receipt per run | ✅ topic `0.0.10408009`, read back and hash-checked |
| Video showing the paid request | ❌ Thursday |

| The Graph | ❌ **none of it** — registry, subgraph, allocator, Start Fresh |
| Uniswap | ❌ conditional, not started |

---

## What is true about the results

⚠️ The strongest-sounding result of Monday — *"99.9% on the cosmetic control
against 13.9% on the semantic mutation"* — was **retracted** the same day. The
control was confounded (2.8× the headroom) and the batch-to-batch variance at n=5
is larger than the effect claimed. With a cost-neutral control the two are
indistinguishable: 70.7% against 75.4%, overlapping ranges. See
[Addendum 9](spike/DAY1-RESULTS.md).

**What the project can honestly claim today**: the evaluation engine works end to
end — metered x402 payment, three proof obligations, gates 1-3, an order-neutral
instrument with its own control, a floor and a ceiling, receipts anchored on HCS
and verifiable from outside. **Not** that it has measured anything about
memorisation.

---

# Remaining plan

## Wednesday 9 — The Graph, the whole day (R7)

1. **`RunRegistry`** on Base Sepolia: one event per run — content hash, HCS topic
   and sequence, and the few fields the allocator filters on. A **pointer, not a
   copy** (D-09).
2. **Subgraph** indexing it, published to Studio.
3. **The allocator** (R10). ⚠️ Required by *both* remaining prizes: The Graph
   needs it as the consumer, Hedera needs "an agent that budgets across providers".
4. **The fallback path** — same allocator, subgraph disabled, blind round-robin.
   It exists only to be filmed, and it is demo beat 3.

## Thursday 10 — freeze and record

5. Multi-seed batch across the usable models.
6. Minimal web view (judged: Usability).
7. **Feature freeze 18:00**, then record.
8. Stretch only: `toHexString` as a second target earning `FUZZED` (the vocabulary
   showing two labels), the ratchet, or the historical pair.

## Friday 11 morning — submission only, no code
