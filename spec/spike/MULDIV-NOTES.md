# `mulDiv` — archived research notes

⚠️ **These notes describe `restored_f`, an artifact that no longer exists.**

They were written on day 1, when the plan was to restore OpenZeppelin's error
semantics into solady's `fullMulDiv` and use the result as the denominator.
Two measurements retired that plan:

1. On the chosen targets (`log256`, `log2`) **OZ and solady are already proven
   equivalent**, so nothing needs restoring — see [D-04](../DECISIONS.md).
2. `mulDiv` itself is **`UNKNOWN`**: bitwuzla exhausts memory both on the raw
   comparison and on the guarded non-revert domain — see
   [Addendum 5](DAY1-RESULTS.md).

They are kept because the *measured* facts below are still correct and were
expensive to establish: the exact revert payloads, the single guard site in
solady, and the pinned source locations. The obligation they described is void.
The scaffold they accompanied — a `RestoredMulDiv` contract whose body was
`revert("restored_f not implemented")` — has been removed, so that nothing can
compile it into a run by accident.

---

===========================================================================
 restored_f  —  HAND-WRITTEN BY THE BUILDER. See decision R2.

 If a model writes this, the baseline becomes AI work and the metric
 measures AI against AI. Any model assistance here must be disclosed
 in AI_USAGE.md.
===========================================================================

 GOAL
 Take solady's `fullMulDiv` algorithm and restore OpenZeppelin's error
 semantics, so that `restored ≡ OZ.mulDiv` can be proven at gate 3.

 WHAT DIFFERS (measured on day 1, not assumed)
 Both libraries revert under the SAME conditions. Only the data differs:

     condition            OZ Math.mulDiv        solady fullMulDiv
     ─────────────────    ──────────────────    ─────────────────────
     d == 0               Panic(0x12)           FullMulDivFailed()
     result overflows     Panic(0x11)           FullMulDivFailed()

 So the algorithm is kept; only the revert is replaced.

 WHERE
 solady raises the error at ONE place inside the 512-bit branch:

     if iszero(gt(d, p1)) {
         mstore(0x00, 0xae47f702)   // FullMulDivFailed()
         revert(0x1c, 0x04)
     }

 That guard fires both when `d == 0` and when the result would overflow.
 OpenZeppelin distinguishes the two:

     Panic.panic(ternary(denominator == 0, DIVISION_BY_ZERO, UNDER_OVERFLOW))

 A Solidity panic reverts with `Panic(uint256)`, selector 0x4e487b71,
 followed by the 32-byte code — 36 bytes total. Day 1 observed exactly:

     4e487b71 0000…0012      ← Panic(0x12)

 REFERENCE SOURCES (vendored, pinned)
     lib/openzeppelin-contracts/contracts/utils/math/Math.sol : 206
     lib/solady/src/utils/FixedPointMathLib.sol               : 455

 WATCH OUT
 · solady's fast path uses Yul `div`, which returns 0 rather than reverting
   on a zero divisor — it is only reached when `d != 0`, so that is safe,
   but do not move the guard.
 · Keep the function `internal pure` and the wrapper signature unchanged,
   or the dispatchers stop matching and hevm compares the wrong thing.

---

## Status

**Void.** Superseded by the bilateral mutation in [WHETSTONE §4](../WHETSTONE.md).
The baseline is `solady_M`, not a restored implementation, and the human artifact
is the mutation `M`.
