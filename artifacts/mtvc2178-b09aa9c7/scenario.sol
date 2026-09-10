// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// Exhaustive boundary fixture set — the scenario identity goes into every receipt.
///
/// ⚠️ Why exhaustive rather than a hand-picked ten:
/// a model's patch can introduce input-dependence that our fixtures do not
/// see — an early exit for small values, a branch on a threshold. Cheap on a
/// sparse fixture set, expensive in the real domain. With a 66-gas denominator
/// a patch that saves 30 gas on the fixtures and costs 100 elsewhere would
/// score 45% and be a lie.
///
/// Covering every power-of-two boundary closes it for log-shaped functions:
/// these are exactly the points where the result changes.
library Scenario {
    /// Human-readable label. NOT the identity — see `digest()`.
    string internal constant NAME = "boundary/v1";

    /// 0, then 2**k and 2**k +/- 1 for k = 0..255, then max. Allocated generously, shrunk to fit.
    function inputs() internal pure returns (uint256[] memory xs) {
        xs = new uint256[](800);
        uint256 n;
        xs[n++] = 0;
        for (uint256 k = 0; k < 256; k++) {
            uint256 p = uint256(1) << k;
            xs[n++] = p;
            if (p > 1) xs[n++] = p - 1;
            unchecked {
                if (p + 1 != 0) xs[n++] = p + 1;
            }
        }
        xs[n++] = type(uint256).max;
        assembly { mstore(xs, n) }   // shrink to what was actually filled
    }

    /// ── Two-argument scenario ────────────────────────────────────────────
    ///
    /// ⚠️ A SECOND scenario, not a replacement. `boundary/v1` above is quoted in
    /// every receipt already published; changing it would silently re-scope
    /// numbers that are on chain. Its digest must stay exactly what it was.
    ///
    /// Same philosophy, one dimension up: pick the points where a two-argument
    /// arithmetic function changes behaviour, then take the FULL cross product
    /// rather than hand-picking pairs. For `saturatingMul` those points are the
    /// overflow frontier; for `max`/`min` they are the orderings; for
    /// `saturatingAdd` they are the carries. One vector covers all three
    /// because it covers the boundaries themselves, not a guess about which
    /// ones a given function cares about.
    string internal constant NAME_2 = "pairs/v1";

    /// The one-dimensional base set the cross product is built from.
    function points() internal pure returns (uint256[] memory vs) {
        uint8[18] memory ks = [0, 1, 2, 3, 4, 8, 16, 32, 63, 64, 96, 127, 128, 160, 192, 224, 254, 255];
        vs = new uint256[](2 * ks.length + 2);
        uint256 n;
        vs[n++] = 0;
        for (uint256 i = 0; i < ks.length; i++) {
            uint256 p = uint256(1) << ks[i];
            vs[n++] = p;
            vs[n++] = p - 1;          // ks[0] = 0 gives 1 and 0; the duplicate 0 is harmless
        }
        vs[n++] = type(uint256).max;
        assembly { mstore(vs, n) }
    }

    /// Every ordered pair from `points()`. Ordered, not unordered: `max(a,b)`
    /// and `min(a,b)` are symmetric but a patch need not be, and an asymmetric
    /// regression is exactly what the max-regression column exists to catch.
    function pairs() internal pure returns (uint256[] memory xs, uint256[] memory ys) {
        uint256[] memory vs = points();
        uint256 n = vs.length;
        xs = new uint256[](n * n);
        ys = new uint256[](n * n);
        uint256 k;
        for (uint256 i = 0; i < n; i++) {
            for (uint256 j = 0; j < n; j++) {
                xs[k] = vs[i];
                ys[k] = vs[j];
                k++;
            }
        }
    }

    function pairs2Len() internal pure returns (uint256) {
        (uint256[] memory xs,) = pairs();
        return xs.length;
    }

    /// Identity of the two-argument scenario. Same rule as `digest()`: it
    /// commits to the VECTOR, so "pairs/v1" cannot come to mean something else.
    function digest2() internal pure returns (bytes32) {
        (uint256[] memory xs, uint256[] memory ys) = pairs();
        return keccak256(abi.encode(xs, ys));
    }

    /// ── Address scenario ─────────────────────────────────────────────────
    ///
    /// ⚠️ A THIRD scenario, and the first that is not about arithmetic on a
    /// uint256. `boundary/v1` covers the powers of two because that is where a
    /// log-shaped function changes behaviour. The same reasoning applied to an
    /// address-SCORING function points somewhere else entirely: at runs of
    /// leading nibbles, at the density of one digit, and at the last two bytes.
    ///
    /// ⚠️ Why it had to exist rather than reusing `boundary/v1`. That fixture
    /// set collapses to 478 distinct addresses, and the target returns 0 down
    /// an early exit for about five sixths of them -- a power of two has a 4 as
    /// its first nonzero nibble only when k = 2 (mod 4). Two consequences, both
    /// fatal: the gas reading would mostly be the early exit rather than the
    /// function, and proof 2b -- which requires a mutation to move at least
    /// half the scenario -- could not pass for ANY mutation, because the part
    /// that scores zero scores zero before and after.
    ///
    /// ⚠️ What this scenario is NOT tuned to. The scoring family below is built
    /// around the digit 4 because that is the digit the FUNCTION branches on,
    /// exactly as `boundary/v1` is built around powers of two. It is not built
    /// around a mutation: the mutation chosen for this target deliberately
    /// leaves the digit alone, so that the population which scores at all is
    /// identical before and after. See manifest-vanity.json.
    string internal constant NAME_3 = "vanity/v1";

    /// `z` leading zero nibbles, then `c` nibbles of value `d`, then `tail`.
    /// Every address in this scenario is described by those four numbers, which
    /// is also how its coverage can be read off without running it.
    function _addr(uint256 z, uint256 c, uint256 d, uint256 tail) private pure returns (uint256 v) {
        uint256 rem = 40 - z - c;
        uint256 run;
        for (uint256 i = 0; i < c; i++) run = (run << 4) | d;
        uint256 mask = rem == 0 ? 0 : (uint256(1) << (4 * rem)) - 1;
        v = (tail & mask) | (run << (4 * rem));
    }

    function addresses() internal pure returns (uint256[] memory xs) {
        uint256[4] memory tails = [
            uint256(0x0000000000000000000000000123456789abcdef0123456789abcdef01234567),
            uint256(0x000000000000000000000000fedcba9876543210fedcba9876543210fedcba98),
            uint256(0x0000000000000000000000000000000000000000000000000000000000004444),
            uint256(0x0000000000000000000000004040404040404040404040404040404040404040)
        ];
        uint8[8] memory zs = [0, 1, 2, 3, 4, 6, 8, 12];   // leading zero nibbles
        uint8[6] memory cs = [1, 2, 3, 4, 5, 6];          // length of the leading run
        uint8[4] memory ds = [1, 2, 7, 15];               // a first nibble that is not 4

        xs = new uint256[](8 * 6 * 4 + 4 * 4 * 4 + 8);
        uint256 n;

        // Scoring family: a run of 4s after the leading zeros. Every one of
        // these contains at least one 4, so every one of them scores.
        for (uint256 i = 0; i < zs.length; i++) {
            for (uint256 j = 0; j < cs.length; j++) {
                for (uint256 t = 0; t < tails.length; t++) xs[n++] = _addr(zs[i], cs[j], 4, tails[t]);
            }
        }

        // Early-exit family: the first nonzero nibble is not a 4. The branch is
        // part of the function's behaviour and a scenario that omitted it would
        // measure only the expensive half.
        for (uint256 i = 0; i < 4; i++) {
            for (uint256 j = 0; j < ds.length; j++) {
                for (uint256 t = 0; t < tails.length; t++) xs[n++] = _addr(i, 1, ds[j], tails[t]);
            }
        }

        xs[n++] = 0;                          // every nibble zero -- the degenerate case
        xs[n++] = _addr(0, 40, 4, 0);         // every nibble a 4
        xs[n++] = _addr(0, 40, 15, 0);        // every nibble an f
        xs[n++] = _addr(0, 4, 4, 0x4444);     // exactly four, plus the trailing bonus
        xs[n++] = _addr(0, 5, 4, 0x4444);     // more than four, plus the trailing bonus
        xs[n++] = _addr(8, 4, 4, 0x4444);     // leading zeros, exactly four, trailing bonus
        xs[n++] = _addr(36, 4, 4, 0);         // the run at the very end of the address
        xs[n++] = uint256(type(uint160).max); // every nibble an f, the other way round
        assembly { mstore(xs, n) }
    }

    /// Identity of the address scenario. Same rule as the other two: it commits
    /// to the VECTOR, so the label cannot come to mean something else.
    function digest3() internal pure returns (bytes32) {
        return keccak256(abi.encode(addresses()));
    }

    /// The scenario's identity, and what `scenario_id` in the receipt must carry.
    ///
    /// ⚠️ A NAME BINDS NOTHING. "boundary/v1" would stay identical while the
    /// vector underneath it changed, so two runs could claim the same scenario
    /// and have been scored on different inputs — which is exactly the
    /// fixture-overfitting hole the exhaustive set was built to close.
    ///
    /// Hashing the *vector* rather than the source file is deliberate: it is
    /// invariant under comment and formatting edits, and it commits to exactly
    /// the values every measurement ran on, nothing else.
    function digest() internal pure returns (bytes32) {
        return keccak256(abi.encode(inputs()));
    }
}
