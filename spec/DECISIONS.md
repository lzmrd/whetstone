# Decision log

What was decided, what was rejected, and the evidence behind each. Written for judges assessing how the AI was directed, and for the builder six months from now.

Format: **decision → why → what was rejected**. Where a claim was checked against a source rather than assumed, that is stated.

---

## D-01 · Solidity as the domain, gas as the metric

**Decided**: optimize Solidity library source; measure gas.

**Why**: every performance benchmark dies on reproducibility — wall-clock on shared hardware never reproduces. Gas is deterministic *given a pinned configuration*, so the score is **recomputable by anyone**.

**Rejected**: Redis, the original target from Sanfilippo's framing. Reproducible measurement there requires instruction counts via cachegrind and careful hardware control; gas removes the problem by construction.

⚠️ **Not** "a consensus rule" — gas schedules change across hardforks. The defensible phrasing is *"recomputed, not measured, with the configuration pinned in the receipt"*.

---

## D-02 · Pure functions only

**Decided**: the task surface is restricted to pure functions and stateless data structures.

**Why**: raised as a concern that an optimization could introduce a bug that drains a contract. With no balances, transfers or access control, a bug produces a wrong result, not a withdrawal. The scenario is **categorically absent, not mitigated**.

**Bonus**: pure, fixed-size arithmetic is also the sweet spot for symbolic execution, so the constraint that removes the risk is the same one that makes the proofs feasible.

---

## D-03 · Equivalence as a gate, with a declared guarantee

**Decided**: four gates (tests → differential fuzzing → symbolic equivalence → falsification bounty), and a **closed four-label vocabulary** describing what was actually established.

**Why**: "the tests pass" is a weak oracle. But the first phrasing — *"proven equivalent, no bounds"* — was an overclaim, and would not survive a question from anyone who has used hevm: loops must be unrolled, dynamic data must be bounded, and a solver timeout returns `unknown`, which is not a proof.

**Verified (documentation)**: hevm's documented notion of equivalence is *same return value, same storage, matching success/failure*. Logs are not considered and **revert payload comparison is not stated** — which is the load-bearing case, since OpenZeppelin and solady diverge precisely on reverts.

**Verified (measurement, day 1)**: hevm **does** compare revert payloads. Two contracts identical but for `revert ErrA()` vs `revert ErrB()` are refused in 0.1 s — *"Both end in Failure but different EVM error"*, `6d2cd4cb` vs `ed0c2823`. The gate covers the case the targets actually diverge on.

⚠️ **This behaviour is undocumented, so it is not a permanent fact about hevm.** A future release could stop comparing payloads without that being a regression on their side, and every equivalence claim here would silently become worthless. Therefore:

- `hevm 0.58.0` is pinned, and the **checker version is part of the claim**, written into every receipt — not filed as metadata.
- The negative test runs on **every measured run** via `scripts/selfcheck.sh`, paired with a positive control so that a checker which called everything different would fail too. A load-bearing property verified once by hand is a memory, not a property.

**Rejected**: `FORMAL_UNBOUNDED` as a label. The EVM word is already 256-bit and wrapper assumptions narrow the domain, so "unbounded" is not true in the sense a formal-methods reader would take it. Renamed `FORMAL_NO_EXPLICIT_INPUT_BOUND`.

---

## D-04 · Baseline, not ceiling — and `restored_f` is gone

**Decided**: the denominator is `solady_M`, described as a **baseline**.

**Why a baseline at all**: solady saves gas partly by dropping semantics — fewer checks, different reverts. Measuring against raw solady would give a denominator unreachable by construction, so the headline metric would measure our definition of equivalence rather than model capability.

**Original construction, now obsolete**: restore OpenZeppelin's checks into solady's implementation (`restored_f`), prove equivalence, use that as the denominator.

⚠️ **Day-1 measurement deleted that artifact.** On `log256` and `log2`, OpenZeppelin and solady are *already proven equivalent* — nothing needs restoring. The by-product number "the price of the dropped semantics" only exists where semantics actually differ, which on the chosen targets they do not. It survives for `mulDiv` alone, where it is real (`Panic(0x12)` vs `FullMulDivFailed()`) and where the arithmetic remains **UNKNOWN**, not proven — see D-14.

**Replacement construction — bilateral mutation**:

```
M applied to BOTH sides:  OZ_f ──M──► OZ_M ,  solady_f ──M──► solady_M
proof:    hevm(solady_M ≡ OZ_M)
baseline: solady_M          task: OZ_M
```

