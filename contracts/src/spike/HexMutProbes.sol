// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

// Does the 8 608 gas/call gap on toHexString(address) SURVIVE a mutation?
//
// ⚠️ Measured before the mutation is offered, not after. max/min looked like a
// target at 59 gas/call and became one at 9 once mutated; headroom before the
// mutation predicts nothing.
//
// The mutation here is a ROTATED DIGIT ALPHABET: "abcdef0123456789" instead of
// "0123456789abcdef". Both libraries build their digits from a single constant
// -- OpenZeppelin from `bytes16 HEX_DIGITS`, solady from one `mstore` of the
// same sixteen ASCII bytes -- so the same change lands on both sides as one
// token, and the algorithm underneath is untouched.

// ── The OZ side, transcribed into plain Solidity ──────────────────────────
contract OzHexAddrMut {
    bytes16 private constant ALPHABET = "abcdef0123456789";

    function f(uint256 x) external pure returns (string memory) {
        uint256 localValue = uint256(uint160(x));
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 41; i > 1; --i) {
            buffer[i] = ALPHABET[localValue & 0xf];
            localValue >>= 4;
        }
        return string(buffer);
    }
}

// ── The solady side, same change: one constant ────────────────────────────
contract SdHexAddrMut {
    function f(uint256 x) external pure returns (string memory result) {
        assembly {
            let value := and(x, sub(shl(160, 1), 1))
            result := mload(0x40)
            mstore(0x40, add(result, 0x80))
            // "abcdef0123456789" — the only edit against upstream.
            mstore(0x0f, 0x61626364656630313233343536373839)

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
