// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// TRIAGE probes for the Uniswap Foundation track. Not a task, not scored.
///
/// Source: Uniswap/v4-periphery, src/libraries/VanityAddressLib.sol, MIT,
/// pinned at commit e75fd8878c70d18234cdf9d0bfeeae6e16713037.
/// The file has NO imports -- it is self-contained, which is why it can be
/// transcribed here without dragging in v4-core (BUSL-1.1, and out of scope
/// by D-07).
///
/// ⚠️ The question these two answer is the only one that matters right now:
/// is there enough gas between the library as written and an expert rewrite
/// for a model to contend for? Everything else -- mutation, baseline, proofs,
/// scenario -- is wasted work if the answer is no.

/// Faithful transcription of `VanityAddressLib.score`, exposed as `f(uint256)`
/// so the existing one-argument instrument can measure it. The truncation to
/// 160 bits is the same convention already documented for the hexaddr task.
contract UniVanity {
    function f(uint256 x) external pure returns (uint256) {
        return _score(address(uint160(x)));
    }

    function _score(address addr) internal pure returns (uint256 calculatedScore) {
        bytes20 addrBytes = bytes20(addr);

        unchecked {
            uint256 leadingZeroCount = _getLeadingNibbleCount(addrBytes, 0, 0);
            calculatedScore += (leadingZeroCount * 10);

            uint256 leadingFourCount = _getLeadingNibbleCount(addrBytes, leadingZeroCount, 4);
            if (leadingFourCount == 0) {
                return 0;
            } else if (leadingFourCount == 4) {
                calculatedScore += 60;
            } else if (leadingFourCount > 4) {
                calculatedScore += 40;
            }

            for (uint256 i = 0; i < addrBytes.length * 2; i++) {
                uint8 currentNibble = _getNibble(addrBytes, i);
                if (currentNibble == 4) {
                    calculatedScore += 1;
                }
            }

            if (addrBytes[18] == 0x44 && addrBytes[19] == 0x44) {
                calculatedScore += 20;
            }
        }
    }

    function _getLeadingNibbleCount(bytes20 addrBytes, uint256 startIndex, uint8 comparison)
        internal pure returns (uint256 count)
    {
        if (startIndex >= addrBytes.length * 2) {
            return count;
        }
        for (uint256 i = startIndex; i < addrBytes.length * 2; i++) {
            uint8 currentNibble = _getNibble(addrBytes, i);
            if (currentNibble != comparison) {
                return count;
            }
            count += 1;
        }
    }

    function _getNibble(bytes20 input, uint256 nibbleIndex) internal pure returns (uint8 currentNibble) {
        uint8 currByte = uint8(input[nibbleIndex / 2]);
        if (nibbleIndex % 2 == 0) {
            currentNibble = currByte >> 4;
        } else {
            currentNibble = currByte & 0x0F;
        }
    }
}

/// The expert rewrite -- what the headroom is measured AGAINST.
///
/// Three things the original pays for and this does not:
///   - `_getNibble` is called up to 120 times per call (two leading scans plus
///     the 40-nibble sweep), and each call does a bounds-checked `bytes20`
///     index, a division and a modulo;
///   - the leading-zero scan walks nibble by nibble, when `clz` answers it in
///     one opcode (EIP-7939, available under our pinned `osaka` target);
///   - the 40-nibble sweep counts one nibble at a time, when the whole word
///     can be tested at once.
contract UniVanityFast {
    // 40-nibble constants, written to 64 hex digits: a bare 40-digit literal is
    // an ADDRESS literal to solc, not a number.
    uint256 private constant FOURS  = 0x0000000000000000000000004444444444444444444444444444444444444444;
    uint256 private constant ONES   = 0x0000000000000000000000001111111111111111111111111111111111111111;
    uint256 private constant LONIB  = 0x0000000000000000000000000f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f;
    uint256 private constant ONES8  = 0x0000000000000000000000000101010101010101010101010101010101010101;

    function f(uint256 x) external pure returns (uint256 s) {
        uint256 a = uint256(uint160(x));

        assembly {
            // Leading zero NIBBLES of the 160-bit value: clz counts leading
            // zero bits over 256, of which 96 are the zero-extension. a = 0
            // gives clz = 256, hence z = 40, and the loop below then yields
            // c = 0 -- the same early return the original takes.
            let z := shr(2, sub(clz(a), 96))

            // Leading 4s, starting where the zeros stopped. Reading from the
            // top: nibble k sits at bit 4*(39-k).
            let c := 0
            for {} lt(add(z, c), 40) {} {
                if iszero(eq(and(shr(shl(2, sub(39, add(z, c))), a), 0xf), 4)) { break }
                c := add(c, 1)
            }

            switch c
            case 0 { s := 0 }
            default {
                s := mul(z, 10)
                if eq(c, 4) { s := add(s, 60) }
                if gt(c, 4) { s := add(s, 40) }

                // ── count the nibbles equal to 4, whole word at a time ──
                //
                // XOR turns every 4-nibble into a zero nibble. The zero nibbles
                // are then found WITHOUT the classic (v - 0x111..) & ~v & 0x888..
                // trick, which is not position-accurate: its borrow propagates,
                // so a nibble of value 1 sitting above a zero nibble is flagged
                // too. ORing each nibble down onto its own bit 0 cannot carry
                // across a boundary, and the mask discards what the shifts drag
                // in from the neighbour.
                let u := xor(a, FOURS)
                u := or(u, shr(1, u))
                u := or(u, shr(2, u))
                let t := and(not(u), ONES)          // 1 per nibble equal to 4

                // Fold nibbles into bytes (each <= 2), then sum the 20 bytes in
                // one multiply: the byte at position 19 of the product is the
                // total, and every partial sum is <= 40, so nothing carries.
                t := add(and(t, LONIB), and(shr(4, t), LONIB))
                s := add(s, and(shr(152, mul(t, ONES8)), 0xff))

                // The last two bytes both 0x44 -- the low 16 bits are 0x4444.
                if eq(and(a, 0xffff), 0x4444) { s := add(s, 20) }
            }
        }
    }
}
