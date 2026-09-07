# Whetstone — design notes

Rationale, rejected alternatives, limits and roadmap. The operational spec is in [WHETSTONE.md](WHETSTONE.md).

This file is also the raw material for the `DECISIONS.md` that ETHGlobal requires from anyone using a spec-driven workflow: *"judges need to see the full picture of how you directed the AI"*.

---

## The premise

Salvatore Sanfilippo, on LLM benchmarks:

> "Take Redis, leave a token budget, all the tests must keep passing and the model has to make it much faster and use less memory. Do n rounds of that and measure what the model managed to do. [...] you are measuring the model's ability to advance software technology."

Whetstone applies the idea to Solidity, where the metric is recomputable and correctness is machine-checkable.

---

## Why Solidity, and why not "consensus rule"

Wall-clock on shared hardware never reproduces. Gas is deterministic **given a configuration**: EVM version, solc, optimizer runs, hardfork. Gas schedules change across hardforks, so the number is not universal — it is **recomputable**.

⚠️ **Do not say "it is a consensus rule"**: that is false at the limit. The correct phrasing is *"the score is recomputed, not measured — with the configuration pinned in the receipt"*.

---

## Why baseline, not ceiling

`restored_M_f` is not an upper bound. It can be slower than:

- a different equivalent implementation the agent finds
- OpenZeppelin itself, in that specific variant
- what you would get by reinserting the checks somewhere else

and it can be incomparable if the error paths cost more while the hot path costs less.

The very fact that a result above 100% is anticipated proves 100% has no universal meaning. **The word "ceiling" implies a limit that does not exist**: say baseline.

Consequence for the metric name: *relative progress*, not *percentage of ceiling closed*.

---

## The two tracks (Sprint / Ratchet)

### Sprint

**The correct question**: *"how does an agent perform on a small, declared set of Solidity tasks under a fixed budget?"*

Not *"which model is better"*: with 3-5 independent tasks that claim is unsupportable, however many seeds you add. Seeds measure sampling instability, not generalization.

**Cross-season calibration**: anchor models, 2-3 fixed ones re-run every season; the drift in their score measures the drift in set difficulty (psychometric equating).

⚠️ Anchors must be **pinned open-weight models**: APIs deprecate versions and the anchor breaks exactly when it is needed. Non-trivial operational cost — **one is enough for the demo**.

### Ratchet

**The question**: *is the frontier moving?* Not a leaderboard, a register: v1 → v2 → v3 with author, cost, gain.

⚠️ **The specification never moves**: equivalence is always proven against the run's v1 (the mutated variant), never against the previous step. With bounded proofs the gaps compound: after ten steps you could have a v11 that is no longer equivalent to the original without any single check having failed.

**Do not promise to beat solady.** That is the rare event. The interesting result is *where the ratchet stalls*: "reached 87% of the baseline, then 40 attempts and $12 without finding anything else" tells you where the agent's limit is.

With 3-5 rounds over a few functions you get **four points**, not a curve: fine as a demo image, must be called a *first probe*.

---

## The two narrative branches

The reachable gap may turn out **small**: where solady dropped semantics, adding the checks back often nearly recomposes the OZ code.

| Branch | Condition | Headline |
|---|---|---|
| **A** | Significant gap | *"The agent covered X% of the semantics-preserving baseline, for $Y"* |
| **B** | Small gap | *"Almost all of solady's advantage is paid in semantics, not skill — here is the price, function by function"* |

The ratio is measured **for free by the same day-1 spike**. The choice must be made beforehand, not improvised on day 4. The by-product is interesting either way: whatever comes out, there is a story.

---

## Blockchain mechanisms

### The falsification bounty

Where the proof stops, an economic invitation to disprove takes over. `challenge(runId, input)` executes both implementations and compares outputs: a dispute about EVM semantics can be judged by the EVM.

⚠️ **Actual coverage**: the band between the proof's bound and the block gas limit. If the proof reaches arrays ≤32, a counterexample at 33 fits in a block; a `Base64.encode` over 1KB does not. **Beyond that threshold it does not cover.**

⚠️ **Not economic security**: a $50 bounty does not make a library safe to use. It is a bug bounty, not a guarantee.

⚠️ **Who funds it: we do.** Having the submitter post it would turn it into a bond, and therefore into a "confidence signal" — the interpretation to avoid.

⚠️ **The window is declared, not resolved**: leaderboard rows carry a status — *provisional* / *challenged* / *settled*.

### Why it went to roadmap (decision R7)

