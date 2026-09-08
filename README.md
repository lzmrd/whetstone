# Whetstone

**Making an LLM optimize gas has already been done. Measuring it with declared guarantees has not.**

Whetstone runs open-weight models against Solidity optimization tasks, meters and settles every single inference call on-chain, and reports three things together: **how much gas was saved**, **what it cost to get there**, and **what level of correctness guarantee actually backs each patch**.

⚠️ **"On-chain budget" would be an overstatement, so it is not claimed.** Payer and
payee are both testnet accounts of the builder: the HBAR makes a round trip. What
the payment rail demonstrates is *metering and settlement per call*, not financial
constraint — and the declared `budget_usd_per_run` has never actually bound a run,
because a five-seed batch costs $0.003–0.012 in list-price terms against a $0.05 cap.

> 🚧 **Status: the vertical slice runs end to end.** x402 challenge → settled
> Hedera payment → inference → symbolic equivalence → gas over a fixed scenario →
> receipt on HCS, read back and hash-checked. The semantic mutation is applied and
> its three proof obligations are enforced before any run is scored, so receipts
> now carry `mutation_refuted: true`. A cosmetic control task has been run against
> it and the result is **a tie** — reported as one.
> The `RunRegistry` is deployed on Base Sepolia, the subgraph is published and
> indexing, and the allocator decides the next paid round from indexed data. The
> cross-chain link is checkable by anyone: take `receiptHash` from the subgraph,
> fetch that message from Hedera's public mirror node, hash it, compare.
> ⚠️ Still missing: the demo video and Start Fresh registration.
> Built for [ETHOnline 2026](https://ethglobal.com/events/ethonline2026), Start Fresh track. Solo builder.

---

## What this is trying to be

**Public benchmarks for LLMs decay.** Once a benchmark is public its answers are in
the next training run, and a rising score stops being evidence of a rising
capability. Whetstone is an attempt at a code-optimization benchmark that resists
that, built on three properties:

**1. The answer cannot be memorized.** Every task is a *semantically mutated*
variant of a well-known library function. Every model has OpenZeppelin and solady
in its training data — so the mutation is chosen to make the memorized answer
**wrong**, and a memorized answer is then rejected at the equivalence gate. The
benchmark defends itself instead of relying on secrecy. (Hiding the task is not an
option: to have a model optimize code you must send it the code, and it runs on
the servers of the lab you would be hiding it from.)

**2. The score is recomputed, not measured.** Gas, under a toolchain pinned in
every receipt — not wall-clock on somebody's laptop. Publish the receipt and
anyone can recompute the number and catch a lie.

**3. Correctness is machine-checked, and the strength of the check is part of the
result.** Not "the tests pass", but one of four declared labels, from a completed
symbolic-equivalence proof down to `UNKNOWN` when the solver gives up. A gas saving
with no guarantee attached is not a result.

### What exists, and what does not

**What exists after five days is the evaluation engine** — harness, gates,
guarantee vocabulary, receipts, cost accounting — validated end to end on a small
hand-built task set.

⚠️ **What would make it an actual benchmark is scale**: hundreds of tasks mined
from real merged optimization commits, where the baseline is the human commit
rather than anything we wrote. That is **roadmap, not built**, it uses a different
baseline, and results from the two are never comparable. See Track S and Track H in
[the design notes](spec/DESIGN-NOTES.md).

## Declared scope — read this first

What is built this week is a **method demonstration with a leaderboard interface**.
It is **not a ranking of models**.

- **1-2 functions, n≥5 seeds per configuration.**
- With that few independent tasks you cannot rank models, and this project does not claim to. Ties are the normal outcome and are reported as ties.
- The question it answers: *"how does an agent perform on a small, declared set of Solidity tasks under a fixed budget?"*
- The question it does **not** answer yet: *"which model is better at optimizing Solidity?"* — that needs Track H.

## Prior art

Optimizing gas with an LLM is well-trodden ground, and we are not first:

| Work | Date | Result |
|---|---|---|
| [SolEval](https://arxiv.org/abs/2502.18793) | Feb 2025 | Repo-level Solidity benchmark, introduces **Gas@k** |
| [PrefGen](https://arxiv.org/abs/2506.03006) | Jun 2025 | 58.9% Gas@5 |
| [GasAgent](https://arxiv.org/abs/2507.15761) | Jul 2025 | 82/100 contracts optimized, 9.97% average deployment saving |
| [*RAGas: Retrieval-Augmented Gas Optimization for Smart Contracts*](https://arxiv.org/abs/2608.15857) | Aug 2026 | Up to 11%, "preserving functional equivalence" |

**What Whetstone adds**: machine-checked equivalence as a *gate with a labelled guarantee*; inference **cost** tied to that guarantee; and **third-party verifiability** — published receipts, serialized toolchain, and a scenario identified by the hash of its input vector rather than by a name.

⚠️ A fourth claim, *"a measurement of the price of the semantics solady dropped"*, was carried in earlier drafts and is **withdrawn**. It rested on `mulDiv`, the one target where the semantics genuinely differ, and the arithmetic there is `UNKNOWN`: the solver exhausts memory both unconditionally and on the guarded domain. A gas delta between implementations not shown to compute the same thing is not a price.

---

## The loop this measures

In [*A shallow dive into formal verification*](https://vitalik.eth.limo/general/2026/05/18/fv.html)
(May 2026), Vitalik Buterin describes what he expects optimized code to become:
not one artifact balancing readability against efficiency, but **two** — one
written for speed, one written to be read — plus a machine-checked proof that they
are equivalent.

> "we have AI write the assembly, and then write a formal proof verifying that the
> assembly has the desired properties. At the very least, the desired property can
> just be perfect equivalence to an implementation optimized for readability and
> written in some human-friendly high-level language."

Yoichi Hirai calls that the final form of software development. **It is also the
loop Whetstone runs**: the model writes the fast version, the harness proves it
equivalent to the reference, the gas delta is the score.

The post argues the loop is coming. It does not say how well models actually run
it, what it costs, or how often the prover gives up — and those are the three
numbers this repository reports.

⚠️ **One rung down the ladder, and we say so.** That post is Lean-centric, and much
of its value rests on the proofs being *end-to-end*. The hevm gate here is not: it
holds within the ABI domain and the serialized wrapper assumptions, which is what
the label `FORMAL_NO_EXPLICIT_INPUT_BOUND` is named after. Same shape, weaker
guarantee, declared rather than implied.

---

## Architecture

Three environments, each with a distinct and non-overlapping role.

```
                    ┌──────────────────────────────┐
                    │  HARNESS + ALLOCATOR         │
                    │  (the agent: holds wallets,  │
                    │   decides, pays, records)    │
                    └───┬──────────────────────┬───┘
        queries history │                      │ pays per call (x402)
                        │                      ▼
                        │        ┌──────────────────────────┐
                        │        │  our x402-gated gateway  │
                        │        │  on Hedera testnet       │
                        │        │  → proxies to models     │
                        │        └───────┬──────────────────┘
                        │                │ patch
                        │                ▼
                        │        ┌──────────────────────────┐
                        │        │  RUNNER (Foundry, local) │
                        │        │  gates 1-3 + gas         │
                        │        └───────┬──────────────────┘
                        │                │
                        │                ▼
                        │        ┌──────────────────────────┐
                        │        │  HCS receipt (Hedera)    │  ← canonical record
                        │        └───────┬──────────────────┘
                        │                │ hash + pointer
                        │                ▼
                  ┌─────┴────────┐  ┌──────────────────────────┐
                  │  Subgraph    │◄─┤  RunRegistry             │
                  │ (The Graph)  │  │  (Base Sepolia)          │
                  └──────────────┘  └──────────────────────────┘
```

| Environment | Authoritative for |
|---|---|
| **Pinned Foundry EVM** (local) | Gas and equivalence. **Sole authority over the score** |
| **Hedera testnet** | x402 payments and HCS receipts |
| **Base Sepolia** | [`RunRegistry`](https://sepolia.basescan.org/address/0x6Cc049953C21e0f23AD4a2AE791253Bb4fe18Fc0) `0x6Cc049953C21e0f23AD4a2AE791253Bb4fe18Fc0` + the [subgraph](https://thegraph.com/studio/subgraph/whetstone) |

**Why three?** The Graph cannot index Hedera, and HCS is not EVM. So the canonical receipt lives on HCS, and a small event on Base Sepolia carries its hash, its HCS pointer, and the few fields the allocator filters on. Given the event you can fetch the HCS message from the mirror node and check the hashes match.

**Why the subgraph is load-bearing**: it is the allocator's memory across rounds. Disable it and the allocator falls back to blind round-robin — the demo shows both.

⚠️ That demo **illustrates the architecture; it does not prove the subgraph is
necessary.** An allocator built to read its history from the subgraph will of
course degrade when the subgraph is removed. Filming it is a description of the
design, not evidence for it, and it is presented as such.

---

## Payment flow

Every model call is paid for on-chain, per call, before the response is used.

```
1. GET /supported on the Blocky402 facilitator
     → discover the fee-payer advertised for hedera:testnet
2. Build paymentRequirements (scheme: exact, network: hedera:testnet, asset: HBAR)
3. The client partially signs a TransferTransaction
4. POST /verify   → facilitator validates
5. POST /settle   → facilitator co-signs as fee-payer, returns a transaction id
6. The payload, base64-encoded, is presented as the X-PAYMENT header
     to our gateway, which then proxies the inference call
```

**Two different numbers, never conflated.** `hbar_paid` is what actually moved on Hedera: the gateway meters each request as `base + estimated input tokens + declared max_tokens`, so the charge varies per call, and the 402 response carries the breakdown. ⚠️ Because x402 settles *before* the work, output is priced at the ceiling the client asked for — an upper bound that overcharges against tokens actually used.

`usd_list` is the reported cost: `tokens actually used × published list price`, written into the receipt. The subscription used to fund the calls is not what is reported: the reported cost is the list-price equivalent, so the number means "what this would cost anyone", not "what we happened to pay".

⚠️ **The list price is pinned by hand, not fetched.** The provider's `/v1/models` endpoint returns only `id`, `object`, `created`, `owned_by` — **no pricing**. Prices live in `harness/src/prices.json` with source URL, retrieval date, version and sha256, and that hash goes into the receipt. A model with no price entry cannot be metered and does not appear in the leaderboard.

---

## Setup

```bash
./scripts/bootstrap.sh   # pinned libraries + solc, hevm, bitwuzla, z3 (~60 MB)
cd harness && npm i && npm run web   # the leaderboard, reading the live subgraph
source .envrc.sh         # .tools and Foundry ahead of the system PATH
forge test               # 7 tests: instrument controls, gates, gas scenario
./scripts/selfcheck.sh   # the gate self-check, in both directions
```

`lib/` and `.tools/` are not committed (vendored tarballs and large binaries), so
`bootstrap.sh` is what makes a clone reproducible rather than merely readable.
**Every version it installs is part of the claim, not packaging**: gas numbers are
comparable only under the pinned solc, and an equivalence label only means what it
says under the checker and solver that produced it. The four binaries are verified
by sha256 against the exact builds that produced the published receipts, and a
mismatch is a hard failure.

Verified on a clean clone: bootstrap → `forge test` (7 passed) → runtime bytecode
**byte-identical** to this repository's.

To run a *paid* model call as well: Foundry, Node 20+, a funded Hedera testnet
account, and `cp .env.example .env` filled in — see the comments in that file.

---

## What this does not measure

- **Not general intelligence.** One capability, on a handful of tasks.
- **Not a model ranking.** Too few independent tasks; ties are the normal outcome and are reported as ties.
- **Gas savings are reported per invocation**, not as annual dollars: these are `internal` libraries that get inlined, savings depend on downstream call volume and gas price, and on L2 calldata dominates execution.

Full treatment of the limits, including Goodhart effects and contamination: [spec/DESIGN-NOTES.md](spec/DESIGN-NOTES.md).

---

## Documentation

| File | Contents |
|---|---|
| [spec/WHETSTONE.md](spec/WHETSTONE.md) | Build spec: binding decisions, pipeline, metric, gates |
| [spec/RUNBOOK.md](spec/RUNBOOK.md) | Operational checklist, pivot gates, daily deliverables |
| [spec/DESIGN-NOTES.md](spec/DESIGN-NOTES.md) | Rationale, rejected alternatives, limits, roadmap |
| [spec/DECISIONS.md](spec/DECISIONS.md) | Decision log with evidence |
| [AI_USAGE.md](AI_USAGE.md) | AI tool attribution |

## License

MIT
