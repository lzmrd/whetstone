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

Two artifacts are hand-written as a **methodological requirement**, not a formality:

- `restored_f` — solady's implementation with OpenZeppelin's checks restored
- `restored_M_f` — the same, under the semantic mutation

These define the baseline the models are measured against. If a model wrote them, the metric would be measuring AI work against AI work. See decision **D2** in [spec/WHETSTONE.md](spec/WHETSTONE.md).

Any model assistance on these two files must be disclosed here explicitly.

---

## Per-file attribution

Kept current as code lands. `H` = hand-written, `A` = AI-generated, `HA` = AI-assisted, human-reviewed and edited.

| Path | Attribution | Notes |
|---|---|---|
| `spec/*.md` | HA | AI-drafted, human-directed and repeatedly redirected |
| `contracts/src/restored_*.sol` | **H** | Must stay hand-written — see above |
| _(to be extended)_ | | |

---

## Spec-driven development

This project uses a spec-driven workflow with plain Markdown rather than a framework (OpenSpec, Kiro, spec-kit). Per the rules, all spec files, prompts and planning artifacts are in this repository:

- `spec/` — specification, runbook, design notes, decision log
- `spec/prompts/` — the design conversation transcript

The specification went through ten revisions before implementation began; the decision log records what was rejected at each step and why.
