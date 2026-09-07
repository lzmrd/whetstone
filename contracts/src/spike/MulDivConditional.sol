// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPointMathLib as S} from "solady/utils/FixedPointMathLib.sol";

/// Conditional equivalence for mulDiv, on the domain where neither reverts.
///
/// Day 1 established that OZ and solady are NOT equivalent on mulDiv: hevm
/// returns a counterexample where OZ raises Panic(0x12) and solady raises
/// FullMulDivFailed(). That is a sound result but it is half an answer — it
/// says the revert reasons differ and says nothing about the arithmetic.
///
/// ⚠️ HOW NOT TO DO THIS. The obvious fix is a wrapper that normalises
/// `(success, returndata)`. Normalising the SUCCESS FLAG as well as the payload
/// would be unsound: if one implementation reverted where the other returned a
/// value, the normalisation would hide a real divergence instead of isolating
/// the revert reason. This wrapper therefore keeps the flag and drops only the
/// payload.
///
/// ⚠️ AND NOT WITH try/catch. Catching a revert needs an external call, which
/// puts an address hevm has no code for into the symbolic state. The guard is
/// evaluated inline instead, so the wrapper is a single self-contained runtime
/// object of exactly the kind hevm handles well.
///
/// The guard is byte-identical on both sides, so both wrappers succeed on
/// exactly the same inputs by construction. What hevm then decides is the
/// question actually worth asking:
///
///     assuming  d != 0  and  the 512-bit product x*y fits in d
///     do Math.mulDiv and FixedPointMathLib.fullMulDiv return the same value?
///
/// Those two assumptions are the ones that must be serialised into the receipt
/// beside the guarantee label. A conditional proof whose condition is not
/// published is not a result.

/// Full 512-bit product, as the high and low 256-bit words.
function mul512(uint256 x, uint256 y) pure returns (uint256 hi, uint256 lo) {
    assembly {
        let mm := mulmod(x, y, not(0))
        lo := mul(x, y)
        hi := sub(sub(mm, lo), lt(mm, lo))
    }
}

/// True when both implementations are defined: non-zero divisor, quotient fits
/// in 256 bits.
function inDomain(uint256 x, uint256 y, uint256 d) pure returns (bool) {
    if (d == 0) return false;
    (uint256 hi,) = mul512(x, y);
    return hi < d;
}

contract OzMulDivCond {
    function f(uint256 x, uint256 y, uint256 d) external pure returns (bool ok, uint256 v) {
        if (!inDomain(x, y, d)) return (false, 0);
        return (true, Math.mulDiv(x, y, d));
    }
}

contract SdMulDivCond {
    function f(uint256 x, uint256 y, uint256 d) external pure returns (bool ok, uint256 v) {
        if (!inDomain(x, y, d)) return (false, 0);
        return (true, S.fullMulDiv(x, y, d));
    }
}
