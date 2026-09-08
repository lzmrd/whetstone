// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// THE TRIVIAL FLOOR — the task with one word changed.
///
/// ⚠️ Not part of the task and never sent to a model. It exists so a leaderboard
/// row can answer a question the percentage cannot: **did the model do better
/// than a one-word edit?**
///
/// The task computes `r + 1` where `r` is a byte index, so `r <= 31` and the
/// addition can never overflow — yet Solidity emits an overflow check for it,
/// and the optimizer cannot prove it dead. Wrapping it in `unchecked` recovers
/// 69 gas per call, **24% of the entire 283-gas gap**, while requiring no
/// understanding of the function at all.
///
/// Without this reference a model scoring 70 gas/call looks like it optimised
/// something. It may have deleted a dead check and understood nothing.
///
/// ⚠️ `hevm(Trivial ≡ Candidate)` must PASS. That is not ceremony: if it fails,
/// the check is NOT dead, the 69 gas are buying something real, and this whole
/// reference is wrong.

error ZeroHasNoBytes();

contract Trivial {
    function f(uint256 x) external pure returns (uint256 r) {
        if (x == 0) revert ZeroHasNoBytes();
        r = (x > 0xffffffffffffffffffffffffffffffff ? 1 : 0) << 7;
        r |= ((x >> r) > 0xffffffffffffffff ? 1 : 0) << 6;
        r |= ((x >> r) > 0xffffffff ? 1 : 0) << 5;
        r |= ((x >> r) > 0xffff ? 1 : 0) << 4;
        unchecked {
            return ((r >> 3) | ((x >> r) > 0xff ? 1 : 0)) + 1;
        }
    }
}
