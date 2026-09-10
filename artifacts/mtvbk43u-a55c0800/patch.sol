// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

contract VanityCandidate {
    function f(uint256 x) external pure returns (uint256) {
        return _score(address(uint160(x)));
    }

    function _score(address addr) internal pure returns (uint256) {
        uint256 value = uint256(uint160(addr)); // 20‑byte address as uint256
        uint256 i = 0;
        uint256 leadingZeroCount = 0;

        // count leading zero nibbles
        for (; i < 40; ++i) {
            uint8 nibble = uint8(value >> ((39 - i) * 4)) & 0xF;
            if (nibble == 0) {
                leadingZeroCount++;
            } else {
                break;
            }
        }

        // count leading nibbles equal to 4 after the zeros
        uint256 leadingFourCount = 0;
        for (; i < 40; ++i) {
            uint8 nibble = uint8(value >> ((39 - i) * 4)) & 0xF;
            if (nibble == 4) {
                leadingFourCount++;
            } else {
                break;
            }
        }

        // if no leading 4‑nibbles, the whole score is zero
        if (leadingFourCount == 0) {
            return 0;
        }

        uint256 score = leadingZeroCount * 7;

        if (leadingFourCount == 4) {
            score += 50;
        } else if (leadingFourCount > 4) {
            score += 30;
        }

        // add 2 for every nibble equal to 4 (including the leading ones already counted)
        score += leadingFourCount * 2;

        for (; i < 40; ++i) {
            uint8 nibble = uint8(value >> ((39 - i) * 4)) & 0xF;
            if (nibble == 4) {
                score += 2;
            }
        }

        // last two bytes are 0x44 0x44  → lowest 16 bits are 0x4444
        if ((value & 0xFFFF) == 0x4444) {
            score += 25;
        }

        return score;
    }
}
