// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.35;

error ZeroHasNoBytes();

contract Candidate {
    function f(uint256 x) external pure returns (uint256 r) {
        if (x == 0) revert ZeroHasNoBytes();
        unchecked {
            uint256 n = 0;
            if (x >> 128 != 0) {
                x >>= 128;
                n += 16;
            }
            if (x >> 64 != 0) {
                x >>= 64;
                n += 8;
            }
            if (x >> 32 != 0) {
                x >>= 32;
                n += 4;
            }
            if (x >> 16 != 0) {
                x >>= 16;
                n += 2;
            }
            if (x >> 8 != 0) {
                n += 1;
            }
            r = n + 1;
        }
    }
}
