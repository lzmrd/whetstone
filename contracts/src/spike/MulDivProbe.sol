// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

/// Day-1 spike target. Identical external signatures so the dispatchers match;
/// the only difference is which library computes the result.

contract OzMulDiv {
    function f(uint256 x, uint256 y, uint256 d) external pure returns (uint256) {
        return Math.mulDiv(x, y, d);
    }
}

contract SoladyMulDiv {
    function f(uint256 x, uint256 y, uint256 d) external pure returns (uint256) {
        return FixedPointMathLib.fullMulDiv(x, y, d);
    }
}
