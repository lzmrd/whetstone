// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.35;

error ZeroHasNoBytes();

contract Candidate {
    function f(uint256 x) external pure returns (uint256 r) {
        if (x == 0) revert ZeroHasNoBytes();
        assembly {
            // Count leading zeros (clz) in the 256‑bit word.
            // Number of bits needed = 256 - clz(x)
            // Number of bytes needed = (bits + 7) / 8
            // => (256 - clz(x) + 7) / 8 = (263 - clz(x)) / 8
            let lz := clz(x)
            r := div(sub(263, lz), 8)
        }
    }
}