The efficient code still comes from Vectorized; only `M` is ours, and the equivalence is machine-checked. Both mutants are published side by side, so the anti-circularity defence is structural and third-party checkable rather than resting on who wrote the baseline.

⚠️ Earlier revisions claimed that because OZ and solady are proven equivalent, "circularity disappears". **Overclaim.** It holds only until you mutate, and R4 requires mutation.

**Rejected**: the word "ceiling". Results above 100% are anticipated and legitimate; a value that can be exceeded is not an upper bound.

---

## D-05 · Anti-contamination is novelty, not secrecy

**Decided**: semantic mutation of the task, anchored by an on-chain timestamp.

**Why**: OpenZeppelin and solady are in every model's training data. Cosmetic mutation (renames, reordering) is useless — models generalize over renames. **Semantic** mutation makes a memorized answer *wrong*, so it is rejected at the equivalence gate: the benchmark defends itself.

**Rejected**: keeping tests secret, and using a TEE to do it. To have a model optimize code you must send it the code, and the model runs on the servers of the lab you would be hiding it from. A TEE protects the task while it is with us; then it leaves.

⚠️ **Open**: mutating while preserving difficulty is unsolved research, and it is load-bearing for both anti-contamination and cross-season comparability.

---

## D-06 · Chainlink CRE removed

**Decided**: dropped, despite being a natural thematic fit.

**Verified, not assumed**: CRE workflows run in **wasmtime** — Foundry cannot run inside one. And per Chainlink's own documentation, *"your handler's source code and compiled binary are not confidential just because part of its logic runs inside an enclave"*: only Vault DON secrets and HTTP responses are protected. The plan to hold secret task variants inside the enclave was therefore not implementable.

This is a structural constraint, not a time constraint — more time would not fix it.

---

## D-07 · Uniswap conditional, on stated terms

**Decided**: selected as the third partner prize, with a minimal deliverable, conditional on the schedule holding.

**Why the caution**: their codebase is a pincer. The v4 math libraries are provable but already squeezed to hand-written assembly; the periphery has headroom but is not provable and is guarded by gas snapshots in CI. The two conditions never intersect.

The risk is not the prize money: a single project is submitted to multiple tracks, so an impression of overselling travels to the tracks worth more.

**Terms**: absolute gas delta plus guarantee label, **no relative metric** — there is no solady counterpart to build a baseline from. A null result is publishable if framed honestly.

---

## D-08 · Environment authority split

**Decided**: pinned Foundry EVM is the sole authority over score and equivalence; Hedera carries payments and receipts; Base Sepolia carries the registry and subgraph.

**Why**: prompted by the question of which environment governs which claim. Without the split, a divergence between environments could settle a dispute without demonstrating an error in the score.

**Verified**: The Graph does **not** support Hedera — its supported-networks page returns 404 for it, and Hedera's own documentation points to running a *local* graph node, which the bounty disqualifies as "local-only". HCS is not EVM and cannot be indexed. Hence the third chain.

---

## D-09 · The registry is a log, not an oracle

**Decided**: `RunRegistry` records what the harness reports; it verifies nothing.

**Why**: prompted by the question of how a contract could know what happened in a run. It cannot. Stating this plainly is better than leaving a reader to find it: the registry is a **tamper-evident append-only log**, and verifiability comes from reproducibility — pinned toolchain plus published artifact hashes mean anyone can recompute and catch a lie.

**Design consequence**: the Base Sepolia event is a **pointer, not a copy** — content hash, HCS topic and sequence number, plus the few fields the allocator filters on. One canonical record, one index card, and a checkable link between them.

---

## D-10 · The allocator is deterministic

**Decided**: an explicit policy in code, not an LLM.

**Why**: an LLM allocator would add cost and non-reproducibility to a project whose entire thesis is measurement rigour. A deterministic policy still satisfies the bounty's *"an agent that budgets across providers"*, and can be printed on screen next to the decision it produced — which matters, because the allocator's dependence on the subgraph has to be **shown**, not asserted.

---

## D-11 · Scope cut to 1-2 functions

**Decided**: one function is the commitment, two is the stretch.

**Why**: a solo builder with five working days, where each function requires two hand-written artifacts and two proofs, done serially. The earlier figure of 3-5 was not reachable. Declaring the real number is stronger than claiming generality and being caught.

**Rejected**: keeping cross-family dispersion in scope. It is the measurable countermeasure against models specializing to the mutation scheme, and losing it is a real cost — recorded in the limits rather than quietly dropped.

---

## D-12 · Track S and Track H are separate architectures

**Decided**: the hackathon build (Track S, hand-written baseline) and the benchmark roadmap (Track H, human commits mined from repository history) are **not** the same path.

