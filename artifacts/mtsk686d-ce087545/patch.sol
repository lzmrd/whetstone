// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.35;

error ZeroHasNoBytes();

contract Candidate {
    function f(uint256 x) external pure returns (uint256 r) {
        if (x == 0) revert ZeroHasNoBytes();

        unchecked {
            uint256 n = 0;
            if (x >> 128 != 0) {
                n += 16;
                x >>= 128;
            }
            if (x >> 64 != 0) {
                n += 8;
                x >>= 64;
            }
            if (x >> 32 != 0) {
                n += 4;
                x >>= 32;
            }
            if (x >> 16 != 0) {
                n += 2;
                x >>= 16;
            }
            if (x >> 8 != 0) {
                n += 1;
            }
            r = n + 1;
        }
    }
}
