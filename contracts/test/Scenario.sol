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
