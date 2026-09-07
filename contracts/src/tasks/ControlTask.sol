// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// CONTROL TASK — cosmetically rewritten, behaviourally identical, and now
/// COST-NEUTRAL.
///
/// ⚠️ THE FIRST VERSION OF THIS FILE WAS CONFOUNDED, and the result built on it
/// was published before the flaw was found. It rewrote `<< 7` as `* 128` and
/// `>> 3` as `/ 8` and added a helper — cosmetic in *behaviour*, but `mul` and
/// `div` cost 5 gas where `shl` and `shr` cost 3. The control task therefore
/// started 59% more expensive than the semantic task (977 806 against 616 320)
/// with a headroom 2.8x larger, so "99.9% of baseline on the control against
/// 13.9% on the semantic mutation" compared a large easy win with a small hard
/// one. Not apples to apples.
///
/// This version changes names and shape only, keeping every operation identical,
/// so the control and the semantic task start from comparable cost and the
/// comparison measures what it claims to.
///
/// ⚠️ Still NOT a benchmark task: a memorised answer stays correct here, which is
/// the property being exploited. It must never share a leaderboard column with a
/// semantic task.
contract ControlCandidate {
    function f(uint256 value) external pure returns (uint256) {
        uint256 acc;
        uint256 hiHalf = value > 0xffffffffffffffffffffffffffffffff ? 1 : 0;
        acc = hiHalf << 7;

        uint256 q1 = (value >> acc) > 0xffffffffffffffff ? 1 : 0;
        acc |= q1 << 6;

        uint256 q2 = (value >> acc) > 0xffffffff ? 1 : 0;
        acc |= q2 << 5;

        uint256 q3 = (value >> acc) > 0xffff ? 1 : 0;
        acc |= q3 << 4;

        uint256 lastByte = (value >> acc) > 0xff ? 1 : 0;
        return (acc >> 3) | lastByte;
    }
}
