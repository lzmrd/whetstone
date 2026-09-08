# Coherence audit — scope against implementation

Re-checked **Tuesday 8 September**, third pass, after an external adversarial
review of the whole repository.

⚠️ **Every ✅ below now names the file and the line that ENFORCES it.** The
previous revision spent half its ticks on intentions: R14 was marked *"refuses to
run on violation"* while the check lived in a smoke test no scoring path called,
and gate 4 was marked verified while its failure branch wrote `null` into a field
and published the run. This project's own standard is that **a gate nothing calls
is not a gate**; the audit document was applying it to code and not to itself.

A tick with no reference beside it is a claim about intent and is marked as such.

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

## Found and fixed in the THIRD pass (external adversarial review)

| Finding | Fix, with the line that enforces it |
|---|---|
| **A pre-registered null result was falsified and never recorded.** 6 of 22 runs beat the baseline, max 1.3668, because 24 patches use `clz` — an opcode reachable only via `evm_version = 'osaka'`, which solady v0.1.26 predates. The repo had three addenda retracting *unflattering* results and nothing recording a prediction broken in its own favour | [WHETSTONE §1](WHETSTONE.md) *"The pre-declared outcome was FALSIFIED"* + [D-15](DECISIONS.md). ⚠️ The denominator is **not** repaired — deliberately, see D-15 |
| **Proof 2 was not the gate R4 claimed.** hevm refuting `task ≡ original` needs **one** divergent input; a bare `revert` bolted onto the untouched body — the mutation `Task.sol` argues against — passes it identically | `task.mjs` proof 2b + `Differential.t.sol:test_mutation_strength`. Semantic must move ≥50% of the scenario: the real mutation moves **769/769**, the bare-revert variant **1/769** and is refused. Demonstrated by `manifest-negative.json`, a permanent negative control |
| **Gate 4 was not a gate.** `denom > 0 ? … : null` — a failed efficiency anchor produced a null field and the run was scored and published | `agent.mjs` GATE 4, which **throws**, before any inference is bought |
| **R14 was enforced by accident.** The red-team set lived only in `access-probe.mjs`; `run.mjs` and `batch.mjs` never consulted it. Reviewers were excluded only because they had no price entry — adding one would have silently scored one | `providers.mjs` `resolve()`, the one path every entry point takes. Verified to throw |
| **The partial-exploration string was checked zero times.** Checks 1 and 2 fail toward refusal, which is safe; the third direction is the only one that fails toward an **overclaim** — an incomplete exploration read as a completed proof | `selfcheck.sh` check 3/3, on an intractable pair. ⚠️ Also recorded there: with hevm 0.58.0 a partial exploration is reported as `[FAIL]`+warning, never `[PASS]`+warning, so the overclaim may be unreachable today — which is exactly the kind of undocumented behaviour this file exists to stop believing |
| **The 69-gas floor was mis-read** as *"the price of the semantics solady drops"*. Proof 3 proves the check dead, and dead code buys no semantics. Worse, `M` is applied **idiomatically not identically** — checked `+ 1` in Solidity, `add(r, 1)` in assembly — so the cost is an artifact of our own mutation | [Addendum 10](spike/DAY1-RESULTS.md). Decomposition and floor survive; the reading is retracted |
| **The declared stop rule never existed.** §5 promised *"two consecutive rounds with no gas improvement"*; the loop stops at the first passing patch. 16 of 22 runs used one round, so the headline runs are effectively single-shot | §5 corrected **to the code**, with the consequence named: only failure earns feedback, so round budget is allocated in inverse proportion to competence |
| **The batch record named a mutation that never ran.** The control's description still said `* 128` / `/ 8` after `ControlTask.sol` was rewritten cost-neutral. *A name binds nothing* — solved for the scenario, not carried across to the task | `batch.mjs` now records `task.digest` and `baseline_digest` (sha256 of runtime bytecode) beside the human label |
| **A fresh clone could not be built by anyone.** `lib/` and `.tools/` gitignored, no submodules, no install script, README Setup a stub — on a project whose headline claim is third-party recomputation | `scripts/bootstrap.sh`. Verified on a clean clone: bootstrap → 8 tests pass → runtime bytecode **byte-identical** |
| **The token filter was called "the anti-memorisation defence in operational form".** It redacts library names from a file that is the OZ implementation nearly verbatim | `prompt.mjs` header, rewritten to claim only what it does. The defence is `M` and its proofs |
| **`REFUTED` is a fifth label** in a vocabulary declared closed at four; and the vocabulary has printed **one** label in 22 runs | Both stated in §7, with the reason: `toHexString`, the target that would exercise the rest, is unbuilt |

