# Whetstone

Whetstone is a small, public experiment in a difficult question:

> When an AI proposes a gas optimisation, what would make the claim “it saved gas” independently checkable?

It runs open-weight models on Solidity optimisation tasks, charges and records each inference call, checks the proposed patch against the original behaviour, measures gas under a fixed toolchain, and publishes a receipt for the run.

The aim is not to crown a “best model”. It is to show the evidence a credible AI-code-optimisation result needs.

⚠️ **Status — vertical slice, not a benchmark yet.** Four hand-built tasks are gated and ready; the measured results so far come from one of them, over a handful of seeds. The pipeline runs end to end. That is enough to demonstrate the method; it is not enough to rank models. A real task corpus and a statistically meaningful sample are future work.

Built for [ETHOnline 2026](https://ethglobal.com/events/ethonline2026), Start Fresh track.

## For judges: the idea in three minutes

### The problem

“An LLM made this Solidity code cheaper” is easy to claim and surprisingly hard to trust. Four questions usually remain unanswered:

1. Did the new code preserve the intended behaviour?
2. Is the gas number reproducible, rather than a lucky local measurement?
3. What did the attempt cost, including failed attempts?
4. Could the task merely reward a solution the model had already memorised?

Whetstone makes each answer an artifact someone else can inspect.

### The loop

```text
mutated Solidity task
        ↓
paid model call proposes a patch
        ↓
compile → equivalence check → fixed gas scenario
        ↓
receipt: patch, cost, guarantees, toolchain and result
        ↓
Hedera receipt + Base Sepolia index + public subgraph
```

The model may iterate using only mechanical feedback from the compiler and checker. A patch is scored only if it compiles and passes the available correctness gate.

### Why mutate a known function?

A public benchmark can become less informative once its answers enter training data. Whetstone starts from well-known library functions, then applies a semantic mutation: the familiar implementation is intentionally no longer correct for the task. Before a run, the harness checks that this mutation actually changes behaviour over the committed scenario.

This does not solve contamination in general. It is a concrete defence against the simplest version: returning a memorised implementation unchanged.

Who wrote each mutation is recorded rather than assumed: the first was written by a model at the builder's instruction, the second and third were chosen by the builder from candidates scored in advance for how much of the scenario they actually change. [AI usage](AI_USAGE.md) has the full split, including the objection that a menu assembled by a model is itself a form of authorship.

### What a result means

Each result brings three values together:

| Value | Meaning |
|---|---|
| **Gas saved** | Difference under the published Solidity compiler, EVM target and fixed input scenario. |
| **Cost** | Tokens used × pinned public list price, separate from the Hedera payment that meters the call. |
| **Guarantee** | The strongest check reached: formal equivalence where the solver completes, otherwise a declared fuzzing campaign; no proof is silently implied. |

The receipt also includes the patch source, task and baseline hashes, toolchain versions, scenario identifier, payment references and repository revision. A third party can rerun the measurement instead of accepting a dashboard number on trust.

### Has this been done before?

Optimising gas with an LLM has been done several times, and recently:

| Work | Date | Result |
|---|---|---|
| [SolEval](https://arxiv.org/abs/2502.18793) | Feb 2025 | Repo-level Solidity benchmark, introduces Gas@k |
| [PrefGen](https://arxiv.org/abs/2506.03006) | Jun 2025 | 58.9% Gas@5 |
| [GasAgent](https://arxiv.org/abs/2507.15761) | Jul 2025 | 82/100 contracts optimised, 9.97% average deployment saving |
| [RAGas](https://arxiv.org/abs/2608.15857) | Aug 2026 | Up to 11%, "preserving functional equivalence" |

What is added here is not a better optimiser. It is the evidence around the number: a correctness check whose strength is stated rather than implied, the cost of reaching it, and a receipt that lets someone else recompute the result instead of trusting it.

### Why this loop is worth measuring

In [*A shallow dive into formal verification*](https://vitalik.eth.limo/general/2026/05/18/fv.html) (May 2026), Vitalik Buterin describes where he expects optimised code to end up: not one artifact trading readability against speed, but two — a fast implementation and a readable one — plus a machine-checked proof that they are equivalent.

That is the loop Whetstone runs: the model writes the fast version, the harness proves it equivalent to the reference, and the gas difference is the score. The post argues the loop is coming. It does not say how well models actually run it, what it costs, or how often the prover gives up — and those are the three numbers this repository reports.

## What is live in this repository

- A model-agent loop with a fixed prompt, token ceiling, temperature and iteration limit.
- A paid x402 gateway on Hedera testnet: payment is settled before the gateway calls the model provider.
- Solidity compilation, symbolic equivalence where possible, differential fuzzing as the declared fallback, and gas measurement over a committed scenario.
- HCS receipts that are read back and hash-checked.
- A permissionless `RunRegistry` on Base Sepolia and a Graph subgraph used by the allocator to see prior runs.

The deployed `RunRegistry` is [on Base Sepolia](https://sepolia.basescan.org/address/0x6Cc049953C21e0f23AD4a2AE791253Bb4fe18Fc0); the [subgraph](https://thegraph.com/studio/subgraph/whetstone) exposes its indexed rows.

### The controls, and a prediction that broke

Two checks here exist in order to fail, because a gate that nothing ever fails is not a gate:

- A deliberately **cosmetic** mutation is put through the same admission checks and is **rejected**: it changes behaviour on 1 input out of 769, where the real mutation changes all 769.
- A **trivial floor** — the task with one word deleted, no understanding required. A patch that does not beat that floor has demonstrated nothing, whatever percentage it prints. On the first task the floor turned out to be larger than the entire gap between the two reference implementations, which is why a second, a third and a fourth task exist. The fourth has a floor of 1 399 gas/call against 14 137 of headroom — 9% — and is the first target with real room between a reflex and an expert implementation.

The expected result on that first task — no saving, or noise — was written into the specification **before the first measured run**. It broke: the model beat the baseline on 6 of the first 22 scored runs. The cause was the toolchain rather than the model, since some patches use an opcode that the pinned reference library predates. The prediction, its falsification and the reason are recorded in [the decision log](spec/DECISIONS.md), and the denominator was deliberately left unrepaired.

## A finding outside the benchmark

The fourth task was built on `VanityAddressLib.score` from Uniswap's
v4-periphery (MIT), and building it produced something the benchmark itself
does not need: **that function can be made 79% cheaper on a realistic workload,
computing the same score.**

| workload | current | rewritten | saving |
|---|---:|---:|---:|
| random addresses | 2 681 | 571 | **2 110 gas/call · 79%** |
| addresses that score above zero | 22 330 | 1 913 | **20 417 gas/call · 91%** |

The first row is the one to quote — a vanity miner feeds random candidates, and
fifteen in sixteen take the early exit. And no contract inside v4-periphery
calls this function: the cost falls on whoever mines hook addresses with it.
The equivalence rests on 60 000 fuzz runs and an exhaustive pass over the
control flow, **not** on a proof — hevm was OOM-killed at 6 GB after 18
seconds. All of it, including the licence screen of both repositories and the
places we were wrong, is in [FEEDBACK.md](FEEDBACK.md).

## Important limits

These limits are part of the result, not footnotes.

- **Not a leaderboard.** Four tasks are built, but every measured batch so far comes from one of them, and several ran fewer than the intended five seeds. Results cannot establish a model ranking, and ties are the normal outcome.
- **Not a general intelligence test.** This is one narrow capability: optimising small Solidity functions while respecting a specified interface.
- **Not an economic constraint.** A run does stop when its list-price estimate reaches the declared budget, but that check compares the estimate and never what actually settled on Hedera — and the cap has never bound in practice, because a whole batch costs cents. The payment flow demonstrates per-call metering and settlement, not scarcity.
- **Not a blanket proof of correctness.** A guarantee label describes exactly what the checker established, within its ABI domain and serialised assumptions. `UNKNOWN` means the prover did not complete, not that a patch is correct.
- **Not production settlement.** Payer and payee are builder-controlled Hedera testnet accounts, so the HBAR round trip demonstrates the rail rather than an economic marketplace.

For the detailed limitations, including contamination and Goodhart effects, see [Design notes](spec/DESIGN-NOTES.md).

## Architecture, briefly

| Component | Role |
|---|---|
| Local pinned Foundry toolchain | Sole authority for equivalence and gas measurement. |
| x402 gateway on Hedera testnet | Gates the provider API call behind an HBAR payment and returns settlement evidence. |
| Hedera Consensus Service | Canonical, timestamped receipt storage. |
| Base Sepolia `RunRegistry` | Append-only, indexable pointer to the HCS receipt. It verifies no benchmark claim itself. |
| The Graph subgraph | Query layer for the allocator’s memory across rounds. |

The chains do not make an optimisation true. They make the published claim harder to quietly replace and easier to locate. Recomputing with the pinned inputs and toolchain is what tests the claim.

## Try it locally

```bash
./scripts/bootstrap.sh   # pinned libraries + solc, hevm, bitwuzla and z3
source .envrc.sh         # select the project toolchain
forge test               # Solidity controls, gates and gas scenario

cd harness
npm ci
npm test
npm run web              # local leaderboard, reading the live subgraph
```

To run a paid model call, copy `.env.example` to `.env`, fill the documented testnet credentials, start `npm run gateway`, then use `npm run agent -- <provider/model>`. See the operational runbook before publishing a result.

## Read at the depth you need

| If you want to know… | Read |
|---|---|
| The binding definitions of scores, guarantees and gates | [Whetstone specification](spec/WHETSTONE.md) |
| How to reproduce or operate a run safely | [Runbook](spec/RUNBOOK.md) |
| Why design choices were made, rejected alternatives and roadmap | [Design notes](spec/DESIGN-NOTES.md) |
| The evidence behind corrections and changes | [Decision log](spec/DECISIONS.md) |
| How AI tools contributed to the project | [AI usage](AI_USAGE.md) |

Technical detail lives in those documents on purpose: the main README should let a blockchain-and-AI judge understand what is being demonstrated, what to believe, and what not to infer before asking them to audit the machinery.

## License

MIT
