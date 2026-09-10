// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.35;

contract VanityCandidate {
    function f(uint256 x) external pure returns (uint256) {
        return _score(address(uint160(x)));
    }

    function _score(address addr) internal pure returns (uint256) {
        bytes20 a = bytes20(addr);
        uint256 leadingZeroCount;
        uint256 leadingFourCount;
        uint256 totalFourCount;
        bool countingZeros = true;
        bool countingFours = false;

        unchecked {
            for (uint256 i = 0; i < 40; ++i) {
                uint8 b = uint8(a[i / 2]);
                uint8 nib = (i & 1) == 0 ? b >> 4 : b & 0x0F;

                if (nib == 4) {
                    ++totalFourCount;
                }

                if (countingZeros) {
                    if (nib == 0) {
                        ++leadingZeroCount;
                        continue;
                    } else {
                        countingZeros = false;
                        countingFours = true;
                    }
                }

                if (countingFours) {
                    if (nib == 4) {
                        ++leadingFourCount;
                        continue;
                    } else {
                        countingFours = false;
                    }
                }
            }

            if (leadingFourCount == 0) {
                return 0;
            }

            uint256 score = leadingZeroCount * 7;

            if (leadingFourCount == 4) {
                score += 50;
            } else if (leadingFourCount > 4) {
                score += 30;
            }

            score += totalFourCount * 2;

            if (a[18] == 0x44 && a[19] == 0x44) {
                score += 25;
            }

            return score;
        }
    }
}
