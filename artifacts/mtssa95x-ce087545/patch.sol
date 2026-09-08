// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

error ZeroHasNoBytes();

contract Candidate {
    function f(uint256 x) external pure returns (uint256 r) {
        if (x == 0) revert ZeroHasNoBytes();
        assembly {
            // Count leading zeros, then compute the number of bytes needed to represent x.
            // bitLen = 256 - clz(x)
            // bytes = ceil(bitLen / 8) = (bitLen + 7) / 8
            let lz := clz(x)
            r := div(add(sub(256, lz), 7), 8)
        }
    }
}
