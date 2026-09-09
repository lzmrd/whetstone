// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// The task. Comments are stripped before this reaches a model.
///
/// The mutation M, applied by hand to this side and to the baseline identically:
///
///   the digit alphabet is INVERTED -- the value d is written as the character
///   for 15 - d. Every rendering changes, including the all-zero address.
///
/// ⚠️ Chosen by the builder from three candidates, each presented with its
/// measured divergence over the committed scenario AND its surviving headroom,
/// before any was written as code.
///
/// ⚠️ Chosen for WHERE it applies, not only for how much it moves. The obvious
/// mutations on a string-returning function wrap the output -- drop the prefix,
/// reverse the result -- and those change 100% of renderings while leaving a
/// memorised body intact and reusable: paste what you know, append the
/// transformation. Proof 2b measures how much the OUTPUT moves, not whether a
/// memorised answer stays useful, and on a wrapper mutation those two come
/// apart. This one lands inside the loop, on the table the digits are read
/// from, so a memorised implementation is wrong rather than incomplete.
///
/// ⚠️ The uppercase alphabet was refused before implementation: it moves only
/// 32.8% of the scenario, because just 157 of the 478 distinct addresses render
/// with any letter at all.
contract HexAddrCandidate {
    bytes16 private constant DIGITS = "fedcba9876543210";

    function f(uint256 x) external pure returns (string memory) {
        uint256 localValue = uint256(uint160(x));
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 41; i > 1; --i) {
            buffer[i] = DIGITS[localValue & 0xf];
            localValue >>= 4;
        }
        return string(buffer);
    }
}
