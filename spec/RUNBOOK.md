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
| Model source | ⚠️ **OpenCode Zen is BLOCKED** (GATE 0). Replaced by a provider **registry**: `harness/src/prices.json` holds base URL, key env var, price source and pinned prices per provider. Candidates: **Groq** (Llama, Qwen, Gemma, Mixtral) and **OpenRouter** (`:free` variants) — both open-weight-only and OpenAI-compatible, so no harness change beyond a key and transcribed prices | ⚠️ keys needed |
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
- ⚠️ **Two providers, not one, and not for redundancy alone.** R10 commits the allocator to *"budgeting across providers"*; with a single provider that phrase has nothing behind it, and the demo beat is theatre. GATE 0 also showed what a single point of failure costs: the one provider we had refuses API access outright
- ⚠️ **Runtime price fetching is impossible — verified, not assumed.** `GET /v1/models` returns only `id`, `object`, `created`, `owned_by`: **no pricing at all**. Prices therefore live in `harness/src/prices.json`, pinned by hand with source URL, retrieval date, version and sha256, and the hash goes into the receipt. A model with no price entry **cannot be metered and must not appear in the leaderboard**

⚠️ **`osaka` may outrun the tools.** Symbolic execution engines lag behind hardforks. If hevm/halmos do not support `osaka` on Monday, drop to `cancun` and **declare the divergence from OZ's own config** in the receipt. This is a day-1 spike item, not a config detail.

⚠️ **Hedera runs Cancun, not osaka** (Besu with modifications: no blobs, Type 3 transactions rejected). It does **not** affect current scope — the target Solidity is never deployed to Hedera; Hedera carries x402 payments and HCS receipts only, and the pinned Foundry EVM is the sole authority over gas and equivalence. It becomes binding in two roadmap cases: the challenge contract (R7), and the optional "deploy before/after to testnet" demo touch. **In those cases compile that artifact with `cancun`** and declare it.

💡 **Bonus found in solady**: `fullMulDivUnchecked` ships alongside `fullMulDiv`, so the price of dropped semantics is measurable between two of their own functions.

⚠️ **Weakened twice since.** `restored_f` no longer exists (D-04), and the `mulDiv` arithmetic is **`UNKNOWN`** — bitwuzla exhausts memory both unconditionally and on the guarded non-revert domain ([Addendum 5](spike/DAY1-RESULTS.md)). A gas delta between two implementations not shown to compute the same thing is **not a price**. If published at all it goes out labelled `UNKNOWN`, beside the counterexample.

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

## Receipt schema (HCS) — v2

```json
{
  "schema": "whetstone/receipt/v2",
  "run_id": "mtsh0edy-dd05bcbd",
  "round": 1,
  "status": "provisional",
  "task": {
    "id": "log256-bytelen/v1",
    "function": "contracts/src/tasks/Task.sol",
    "variant_hash": "b4935894c8ce16bde67bbffc672428b1533c4f1e1e8b1ce21a2933183db6bfa5",
    "baseline_hash": null,
    "scenario_id": "0x…",
    "scenario_name": "boundary/v1",
    "prompt_hash": "…"
  },
  "agent": {
    "model": "groq/openai/gpt-oss-120b",
    "seed": 1,
    "temperature": 0.2,
    "max_rounds": 8,
    "rounds_used": 1,
    "outcomes": [
      "proved"
    ],
    "stop_reason": "proved"
  },
  "cost": {
    "tokens_in": 0,
    "tokens_out": 0,
    "price_table": {
      "version": 3,
      "sha256": "d38ae1be6e4d3112e9026016d7f10cc16723dafafa6879a941f03455b221e8c2",
      "retrieved": "2026-09-07"
    },
    "usd_list": "0.00000000",
    "hbar_paid": "0.00000000",
    "settlements": [],
    "settle_tx": null,
    "paid_through_gateway": true
  },
  "gas": {
    "inputs": 769,
    "scored": 768,
    "skipped": 1,
    "v1_total": 0,
    "patch_total": 0,
    "saved_total": 0,
    "patch_max_regression": 0,
    "patch_regressed_inputs": 0,
    "baseline_total": 0,
    "relative_progress": 0,
    "trivial_total": 0,
    "trivial_saves_per_call": 69,
    "beats_trivial_by": 0
  },
  "guarantee": {
    "label": "FORMAL_NO_EXPLICIT_INPUT_BOUND",
    "bounds": {
      "max_iterations": -1,
      "max_input_len": null
    },
    "assumptions": [],
    "fuzz_campaign": null,
    "reverts_covered": true,
    "mutation_refuted": true,
    "proof_1_baseline_equals_task": "FORMAL_NO_EXPLICIT_INPUT_BOUND",
    "proof_3_trivial_equals_task": "FORMAL_NO_EXPLICIT_INPUT_BOUND"
  },
  "toolchain": {
    "solc": "0.8.35",
    "evm_version": "osaka",
    "optimizer_runs": 200,
    "bytecode_hash": "none",
    "checker": "hevm",
    "checker_version": "0.58.0 [no git revision present]",
    "solver": "bitwuzla",
    "oz_version": "v5.7.0",
    "solady_version": "v0.1.26",
    "forge_std_version": "v1.16.2"
  },
  "artifacts": {
    "repo": "https://github.com/lzmrd/whetstone",
    "commit": "ecbb4b33480f2dbdaf5f38bbdf3ba77cf3f2715d",
    "dirty": true,
    "patch_sha256": "77999a365ef1e925840f71004d2d3507a588095af1177d018e678014e868a721",
    "patch_source": "<the model patch, verbatim>"
  },
  "timestamp": "2026-09-08T09:32:02.922Z"
}
```

