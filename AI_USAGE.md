# AI tool usage

Per ETHGlobal's *Use of AI Tools* rules: attribution, involvement, and spec-driven artifacts.

**Solo builder.** Everything below refers to one person directing the tools.

---

## Tools used

| Tool | Used for |
|---|---|
| Claude (Claude Code) | Design conversation, specification drafting, research on prior art and sponsor requirements, implementation |
| GPT Luna | Adversarial review of the specification |
| GLM 5.3 | Adversarial review of the specification |
| Kimi K3 | Adversarial review of the specification |
| Qwen 3.8 | Adversarial review of the specification |

### The adversarial review loop

Structured critiques of the specification were commissioned from **four separate
models**, deliberately, to find reasoning faults that the drafting model would not
find in its own work. They are named here because ETHGlobal's attribution rule
covers **all AI involvement, not only the tool that wrote the code** — and the
critiques were not marginal. They produced the Track S / Track H split, the
target trilemma, the agent-interface section, the bilateral mutation, the scoring
rule with its max-regression column, and the `mulDiv` second pass.

⚠️ **The critiques were not uniformly correct, and that is recorded rather than
smoothed over.** The 7 September review asserted that the pre-declared admission
rule required a gap of ≥ 100 gas and was therefore violated by the formal target,
and that `log256` was a coarser instrument than `log2`. Both are false: no such
threshold ever existed in the specification, and at 32 gas one gas is 3.1% against
`log2`'s 5.6%. The surviving points of that same review were accepted and are in
the repository. Adversarial review is useful **because** it is checked, not
because it is trusted.

---

## What the AI did

- Drafted and repeatedly revised the specification documents in `spec/`
- Researched prior art (SolEval, PrefGen, GasAgent, RAGas) and verified the arXiv identifiers
- Read and cross-checked sponsor bounty requirements against the plan
- Verified factual constraints that changed the architecture, e.g. that Chainlink CRE workflows run in wasmtime, and that The Graph does not support Hedera
- Assists with implementation code (per-file attribution below, kept current as code lands)

## What the human did

The directional decisions that shaped the project were made by the builder, not the model. The record is in [spec/DECISIONS.md](spec/DECISIONS.md); in summary:

- Rejected the initial target (Redis) and required a blockchain-relevant domain — which led to gas as the metric
- Raised the risk of introducing a fund-draining bug, which produced the restriction to pure functions and the equivalence gate
- Challenged the strength of the "proven equivalence" claim, forcing it down to a declared-guarantee vocabulary
- Identified that the Uniswap track would read as oversell, and set its terms
- Asked which environment governs which claim, producing the environment-authority split
- Asked how `RunRegistry` learns about a run, exposing that the registry is a log and not an oracle
- Required that the subgraph's indispensability be *shown* in the demo rather than asserted

## The human contribution, stated once

⚠️ **This section was headed *"Hand-written by the human, by design"* and that
heading was false against its own file.** It listed artifacts that the per-file
table below marks `HA` (AI-assisted) and that the closing paragraph describes as
not hand-written — three incompatible statements about the same artifacts in one
document. The heading is the one that was wrong, and it is corrected rather than
the table.

**The accurate statement, made once and not contradicted below**: nothing in this
repository is a substantial hand-written human artifact. The human contribution is
**direction, constraint and rejection**, plus the pinned price table. What follows
is what that direction produced and why each piece is load-bearing — not a claim
about who typed it.

⚠️ **This section also changed on day 1, and the change weakens it. Recorded rather
than quietly dropped.**

Earlier drafts named `restored_f` — solady's implementation with OpenZeppelin's
checks restored — as the human contribution, and rule **R2** required it be
hand-written. Day 1 measurement removed that artifact: on `log256` and `log2`,
**OZ and solady are already proven equivalent**, so no restoration is needed. The
researcher-grade task of hand-writing correct 512-bit assembly is gone.

What remains as human work, stated plainly:

| Artifact | Why it is load-bearing |
|---|---|
| **The bilateral semantic mutation** — `M` applied by hand to *both* OZ and solady, with `hevm(solady_M ≡ OZ_M)` proven | This is now the baseline. A hand-written baseline could be made deliberately slow to inflate the denominator, so both mutants are published side by side and the equivalence is machine-checked |
| **The exhaustive fixture set** (`Scenario.inputs()`, 769 boundary inputs, identified by content digest) | The scenario is what makes a score defined at all. ⚠️ It was previously justified here by the claim that the sparse ten-input set overstated the gap by ~2×; that claim is **withdrawn** — the effect was gas-instrument bias, not fixture overfitting (D-14). The design argument stands; its supporting measurement does not |
| **The harness**, gates, guarantee labelling, receipt construction | Including the controls that caught three faulty gas instruments and two tests that reported the opposite of what they measured |
| **The allocator policy** — explicit, deterministic, printed on screen next to its decision | |

