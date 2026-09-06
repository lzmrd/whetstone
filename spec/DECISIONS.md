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

**Verified**: hevm's documented notion of equivalence is *same return value, same storage, matching success/failure*. Logs are not considered and **revert payload comparison is not stated** — which is the load-bearing case, since OpenZeppelin and solady diverge precisely on reverts. Hence the mandatory negative test on day 1.

**Rejected**: `FORMAL_UNBOUNDED` as a label. The EVM word is already 256-bit and wrapper assumptions narrow the domain, so "unbounded" is not true in the sense a formal-methods reader would take it. Renamed `FORMAL_NO_EXPLICIT_INPUT_BOUND`.

---

## D-04 · Baseline, not ceiling

**Decided**: the denominator is `restored_M_f`, a hand-written implementation, described as a **baseline**.

**Why**: solady saves gas partly by dropping semantics — fewer checks, different reverts. Measuring against raw solady would give a denominator that is unreachable by construction, so the headline metric would measure our definition of equivalence rather than model capability.

The correction: restore OpenZeppelin's checks into solady's implementation, prove equivalence, and use *that* as the denominator. The gap between restored and raw solady is **the price of the dropped semantics** — a number, published as a by-product.

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
