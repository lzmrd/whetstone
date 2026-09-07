# Day 1 spike — results

Monday 7 September 2026. Four measurements, no product code. Per [WHETSTONE.md](../WHETSTONE.md) §12.

## Toolchain established

| Tool | Version | Note |
|---|---|---|
| forge | **1.5.1** | 1.4.2 could not fetch solc 0.8.35 (checksum mismatch — its list predates the release). `foundryup` fixed it |
| solc | 0.8.35 | via forge |
| evm_version | **`osaka`** | ✅ compiles. OZ's own setting works, no fallback to `cancun` needed |
| hevm | 0.58.0 | needs a `solc` binary on PATH even for bytecode-level work |
| z3 | 5.1.0 | |
| bitwuzla | 0.9.1 | materially stronger than z3 here, as expected for bitvector problems |
| halmos | 0.3.3 | installed, not yet exercised |

⚠️ **`/usr/bin/forge` shadows Foundry's forge** (an unrelated ZOE tool). `source .envrc.sh` before any forge command.

⚠️ **Libraries are vendored, not git submodules.** Global git config rewrites `https://github.com/` → SSH and the agent refuses; `forge install` therefore fails. Tarballs pinned instead: **OZ v5.7.0**, **solady v0.1.26**, versions recorded in `lib/*/.pinned-version`.

---

## 1. Negative revert test — PASSED ✅

**The question**: hevm documents equivalence as *"same return value, same storage, matching success/failure"* and does **not** state that it compares revert payloads. If it does not, reverts fall out of the formal guarantee — and that is the load-bearing case, since OZ and solady diverge precisely there.

Two contracts, identical on every successful path, differing only in which custom error they raise (`contracts/src/spike/RevertProbe.sol`):

```
Difference: Both end in Failure but different EVM error.
A err: Revert 6d2cd4cb   ← ErrA()
B err: Revert ed0c2823   ← ErrB()
```

**hevm distinguishes revert payloads.** 0.1 s.

> **Consequence**: the guarantee label may state *return value, storage, outcome **and revert data***. Risk #1 level 3 is resolved favourably, and the `restored_f` story is not weakened.

## 2. Positive control — PASSED ✅

A checker that reports "not equivalent" for everything proves nothing. Two implementations computing `x & 0xff` and `x % 256`, with an identical revert path:

```
[PASS] Contracts behave equivalently — No discrepancies found
```

0.055 s. The tool is sound in both directions.

## 3. OZ.mulDiv vs solady.fullMulDiv — NOT EQUIVALENT, with a concrete counterexample ✅

| | Revert when `d == 0` |
|---|---|
| **OZ** `Math.mulDiv` | `4e487b71` + `0x12` → **`Panic(0x12)`** (division by zero) |
| **solady** `FixedPointMathLib.fullMulDiv` | `ae47f702` → **`FullMulDivFailed()`** |

This is the *price of semantics* the design predicted, now measured rather than assumed. It confirms **D-04**: raw solady cannot serve as the denominator, and `restored_f` must exist.

## 4. ⚠️ Exploration is partial on the real target

Both solvers ran out of memory on some branches of the 512-bit multiplication:

| Solver | Config | Outcome |
|---|---|---|
| z3 | 300 s timeout, default solvers | `6x` branches → out of memory, **partial** |
| bitwuzla | 300 s timeout, 4 solvers | `3x` branches → `std::bad_alloc`, **partial** |

Machine has 15 GB RAM; ~5 GB free during the runs.

### The asymmetry that matters

- **"Not equivalent" + a concrete counterexample is SOUND under partial exploration.** It is a positive claim about one input, and anyone can verify it by running both.
- **"Equivalent" under partial exploration is NOT a proof.** It only means no difference was found in the part explored.

> So today's counterexample stands. But proving `restored_f ≡ OZ` on `mulDiv` may not reach `FORMAL_*` on this hardware — it could land on `UNKNOWN`, and the label must say so.

---

## Decision

