# Whetstone

**Making an LLM optimize gas has already been done. Measuring it with declared guarantees has not.**

Whetstone runs open-weight models against Solidity optimization tasks under a real, on-chain budget, and reports three things together: **how much gas was saved**, **what it cost to get there**, and **what level of correctness guarantee actually backs each patch**.

> 🚧 **Status: day 1 complete.** Specification, measurement harness and equivalence
> gate are standing and self-checked; the agent loop, payments-per-round and
> on-chain records are not built yet.
> Built for [ETHOnline 2026](https://ethglobal.com/events/ethonline2026), Start Fresh track. Solo builder.

---

## Declared scope — read this first

This is a **method demonstration with a leaderboard interface**, not a benchmark of models.

- **1-2 functions, n≥5 seeds per configuration.**
- With that few independent tasks you cannot rank models, and this project does not claim to.
- The question it answers: *"how does an agent perform on a small, declared set of Solidity tasks under a fixed budget?"*

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
| **Base Sepolia** | `RunRegistry` + the indexable subgraph |

**Why three?** The Graph cannot index Hedera, and HCS is not EVM. So the canonical receipt lives on HCS, and a small event on Base Sepolia carries its hash, its HCS pointer, and the few fields the allocator filters on. Given the event you can fetch the HCS message from the mirror node and check the hashes match.

**Why the subgraph is load-bearing**: it is the allocator's memory across rounds. Disable it and the allocator falls back to blind round-robin — the demo shows both.

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

**Pricing is pass-through.** The amount is computed as `tokens × published list price` and written into the receipt. The subscription used to fund the calls is not what is reported: the reported cost is the list-price equivalent, so the number means "what this would cost anyone", not "what we happened to pay".

⚠️ **The list price is pinned by hand, not fetched.** The provider's `/v1/models` endpoint returns only `id`, `object`, `created`, `owned_by` — **no pricing**. Prices live in `harness/src/prices.json` with source URL, retrieval date, version and sha256, and that hash goes into the receipt. A model with no price entry cannot be metered and does not appear in the leaderboard.

---

## Setup

> To be completed as the implementation lands.

```bash
cp .env.example .env     # fill in keys — see comments in the file
forge build              # toolchain is pinned in foundry.toml
```

Requirements: Foundry, Node 18+, a funded Hedera testnet account, a funded Base Sepolia account.

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
