// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// The measuring instrument, isolated so it has one definition and one place
/// where its known failure modes are recorded.
///
/// ⚠️ THIS IS THE THIRD INSTRUMENT. The first two were both biased, and both
/// produced numbers that were written into the spec before the bias was found:
///
///   1. `gasleft()` around INLINED INTERNAL calls. Unstable under unrelated
///      edits — log256 read 27, then 39, then 66 gas/call purely because
///      imports were added to the test file. Discarded on day 1.
///
///   2. Two separate loops, one per contract, using Solidity's `.staticcall`.
///      Two compounding memory faults: memory is not reset between internal
///      calls, so the contract measured SECOND paid memory expansion at a much
///      higher offset where the quadratic term dominates; and `.staticcall`
///      copies returndata into memory, so memory grew between the two calls
///      even inside a paired loop. Measured bias: 5 038 gas over 769 inputs on
///      log256 — about 10% of the delta being reported — detected by running
///      the same comparison in both orders (contracts/test/OrderControl.t.sol).
///
/// This one holds memory completely still:
///   - the calldata buffer is allocated ONCE, before the loop, and the
///     argument word is overwritten in place;
///   - the call is raw assembly with outsize = 0, so no returndata is copied.
/// Nothing either contract does can move the free memory pointer between the
/// two measurements, so the delta is a property of the code under test.
///
/// The order control is part of the suite, not a one-off: any future change to
/// this file must keep both orderings agreeing.
library GasMeter {
    /// Reusable 4 + 32 byte calldata buffer for `f(uint256)`.
    function buffer(bytes4 sel) internal pure returns (bytes memory cd) {
        cd = new bytes(36);
        assembly { mstore(add(cd, 0x20), sel) }
    }

    function setArg(bytes memory cd, uint256 x) internal pure {
        assembly { mstore(add(cd, 0x24), x) }
    }

    /// Gas consumed by one staticcall to `target`. No memory is written.
    function measure(address target, bytes memory cd)
        internal view returns (bool ok, uint256 used)
    {
        assembly {
            let p := add(cd, 0x20)
            let n := mload(cd)
            let g0 := gas()
            ok := staticcall(gas(), target, p, n, 0, 0)
            used := sub(g0, gas())
        }
    }
}
