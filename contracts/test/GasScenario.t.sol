// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console} from "forge-std/Test.sol";
import {Scenario} from "./Scenario.sol";
import {GasMeter} from "./GasMeter.sol";

/// Gas measured through an EXTERNAL call to the deployed wrapper — the same
/// artifact hevm proves equivalence on — with the order-neutral instrument in
/// GasMeter.sol. See OrderControl.t.sol for the control that keeps it honest.
///
/// Measurement is PAIRED: baseline and candidate are called on the same input
/// inside one loop. Two separate passes give totals but cannot answer the
/// question that decides a leaderboard row — is the saving uniform, or does the
/// candidate win on average while regressing somewhere?
contract GasScenarioTest is Test {
    bytes4 constant SEL = bytes4(keccak256("f(uint256)"));

    struct Paired {
        uint256 totalA;
        uint256 totalB;
        uint256 minA;
        uint256 maxA;
        uint256 regressedInputs;   // inputs where the candidate costs MORE
        uint256 maxRegression;     // worst single-input regression, in gas
        uint256 maxImprovement;    // best single-input saving, in gas
        uint256 scored;            // inputs where both succeeded
        uint256 skipped;           // inputs where either reverted
    }

    function _pair(address a, address b) internal view returns (Paired memory p) {
        uint256[] memory xs = Scenario.inputs();
        bytes memory cd = GasMeter.buffer(SEL);
        p.minA = type(uint256).max;

        for (uint256 i = 0; i < xs.length; i++) {
            GasMeter.setArg(cd, xs[i]);
            (bool okA, uint256 usedA) = GasMeter.measure(a, cd);
            (bool okB, uint256 usedB) = GasMeter.measure(b, cd);

            if (!okA || !okB) { p.skipped++; continue; }

            p.scored++;
            p.totalA += usedA;
            p.totalB += usedB;
            if (usedA < p.minA) p.minA = usedA;
            if (usedA > p.maxA) p.maxA = usedA;

            if (usedB > usedA) {
                p.regressedInputs++;
                uint256 d = usedB - usedA;
                if (d > p.maxRegression) p.maxRegression = d;
            } else {
                uint256 d = usedA - usedB;
                if (d > p.maxImprovement) p.maxImprovement = d;
            }
        }
    }

    /// Every reported row carries BOTH columns: total over the fixed scenario
    /// decides the ranking, max-regression is mandatory alongside it, and no
    /// row exists with only one of the two.
    function _report(string memory name, string memory ozArt, string memory sdArt) internal {
        Paired memory p = _pair(deployCode(ozArt), deployCode(sdArt));
        console.log("--", name);
        console.log("   scored / skipped:  ", p.scored, p.skipped);
        console.log("   total  base / cand:", p.totalA, p.totalB);
        console.log("   per-call saved:    ", (p.totalA - p.totalB) / p.scored);
        console.log("   base spread max-min:", p.maxA - p.minA);
        console.log("   MAX REGRESSION:    ", p.maxRegression, "on inputs:", p.regressedInputs);
        console.log("   max improvement:   ", p.maxImprovement);
    }

    function test_scenario_boundary_v1() public {
        console.log("scenario:", Scenario.NAME, "| inputs:", Scenario.inputs().length);
        console.logBytes32(Scenario.digest());
        _report("log2",   "OzLog2",   "SdLog2");
        _report("log256", "OzLog256", "SdLog256");
        _report("toHex",  "OzToHex",  "SdToHex");
    }
}
