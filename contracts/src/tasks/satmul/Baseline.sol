// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// The BASELINE — the number a model has to beat.
///
/// solady's `saturatingMul` (FixedPointMathLib), with the SAME mutation M
/// applied by hand: one `shr(1, …)` around the existing expression. The
/// efficient code is still Vectorized's; only M is ours, and
/// `hevm(Baseline ≡ Candidate)` is machine-checked.
///
/// ⚠️ Never sent to a model. It is the denominator, not the task.
contract SatMulBaseline {
    function f(uint256 x, uint256 y) external pure returns (uint256 z) {
        assembly {
            z := shr(1, or(sub(or(iszero(x), eq(div(mul(x, y), x), y)), 1), mul(x, y)))
        }
    }
}