**Proceed.** Gate 3 works, is sound in both directions, and covers reverts. The open question is not *whether* the method works but *how far* the solver reaches on this particular target.

### Carried into day 2

- [ ] Write `restored_f` by hand: solady's `fullMulDiv` with OZ's `Panic` semantics restored
- [ ] Attempt `restored_f ≡ OZ` — record whichever label it earns, including `UNKNOWN`
- [ ] Verify the precondition `gas(restored_M) < gas(variant)`
- [ ] If `mulDiv` proves out of reach, fall back to a smaller fixed-size target and say why

⚠️ **If `UNKNOWN` is the best available on every candidate**, the headline metric loses its denominator and branch B from DESIGN-NOTES applies: the story becomes the price of semantics, measured, rather than the percentage closed.

---

# Addendum — the trilemma, measured

A review raised what it called the function trilemma: a target must be
**(a)** optimizable enough to leave a measurable gap, **(b)** tractable for
symbolic equivalence, and **(c)** mutable by hand while preserving difficulty.
`mulDiv` maximizes (a) and minimizes (b) and (c). The critique is correct, and
none of the specs named it.

It is also testable. Five candidate targets, OZ vs solady, same wrapper shape:

| Target | Equivalence verdict | Label | Gas (OZ → solady, 10-input fixture) |
|---|---|---|---|
| `mulDiv` | **NOT equivalent** — concrete counterexample | n/a | large headroom, semantics gap real |
| `sqrt` | no difference found, **partial exploration** | `UNKNOWN` | not measured |
| `log10` | no difference found, **partial exploration** | `UNKNOWN` | not measured |
| **`log2`** | **PASS, complete exploration** | **`FORMAL_NO_EXPLICIT_INPUT_BOUND`** | 2740 → 2220 = **520 saved, 19%** |
| **`log256`** | **PASS, complete exploration** | **`FORMAL_NO_EXPLICIT_INPUT_BOUND`** | 2250 → 1980 = **270 saved, 12%** |

## What this changes

**Leg (b) has a solution.** `log2` and `log256` are provable end to end, in
seconds, with no bounds and no partial-exploration warning.

**Leg (c) becomes feasible.** These are simple enough to mutate semantically by
hand — unlike rewriting correct 512-bit assembly, which is researcher work.

**`restored_f` is not needed for these targets.** OZ and solady are *proven
equivalent* on `log2` and `log256`, so the baseline is solady itself: externally
authored, not written by us. That removes the circularity concern, the
hand-writing burden, and the force of rule **R2** for this target. `restored_M`
is still hand-written, but over a much simpler function.

**Branch A and Branch B both exist, on different functions.**

- `log2` / `log256`: the gap is **entirely free lunch** — equivalence is proven,
  so no semantics were paid. Branch A.
- `mulDiv`: the gap **includes a semantics component** — `Panic(0x12)` versus
  `FullMulDivFailed()`. Branch B, and the price of semantics is real.

That is a richer result than either branch alone, and it is measured.

## The cost, stated plainly

⚠️ **Headroom on `log2` is 52 gas per call (19%).** Real, but small in absolute
terms, so the denominator is coarse: a model saving 20 gas scores 38%. The
quantization must be shown, not smoothed over.

⚠️ **Gas is constant across all ten fixtures** for both implementations on
`log2` — this target is branchless. That is a finding, not an assumption, and it
is only knowable by measuring across a fixture set. The scenario stays in the
receipt regardless: for other targets it will not be constant.

---

# Addendum 2 — the measuring instrument was unstable

⚠️ **Before trusting any gap figure, the method had to be fixed.**

Measuring with `gasleft()` deltas around *inlined internal* calls inside a test
is not stable. The `log256` figure moved **27 → 39 gas/call** purely because
unrelated imports and test functions were added to the same file: the surrounding
compiled code shifts, and the delta absorbs it.

**Stable method**: deploy each wrapper — the same one hevm proves equivalence on —
and measure a `staticcall` to it. Call overhead is constant and cancels in the
A-vs-B delta. `contracts/test/GasStable.t.sol`.

