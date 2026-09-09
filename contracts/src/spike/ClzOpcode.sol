// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

// Does the Osaka CLZ opcode make the clz target trivial? If one instruction
// beats the expert baseline, the target measures knowledge of an opcode rather
// than optimisation, which is D-15 at full strength.
contract ClzOpcode {
    function f(uint256 x) external pure returns (uint256 r) {
        assembly { r := clz(x) }
    }
}
