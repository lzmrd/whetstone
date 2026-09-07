// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPointMathLib as S} from "solady/utils/FixedPointMathLib.sol";

// Tractability probes: is there a target where symbolic equivalence is
// feasible AND a gas gap exists? mulDiv maximises headroom and minimises
// tractability; these are the alternatives.

contract OzSqrt    { function f(uint256 x) external pure returns (uint256) { return Math.sqrt(x); } }
contract SdSqrt    { function f(uint256 x) external pure returns (uint256) { return S.sqrt(x); } }

contract OzLog2    { function f(uint256 x) external pure returns (uint256) { return Math.log2(x); } }
contract SdLog2    { function f(uint256 x) external pure returns (uint256) { return S.log2(x); } }

contract OzLog10   { function f(uint256 x) external pure returns (uint256) { return Math.log10(x); } }
contract SdLog10   { function f(uint256 x) external pure returns (uint256) { return S.log10(x); } }

contract OzLog256  { function f(uint256 x) external pure returns (uint256) { return Math.log256(x); } }
contract SdLog256  { function f(uint256 x) external pure returns (uint256) { return S.log256(x); } }

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {LibString} from "solady/utils/LibString.sol";

// High-headroom candidates: toString is a famously large OZ-vs-solady gap.
// Returns string memory, so hevm must compare return-data buffers.
contract OzToString { function f(uint256 x) external pure returns (string memory) { return Strings.toString(x); } }
contract SdToString { function f(uint256 x) external pure returns (string memory) { return LibString.toString(x); } }

contract OzToHex    { function f(uint256 x) external pure returns (string memory) { return Strings.toHexString(x); } }
contract SdToHex    { function f(uint256 x) external pure returns (string memory) { return LibString.toHexString(x); } }
