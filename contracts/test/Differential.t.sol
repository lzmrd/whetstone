// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console} from "forge-std/Test.sol";
import {Scenario} from "./Scenario.sol";
import {Plan} from "./Plan.sol";

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
    /// ⚠️ Was a constant, and that made every gate below single-argument. The
    /// signature travels with the run now, exactly as it does in the receipt.
    function _plan() internal view returns (Plan.Spec memory) {
        return Plan.forSig(vm.envOr("TASK_SIG", string("f(uint256)")));
    }

    /// Calldata for the i-th point of the committed scenario.
    function _cdAt(Plan.Spec memory p, uint256 i) internal pure returns (bytes memory) {
        return p.arity == 1
            ? abi.encodeWithSelector(p.sel, p.xs[i])
            : abi.encodeWithSelector(p.sel, p.xs[i], p.ys[i]);
    }
    address constant TASK = address(uint160(uint256(keccak256("whetstone.task"))));
    address constant PATCH = address(uint160(uint256(keccak256("whetstone.patch"))));
    address constant ORIGINAL = address(uint160(uint256(keccak256("whetstone.original"))));

    bool internal loaded;
    bool internal hasOriginal;

    function setUp() public {
        string memory p = vm.envOr("TASK_HEX", string(""));
        if (bytes(p).length == 0) return;
        vm.etch(TASK, vm.parseBytes(string.concat("0x", vm.readFile(p))));
        string memory o = vm.envOr("ORIGINAL_HEX", string(""));
        if (bytes(o).length != 0) {
            vm.etch(ORIGINAL, vm.parseBytes(string.concat("0x", vm.readFile(o))));
            hasOriginal = true;
        }
        string memory q = vm.envOr("PATCH_HEX", string(""));
        if (bytes(q).length == 0) return;
        vm.etch(PATCH, vm.parseBytes(string.concat("0x", vm.readFile(q))));
        loaded = true;
    }

    /// Both sides on one input, compared in full.
    function _agree(bytes memory cd) internal view returns (bool ok, bytes memory a, bytes memory b) {
        return _agreeOn(TASK, PATCH, cd);
    }

    function _agreeOn(address l, address r, bytes memory cd)
        internal view returns (bool ok, bytes memory a, bytes memory b)
    {
        (bool okA, bytes memory retA) = l.staticcall(cd);
        (bool okB, bytes memory retB) = r.staticcall(cd);
        ok = (okA == okB) && (keccak256(retA) == keccak256(retB));
        a = retA;
        b = retB;
    }

    /// MUTATION STRENGTH — how much of the domain the mutation actually moved.
    ///
    /// ⚠️ Why this exists. R4 asks that `M` make a MEMORISED answer wrong. Proof 2
    /// only asks hevm to refute `task == original`, which needs **one** divergent
    /// input out of 2**256. A bare `revert` bolted in front of an untouched body
    /// would satisfy it identically — and Task.sol rejects exactly that mutation
    /// in its own comments, on the grounds that a memorised body stays correct
    /// everywhere else. So the gate could not distinguish the mutation the project
    /// chose from the one it argued against, while §4 claimed it turned R4 "from
    /// an intention into a gate". That was an overclaim, found by adversarial
    /// review.
    ///
    /// This measures the fraction instead: over the committed scenario, on how
    /// many inputs does the mutated task actually disagree with the original?
    /// The harness enforces the threshold, because the required direction inverts
    /// with the kind of variant — a semantic task must move most of the domain, a
    /// control must move none of it.
    ///
    /// It prints rather than asserts, for the same reason the gas test prints:
    /// one number, parsed by whoever knows what it should be.
    function test_mutation_strength() public view {
        if (!hasOriginal) return;
        Plan.Spec memory p = _plan();
        uint256 diverged;
        for (uint256 i = 0; i < p.xs.length; i++) {
            (bool ok,,) = _agreeOn(TASK, ORIGINAL, _cdAt(p, i));
            if (!ok) diverged++;
        }
        console.log("WHETSTONE_DIVERGENCE", diverged, p.xs.length);
    }

    /// GATE 1 — known behaviour: the committed scenario, every input, full buffer.
    function test_gate1_scenario_behaviour() public view {
        if (!loaded) return;
        Plan.Spec memory p = _plan();
        for (uint256 i = 0; i < p.xs.length; i++) {
            (bool ok, bytes memory a, bytes memory b) = _agree(_cdAt(p, i));
            if (!ok) {
                console.log("GATE1 DIVERGENCE at input:", p.xs[i]);
                console.logBytes(a);
                console.logBytes(b);
                revert("gate 1: patch diverges from task on the committed scenario");
            }
        }
        console.log("WHETSTONE_GATE1 inputs", p.xs.length);
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
    function testFuzz_gate2_differential(uint256 x, uint256 y) public view {
        if (!loaded) return;
        Plan.Spec memory p = _plan();
        // ⚠️ The second argument is fuzzed too, or a two-argument target would
        // be explored along one axis while the report says "the whole domain".
        bytes memory cd = p.arity == 1
            ? abi.encodeWithSelector(p.sel, x)
            : abi.encodeWithSelector(p.sel, x, y);
        (bool ok, bytes memory a, bytes memory b) = _agree(cd);
        if (!ok) {
            console.log("GATE2 DIVERGENCE at input:", x, y);
            console.logBytes(a);
            console.logBytes(b);
            revert("gate 2: patch diverges from task under fuzzing");
        }
    }
}
