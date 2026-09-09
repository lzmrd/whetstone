// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// THE TRIVIAL FLOOR -- the task with one word added.
///
/// ⚠️ Not part of the task and never sent to a model. It answers the question a
/// percentage cannot: did the model do better than a one-word edit?
///
/// The loop counter runs from 41 down to 2 and the condition `i > 1` makes the
/// decrement unable to underflow -- yet Solidity emits a check for it on every
/// one of the forty iterations. Wrapping the body in `unchecked` removes forty
/// dead checks per call and requires no understanding of what the function
/// computes.
///
/// ⚠️ `hevm(Trivial == Candidate)` must hold. If it does not, the check is NOT
/// dead and this reference is invalid.
contract HexAddrTrivial {
    bytes16 private constant DIGITS = "fedcba9876543210";

    function f(uint256 x) external pure returns (string memory) {
        uint256 localValue = uint256(uint160(x));
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        unchecked {
            for (uint256 i = 41; i > 1; --i) {
                buffer[i] = DIGITS[localValue & 0xf];
                localValue >>= 4;
            }
        }
        return string(buffer);
    }
}
