// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// CONTROL TASK — cosmetically rewritten, behaviourally IDENTICAL to the original.
///
/// This exists to falsify our own interpretation. On the semantically mutated
/// task, gpt-oss-120b went from 5/5 clean patches to a spread crossing zero. Two
/// explanations fit that equally well:
///
///   (a) the mutation removed the memorised answer  <- what we claimed
///   (b) the mutated function is simply harder      <- equally consistent
///
/// This variant separates them. The source shares no line with the original --
/// different names, a helper that does not exist upstream, `* 128` for `<< 7`,
/// `/ 8` for `>> 3` -- but computes exactly the same thing, so A MEMORISED ANSWER
/// IS STILL CORRECT here.
///
///   model does well  -> memory still works when semantics are unchanged, so the
///                       drop on the mutated task is explained by (a)
///   model does badly -> something other than memorisation is driving it, and
///                       our claim was wrong
///
/// ⚠️ This is NOT a benchmark task and must never appear in a leaderboard column
/// with one. A cosmetic variant is useless as an anti-contamination defence --
/// that is precisely the property being exploited to use it as a control.
contract ControlCandidate {
    function _exceeds(uint256 n, uint256 threshold) private pure returns (uint256) {
        return n > threshold ? 1 : 0;
    }

    function f(uint256 numberToMeasure) external pure returns (uint256) {
        uint256 accumulator;
        accumulator  = _exceeds(numberToMeasure, 0xffffffffffffffffffffffffffffffff) * 128;
        accumulator |= _exceeds(numberToMeasure >> accumulator, 0xffffffffffffffff) * 64;
        accumulator |= _exceeds(numberToMeasure >> accumulator, 0xffffffff) * 32;
        accumulator |= _exceeds(numberToMeasure >> accumulator, 0xffff) * 16;
        return (accumulator / 8) | _exceeds(numberToMeasure >> accumulator, 0xff);
    }
}
