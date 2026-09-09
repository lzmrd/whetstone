// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// Exhaustive boundary fixture set — the scenario identity goes into every receipt.
///
/// ⚠️ Why exhaustive rather than a hand-picked ten:
/// a model's patch can introduce input-dependence that our fixtures do not
/// see — an early exit for small values, a branch on a threshold. Cheap on a
/// sparse fixture set, expensive in the real domain. With a 66-gas denominator
/// a patch that saves 30 gas on the fixtures and costs 100 elsewhere would
/// score 45% and be a lie.
///
/// Covering every power-of-two boundary closes it for log-shaped functions:
/// these are exactly the points where the result changes.
library Scenario {
    /// Human-readable label. NOT the identity — see `digest()`.
    string internal constant NAME = "boundary/v1";

    /// 0, then 2**k and 2**k +/- 1 for k = 0..255, then max. Allocated generously, shrunk to fit.
    function inputs() internal pure returns (uint256[] memory xs) {
        xs = new uint256[](800);
        uint256 n;
        xs[n++] = 0;
        for (uint256 k = 0; k < 256; k++) {
            uint256 p = uint256(1) << k;
            xs[n++] = p;
            if (p > 1) xs[n++] = p - 1;
            unchecked {
                if (p + 1 != 0) xs[n++] = p + 1;
            }
        }
        xs[n++] = type(uint256).max;
        assembly { mstore(xs, n) }   // shrink to what was actually filled
    }

    /// ── Two-argument scenario ────────────────────────────────────────────
    ///
    /// ⚠️ A SECOND scenario, not a replacement. `boundary/v1` above is quoted in
    /// every receipt already published; changing it would silently re-scope
    /// numbers that are on chain. Its digest must stay exactly what it was.
    ///
    /// Same philosophy, one dimension up: pick the points where a two-argument
    /// arithmetic function changes behaviour, then take the FULL cross product
    /// rather than hand-picking pairs. For `saturatingMul` those points are the
    /// overflow frontier; for `max`/`min` they are the orderings; for
    /// `saturatingAdd` they are the carries. One vector covers all three
    /// because it covers the boundaries themselves, not a guess about which
    /// ones a given function cares about.
    string internal constant NAME_2 = "pairs/v1";

    /// The one-dimensional base set the cross product is built from.
    function points() internal pure returns (uint256[] memory vs) {
        uint8[18] memory ks = [0, 1, 2, 3, 4, 8, 16, 32, 63, 64, 96, 127, 128, 160, 192, 224, 254, 255];
        vs = new uint256[](2 * ks.length + 2);
        uint256 n;
        vs[n++] = 0;
        for (uint256 i = 0; i < ks.length; i++) {
            uint256 p = uint256(1) << ks[i];
            vs[n++] = p;
            vs[n++] = p - 1;          // ks[0] = 0 gives 1 and 0; the duplicate 0 is harmless
        }
        vs[n++] = type(uint256).max;
        assembly { mstore(vs, n) }
    }

    /// Every ordered pair from `points()`. Ordered, not unordered: `max(a,b)`
    /// and `min(a,b)` are symmetric but a patch need not be, and an asymmetric
    /// regression is exactly what the max-regression column exists to catch.
    function pairs() internal pure returns (uint256[] memory xs, uint256[] memory ys) {
        uint256[] memory vs = points();
        uint256 n = vs.length;
        xs = new uint256[](n * n);
        ys = new uint256[](n * n);
        uint256 k;
        for (uint256 i = 0; i < n; i++) {
            for (uint256 j = 0; j < n; j++) {
                xs[k] = vs[i];
                ys[k] = vs[j];
                k++;
            }
        }
    }

    /// Identity of the two-argument scenario. Same rule as `digest()`: it
    /// commits to the VECTOR, so "pairs/v1" cannot come to mean something else.
    function digest2() internal pure returns (bytes32) {
        (uint256[] memory xs, uint256[] memory ys) = pairs();
        return keccak256(abi.encode(xs, ys));
    }

    /// The scenario's identity, and what `scenario_id` in the receipt must carry.
    ///
    /// ⚠️ A NAME BINDS NOTHING. "boundary/v1" would stay identical while the
    /// vector underneath it changed, so two runs could claim the same scenario
    /// and have been scored on different inputs — which is exactly the
    /// fixture-overfitting hole the exhaustive set was built to close.
    ///
    /// Hashing the *vector* rather than the source file is deliberate: it is
    /// invariant under comment and formatting edits, and it commits to exactly
    /// the values every measurement ran on, nothing else.
    function digest() internal pure returns (bytes32) {
        return keccak256(abi.encode(inputs()));
    }
}
