// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// THE TRIVIAL FLOOR — the task with one dead sub-expression deleted.
///
/// ⚠️ Not part of the task and never sent to a model. It answers the question a
/// percentage cannot: **did the model do better than a mechanical deletion?**
///
/// The task computes `result = c * (success ? 1 : 0)` and then immediately
/// selects between `result` and `max` on that same `success`. When `success` is
/// false the multiplication produces 0 and the value is discarded; when it is
/// true it multiplies by 1. The factor can never change the output, so
/// `result = c` is identical — a deletion requiring no understanding of what
/// saturating multiplication is.
///
/// ⚠️ `hevm(Trivial ≡ Candidate)` must PASS. If it fails, the sub-expression is
/// NOT dead, those gas are buying real behaviour, and this reference is wrong.
contract SatMulTrivial {
    function f(uint256 a, uint256 b) external pure returns (uint256) {
        unchecked {
            uint256 c = a * b;
            bool success = (a == 0) || (c / a == b);
            uint256 result = c;
            uint256 m = type(uint256).max;
            return (m ^ ((result ^ m) * (success ? 1 : 0))) >> 1;
        }
    }
}
