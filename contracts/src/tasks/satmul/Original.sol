// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// The UNMUTATED function, kept only so proof 2 has something to refute against.
///
/// A faithful transcription of OpenZeppelin's `Math.saturatingMul` — `tryMul`
/// followed by the branchless `ternary` — into plain Solidity, so the task can
/// be handed to a model without naming its source.
///
/// ⚠️ `a == 0` is tested FIRST and Solidity's `||` short-circuits. Upstream runs
/// the division in assembly, where dividing by zero yields zero instead of
/// reverting; written straight into Solidity the same expression would panic on
/// `a == 0`. Same behaviour, reached differently, and `hevm(Original ≡ upstream)`
/// is checked rather than assumed.
///
/// ⚠️ NEVER sent to a model.
contract SatMulOriginal {
    function f(uint256 a, uint256 b) external pure returns (uint256) {
        unchecked {
            uint256 c = a * b;
            bool success = (a == 0) || (c / a == b);
            uint256 result = c * (success ? 1 : 0);
            uint256 m = type(uint256).max;
            return m ^ ((result ^ m) * (success ? 1 : 0));
        }
    }
}
