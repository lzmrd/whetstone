// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.35;

error ZeroHasNoBytes();

contract Candidate {
    function f(uint256 x) external pure returns (uint256 r) {
        if (x == 0) revert ZeroHasNoBytes();
        uint256 lz;
        assembly { lz := clz(x) } // count leading zeros (0..255)
        // Number of bytes = ceil((256 - lz) / 8) = (256 - lz + 7) / 8
        r = (256 - lz + 7) / 8;
    }
}
