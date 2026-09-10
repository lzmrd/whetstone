// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.35;

contract VanityCandidate {
    function f(uint256 x) external pure returns (uint256) {
        return _score(address(uint160(x)));
    }

    function _score(address addr) internal pure returns (uint256 calculatedScore) {
        uint160 a = uint160(addr);
        unchecked {
            // Count leading zero nibbles
            uint256 leadingZeroCount = 0;
            for (uint256 i = 0; i < 20; i++) {
                uint8 b = uint8(a >> (8 * (19 - i)));
                uint8 high = b >> 4;
                if (high == 0) {
                    leadingZeroCount++;
                } else {
                    break;
                }
                if ((b & 0x0F) == 0) {
                    leadingZeroCount++;
                } else {
                    break;
                }
            }
            calculatedScore += leadingZeroCount * 7;

            // Count leading 4 nibbles after leading zeros
            uint256 leadingFourCount = 0;
            for (uint256 i = leadingZeroCount; i < 40; i++) {
                uint8 nibble = uint8((a >> (4 * (39 - i))) & 0xF);
                if (nibble == 4) {
                    leadingFourCount++;
                } else {
                    break;
                }
            }
            if (leadingFourCount == 0) {
                return 0;
            } else if (leadingFourCount == 4) {
                calculatedScore += 50;
            } else if (leadingFourCount > 4) {
                calculatedScore += 30;
            }

            // Count all nibbles equal to 4
            for (uint256 i = 0; i < 20; i++) {
                uint8 b = uint8(a >> (8 * (19 - i)));
                if ((b >> 4) == 4) {
                    calculatedScore += 2;
                }
                if ((b & 0x0F) == 4) {
                    calculatedScore += 2;
                }
            }

            // Check last two bytes equal 0x4444
            if ((a & 0xFFFF) == 0x4444) {
                calculatedScore += 25;
            }
        }
    }
}
