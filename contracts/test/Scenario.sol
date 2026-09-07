// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// Exhaustive boundary fixture set — SCENARIO_ID goes into every receipt.
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
    string internal constant ID = "boundary/v1";

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
}
