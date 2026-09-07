// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// What separates a COSMETIC change from a SEMANTIC one — decided by hevm, not
/// by looking at the diff.
///
/// R4 requires the mutation to be semantic. This file is the demonstration that
/// the requirement is machine-checkable: run each contract against OzLog256.
///
///   hevm(Cosmetic == OZ)  must PASS    -> it is NOT a valid mutation
///   hevm(Semantic == OZ)  must REFUTE  -> it IS a valid mutation
///
/// The point that is easy to miss: BYTECODE DIFFERENCE IS NOT THE CRITERION.
/// Measured on 0.8.35, optimizer 200:
///
///     OzLog256         249 bytes   sha256:5fec45a4...
///     CosmeticLog256   413 bytes   sha256:a756939f...   <- +65%, no byte shared
///     SemanticLog256   280 bytes   sha256:cf028eec...
///
/// The cosmetic contract is 65% LARGER than the original and shares no bytecode
/// with it, and hevm proves them identical anyway. The question hevm answers is
/// not "do these differ?" but "does an input EXIST on which they differ?".
///
/// This is also why cosmetic mutation is useless as an anti-memorisation
/// defence: a model learned what the function DOES, not how it is spelled.

/// ── COSMETIC ────────────────────────────────────────────────────────────────
/// Every line differs from OpenZeppelin's. Nothing about the behaviour does.
/// `* 128` is `<< 7`; `/ 8` is `>> 3`; `x ? 1 : 0` is SafeCast.toUint(x).
contract CosmeticLog256 {
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

/// ── SEMANTIC ────────────────────────────────────────────────────────────────
/// The diff is three lines and the algorithm is untouched. The behaviour on one
/// input changed, which is all R4 asks for: a memorised copy of solady now
/// returns 0 where this must fail, and is rejected at the gate.
error ZeroHasNoBytes();

contract SemanticLog256 {
    function f(uint256 x) external pure returns (uint256) {
        if (x == 0) revert ZeroHasNoBytes();
        return Math.log256(x);
    }
}