Day 3 could hold one of two things, not both:

| Choice | Content | In favour |
|---|---|---|
| **A** ✅ | Subgraph + allocator genuinely driven by data | The prizes are the deliverable, and The Graph is worth more ($2,500 vs $2,000) |
| **B** | Minimal bounty genuinely on-chain, subgraph reduced to passive indexing | Better for the project's original identity |

Doing both in one day produces **two partial demos**. Choice: **A**.

⚠️ **Consequence to respect**: without the contract, HCS *records* the verdict but does not *compute* it. **"The EVM as arbiter" leaves the narrative** — do not sell a property the plan does not deliver.

### The protocol, if it is ever built

*"The contract executes both implementations and compares outputs"* is an intuition, not a protocol. The compared functions could touch storage, `sender`, `value`, `timestamp`, `block.number`, code size or external calls — and **the contract must enforce purity, not trust the README**.

Minimal protocol:

- Both implementations **pure and ABI-identical**
- Input = predefined ABI payload with a **maximum length**
- The contract uses `staticcall` against **two pre-deployed wrappers**
- Compares `success`, `returndata.length`, `keccak256(returndata)`
- Each run records: immutable wrapper addresses, **codehash**, ABI id, max input length, fork and associated configuration
- A challenge does **not** declare "not equivalent" if it fails due to infrastructure out-of-gas or an over-limit input

### The timestamp

Anchoring the variant hash before the run proves **that artifact is new** — something no private server can do credibly.

⚠️ **It does not prove the problem is new.** A renamed `mulDiv` is isomorphic to the one in the training data, and models have generalized over renames for years. The real defence is **semantic mutation**.

**Commit-reveal**: hash of the task set and criteria before, everything in the clear afterwards. Nobody can have picked tasks with results already known.

### Permissionless submissions (roadmap)

Results are recomputable, so runs can be accepted from anyone and fakes rejected by recomputation rather than by authority.

⚠️ Introduces the **model + harness** confound. Answer: two categories — *reference harness* (fixed scaffold → compares models) and *open* (compares agents). SWE-bench evaluates the pair in a single leaderboard: the separation is an **improvement on that practice**, not a precedent to cite.

### A market for hard tasks (roadmap)

All benchmarks die of saturation. Countermeasure: pay whoever brings tasks the models cannot solve. Out of scope for the event; worth a slide, it explains why the project does not expire in six months.

### Do not build

Tokens, score NFTs, DAO governance, on-chain leaderboard as storage, ZK proofs of inference. They look like blockchain ideas and solve no problem.

---

## Payment

