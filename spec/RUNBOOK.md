# Whetstone — runbook

One page. No new concepts: everything is extracted from [WHETSTONE.md](WHETSTONE.md).
**Readable at 3am without having to think.**

> Covers **Track S — Synthetic** (hand-written baseline). Track H — Historical is roadmap: [DESIGN-NOTES](DESIGN-NOTES.md).
> **Solo builder.** Official deadline Sunday 13 Sept 12:00 EDT — but the **hard stop is Friday 11 Sept, midday**.

---

## Fix before starting

| Item | Value | Status |
|---|---|---|
| Target function (OZ) | `Math.mulDiv(uint256,uint256,uint256)` — `internal pure`, `Math.sol:206` | ✅ verified |
| Baseline source (solady) | `FixedPointMathLib.fullMulDiv(uint256,uint256,uint256)` — `internal pure`, line 460 | ✅ verified |
| solc version | **`0.8.35`** — from OZ's own `foundry.toml`. solady's pragma is `^0.8.4`, compatible | ✅ set |
| `evm_version` | **`osaka`** — OZ's own setting. ⚠️ see hevm note below | ✅ set, verify Monday |
| `optimizer_runs` | **`200`**, `optimizer = true` — OZ's own setting | ✅ set |
| Checker | hevm \| halmos | **decided Monday from the spike** |
| Cost denomination | HBAR paid; USD shown at a **declared rate + date** | ✅ set |
| Model source | **OpenCode Zen / Go** — one OpenAI-compatible key, ~24 open-weight models | ✅ set |
| Models under test | 2 paid (e.g. `minimax-m3`, $0.30/$1.20 per 1M) + 1 free (e.g. `mimo-v2.5-free`) | 🔴 **confirm ids from your dashboard** |
| Total demo budget | **$3** at list price — estimate below shows ~$1.20 needed | ✅ set |

**Budget estimate**: ~5k in / 2k out tokens per round × 10 rounds × n=5 seeds × 3 models × 2 functions ≈ 1.5M in + 0.6M out ≈ **$1.20** at MiniMax M3 rates. The Go weekly cap is ~$30 — ample margin.

### Model access — OpenCode Go

