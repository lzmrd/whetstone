pragma solidity 0.8.35;

contract VanityCandidate {
    function f(uint256 x) external pure returns (uint256) {
        return _score(address(uint160(x)));
    }

    function _score(address addr) internal pure returns (uint256 calculatedScore) {
        uint160 a = uint160(addr);
        unchecked {
            uint256 leadingZeroCount = 0;
            uint256 leadingFourCount = 0;
            uint256 count4 = 0;
            bool started = false;
            bool countingFour = false;
            for (uint256 i = 0; i < 20; i++) {
                uint8 b = uint8((a >> (8 * (19 - i))) & 0xFF);
                uint8 high = b >> 4;
                uint8 low = b & 0x0F;

                // high nibble
                if (!started) {
                    if (high == 0) {
                        leadingZeroCount++;
                    } else {
                        started = true;
                        if (high == 4) {
                            countingFour = true;
                            leadingFourCount++;
                        } else {
                            countingFour = false;
                        }
                    }
                } else if (countingFour) {
                    if (high == 4) {
                        leadingFourCount++;
                    } else {
                        countingFour = false;
                    }
                }
                if (high == 4) count4++;

                // low nibble
                if (!started) {
                    if (low == 0) {
                        leadingZeroCount++;
                    } else {
                        started = true;
                        if (low == 4) {
                            countingFour = true;
                            leadingFourCount++;
                        } else {
                            countingFour = false;
                        }
                    }
                } else if (countingFour) {
                    if (low == 4) {
                        leadingFourCount++;
                    } else {
                        countingFour = false;
                    }
                }
                if (low == 4) count4++;
            }

            if (leadingFourCount == 0) {
                return 0;
            }

            calculatedScore = leadingZeroCount * 7;

            if (leadingFourCount == 4) {
                calculatedScore += 50;
            } else if (leadingFourCount > 4) {
                calculatedScore += 30;
            }

            calculatedScore += count4 * 2;

            if (uint16(a & 0xFFFF) == 0x4444) {
                calculatedScore += 25;
            }
        }
    }
}
