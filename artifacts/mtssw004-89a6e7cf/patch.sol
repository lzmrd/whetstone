pragma solidity 0.8.35;

error ZeroHasNoBytes();

contract Candidate {
    function f(uint256 x) external pure returns (uint256 r) {
        if (x == 0) revert ZeroHasNoBytes();
        uint256 temp = x;
        r = 0;
        if (temp >> 128 > 0) { r += 16; temp >>= 128; }
        if (temp >> 64 > 0) { r += 8; temp >>= 64; }
        if (temp >> 32 > 0) { r += 4; temp >>= 32; }
        if (temp >> 16 > 0) { r += 2; temp >>= 16; }
        if (temp >> 8 > 0) { r += 1; temp >>= 8; }
        return r + 1;
    }
}
