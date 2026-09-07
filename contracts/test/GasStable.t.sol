// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console} from "forge-std/Test.sol";

interface IU { function f(uint256 x) external pure returns (uint256); }
interface IS { function f(uint256 x) external pure returns (string memory); }

/// Gas measured through an EXTERNAL call to an isolated wrapper — the same
/// wrapper hevm proves equivalence on. gasleft() deltas around inlined internal
/// calls proved unstable: adding unrelated code to the test file shifted the
/// log256 figure from 27 to 39 gas/call. Call overhead is constant and cancels
/// in the A-vs-B delta.
contract GasStable is Test {
    string constant SCENARIO_ID = "boundary/v1";

    function _fx() internal pure returns (uint256[10] memory f) {
        f = [uint256(1), 2, 3, 255, 256, 65535, 2**64, 2**128 - 1, 2**255, type(uint256).max];
    }

    function _measureU(address a) internal view returns (uint256 total) {
        uint256[10] memory f = _fx();
        for (uint256 i = 0; i < f.length; i++) {
            bytes memory cd = abi.encodeWithSelector(IU.f.selector, f[i]);
            uint256 g0 = gasleft();
            (bool ok,) = a.staticcall(cd);
            total += g0 - gasleft();
            require(ok, "call failed");
        }
    }

    function _measureS(address a) internal view returns (uint256 total) {
        uint256[10] memory f = _fx();
        for (uint256 i = 0; i < f.length; i++) {
            bytes memory cd = abi.encodeWithSelector(IS.f.selector, f[i]);
            uint256 g0 = gasleft();
            (bool ok,) = a.staticcall(cd);
            total += g0 - gasleft();
            require(ok, "call failed");
        }
    }

    function _reportU(string memory name, string memory ozArt, string memory sdArt) internal {
        address oz = deployCode(ozArt);
        address sd = deployCode(sdArt);
        uint256 a = _measureU(oz);
        uint256 b = _measureU(sd);
        console.log(name, a, b);
        console.log("   per call saved:", (a - b) / 10);
    }

    function test_stable_gas() public {
        _reportU("log2   oz/sd:",   "OzLog2",   "SdLog2");
        _reportU("log256 oz/sd:",   "OzLog256", "SdLog256");

        address ozs = deployCode("OzToString");
        address sds = deployCode("SdToString");
        uint256 a = _measureS(ozs);
        uint256 b = _measureS(sds);
        console.log("toString oz/sd:", a, b);
        console.log("   per call saved:", (a - b) / 10);

        address ozh = deployCode("OzToHex");
        address sdh = deployCode("SdToHex");
        a = _measureS(ozh);
        b = _measureS(sdh);
        console.log("toHex oz/sd:", a, b);
        console.log("   per call saved:", (a - b) / 10);
    }
}
