// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// The UNMUTATED function, kept only so proof 2 has something to refute against.
///
/// ⚠️ NEVER sent to a model. If a model saw this next to the task it could diff
/// them, recover the mutation, and the anti-memorisation defence would be gone.
/// The redaction gate in harness/src/prompt.mjs only ever reads the task file.
contract Original {
    function f(uint256 x) external pure returns (uint256 r) {
        r = (x > 0xffffffffffffffffffffffffffffffff ? 1 : 0) << 7;
        r |= ((x >> r) > 0xffffffffffffffff ? 1 : 0) << 6;
        r |= ((x >> r) > 0xffffffff ? 1 : 0) << 5;
        r |= ((x >> r) > 0xffff ? 1 : 0) << 4;
        return (r >> 3) | ((x >> r) > 0xff ? 1 : 0);
    }
}
