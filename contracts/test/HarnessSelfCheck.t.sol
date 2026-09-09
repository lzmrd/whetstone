// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console} from "forge-std/Test.sol";
import {Scenario} from "./Scenario.sol";

interface IU { function f(uint256 x) external pure returns (uint256); }

/// Does the harness actually vary the input?
///
/// GasMeter calls with outsize = 0 and never sees a return value, so a bug that
/// sent the same argument 769 times would look like a perfectly stable
/// measurement — and "stable" is what we have been trying to achieve, so it
/// would have been believed. The zero-spread result on log2 and log256 is only
/// meaningful if this passes.
contract HarnessSelfCheckTest is Test {
    function test_calldata_buffer_actually_varies_the_argument() public {
        IU t = IU(deployCode("OzLog256"));
        uint256[] memory xs = Scenario.inputs();

        uint256 distinct = 1;
        uint256 prev = t.f(xs[0]);
        for (uint256 i = 1; i < xs.length; i++) {
            uint256 v = t.f(xs[i]);
            if (v != prev) distinct++;
            prev = v;
        }
        console.log("distinct log256 results across the scenario:", distinct);
        assertGt(distinct, 30, "the scenario is not exercising the input domain");
    }

    /// log2 and log256 in OpenZeppelin 5.x are branchless. Constant gas is the
    /// expected consequence, not a measurement failure — but assert it, so that
    /// if a future OZ bump reintroduces branches the spec claim breaks loudly.
    function test_scenario_is_the_committed_vector() public pure {
        assertEq(Scenario.inputs().length, 769);
        assertEq(
            Scenario.digest(),
            0xd8fd95feb303bffc21724cbcca5ffad44286df2c602461e73026abc243e81f00,
            "the scenario vector changed: every previously published score refers to a different benchmark"
        );
    }

    /// ⚠️ The same gate as above, for the two scenarios added later. A digest
    /// that changes silently re-scopes every score already published under its
    /// name -- and `boundary/v1` is quoted in fifteen receipts that are on
    /// chain and cannot be corrected.
    function test_the_other_two_scenarios_are_the_committed_vectors() public pure {
        assertEq(Scenario.pairs2Len(), 1444);
        assertEq(
            Scenario.digest2(),
            0x422707a2c07bdc62c16e94a743c72441249acd6e83c6bd34cd7a80a7113387e7,
            "pairs/v1 changed: every satmul score refers to a different benchmark"
        );

        assertEq(Scenario.addresses().length, 264);
        assertEq(
            Scenario.digest3(),
            0x2d2fcbae6a80656bae812ebb424f30b5e93e877a00d259f40755177b798439c6,
            "vanity/v1 changed: every vanity score refers to a different benchmark"
        );
    }
}