⚠️ **Generated from `buildReceipt()`, not maintained by hand.** It drifted badly
once: `oz_version`, `solady_version` and `wrapper_hash` were documented here for
days and never emitted, while sixteen fields the code did emit were undocumented.
Regenerate rather than edit.

⚠️ Every field above exists because something breaks without it:

| Field | Without it |
|---|---|
| `scenario_id` | ⚠️ It is the **`keccak256` of the input vector**, not a name. `"boundary/v1"` would stay identical while the vector underneath it changed, letting two runs claim the same scenario after being scored on different inputs. The name is carried separately and binds nothing. Gas for a pure function depends on its inputs: a score quoted without its fixture set is **undefined** |
| `patch_max_regression` / `patch_regressed_inputs` | The scoring rule (WHETSTONE §1) ranks on the total and **requires** the worst single-input regression beside it. A patch can win on the total while making one boundary input much worse. **No leaderboard row exists with only one of the two** |
| `scored` / `skipped` | A patch that reverts on part of the domain would otherwise silently shrink the denominator and look efficient |
| `guarantee.assumptions` | A **conditional** proof whose condition is not published is not a result. Where the wrapper restricts the domain — `d != 0`, "the 512-bit product fits" — the restriction is part of the claim |
| `guarantee.mutation_refuted` | R4 requires `M` to be semantic. This records that hevm **refuted** `OZ_M ≡ OZ_f`. If it is false, a memorized answer is still correct and the anti-contamination defence is decoration |
| `prompt_hash`, `max_rounds`, `temperature` | The agent interface is the independent variable; runs are not comparable |
| `round` | A patch found on round 1 and one found on round 8 cost different amounts |
| `status` | The leaderboard would fake a finality it does not have |
| `usd_list` **and** `hbar_paid` | ⚠️ **They are different numbers.** HBAR is what actually moved; USD is `tokens × list price` from a pinned table. Do not conflate |
| `price_table` | The list price is pinned by hand — the Zen `/v1/models` endpoint returns **no pricing** — so the table version and hash must travel with the number |
| `artifacts.repo/commit/path` | "Anyone can recompute" is empty without saying *what* to recompute and *where it lives* |
| `reverts_covered` | Measured on day 1 as `true` for hevm. Do not assume it for another checker |

## Artifact publication — what "anyone recomputes" actually requires

A tamper-evident log only protects against rewriting history. It does **not**
protect against a false value written the first time. Recomputation is the only
real defence, and it needs the inputs to be public.

**Every scored run publishes, in this repo, at the commit named in the receipt:**

```
artifacts/<run_id>/
  variant.sol         the mutated source the model was given
  baseline.sol        the baseline it is measured against
  patch.sol           what the model returned
  wrapper.sol         the exact wrapper compiled
  Scenario.sol        the fixture set (Solidity), identified by keccak256 of its input vector
  prompt.txt          the fixed system prompt
  result.txt          raw checker output, including any partial-exploration warning
```

With those plus `toolchain`, a third party reproduces `gas.*` and the guarantee
label without asking us for anything.

## Commands

```bash
# gas
forge snapshot --match-contract <C>

# tests
forge test --match-contract <C> -vvv

# differential fuzzing (compares return bytes, revert bytes, storage, events)
forge test --match-test testDiff --fuzz-runs 20000

# equivalence — hevm (bytecode level)
hevm equivalence --code-a <bytecode-a> --code-b <bytecode-b>

# equivalence — halmos (symbolic over Foundry tests)
halmos --function check_Equivalence
```

---

⚠️ **`--fuzz-runs 1000000` was unrealistic** and is dropped. A million runs against two
implementations is hours of CPU per pair, incompatible with the calendar — and uniform
random sampling covers the cases that matter *badly*: a zero divisor, a product that
overflows, the boundary at `2**128`. Random draws almost never land on them.

> **Structured corpus, not volume.** The fixture set in `contracts/test/Scenario.sol` carries the
> boundaries explicitly; fuzzing runs on top of it to catch what was not thought of.
> 20k runs over a seeded corpus beats 1M uniform draws for this shape of function.

## Pivot gates

