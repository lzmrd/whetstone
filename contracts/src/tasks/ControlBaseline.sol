// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// Baseline for the control: the efficient implementation, UNMUTATED.
///
/// The control variant does not change behaviour, so its denominator is the
/// upstream efficient version as-is -- no mutation to mirror.
contract ControlBaseline {
    function f(uint256 x) external pure returns (uint256 r) {
        assembly {
            r := shl(7, lt(0xffffffffffffffffffffffffffffffff, x))
            r := or(r, shl(6, lt(0xffffffffffffffff, shr(r, x))))
            r := or(r, shl(5, lt(0xffffffff, shr(r, x))))
            r := or(r, shl(4, lt(0xffff, shr(r, x))))
            r := or(shr(3, r), lt(0xff, shr(r, x)))
        }
    }
}
