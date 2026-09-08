pragma solidity 0.8.35;

error ZeroHasNoBytes();

contract Candidate {
    function f(uint256 x) external pure returns (uint256 r) {
        if (x == 0) revert ZeroHasNoBytes();
        r = 1;
        if (x >> 128 > 0) {
            r += 16;
            x >>= 128;
        }
        if (x >> 64 > 0) {
            r += 8;
            x >>= 64;
        }
        if (x >> 32 > 0) {
            r += 4;
            x >>= 32;
        }
        if (x >> 16 > 0) {
            r += 2;
            x >>= 16;
        }
        if (x >> 8 > 0) {
            r += 1;
        }
        return r;
    }
}
