// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console} from "forge-std/Test.sol";
import {UniVanity, UniVanityFast} from "../src/spike/uniswap/VanityProbes.sol";

/// TRIAGE for the Uniswap candidate. Answers two questions and nothing else:
/// does the expert rewrite compute the same thing, and is the gap big enough
/// to be worth a task?
///
/// ⚠️ The input vector is built in the ADDRESS domain, not from `boundary/v1`.
/// `score` early-returns 0 unless the first nonzero nibble is a 4, and the
/// powers-of-two fixture set hits that case only about one time in four -- so
/// measuring this function on `boundary/v1` would mostly be measuring the
/// early exit. That is a finding about the scenario, recorded here because it
/// decides whether a new one has to exist.
contract VanitySweepTest is Test {
    UniVanity a;
    UniVanityFast b;

    function setUp() public {
        a = new UniVanity();
        b = new UniVanityFast();
    }

    /// Address with `z` leading zero nibbles, then `c` nibbles of 4, then tail.
    function _mk(uint256 z, uint256 c, uint256 tail) internal pure returns (uint256 v) {
        uint256 rem = 40 - z - c;
        uint256 fours;
        for (uint256 i = 0; i < c; i++) fours = (fours << 4) | 4;
        uint256 mask = rem == 0 ? 0 : (uint256(1) << (4 * rem)) - 1;
        v = (tail & mask) | (fours << (4 * rem));
    }

    function _vector() internal pure returns (uint256[] memory xs) {
        uint256[] memory tails = new uint256[](4);
        tails[0] = 0x000000000000000000000000123456789abcdef0123456789abcdef012345678;
        tails[1] = 0x0000000000000000000000000444444444444444444444444444444444444444;
        tails[2] = 0x0000000000000000000000000000000000000000000000000000000000004444;
        tails[3] = 0x000000000000000000000000fedcba9876543210fedcba9876543210fedcba98;

        xs = new uint256[](8 * 7 * 4 + 4);
        uint256 n;
        for (uint256 z = 0; z < 8; z++) {
            for (uint256 c = 0; c < 7; c++) {
                for (uint256 t = 0; t < 4; t++) xs[n++] = _mk(z, c, tails[t]);
            }
        }
        xs[n++] = 0;
        xs[n++] = type(uint256).max;
        xs[n++] = uint256(uint160(type(uint160).max));
        xs[n++] = 0x00000000000000000000000004444444444444444444444444444444444444444;
        assembly { mstore(xs, n) }
    }

    function _measure(address t, bytes memory cd) internal view returns (bool ok, uint256 used) {
        assembly {
            let p := add(cd, 0x20)
            let n := mload(cd)
            let g0 := gas()
            ok := staticcall(gas(), t, p, n, 0, 0)
            used := sub(g0, gas())
        }
    }

    function test_the_rewrite_computes_the_same_score() public view {
        uint256[] memory xs = _vector();
        for (uint256 i = 0; i < xs.length; i++) {
            assertEq(b.f(xs[i]), a.f(xs[i]), "rewrite diverges on the fixed vector");
        }
    }

    function testFuzz_the_rewrite_computes_the_same_score(uint256 x) public view {
        assertEq(b.f(x), a.f(x), "rewrite diverges under fuzzing");
    }

    /// ⚠️ The unstructured fuzz above is WEAK on this function: a random
    /// 256-bit word truncates to a random address, whose first nonzero nibble
    /// is a 4 about one time in sixteen, so nearly every run returns 0 down the
    /// early-exit path. This one generates addresses in the domain the function
    /// actually branches on -- leading zeros, then leading fours, then a tail --
    /// so the scoring body is what is being compared.
    function testFuzz_structured(uint8 zRaw, uint8 cRaw, uint256 tail) public view {
        uint256 z = zRaw % 41;
        uint256 c = cRaw % (41 - z);
        uint256 x = _mk(z, c, tail);
        assertEq(b.f(x), a.f(x), "rewrite diverges inside the scoring body");
    }

    /// ⚠️ The +20 bonus for a trailing 0x4444 is NOT reachable by the fuzzers
    /// above in any useful quantity: it needs the low 16 bits to be exactly
    /// 0x4444, which a random tail hits once in 65 536 -- about 0.3 times in a
    /// 20 000-run campaign. A branch worth 20 points was therefore being
    /// declared "fuzzed" while being executed essentially never. This campaign
    /// forces it on every run.
    function testFuzz_trailing_bonus(uint8 zRaw, uint8 cRaw, uint256 tail) public view {
        uint256 z = zRaw % 41;
        uint256 c = cRaw % (41 - z);
        uint256 x = _mk(z, c, tail);
        if (z + c <= 36) x = (x & ~uint256(0xffff)) | 0x4444;   // last two bytes = 0x44 0x44
        assertEq(b.f(x), a.f(x), "rewrite diverges on the trailing-0x4444 branch");
    }

    /// The same, one nibble off, so the branch is exercised on BOTH sides.
    function testFuzz_trailing_near_miss(uint8 zRaw, uint8 cRaw, uint256 tail) public view {
        uint256 z = zRaw % 41;
        uint256 c = cRaw % (41 - z);
        uint256 x = _mk(z, c, tail);
        if (z + c <= 36) x = (x & ~uint256(0xffff)) | 0x4445;
        assertEq(b.f(x), a.f(x), "rewrite diverges next to the trailing-0x4444 branch");
    }

    /// Both orderings, because a one-sided reading is how the first two
    /// instruments in this project produced numbers that were wrong.
    function test_headroom() public view {
        uint256[] memory xs = _vector();

        (uint256 a1, uint256 b1, uint256 scored) = _pass(xs, false);
        (uint256 a2, uint256 b2,) = _pass(xs, true);

        uint256 nonZero;
        for (uint256 i = 0; i < xs.length; i++) if (a.f(xs[i]) != 0) nonZero++;

        console.log("inputs scored", scored, "of which non-zero score", nonZero);
        console.log("order original-first  original", a1, "expert", b1);
        console.log("order expert-first    original", a2, "expert", b2);
        console.log("bias original", a1 > a2 ? a1 - a2 : a2 - a1);
        console.log("bias expert  ", b1 > b2 ? b1 - b2 : b2 - b1);
        console.log("gas/call original", a1 / scored);
        console.log("gas/call expert  ", b1 / scored);
        console.log("headroom gas/call", (a1 - b1) / scored);
    }

    function _pass(uint256[] memory xs, bool expertFirst)
        internal view returns (uint256 sA, uint256 sB, uint256 scored)
    {
        bytes memory cd = new bytes(36);
        bytes4 sel = bytes4(keccak256("f(uint256)"));
        assembly { mstore(add(cd, 0x20), sel) }

        for (uint256 i = 0; i < xs.length; i++) {
            assembly { mstore(add(cd, 0x24), mload(add(xs, mul(0x20, add(i, 1))))) }
            (bool okA, uint256 uA, bool okB, uint256 uB) = _both(cd, expertFirst);
            if (!okA || !okB) continue;
            sA += uA;
            sB += uB;
            scored++;
        }
    }

    function _both(bytes memory cd, bool expertFirst)
        internal view returns (bool okA, uint256 uA, bool okB, uint256 uB)
    {
        if (expertFirst) {
            (okB, uB) = _measure(address(b), cd);
            (okA, uA) = _measure(address(a), cd);
        } else {
            (okA, uA) = _measure(address(a), cd);
            (okB, uB) = _measure(address(b), cd);
        }
    }

    /// ⚠️ What the headroom is worth on a workload nobody curated.
    ///
    /// `test_headroom` measures a vector in which 210 of 228 inputs actually
    /// score. A real caller -- an address miner -- feeds mostly RANDOM
    /// candidates, and a random address takes the early exit about fifteen
    /// times in sixteen. The early exit is cheap in BOTH versions, so the
    /// average gap there is a different number, and quoting the curated one as
    /// if it were this one would be the oversell we said we would not do.
    function test_headroom_on_random_addresses() public view {
        uint256[] memory xs = new uint256[](512);
        uint256 nonZero;
        for (uint256 i = 0; i < xs.length; i++) {
            xs[i] = uint256(uint160(uint256(keccak256(abi.encode(i)))));
            if (a.f(xs[i]) != 0) nonZero++;
        }

        (uint256 a1, uint256 b1, uint256 scored) = _pass(xs, false);
        console.log("random addresses", scored, "of which score non-zero", nonZero);
        console.log("gas/call original", a1 / scored);
        console.log("gas/call expert  ", b1 / scored);
        console.log("headroom gas/call", (a1 - b1) / scored);
    }

    /// EXHAUSTIVE over the control flow, not sampled.
    ///
    /// Every reachable (leading zeros, leading fours) pair -- all 861 of them,
    /// z + c <= 40 -- against three tails. Fuzzing samples this plane; this
    /// covers it. What stays sampled is the count of 4s in the tail, which is
    /// the dimension the 80 000 fuzz runs already hammer, and the one the
    /// rewrite handles with a single branch-free expression rather than a
    /// branch per nibble.
    function test_exhaustive_over_the_branch_structure() public view {
        uint256[3] memory tails = [
            uint256(0x0000000000000000000000000123456789abcdef0123456789abcdef01234567),
            uint256(0x000000000000000000000000fedcba9876543210fedcba9876543210fedcba98),
            uint256(0x0000000000000000000000000000000000000000000000000000000000004444)
        ];

        uint256 checked;
        for (uint256 z = 0; z <= 40; z++) {
            for (uint256 c = 0; c + z <= 40; c++) {
                for (uint256 t = 0; t < 3; t++) {
                    uint256 x = _mk(z, c, tails[t]);
                    assertEq(b.f(x), a.f(x), "rewrite diverges on the (zeros, fours) plane");
                    checked++;
                }
            }
        }
        console.log("exhaustive (zeros x fours x tail) comparisons", checked);
    }
}
