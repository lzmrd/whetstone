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
| Baseline | `solady_M` — solady under the **hand-written** mutation `M` | The **merged human commit** |
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

Seven candidates were measured on day 1 ([spike results](spike/DAY1-RESULTS.md)),
over the exhaustive `boundary/v1` scenario — 769 inputs.

| Target | Verdict | Gas/call | Total gap | Base spread |
|---|---|---|---|---|
| **`toHexString`** ✅ **headroom target** | partial exploration → `FUZZED` | **7 703** | 5 923 872 | 15 710 |
| **`log256`** ✅ **formal target** | proven equivalent, complete | 66 | 50 754 | 0 |
| `log2` | proven equivalent, complete | 52 | 39 988 | 0 |
| `toString` | partial exploration | 486 ⚠️ | — | — |
| `sqrt`, `log10` | partial exploration | — | — | — |
| `mulDiv` | **not** equivalent, counterexample | — | semantics-laden | — |

⚠️ **These figures are the third measurement, and the first from an instrument
with a control on it.** Two earlier instruments were biased — one unstable under
unrelated edits, one favouring whichever contract was measured first by ~10% of
the delta. Both wrote numbers into this file before the bias was found. The
current instrument is asserted order-neutral by
[`OrderControl.t.sol`](../contracts/test/OrderControl.t.sol) on every run.
Full account and two retracted claims: [spike results, Addendum 4](spike/DAY1-RESULTS.md).

⚠️ The `toString` figure (486) is marked because it was **never re-measured** with
the current instrument — it comes from a biased one. It is a dropped candidate, so
it is flagged rather than re-run; it must not be quoted anywhere as a result.

⚠️ **High headroom and symbolic tractability did not coexist in any candidate.**
The trilemma does not break; it is navigated by carrying **two targets with two
different labels**. A guarantee vocabulary that only ever prints one label is
decoration.

### Scoring rule — pre-declared, before any measured run

> **1. Ranking key**: total gas over the fixed scenario. Percentage is derived and
> secondary — with gaps of tens of gas a percentage has ridiculous resolution and
> invites cherry-picking the function.
>
> **2. Mandatory second column**: **max regression**, the worst single-input
> increase over the baseline across the 769 inputs. **No leaderboard row exists
> with only one of the two.**
>
> **3. Veto**: none. A patch that improves the total wins on the total, and its
> regression is published beside it. A veto threshold picked after seeing results
> would be a knob to move; a published column is a fact the reader weighs.

The scenario's identity is `Scenario.digest()` — `keccak256` of the input vector —
**not** the string `boundary/v1`. A name would stay identical while the vector
underneath it changed, letting two runs claim the same scenario and have been
scored on different inputs.

⚠️ **Retracted**: earlier revisions of this file stated that `log256` has an
input-dependent spread of 81 gas exceeding its mean saving. The measured spread is
**0** — OpenZeppelin 5.x implements `log2` and `log256` branchlessly. The apparent
spread was memory expansion inside the measuring loop. Input-dependence remains a
real risk for a *candidate patch*, which is why the max-regression column is
measured every run rather than assumed.

### Pre-declared expected outcome

> On `log256` — 66 gas per call, branchless, already squeezed by Vectorized — a
> model scoring **0, or noise-level patch churn, is the anticipated result**. It is
> a publishable null result and it is written here **before the first measured
> run**, because a null result declared in advance is an experimental design and
> the same result explained afterwards is an excuse.
>
> `toHexString` carries the headroom (7 703 gas per call) and therefore carries the
> risk of the weaker label. That asymmetry is the finding, not a flaw in it.

### Baseline construction — bilateral mutation

⚠️ Earlier drafts claimed that because OZ and solady are proven equivalent on these
targets, the baseline is third-party and "circularity disappears". **That was an
overclaim.** It holds only until you mutate — and R4 requires mutation. Once mutated,
a hand-written baseline could be made deliberately slow to inflate the denominator.

