// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console} from "forge-std/Test.sol";
import {Scenario} from "./Scenario.sol";
import {GasMeter} from "./GasMeter.sol";

/// CONTROL: is the instrument order-sensitive?
///
/// If A-then-B and B-then-A give the same delta, the instrument is neutral and
/// the delta is a property of the code, not of the harness. Instrument #2
/// failed this by 5 038 gas on log256. It is kept in the suite because an
/// instrument verified once by hand is a memory, not a property.
contract OrderControlTest is Test {
    bytes4 constant SEL = bytes4(keccak256("f(uint256)"));

    function _delta(address first, address second) internal view returns (int256) {
        uint256[] memory xs = Scenario.inputs();
        bytes memory cd = GasMeter.buffer(SEL);
        uint256 tFirst;
        uint256 tSecond;
        for (uint256 i = 0; i < xs.length; i++) {
            GasMeter.setArg(cd, xs[i]);
            (, uint256 a) = GasMeter.measure(first, cd);
            (, uint256 b) = GasMeter.measure(second, cd);
            tFirst += a;
            tSecond += b;
        }
        return int256(tFirst) - int256(tSecond);
    }

    function _check(string memory name, string memory ozArt, string memory sdArt) internal {
        address oz = deployCode(ozArt);
        address sd = deployCode(sdArt);
        int256 ozFirst = _delta(oz, sd);      // base - cand
        int256 sdFirst = -_delta(sd, oz);     // same quantity, opposite order
        console.log("--", name);
        console.log("   saved, base called first:");
        console.logInt(ozFirst);
        console.log("   saved, candidate called first:");
        console.logInt(sdFirst);
        int256 bias = ozFirst - sdFirst;
        console.log("   ORDER BIAS:");
        console.logInt(bias);
        assertEq(bias, 0, "instrument is order-sensitive: the delta is partly an artefact of the harness");
    }

    function test_order_does_not_change_the_delta() public {
        _check("log2",   "OzLog2",   "SdLog2");
        _check("log256", "OzLog256", "SdLog256");
    }
}