**Is this weaker than "I hand-wrote researcher-grade assembly"? Yes.** It is
declared with the same honesty as the rest of the project, because a judge assessing
a spec-driven workflow is looking for exactly this kind of disclosure.

Any model assistance on the mutation or the fixture set must be disclosed here
explicitly.

## Per-file attribution

Kept current as code lands. `H` = hand-written, `A` = AI-generated, `HA` = AI-assisted, human-reviewed and edited.

| Path | Attribution | Notes |
|---|---|---|
| `spec/*.md`, `README.md` | HA | AI-drafted, human-directed and repeatedly redirected — including several rewrites forced by structured critique |
| `contracts/src/spike/*.sol` | HA | Equivalence probes and wrappers |
| `contracts/test/Scenario.sol` | HA | Fixture vector and its content digest |
| `contracts/test/GasMeter.sol`, `OrderControl.t.sol`, `HarnessSelfCheck.t.sol` | HA | The instrument and its controls |
| `scripts/equiv.sh`, `scripts/selfcheck.sh` | HA | Equivalence runner and the per-run gate check |
| `harness/src/*.mjs` | HA | The whole harness: payment, gates, guarantee labelling, receipts, batch records |
| `scripts/bootstrap.sh` | HA | Pinned toolchain provisioning, sha256-verified |
| `contracts/src/tasks/NegativeControl.sol` | HA | The mutation proof 2b must refuse |
| `harness/src/prices.json` | **H** | Prices transcribed by hand from the published page; source URL, date and sha256 recorded in the file |
| **the mutation `M`** (`contracts/src/tasks/Task.sol`, `Baseline.sol`) | ⚠️ **A** — model-written | Written by Claude on 7 September at the builder's explicit instruction. See below |

### ⚠️ The mutation is model-written, and that weakens a claim this project made

`M` — *the result is the number of bytes needed to represent `x` rather than the
index of its highest non-zero byte, and zero reverts instead of returning a
value* — was written by Claude, not by the builder. The builder was offered the
choice, understood the trade-off, and chose this.

**Why it matters enough to have its own section.** R2 named `M` as the human
artifact of Track S, and the argument for it was not paperwork: `M` is the
decision about *what makes a task hard*. If the model chooses that, the
benchmark's difficulty is defined by the thing being benchmarked.

**What survives.** The anti-circularity defence never rested on authorship. It
rests on the bilateral construction, which is machine-checked and third-party
verifiable regardless of who typed it:

- the efficient code is still Vectorized's; only `M` is ours
- `hevm(Baseline ≡ Candidate)` is **proved**, so the denominator computes the task
- `hevm(Candidate ≡ Original)` is **refuted**, so the mutation is demonstrably
  semantic and not cosmetic — R4 verified rather than asserted
- both mutants are published side by side, so nobody has to take our word that
  the baseline was not shaped to flatter or punish a model
- `gas(Baseline) < gas(Candidate)` holds on every one of the 768 scored inputs,
  so `M` did not damage the third-party efficiency anchor

**What does not survive.** Nothing in this repository is now a substantial
hand-written human artifact. The honest description of the human contribution is
**direction, constraint and rejection** — the questions that changed the
architecture (recorded in [spec/DECISIONS.md](spec/DECISIONS.md)), the refusal of
weak claims, the commissioning of four adversarial reviews — plus the pinned
price table. That is a real contribution to a spec-driven project and it is not
the same thing as writing the load-bearing artifact.

Recorded here rather than left for a judge to work out.

---

## Spec-driven development

This project uses a spec-driven workflow with plain Markdown rather than a framework (OpenSpec, Kiro, spec-kit). Per the rules, all spec files, prompts and planning artifacts are in this repository:

- `spec/` — specification, runbook, design notes, decision log
- `spec/prompts/` — ⚠️ **the design conversation transcript is NOT yet exported.**
  The directory holds a placeholder README saying so. ETHGlobal's rule requires
  prompts and planning artifacts to be in the repository, and this part of it is
  **not satisfied**. Stated plainly here rather than left as a directory a reader
  discovers is empty. The specification, decision log and design notes — which are
  the planning artifacts the rule is aimed at — are present and complete.

The specification went through ten revisions before implementation began; the decision log records what was rejected at each step and why.
