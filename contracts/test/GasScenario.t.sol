// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPointMathLib as S} from "solady/utils/FixedPointMathLib.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {LibString} from "solady/utils/LibString.sol";

/// Gas is not a single number for a pure function: it depends on the input.
/// A score quoted without its fixture set is undefined, and invites cherry-picking.
/// SCENARIO_ID is versioned and goes into the receipt.
contract GasScenario is Test {
    string constant SCENARIO_ID = "logs/v1";

    function _fixtures() internal pure returns (uint256[10] memory f) {
        f = [
            uint256(1), 2, 3, 255, 256,
            65535, 2 ** 64, 2 ** 128 - 1, 2 ** 255, type(uint256).max
        ];
    }

    function test_toString_gas_across_scenario() public view {
        uint256[10] memory f = _fixtures();
        uint256 ozTotal; uint256 sdTotal;
        for (uint256 i = 0; i < f.length; i++) {
            uint256 g0 = gasleft(); Strings.toString(f[i]); uint256 oz = g0 - gasleft();
            g0 = gasleft(); LibString.toString(f[i]); uint256 sd = g0 - gasleft();
            ozTotal += oz; sdTotal += sd;
        }
        console.log("toString TOTAL:", ozTotal, sdTotal);
        console.log("  PER CALL saved:", (ozTotal - sdTotal) / f.length);
    }

    function test_toHex_gas_across_scenario() public view {
        uint256[10] memory f = _fixtures();
        uint256 ozTotal; uint256 sdTotal;
        for (uint256 i = 0; i < f.length; i++) {
            uint256 g0 = gasleft(); Strings.toHexString(f[i]); uint256 oz = g0 - gasleft();
            g0 = gasleft(); LibString.toHexString(f[i]); uint256 sd = g0 - gasleft();
            ozTotal += oz; sdTotal += sd;
        }
        console.log("toHex TOTAL:", ozTotal, sdTotal);
        console.log("  PER CALL saved:", (ozTotal - sdTotal) / f.length);
    }

    function test_log256_gas_across_scenario() public view {
        uint256[10] memory f = _fixtures();
        uint256 ozTotal;
        uint256 sdTotal;
        for (uint256 i = 0; i < f.length; i++) {
            uint256 g0 = gasleft();
            Math.log256(f[i]);
            uint256 oz = g0 - gasleft();
            g0 = gasleft();
            S.log256(f[i]);
            uint256 sd = g0 - gasleft();
            ozTotal += oz; sdTotal += sd;
        }
        console.log("log256 TOTAL over", f.length, "fixtures:");
        console.log("  oz", ozTotal, "solady", sdTotal);
        console.log("  PER CALL saved:", (ozTotal - sdTotal) / f.length);
    }

    function test_log2_gas_across_scenario() public view {
        uint256[10] memory f = _fixtures();
        uint256 ozTotal;
        uint256 sdTotal;
        console.log("scenario:", SCENARIO_ID);
        console.log("input_index | oz_gas | solady_gas | delta");
        for (uint256 i = 0; i < f.length; i++) {
            uint256 g0 = gasleft();
            Math.log2(f[i]);
            uint256 oz = g0 - gasleft();

            g0 = gasleft();
            S.log2(f[i]);
            uint256 sd = g0 - gasleft();

            ozTotal += oz;
            sdTotal += sd;
            console.log(i, oz, sd);
        }
        console.log("log2 TOTAL over", f.length, "fixtures:");
        console.log("  oz", ozTotal, "solady", sdTotal);
        console.log("  PER CALL saved:", (ozTotal - sdTotal) / f.length);
    }
}
