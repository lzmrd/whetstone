# AI tool usage

Per ETHGlobal's *Use of AI Tools* rules: attribution, involvement, and spec-driven artifacts.

**Solo builder.** Everything below refers to one person directing the tools.

---

## Tools used

| Tool | Used for |
|---|---|
| Claude (Claude Code) | Design conversation, specification drafting, research on prior art and sponsor requirements, code assistance |
| _(to confirm)_ | Adversarial review of the specification — see note below |

> ⚠️ **To fill in before submission**: several structured critiques of the specification were incorporated during design. If any of them were produced by another AI model, that must be named here — the attribution rule covers all AI involvement, not only code generation.

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

## Hand-written by the human, by design

⚠️ **This section changed on day 1, and the change weakens it. Recorded rather than
quietly dropped.**

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
| `harness/src/*.mjs` | HA | Payment and model-access smoke tests |
| `harness/src/prices.json` | **H** | Prices transcribed by hand from the published page; source URL, date and sha256 recorded in the file |
| **the mutation `M`** | ⚠️ **not yet written** | R2: authorship is a declared fact. This row must be filled before submission, and must be accurate |

⚠️ **Stated plainly, because the table above is easy to skim past: every artifact
in this repository so far was written by the model under human direction.** The
human contribution to date is directional — the constraints, the rejections, the
critiques that forced rewrites — plus the pinned price table. The one artifact
designated as human work, the mutation `M`, **does not exist yet**.

---

## Spec-driven development

This project uses a spec-driven workflow with plain Markdown rather than a framework (OpenSpec, Kiro, spec-kit). Per the rules, all spec files, prompts and planning artifacts are in this repository:

- `spec/` — specification, runbook, design notes, decision log
- `spec/prompts/` — the design conversation transcript

The specification went through ten revisions before implementation began; the decision log records what was rejected at each step and why.
