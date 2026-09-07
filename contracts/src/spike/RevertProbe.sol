// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// Negative probe for the day-1 spike.
///
/// A and B are identical on every successful path and differ ONLY in the data
/// they revert with. hevm documents its equivalence as "same return value, same
/// storage, matching success/failure" — it does not state that it compares the
/// revert payload.
///
/// If hevm reports these two as EQUIVALENT, then revert payloads are outside the
/// formal guarantee, and they must be covered by differential fuzzing (gate 2)
/// instead. That is the load-bearing case: OpenZeppelin and solady diverge
/// precisely on reverts.

error ErrA();
error ErrB();

contract RevertA {
    function f(uint256 x) external pure returns (uint256) {
        if (x == 0) revert ErrA();
        return x;
    }
}

contract RevertB {
    function f(uint256 x) external pure returns (uint256) {
        if (x == 0) revert ErrB();
        return x;
    }
}
