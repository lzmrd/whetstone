pragma solidity 0.8.35;

error ZeroHasNoBytes();

contract Candidate {
    function f(uint256 x) external pure returns (uint256 r) {
        if (x == 0) revert ZeroHasNoBytes();
        uint256 shift = 0;
        r = 1;
        if (x > 0xffffffffffffffffffffffffffffffff) {
            shift += 128;
            r += 16;
        }
        if (x >> shift > 0xffffffffffffffff) {
            shift += 64;
            r += 8;
        }
        if (x >> shift > 0xffffffff) {
            shift += 32;
            r += 4;
        }
        if (x >> shift > 0xffff) {
            shift += 16;
            r += 2;
        }
        if (x >> shift > 0xff) {
            r += 1;
        }
    }
}
