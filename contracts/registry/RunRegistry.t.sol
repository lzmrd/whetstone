// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, Vm} from "forge-std/Test.sol";
import {RunRegistry} from "./RunRegistry.sol";

contract RunRegistryTest is Test {
    RunRegistry reg;

    event RunRecorded(
        address indexed recorder,
        string runId,
        bytes32 receiptHash,
        string hcsTopicId,
        uint64 hcsSequence,
        string model,
        string taskId,
        string label,
        bool scored,
        string outcome,
        int256 savedPerCall,
        int256 savedTotal,
        uint256 maxRegression,
        int256 relativeProgressE4,
        uint64 usdListNano
    );

    function setUp() public {
        reg = new RunRegistry();
    }

    function _run() internal pure returns (RunRegistry.Run memory r) {
        r = RunRegistry.Run({
            runId: "mtsk686d-ce087545",
            receiptHash: bytes32(uint256(0xdead)),
            hcsTopicId: "0.0.10408009",
            hcsSequence: 143,
            model: "groq/openai/gpt-oss-120b",
            taskId: "log256-bytelen/v1",
            label: "FORMAL_NO_EXPLICIT_INPUT_BOUND",
            scored: true,
            outcome: "proved",
            savedPerCall: 201,
            savedTotal: 153984,
            maxRegression: 0,
            relativeProgressE4: 7072,
            usdListNano: 871000
        });
    }

    function test_records_and_counts() public {
        vm.expectEmit(true, false, false, true);
        emit RunRecorded(
            address(this), "mtsk686d-ce087545", bytes32(uint256(0xdead)), "0.0.10408009", 143,
            "groq/openai/gpt-oss-120b", "log256-bytelen/v1", "FORMAL_NO_EXPLICIT_INPUT_BOUND",
            true, "proved", 201, 153984, 0, 7072, 871000
        );
        reg.record(_run());
        assertEq(reg.total(), 1);
        assertEq(reg.countOf(address(this)), 1);
    }

    /// ⚠️ The case an unsigned type would have destroyed. The published batches
    /// contain runs at -61 gas/call and relative_progress -1.8413: a patch can be
    /// WORSE than what it replaced. With uint256 these would wrap to values near
    /// 2**256 and read as the best results ever recorded.
    function test_regressions_survive_the_round_trip() public {
        RunRegistry.Run memory r = _run();
        r.savedPerCall = -61;
        r.savedTotal = -46848;
        r.maxRegression = 215;
        r.relativeProgressE4 = -18413;

        vm.recordLogs();
        reg.record(r);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);

        (, , , , , , , , , int256 perCall, int256 total_, uint256 maxReg, int256 rel, ) = abi.decode(
            logs[0].data,
            (string, bytes32, string, uint64, string, string, string, bool, string,
             int256, int256, uint256, int256, uint64)
        );
        assertEq(perCall, -61);
        assertEq(total_, -46848);
        assertEq(maxReg, 215);
        assertEq(rel, -18413);
    }

    /// ⚠️ A paid attempt that produced no patch. It burns budget and must be
    /// visible to the allocator, which is what was missing: an always-failing
    /// model wrote no row, so it stayed "unexplored" and was re-chosen forever
    /// while its spend stayed invisible.
    function test_an_unscored_attempt_is_still_recorded() public {
        RunRegistry.Run memory r = _run();
        r.scored = false;
        r.label = "";
        r.outcome = "provider_error";
        r.savedPerCall = 0;
        r.savedTotal = 0;
        r.relativeProgressE4 = 0;

        vm.recordLogs();
        reg.record(r);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        (, , , , , , string memory label, bool scored, string memory outcome, , , , , uint64 usd) =
            abi.decode(
                logs[0].data,
                (string, bytes32, string, uint64, string, string, string, bool, string,
                 int256, int256, uint256, int256, uint64)
            );
        assertEq(scored, false);
        assertEq(label, "", "no patch means no guarantee to label");
        assertEq(outcome, "provider_error");
        assertGt(usd, 0, "the money was still spent");
        assertEq(reg.total(), 1);
    }

    /// ⚠️ Anyone may write. That is the design (a registry only its author can
    /// write to is a database with extra steps), and the consequence is that
    /// every consumer MUST filter on `recorder` -- otherwise a stranger steers
    /// our spending by writing attractive rows. This test exists so that the
    /// permissionless property is a decision on record, not an oversight.
    function test_anyone_may_write_and_recorders_stay_distinguishable() public {
        address stranger = address(0xBEEF);
        vm.prank(stranger);
        RunRegistry.Run memory lie = _run();
        lie.savedPerCall = 999999;
        reg.record(lie);

        reg.record(_run());

        assertEq(reg.total(), 2, "both writes are logged");
        assertEq(reg.countOf(stranger), 1);
        assertEq(reg.countOf(address(this)), 1);
    }
}
