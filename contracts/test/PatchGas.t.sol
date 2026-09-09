// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console} from "forge-std/Test.sol";
import {Scenario} from "./Scenario.sol";
import {GasMeter} from "./GasMeter.sol";
import {Plan} from "./Plan.sol";

/// Measure a model's patch against the task it was given.
///
/// Both sides arrive as RUNTIME BYTECODE files and are placed with `vm.etch`,
/// which is what the harness already holds: the patch never enters the forge
/// project, so an untrusted file cannot shadow a repository contract, and the
/// bytecode measured here is byte-identical to the one hevm proved on.
///
/// Paths come from the environment because the harness drives this per run:
///   TASK_HEX=... PATCH_HEX=... forge test --match-contract PatchGasTest
contract PatchGasTest is Test {
    /// ⚠️ The target's signature is DATA, supplied by the manifest through the
    /// environment. It was a constant, and that constant was the reason this
    /// project could score exactly one function: every other candidate that
    /// survived the prover takes two arguments. Defaults to the original value
    /// so a run that does not set it measures exactly what it always measured.
    using Plan for Plan.Spec;
    address constant TASK = address(uint160(uint256(keccak256("whetstone.task"))));
    address constant PATCH = address(uint160(uint256(keccak256("whetstone.patch"))));

    function _load(string memory envKey, address at) internal {
        string memory hexStr = vm.readFile(vm.envString(envKey));
        bytes memory code = vm.parseBytes(string.concat("0x", hexStr));
        require(code.length > 0, "empty runtime bytecode");
        vm.etch(at, code);
    }

    function test_measure_patch() public {
        // Driven by the harness, so a bare `forge test` has nothing to measure.
        // Skip instead of failing: a red suite that is red for an uninteresting
        // reason trains you to ignore a red suite.
        if (bytes(vm.envOr("TASK_HEX", string(""))).length == 0) {
            console.log("PatchGas: TASK_HEX/PATCH_HEX unset - skipped (driven by the harness)");
            return;
        }
        _load("TASK_HEX", TASK);
        _load("PATCH_HEX", PATCH);

        Plan.Spec memory plan = Plan.forSig(vm.envOr("TASK_SIG", string("f(uint256)")), vm.envOr("TASK_SCENARIO", string("")));
        uint256 n = plan.xs.length;
        bytes memory cd = plan.newBuffer();

        uint256 totalTask;
        uint256 totalPatch;
        uint256 scored;
        uint256 skipped;
        uint256 maxRegression;
        uint256 regressed;
        uint256 maxImprovement;

        for (uint256 i = 0; i < n; i++) {
            plan.setPoint(cd, i);
            (bool okT, uint256 usedT) = GasMeter.measure(TASK, cd);
            (bool okP, uint256 usedP) = GasMeter.measure(PATCH, cd);

            // ⚠️ Divergent success/failure is a correctness fault, not a gas
            // result. The equivalence gate should already have caught it; if it
            // reaches here the run must not be scored.
            require(okT == okP, "task and patch disagree on success/failure");
            if (!okT) { skipped++; continue; }

            scored++;
            totalTask += usedT;
            totalPatch += usedP;
            if (usedP > usedT) {
                regressed++;
                uint256 d = usedP - usedT;
                if (d > maxRegression) maxRegression = d;
            } else {
                uint256 d = usedT - usedP;
                if (d > maxImprovement) maxImprovement = d;
            }
        }

        // Machine-readable line. The harness parses this; humans read the rest.
        // The scenario's identity travels with its numbers, or a score is
        // quoted without saying what it was scored on.
        console.log("WHETSTONE_GAS scenario_digest");
        console.logBytes32(plan.digest);
        console.log("WHETSTONE_GAS scenario_name", plan.name);
        console.log("WHETSTONE_GAS scenario_inputs", n);
        console.log("WHETSTONE_GAS scored", scored);
        console.log("WHETSTONE_GAS skipped", skipped);
        console.log("WHETSTONE_GAS total_task", totalTask);
        console.log("WHETSTONE_GAS total_patch", totalPatch);
        console.log("WHETSTONE_GAS max_regression", maxRegression);
        console.log("WHETSTONE_GAS regressed_inputs", regressed);
        console.log("WHETSTONE_GAS max_improvement", maxImprovement);
    }
}
