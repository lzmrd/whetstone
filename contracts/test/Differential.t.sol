// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console} from "forge-std/Test.sol";
import {Scenario} from "./Scenario.sol";

/// Gates 1 and 2 of §7, on a model's patch against the task it was given.
///
/// ⚠️ GATE 2 DID NOT EXIST until now, so `FUZZED` was an unreachable label and
/// the four-label vocabulary could print two. It also stranded `toHexString` —
/// 7 703 gas/call of headroom against `log256`'s 66 — because hevm does not
/// terminate on it and `FUZZED` was the only label it could have earned.
///
/// ⚠️ Gate 1 previously compared only success/failure. Two functions can agree on
/// *whether* they revert and disagree on every value they return, so it was
/// checking the weaker half of the property. Both gates now compare the FULL
/// return buffer, which covers return bytes and revert data in one equality:
/// a low-level call hands back the revert payload as returndata, so
/// `Panic(0x11)` and `FullMulDivFailed()` are different bytes and fail the check.
///
/// Runs from the harness with TASK_HEX / PATCH_HEX, like PatchGas.t.sol.
contract DifferentialTest is Test {
    bytes4 constant SEL = bytes4(keccak256("f(uint256)"));
    address constant TASK = address(uint160(uint256(keccak256("whetstone.task"))));
    address constant PATCH = address(uint160(uint256(keccak256("whetstone.patch"))));

    bool internal loaded;

    function setUp() public {
        string memory p = vm.envOr("TASK_HEX", string(""));
        if (bytes(p).length == 0) return;
        vm.etch(TASK, vm.parseBytes(string.concat("0x", vm.readFile(p))));
        vm.etch(PATCH, vm.parseBytes(string.concat("0x", vm.readFile(vm.envString("PATCH_HEX")))));
        loaded = true;
    }

    /// Both sides on one input, compared in full.
    function _agree(uint256 x) internal view returns (bool ok, bytes memory a, bytes memory b) {
        bytes memory cd = abi.encodeWithSelector(SEL, x);
        (bool okA, bytes memory retA) = TASK.staticcall(cd);
        (bool okB, bytes memory retB) = PATCH.staticcall(cd);
        ok = (okA == okB) && (keccak256(retA) == keccak256(retB));
        a = retA;
        b = retB;
    }

    /// GATE 1 — known behaviour: the committed scenario, every input, full buffer.
    function test_gate1_scenario_behaviour() public view {
        if (!loaded) return;
        uint256[] memory xs = Scenario.inputs();
        for (uint256 i = 0; i < xs.length; i++) {
            (bool ok, bytes memory a, bytes memory b) = _agree(xs[i]);
            if (!ok) {
                console.log("GATE1 DIVERGENCE at input:", xs[i]);
                console.logBytes(a);
                console.logBytes(b);
                revert("gate 1: patch diverges from task on the committed scenario");
            }
        }
        console.log("WHETSTONE_GATE1 inputs", xs.length);
    }

    /// GATE 2 — differential fuzzing over the whole 256-bit domain.
    ///
    /// ⚠️ This is NOT a proof and must never be reported as one. It is evidence
    /// whose strength is exactly the campaign that produced it, which is why the
    /// run count and seed are pinned in foundry.toml and copied into the receipt.
    ///
    /// Verified against three deliberately broken patches, 20 000 runs each:
    ///   wrong everywhere            -> caught by BOTH gates, immediately
    ///   wrong on one magic constant -> gate 1 MISSED it, gate 2 caught it at run
    ///                                  2 415. Not by luck: Foundry seeds the fuzz
    ///                                  dictionary with constants lifted out of the
    ///                                  bytecode, so the literal betrayed itself.
    ///   wrong on a structural
    ///   condition, no literal       -> caught by both — but only because the
    ///                                  condition happened to hold for
    ///                                  type(uint256).max, which is in the scenario
    ///                                  AND is a standard fuzzer boundary value.
    ///
    /// ⚠️ So a divergence that fuzzing cannot reach was NOT exhibited here. Two
    /// attempts to build one were both caught, the second because the example was
    /// badly chosen rather than because no such divergence exists. The gap between
    /// FUZZED and FORMAL remains a matter of what the two methods do — sampling
    /// versus quantification — and is not demonstrated by an example in this repo.
    /// `toHexString` is where it will bite in practice: hevm does not terminate on
    /// it, so FUZZED is the strongest label available for the highest-headroom
    /// target we have.
    function testFuzz_gate2_differential(uint256 x) public view {
        if (!loaded) return;
        (bool ok, bytes memory a, bytes memory b) = _agree(x);
        if (!ok) {
            console.log("GATE2 DIVERGENCE at input:", x);
            console.logBytes(a);
            console.logBytes(b);
            revert("gate 2: patch diverges from task under fuzzing");
        }
    }
}
