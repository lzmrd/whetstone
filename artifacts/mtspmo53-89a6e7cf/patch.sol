pragma solidity 0.8.35;

error ZeroHasNoBytes();

contract Candidate {
    function f(uint256 x) external pure returns (uint256) {
        if (x == 0) revert ZeroHasNoBytes();
        uint256 r = (x >> 128) > 0 ? 128 : 0;
        if (x >> r > 0xffffffffffffffff) r |= 64;
        if (x >> r > 0xffffffff) r |= 32;
        if (x >> r > 0xffff) r |= 16;
        return (r >> 3) + ((x >> r) > 0xff ? 1 : 0) + 1;
    }
}