The construction that keeps the third-party efficiency anchor:

```
M applied by hand to BOTH sides:
    OZ_f      ──M──►  OZ_M
    solady_f  ──M──►  solady_M
proof: hevm(solady_M ≡ OZ_M)        ← seconds on log256
baseline = solady_M ,  task = OZ_M
```

The efficient code still comes from Vectorized; we only apply `M`, and the
equivalence is machine-checked. **Both mutants are published side by side**, so
nobody has to take our word that the baseline was not shaped to flatter or
punish a model.

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
| R2 | The mutation **`M`** is the human artifact of Track S, and its authorship is a **declared fact**, not an assumption: hand-written unless [AI_USAGE.md](../AI_USAGE.md) says otherwise. ⚠️ Earlier revisions named `restored_f`/`restored_M_f` — day-1 measurement deleted those artifacts (OZ ≡ solady already holds on the chosen targets), so the rule now attaches to what actually exists. See D-04 |
| R3 | The **mutated variant is the run's v1 reference**. Gates prove against it |
| R4 | Mutation is **semantic**, never cosmetic — and this is a **gate, not an intention**: hevm must *refute* `OZ_M ≡ OZ_f`. A cosmetic mutation leaves that equivalence provable, which leaves a memorized answer correct (§4) |
| R5 | Report **median and dispersion**, never a single value |
| R6 | MVP leaderboard = **CLI/JSON**. Minimal web view is a judged criterion (see §10) |
| R7 | **Day 3 is The Graph.** The challenge contract moves to roadmap, and **"the EVM as arbiter" leaves the narrative** |
| R8 | **Demo video: 2-4 minutes**, ≥720p, narrated by a human. No AI voiceover, no speed-up, no phone recording |
| R9 | **Commit early and often.** Large single commits risk disqualification |
| R10 | **The allocator is deterministic code, not an LLM.** An explicit policy (e.g. "next round to the best gas-saved-per-dollar, unless it produced ≥2 consecutive `UNKNOWN`"). An LLM allocator would add cost and non-reproducibility to a project whose thesis is measurement rigour — and a deterministic policy still satisfies *"an agent that budgets across providers"* |
| R11 | **Write order per round: HCS first, then Base Sepolia.** The HCS sequence number is needed to build the pointer. The harness keeps a local log as the source of truth and retries a failed registry write |
| R12 | **`scripts/selfcheck.sh` gates every measured run.** It asserts, in both directions, that hevm still compares revert payloads (negative) and can still prove a real equivalence (positive), and that the gas instrument is order-neutral. A failing self-check means no run is scored or published |
| R13 | **The checker version is part of the claim, not metadata.** `hevm 0.58.0` is pinned and written into every receipt, because the revert-payload behaviour the whole gate depends on is **undocumented** and can change between releases without notice |

---

## 4. Per-function pipeline

⚠️ **Rewritten after day 1.** The earlier pipeline built `restored_f` — solady's
implementation with OpenZeppelin's checks restored — and needed *two* passing
proofs. Measurement removed it: on the chosen targets OZ and solady are already
proven equivalent, so there is nothing to restore. See [D-04](DECISIONS.md).

```
OZ_f      ══(M, by hand)══►  OZ_M        ← the task (v1)
solady_f  ══(same M)══════►  solady_M    ← the baseline

proof 1, must PASS:    hevm(solady_M ≡ OZ_M)   the baseline computes the task
proof 2, must REFUTE:  hevm(OZ_M ≡ OZ_f)       M is semantic, not cosmetic
```

### Proof 2 is not optional

R4 requires the mutation to be semantic and never cosmetic, and **nothing was
checking it**. A cosmetic `M` — renames, reordering, a shuffled branch — leaves
`OZ_M ≡ OZ_f` provable, which means a memorized answer is still a *correct*
answer and the anti-contamination defence of [D-05](DECISIONS.md) is decoration.

