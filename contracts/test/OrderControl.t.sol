// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console} from "forge-std/Test.sol";
import {Scenario} from "./Scenario.sol";
import {GasMeter} from "./GasMeter.sol";
import {Plan} from "./Plan.sol";

/// CONTROL: is the instrument order-sensitive?
///
/// If A-then-B and B-then-A give the same delta, the instrument is neutral and
/// the delta is a property of the code, not of the harness. Instrument #2
/// failed this by 5 038 gas on log256. It is kept in the suite because an
/// instrument verified once by hand is a memory, not a property.
contract OrderControlTest is Test {
    using Plan for Plan.Spec;

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
        // casting to 'int256' is safe because both totals are gas sums over 769
        // calls -- bounded by the block gas limit, nowhere near 2**255.
        // forge-lint: disable-next-line(unsafe-typecast)
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

    /// The same control for the TWO-ARGUMENT path.
    ///
    /// ⚠️ Not a formality. The two-word buffer is a second instrument as far as
    /// this control is concerned: it allocates a different size, writes a
    /// second word per iteration, and could reintroduce exactly the memory
    /// growth that biased instrument #2 by 10% of the delta it reported. D-14
    /// says controls are part of the harness, not part of the debugging, so the
    /// new path arrives with its control rather than acquiring one after a
    /// number turns out to be wrong.
    function _delta2(address first, address second) internal view returns (int256) {
        Plan.Spec memory plan = Plan.forSig("f(uint256,uint256)");
        bytes memory cd = plan.newBuffer();
        uint256 tFirst;
        uint256 tSecond;
        for (uint256 i = 0; i < plan.xs.length; i++) {
            plan.setPoint(cd, i);
            (, uint256 a) = GasMeter.measure(first, cd);
            (, uint256 b) = GasMeter.measure(second, cd);
            tFirst += a;
            tSecond += b;
        }
        // forge-lint: disable-next-line(unsafe-typecast)
        return int256(tFirst) - int256(tSecond);
    }

    function _check2(string memory name, string memory ozArt, string memory sdArt) internal {
        address oz = deployCode(ozArt);
        address sd = deployCode(sdArt);
        int256 ozFirst = _delta2(oz, sd);
        int256 sdFirst = -_delta2(sd, oz);
        console.log("--", name);
        console.log("   saved, base called first:");
        console.logInt(ozFirst);
        console.log("   saved, candidate called first:");
        console.logInt(sdFirst);
        int256 bias = ozFirst - sdFirst;
        console.log("   ORDER BIAS:");
        console.logInt(bias);
        assertEq(bias, 0, "two-argument instrument is order-sensitive");
    }

    function test_order_does_not_change_the_delta() public {
        _check("log2",   "OzLog2",   "SdLog2");
        _check("log256", "OzLog256", "SdLog256");
    }

    function test_order_does_not_change_the_delta_two_args() public {
        _check2("saturatingMul", "OzSatMul", "SdSatMul");
        _check2("max",           "OzMax",    "SdMax");
    }
}
