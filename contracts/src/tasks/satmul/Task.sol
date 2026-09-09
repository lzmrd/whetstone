// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// The task. Comments are stripped before this reaches a model.
///
/// The mutation M, applied by hand to this side and to the baseline identically:
///
///   the result is HALVED — the saturating product divided by two, rounding
///   down — so a memorised `saturatingMul` is wrong on 1 296 of the 1 444
///   committed pairs (89.8%).
///
/// ⚠️ Chosen by the builder, not by the model, from five candidates presented
/// with their measured divergence. Two of the five were refused by proof 2b
/// before anyone wrote code: changing only the overflow behaviour moves 29.5%
/// of the scenario, because only 426 of the 1 444 pairs overflow at all.
///
/// ⚠️ Chosen also for what it does NOT do. A shift carries no overflow check in
/// either Solidity or assembly, so M costs the same on both sides. The rejected
/// alternative added 1 to each operand, which is checked in Solidity and
/// unchecked in assembly — the asymmetry that put 24% of the denominator of the
/// log256 task inside the mutation itself (Addendum 10).
contract SatMulCandidate {
    function f(uint256 a, uint256 b) external pure returns (uint256) {
        unchecked {
            uint256 c = a * b;
            bool success = (a == 0) || (c / a == b);
            uint256 result = c * (success ? 1 : 0);
            uint256 m = type(uint256).max;
            return (m ^ ((result ^ m) * (success ? 1 : 0))) >> 1;
        }
    }
}