Native x402 endpoints mostly serve second-tier open models ([BridgeNode](https://bridgenode.cc): DeepSeek V4 Flash at $0.001; Llama 3.1; MiniMax). Gateways to frontier models exist, e.g. [JarvisClaw](https://api.jarvisclaw.ai). Catalogue: [awesome-x402](https://github.com/xpaysh/awesome-x402).

But the bounty asks **us** to host the service, so the gateway is ours and anything can sit behind it.

⚠️ **Price**: provider list price passed through with no markup, real payment on Hedera. Not arbitrary, but must be written down.
⚠️ **Closed loop**: gateway, agent and leaderboard are all ours. Answer: the HCS audit trail cross-checks against the provider's usage report, and the gateway is open to third-party agents.
⚠️ **ToS**: proxying frontier APIs at pass-through is technically API access resale.
⚠️ **The cost column ages**: list prices change, historical rows stop being comparable. Every row carries its date.

---

## Why the guarantee vocabulary is phrased this way

`FORMAL_UNBOUNDED` was a dangerous label: *"without explicit input bounds"* is not *"unbounded"* in the sense a reader with a formal-methods background will read.

- The EVM word is **already** limited to 256 bits
- Wrapper assumptions **narrow the domain**
- The solver uses heuristics, timeouts, simplifications and the specific tool's semantics
- A function may have no loops and still depend on unserialized preconditions or non-obvious ABI/Solidity behaviour

Hence `FORMAL_NO_EXPLICIT_INPUT_BOUND`, defined **within the ABI domain and the serialized wrapper assumptions**. Less elegant, consistent with the rest: do not sell more certainty than you have.

The same applies to hevm's notion of equivalence, documented as *same return value, same storage, matching success/failure* — **logs are not considered, and revert payload comparison is not stated**. That is the load-bearing case, because OZ and solady diverge precisely on reverts: hence the mandatory negative test on day 1.

---

## Why mutation cannot be a stretch goal

The natural plan order would put subgraph and allocator first, because The Graph needs them. But semantic mutation is the **anti-memorization defence the entire Sprint's credibility rests on**, and it is currently unproven.

If it slips, you present a working loop **with no defence against memorization** — the first objection anyone raises to a benchmark built on OpenZeppelin, a library every model has seen in training.

A hand-made variant costs hours and closes the hole; the procedural engine can stay stretch. The alternative is declaring *"Sprint demonstrated as a mechanism, defence designed but not implemented"*: legitimate, but weaker.

---

## Where the variance numbers come from

Agentic trajectories diverge early, even at temperature zero: single-run pass@1 estimates vary by several percentage points depending on which run you get. Detecting a 2% improvement with significance requires on the order of **9 runs per configuration**; 1% requires roughly **36**.

n=5 is therefore a **feasibility** choice, not a power choice: it gives median and dispersion. The operational consequence — to be shown in the leaderboard rather than hidden — is that **a tie is the normal outcome**, not the exception.

---

## Track H — Historical: from demonstration to benchmark

⚠️ **This is a separate track, not the evolution of Track S.** The two architectures are incompatible if presented as a single path, and the [build spec](WHETSTONE.md) describes **Track S only**.

| | **Track S — Synthetic** | **Track H — Historical** |
|---|---|---|
| Baseline | hand-written `restored_M_f` | merged human commit |
| Denominator | `gas(variant) − gas(restored_M)` | `gas(before) − gas(human commit)` |
| Task | semantically mutated variant | before/after pair from real repos |
| Scale | 1-5 | 50-300+ |
| Anti-contamination | semantic mutation | freshness + leakage filters |
| Status | built at the hackathon | roadmap |

**The shared substrate** — the only thing Track S proves for both:

- Foundry harness with pinned toolchain
- The gates and the **guarantee vocabulary**
- Receipts with serialized configuration
- Inference cost accounting
- Variance rules

⚠️ **Results from the two tracks are not comparable.** Different baselines, different denominators: never mix them in one column, and do not share the metric's name.

⚠️ **In the submission, Track H is one "what comes next" paragraph**, not a parallel claim. Presenting it as already underway is oversell.

---

Track S has a single bottleneck: **as long as a person hand-writes `restored_f` and `restored_M_f` for every task, you cannot go past a few dozen**. And without tasks there is no leaderboard, however many seeds you add.

### The unlock: mining real optimizations from repository history

The reference point should not be constructed, it should be **collected**. Every merged commit that reduces gas is a pair:

```
Commit A: the function before the optimization   → the task
Commit B: the merged human patch                 → the candidate baseline
```

The task becomes: *"this was the previous implementation. Under a fixed budget, find a semantically equivalent patch that reduces gas."*

```
             gas(before) − gas(AI patch)
progress = ────────────────────────────────
           gas(before) − gas(human commit)
```

100% = matches the human saving · >100% = beats it · 0% = found no acceptable saving.

The baseline becomes **historical, public and external to us** — nobody can accuse us of building it to fit.

### ⚠️ The human commit is NOT ground truth

This is the central correction, and ignoring it would replicate the known flaws of mined benchmarks: SWE-bench has documented **solution leakage** and **weak test oracles** that inflate results (SWE-bench+ reports leakage in ~61% of resolved instances and plausible patches passing weak tests in ~48%).

A commit labelled "gas optimization" may: change semantics on purpose, break ABI compatibility, improve the hot path while worsening reverts, shift cost from runtime to deployment, touch many functions at once, **adapt the tests to the new behaviour**, lack a reproducible benchmark, or contain the solution in its message.

> **Rule**: a human commit does not certify equivalence. It is the source of a **candidate baseline**. Whetstone reconstructs and verifies it independently.

This is where the verification engine built at the hackathon stops being scaffolding and becomes the differentiator.

### Ingestion pipeline

1. **Discovery** — merged PRs/commits with signals: `gas`, `gas saving`, `optimize`, `cheaper`, `snapshot`
2. **Locality filter** — `pure` (preferred) or `view` function, unchanged API, same signature and visibility, small diff
3. **Reconstruction** of both states with pinned dependencies, solc, EVM, optimizer and Foundry
4. **Measurement** over fixed, versioned gas scenarios
5. **Original tests as an initial filter**, never as the final oracle
6. **Differential fuzzing**: success/failure, return bytes, revert bytes, events, post-execution storage
7. **Equivalence checking** where possible
8. **Classification**: `FORMAL_NO_EXPLICIT_INPUT_BOUND` · `FORMAL_BOUNDED` · `FUZZED` · `REJECTED` · `UNKNOWN`
9. **Publication** of before, human patch, fixtures, scenario, compiled artifacts, manifest, results

### Four additions to the pipeline

**The rejection rate is a result, not waste.** If 80 out of 1,000 candidates survive, that **yield** is the first thing to measure — it decides whether the project has a path.

**The gas scenario is a first-class artifact.** Gas depends on inputs: a patch can be cheaper on small ones and more expensive on large ones. Versioned, published fixtures, or cherry-picking comes in through the window — and "the commit reduces gas" may be true under their microbenchmark and false under ours.

**Deployment and runtime gas reported separately, never summed.** The task declares which axis it targets; both stay visible.

**Verifying the human patch too produces a publishable result.** When the human commit fails the gates, that is not a pipeline failure: it is data.

> *Of N gas optimizations actually merged in real repositories, how many genuinely preserve semantics under independent verification?*

It is the original "price of semantics" idea, but on real code and at scale. It turns the cost of validation into output.

### ⚠️ Contamination does NOT solve itself

Correct phrasing:

> Post-cutoff freshness strongly reduces the risk of **direct memorization of the patch**, but it does not prove the task is outside the training data, nor that the model does not know the technique.

Because: providers keep collecting public data after release; models receive silent updates without a new version label; the technique may be present in thousands of other repositories; PR description, comments and issues can expose the solution; and **publishing tasks hands them to future models**.

Dynamic benchmarks address staleness with a continuous stream of fresh tasks, but they do not present commit date as proof of non-contamination.

### Leakage defences

Strip from the agent's context: commit message, PR title and description, issue, review, changelog, `git diff`, comments **added by the patch**, new or updated tests introduced by the patch, references to branches, SHAs and URLs. Checkout locked to the preceding commit.

⚠️ **Semantic leakage in comments does not filter with regex**: sampled human review is required.

⚠️ **Do not evaluate "did it replicate the human diff".** Accept any alternative patch that passes the gates and reaches the delta. Historical tests are written around the original solution: they can reject different solutions and accept incomplete ones.

### Statistics at the right scale

| Tier | Use | Runs per task |
|---|---|---|
| Continuous screening | New candidates, regressions | 1 |
| Standard leaderboard | Public comparison | 3 |
| Verification of close results | Disputes, top-5 | 5-10 |
| Independent audit | Checking a submission | separate rerun |

The aggregation policy is declared **beforehand**: median gas, median cost, best valid patch, or success probability. Then aggregate **per task**, compute bootstrap intervals **over tasks**, and show dispersion across families — a model dominating only bit-manipulation must not appear universally better.

⚠️ **Task independence is not free.** Many commits come from the same repo, author or technique: 200 tasks may be worth far less than 200 independent observations. Group by repository and technique family, with **clustered intervals**, or their width is fiction.

### What Track S hands to Track H

Not "what survives": Track S remains valid as an experimental track in its own right. This table says what gets **reused**.

| Component | New function |
|---|---|
| Foundry + pinned toolchain | Rebuilds and measures before / after / AI patch |
| Differential fuzzing | Independent verification of **both** human and AI patch |
| hevm / halmos | Assigns the guarantee level per task and patch |
| HCS receipt | Anchors provenance, configuration, cost, result |
| x402 gateway | Makes the agent's inference cost visible |
| Subgraph | Indexes runs, enables analysis by family, model, guarantee |
| Guarantee vocabulary | **The real contribution**, unchanged |
| Manual `restored_M` | Not needed in the mined track; stays for synthetic tasks |
| Semantic mutation | Demoted to a secondary defence |
| Fixed variant per function | Disappears: it existed only because N was small |

Whetstone is not abandoned: **it is given the dataset it was missing**.

### The uncomfortable part

A benchmark is a **maintenance commitment**, not a launch: compiler versions and gas schedules change at hardforks, and historical rows must be re-anchored or explicitly versioned. Realistically 6-12 months with someone maintaining it — and most of that goes into ingestion and leakage filtering, not the evaluation engine, which already exists after the hackathon.

**First step after the prize-giving**: not features, but the **collection pipeline**, to measure the yield. If ten repositories produce a hundred usable tasks there is a path; if they produce eight, there is not — and you find out in a week instead of six months.

---

## Limits — the demo slide

### Goodhart

On MMLU, memorizing acquires no capability. Here, a lab that specializes to win gets a model that can make Solidity code demonstrably cheaper — which is the useful thing. And an equivalence proof **cannot be talked into agreement**.

### Mutation: semantic, not cosmetic

- **Cosmetic** (renames, reordering) → useless: the model undoes the obfuscation.
- **Semantic** (rounding, revert conditions, bit widths) → the memorized answer **becomes wrong** and is rejected at gate 3.

It also improves what is measured: not "can you reproduce solady" but "can you apply the technique to a specification that is similar to, but not, one you know".

⚠️ **Equivalent to what, exactly?** Semantic mutation means **the mutated variant becomes that run's v1 reference**: gates prove equivalence against *it*, not against original OZ. That variant then stays the fixed yardstick for the whole Ratchet of that run.

⚠️ *Open problem*: mutating while preserving difficulty is unsolved research, and it is load-bearing for both anti-contamination and comparability.

### Three concessions

1. **A specialized model beats a generalist and the leaderboard does not say so.**
2. **The mutation generator is the attack surface.**
3. **Publishing results creates contamination**: winning patches enter the next generation's training. And with **one fixed variant per function**, the task becomes known and repeatable — next season it can be optimized against, and within the current season whoever produces the reference harness can tune it to those 3-5 cases. That is the price paid for a tractable denominator.

### The measurable countermeasure

A control family of **hand-written fresh code**, unmutated:

| | Mutated variants | Fresh code |
|---|---|---|
| Agent that reasons | good | good |
| Agent exploiting the scheme | **very good** | **collapses** |

The gap becomes a leaderboard column instead of a silent doubt.

### Why keeping tests secret would not help

To have a model optimize code you must **send it the code**, and the model runs on the servers of the lab you would be hiding it from. A TEE protects the task while it is with us; then it leaves. And it would not touch Goodhart: specializing on the *domain* only requires reading the project description.

**Future direction**: a held-out set for **self-hosted open-weight models only**, never sent to any API — there the lab is out of the loop and secrecy genuinely works.

### On dollar savings

The defensible fact is **gas per invocation**. Conversion to annual dollars is left to the reader as an explicit scenario: these are `internal` libraries that get inlined, savings depend on downstream calls and gas price, and **on L2 calldata dominates, not execution**. We write this in the limits ourselves, before anyone asks.

---

## Rejected alternatives

| Option | Why it is out |
|---|---|
| **Chainlink CRE Confidential Workflows** | Workflows run in **wasmtime**: you cannot run Foundry there. And the workflow's code is not confidential — only Vault DON secrets and HTTP responses are. Structural constraint, not a time one |
| **Other TEEs** (Marlin, Phala, Oasis) | None is a sponsor, and none would solve anything: the provider sees the prompt regardless |
| **ENS** | Scores as records on a Permissioned Resolver: decorative relative to the thesis |
| **Uniswap Foundation** | A pincer on their codebase: v4 math libraries are provable but already squeezed; periphery would have headroom but is not provable, and is guarded by `snapshots/` in CI. You submit **one project** to multiple tracks: an impression of oversell travels. Honest angle if time allows: **v4 hooks**, community-written and unsqueezed |
| **Custom SwapVM opcode + Aqua** (earlier idea) | Two documented winners and a replicable method, but dropped for Whetstone. Safer, less original |
| **Redis as target** | Wall-clock is not reproducible; gas solves the problem by construction |
| **TEE for confidential tests** | Formal equivalence makes secrecy unnecessary: the specification is the original implementation, public by definition |

---

## Winners studied as reference

From a sample of **47 winners across 7 ETHGlobal hackathons** (Lisbon 2026, New York 2026, Open Agents, Cannes 2026, HackMoney 2026, Buenos Aires, ETHOnline 2025 — 33 projects per event; the full list was not accessible).

| Project | What it teaches |
|---|---|
| [Glassbox402](https://ethglobal.com/showcase/glassbox402-qyepd) | Won the same Hedera track. The trick: HCS receipts **a judge verifies from the mirror node without touching your code** |
| [ArcBook](https://ethglobal.com/showcase/arcbook-twp2a) | Subgraph **inside the solver's control loop**, not in a dashboard |
| [KSwap-VM](https://ethglobal.com/showcase/kswap-vm-aix5n) | Formal verification wins at these events |
| [NpmGuard](https://ethglobal.com/showcase/npmguard-wt7wh) | Agents doing real work outside crypto with a verifiable outcome |

**Observed dead lane**: at Lisbon 2026 six projects built "agent with budget and revocable permissions" (PlanBound, Do Not Rug Me, HumanMandate, Agora, Hourglass, Omega). None won.
