// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// The task. Comments are stripped before this reaches a model, and the
/// redaction gate refuses to send anything naming the upstream libraries.
///
/// The mutation M, applied by hand to this side and to the baseline identically:
///
///   1. the result is the NUMBER OF BYTES needed to represent x, not the index
///      of its highest non-zero byte  -> every output differs from upstream
///   2. zero has no byte length, so it reverts instead of returning a value
///      -> the domain differs too, and revert data is compared by the gate
///
/// Chosen over a bare "revert on zero" because a guard bolted onto the front
/// leaves a memorised body correct for every other input. This changes all 769.

error ZeroHasNoBytes();

contract Candidate {
    function f(uint256 x) external pure returns (uint256 r) {
        if (x == 0) revert ZeroHasNoBytes();
        r = (x > 0xffffffffffffffffffffffffffffffff ? 1 : 0) << 7;
        r |= ((x >> r) > 0xffffffffffffffff ? 1 : 0) << 6;
        r |= ((x >> r) > 0xffffffff ? 1 : 0) << 5;
        r |= ((x >> r) > 0xffff ? 1 : 0) << 4;
        return ((r >> 3) | ((x >> r) > 0xff ? 1 : 0)) + 1;
    }
}
