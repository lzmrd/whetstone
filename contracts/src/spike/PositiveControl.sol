// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// Positive control for the day-1 spike.
///
/// A checker that reports "not equivalent" for everything proves nothing.
/// These two compute the same function by different routes, with an identical
/// revert path, and MUST be reported equivalent — otherwise the negative
/// result is meaningless.

error Zero();

contract SameA {
    function f(uint256 x) external pure returns (uint256) {
        if (x == 0) revert Zero();
        return x & 0xff;
    }
}

contract SameB {
    function f(uint256 x) external pure returns (uint256) {
        if (x == 0) revert Zero();
        return x % 256;     // identical to x & 0xff for every uint256
    }
}
