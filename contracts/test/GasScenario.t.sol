// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console} from "forge-std/Test.sol";
import {Scenario} from "./Scenario.sol";

interface IU { function f(uint256 x) external pure returns (uint256); }
interface IS { function f(uint256 x) external pure returns (string memory); }

/// Gas measured through an EXTERNAL call to the deployed wrapper — the same
/// artifact hevm proves equivalence on.
///
/// ⚠️ gasleft() around *inlined internal* calls is NOT stable: the log256
/// figure moved 27 -> 39 gas/call purely because unrelated imports were added
/// to the test file. Call overhead is constant here and cancels in the delta.
contract GasScenarioTest is Test {
    struct R { uint256 total; uint256 min; uint256 max; uint256 reverts; }

    function _measure(address a, bool dyn) internal view returns (R memory r) {
        uint256[] memory xs = Scenario.inputs();
        r.min = type(uint256).max;
        for (uint256 i = 0; i < xs.length; i++) {
            bytes memory cd = abi.encodeWithSelector(dyn ? IS.f.selector : IU.f.selector, xs[i]);
            uint256 g0 = gasleft();
            (bool ok,) = a.staticcall(cd);
            uint256 used = g0 - gasleft();
            if (!ok) { r.reverts++; continue; }
            r.total += used;
            if (used < r.min) r.min = used;
            if (used > r.max) r.max = used;
        }
    }

    function _report(string memory name, string memory ozArt, string memory sdArt, bool dyn) internal {
        R memory a = _measure(deployCode(ozArt), dyn);
        R memory b = _measure(deployCode(sdArt), dyn);
        uint256 n = Scenario.inputs().length - a.reverts;
        console.log("--", name);
        console.log("   oz total/min/max:", a.total, a.min, a.max);
        console.log("   sd total/min/max:", b.total, b.min, b.max);
        console.log("   per-call saved:", (a.total - b.total) / n);
        console.log("   oz spread (max-min):", a.max - a.min);
    }

    function test_scenario_boundary_v1() public {
        console.log("scenario:", Scenario.ID, "| inputs:", Scenario.inputs().length);
        _report("log2",    "OzLog2",     "SdLog2",     false);
        _report("log256",  "OzLog256",   "SdLog256",   false);
        _report("toHex",   "OzToHex",    "SdToHex",    true);
    }
}
