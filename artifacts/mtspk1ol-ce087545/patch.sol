// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.35;

error ZeroHasNoBytes();

contract Candidate {
    function f(uint256 x) external pure returns (uint256 r) {
        if (x == 0) revert ZeroHasNoBytes();

        unchecked {
            r = 1; // at least one byte
            if (x >> 128 != 0) {
                x >>= 128;
                r += 16;
            }
            if (x >> 64 != 0) {
                x >>= 64;
                r += 8;
            }
            if (x >> 32 != 0) {
                x >>= 32;
                r += 4;
            }
            if (x >> 16 != 0) {
                x >>= 16;
                r += 2;
            }
            if (x >> 8 != 0) {
                r += 1;
            }
        }
    }
}
