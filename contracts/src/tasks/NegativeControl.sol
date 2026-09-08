// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// NEGATIVE CONTROL. Never scored, never sent to a model.
///
/// The mutation Task.sol argues AGAINST: a bare guard bolted in front of the
/// untouched original. hevm refutes `task == original` on it exactly as it does
/// for the real mutation, because one divergent input out of 2**256 is all
/// refutation requires — so proof 2 alone cannot tell the two apart, while §4
/// claimed it turned R4 from an intention into a gate.
///
/// This file exists so proof 2b is demonstrated to FIRE rather than believed to.
/// Measured: this variant moves **1 of 769** scenario inputs (0.1%); the mutation
/// actually in use moves **769 of 769**. Run it with:
///
///   TASK_MANIFEST=contracts/src/tasks/manifest-negative.json npm run agent
///
/// and prepareTask must refuse it.
error ZeroHasNoBytes();
contract BareRevert {
    function f(uint256 x) external pure returns (uint256 r) {
        if (x == 0) revert ZeroHasNoBytes();
        r = (x > 0xffffffffffffffffffffffffffffffff ? 1 : 0) << 7;
        r |= ((x >> r) > 0xffffffffffffffff ? 1 : 0) << 6;
        r |= ((x >> r) > 0xffffffff ? 1 : 0) << 5;
        r |= ((x >> r) > 0xffff ? 1 : 0) << 4;
        return (r >> 3) | ((x >> r) > 0xff ? 1 : 0);
    }
}
