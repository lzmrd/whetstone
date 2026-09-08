// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// The BASELINE — the number a model has to beat.
///
/// solady's `log256` (FixedPointMathLib), with the SAME mutation M applied by
/// hand. The efficient code is still Vectorized's; only M is ours, and
/// hevm(Baseline == Candidate) is machine-checked.
///
/// ⚠️ Never sent to a model. It is the denominator, not the task.
///
/// ⚠️ Both mutants are published side by side precisely so nobody has to take
/// our word that the baseline was not shaped to flatter or punish a model. If M
/// had damaged this side's efficiency, `gas(Baseline) < gas(Candidate)` would
/// fail and the target would go to the "denominator not established" bucket
/// rather than being reported.

error ZeroHasNoBytes();

contract Baseline {
    function f(uint256 x) external pure returns (uint256 r) {
        if (x == 0) revert ZeroHasNoBytes();
        assembly {
            r := shl(7, lt(0xffffffffffffffffffffffffffffffff, x))
            r := or(r, shl(6, lt(0xffffffffffffffff, shr(r, x))))
            r := or(r, shl(5, lt(0xffffffff, shr(r, x))))
            r := or(r, shl(4, lt(0xffff, shr(r, x))))
            r := or(shr(3, r), lt(0xff, shr(r, x)))
            r := add(r, 1)
        }
    }
}