**Status after day 1**: Gate 1 **passed** on `log256`/`log2` (seconds, complete
exploration) and **fired** on `mulDiv` and `toHexString` — which is why the plan
carries two targets with two different labels. Gate 2 **passed**, and is now
re-asserted on every run by `scripts/selfcheck.sh` (R12) rather than remembered.
Gate 4 cannot be evaluated until `M` exists.

```
GATE 0 — no model is reachable through the API
  STATUS: ⚠️ FIRED, 7 September. Every model in the pinned price table:
          · all *-free models -> "OpenCode's free tier can only be used in
            OpenCode". The free tier is client-only; the API refuses it, and
            no amount of credit changes that.
          · all paid models   -> "Insufficient balance".
          Detected by `npm run access`, which exists because `npm run models`
          lists the catalogue and says nothing about entitlement.
  PIVOT: three options, in order of cost-in-TIME, which is the binding
         constraint:
         1. Fund the OpenCode workspace. No code changes. At $0.30/$1.20 per 1M
            an 8-round run on a small file is cents; the whole batch fits well
            inside BUDGET_USD_MAX.
         2. Switch provider to one whose free tier is API-accessible. Costs a
            new base URL, new price-table entries, and re-verifying that `usage`
            comes back -- without it there is no cost column.
         3. Frontier API keys directly. Works, but drops the open-weight
            positioning, so it changes the submission's claim, not just its
            plumbing.
  ⚠️ Until this clears, NO measured run is possible and the Tuesday deliverable
     cannot be completed. Everything else in the pipeline is built and green.

GATE 1 — hevm/halmos does not terminate on the day-1 target
  STATUS: passed on log256/log2; FIRED on mulDiv (UNKNOWN, solver OOM)
          and on toHexString (partial exploration)
  PIVOT: drop the relative-to-baseline percentage.
         Show absolute gas delta + FUZZED label.
         The thesis becomes "declared guarantee", not "proven equivalence".

GATE 2 — the checker does not cover revert payloads (negative test failed)
  STATUS: passed. hevm DOES compare revert payloads -- 0.1s, ErrA vs ErrB.
          Undocumented behaviour, so it is re-checked on EVERY run (R12),
          paired with a positive control, and hevm 0.58.0 is pinned in the
          receipt. This gate can still fire on a toolchain change.
  PIVOT: formal on success/output/storage only.
         Revert bytes covered at gate 2, stated on every row.

GATE 3 — the paid x402 round-trip does not settle on Sunday
  (Blocky402 testnet is open access; the real dependency is a funded Hedera account)
  PIVOT: use the Hedera x402 pay-per-request PoC as-is.
         DO NOT build a multi-provider gateway.

GATE 4 — gas(solady_M) >= gas(OZ_M)   [the mutation damaged the baseline]
  STATUS: not evaluable until M exists.
  PIVOT: that function goes to the "denominator not established" bucket.
         Redesign M, or change function. Do NOT adjust the denominator:
         an inflated denominator is exactly the circularity the bilateral
         construction exists to prevent.
```

---

## Mandatory daily deliverable

| Day | If this is missing at end of day, you are behind |
|---|---|
| **Sun 6** | Repo initialized, docs committed, TO FIX rows filled, and **one 0.001 HBAR payment settled end-to-end** through Blocky402 |
| **Mon 7** | A `proven`/`fail`/`unknown` outcome on **one** function + proceed/pivot decision |
| **Tue 8** | **One complete leaderboard row**: mutated variant, proven baseline, paid x402 call, HCS receipt |
| **Wed 9** | Subgraph queried by the allocator to decide the next round |
| **Thu 10** | Multi-seed batch, web view, **feature freeze 18:00**, video recorded. Stretch only, 90-minute abort: the historical-pair task (WHETSTONE §13) |
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
    (WHETSTONE §11, beat 3)
```

**Challenge contract**: already roadmap per decision R7. If it is absent, **do not say "the EVM as arbiter"** in the demo or the README.

---

## Submission checklist

- [ ] Video **2-4 minutes**, ≥720p, **narrated by you** — no AI voiceover, no speed-up, no phone recording
- [ ] Public repo with **real commit history** (large single commits risk disqualification)
- [ ] Partner prizes selected: **Hedera · The Graph · Uniswap** (3 max; multi-track partners count as 1)
- [ ] Registered in the **Start Fresh** pool
- [ ] `AI_USAGE.md`: which files were AI-assisted, which are hand-written. **Solo builder** — the human contribution R2 asks to see is now the **mutation `M`**, applied by hand to both sides, plus the scenario, harness and allocator policy. ⚠️ Authorship of `M` is a declared fact: if it was model-assisted, say so
- [ ] `/spec` directory with spec files, prompts and planning artifacts (required for spec-driven workflows)
- [ ] README: prior art and declared scope at the top
- [ ] `FEEDBACK.md` + Uniswap feedback form — **only if the Uniswap deliverable actually happened**
