// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console} from "forge-std/Test.sol";
import {Scenario} from "./Scenario.sol";
import {GasMeter} from "./GasMeter.sol";
import {VanityOriginal} from "../src/tasks/vanity/Original.sol";
import {VanityCandidate} from "../src/tasks/vanity/Task.sol";
import {VanityBaseline} from "../src/tasks/vanity/Baseline.sol";
import {VanityTrivial} from "../src/tasks/vanity/Trivial.sol";

/// The four obligations of a task, checked on the committed scenario before the
/// task is allowed to exist.
///
/// ⚠️ The measurement that matters is the LAST one. `max`/`min` had 59 gas/call
/// of headroom unmutated and 9 after the mutation, and that collapse is only
/// visible after all four contracts exist. Headroom measured on the original
/// predicts nothing.
contract VanityTaskTest is Test {
    VanityOriginal o;
    VanityCandidate t;
    VanityBaseline b;
    VanityTrivial v;

    function setUp() public {
        o = new VanityOriginal();
        t = new VanityCandidate();
        b = new VanityBaseline();
        v = new VanityTrivial();
    }

    // ── proof 1: the baseline computes the task ────────────────────────────
    function test_proof1_baseline_equals_task_on_the_scenario() public view {
        uint256[] memory xs = Scenario.addresses();
        for (uint256 i = 0; i < xs.length; i++) {
            assertEq(b.f(xs[i]), t.f(xs[i]), "baseline diverges from the task");
        }
    }

    function testFuzz_proof1_baseline_equals_task(uint8 zRaw, uint8 cRaw, uint256 tail) public view {
        uint256 x = _mk(zRaw % 41, cRaw % (41 - (zRaw % 41)), tail);
        assertEq(b.f(x), t.f(x), "baseline diverges from the task under fuzzing");
    }

    function testFuzz_proof1_trailing_branch(uint8 zRaw, uint8 cRaw, uint256 tail) public view {
        uint256 z = zRaw % 41;
        uint256 c = cRaw % (41 - z);
        uint256 x = _mk(z, c, tail);
        if (z + c <= 36) x = (x & ~uint256(0xffff)) | 0x4444;
        assertEq(b.f(x), t.f(x), "baseline diverges on the trailing-0x4444 branch");
    }

    // ── proof 3: the trivial floor computes the task ───────────────────────
    function test_proof3_trivial_equals_task_on_the_scenario() public view {
        uint256[] memory xs = Scenario.addresses();
        for (uint256 i = 0; i < xs.length; i++) {
            assertEq(v.f(xs[i]), t.f(xs[i]), "the trivial floor is not equivalent -- the checks are NOT dead");
        }
    }

    function testFuzz_proof3_trivial_equals_task(uint8 zRaw, uint8 cRaw, uint256 tail) public view {
        uint256 x = _mk(zRaw % 41, cRaw % (41 - (zRaw % 41)), tail);
        assertEq(v.f(x), t.f(x), "the trivial floor diverges under fuzzing");
    }

    // ── proof 2 and 2b: the task is not the original ───────────────────────
    function test_proof2b_the_mutation_moves_the_scenario() public view {
        uint256[] memory xs = Scenario.addresses();
        uint256 moved;
        for (uint256 i = 0; i < xs.length; i++) if (t.f(xs[i]) != o.f(xs[i])) moved++;
        uint256 pct = (moved * 100) / xs.length;
        console.log("proof 2b: moved", moved, "of", xs.length);
        console.log("           percent", pct);
        assertGe(pct, 50, "proof 2b: the mutation does not move half the scenario");
    }

    // ── the measurement the task lives or dies on ──────────────────────────
    function test_headroom_after_the_mutation_against_the_trivial_floor() public view {
        uint256[] memory xs = Scenario.addresses();
        bytes memory cd = GasMeter.buffer(bytes4(keccak256("f(uint256)")));

        uint256 gt_;
        uint256 gb;
        uint256 gv;
        uint256 scored;

        for (uint256 i = 0; i < xs.length; i++) {
            GasMeter.setArg(cd, xs[i]);
            (bool okT, uint256 uT) = GasMeter.measure(address(t), cd);
            (bool okB, uint256 uB) = GasMeter.measure(address(b), cd);
            (bool okV, uint256 uV) = GasMeter.measure(address(v), cd);
            if (!okT || !okB || !okV) continue;
            gt_ += uT; gb += uB; gv += uV; scored++;
        }

        uint256 headroom = (gt_ - gb) / scored;
        uint256 floor_ = (gt_ - gv) / scored;

        console.log("scored inputs        ", scored);
        console.log("task     gas/call    ", gt_ / scored);
        console.log("baseline gas/call    ", gb / scored);
        console.log("trivial  gas/call    ", gv / scored);
        console.log("headroom gas/call    ", headroom);
        console.log("trivial floor gas/call", floor_);
        console.log("floor as percent of headroom", (floor_ * 100) / headroom);

        // A task whose one-word edit captures most of the headroom cannot tell
        // understanding from a reflex -- that is why log256 was a poor target.
        assertLt(floor_ * 4, headroom, "the trivial floor eats too much of the headroom");
    }

    function _mk(uint256 z, uint256 c, uint256 tail) internal pure returns (uint256 val) {
        uint256 rem = 40 - z - c;
        uint256 fours;
        for (uint256 i = 0; i < c; i++) fours = (fours << 4) | 4;
        uint256 mask = rem == 0 ? 0 : (uint256(1) << (4 * rem)) - 1;
        val = (tail & mask) | (fours << (4 * rem));
    }
}
