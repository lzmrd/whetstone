// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// The BASELINE -- the number a model has to beat.
///
/// solady's `LibString.toHexString(address)`, with the SAME mutation M applied
/// by hand: the sixteen ASCII bytes it stores as its digit lookup are reversed,
/// which is the identical edit made to the constant on the other side. The
/// efficient code is still Vectorized's; only M is ours, and equivalence to the
/// candidate is machine-checked.
///
/// ⚠️ Never sent to a model. It is the denominator, not the task.
contract HexAddrBaseline {
    function f(uint256 x) external pure returns (string memory result) {
        assembly {
            let value := and(x, sub(shl(160, 1), 1))
            result := mload(0x40)
            mstore(0x40, add(result, 0x80))
            // "fedcba9876543210" -- the only edit against upstream.
            mstore(0x0f, 0x66656463626139383736353433323130)

            result := add(result, 2)
            mstore(result, 40)
            let o := add(result, 0x20)
            mstore(add(o, 40), 0)
            value := shl(96, value)
            for { let i := 0 } 1 {} {
                let p := add(o, add(i, i))
                let temp := byte(i, value)
                mstore8(add(p, 1), mload(and(temp, 15)))
                mstore8(p, mload(shr(4, temp)))
                i := add(i, 1)
                if eq(i, 20) { break }
            }
            let n := add(mload(result), 2)
            mstore(result, 0x3078)
            result := sub(result, 2)
            mstore(result, n)
        }
    }
}
