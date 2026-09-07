# Coherence audit — scope against implementation

Checked against the code on **Monday 7 September**, not against memory. Every
"✅" below was verified by running something or reading the file that implements
it; every "❌" by failing to find one.

---

## The three real incoherences

### 1. ⚠️ R12 is false as written

> *"`scripts/selfcheck.sh` gates every measured run. A failing self-check means no
> run is scored or published."*

**Nothing calls it.** `grep -rn selfcheck harness/ gateway/ contracts/` returns
nothing. The script exists, passes, and is invoked only by hand.

This is the exact failure this project keeps correcting elsewhere — a property
established once and then assumed. The two things it guards (hevm still compares
revert payloads; the gas instrument is order-neutral) are load-bearing for every
number published so far.

**Fix**: `prepareTask()` runs it, or `batch.mjs` refuses to start without it.

### 2. ⚠️ Gate 2 does not exist, so `FUZZED` is unreachable

§7 declares three gate levels and four labels. Level 2, differential fuzzing, was
never implemented — there is no fuzz test in `contracts/`. So the vocabulary can
print `FORMAL_*` and `UNKNOWN` and **nothing else**.

The spec's own argument against a decorative vocabulary applies to itself here.

**Consequence beyond the label**: `toHexString` — the highest-headroom target at
**7 703 gas/call against `log256`'s 66** — is unusable. hevm does not terminate on
it, so `FUZZED` is the only label it could earn, and we cannot award it.

### 3. ⚠️ R6 promises CLI **and JSON**; only CLI exists

`batch.mjs` prints a table and writes no machine-readable output. Everything
downstream needs it: the registry event, the subgraph, the web view, and any
third party recomputing a published row.

---

## Rule by rule

| | Rule | Status |
|---|---|---|
| R1 | One mutated variant per function, fixed across seeds | ✅ `manifest.json` |
| R2 | `M` hand-written, authorship a declared fact | ✅ declared — **model-written**, disclosed |
| R3 | Mutated variant is the run's v1 reference | ✅ patch is proved against the task |
| R4 | Mutation semantic, never cosmetic | ✅ **gated** — proof 2 must refute |
| R5 | Median and dispersion, never a single value | ✅ `batch.mjs` |
| R6 | Leaderboard = CLI **/ JSON** | ⚠️ **CLI only** |
| R7 | Day 3 is The Graph | ❌ not started |
| R8 | Demo video 2-4 min | ❌ Thursday |
| R9 | Commit early and often | ✅ |
| R10 | Deterministic allocator | ❌ **not built** |
| R11 | HCS first, then Base Sepolia | ⚠️ HCS ✅, Base Sepolia ❌ |
| R12 | Self-check gates every run | ⚠️ **script exists, nothing calls it** |
| R13 | Checker version is part of the claim | ✅ in every receipt |
| R14 | Red-team pool disjoint from tested models | ✅ enforced, refuses to run |

## Gates

| | | Status |
|---|---|---|
| 1 | `forge test` — known behaviour | ⚠️ harness self-tests exist; **no per-task behaviour test** |
| 2 | Differential fuzzing | ❌ **missing** — see above |
| 3 | Symbolic equivalence | ✅ hevm, both directions, version pinned |
| 4 | Falsification bounty | ❌ a policy for the README, not code |

## Partner prizes

| Hedera | |
|---|---|
| x402-gated service on testnet via Blocky402 | ✅ `gateway/server.mjs` |
| Agent completes a real paid request end to end | ✅ settled, tx recorded |
| Our own gateway, pass-through pricing | ✅ |
| HCS receipt per run | ✅ topic `0.0.10408009`, read back and hash-checked |
| Public repo | ✅ |
| Video showing the paid request | ❌ Thursday |
| README: setup + architecture + **payment flow** | ⚠️ present, needs a pass |

| The Graph | |
|---|---|
| `RunRegistry` on Base Sepolia | ❌ |
| Subgraph published to Studio | ❌ |
| **Allocator queries the subgraph** | ❌ — the consumption that counts |
| Start Fresh registration | ❌ builder action |

| Uniswap | conditional on Thursday — ❌ not started |

## Demo beats (§11)

| | Beat | Filmable today? |
|---|---|---|
| 1 | The paid request executing | ✅ |
| 2 | Gates running, **including a rejection** | ✅ — refuted rounds happen naturally |
| 3 | Subgraph as the allocator's memory | ❌ **needs both missing pieces** |
| 4 | Receipt verified from outside | ✅ mirror node in a browser |
| 5 | Honest scope slide | ✅ material exists |

---

# Plan — ordered by dependency, not by preference

## Now — close what the spec already claims (≈2h)

1. **Wire the self-check** so R12 stops being false. `batch.mjs` refuses to run if
   it fails. *15 min.*
2. **JSON output** from `batch.mjs`: one file per batch with every field the
   registry, subgraph and web view will need. R6, and everything downstream
   depends on it. *30 min.*
3. **Gate 2 — differential fuzzing.** Compare task and patch on fuzzed inputs:
   return bytes **and revert data**. Makes `FUZZED` awardable. *1h.*

## Then — the second target (≈1h, unlocked by step 3)

4. **`toHexString`** as a second task, earning `FUZZED` where `log256` earns
   `FORMAL_*`. This is D-11's declared stretch, and it is the only way the
   leaderboard shows **two different labels** — which is the whole argument for
   having a vocabulary.

## Wednesday — The Graph (R7), the largest remaining block

5. **`RunRegistry`** on Base Sepolia: one event per run, carrying the content
   hash, HCS topic and sequence, and the few fields the allocator filters on.
   **A pointer, not a copy** (D-09).
6. **Subgraph** indexing it, published to Studio.
7. **The allocator** (R10): deterministic policy, queries the subgraph, prints
   the decision beside the data it came from. ⚠️ Required by **both** remaining
   prizes — The Graph needs the consumption, Hedera needs "an agent that budgets
   across providers".
8. **The fallback path**: same allocator, subgraph disabled → blind round-robin.
   It exists only to be filmed, and it is beat 3.

## Thursday — freeze and record

9. Multi-seed batch across all four usable models, both targets.
10. Minimal web view (judged criterion, Usability).
11. **Feature freeze 18:00**, then record.
12. Stretch, only if all the above stands: the **ratchet** (v1→v2→v3, and where
    it stalls), or the **historical-pair task** (§13), or Uniswap.

## Friday morning — submission only, no code

13. README pass, `AI_USAGE.md` final, submission form, partner prizes selected,
    Start Fresh registration.

---

⚠️ **Steps 1-3 come before anything new.** They are places where this repository
claims something it does not do, and that is a worse failure than a missing
feature — the whole project is an argument about not overclaiming.
