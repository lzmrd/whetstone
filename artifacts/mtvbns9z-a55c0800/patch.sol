// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

contract VanityCandidate {
    function f(uint256 x) external pure returns (uint256) {
        uint160 v = uint160(x);

        uint256 leadingZeroCount;
        uint256 leadingFourCount;
        uint256 totalFour;

        // 0 = counting leading zeros
        // 1 = counting leading fours
        // 2 = done with leading fours
        uint8 state = 0;

        uint256 shift = 156; // (40 - 1) * 4, most‑significant nibble position

        unchecked {
            for (uint256 i = 0; i < 40; i++) {
                uint8 nib = uint8(v >> shift) & 0xF;

                // count all nibbles equal to 4 for the per‑nibble bonus
                if (nib == 4) {
                    totalFour++;
                }

                if (state == 0) {
                    if (nib == 0) {
                        leadingZeroCount++;
                    } else {
                        // first non‑zero nibble
                        if (nib == 4) {
                            leadingFourCount = 1;
                            state = 1;
                        } else {
                            // no leading fours
                            state = 2;
                        }
                    }
                } else if (state == 1) {
                    if (nib == 4) {
                        leadingFourCount++;
                    } else {
                        state = 2;
                    }
                }
                // state == 2: nothing to do

                shift -= 4;
            }
        }

        // if there is no leading 4 after the zeros, the whole score is zero
        if (leadingFourCount == 0) {
            return 0;
        }

        uint256 score = leadingZeroCount * 7;

        if (leadingFourCount == 4) {
            score += 50;
        } else if (leadingFourCount > 4) {
            score += 30;
        }

        score += totalFour * 2;

        if ((v & 0xFFFF) == 0x4444) {
            score += 25;
        }

        return score;
    }
}