## Found and fixed in the second pass

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
| | Rule | Status | Enforced by |
|---|---|---|---|
| R1 | One mutated variant per function, fixed across seeds | ✅ | `manifest.json`, one `task` entry |
| R2 | `M` authorship a declared fact | ✅ **model-written** | `AI_USAGE.md`, its own section |
| R3 | Mutated variant is the run's v1 reference | ✅ | `agent.mjs`, `taskBuild` is v1 |
| R4 | Mutation semantic, never cosmetic | ✅ | `task.mjs` proof 2 **and proof 2b** (≥50% of the scenario; measured 769/769). Negative control `manifest-negative.json` is refused at 1/769 |
| R5 | Median and dispersion | ⚠️ **implemented, not respected** | `batch.mjs` computes both. But n≥5 is declared and **4 of 7 batches ran n=2 or n=3**. The statistic is right; the sample discipline was not kept |
| R6 | Leaderboard CLI **/ JSON** | ✅ | `.run/batches/*.json`, now with task digests |
| R7 | Day 3 is The Graph | ❌ **not started — the largest remaining block** | — |
| R8 | Demo video | ❌ Thursday | — |
| R9 | Commit early and often | ✅ | 38+ commits |
| R10 | Deterministic allocator | ❌ **not built** — needed by *both* remaining prizes | — |
| R11 | HCS first, then Base Sepolia | ⚠️ HCS ✅, Base Sepolia ❌ | `hcs.mjs` |
| R12 | Self-check gates every run | ✅ | `batch.mjs` and `run.mjs` both refuse to start |
| R13 | Checker version is part of the claim | ✅ | `selfcheck.sh` prints it; `bootstrap.sh` pins it by sha256 |
| R14 | Red-team pool disjoint | ✅ **now actually enforced** | `providers.mjs` `resolve()` throws — previously a smoke test only |

## Gates

| | | Status |
|---|---|---|
| 1 | Known behaviour over the committed scenario | ✅ full return buffer, not just success/failure |
| 2 | Differential fuzzing | ✅ 20 000 runs, pinned seed, recorded in the receipt |
| 3 | Symbolic equivalence | ✅ hevm 0.58.0, three proof obligations per task |
| 4 | Falsification bounty | ❌ a README policy, not code |

⚠️ **Gate 4 in the RUNBOOK is a different gate 4** — `gas(solady_M) < gas(OZ_M)`,
the efficiency anchor. It is now enforced in `agent.mjs` and throws. The collision
of names is itself a defect and is left visible rather than silently renamed
mid-week.

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

⚠️ **The comparison behind that tie is itself weaker than it reads**, and the
third pass says so rather than leaving it to be discovered:

- **The arms are asymmetric.** 17 semantic runs across 7 batches against **5
  control runs in a single batch**. The decisive argument — *batch-to-batch
  variance exceeds the effect* — is demonstrated only on the semantic arm. The
  control has **no replication at all**.
- **Cost-neutral is not difficulty-matched.** The gaps were equalised; their
  composition was not. 69 of the semantic task's 283 gas/call are the free
  `unchecked` floor, and the control has **no trivial floor** — so 100% of its gap
  needs the assembly rewrite against 76% of the semantic task's.
- **The apparatus did not catch the first control's confound; an adversarial
  review did.** Addendum 9 concedes this two paragraphs before crediting the
  apparatus, and the credit is withdrawn here.

**What the project can honestly claim today**: the evaluation engine works end to
end — metered x402 payment, three proof obligations (plus 2b), gates 1-3, an
order-neutral instrument with its own control, a floor and a ceiling, receipts
anchored on HCS and verifiable from outside, and a repository a stranger can clone
and reproduce byte-for-byte. **Not** that it has measured anything about
memorisation.

⚠️ **And `relative_progress` must be read with [D-15](DECISIONS.md) attached.** It
is not "the fraction of the expert gap closed by the model": it is the fraction of
the gap between OpenZeppelin's implementation and a *2024* expert implementation,
closed by a model holding a *2026* instruction set. Absolute gas/call and the
comparison against the trivial floor do not involve the baseline and are
unaffected.

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
