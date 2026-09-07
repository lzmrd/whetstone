# Whetstone — build spec

**Making an LLM optimize gas has already been done. Measuring it with declared guarantees has not.**

ETHOnline 2026. Rev. 10, 6 September 2026. **Solo builder.**

⚠️ **Hard stop: Friday 11 September, midday.** The official deadline is Sunday 13th at 12:00 EDT, but no work happens after Friday lunch — so video, README and the submission form must all be closed by Friday morning. Effective window: **Sun 6 → Fri 11 am**.

| File | Purpose |
|---|---|
| **this one** | Executable decisions. No rationale |
| [RUNBOOK.md](RUNBOOK.md) | Operational checklist: commands, pivot gates, daily deliverable |
| [DESIGN-NOTES.md](DESIGN-NOTES.md) | Rationale, rejected alternatives, limits, roadmap |

---

## 0. This spec describes Track S

Whetstone has **two tracks with different architectures**. Conflating them is an error, not a simplification.

| | **Track S — Synthetic** | **Track H — Historical** |
|---|---|---|
| Purpose | Demonstrate the pipeline | Build the actual benchmark |
| Baseline | `restored_M_f`, **hand-written** | The **merged human commit** |
| Task | Semantically mutated variant | before/after pair from real repos |
| Scale | 1-5 tasks | 50-300+ |
| Anti-contamination | Semantic mutation | Post-cutoff freshness + leakage filters |
| Status | **Built now** | Roadmap → [DESIGN-NOTES](DESIGN-NOTES.md) |

**They share** the evaluation engine: Foundry harness, gates, guarantee vocabulary, receipts, cost accounting, variance rules. That is what the demo proves.

⚠️ **Track S is not a miniature of Track H.** It uses a different baseline definition, so **results from the two tracks are never comparable** and must never share a leaderboard column.

---

## 1. Track S scope

> **1-2 functions, n≥5 seeds.** A method demonstration with a leaderboard interface.

⚠️ **Scope cut for a solo builder with five working days.** Each function needs two hand-written artifacts and two proofs, done serially by one person. 3-5 functions was not realistic; 2 is the stretch, 1 is the commitment. Families and cross-family dispersion move to roadmap.

**The question it answers**: *"how does an agent perform on a small, declared set of Solidity tasks under a fixed budget?"*
**Not**: *"which model is better?"* — 3-5 independent tasks cannot support that.

**Models under test are open-weight** (via the OpenCode Zen/Go gateway). This is a positioning choice, not a constraint: it matches the open-weights framing the project came from, and it is a less crowded claim than ranking frontier models.

**What it actually proves**: that the **evaluation engine** works — not that Track H will.

### The target — decided from measurement, not preference

A target must satisfy three things at once. A review named this and the specs had not:

| Leg | Requirement |
|---|---|
| **(a)** | Enough headroom to leave a measurable gap |
| **(b)** | Tractable for symbolic equivalence |
| **(c)** | Hand-mutable while preserving difficulty |

`mulDiv` maximizes (a) and fails (b) and (c). Five candidates were measured on day 1
([spike results](spike/DAY1-RESULTS.md)):

| Target | Verdict | Headroom |
|---|---|---|
| **`log2`** ✅ **primary** | proven equivalent, complete exploration | 19% (52 gas/call) |
| **`log256`** ✅ secondary | proven equivalent, complete exploration | 12% |
| `sqrt`, `log10` | partial exploration → `UNKNOWN` | — |
| `mulDiv` | **not** equivalent, counterexample | large, but semantics-laden |

⚠️ **Headroom on `log2` is 52 gas.** Real but small, so the denominator is coarse:
a model saving 20 gas scores 38%. **Show the quantization, do not smooth it.**

💡 **On `log2` and `log256`, OZ and solady are proven equivalent**, so the baseline is
solady itself — externally authored, not written by us. Circularity and the
hand-writing burden both disappear for the unmutated baseline; `restored_M` is still
hand-written but over a far simpler function.