- Key from [OpenCode Zen](https://opencode.ai/docs/zen/); [Go plan](https://opencode.ai/docs/go/) is $10/mo, OpenAI-compatible endpoint
- **Whetstone therefore benchmarks open-weight models.** Not a fallback: it matches the open-weights framing the project came from, and it is a less crowded claim than comparing frontier models
- ⚠️ **Verify on day 0**: that responses carry a `usage` object with token counts — without it there is no cost column
- ⚠️ **Go is a subscription with value-based rate limits** (~$12 / 5h, $30 / week, $60 / month), not per-token billing. So **the published cost is not what you paid**

> **README wording**: the x402 amount is computed as tokens × published list price; the on-chain Hedera payment is real; the subscription is merely how the calls were funded. Same pass-through principle already decided, applied to a subscription.

- ⚠️ **Budget guard in the harness**: a runaway loop can burn the 5-hour cap mid-batch. Ten lines of code.

**Free models exist on Zen** (`Big Pickle`, `MiMo-V2.5 Free`, `Ling 3.0 Flash Fin Free`, `Nemotron 3 Ultra/3.5 Lightning Free`, `Muse Spark 1.3 Contributor Free`) at a published price of $0, same OpenAI-compatible endpoint.

- Use them **today for building and debugging the harness** — no measurement runs are due until the batch
- Keeping **one free model in the leaderboard alongside the paid ones makes the cost column more interesting**, not less: *"this model did 40% of the work at zero marginal cost"* is a real finding
- 💡 **Fetch prices at runtime** from `https://opencode.ai/zen/v1/models` and write them into the receipt. Pass-through pricing then stops being our claim and becomes a retrievable fact

⚠️ **`osaka` may outrun the tools.** Symbolic execution engines lag behind hardforks. If hevm/halmos do not support `osaka` on Monday, drop to `cancun` and **declare the divergence from OZ's own config** in the receipt. This is a day-1 spike item, not a config detail.

⚠️ **Hedera runs Cancun, not osaka** (Besu with modifications: no blobs, Type 3 transactions rejected). It does **not** affect current scope — the target Solidity is never deployed to Hedera; Hedera carries x402 payments and HCS receipts only, and the pinned Foundry EVM is the sole authority over gas and equivalence. It becomes binding in two roadmap cases: the challenge contract (R7), and the optional "deploy before/after to testnet" demo touch. **In those cases compile that artifact with `cancun`** and declare it.

💡 **Bonus found in solady**: `fullMulDivUnchecked` (line 521) ships alongside `fullMulDiv`. The same library carries the checked and unchecked versions, so **the price of dropped semantics is measurable between two of their own functions** — and `restored_f` becomes a small delta over `fullMulDiv` (align the error behaviour to OZ's) instead of a rewrite.

### Hedera / Blocky402 — no access request needed

Testnet is **open access, no API key**. Mainnet is not yet supported.

| Item | Value | Status |
|---|---|---|
| Facilitator base URL | `https://api.testnet.blocky402.com` | ✅ public |
| Network id | `hedera:testnet` | |
| Facilitator fee-payer | `0.0.7162784` — **re-read from `GET /supported`, do not hardcode** | |
| Payer account (the agent) | `0.0.10389769` | ✅ funded from faucet |
| Payee account (`payTo`, the gateway operator) | `0.0.10375344` | ✅ created |
| Payer ECDSA private key | in `.env`, never committed | **TO FIX** |
| Asset | `0.0.0` (HBAR) for the smoke test | ✅ |

⚠️ **Two accounts on purpose.** A transfer to yourself nets to zero and Hedera rejects it — and the split is also the honest shape: the agent pays, the gateway operator receives.

💡 **Optional upgrade, only once HBAR works**: settle in **HTS USDC** (`HEDERA_TESTNET_USDC` is exported by `@x402/hedera`). Two gains — the cost column becomes natively dollar-denominated, removing the declared HBAR→USD rate entirely, and it scores the Hedera extra point *"HTS tokens in the settlement path"* (2 → 3 of 7). Cost: the payee must first run a `TokenAssociateTransaction`. **Do not attempt before the HBAR round-trip settles** — otherwise a failure is ambiguous between the rail and the association.
| SDK | `npm install @x402/hedera` · Node 18+ | |

**Payment flow**: `GET /supported` → build `paymentRequirements` → client partially signs a `TransferTransaction` → `POST /verify` → `POST /settle` → present the payload base64-encoded as the `X-PAYMENT` header. The facilitator co-signs as fee-payer.

### The Graph — registry chain

⚠️ **The Graph does not support Hedera** (supported-networks page 404s; Hedera's docs point to a *local* graph node, which the bounty disqualifies as "local-only"). HCS is not EVM and cannot be indexed.

| Item | Value | Status |
|---|---|---|
| Registry chain | **Base Sepolia** — `eip155:84532`, supported by Subgraph Studio | ✅ verified |
| `RunRegistry` address | `0x______` | **TO FIX** — deploy Wednesday |
| Subgraph Studio API key | in `.env` | **TO FIX** |
| Deployer key + Base Sepolia ETH | faucet | **TO FIX** |

> While the rows above read "TO FIX", the receipt is not serializable and no guarantee label means anything.

---

## Receipt schema (HCS)

```json
{
  "run_id":        "",
  "function":      "OZ/Math.mulDiv",
  "variant_hash":  "keccak256 of the variant source",
  "baseline_hash": "keccak256 of restored_M",
  "model":         "provider/model@version",
  "seed":          0,
  "spend_usdc":    "0.000000",
  "gas_v1":        0,
  "gas_baseline":  0,
  "gas_patch":     0,
  "relative_progress": 0.0,
  "guarantee":     "FORMAL_NO_EXPLICIT_INPUT_BOUND | FORMAL_BOUNDED | FUZZED | UNKNOWN",
  "bounds":        { "max_iterations": null, "max_input_len": null },
  "toolchain":     { "solc": "", "evm_version": "", "optimizer_runs": 0,
                     "checker": "", "checker_version": "", "wrapper_hash": "" },
  "timestamp":     ""
}
```

⚠️ Without a **complete** `toolchain` and `bounds`, the guarantee label is unverifiable and the receipt is worthless.

---

## Commands

```bash
# gas
forge snapshot --match-contract <C>

# tests
forge test --match-contract <C> -vvv

# differential fuzzing (compares return bytes, revert bytes, storage, events)
forge test --match-test testDiff --fuzz-runs 1000000

# equivalence — hevm (bytecode level)
hevm equivalence --code-a <bytecode-a> --code-b <bytecode-b>

# equivalence — halmos (symbolic over Foundry tests)
halmos --function check_Equivalence
```

---

## Pivot gates

```
GATE 1 — hevm/halmos does not terminate on the day-1 target
  PIVOT: drop the relative-to-baseline percentage.
         Show absolute gas delta + FUZZED label.
         The thesis becomes "declared guarantee", not "proven equivalence".

GATE 2 — the checker does not cover revert payloads (negative test failed)
  PIVOT: formal on success/output/storage only.
         Revert bytes covered at gate 2, stated on every row.
         The restored-solady story weakens: say so, do not work around it.

GATE 3 — the paid x402 round-trip does not settle on Sunday
  (Blocky402 testnet is open access; the real dependency is a funded Hedera account)
  PIVOT: use the Hedera x402 pay-per-request PoC as-is.
         DO NOT build a multi-provider gateway.

GATE 4 — gas(restored_M) >= gas(variant)
  PIVOT: that function goes to the "denominator not established" bucket.
         Change function; do not adjust the denominator.
```

---

## Mandatory daily deliverable

| Day | If this is missing at end of day, you are behind |
|---|---|
| **Sun 6** | Repo initialized, docs committed, TO FIX rows filled, and **one 0.001 HBAR payment settled end-to-end** through Blocky402 |
| **Mon 7** | A `proven`/`fail`/`unknown` outcome on **one** function + proceed/pivot decision |
| **Tue 8** | **One complete leaderboard row**: mutated variant, proven baseline, paid x402 call, HCS receipt |
| **Wed 9** | Subgraph queried by the allocator to decide the next round |
| **Thu 10** | Multi-seed batch, web view, **feature freeze 18:00**, video recorded |
| **Fri 11 am** | Submission closed. **No code.** |

> **Tue 8 is the point of no return**: from there on something exists to present even if everything else collapses.
> **Thu 10 evening is the real deadline.** Friday morning is buffer, not production time.

---

## Cut order

When time runs short, cut **from the bottom**:

```
1. Ratchet                          ← cut first
2. Procedural mutation engine        (the hand-written variant stays!)
3. Control family
4. Minimal web view                  ← judged criterion (Usability); cut late
5. Multi-seed batch                  ← below this, declare "n=1, demo"
────────────────────────────────────────────
NEVER cut:
  · the hand-written semantic variant (without it, no anti-memorization defence)
  · the HCS receipt (it is the Hedera deliverable)
  · the allocator querying the subgraph (it is The Graph deliverable)
  · the "subgraph disabled" fallback path — it exists ONLY to be filmed,
    and it is what proves the subgraph is load-bearing rather than decorative
    (WHETSTONE §10, beat 3)
```

**Challenge contract**: already roadmap per decision R7. If it is absent, **do not say "the EVM as arbiter"** in the demo or the README.

---

## Submission checklist

- [ ] Video **2-4 minutes**, ≥720p, **narrated by you** — no AI voiceover, no speed-up, no phone recording
- [ ] Public repo with **real commit history** (large single commits risk disqualification)
- [ ] Partner prizes selected: **Hedera · The Graph · Uniswap** (3 max; multi-track partners count as 1)
- [ ] Registered in the **Start Fresh** pool
- [ ] `AI_USAGE.md`: which files were AI-assisted, which are hand-written. **Solo builder** — the hand-written `restored_f` / `restored_M_f` are the human contribution rule 2 asks to see
- [ ] `/spec` directory with spec files, prompts and planning artifacts (required for spec-driven workflows)
- [ ] README: prior art and declared scope at the top
- [ ] `FEEDBACK.md` + Uniswap feedback form — **only if the Uniswap deliverable actually happened**
