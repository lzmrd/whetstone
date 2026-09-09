// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

// The family the FUZZED admission rule unlocks: loop-driven, buffer-building
// functions where hevm does not terminate and the headroom is two orders of
// magnitude above log256.
//
// ⚠️ Wrappers take `uint256` and shape it, so one committed scenario measures
// all of them. That is a wrapper assumption and it goes in the receipt: these
// measure a 32-byte input, not the whole domain of the underlying function.

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64 as OzBase64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Base58 as OzBase58} from "@openzeppelin/contracts/utils/Base58.sol";
import {LibString} from "solady/utils/LibString.sol";
import {Base64 as SdBase64} from "solady/utils/Base64.sol";
import {Base58 as SdBase58} from "solady/utils/Base58.sol";

contract OzStr      { function f(uint256 x) external pure returns (string memory) { return Strings.toString(x); } }
contract SdStr      { function f(uint256 x) external pure returns (string memory) { return LibString.toString(x); } }

contract OzHexAddr  { function f(uint256 x) external pure returns (string memory) { return Strings.toHexString(address(uint160(x))); } }
contract SdHexAddr  { function f(uint256 x) external pure returns (string memory) { return LibString.toHexString(address(uint160(x))); } }

contract OzChecksum { function f(uint256 x) external pure returns (string memory) { return Strings.toChecksumHexString(address(uint160(x))); } }
contract SdChecksum { function f(uint256 x) external pure returns (string memory) { return LibString.toHexStringChecksummed(address(uint160(x))); } }

contract OzB64      { function f(uint256 x) external pure returns (string memory) { return OzBase64.encode(abi.encodePacked(x)); } }
contract SdB64      { function f(uint256 x) external pure returns (string memory) { return SdBase64.encode(abi.encodePacked(x)); } }

contract OzB58      { function f(uint256 x) external pure returns (string memory) { return OzBase58.encode(abi.encodePacked(x)); } }
contract SdB58      { function f(uint256 x) external pure returns (string memory) { return SdBase58.encode(abi.encodePacked(x)); } }

contract OzHex { function f(uint256 x) external pure returns (string memory) { return Strings.toHexString(x); } }
contract SdHex { function f(uint256 x) external pure returns (string memory) { return LibString.toHexString(x); } }
