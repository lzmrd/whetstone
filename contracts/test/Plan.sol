// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Scenario} from "./Scenario.sol";

/// What a measurement run needs to know about the target it is measuring.
///
/// ⚠️ This exists because the arity of the target used to be a CONSTANT in
/// three test files. `bytes4 constant SEL = bytes4(keccak256("f(uint256)"))`
/// appeared in PatchGas, GasScenario and Differential, so a second target with
/// a different signature could not be measured, gated or diffed -- and the
/// project read that as "there is no second target available". The signature is
/// now data, supplied by the manifest and travelling with the run.
///
/// The selector is DERIVED from the signature string rather than passed
/// alongside it: two fields that must agree are one chance to disagree, and the
/// signature is already in the receipt.
library Plan {
    struct Spec {
        bytes4 sel;
        uint256 arity;
        string name;        // scenario label
        bytes32 digest;     // scenario identity -- the vector, not the label
        uint256[] xs;
        uint256[] ys;       // empty for arity 1
    }

    function forSig(string memory sig) internal pure returns (Spec memory s) {
        s.sel = bytes4(keccak256(bytes(sig)));
        s.arity = _arity(sig);

        if (s.arity == 1) {
            s.name = Scenario.NAME;
            s.digest = Scenario.digest();
            s.xs = Scenario.inputs();
        } else if (s.arity == 2) {
            s.name = Scenario.NAME_2;
            s.digest = Scenario.digest2();
            (s.xs, s.ys) = Scenario.pairs();
        } else {
            revert("Plan: only 1- and 2-argument targets have a committed scenario");
        }
    }

    /// Number of top-level arguments in a signature like `f(uint256,uint256)`.
    ///
    /// ⚠️ Deliberately refuses anything it cannot count with certainty. Nested
    /// parentheses mean a tuple argument, where commas no longer separate
    /// top-level arguments, and a silently wrong arity would build calldata of
    /// the wrong length -- every call would revert and the run would be scored
    /// as "the whole scenario was skipped" rather than as an error.
    function _arity(string memory sig) private pure returns (uint256 n) {
        bytes memory b = bytes(sig);
        uint256 open;
        bool seen;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == "(") { open++; require(!seen, "Plan: nested or repeated parens"); seen = true; }
            else if (b[i] == ")") { require(open == 1, "Plan: unbalanced parens"); open--; }
            else if (b[i] == "," ) { require(open == 1, "Plan: comma outside the argument list"); n++; }
        }
        require(seen && open == 0, "Plan: signature is not f(...)");
        // `f()` has no arguments; anything else has one more argument than commas.
        uint256 lastOpen;
        for (uint256 i = 0; i < b.length; i++) if (b[i] == "(") lastOpen = i;
        return (b.length >= lastOpen + 2 && b[lastOpen + 1] == ")") ? 0 : n + 1;
    }

    /// Write the i-th scenario point into a pre-allocated calldata buffer.
    function setPoint(Spec memory s, bytes memory cd, uint256 i) internal pure {
        uint256 x = s.xs[i];
        assembly { mstore(add(cd, 0x24), x) }
        if (s.arity == 2) {
            uint256 y = s.ys[i];
            assembly { mstore(add(cd, 0x44), y) }
        }
    }

    function newBuffer(Spec memory s) internal pure returns (bytes memory cd) {
        cd = new bytes(4 + 32 * s.arity);
        bytes4 sel = s.sel;
        assembly { mstore(add(cd, 0x20), sel) }
    }
}