## Corrected figures, stable method, 10-input fixture

| Target | Verdict | Label | Gas/call saved |
|---|---|---|---|
| `log2` | proven equivalent | `FORMAL_NO_EXPLICIT_INPUT_BOUND` | 51 |
| **`log256`** | proven equivalent | `FORMAL_NO_EXPLICIT_INPUT_BOUND` | **66** |
| `toString` | partial exploration | `UNKNOWN` | 486 |
| **`toHexString`** | partial exploration | `UNKNOWN` | **4 833** |
| `sqrt`, `log10` | partial exploration | `UNKNOWN` | not measured |
| `mulDiv` | **not** equivalent, counterexample | — | semantics-laden |

## The trilemma does not break at high headroom

`toString` and `toHexString` return `string memory`. Both are **intractable** —
partial exploration, `UNKNOWN`. High headroom and symbolic tractability did not
coexist in any candidate tested.

## Proposed pairing — and why it is better than two FORMAL rows

| Role | Target | Label | Headroom |
|---|---|---|---|
| Primary | **`log256`** | `FORMAL_NO_EXPLICIT_INPUT_BOUND` | 66 gas |
| Secondary | **`toHexString`** | `FUZZED` | 4 833 gas |

A guarantee vocabulary that only ever prints one label is decoration. Two targets
earning **two different labels**, with the leaderboard saying which is which, is
the vocabulary doing its job — and it is the honest way to include a target with
real headroom for the agent to contend for.

⚠️ `toHexString` rows carry `FUZZED`, never `FORMAL`. That is the point, not a
concession.

---

# Addendum 3 — exhaustive fixtures halved the headroom

`Scenario.inputs()` — 0, every `2**k` and `2**k ± 1` for k = 0..255, and
`type(uint256).max`. **769 inputs**, measured in seconds.

| Target | 10 fixtures | **769 boundary** | OZ spread (max−min) |
|---|---|---|---|
| `log2` | 51 | **18** | 46 |
| `log256` | 66 | **32** | 81 |
| `toHexString` | 4 833 | **7 596** | 15 994 |

⚠️ **The sparse fixture set overstated the gap by roughly 2×** on both log targets.
Fixture-overfitting was already biting our own baseline measurement, before any
model patch existed. This is the strongest argument in the project for the
scenario being a first-class artifact rather than a footnote.

⚠️ **On `log256` the input-dependent spread (81 gas) exceeds the mean saving (32).**
Not noise — gas is deterministic per input, so a fixed scenario gives an exact,
comparable total. But it means a patch can improve some inputs and worsen others
and net out ambiguously, so **report the total over the fixed scenario plus
min/max/spread**, never a bare mean.

## Admission rule, pre-declared

> A target enters the leaderboard only if its **total gap over `boundary/v1`**
> is large enough that one gas is a meaningful fraction of it. Primary metric is
> **absolute gas over the fixed scenario**; percentage is derived and secondary.

Applied to measurement rather than to preference:

| Target | Total gap over 769 inputs | Role |
|---|---|---|
| `toHexString` | **5 841 982** | headroom target — `FUZZED` |
| `log256` | 25 237 | formal target — `FORMAL_NO_EXPLICIT_INPUT_BOUND` |
| `log2` | 14 446 | dropped: strictly worse than log256 on both axes |

**Final pairing: `log256` (FORMAL, exact, small) + `toHexString` (FUZZED, large).**
Two targets, two labels, the leaderboard saying which is which — a guarantee
vocabulary that only ever prints one label is decoration.

---

# Addendum 4 — the instrument was biased twice, and two spec claims are withdrawn

Written after building an **order-neutrality control** for the gas harness. It
should have existed before any number was written into the spec; it did not, and
two claims that reached WHETSTONE §1 were artefacts of the measuring instrument
rather than properties of the code.

## Three instruments

