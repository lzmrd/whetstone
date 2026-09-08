// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.35;

error ZeroHasNoBytes();

contract Candidate {
    function f(uint256 x) external pure returns (uint256) {
        if (x == 0) revert ZeroHasNoBytes();

        uint256 b = 0;
        if (x > type(uint128).max) {
            b += 16;
            x >>= 128;
        }
        if (x > type(uint64).max) {
            b += 8;
            x >>= 64;
        }
        if (x > type(uint32).max) {
            b += 4;
            x >>= 32;
        }
        if (x > type(uint16).max) {
            b += 2;
            x >>= 16;
        }
        if (x > type(uint8).max) {
            b += 1;
        }
        return b + 1;
    }
}
