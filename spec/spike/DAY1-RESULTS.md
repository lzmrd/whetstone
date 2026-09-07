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