**`mulDiv` stays in as the Branch B by-product**: it is *not* equivalent
(`Panic(0x12)` vs `FullMulDivFailed()`), so it carries the measured price of
semantics. Both branches exist, on different functions.

---

## 2. Prior art

| Work | Date | Already done |
|---|---|---|
| [SolEval](https://arxiv.org/abs/2502.18793) | Feb 2025 | Repo-level Solidity benchmark, **Gas@k** |
| [PrefGen](https://arxiv.org/abs/2506.03006) | Jun 2025 | **58.9% Gas@5** |
| [GasAgent](https://arxiv.org/abs/2507.15761) | Jul 2025 | **82/100** contracts, **9.97%** average |
| [*RAGas: Retrieval-Augmented Gas Optimization…*](https://arxiv.org/abs/2608.15857) | Aug 2026 | **11%**, *"preserving functional equivalence"* |

**Positioning**: we add verified equivalence as a *gate with a labelled guarantee*, *cost* tied to that guarantee, *third-party verifiability*, and *the price of the semantics solady dropped*.

⚠️ Cite the last one by full title, never by acronym → [DESIGN-NOTES](DESIGN-NOTES.md).

---

## 3. Binding decisions

| # | Decision |
|---|---|
| R1 | **One mutated variant per function**, fixed across all seeds. Seeds vary sampling only |
| R2 | `restored_f` and `restored_M_f` are **hand-written**. If model-assisted, disclose it |
| R3 | The **mutated variant is the run's v1 reference**. Gates prove against it |
| R4 | Mutation is **semantic**, never cosmetic |
| R5 | Report **median and dispersion**, never a single value |
| R6 | MVP leaderboard = **CLI/JSON**. Minimal web view is a judged criterion (see §10) |
| R7 | **Day 3 is The Graph.** The challenge contract moves to roadmap, and **"the EVM as arbiter" leaves the narrative** |
| R8 | **Demo video: 2-4 minutes**, ≥720p, narrated by a human. No AI voiceover, no speed-up, no phone recording |
| R9 | **Commit early and often.** Large single commits risk disqualification |
| R10 | **The allocator is deterministic code, not an LLM.** An explicit policy (e.g. "next round to the best gas-saved-per-dollar, unless it produced ≥2 consecutive `UNKNOWN`"). An LLM allocator would add cost and non-reproducibility to a project whose thesis is measurement rigour — and a deterministic policy still satisfies *"an agent that budgets across providers"* |
| R11 | **Write order per round: HCS first, then Base Sepolia.** The HCS sequence number is needed to build the pointer. The harness keeps a local log as the source of truth and retries a failed registry write |

---

## 4. Per-function pipeline

```
OZ_f ──(by hand)──> restored_f          proof 1: restored_f ≡ OZ_f
  │                     │
  │ mutation M          │ M applied by hand
  ▼                     ▼
variant_f ──────── restored_M_f         proof 2: restored_M_f ≡ variant_f
  (the task)        (the baseline)
```

### The real work for ONE function

Not "two artifacts". A complete chain requires:

1. `restored_f` written by hand
2. proof `restored_f ≡ OZ_f`
3. manual semantic variant
4. `restored_M_f`
5. proof `restored_M_f ≡ variant_f`
6. gas for baseline and v1, differential fuzzing, equivalence check of the patch, runner, x402, HCS receipt

⚠️ **`restored_M_f` does not derive mechanically from `restored_f`.** If M changes a revert condition or a rounding mode, the transformation may hit exactly the assembly the efficiency rests on. **It is manual work**, not propagation.

### Precondition

`gas(restored_M_f) < gas(variant_f)`. To be **verified**, not assumed. If it fails → *"denominator not established"* bucket.

---

## 5. Agent interface — the benchmark's independent variable

⚠️ What the model sees **is** the experiment. Leaving it unspecified makes runs
incomparable and was a real gap in earlier revisions.

### What the model receives

| Included | Excluded — and why |
|---|---|
| The **mutated variant** source, complete and compilable | The **original OZ source**. If the model sees both it can diff them, recover the mutation, and the anti-memorization defence evaporates |
| The function signature and a one-line task statement | Any reference to solady, or to the baseline's gas figure |
| The **gas scenario** (fixture set) it is measured on | The names "OpenZeppelin", "solady", "Whetstone" anywhere in the prompt |
| The toolchain: solc version, evm_version, optimizer runs | Prior patches by other models in the same batch |

### The loop

```
round 1 : variant + task  ──────────────►  patch
                          ◄──────────────  gates run
round 2 : + gate feedback ──────────────►  patch
          (compile errors, failing test,
           equivalence counterexample,
           gas delta so far)
          …
stop when: budget exhausted, OR max_rounds reached,
           OR two consecutive rounds with no gas improvement
```

**Multi-turn with gate feedback**, not single-shot. Rationale: single-shot measures
recall; iterating against a counterexample measures whether the model can use
evidence. That is the capability the project claims to measure.

⚠️ **Feedback is mechanical output only** — the compiler's error, the failing input,
the gas number. No hints, no guidance, nothing hand-written per model.

### Fixed parameters, identical across all models and seeds

| Parameter | Value |
|---|---|
| `max_rounds` | **8** |
| `budget_usd_per_run` | **0.05** at list price, whichever binds first |
| `temperature` | provider default, recorded in the receipt |
| System prompt | one, fixed, committed in the repo and hashed into the receipt |

⚠️ Change any of these and results stop being comparable. They are versioned with the
prompt hash; a change bumps the scenario version.

---

## 6. Metric

```
                     gas(v1) − gas(patch)
relative progress = ──────────────────────
                    gas(v1) − gas(baseline)
```

v1 = `variant_f` · baseline = `restored_M_f`

⚠️ **The baseline is not a ceiling.** Values **above 100% are expected and legitimate**: the patch beat the baseline, it did not violate a limit. Row labelled *"beats baseline"*, reinforced verification, and the patch becomes the new reference.

---

## 7. Gates and guarantee vocabulary

| Level | Tool | Covers |
|---|---|---|
| 1 | `forge test` | Known behaviour |
| 2 | Differential fuzzing | Return bytes, **revert bytes**, storage, events |
| 3 | [hevm](https://github.com/ethereum/hevm) / [halmos](https://github.com/a16z/halmos) | Return value, storage, success/failure outcome |

**One of these four labels per patch, never anything else:**

| Label | Definition |
|---|---|
| `FORMAL_NO_EXPLICIT_INPUT_BOUND` | Checker terminated **without additional bounds** on length/iterations, **within the ABI domain and the serialized wrapper assumptions** |
| `FORMAL_BOUNDED` | Checker terminated **with bounds**; bounds and assumptions in the receipt |
| `FUZZED` | Campaigns, seeds, corpus, ranges, and what was compared |
| `UNKNOWN` | Timeout, unsupported opcode, undecided. **Not a success** |

⚠️ Never write *"proven, no bounds"*. The EVM word is already 256-bit, the wrapper narrows the domain, the solver uses heuristics. hevm proves **bytecode** equivalence: imports, linking, ABI encoding, dispatcher, optimizer, metadata, solc version and wrapper parameters **must be serialized into the receipt**, or the label means nothing.

---

## 8. Variance

| Rule | Value |
|---|---|
| Seeds per configuration | n ≥ 5, declared |
| What is reported | Median and dispersion |
| Cost | A random variable, same rule |
| Overlapping intervals | **Declare a tie** |

⚠️ n=5 gives median and dispersion, **not statistical power**. Ties will be the normal outcome.

⚠️ **On the run-count figures**: earlier drafts quoted "~9 runs to detect 2%, ~36 for 1%" without a source. They are **our own order-of-magnitude estimate** from the usual inverse-square relation between effect size and sample count, not a citation. Either derive them with stated assumptions or drop the numbers — in a project whose thesis is rigour, an unsourced figure is worse than none.

**Statistical units, never to be conflated**: seed = sampling instability · function = independent task · family = domain robustness. With 3-5 functions you get 15-25 observations but **3-5 tasks**.

**Demo budget**: leaderboard from a pre-computed batch; live demo = **one run**, declared as theatre.

---

## 9. Environment authority

Three environments with distinct roles. State this explicitly or it reads as confusion.

| Environment | Role |
|---|---|
| **Pinned Foundry EVM** (local) | Measures gas and equivalence. **Sole authority over the score** |
| **Hedera testnet** | x402 payments + HCS receipts |
| **Base Sepolia** (`eip155:84532`) | `RunRegistry` contract + the indexable subgraph |

⚠️ **Why a third chain**: The Graph does **not** support Hedera (its supported-networks page 404s; Hedera's own docs point to running a *local* graph node, which the bounty disqualifies as "local-only"). HCS is not EVM and cannot be indexed by a subgraph. So a minimal `RunRegistry` on Base Sepolia emits one event per run, and the subgraph indexes that.

⚠️ **Anticipate "you are indexing your own contract, that is circular."** The answer is the ArcBook pattern: **the subgraph is the allocator's memory across rounds** — remove it and the allocation loop stops working. Do not just say it, **show it** (§11).

### Who is the agent, and who is under test

| | Role |
|---|---|
| **The harness + allocator** (our program) | Holds the wallets, decides, pays, measures, records. **This is the "agent" the Hedera bounty asks for** |
| **The model under test** | Receives a task, returns a patch. **Not** the agent — it is the paid service; the harness is its customer |

### How RunRegistry learns about a run

A contract observes nothing. **The harness sends a transaction to `RunRegistry.record(...)` after each run**; the contract only emits.

**Per-round write order** (R11):

```
1. round ends → harness assembles the receipt JSON
2. computes its hash
3. submits to HCS        → receives topic id + sequence number
4. calls RunRegistry.record() on Base Sepolia
     with: hash + HCS pointer + the filterable fields
5. the subgraph, watching that contract, picks the event up on its own
6. next round, the allocator queries the subgraph
```

⚠️ **Two keys are needed**: a Hedera account (payments + HCS) and a Base Sepolia account (registry transactions, gas in Base Sepolia ETH).

⚠️ **Failure mode**: if the Base Sepolia write fails (RPC down, bad nonce), you are left with an HCS receipt and no catalogue card — that run vanishes from the subgraph. Not fatal, but the harness keeps a local log as source of truth and retries.

⚠️ **The registry therefore trusts the harness.** It is not an oracle — it is a **tamper-evident append-only log**. Its value is not certifying the numbers, it is making history unrewritable after the fact.

Verifiability comes from elsewhere and already exists: **pinned toolchain + published artifact hashes ⇒ anyone recomputes the gas and checks it against the recorded value.** A lie is detectable.

**Event design — a pointer, not a duplicate:**

```
HCS (Hedera)   → canonical record, tied to the payment
Base Sepolia   → indexable pointer:
                   · content hash of the full receipt
                   · HCS topic id + sequence number
                   · the few fields the allocator filters on
                     (gas deltas, spend, guarantee label, model, function)
```

Given the event you can fetch the HCS message from the mirror node and compare hashes: the cross-chain link is checkable. The numeric fields sit in the clear only because the allocator must filter on them, which is impossible against an opaque hash.

**Cost**: ~30 runs = ~30 testnet transactions. Free, but ~2s each. Batch per-batch instead of per-run if throughput bites.

---

## 10. Judging criteria → what to build

ETHGlobal judges on five criteria. Mapping:

| Criterion | Our answer |
|---|---|
| **Technicality** | Symbolic equivalence as a gate; hand-written baseline with proofs |
| **Originality** | Guarantee layer + cost, absent from the prior art |
| **Practicality** | Receipts a judge can verify from the mirror node without our code |
| **Usability (UI/UX/DX)** | ⚠️ **Weakest point**: MVP is CLI/JSON. A minimal web view now outranks the Ratchet in build order |
| **WOW Factor** | The two-money-column leaderboard: what the agent cost, what it saved |

⚠️ Async events run two rounds; only ~20% advance to live judging, and **most prizes go to projects that do not advance**. Optimize for the two partner prizes, not for finalist.

---

## 11. Demo beats — what must be filmable

2-4 minutes. Each beat is a build requirement, not a storyboard nicety.

**1. The paid request executing** (Hedera requirement, verbatim)
Balance drops, the x402 settle returns a transaction id, the model responds.

**2. The gates running, including a rejection**
Show a patch that passes and one that is **rejected** — ideally by the equivalence gate, not just by tests. A gate that never rejects anything looks decorative.

**3. ⚠️ The subgraph as the allocator's memory — the indispensability beat**

Do **not** assert it. Show it, in two shots:

```
Shot A: allocator queries the subgraph → prints the GraphQL response →
        prints the decision it derived
        "model B: 3 UNKNOWN labels, $0.40 burned → deprioritize.
         model A closing the gap faster per dollar → next round to A"

Shot B: same allocator, subgraph disabled →
        falls back to blind round-robin, spends with no memory
```

Twenty seconds, and the dependency becomes visible instead of claimed. This is the single best answer to "you are indexing your own contract".

**4. The receipt verified from outside**
Open the HCS mirror node in a browser, show the message matches the leaderboard row. *"You do not have to trust my dashboard."*

**5. The honest scope slide**
N functions, M families, n seeds, prior art named, and what this does **not** measure. Four bullets max, per ETHGlobal video guidance.

---

## 12. Partner prize deliverables

Up to **3 partner prizes** may be selected; a partner with multiple tracks counts as **1**. We use all 3.

### Hedera — AI & Agentic Payments

- [ ] Live x402-gated service on Hedera testnet, settled through the **Blocky402 facilitator**
- [ ] An agent that consumes it and completes **at least one real paid request end to end**
- [ ] Our own gateway, pass-through provider pricing (stated in README)
- [ ] HCS receipt per run: variant, model, spend, gas delta, label, serialized toolchain
- [ ] Public repo + **2-4 min** video **showing the paid request executing**
- [ ] ⚠️ README must cover **setup, architecture, AND the payment flow** — required verbatim by the bounty
- [ ] README: closed-loop answer (provider usage report alongside receipts; gateway open to third parties)

**Extra points scored: 2 of 7** — per-call metering rather than a flat charge ✅, verifiable HCS audit trails ✅.
Cheapest to add if Thursday allows: **HCS-14 agent identity**, or an **HTS token in the settlement path** instead of plain HBAR.
Not attempted: A2A/ACP negotiation, UCP discovery, Scheduled Transactions.

### The Graph — AI Tooling, Start Fresh

- [ ] `RunRegistry` deployed on **Base Sepolia**, one event per run
- [ ] Subgraph indexing it, **published to Subgraph Studio**, queried with a Studio API key
- [ ] **The budget allocator queries the subgraph** to decide the next round — this is the consumption that counts, and it is what makes The Graph load-bearing
- [ ] Open source with a clear README **so judges can run it**
- [ ] Demo video **2-4 minutes** (The Graph states the same range as the platform)
- [ ] Registered in the **Start Fresh** pool

⚠️ **Mocked, local-only or static datasets do not qualify.** A local graph node is not acceptable — hence Base Sepolia rather than Hedera.

### Uniswap Foundation — conditional

The prize slot costs nothing (3 are allowed, we would otherwise use 2). **The work is conditional on Thursday going well.**

Minimal honest deliverable — no oversell:

- [ ] Point the evaluation engine at **1-2 pure functions** from `v4-periphery` (MIT; **not** `v4-core`, restrictive licence)
- [ ] Report absolute gas delta + guarantee label. **No relative metric** — there is no solady counterpart to build a baseline from
- [ ] `FEEDBACK.md` on the developer experience + [feedback form](https://developers.uniswap.org/hackathon-feedback) with the link
- [ ] README pointing at the exact contracts and lines touched

⚠️ A null result is publishable if framed honestly ("we ran N functions through proof-backed gates and found no headroom"). A thin result dressed up as more is not — and the impression travels to the other two tracks, which are worth more.

---

## 13. Plan — real calendar

**Sunday 6 (today) — setup, no product code**
- `git init`, repo structure, `/spec` with these documents committed **now** (real timestamps)
- ✅ **Blocky402 needs no access request** — testnet is open access. The real dependency is a funded Hedera account, which is under our control
- Fix the TO FIX rows in the [RUNBOOK](RUNBOOK.md): solc, EVM version, optimizer runs, provider, budget
- Skim GasAgent and RAGas

**Monday 7 — the spike. ONE function, no product code**
1. hevm/halmos setup + equivalence wrappers ← *this is the real work, not the CLI command*
2. Negative test on reverts
3. One hand-written `restored_f` + proof
4. Outcome `proven`/`fail`/`unknown` → **binary decision: proceed or pivot**

**Tuesday 8 — certified vertical slice**
Hand-written semantic variant · `restored_M` + proof · gas precondition check · one paid x402 call · gates · HCS receipt · CLI/JSON row

> From here on something exists to present even if everything else collapses.

**Wednesday 9 — The Graph, and nothing else** (R7)
`RunRegistry` deployed on Base Sepolia · subgraph published to Subgraph Studio · allocator genuinely driven by the data

> ⚠️ Heavier than originally planned: it now includes a contract deploy. Start with the registry, not the allocator.

**Thursday 10 — freeze at 18:00, then record**
Morning: multi-seed batch, then minimal web view (judged criterion)
Afternoon: **feature freeze**, then record the 2-4 min video — **the five beats in §11 are build requirements, check them before freezing**
Only if all of the above is done: second function, or the Uniswap deliverable

**Friday 11, morning — submission only. No code.**
Final video edit · README with prior art and scope at the top · `AI_USAGE.md` · submission form · partner prizes selected · Start Fresh registration

⚠️ **The video is recorded Thursday, not Friday.** Friday morning is buffer, not production time. Recording last is the classic way to miss a deadline.

### Dropped from the plan by the calendar cut

Ratchet · procedural mutation engine · control family · cross-family dispersion. All roadmap. The hand-written variant stays: without it there is no anti-memorization defence.

---

## 14. Risks

1. **Formal equivalence**, three escalating levels: patch on ordinary Solidity → `OZ ≡ restored` on **assembly** → whether the tool covers **revert payloads**. Without #2 there is no denominator; without #3 reverts drop to gate 2.
2. **Reduced novelty**: with GasAgent and RAGas published, only the guarantee and cost layer remains.
3. **Scope**: days 1-2 are almost entirely manual verification. If that base is not standing by the end of day 2, nothing else has anything to rest on.
4. **Public, repeatable tasks**: R1 makes the task known. The price of tractability, declared.

---

**References** — [ETHOnline 2026](https://ethglobal.com/events/ethonline2026/prizes) · [OpenZeppelin](https://github.com/OpenZeppelin/openzeppelin-contracts) · [solady](https://github.com/Vectorized/solady) · [awesome-x402](https://github.com/xpaysh/awesome-x402) · [Subgraph MCP](https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/)
