// SPDX-License-Identifier: MIT
//
// ⚠️ Written here, NOT copied from Uniswap. It implements the same behaviour as
// their VanityAddressLib.score (with this task's tariff mutation applied). See
// THIRD_PARTY_NOTICES.md for which files in this directory are transcriptions
// and which are not.
pragma solidity 0.8.35;

/// THE BASELINE -- the expert implementation the denominator is built from.
///
/// ⚠️ Never sent to a model. Its runtime hash is published in every receipt, so
/// nobody has to take our word that it was not shaped around a particular run.
///
/// ⚠️ Unlike the log256 and satmul baselines, this one is NOT a third party's:
/// there is no solady counterpart to `VanityAddressLib`, which is exactly what
/// D-07 said made the Uniswap track hard. It was written here, which means the
/// denominator is ours and the burden of showing it correct is ours too. That
/// is why the receipt reports the ABSOLUTE delta for this task and why the
/// equivalence evidence is stated rather than assumed.
///
/// Three costs in the task that this does not pay:
///   - the task reads one nibble at a time through a helper that does a
///     bounds-checked `bytes20` index, a division and a modulo, and calls it up
///     to 120 times per invocation;
///   - the leading-zero scan walks nibble by nibble, where `clz` answers it in
///     one opcode (EIP-7939, under our pinned `osaka` target);
///   - the digit sweep tests forty nibbles one at a time, where the whole word
///     can be tested at once.
contract VanityBaseline {
    // 40-nibble constants, written to 64 hex digits: a bare 40-digit literal is
    // an ADDRESS literal to solc, not a number.
    uint256 private constant FOURS = 0x0000000000000000000000004444444444444444444444444444444444444444;
    uint256 private constant ONES  = 0x0000000000000000000000001111111111111111111111111111111111111111;
    uint256 private constant LONIB = 0x0000000000000000000000000f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f;
    uint256 private constant ONES8 = 0x0000000000000000000000000101010101010101010101010101010101010101;

    function f(uint256 x) external pure returns (uint256 s) {
        uint256 a = uint256(uint160(x));

        assembly {
            // Leading zero NIBBLES: clz counts leading zero BITS over 256, of
            // which 96 are the zero-extension. a = 0 gives clz = 256 and hence
            // z = 40, and the loop below then yields c = 0 -- the same early
            // return the task takes.
            let z := shr(2, sub(clz(a), 96))

            // The leading run of 4s, starting where the zeros stopped. Reading
            // from the top, nibble k sits at bit 4*(39-k).
            let c := 0
            for {} lt(add(z, c), 40) {} {
                if iszero(eq(and(shr(shl(2, sub(39, add(z, c))), a), 0xf), 4)) { break }
                c := add(c, 1)
            }

            switch c
            case 0 { s := 0 }
            default {
                s := mul(z, 7)
                if eq(c, 4) { s := add(s, 50) }
                if gt(c, 4) { s := add(s, 30) }

                // ── the digit sweep, whole word at a time ──
                //
                // XOR turns every 4-nibble into a zero nibble. The zero nibbles
                // are then located WITHOUT the classic
                // (v - 0x111..) & ~v & 0x888.. trick, which is not
                // position-accurate: its borrow propagates, so a nibble of
                // value 1 sitting above a zero nibble is flagged too. ORing
                // each nibble down onto its own bit 0 cannot carry across a
                // boundary, and the mask discards what the shifts drag in from
                // the neighbour.
                let u := xor(a, FOURS)
                u := or(u, shr(1, u))
                u := or(u, shr(2, u))
                let t := and(not(u), ONES)          // 1 per nibble equal to 4

                // Fold nibbles into bytes (each <= 2), then sum the 20 bytes in
                // one multiply: byte 19 of the product is the total, and every
                // partial sum is <= 40, so nothing carries between fields.
                t := add(and(t, LONIB), and(shr(4, t), LONIB))
                s := add(s, shl(1, and(shr(152, mul(t, ONES8)), 0xff)))

                // The last two bytes both 0x44 -- the low 16 bits are 0x4444.
                if eq(and(a, 0xffff), 0x4444) { s := add(s, 25) }
            }
        }
    }
}
