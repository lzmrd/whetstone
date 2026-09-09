// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

// Systematic sweep of OZ <-> solady pairs with matching semantics.
//
// The first candidate set was seven functions chosen by hand. This one
// enumerates the arithmetic surface both libraries actually share, so that
// "there is no second target" becomes a measured claim rather than a sample.
//
// Each pair must be SEMANTICALLY IDENTICAL for the comparison to mean
// anything. Where the two libraries disagree by design (revert payloads,
// zero handling) hevm will refute, and that is itself a result.

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SignedMath} from "@openzeppelin/contracts/utils/math/SignedMath.sol";
import {FixedPointMathLib as S} from "solady/utils/FixedPointMathLib.sol";
import {LibBit} from "solady/utils/LibBit.sol";

// ── f(uint256) ────────────────────────────────────────────────────────────
contract OzClz     { function f(uint256 x) external pure returns (uint256) { return Math.clz(x); } }
contract SdClz     { function f(uint256 x) external pure returns (uint256) { return LibBit.clz(x); } }

// ── f(uint256,uint256) ────────────────────────────────────────────────────
contract OzAvg     { function f(uint256 a, uint256 b) external pure returns (uint256) { return Math.average(a, b); } }
contract SdAvg     { function f(uint256 a, uint256 b) external pure returns (uint256) { return S.avg(a, b); } }

contract OzCeilDiv { function f(uint256 a, uint256 b) external pure returns (uint256) { return Math.ceilDiv(a, b); } }
contract SdCeilDiv { function f(uint256 a, uint256 b) external pure returns (uint256) { return S.divUp(a, b); } }

contract OzSatAdd  { function f(uint256 a, uint256 b) external pure returns (uint256) { return Math.saturatingAdd(a, b); } }
contract SdSatAdd  { function f(uint256 a, uint256 b) external pure returns (uint256) { return S.saturatingAdd(a, b); } }

contract OzSatSub  { function f(uint256 a, uint256 b) external pure returns (uint256) { return Math.saturatingSub(a, b); } }
contract SdSatSub  { function f(uint256 a, uint256 b) external pure returns (uint256) { return S.saturatingSub(a, b); } }

contract OzSatMul  { function f(uint256 a, uint256 b) external pure returns (uint256) { return Math.saturatingMul(a, b); } }
contract SdSatMul  { function f(uint256 a, uint256 b) external pure returns (uint256) { return S.saturatingMul(a, b); } }

contract OzMax     { function f(uint256 a, uint256 b) external pure returns (uint256) { return Math.max(a, b); } }
contract SdMax     { function f(uint256 a, uint256 b) external pure returns (uint256) { return S.max(a, b); } }

contract OzMin     { function f(uint256 a, uint256 b) external pure returns (uint256) { return Math.min(a, b); } }
contract SdMin     { function f(uint256 a, uint256 b) external pure returns (uint256) { return S.min(a, b); } }

contract OzInvMod  { function f(uint256 a, uint256 n) external pure returns (uint256) { return Math.invMod(a, n); } }
contract SdInvMod  { function f(uint256 a, uint256 n) external pure returns (uint256) { return S.invMod(a, n); } }

// ── f(int256) / f(int256,int256) ──────────────────────────────────────────
contract OzAbs     { function f(int256 x) external pure returns (uint256) { return SignedMath.abs(x); } }
contract SdAbs     { function f(int256 x) external pure returns (uint256) { return S.abs(x); } }

contract OzSAvg    { function f(int256 a, int256 b) external pure returns (int256) { return SignedMath.average(a, b); } }
contract SdSAvg    { function f(int256 a, int256 b) external pure returns (int256) { return S.avg(a, b); } }

// ── Mutated pairs: does the headroom SURVIVE the mutation? ────────────────
//
// ⚠️ Measured before choosing, not after. A mutation that flattens the expert
// implementation's advantage leaves a target with a denominator but nothing to
// contend for -- and on functions this small that is a live risk, since the
// whole 59-gas gap comes from a branchless ternary versus four bytes of
// assembly.
contract OzMaxHalved { function f(uint256 a, uint256 b) external pure returns (uint256) { return Math.max(a, b) >> 1; } }
contract SdMaxHalved { function f(uint256 a, uint256 b) external pure returns (uint256) { return S.max(a, b) >> 1; } }

contract OzMaxCompl  { function f(uint256 a, uint256 b) external pure returns (uint256) { return Math.max(~a, ~b); } }
contract SdMaxCompl  { function f(uint256 a, uint256 b) external pure returns (uint256) { return S.max(~a, ~b); } }

contract OzMinHalved { function f(uint256 a, uint256 b) external pure returns (uint256) { return Math.min(a, b) >> 1; } }
contract SdMinHalved { function f(uint256 a, uint256 b) external pure returns (uint256) { return S.min(a, b) >> 1; } }

contract OzMinCompl  { function f(uint256 a, uint256 b) external pure returns (uint256) { return Math.min(~a, ~b); } }
contract SdMinCompl  { function f(uint256 a, uint256 b) external pure returns (uint256) { return S.min(~a, ~b); } }