So the mutation carries a **required refutation**: hevm must return a
counterexample separating `OZ_M` from `OZ_f`. Refutations are cheap — the day-1
revert probe returned in 0.1 s — so this costs nothing and turns R4 from an
intention into a gate.

⚠️ A refutation is *necessary, not sufficient*. It proves `M` changed behaviour
somewhere; it cannot prove the task stayed as hard. Difficulty preservation
remains unsolved and is declared as a limit, not claimed as a property.

### The real work for ONE function

1. Design `M`, apply it by hand to `OZ_f` → `OZ_M`
2. Apply the **same** `M` by hand to `solady_f` → `solady_M`
3. proof 1: `hevm(solady_M ≡ OZ_M)` passes
4. proof 2: `hevm(OZ_M ≡ OZ_f)` refutes
5. gas precondition (below)
6. gas for baseline and v1, differential fuzzing, equivalence check of the patch, runner, x402, HCS receipt

⚠️ **`solady_M` does not derive mechanically from `OZ_M`.** If `M` changes a
revert condition or a rounding mode, the transformation may hit exactly the
assembly the efficiency rests on. **It is manual work**, not propagation.

💡 One consequence of the rewrite runs in our favour on a five-day schedule: the
chain now needs **one passing proof instead of two**, because the OZ ≡ solady leg
was settled by measurement rather than by hand-written code.

### Precondition

`gas(solady_M) < gas(OZ_M)` over `boundary/v1`, measured by the order-neutral
instrument (D-14). To be **verified**, not assumed. If it fails → *"denominator
not established"*, and the mutation is redesigned rather than the number reported.

⚠️ This is also the check that catches an **accidentally inflated denominator**.
If `M` damaged solady's efficiency, `solady_M` stops being a third-party
efficiency anchor and quietly becomes a hand-written baseline again — which is
precisely the circularity the bilateral construction exists to avoid.

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

v1 = `OZ_M` (the task) · baseline = `solady_M` (solady under the same mutation)

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
3. ~~One hand-written `restored_f` + proof~~ → **void**: day-1 measurement proved OZ ≡ solady on the chosen targets, so `restored_f` does not exist. Replaced by the bilateral mutation, §4
4. Outcome `proven`/`fail`/`unknown` → **binary decision: proceed or pivot**

**Tuesday 8 — certified vertical slice**
Hand-written mutation `M` on both sides · proof 1 passes, proof 2 refutes (§4) · gas precondition check · one paid x402 call · gates · HCS receipt · CLI/JSON row

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

Ratchet · procedural mutation engine · control family · cross-family dispersion. All roadmap. The hand-written mutation `M` stays: without it there is no anti-memorization defence, and its required refutation (§4) is the only machine-checked part of that defence.

---

## 14. Risks

1. **Formal equivalence.** Levels 1 and 3 are **resolved by measurement**: hevm proves `OZ ≡ solady` on `log256`/`log2` in seconds, and it *does* compare revert payloads (D-03). Level 2 is now `hevm(solady_M ≡ OZ_M)` on the mutated pair — **unresolved until `M` exists**, and the risk is that a mutation touching the assembly the efficiency rests on pushes it to `UNKNOWN`, as `mulDiv` already did. Without it there is no denominator.
   ⚠️ `mulDiv` is the worked example of this risk realised: bitwuzla exhausts memory both unconditionally and on the guarded domain.
2. **Reduced novelty**: with GasAgent and RAGas published, only the guarantee and cost layer remains.
3. **Scope**: days 1-2 are almost entirely manual verification. If that base is not standing by the end of day 2, nothing else has anything to rest on.
4. **Public, repeatable tasks**: R1 makes the task known. The price of tractability, declared.

---

**References** — [ETHOnline 2026](https://ethglobal.com/events/ethonline2026/prizes) · [OpenZeppelin](https://github.com/OpenZeppelin/openzeppelin-contracts) · [solady](https://github.com/Vectorized/solady) · [awesome-x402](https://github.com/xpaysh/awesome-x402) · [Subgraph MCP](https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/)