**Why**: they use different baselines and therefore different denominators. Presented as one continuous plan they would be incoherent; results from the two are never comparable and must not share a leaderboard column.

**What survives from S to H**: the evaluation engine — harness, gates, guarantee vocabulary, receipts, cost accounting, variance rules. That is what the demo actually proves.

⚠️ In the submission, Track H is one "what comes next" paragraph. Presenting it as underway would be oversell.

---

## D-13 · Report medians and ties, not rankings

**Decided**: n≥5 seeds per configuration, median and dispersion reported, ties declared when intervals overlap.

**Why**: agentic trajectories diverge early even at temperature zero. Detecting a 2% difference with significance needs roughly 9 runs; 1% needs about 36. n=5 gives median and dispersion, **not statistical power** — so ties are the normal outcome and the leaderboard says so.

**Also**: cost is a random variable with the same spread. Reporting a single run's cost as a property of the model would be the same error the rest of the project forbids.

---

## D-14 · The measuring instrument is a controlled artifact, not a utility

**Decided**: the gas harness carries an order-neutrality control that runs on every measured run and fails the run if it does not hold.

**Why**: three instruments were built, and **two were biased in ways that reached the specification as findings**.

| # | Method | Fault | log256 |
|---|---|---|---|
| 1 | `gasleft()` around inlined internal calls | Moved 27 → 39 → 66 as unrelated imports were added to the test file | 66 |
| 2 | Two loops, Solidity `.staticcall` | Whoever ran second paid memory expansion where the quadratic term dominates; `.staticcall` also copies returndata, so memory grew between paired calls | 32 |
| 3 | One pre-allocated buffer, raw `staticcall`, `outsize = 0` | Order bias **0** | **66** |

Instrument 2's bias, measured by running the same comparison in both orders: **5 038 gas over 769 inputs, ~10% of the delta it reported**.

**Two published claims were withdrawn as a result** ([Addendum 4](spike/DAY1-RESULTS.md)):

1. *"The exhaustive fixture set halved the apparent gap"* — that was instrument 2. Fixtures and instrument changed in the same step and the effect was attributed to the wrong one. The design argument for exhaustive fixtures survives; its supporting measurement does not.
2. *"On `log256` the input-dependent spread exceeds the mean saving"* — the spread is **0**. OpenZeppelin 5.x is branchless on `log2`/`log256`. The 81 gas was memory expansion.

**The general lesson, and the reason this is a decision and not a bugfix**: a project whose thesis is measurement rigour was three times wrong about its own measurement, and each time the wrong number was plausible enough to be written down. Controls are therefore part of the harness, not part of the debugging.

⚠️ A zero result must itself be controlled. Zero spread is exactly what a bug that sent the same argument 769 times would produce — and "stable" was the property being sought, so it would have been believed. `HarnessSelfCheck.t.sol` asserts the scenario produces 94 distinct results, and `toHexString`, measured by the same instrument in the same run, has a spread of 15 710.

---

## D-15 · A falsified pre-registration is a result, and gets written down like one

**Decided**: the null result pre-declared in [WHETSTONE §1](WHETSTONE.md) was falsified by the measured runs, and the falsification is recorded in the specification body rather than left implicit in a spike log. The `relative_progress` denominator is **known to be dated** and is not corrected this week.

**The evidence**: 22 scored runs, 6 above 100% of the solady baseline, maximum **1.3668**. 24 accepted patches use `clz`, an opcode reachable only because `foundry.toml` pins `evm_version = 'osaka'`; solady v0.1.26 predates it.

**Why it is a decision and not a correction**: the fact was already in the repository — once, in passing, in a spike log. What was missing was the *entry in the ledger*. This project had by then written three addenda retracting results that were unflattering and none recording a prediction it broke in its own favour. That asymmetry is the exact failure mode pre-registration exists to prevent, and it was found by adversarial review rather than by the apparatus.

⚠️ **The repair is deliberately deferred.** Both candidates — a `solady_M + clz` baseline, or compiling to `cancun` and declaring the divergence from OpenZeppelin's own `foundry.toml` — invalidate every gas figure already published. Changing the denominator two days before submission would produce numbers with less scrutiny behind them than the ones they replace. The honest move is to publish the flaw at full strength and leave the numbers standing beside it.

**What this costs**: `relative_progress` cannot be read as "fraction of the expert gap closed by the model". It is a fraction of the gap between OpenZeppelin's implementation and a 2024 expert implementation, closed by a model with a 2026 instruction set. Absolute `gas/call` and the comparison against the trivial floor are unaffected — neither involves the baseline.
