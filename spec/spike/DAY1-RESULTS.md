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
