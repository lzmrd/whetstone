// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// ⚠️ PLACEHOLDER TASK. This is the unmutated function, standing in until the
/// mutation `M` is written (R2). It exists so the agent loop can be built and
/// tested before `M` exists -- it must NOT be used for a measured run, because
/// without a mutation a memorised answer is still a correct answer.
///
/// ⚠️ Deliberately self-contained: no imports, and no name that identifies the
/// upstream library. `harness/src/prompt.mjs` refuses to send anything that
/// carries one, and that guard is the anti-memorisation defence in operational
/// form (WHETSTONE §5).
contract Candidate {
    function f(uint256 x) external pure returns (uint256 r) {
        r = (x > 0xffffffffffffffffffffffffffffffff ? 1 : 0) << 7;
        r |= ((x >> r) > 0xffffffffffffffff ? 1 : 0) << 6;
        r |= ((x >> r) > 0xffffffff ? 1 : 0) << 5;
        r |= ((x >> r) > 0xffff ? 1 : 0) << 4;
        return (r >> 3) | ((x >> r) > 0xff ? 1 : 0);
    }
}