| # | Method | Fault | log256 gas/call |
|---|---|---|---|
| 1 | `gasleft()` around **inlined internal** calls | Moved 27 → 39 → 66 as unrelated imports were added to the test file | 66 (sparse fixtures) |
| 2 | Two separate loops, Solidity `.staticcall` | Memory is not reset between internal calls, so whoever ran **second** paid memory expansion at a higher offset where the quadratic term dominates. `.staticcall` also copies returndata, so memory grew *between* the two calls even inside one paired loop | 32 |
| 3 | One pre-allocated calldata buffer, raw `staticcall` with `outsize = 0` | Order bias measured at **0** | **66** |

Instrument 2's bias, measured directly by running the same comparison in both
orders: **5 038 gas over 769 inputs on `log256`** — about 10% of the delta it was
reporting. The control is now [`OrderControl.t.sol`](../../contracts/test/OrderControl.t.sol)
and asserts `bias == 0`, so this cannot regress silently.

## Corrected figures — `boundary/v1`, instrument 3

Scenario digest `0xd8fd95fe…3e81f00`, 769 inputs, 0 skipped.

| Target | Base total | Candidate total | Saved total | Per call | Base spread | Max regression |
|---|---|---|---|---|---|---|
| `toHexString` | 7 565 070 | 1 641 198 | **5 923 872** | **7 703** | 15 710 | 0 |
| `log256` | 413 722 | 362 968 | **50 754** | **66** | **0** | 0 |
| `log2` | 451 403 | 411 415 | 39 988 | 52 | **0** | 0 |

## Withdrawal 1 — the exhaustive fixtures did **not** halve the gap

Addendum 3 reported that the sparse ten-input set overstated the gap by roughly
2× (`log256` 66 → 32, `log2` 51 → 18), and called this *"the strongest argument
in the project for the scenario being a first-class artifact"*.

**That was instrument 2's bias, not fixture overfitting.** With an instrument
that passes an order control, the exhaustive set gives 66 gas/call — the same
figure the sparse set gave. Changing the fixtures and changing the instrument
happened in the same step, and the effect was attributed to the wrong one.

The design argument for exhaustive fixtures survives on its own terms: a model's
patch can be input-dependent even when the baseline is not, and a sparse set
would not see it. But it survives **as an a-priori argument with no supporting
measurement**, which is weaker than what was claimed, and the claim is retracted
rather than quietly softened.

## Withdrawal 2 — there is no input-dependent spread on the log targets

WHETSTONE §1 warned that *"on `log256` the input-dependent spread (81 gas)
exceeds the mean saving (32)"*, and built a reporting rule on it.

The measured spread is **0**. `log2` and `log256` cost identical gas on every one
of the 769 inputs, because OpenZeppelin 5.x implements both branchlessly. The
81- and 93-gas "spreads" were memory expansion accumulating across the loop.

Controls that make the zero credible rather than suspicious:

- `toHexString`, measured by the same instrument in the same run, has a spread of
  15 710 — so the harness is varying the argument.
- [`HarnessSelfCheck.t.sol`](../../contracts/test/HarnessSelfCheck.t.sol) asserts
  the scenario produces **94 distinct** `log256` results. A bug sending the same
  argument 769 times would have looked like the stability we were trying to
  achieve, and would have been believed.

Consequence: the concern about a patch that "improves some inputs and worsens
others" is an a-priori risk for a *candidate*, not an observed property of the
baseline — and it is now measured on every run rather than assumed, via the
mandatory max-regression column.

## Consequence for the admission rule

The reviewer's objection was aimed at a 32-gas denominator where 1 gas is 3.1%.
With the corrected figure the formal target is **66 gas/call, 50 754 total**, and
1 gas is 1.5%. Two notes on the objection itself, recorded because getting this
wrong in the submission would be worse than getting it wrong here:

- There was never a *"gap ≥ 100 gas"* rule to violate. The pre-declared rule is
  in WHETSTONE §1 and is about absolute gas being primary and percentage derived.
- `log256` was never coarser than `log2`. At 32 gas one gas was 3.1%; at `log2`'s
  18 it was 5.6%. `log256` was and remains the finer instrument of the two.
